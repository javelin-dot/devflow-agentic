import { Hono } from 'hono';
import { db } from '../db/index.js';

export const settingsRouter = new Hono();

// GET /settings → returns all settings as an object
settingsRouter.get('/', (c) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return c.json(result);
});

// PUT /settings → batch update
settingsRouter.put('/', async (c) => {
  const body = await c.req.json() as Record<string, string>;
  const upsert = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
  const upsertMany = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      upsert.run(key, String(value));
    }
  });
  upsertMany(Object.entries(body));

  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return c.json(result);
});
