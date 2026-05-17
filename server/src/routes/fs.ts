import { Hono } from 'hono';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, dirname, join } from 'node:path';

export const fsRouter = new Hono();

// GET /fs/ls?path=<dir>  — list subdirectories at path (defaults to home)
fsRouter.get('/ls', (c) => {
  const raw = c.req.query('path');
  const target = raw ? resolve(raw) : homedir();

  if (!existsSync(target)) {
    return c.json({ error: 'path not found' }, 404);
  }

  let dirs: string[] = [];
  try {
    dirs = readdirSync(target, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => join(target, e.name))
      .sort();
  } catch {
    dirs = [];
  }

  const parentRaw = dirname(target);
  const parent = parentRaw !== target ? parentRaw : null;

  return c.json({ path: target, parent, dirs });
});
