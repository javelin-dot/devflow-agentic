import { Hono } from 'hono';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import type { ChatSession, ChatMessage } from '@devflow/shared';

export const sessionsRouter = new Hono();

function parseSession(row: Record<string, unknown>): ChatSession {
  return {
    id: row.id as string,
    reqId: row.req_id as string,
    title: (row.title as string) ?? '',
    status: (row.status as 'active' | 'archived'),
    agent: row.agent as string,
    agentLocked: row.agent_locked === 1,
    stageSnapshot: (row.stage_snapshot as ChatSession['stageSnapshot']) ?? null,
    profileId: (row.profile_id as string | null) ?? null,
    cwd: (row.cwd as string | null) ?? null,
    archivedAt: (row.archived_at as string | null) ?? null,
    archiveReason: (row.archive_reason as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

// GET /sessions/by-req/:reqId
sessionsRouter.get('/by-req/:reqId', (c) => {
  const { reqId } = c.req.param();
  const archived = c.req.query('archived');
  let sql = 'SELECT * FROM sessions WHERE req_id=?';
  if (archived === '1') sql += ' AND archived_at IS NOT NULL';
  else sql += ' AND archived_at IS NULL';
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(reqId) as Array<Record<string, unknown>>;
  return c.json(rows.map(parseSession));
});

// POST /sessions
const CreateSessionSchema = z.object({
  reqId: z.string(),
  title: z.string().optional().default(''),
  agent: z.string().default('claude-code'),
  cwd: z.string().nullable().optional(),
  profileId: z.string().nullable().optional(),
});

sessionsRouter.post('/', async (c) => {
  const data = CreateSessionSchema.parse(await c.req.json());
  const req = db.prepare('SELECT stage FROM requirements WHERE id=?').get(data.reqId) as { stage: string } | undefined;
  if (!req) return c.json({ error: 'requirement not found' }, 404);

  const id = newId('ses');
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO sessions (id, req_id, title, agent, stage_snapshot, profile_id, cwd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.reqId, data.title, data.agent, req.stage, data.profileId ?? null, data.cwd ?? null, now);

  const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseSession(row), 201);
});

// PATCH /sessions/:id
sessionsRouter.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
  if (!row) return c.json({ error: 'not found' }, 404);
  const data = z.object({ title: z.string().optional(), profileId: z.string().nullable().optional() }).parse(await c.req.json());
  if (data.title !== undefined) db.prepare('UPDATE sessions SET title=? WHERE id=?').run(data.title, id);
  if (data.profileId !== undefined) db.prepare('UPDATE sessions SET profile_id=? WHERE id=?').run(data.profileId, id);
  const updated = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseSession(updated));
});

// POST /sessions/:id/archive
sessionsRouter.post('/:id/archive', async (c) => {
  const { id } = c.req.param();
  const { reason } = z.object({ reason: z.string().optional().default('manual') }).parse(await c.req.json().catch(() => ({})));
  db.prepare(`UPDATE sessions SET archived_at=?, archive_reason=?, status='archived' WHERE id=?`)
    .run(new Date().toISOString(), reason, id);
  const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseSession(row));
});

// POST /sessions/:id/unarchive
sessionsRouter.post('/:id/unarchive', (c) => {
  const { id } = c.req.param();
  db.prepare(`UPDATE sessions SET archived_at=NULL, archive_reason=NULL, status='active' WHERE id=?`).run(id);
  const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseSession(row));
});

// DELETE /sessions/:id
sessionsRouter.delete('/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM sessions WHERE id=?').run(id);
  return c.json({ ok: true });
});

// GET /sessions/:id/messages
sessionsRouter.get('/:id/messages', (c) => {
  const { id } = c.req.param();
  const limit = Math.min(Number(c.req.query('limit') ?? 200), 500);
  const rows = db.prepare('SELECT * FROM messages WHERE session_id=? ORDER BY created_at ASC LIMIT ?')
    .all(id, limit) as Array<Record<string, unknown>>;
  const msgs: ChatMessage[] = rows.map(r => ({
    id: r.id as string,
    sessionId: r.session_id as string,
    role: r.role as 'user' | 'assistant' | 'tool',
    content: r.content as string,
    entryType: (r.entry_type as string | null) ?? null,
    action: r.action ? JSON.parse(r.action as string) : null,
    status: (r.status as ChatMessage['status']) ?? null,
    createdAt: r.created_at as string,
  }));
  return c.json(msgs);
});

// DELETE /sessions/:id/messages/:msgId — delete single message
sessionsRouter.delete('/:id/messages/:msgId', (c) => {
  const { id, msgId } = c.req.param();
  db.prepare('DELETE FROM messages WHERE id=? AND session_id=?').run(msgId, id);
  return c.json({ ok: true });
});

// DELETE /sessions/:id/messages — batch delete
sessionsRouter.delete('/:id/messages', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const ids = (body.ids ?? []) as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: 'ids array required' }, 400);
  }
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM messages WHERE session_id=? AND id IN (${placeholders})`).run(id, ...ids);
  return c.json({ ok: true, deleted: ids.length });
});
