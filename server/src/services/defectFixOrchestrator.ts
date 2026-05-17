import { spawn } from 'node:child_process';
import { db, newId } from '../db/index.js';
import { gitService } from './git.js';
import { ClaudeAPISession } from '../agents/ClaudeAPISession.js';
import type { NormalizedEntry, Defect } from '@devflow/shared';

export interface FixResult {
  success: boolean;
  status: Defect['status'];
  reason?: string;
  log: string;
}

class DefectFixOrchestrator {
  async run(defectId: string, _agent: string): Promise<FixResult> {
    const defect = db.prepare('SELECT * FROM defects WHERE id=?').get(defectId) as Record<string, unknown> | undefined;
    if (!defect) return { success: false, status: 'pending_confirm', reason: 'defect not found', log: '' };

    const reqId = defect.req_id as string;
    const subTaskId = defect.sub_task_id as string | null;

    // Fetch requirement and project info
    const req = db.prepare('SELECT title, description FROM requirements WHERE id=?').get(reqId) as { title: string; description: string } | undefined;
    const proj = db.prepare('SELECT project, dev_branch FROM requirement_projects WHERE req_id=? AND is_primary=1 LIMIT 1').get(reqId) as { project: string; dev_branch: string | null } | undefined;

    let projectPath = '';
    if (proj?.project) {
      const p = db.prepare('SELECT path FROM projects WHERE name=?').get(proj.project) as { path: string } | undefined;
      if (p) projectPath = p.path;
    }

    // Fetch subtask details
    let subtask: Record<string, unknown> | undefined;
    if (subTaskId) {
      subtask = db.prepare('SELECT * FROM sub_tasks WHERE id=?').get(subTaskId) as Record<string, unknown> | undefined;
    }

    // Record original commit for rollback
    let originalCommit = '';
    if (projectPath && proj?.dev_branch) {
      try {
        const g = gitService.git(projectPath);
        const log = await g.log({ maxCount: 1 });
        originalCommit = log.latest?.hash ?? '';
        await g.checkout(proj.dev_branch);
      } catch (e) {
        return { success: false, status: 'pending_confirm', reason: `git checkout failed: ${(e as Error).message}`, log: '' };
      }
    }

    // Build prompt
    const prompt = this.buildPrompt(defect, req, subtask);

    // Run AI session
    const sessionId = newId('ses');
    const session = new ClaudeAPISession(sessionId, {});

    const collected: string[] = [];
    let done = false;
    let errorMsg = '';

    session.on('entry', (entry: NormalizedEntry) => {
      if (entry.type === 'assistant_message') collected.push(entry.content);
    });
    session.on('exit', (code: number | null) => {
      done = true;
      if (code !== 0) errorMsg = 'Agent exited with error';
    });
    session.on('error', (err: Error) => {
      done = true;
      errorMsg = err.message;
    });

    session.send(prompt);

    await new Promise<void>((resolve) => {
      const iv = setInterval(() => { if (done) { clearInterval(iv); resolve(); } }, 200);
      setTimeout(() => { clearInterval(iv); done = true; resolve(); }, 10 * 60 * 1000);
    });

    if (errorMsg) {
      await this.rollback(projectPath, originalCommit);
      return { success: false, status: 'pending_confirm', reason: errorMsg, log: '' };
    }

    const aiOutput = collected.join('').trim();

    // Classification: look for "NO_CODE_CHANGE" marker
    if (aiOutput.includes('NO_CODE_CHANGE')) {
      db.prepare('UPDATE defects SET status=?, wont_fix_reason=?, updated_at=? WHERE id=?')
        .run('wont_fix', 'product_decision', new Date().toISOString(), defectId);
      return { success: true, status: 'wont_fix', reason: 'AI classified as no code change needed', log: aiOutput };
    }

    // Extract code blocks and attempt to apply fixes
    const fileBlocks = this.extractFileBlocks(aiOutput);
    const applyLog: string[] = [];

    for (const block of fileBlocks) {
      try {
        const fs = await import('node:fs');
        const { writeFileSync } = fs;
        const fullPath = projectPath ? `${projectPath}/${block.path}` : block.path;
        writeFileSync(fullPath, block.content, 'utf-8');
        applyLog.push(`Wrote ${block.path}`);
      } catch (e) {
        applyLog.push(`Failed to write ${block.path}: ${(e as Error).message}`);
      }
    }

    // Run verify commands from subtask
    const verifyCommands: string[] = [];
    if (subtask?.verify_commands) {
      try { verifyCommands.push(...JSON.parse(subtask.verify_commands as string) as string[]); } catch { /* ignore */ }
    }

    let verifyPassed = true;
    for (const cmd of verifyCommands) {
      const exitCode = await new Promise<number>((resolve) => {
        const proc = spawn(cmd, [], { cwd: projectPath ?? process.cwd(), shell: true });
        proc.on('close', (code) => resolve(code ?? 1));
        setTimeout(() => { proc.kill(); resolve(1); }, 5 * 60 * 1000);
      });
      if (exitCode !== 0) {
        verifyPassed = false;
        applyLog.push(`Verify failed: ${cmd} (exit ${exitCode})`);
        break;
      } else {
        applyLog.push(`Verify passed: ${cmd}`);
      }
    }

    if (!verifyPassed) {
      await this.rollback(projectPath, originalCommit);
      return { success: false, status: 'pending_confirm', reason: 'verify commands failed', log: applyLog.join('\n') };
    }

    // Success: mark as to_regress
    db.prepare('UPDATE defects SET status=?, updated_at=? WHERE id=?')
      .run('to_regress', new Date().toISOString(), defectId);

    // Record history
    const hId = newId('dsh');
    db.prepare(
      `INSERT INTO defect_status_history (id, defect_id, actor, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(hId, defectId, 'agent', 'pending_confirm', 'to_regress', 'Auto-fixed by DefectFixOrchestrator', new Date().toISOString());

    // Auto smoke run
    try {
      await fetch('http://localhost:4000/api/test-cases/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId, scope: 'smoke', agent: 'claude-api' }),
      });
    } catch {
      // ignore auto-smoke failure
    }

    return { success: true, status: 'to_regress', log: applyLog.join('\n') };
  }

  private buildPrompt(
    defect: Record<string, unknown>,
    req?: { title: string; description: string },
    subtask?: Record<string, unknown>
  ): string {
    let prompt = `# Defect Fix Task\n\n`;
    prompt += `## Defect\n`;
    prompt += `- Title: ${defect.title as string}\n`;
    prompt += `- Description: ${(defect.description as string) ?? ''}\n`;
    prompt += `- Severity: ${defect.severity as string}\n`;

    if (req) {
      prompt += `\n## Requirement\n`;
      prompt += `- Title: ${req.title}\n`;
      prompt += `- Description: ${req.description}\n`;
    }

    if (subtask) {
      prompt += `\n## Related SubTask\n`;
      prompt += `- Title: ${subtask.title as string}\n`;
      prompt += `- Prompt: ${(subtask.prompt as string) ?? ''}\n`;
      prompt += `- Acceptance: ${(subtask.acceptance as string) ?? ''}\n`;
    }

    prompt += `\n## Instructions\n`;
    prompt += `Analyze this defect. If NO code change is needed, respond with "NO_CODE_CHANGE" and explain why.\n`;
    prompt += `If a code change IS needed, output the fixed code in file blocks like this:\n`;
    prompt += `\`\`\`file:path/to/file.ts\n// fixed code here\n\`\`\`\n`;
    prompt += `Only output file blocks for files you changed. No extra explanation.\n`;

    return prompt;
  }

  private extractFileBlocks(output: string): Array<{ path: string; content: string }> {
    const blocks: Array<{ path: string; content: string }> = [];
    const regex = /```file:([\w./-]+)\n([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(output)) !== null) {
      blocks.push({ path: m[1], content: m[2] });
    }
    return blocks;
  }

  private async rollback(projectPath: string, commitSha: string): Promise<void> {
    if (!projectPath || !commitSha) return;
    try {
      const g = gitService.git(projectPath);
      await g.reset(['--hard', commitSha]);
    } catch (e) {
      console.error('[rollback] failed:', e);
    }
  }
}

export const defectFixOrchestrator = new DefectFixOrchestrator();
