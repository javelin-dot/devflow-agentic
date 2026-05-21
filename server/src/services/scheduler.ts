import { exec } from 'node:child_process';
import { db, newId } from '../db/index.js';
import { sortWaves } from '../utils/dag.js';
import { sessionManager } from '../agents/SessionManager.js';
import { gitService } from './git.js';
import type { SubTask } from '@devflow/shared';

function parseSubTaskRow(row: Record<string, unknown>): SubTask {
  return {
    id: row.id as string,
    reqId: row.req_id as string,
    analysisId: (row.analysis_id as string | null) ?? null,
    title: row.title as string,
    prompt: (row.prompt as string) ?? '',
    project: (row.project as string | null) ?? null,
    type: (row.type as string) ?? 'impl',
    wave: (row.wave as number) ?? 0,
    taskDependsOn: row.task_depends_on ? (JSON.parse(row.task_depends_on as string) as string[]) : [],
    acceptance: row.acceptance ? (JSON.parse(row.acceptance as string) as string[]) : [],
    verifyCommands: row.verify_commands ? (JSON.parse(row.verify_commands as string) as string[]) : [],
    risk: (row.risk as string | null) ?? null,
    status: (row.status as SubTask['status']) ?? 'pending',
    sessionId: (row.session_id as string | null) ?? null,
    agent: (row.agent as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    ordering: (row.ordering as number) ?? 0,
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function execAsync(cmd: string, cwd?: string): Promise<{ code: number }> {
  return new Promise((resolve) => {
    exec(cmd, { cwd }, (err) => {
      resolve({ code: err ? (err.code ?? 1) : 0 });
    });
  });
}

function waitForWave(taskIds: string[]): Promise<void> {
  return new Promise((resolve) => {
    const POLL_MS = 2000;
    const terminalStatuses = new Set(['done', 'error', 'cancelled']);

    const check = () => {
      const placeholders = taskIds.map(() => '?').join(',');
      const rows = db.prepare(`SELECT status FROM sub_tasks WHERE id IN (${placeholders})`).all(...taskIds) as Array<{ status: string }>;
      const allDone = rows.every(r => terminalStatuses.has(r.status));
      if (allDone) {
        resolve();
      } else {
        setTimeout(check, POLL_MS);
      }
    };

    check();
  });
}

class TaskScheduler {
  private inflight = new Set<string>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  async schedule(reqId: string): Promise<void> {
    if (this.inflight.has(reqId)) {
      console.log(`[TaskScheduler] Schedule skipped for ${reqId}: already running`);
      return;
    }
    this.inflight.add(reqId);

    try {
      const rows = db.prepare(
        `SELECT * FROM sub_tasks WHERE req_id=? AND status IN ('pending','ready') ORDER BY wave ASC, ordering ASC`
      ).all(reqId) as Array<Record<string, unknown>>;

      if (rows.length === 0) return;

      const tasks = rows.map(parseSubTaskRow);
      const waves = sortWaves(tasks);

      for (const wave of waves) {
        // Group by project, run serially within a project, concurrently across projects
        const byProject = new Map<string, SubTask[]>();
        for (const task of wave) {
          const key = task.project ?? '__no_project__';
          if (!byProject.has(key)) byProject.set(key, []);
          byProject.get(key)!.push(task);
        }

        const waveTaskIds = wave.map(t => t.id);
        const projectPromises: Promise<void>[] = [];

        for (const [, projectTasks] of byProject) {
          projectPromises.push(
            (async () => {
              for (const task of projectTasks) {
                await this.runTask(task);
              }
            })()
          );
        }

        await Promise.all(projectPromises);
        await waitForWave(waveTaskIds);
      }
    } finally {
      this.inflight.delete(reqId);
    }
  }

  startPolling(intervalMs = 30000): void {
    if (this.pollTimer) return;
    console.log(`[TaskScheduler] Polling started every ${intervalMs}ms`);
    this.pollTimer = setInterval(() => {
      try {
        this.pollOnce();
      } catch (err) {
        console.error('[TaskScheduler] Poll error:', (err as Error).message);
      }
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log('[TaskScheduler] Polling stopped');
    }
  }

  private pollOnce(): void {
    // Find requirements in 'development' stage that have pending/ready subtasks
    const rows = db.prepare(
      `SELECT DISTINCT st.req_id
       FROM sub_tasks st
       JOIN requirements r ON r.id = st.req_id
       WHERE r.stage = 'development'
         AND st.status IN ('pending', 'ready')
         AND NOT EXISTS (
           SELECT 1 FROM sub_tasks st2
           WHERE st2.req_id = st.req_id AND st2.status = 'running'
         )`
    ).all() as Array<{ req_id: string }>;

    for (const { req_id } of rows) {
      if (!this.inflight.has(req_id)) {
        console.log(`[TaskScheduler] Auto-scheduling ${req_id}`);
        void this.schedule(req_id);
      }
    }
  }

  private resolveCwd(task: SubTask): string | undefined {
    if (!task.project) return undefined;
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key='workspaceRoot'").get() as { value: string } | undefined;
    const workspaceRoot = settingsRow?.value ?? process.cwd();
    return gitService.getWorktreePath(workspaceRoot, task.reqId, task.project);
  }

  private async runAgentForTask(task: SubTask): Promise<void> {
    const cwd = this.resolveCwd(task);
    let sessionId = task.sessionId;
    const agent = task.agent ?? 'claude-code';

    // Create session if not exists
    if (!sessionId) {
      sessionId = newId('ses');
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO sessions (id, req_id, title, status, agent, stage_snapshot, cwd, created_at)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`
      ).run(sessionId, task.reqId, task.title, agent, null, cwd ?? null, now);
      db.prepare(`UPDATE sub_tasks SET session_id=?, agent=? WHERE id=?`).run(sessionId, agent, task.id);
    } else {
      const sesRow = db.prepare('SELECT * FROM sessions WHERE id=?').get(sessionId) as Record<string, unknown> | undefined;
      if (!sesRow) {
        sessionId = newId('ses');
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO sessions (id, req_id, title, status, agent, stage_snapshot, cwd, created_at)
           VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`
        ).run(sessionId, task.reqId, task.title, agent, null, cwd ?? null, now);
        db.prepare(`UPDATE sub_tasks SET session_id=?, agent=? WHERE id=?`).run(sessionId, agent, task.id);
      }
    }

    return new Promise((resolve, reject) => {
      let unsub: (() => void) | null = null;
      let resolved = false;

      const cb = (line: string) => {
        const match = line.match(/^data: (.+)(?:\n\n|$)/);
        if (!match) return;
        try {
          const data = JSON.parse(match[1]) as { type: string; code?: number | null; message?: string };
          if (data.type === 'exit') {
            if (!resolved) {
              resolved = true;
              if (unsub) unsub();
              if (data.code === 0 || data.code === null) {
                resolve();
              } else {
                reject(new Error(`Agent exited with code ${data.code}`));
              }
            }
          }
          if (data.type === 'error') {
            if (!resolved) {
              resolved = true;
              if (unsub) unsub();
              reject(new Error(data.message ?? 'Agent error'));
            }
          }
        } catch {}
      };

      unsub = sessionManager.subscribe(sessionId!, cb);

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (unsub) unsub();
          sessionManager.interrupt(sessionId!);
          reject(new Error('Agent execution timed out after 30 minutes'));
        }
      }, 30 * 60 * 1000);

      sessionManager.run({ sessionId: sessionId!, agent, prompt: task.prompt, cwd })
        .catch((err: Error) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            if (unsub) unsub();
            reject(err);
          }
        });
    });
  }

  private async runTask(task: SubTask): Promise<void> {
    const now = new Date().toISOString();
    db.prepare(`UPDATE sub_tasks SET status='running', started_at=? WHERE id=?`).run(now, task.id);

    try {
      // Step 1: Run Agent to execute the subtask
      await this.runAgentForTask(task);

      // Step 2: Run verify commands to check task completion criteria
      const cwd = this.resolveCwd(task);
      for (const cmd of task.verifyCommands) {
        const { code } = await execAsync(cmd, cwd);
        if (code !== 0) {
          throw new Error(`Verify command failed (exit ${code}): ${cmd}`);
        }
      }

      const doneAt = new Date().toISOString();
      db.prepare(`UPDATE sub_tasks SET status='done', completed_at=? WHERE id=?`).run(doneAt, task.id);
    } catch (err) {
      const errorAt = new Date().toISOString();
      const message = (err as Error).message;
      db.prepare(`UPDATE sub_tasks SET status='error', error_message=?, completed_at=? WHERE id=?`).run(message, errorAt, task.id);

      // Retry up to 3 times by creating a fix subtask.
      const baseTitle = task.title.replace(/^(\[retry\]\s*)+/, '');
      const retryRows = db.prepare(`SELECT COUNT(*) as cnt FROM sub_tasks WHERE req_id=? AND title LIKE ?`).get(task.reqId, `[retry]%${baseTitle}`) as { cnt: number };
      if (retryRows.cnt < 3) {
        const fixId = newId('stk');
        const fixNow = new Date().toISOString();
        db.prepare(
          `INSERT INTO sub_tasks (id, req_id, analysis_id, title, prompt, project, type, wave, task_depends_on, acceptance, verify_commands, risk, status, ordering, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, 'pending', ?, ?)`
        ).run(
          fixId,
          task.reqId,
          task.analysisId,
          `[retry] ${baseTitle}`,
          `Fix the following error and retry the task:\n\nOriginal task: ${task.prompt}\n\nError: ${message}`,
          task.project,
          task.type,
          task.wave,
          JSON.stringify(task.acceptance),
          JSON.stringify(task.verifyCommands),
          task.risk,
          task.ordering + 1,
          fixNow
        );
      }
    }
  }
}

export const taskScheduler = new TaskScheduler();
