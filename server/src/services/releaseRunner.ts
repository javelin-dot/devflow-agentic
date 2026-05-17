import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, newId } from '../db/index.js';
import { gitService } from './git.js';
import { getGitProvider } from './gitProvider.js';
import type { ReleaseRun, ReleaseEvent, ConflictFile, ConflictBlock, ReleaseState, ProjectReleaseStatus } from '@devflow/shared';

type SSECallback = (event: ReleaseEvent) => void;

function parseConflictBlocks(content: string): ConflictBlock[] {
  const blocks: ConflictBlock[] = [];
  const lines = content.split('\n');
  let i = 0;
  let blockIndex = 0;
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<< ')) {
      const startLine = i + 1;
      const oursLines: string[] = [];
      const theirsLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('=======')) {
        oursLines.push(lines[i]);
        i++;
      }
      i++; // skip =======
      while (i < lines.length && !lines[i].startsWith('>>>>>>> ')) {
        theirsLines.push(lines[i]);
        i++;
      }
      i++; // skip >>>>>>> branch-name
      blocks.push({ index: blockIndex++, startLine, oursLines, theirsLines });
    } else {
      i++;
    }
  }
  return blocks;
}

async function resolveConflictFiles(repoPath: string, rawConflicts: unknown[]): Promise<ConflictFile[]> {
  return Promise.all(
    rawConflicts.map(async (c): Promise<ConflictFile> => {
      const path = typeof c === 'string' ? c : (c as unknown as { file?: string }).file ?? String(c);
      try {
        const content = readFileSync(join(repoPath, path), 'utf8');
        const blocks = parseConflictBlocks(content);
        return { path, blocks };
      } catch {
        return { path, blocks: [] };
      }
    })
  );
}

class ReleaseRunner extends EventEmitter {
  private subscribers = new Map<string, SSECallback[]>();
  private pollTimers = new Map<string, ReturnType<typeof setInterval>>();

  subscribe(runId: string, cb: SSECallback): () => void {
    const list = this.subscribers.get(runId) ?? [];
    list.push(cb);
    this.subscribers.set(runId, list);
    return () => {
      const updated = (this.subscribers.get(runId) ?? []).filter(f => f !== cb);
      this.subscribers.set(runId, updated);
    };
  }

  private publish(runId: string, event: ReleaseEvent): void {
    for (const cb of this.subscribers.get(runId) ?? []) cb(event);
    this.emit('event', event);
  }

  private setState(runId: string, state: ReleaseRun['state'], extra: Partial<ReleaseRun> = {}): void {
    const now = new Date().toISOString();
    const logLine = `[${now}] → ${state}\n`;
    db.prepare('UPDATE release_runs SET state=?, log=log||? WHERE id=?').run(state, logLine, runId);
    if (['done', 'error', 'cancelled'].includes(state)) {
      db.prepare('UPDATE release_runs SET completed_at=? WHERE id=?').run(now, runId);
    }
    if (extra.jenkinsBuildUrl !== undefined) {
      db.prepare('UPDATE release_runs SET jenkins_build_url=? WHERE id=?').run(extra.jenkinsBuildUrl, runId);
    }
    if (extra.verdict !== undefined) {
      db.prepare('UPDATE release_runs SET verdict=? WHERE id=?').run(extra.verdict, runId);
    }
    if (extra.error !== undefined) {
      db.prepare('UPDATE release_runs SET error=? WHERE id=?').run(extra.error, runId);
    }
    if (extra.prUrl !== undefined) {
      db.prepare('UPDATE release_runs SET pr_url=? WHERE id=?').run(extra.prUrl, runId);
    }
    if (extra.prStatus !== undefined) {
      db.prepare('UPDATE release_runs SET pr_status=? WHERE id=?').run(extra.prStatus, runId);
    }
    if (extra.releaseBranch !== undefined) {
      db.prepare('UPDATE release_runs SET release_branch=? WHERE id=?').run(extra.releaseBranch, runId);
    }
    if (extra.productionVerifyResult !== undefined) {
      db.prepare('UPDATE release_runs SET production_verify_result=? WHERE id=?').run(extra.productionVerifyResult, runId);
    }
    this.publish(runId, { type: 'state_change', runId, state, message: logLine });
  }

  private appendLog(runId: string, message: string): void {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    db.prepare('UPDATE release_runs SET log=log||? WHERE id=?').run(line, runId);
    this.publish(runId, { type: 'log', runId, message: line });
  }

  async startRun(runId: string): Promise<void> {
    const row = db.prepare('SELECT * FROM release_runs WHERE id=?').get(runId) as Record<string, unknown> | undefined;
    if (!row) return;

    const mode = row.mode as string;
    const reqId = row.req_id as string | null;

    try {
      this.setState(runId, 'preparing');
      this.appendLog(runId, `Starting ${mode} release run`);

      let projects: ProjectReleaseStatus[] = row.projects ? JSON.parse(row.projects as string) as ProjectReleaseStatus[] : [];
      if (projects.length === 0 && reqId) {
        const reqProjs = db.prepare('SELECT * FROM requirement_projects WHERE req_id=?').all(reqId) as Array<Record<string, unknown>>;
        projects = reqProjs.map(p => ({ project: p.project as string, state: 'idle' as ReleaseState }));
        db.prepare('UPDATE release_runs SET projects=? WHERE id=?').run(JSON.stringify(projects), runId);
      }

      if (mode === 'release') {
        await this.runReleaseMode(runId, reqId, projects);
      } else {
        await this.runLegacyMode(runId, reqId, projects, mode);
      }
    } catch (err) {
      const message = (err as Error).message;
      this.setState(runId, 'error', { error: message });
      this.publish(runId, { type: 'error', runId, message });
    }
  }

  private async runReleaseMode(runId: string, reqId: string | null, projects: ProjectReleaseStatus[]): Promise<void> {
    const releaseBranch = reqId ? `release/${reqId}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}` : `release/run-${runId.slice(-6)}`;
    this.setState(runId, 'merging');

    for (const proj of projects) {
      this.appendLog(runId, `Creating release branch for ${proj.project}...`);
      const projectRow = db.prepare('SELECT * FROM projects WHERE name=?').get(proj.project) as Record<string, unknown> | undefined;
      if (!projectRow) {
        this.appendLog(runId, `Project ${proj.project} not found, skipping`);
        continue;
      }

      const repoPath = projectRow.path as string;
      const defaultBranch = (projectRow.branch as string) ?? 'master';
      const reqProj = reqId
        ? db.prepare('SELECT * FROM requirement_projects WHERE req_id=? AND project=?').get(reqId, proj.project) as Record<string, unknown> | undefined
        : undefined;
      const devBranch = (reqProj?.dev_branch as string | null) ?? `feature/${reqId}`;

      try {
        const g = gitService.git(repoPath);
        await g.fetch();
        await g.checkout(defaultBranch);
        await g.pull('origin', defaultBranch);
        await g.checkoutLocalBranch(releaseBranch);

        const mergeResult = await g.merge([devBranch]);
        if (mergeResult.conflicts.length > 0) {
          this.appendLog(runId, `Conflicts detected in ${proj.project}: ${mergeResult.conflicts.map(c => typeof c === 'string' ? c : (c as unknown as { file?: string }).file ?? String(c)).join(', ')}`);
          proj.state = 'paused-conflict';
          proj.conflictFiles = await resolveConflictFiles(repoPath, mergeResult.conflicts);

          db.prepare('UPDATE release_runs SET projects=?, release_branch=? WHERE id=?').run(JSON.stringify(projects), releaseBranch, runId);
          this.setState(runId, 'paused-conflict', { error: `Merge conflicts in ${proj.project}`, releaseBranch });
          this.publish(runId, { type: 'conflict', runId, state: 'paused-conflict', conflictFiles: proj.conflictFiles, project: proj.project });
          return;
        }

        this.appendLog(runId, `Merged ${devBranch} → ${releaseBranch} for ${proj.project}`);
        proj.state = 'merging';
      } catch (err) {
        const msg = (err as Error).message;
        this.appendLog(runId, `Merge failed for ${proj.project}: ${msg}`);
        throw new Error(`Merge failed in ${proj.project}: ${msg}`);
      }
    }

    this.setState(runId, 'pushing');
    for (const proj of projects) {
      this.appendLog(runId, `Pushing ${proj.project}...`);
      const projectRow = db.prepare('SELECT * FROM projects WHERE name=?').get(proj.project) as Record<string, unknown> | undefined;
      if (!projectRow) continue;

      try {
        const g = gitService.git(projectRow.path as string);
        await g.push('origin', releaseBranch);
        this.appendLog(runId, `Push complete for ${proj.project}`);
        proj.state = 'pushing';
      } catch (err) {
        this.appendLog(runId, `Push failed for ${proj.project}: ${(err as Error).message}`);
      }
    }

    db.prepare('UPDATE release_runs SET projects=?, release_branch=? WHERE id=?').run(JSON.stringify(projects), releaseBranch, runId);

    // Create PR
    this.setState(runId, 'waiting_pr_review');
    this.appendLog(runId, 'Creating pull request...');

    try {
      const provider = getGitProvider();
      // Use the first project for PR creation; in multi-project setup this may need refinement
      const firstProj = projects[0];
      const projectRow = db.prepare('SELECT * FROM projects WHERE name=?').get(firstProj?.project) as Record<string, unknown> | undefined;
      if (!projectRow) throw new Error('No project found for PR creation');

      // Derive owner/repo from remote URL or settings
      const repoPath = projectRow.path as string;
      const g = gitService.git(repoPath);
      const remotes = await g.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      if (!origin) throw new Error('No origin remote found');

      const match = origin.refs.fetch.match(/github\.com[:\/]([^/]+)\/([^/]+?)(?:\.git)?$/);
      if (!match) throw new Error('Origin remote is not a GitHub URL');
      const [, owner, repo] = match;
      const defaultBranch = (projectRow.branch as string) ?? 'master';

      const pr = await provider.createPR({
        owner,
        repo,
        title: `Release: ${reqId ?? runId}`,
        body: `Automated release run ${runId}`,
        head: releaseBranch,
        base: defaultBranch,
      });

      this.appendLog(runId, `PR created: ${pr.url}`);
      this.setState(runId, 'waiting_pr_review', { prUrl: pr.url, prStatus: 'open' });

      // Start PR polling
      this.startPRPolling(runId, owner, repo, pr.number);
    } catch (err) {
      const msg = (err as Error).message;
      this.appendLog(runId, `PR creation failed: ${msg}`);
      this.setState(runId, 'error', { error: msg });
    }
  }

  private startPRPolling(runId: string, owner: string, repo: string, prNumber: number): void {
    const timer = setInterval(async () => {
      try {
        const provider = getGitProvider();
        const status = await provider.getPRStatus(owner, repo, prNumber);
        db.prepare('UPDATE release_runs SET pr_status=? WHERE id=?').run(status, runId);

        if (status === 'approved') {
          clearInterval(timer);
          this.pollTimers.delete(runId);
          this.appendLog(runId, 'PR approved, triggering Jenkins...');
          await this.triggerJenkins(runId);
        } else if (status === 'changes_requested') {
          clearInterval(timer);
          this.pollTimers.delete(runId);
          this.appendLog(runId, 'PR changes requested, pausing');
          this.setState(runId, 'paused-conflict', { error: 'PR changes requested' });
        } else if (status === 'closed_rejected') {
          clearInterval(timer);
          this.pollTimers.delete(runId);
          this.appendLog(runId, 'PR closed without merge');
          this.setState(runId, 'cancelled');
        } else if (status === 'closed_merged') {
          // PR was merged manually, skip to production_verifying
          clearInterval(timer);
          this.pollTimers.delete(runId);
          this.appendLog(runId, 'PR merged manually, proceeding to production verification');
          await this.productionVerify(runId);
        }
      } catch (err) {
        this.appendLog(runId, `PR poll error: ${(err as Error).message}`);
      }
    }, 30_000);

    this.pollTimers.set(runId, timer);
  }

  private async triggerJenkins(runId: string): Promise<void> {
    this.setState(runId, 'triggering');

    const row = db.prepare('SELECT * FROM release_runs WHERE id=?').get(runId) as Record<string, unknown> | undefined;
    const reqId = row?.req_id as string | null;

    const jenkinsTemplate = reqId
      ? (db.prepare(
          'SELECT jt.* FROM jenkins_templates jt JOIN requirement_projects rp ON rp.project = jt.name WHERE rp.req_id=? LIMIT 1'
        ).get(reqId) as Record<string, unknown> | undefined)
      : null;

    if (jenkinsTemplate) {
      const jenkinsUrl = jenkinsTemplate.jenkins_url as string;
      const job = jenkinsTemplate.job as string;
      const buildUrl = `${jenkinsUrl}/job/${job}/lastBuild`;
      const triggerUrl = `${jenkinsUrl}/job/${job}/build`;

      try {
        this.appendLog(runId, `Triggering Jenkins build: ${triggerUrl}`);
        await fetch(triggerUrl, { method: 'POST' });
        this.appendLog(runId, 'Jenkins build triggered successfully');
      } catch (err) {
        const msg = (err as Error).message;
        this.appendLog(runId, `Jenkins trigger failed: ${msg}`);
      }

      this.setState(runId, 'production_verifying', { jenkinsBuildUrl: buildUrl });
      await this.productionVerify(runId);
    } else {
      this.appendLog(runId, 'No Jenkins template configured, skipping CI trigger');
      this.setState(runId, 'production_verifying');
      await this.productionVerify(runId);
    }
  }

  private async productionVerify(runId: string): Promise<void> {
    const verifyModeRow = db.prepare("SELECT value FROM settings WHERE key='release.verifyMode'").get() as { value: string } | undefined;
    const verifyMode = verifyModeRow?.value ?? 'manual';

    if (verifyMode === 'auto') {
      this.appendLog(runId, 'Running auto production verification...');
      const urlsRow = db.prepare("SELECT value FROM settings WHERE key='release.healthCheckUrls'").get() as { value: string } | undefined;
      const urls: string[] = urlsRow ? JSON.parse(urlsRow.value) as string[] : [];

      if (urls.length === 0) {
        this.appendLog(runId, 'No healthCheckUrls configured, skipping auto verify');
        this.setState(runId, 'production_verifying', { productionVerifyResult: 'skipped_no_urls' });
        return;
      }

      const results: { url: string; ok: boolean }[] = [];
      for (const url of urls) {
        try {
          const resp = await fetch(url, { signal: AbortSignal.timeout(60_000) });
          results.push({ url, ok: resp.status === 200 });
        } catch {
          results.push({ url, ok: false });
        }
      }

      const allOk = results.every(r => r.ok);
      this.setState(runId, 'production_verifying', { productionVerifyResult: JSON.stringify(results) });

      if (allOk) {
        this.appendLog(runId, 'All health checks passed');
        await this.mergeBack(runId);
      } else {
        this.appendLog(runId, `Health checks failed: ${results.filter(r => !r.ok).map(r => r.url).join(', ')}`);
        this.setState(runId, 'error', { error: 'Production verification failed' });
      }
    } else {
      this.appendLog(runId, 'Production verification waiting for manual approval');
      this.setState(runId, 'production_verifying');
      // manual mode: UI will call POST /release/:id/verify with verdict
    }
  }

  private async mergeBack(runId: string): Promise<void> {
    this.setState(runId, 'merged_back');
    this.appendLog(runId, 'Merging release branch back to master...');

    const row = db.prepare('SELECT * FROM release_runs WHERE id=?').get(runId) as Record<string, unknown> | undefined;
    if (!row) return;

    const releaseBranch = row.release_branch as string | null;
    if (!releaseBranch) {
      this.setState(runId, 'error', { error: 'No release branch to merge back' });
      return;
    }

    const projects: ProjectReleaseStatus[] = row.projects ? JSON.parse(row.projects as string) as ProjectReleaseStatus[] : [];

    for (const proj of projects) {
      const projectRow = db.prepare('SELECT * FROM projects WHERE name=?').get(proj.project) as Record<string, unknown> | undefined;
      if (!projectRow) continue;

      const repoPath = projectRow.path as string;
      const defaultBranch = (projectRow.branch as string) ?? 'master';

      try {
        const g = gitService.git(repoPath);
        await g.fetch();
        await g.checkout(defaultBranch);
        await g.pull('origin', defaultBranch);

        const mergeResult = await g.merge([releaseBranch]);
        if (mergeResult.conflicts.length > 0) {
          proj.state = 'paused-conflict';
          proj.conflictFiles = await resolveConflictFiles(repoPath, mergeResult.conflicts);

          db.prepare('UPDATE release_runs SET projects=? WHERE id=?').run(JSON.stringify(projects), runId);
          this.setState(runId, 'paused-conflict', { error: `Merge-back conflicts in ${proj.project}` });
          this.publish(runId, { type: 'conflict', runId, state: 'paused-conflict', conflictFiles: proj.conflictFiles, project: proj.project });
          return;
        }

        await g.push('origin', defaultBranch);
        this.appendLog(runId, `Merged ${releaseBranch} → ${defaultBranch} for ${proj.project}`);
      } catch (err) {
        const msg = (err as Error).message;
        this.appendLog(runId, `Merge-back failed for ${proj.project}: ${msg}`);
        this.setState(runId, 'error', { error: `Merge-back failed: ${msg}` });
        return;
      }
    }

    this.setState(runId, 'done', { verdict: 'accepted' });
    this.publish(runId, { type: 'done', runId, state: 'done' });
  }

  private async runLegacyMode(runId: string, reqId: string | null, projects: ProjectReleaseStatus[], mode: string): Promise<void> {
    if (mode !== 'quickPublish') {
      this.setState(runId, 'merging');

      for (const proj of projects) {
        this.appendLog(runId, `Merging ${proj.project}...`);

        const projectRow = db.prepare('SELECT * FROM projects WHERE name=?').get(proj.project) as Record<string, unknown> | undefined;
        if (!projectRow) {
          this.appendLog(runId, `Project ${proj.project} not found, skipping`);
          continue;
        }

        const repoPath = projectRow.path as string;
        const reqProj = reqId
          ? db.prepare('SELECT * FROM requirement_projects WHERE req_id=? AND project=?').get(reqId, proj.project) as Record<string, unknown> | undefined
          : undefined;

        const devBranch = (reqProj?.dev_branch as string | null) ?? `feature/${reqId}`;
        const uatBranch = (reqProj?.uat_branch as string | null) ?? 'uat';
        const defaultBranch = (projectRow.branch as string) ?? 'master';

        const sourceBranch = mode === 'mergePublish' ? devBranch : uatBranch;
        const targetBranch = mode === 'mergePublish' ? uatBranch : defaultBranch;

        try {
          const g = gitService.git(repoPath);
          await g.fetch();
          await g.checkout(targetBranch);

          const mergeResult = await g.merge([sourceBranch]);
          if (mergeResult.conflicts.length > 0) {
            this.appendLog(runId, `Conflicts detected in ${proj.project}: ${mergeResult.conflicts.map(c => typeof c === 'string' ? c : (c as unknown as { file?: string }).file ?? String(c)).join(', ')}`);
            proj.state = 'paused-conflict';
            proj.conflictFiles = await resolveConflictFiles(repoPath, mergeResult.conflicts);

            db.prepare('UPDATE release_runs SET projects=? WHERE id=?').run(JSON.stringify(projects), runId);

            this.setState(runId, 'paused-conflict', { error: `Merge conflicts in ${proj.project}` });
            this.publish(runId, { type: 'conflict', runId, state: 'paused-conflict', conflictFiles: proj.conflictFiles, project: proj.project });
            return;
          }

          this.appendLog(runId, `Merged ${sourceBranch} → ${targetBranch} for ${proj.project}`);
          proj.state = 'merging';
        } catch (err) {
          const msg = (err as Error).message;
          this.appendLog(runId, `Merge failed for ${proj.project}: ${msg}`);
          throw new Error(`Merge failed in ${proj.project}: ${msg}`);
        }
      }

      this.setState(runId, 'pushing');
      for (const proj of projects) {
        this.appendLog(runId, `Pushing ${proj.project}...`);
        const projectRow = db.prepare('SELECT * FROM projects WHERE name=?').get(proj.project) as Record<string, unknown> | undefined;
        if (!projectRow) continue;

        try {
          const g = gitService.git(projectRow.path as string);
          await g.push();
          this.appendLog(runId, `Push complete for ${proj.project}`);
          proj.state = 'pushing';
        } catch (err) {
          this.appendLog(runId, `Push failed for ${proj.project}: ${(err as Error).message}`);
        }
      }

      db.prepare('UPDATE release_runs SET projects=? WHERE id=?').run(JSON.stringify(projects), runId);
    }

    this.setState(runId, 'triggering');
    this.appendLog(runId, 'Triggering CI build...');

    const jenkinsTemplate = reqId
      ? (db.prepare(
          'SELECT jt.* FROM jenkins_templates jt JOIN requirement_projects rp ON rp.project = jt.name WHERE rp.req_id=? LIMIT 1'
        ).get(reqId) as Record<string, unknown> | undefined)
      : null;

    if (jenkinsTemplate) {
      const jenkinsUrl = jenkinsTemplate.jenkins_url as string;
      const job = jenkinsTemplate.job as string;
      const buildUrl = `${jenkinsUrl}/job/${job}/lastBuild`;
      const triggerUrl = `${jenkinsUrl}/job/${job}/build`;

      try {
        this.appendLog(runId, `Triggering Jenkins build: ${triggerUrl}`);
        await fetch(triggerUrl, { method: 'POST' });
        this.appendLog(runId, 'Jenkins build triggered successfully');
        this.setState(runId, 'done', { jenkinsBuildUrl: buildUrl, verdict: 'accepted' });
      } catch (err) {
        const msg = (err as Error).message;
        this.appendLog(runId, `Jenkins trigger failed: ${msg}`);
        this.setState(runId, 'done', { jenkinsBuildUrl: buildUrl, verdict: 'accepted' });
      }
    } else {
      this.appendLog(runId, 'No Jenkins template configured, skipping CI trigger');
      this.setState(runId, 'done', { verdict: 'accepted' });
    }

    this.publish(runId, { type: 'done', runId, state: 'done' });
  }

  async resume(runId: string): Promise<void> {
    const row = db.prepare('SELECT * FROM release_runs WHERE id=?').get(runId) as Record<string, unknown> | undefined;
    if (!row || row.state !== 'paused-conflict') return;

    this.appendLog(runId, 'Conflict resolved, resuming...');

    const mode = row.mode as string;
    const projects: ProjectReleaseStatus[] = row.projects ? JSON.parse(row.projects as string) as ProjectReleaseStatus[] : [];

    for (const proj of projects) {
      if (proj.state === 'paused-conflict') {
        const projectRow = db.prepare('SELECT * FROM projects WHERE name=?').get(proj.project) as Record<string, unknown> | undefined;
        if (!projectRow) continue;

        try {
          const g = gitService.git(projectRow.path as string);
          await g.add('.');
          await g.commit(`Resolve conflicts for release run ${runId}`);
          await g.push();
          this.appendLog(runId, `Resolved and pushed ${proj.project}`);
          proj.state = 'pushing';
          proj.conflictFiles = [];
        } catch (err) {
          this.appendLog(runId, `Failed to push ${proj.project}: ${(err as Error).message}`);
        }
      }
    }

    db.prepare('UPDATE release_runs SET projects=? WHERE id=?').run(JSON.stringify(projects), runId);

    if (mode === 'release') {
      // After resolving conflicts in release mode, continue to waiting_pr_review
      const releaseBranch = row.release_branch as string | null;
      if (releaseBranch) {
        this.setState(runId, 'waiting_pr_review');
        this.appendLog(runId, 'Resuming release mode, creating PR...');
        // Re-trigger PR creation by running release mode from pushing state
        // For simplicity, just create PR here
        try {
          const provider = getGitProvider();
          const firstProj = projects[0];
          const projectRow = db.prepare('SELECT * FROM projects WHERE name=?').get(firstProj?.project) as Record<string, unknown> | undefined;
          if (projectRow) {
            const repoPath = projectRow.path as string;
            const g = gitService.git(repoPath);
            const remotes = await g.getRemotes(true);
            const origin = remotes.find(r => r.name === 'origin');
            if (origin) {
              const match = origin.refs.fetch.match(/github\.com[:\/]([^/]+)\/([^/]+?)(?:\.git)?$/);
              if (match) {
                const [, owner, repo] = match;
                const defaultBranch = (projectRow.branch as string) ?? 'master';
                const reqId = row.req_id as string | null;
                const pr = await provider.createPR({
                  owner,
                  repo,
                  title: `Release: ${reqId ?? runId}`,
                  body: `Automated release run ${runId}`,
                  head: releaseBranch,
                  base: defaultBranch,
                });
                this.appendLog(runId, `PR created: ${pr.url}`);
                this.setState(runId, 'waiting_pr_review', { prUrl: pr.url, prStatus: 'open' });
                this.startPRPolling(runId, owner, repo, pr.number);
              }
            }
          }
        } catch (err) {
          this.appendLog(runId, `PR creation failed: ${(err as Error).message}`);
          this.setState(runId, 'error', { error: (err as Error).message });
        }
      }
    } else {
      this.setState(runId, 'pushing');
      const reqId = row.req_id as string | null;
      const jenkinsTemplate = reqId
        ? (db.prepare(
            'SELECT jt.* FROM jenkins_templates jt JOIN requirement_projects rp ON rp.project = jt.name WHERE rp.req_id=? LIMIT 1'
          ).get(reqId) as Record<string, unknown> | undefined)
        : null;

      if (jenkinsTemplate) {
        const jenkinsUrl = jenkinsTemplate.jenkins_url as string;
        const job = jenkinsTemplate.job as string;
        const buildUrl = `${jenkinsUrl}/job/${job}/lastBuild`;
        const triggerUrl = `${jenkinsUrl}/job/${job}/build`;

        try {
          this.appendLog(runId, `Triggering Jenkins build: ${triggerUrl}`);
          await fetch(triggerUrl, { method: 'POST' });
          this.appendLog(runId, 'Jenkins build triggered successfully');
          this.setState(runId, 'done', { jenkinsBuildUrl: buildUrl, verdict: 'accepted' });
        } catch (err) {
          const msg = (err as Error).message;
          this.appendLog(runId, `Jenkins trigger failed: ${msg}`);
          this.setState(runId, 'done', { jenkinsBuildUrl: buildUrl, verdict: 'accepted' });
        }
      } else {
        this.appendLog(runId, 'No Jenkins template configured, skipping CI trigger');
        this.setState(runId, 'done', { verdict: 'accepted' });
      }

      this.publish(runId, { type: 'done', runId, state: 'done' });
    }
  }

  cancel(runId: string): void {
    const row = db.prepare('SELECT * FROM release_runs WHERE id=?').get(runId) as Record<string, unknown> | undefined;
    if (!row) return;
    const terminal = ['done', 'error', 'cancelled'].includes(row.state as string);
    if (!terminal) {
      const timer = this.pollTimers.get(runId);
      if (timer) clearInterval(timer);
      this.pollTimers.delete(runId);
      this.setState(runId, 'cancelled');
      this.publish(runId, { type: 'state_change', runId, state: 'cancelled', message: 'Cancelled by user' });
    }
  }

  async verifyProduction(runId: string, verdict: 'accepted' | 'rejected'): Promise<void> {
    const row = db.prepare('SELECT * FROM release_runs WHERE id=?').get(runId) as Record<string, unknown> | undefined;
    if (!row || row.state !== 'production_verifying') {
      throw new Error('Run is not in production_verifying state');
    }

    if (verdict === 'accepted') {
      this.appendLog(runId, 'Production verification accepted');
      await this.mergeBack(runId);
    } else {
      this.setState(runId, 'error', { error: 'Production verification rejected' });
      this.publish(runId, { type: 'error', runId, message: 'Production verification rejected' });
    }
  }

  async parseConflicts(runId: string): Promise<ConflictFile[]> {
    return this.getConflicts(runId);
  }

  getConflicts(runId: string): ConflictFile[] {
    const row = db.prepare('SELECT projects FROM release_runs WHERE id=?').get(runId) as { projects: string | null } | undefined;
    if (!row || !row.projects) return [];
    const projects = JSON.parse(row.projects) as ProjectReleaseStatus[];
    const all: ConflictFile[] = [];
    for (const proj of projects) {
      if (proj.conflictFiles) {
        all.push(...proj.conflictFiles);
      }
    }
    return all;
  }
}

// suppress unused import warning
void newId;

export const releaseRunner = new ReleaseRunner();
