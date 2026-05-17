import { Hono } from 'hono';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { createAgentProcess } from '../agents/SessionManager.js';
import { taskScheduler } from '../services/scheduler.js';
import { buildAnalysisPrompt, parseAnalysisOutput } from '../services/analysis.js';
import type { RequirementAnalysis, Requirement, AnalysisOutput } from '@devflow/shared';

export const analysisRouter = new Hono();

function parseAnalysis(row: Record<string, unknown>): RequirementAnalysis {
  return {
    id: row.id as string,
    reqId: row.req_id as string,
    agent: row.agent as string,
    status: row.status as RequirementAnalysis['status'],
    prompt: row.prompt as string,
    output: row.output ? (JSON.parse(row.output as string) as AnalysisOutput) : null,
    errorMessage: (row.error_message as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// GET /analysis/by-req/:reqId
analysisRouter.get('/by-req/:reqId', (c) => {
  const { reqId } = c.req.param();
  const rows = db.prepare('SELECT * FROM analyses WHERE req_id=? ORDER BY created_at DESC').all(reqId) as Array<Record<string, unknown>>;
  return c.json(rows.map(parseAnalysis));
});

// GET /analysis/:id
analysisRouter.get('/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM analyses WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseAnalysis(row));
});

// POST /analysis/start
const StartSchema = z.object({
  reqId: z.string(),
  agents: z.array(z.string()).min(1),
  prompt: z.string().optional(),
});

analysisRouter.post('/start', async (c) => {
  const data = StartSchema.parse(await c.req.json());

  const reqRow = db.prepare('SELECT * FROM requirements WHERE id=?').get(data.reqId) as Record<string, unknown> | undefined;
  if (!reqRow) return c.json({ error: 'requirement not found' }, 404);

  // Build the requirement object for prompt generation
  const projects = db.prepare('SELECT * FROM requirement_projects WHERE req_id=?').all(data.reqId) as Array<Record<string, unknown>>;
  const req: Pick<Requirement, 'id' | 'title' | 'description' | 'kind' | 'priority' | 'tags' | 'projects'> = {
    id: reqRow.id as string,
    title: reqRow.title as string,
    description: (reqRow.description as string) ?? '',
    kind: (reqRow.kind as Requirement['kind']) ?? 'standard',
    priority: (reqRow.priority as Requirement['priority']) ?? 'medium',
    tags: reqRow.tags ? (JSON.parse(reqRow.tags as string) as string[]) : [],
    projects: projects.map(p => ({
      project: p.project as string,
      devBranch: (p.dev_branch as string | null) ?? null,
      uatBranch: (p.uat_branch as string | null) ?? null,
      isPrimary: p.is_primary === 1,
    })),
  };

  const basePrompt = data.prompt ?? buildAnalysisPrompt(req);
  const now = new Date().toISOString();

  const analyses: RequirementAnalysis[] = [];

  for (const agent of data.agents) {
    const id = newId('anl');
    db.prepare(
      `INSERT INTO analyses (id, req_id, agent, status, prompt, created_at, updated_at)
       VALUES (?, ?, ?, 'running', ?, ?, ?)`
    ).run(id, data.reqId, agent, basePrompt, now, now);

    const row = db.prepare('SELECT * FROM analyses WHERE id=?').get(id) as Record<string, unknown>;
    analyses.push(parseAnalysis(row));

    // Spawn session asynchronously
    const sessionId = newId('ses');
    const session = createAgentProcess(agent, sessionId);
    let contentBuffer = '';

    session.on('entry', (entry) => {
      if (entry.type === 'assistant_message') {
        contentBuffer += entry.content;
      }
    });

    session.on('exit', () => {
      try {
        const output = parseAnalysisOutput(contentBuffer);
        const updated = new Date().toISOString();
        db.prepare(
          `UPDATE analyses SET status='awaiting', output=?, session_id=?, updated_at=? WHERE id=?`
        ).run(JSON.stringify(output), sessionId, updated, id);
      } catch (err) {
        const updated = new Date().toISOString();
        db.prepare(
          `UPDATE analyses SET status='error', error_message=?, updated_at=? WHERE id=?`
        ).run((err as Error).message, updated, id);
      }
    });

    session.on('error', (err: Error) => {
      const updated = new Date().toISOString();
      db.prepare(
        `UPDATE analyses SET status='error', error_message=?, updated_at=? WHERE id=?`
      ).run(err.message, updated, id);
    });

    // Run asynchronously
    setImmediate(() => session.send(basePrompt));
  }

  return c.json({ analyses }, 201);
});

// POST /analysis/:id/choose
analysisRouter.post('/:id/choose', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM analyses WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const status = row.status as string;
  if (status !== 'awaiting' && status !== 'done') {
    return c.json({ error: `analysis status is '${status}', must be awaiting or done` }, 400);
  }

  const output = row.output ? (JSON.parse(row.output as string) as AnalysisOutput) : null;
  if (!output) return c.json({ error: 'analysis has no output' }, 400);

  const reqId = row.req_id as string;
  const now = new Date().toISOString();

  // Build title→id map as we insert
  const titleToId = new Map<string, string>();
  const subTasks = [];

  // First pass: create all subtasks to get their IDs
  for (const task of output.proposedTasks) {
    const taskId = newId('stk');
    titleToId.set(task.title, taskId);
    subTasks.push({ id: taskId, task });
  }

  // Second pass: insert with resolved dependency IDs
  const insertedTasks = [];
  for (const { id: taskId, task } of subTasks) {
    const dependsOnIds = task.taskDependsOn
      .map(title => titleToId.get(title))
      .filter(Boolean) as string[];

    db.prepare(
      `INSERT INTO sub_tasks (id, req_id, analysis_id, title, prompt, project, type, wave, task_depends_on, acceptance, verify_commands, risk, status, ordering, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(
      taskId,
      reqId,
      id,
      task.title,
      task.prompt,
      task.project ?? null,
      task.type,
      task.wave,
      JSON.stringify(dependsOnIds),
      JSON.stringify(task.acceptance),
      JSON.stringify(task.verifyCommands),
      task.risk ?? null,
      subTasks.findIndex(s => s.id === taskId),
      now
    );

    const taskRow = db.prepare('SELECT * FROM sub_tasks WHERE id=?').get(taskId) as Record<string, unknown>;
    insertedTasks.push(parseSubTask(taskRow));
  }

  // Update requirement stage to development
  db.prepare(
    `UPDATE requirements SET stage='development', analysis_chosen_id=? WHERE id=?`
  ).run(id, reqId);

  // Insert stage_change event
  const eventId = newId('evt');
  db.prepare(
    `INSERT INTO events (id, req_id, type, payload, actor, created_at) VALUES (?, ?, 'stage_change', ?, 'system', ?)`
  ).run(
    eventId,
    reqId,
    JSON.stringify({ from: 'analyzing', to: 'development', analysisId: id }),
    now
  );

  // Mark analysis as done
  db.prepare(`UPDATE analyses SET status='done', updated_at=? WHERE id=?`).run(now, id);

  // Auto-trigger task scheduler for development stage
  void taskScheduler.schedule(reqId);

  return c.json({ subTasks: insertedTasks, reqId });
});

// POST /analysis/:id/cancel
analysisRouter.post('/:id/cancel', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM analyses WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  db.prepare(`UPDATE analyses SET status='cancelled', updated_at=? WHERE id=?`).run(new Date().toISOString(), id);
  const updated = db.prepare('SELECT * FROM analyses WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseAnalysis(updated));
});

// POST /analysis/:id/retry
analysisRouter.post('/:id/retry', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM analyses WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const reqId = row.req_id as string;
  const agent = row.agent as string;
  const prompt = row.prompt as string;
  const now = new Date().toISOString();

  const newId_ = newId('anl');
  db.prepare(
    `INSERT INTO analyses (id, req_id, agent, status, prompt, created_at, updated_at)
     VALUES (?, ?, ?, 'running', ?, ?, ?)`
  ).run(newId_, reqId, agent, prompt, now, now);

  const sessionId = newId('ses');
  const session = createAgentProcess(agent, sessionId);
  let contentBuffer = '';

  session.on('entry', (entry) => {
    if (entry.type === 'assistant_message') {
      contentBuffer += entry.content;
    }
  });

  session.on('exit', () => {
    try {
      const output = parseAnalysisOutput(contentBuffer);
      db.prepare(
        `UPDATE analyses SET status='awaiting', output=?, session_id=?, updated_at=? WHERE id=?`
      ).run(JSON.stringify(output), sessionId, new Date().toISOString(), newId_);
    } catch (err) {
      db.prepare(
        `UPDATE analyses SET status='error', error_message=?, updated_at=? WHERE id=?`
      ).run((err as Error).message, new Date().toISOString(), newId_);
    }
  });

  session.on('error', (err: Error) => {
    db.prepare(
      `UPDATE analyses SET status='error', error_message=?, updated_at=? WHERE id=?`
    ).run(err.message, new Date().toISOString(), newId_);
  });

  setImmediate(() => session.send(prompt));

  const newRow = db.prepare('SELECT * FROM analyses WHERE id=?').get(newId_) as Record<string, unknown>;
  return c.json(parseAnalysis(newRow), 201);
});

function parseSubTask(row: Record<string, unknown>) {
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
    status: (row.status as string) ?? 'pending',
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
