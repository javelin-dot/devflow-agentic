import { Hono } from 'hono';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { notificationDispatcher } from '../services/notificationDispatcher.js';
import type { NotificationSubscription } from '@devflow/shared';

export const notificationsRouter = new Hono();

function parseSubscription(row: Record<string, unknown>): NotificationSubscription {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    eventType: row.event_type as string,
    channel: (row.channel as NotificationSubscription['channel']) ?? 'inapp',
    target: (row.target as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

// GET /notifications — list recent notifications for current user
notificationsRouter.get('/', (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);
  const unreadOnly = c.req.query('unread') === '1';

  let sql = 'SELECT * FROM notifications WHERE 1=1';
  const params: unknown[] = [];

  if (unreadOnly) {
    sql += ' AND read_at IS NULL';
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const notifications = rows.map(r => ({
    id: r.id as string,
    userId: (r.user_id as string | null) ?? null,
    type: r.type as string,
    payload: JSON.parse((r.payload as string) ?? '{}'),
    channel: (r.channel as string) ?? 'inapp',
    readAt: (r.read_at as string | null) ?? null,
    createdAt: r.created_at as string,
    deliveryStatus: (r.delivery_status as string) ?? 'pending',
  }));

  return c.json({ notifications, unreadCount: notificationDispatcher.getUnreadCount() });
});

// GET /notifications/unread-count
notificationsRouter.get('/unread-count', (c) => {
  return c.json({ count: notificationDispatcher.getUnreadCount() });
});

// POST /notifications/:id/read
notificationsRouter.post('/:id/read', (c) => {
  const { id } = c.req.param();
  notificationDispatcher.markRead(id);
  return c.json({ ok: true });
});

// POST /notifications/read-all
notificationsRouter.post('/read-all', (c) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE notifications SET read_at=? WHERE read_at IS NULL').run(now);
  return c.json({ ok: true });
});

// DELETE /notifications/:id — dismiss a notification
notificationsRouter.delete('/:id', (c) => {
  const { id } = c.req.param();
  const result = db.prepare('DELETE FROM notifications WHERE id=?').run(id);
  if (result.changes === 0) {
    return c.json({ error: 'not_found', message: 'Notification not found' }, 404);
  }
  return c.json({ ok: true });
});

// GET /notification-subscriptions
notificationsRouter.get('/subscriptions', (c) => {
  const userId = c.req.query('userId');
  const rows = userId
    ? db.prepare('SELECT * FROM notification_subscriptions WHERE user_id=?').all(userId)
    : db.prepare('SELECT * FROM notification_subscriptions').all();
  return c.json((rows as Array<Record<string, unknown>>).map(parseSubscription));
});

// POST /notification-subscriptions
const SubSchema = z.object({
  userId: z.string(),
  eventType: z.string(),
  channel: z.enum(['inapp', 'webhook', 'email']).default('inapp'),
  target: z.string().nullable().optional(),
});

notificationsRouter.post('/subscriptions', async (c) => {
  const data = SubSchema.parse(await c.req.json());
  const id = newId('sub');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO notification_subscriptions (id, user_id, event_type, channel, target, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, data.userId, data.eventType, data.channel, data.target ?? null, now);

  const row = db.prepare('SELECT * FROM notification_subscriptions WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseSubscription(row), 201);
});

// DELETE /notification-subscriptions/:id
notificationsRouter.delete('/subscriptions/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM notification_subscriptions WHERE id=?').run(id);
  return c.json({ ok: true });
});
