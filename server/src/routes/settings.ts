import { Hono } from 'hono';
import { db } from '../db/index.js';
import { applyProxy } from '../config/loadUserEnv.js';

export const settingsRouter = new Hono();

function maskKey(key?: string): string | undefined {
  if (!key) return undefined;
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '...' + key.slice(-4);
}

function getAiDefaultConfig() {
  return {
    apiKey: maskKey(process.env.ANTHROPIC_API_KEY) ?? null,
    rawKeyExists: !!process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? null,
    model: process.env.ANTHROPIC_MODEL ?? null,
  };
}

// GET /settings → returns all settings as an object
settingsRouter.get('/', (c) => {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return c.json({ ...result, aiDefaultConfig: getAiDefaultConfig() });
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

  // Filter out frontend-only fields
  const entries = Object.entries(body).filter(([k]) => k !== 'aiDefaultConfig');
  upsertMany(entries);

  // Sync anthropic settings to process.env immediately
  const apiKey = body.anthropicApiKey;
  const baseUrl = body.anthropicBaseUrl;
  const model = body.anthropicModel;
  if (apiKey !== undefined) {
    if (apiKey) process.env.ANTHROPIC_API_KEY = apiKey;
    else delete process.env.ANTHROPIC_API_KEY;
  }
  if (baseUrl !== undefined) {
    if (baseUrl) process.env.ANTHROPIC_BASE_URL = baseUrl;
    else delete process.env.ANTHROPIC_BASE_URL;
  }
  if (model !== undefined) {
    if (model) process.env.ANTHROPIC_MODEL = model;
    else delete process.env.ANTHROPIC_MODEL;
  }
  if (body.proxyUrl !== undefined) {
    applyProxy(body.proxyUrl);
  }

  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return c.json({ ...result, aiDefaultConfig: getAiDefaultConfig() });
});
