import { Hono } from 'hono';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { resolve, dirname, join } from 'node:path';

export const FS_ROOTS = '__roots__';

export const fsRouter = new Hono();

const isWin = platform() === 'win32';

function listWindowsDrives(): string[] {
  const drives: string[] = [];
  for (let code = 65; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      statSync(root);
      drives.push(resolve(root));
    } catch {
      /* not mounted */
    }
  }
  return drives;
}

function isWindowsDriveRoot(p: string): boolean {
  return /^[A-Za-z]:[\\/]?$/.test(p);
}

// GET /fs/ls?path=<dir>  — list subdirectories (defaults to home; __roots__ = drive letters on Windows)
fsRouter.get('/ls', (c) => {
  const raw = c.req.query('path');

  if (isWin && raw === FS_ROOTS) {
    return c.json({
      path: FS_ROOTS,
      parent: null,
      dirs: listWindowsDrives(),
      isRoots: true,
      isWindows: true,
    });
  }

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
  let parent: string | null = parentRaw !== target ? parentRaw : null;
  if (isWin && parent === null && isWindowsDriveRoot(target)) {
    parent = FS_ROOTS;
  }

  return c.json({
    path: target,
    parent,
    dirs,
    isRoots: false,
    isWindows: isWin,
  });
});
