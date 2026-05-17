import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../db/index.js';
import { gitService } from '../services/git.js';
import type { Project } from '@devflow/shared';

export const projectsRouter = new Hono();

function parseProject(row: Record<string, unknown>): Project {
  return {
    name: row.name as string,
    path: row.path as string,
    lang: (row.lang as string | null) ?? null,
    branch: (row.branch as string) ?? 'master',
    branchPrefix: (row.branch_prefix as string | null) ?? null,
    mergeStrategy: (row.merge_strategy as 'merge' | 'squash' | 'rebase') ?? 'merge',
    autoPush: row.auto_push === 1,
    services: JSON.parse((row.services as string) ?? '[]'),
    jenkinsTemplateId: (row.jenkins_template_id as string | null) ?? null,
    dataSourceId: (row.data_source_id as string | null) ?? null,
    logDirTemplate: (row.log_dir_template as string | null) ?? null,
    logGlobTemplate: (row.log_glob_template as string | null) ?? null,
    rootDir: (row.root_dir as string | null) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
  };
}

// GET /projects
projectsRouter.get('/', (c) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, name ASC').all() as Array<Record<string, unknown>>;
  return c.json(rows.map(parseProject));
});

// POST /projects/scan
const ScanSchema = z.object({ root: z.union([z.string(), z.array(z.string())]) });

projectsRouter.post('/scan', async (c) => {
  const body = ScanSchema.parse(await c.req.json());
  const roots = Array.isArray(body.root) ? body.root : [body.root];
  const upserted: Project[] = [];

  for (const root of roots) {
    const repos = await gitService.scanDirectory(root);
    for (const repo of repos) {
      const existing = db.prepare('SELECT name FROM projects WHERE name = ?').get(repo.name);
      if (!existing) {
        const maxOrder = (db.prepare('SELECT MAX(sort_order) as m FROM projects').get() as { m: number | null }).m ?? -1;
        db.prepare(
          `INSERT OR IGNORE INTO projects (name, path, lang, branch, services, sort_order)
           VALUES (?, ?, ?, ?, '[]', ?)`
        ).run(repo.name, repo.path, repo.lang, repo.branch, maxOrder + 1);
      } else {
        // update path+lang if changed
        db.prepare('UPDATE projects SET path=?, lang=?, branch=? WHERE name=?')
          .run(repo.path, repo.lang, repo.branch, repo.name);
      }
      const row = db.prepare('SELECT * FROM projects WHERE name = ?').get(repo.name) as Record<string, unknown>;
      upserted.push(parseProject(row));
    }
  }

  return c.json({ scanned: upserted.length, projects: upserted });
});

// POST /projects/reorder
projectsRouter.post('/reorder', async (c) => {
  const { names } = z.object({ names: z.array(z.string()) }).parse(await c.req.json());
  const stmt = db.prepare('UPDATE projects SET sort_order=? WHERE name=?');
  names.forEach((name, idx) => stmt.run(idx, name));
  return c.json({ ok: true });
});

// PATCH /projects/:name
const PatchProjectSchema = z.object({
  lang: z.string().nullable().optional(),
  branch: z.string().optional(),
  branchPrefix: z.string().nullable().optional(),
  mergeStrategy: z.enum(['merge', 'squash', 'rebase']).optional(),
  autoPush: z.boolean().optional(),
  services: z.array(z.string()).optional(),
  jenkinsTemplateId: z.string().nullable().optional(),
  dataSourceId: z.string().nullable().optional(),
  logDirTemplate: z.string().nullable().optional(),
  logGlobTemplate: z.string().nullable().optional(),
});

projectsRouter.patch('/:name', async (c) => {
  const name = c.req.param('name');
  const row = db.prepare('SELECT * FROM projects WHERE name = ?').get(name);
  if (!row) return c.json({ error: 'not found' }, 404);

  const data = PatchProjectSchema.parse(await c.req.json());
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.lang !== undefined) { updates.push('lang=?'); params.push(data.lang); }
  if (data.branch !== undefined) { updates.push('branch=?'); params.push(data.branch); }
  if (data.branchPrefix !== undefined) { updates.push('branch_prefix=?'); params.push(data.branchPrefix); }
  if (data.mergeStrategy !== undefined) { updates.push('merge_strategy=?'); params.push(data.mergeStrategy); }
  if (data.autoPush !== undefined) { updates.push('auto_push=?'); params.push(data.autoPush ? 1 : 0); }
  if (data.services !== undefined) { updates.push('services=?'); params.push(JSON.stringify(data.services)); }
  if (data.jenkinsTemplateId !== undefined) { updates.push('jenkins_template_id=?'); params.push(data.jenkinsTemplateId); }

  if (updates.length > 0) {
    params.push(name);
    db.prepare(`UPDATE projects SET ${updates.join(',')} WHERE name=?`).run(...params);
  }
  const updated = db.prepare('SELECT * FROM projects WHERE name=?').get(name) as Record<string, unknown>;
  return c.json(parseProject(updated));
});
