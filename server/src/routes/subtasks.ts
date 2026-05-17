import { Hono } from 'hono';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { taskScheduler } from '../services/scheduler.js';
import { notificationDispatcher } from '../services/notificationDispatcher.js';
import type { SubTask } from '@devflow/shared';

export const subtasksRouter = new Hono();

function parseSubTask(row: Record<string, unknown>): SubTask {
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

// GET /subtasks/by-req/:reqId
subtasksRouter.get('/by-req/:reqId', (c) => {
  const { reqId } = c.req.param();
  const rows = db.prepare('SELECT * FROM sub_tasks WHERE req_id=? ORDER BY wave ASC, ordering ASC').all(reqId) as Array<Record<string, unknown>>;
  return c.json(rows.map(parseSubTask));
});

// POST /subtasks
const CreateSubTaskSchema = z.object({
  reqId: z.string(),
  analysisId: z.string().nullable().optional(),
  title: z.string(),
  prompt: z.string().optional().default(''),
  project: z.string().nullable().optional(),
  type: z.string().optional().default('impl'),
  wave: z.number().int().optional().default(0),
  taskDependsOn: z.array(z.string()).optional().default([]),
  acceptance: z.array(z.string()).optional().default([]),
  verifyCommands: z.array(z.string()).optional().default([]),
  risk: z.string().nullable().optional(),
  ordering: z.number().int().optional().default(0),
});

subtasksRouter.post('/', async (c) => {
  const data = CreateSubTaskSchema.parse(await c.req.json());
  const id = newId('stk');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO sub_tasks (id, req_id, analysis_id, title, prompt, project, type, wave, task_depends_on, acceptance, verify_commands, risk, status, ordering, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    id,
    data.reqId,
    data.analysisId ?? null,
    data.title,
    data.prompt,
    data.project ?? null,
    data.type,
    data.wave,
    JSON.stringify(data.taskDependsOn),
    JSON.stringify(data.acceptance),
    JSON.stringify(data.verifyCommands),
    data.risk ?? null,
    data.ordering,
    now
  );

  const row = db.prepare('SELECT * FROM sub_tasks WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseSubTask(row), 201);
});

// PATCH /subtasks/:id
const PatchSubTaskSchema = z.object({
  status: z.enum(['pending', 'ready', 'running', 'done', 'error', 'cancelled']).optional(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  agent: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  title: z.string().optional(),
  prompt: z.string().optional(),
  wave: z.number().int().optional(),
  ordering: z.number().int().optional(),
});

subtasksRouter.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM sub_tasks WHERE id=?').get(id);
  if (!row) return c.json({ error: 'not found' }, 404);

  const data = PatchSubTaskSchema.parse(await c.req.json());

  if (data.status !== undefined) db.prepare('UPDATE sub_tasks SET status=? WHERE id=?').run(data.status, id);
  if (data.startedAt !== undefined) db.prepare('UPDATE sub_tasks SET started_at=? WHERE id=?').run(data.startedAt, id);
  if (data.completedAt !== undefined) db.prepare('UPDATE sub_tasks SET completed_at=? WHERE id=?').run(data.completedAt, id);
  if (data.errorMessage !== undefined) db.prepare('UPDATE sub_tasks SET error_message=? WHERE id=?').run(data.errorMessage, id);
  if (data.sessionId !== undefined) db.prepare('UPDATE sub_tasks SET session_id=? WHERE id=?').run(data.sessionId, id);
  if (data.agent !== undefined) db.prepare('UPDATE sub_tasks SET agent=? WHERE id=?').run(data.agent, id);
  if (data.notes !== undefined) db.prepare('UPDATE sub_tasks SET notes=? WHERE id=?').run(data.notes, id);
  if (data.title !== undefined) db.prepare('UPDATE sub_tasks SET title=? WHERE id=?').run(data.title, id);
  if (data.prompt !== undefined) db.prepare('UPDATE sub_tasks SET prompt=? WHERE id=?').run(data.prompt, id);
  if (data.wave !== undefined) db.prepare('UPDATE sub_tasks SET wave=? WHERE id=?').run(data.wave, id);
  if (data.ordering !== undefined) db.prepare('UPDATE sub_tasks SET ordering=? WHERE id=?').run(data.ordering, id);

  const updated = db.prepare('SELECT * FROM sub_tasks WHERE id=?').get(id) as Record<string, unknown>;

  // M6: trigger notification on error
  if (data.errorMessage !== undefined && data.errorMessage) {
    notificationDispatcher.dispatch('subtask.error', {
      subTaskId: id,
      reqId: updated.req_id as string,
      title: updated.title as string,
      errorMessage: data.errorMessage,
    });
  }

  return c.json(parseSubTask(updated));
});

// POST /subtasks/schedule/:reqId
subtasksRouter.post('/schedule/:reqId', async (c) => {
  const { reqId } = c.req.param();
  void taskScheduler.schedule(reqId);
  return c.json({ ok: true, scheduled: reqId });
});

// DELETE /subtasks/:id
subtasksRouter.delete('/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM sub_tasks WHERE id=?').run(id);
  return c.json({ ok: true });
});
