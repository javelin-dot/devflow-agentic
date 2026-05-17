import { Hono } from 'hono';
import { z } from 'zod';
import { db, newId } from '../db/index.js';

export const eventsRouter = new Hono();

// GET /events/by-req/:reqId
eventsRouter.get('/by-req/:reqId', (c) => {
  const { reqId } = c.req.param();
  const { limit = '200', type, actor } = c.req.query();

  let sql = 'SELECT * FROM events WHERE req_id = ?';
  const params: unknown[] = [reqId];

  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (actor) { sql += ' AND actor = ?'; params.push(actor); }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Number(limit));

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return c.json(
    rows.map((r) => ({
      id: r.id,
      reqId: r.req_id,
      type: r.type,
      payload: JSON.parse((r.payload as string) ?? '{}'),
      actor: r.actor,
      createdAt: r.created_at,
    }))
  );
});

// GET /events
eventsRouter.get('/', (c) => {
  const { limit = '200' } = c.req.query();
  const rows = db
    .prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT ?')
    .all(Number(limit)) as Array<Record<string, unknown>>;
  return c.json(
    rows.map((r) => ({
      id: r.id,
      reqId: r.req_id,
      type: r.type,
      payload: JSON.parse((r.payload as string) ?? '{}'),
      actor: r.actor,
      createdAt: r.created_at,
    }))
  );
});

// POST /events
const CreateEventSchema = z.object({
  reqId: z.string().optional(),
  type: z.string().min(1),
  payload: z.unknown().optional(),
});

eventsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = CreateEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;
  const actor = c.req.header('X-Actor') ?? 'system';
  const id = newId('evt');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO events (id, req_id, type, payload, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, data.reqId ?? null, data.type, JSON.stringify(data.payload ?? {}), actor, now);

  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown>;
  return c.json(
    {
      id: row.id,
      reqId: row.req_id,
      type: row.type,
      payload: JSON.parse((row.payload as string) ?? '{}'),
      actor: row.actor,
      createdAt: row.created_at,
    },
    201
  );
});
