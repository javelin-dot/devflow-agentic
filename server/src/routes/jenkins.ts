import { Hono } from 'hono';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import type { JenkinsTemplate } from '@devflow/shared';

export const jenkinsRouter = new Hono();

function parseTemplate(row: Record<string, unknown>): JenkinsTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    job: row.job as string,
    params: row.params ? JSON.parse(row.params as string) : {},
    jenkinsUrl: row.jenkins_url as string,
    createdAt: row.created_at as string,
  };
}

const CreateSchema = z.object({
  name: z.string(),
  job: z.string(),
  params: z.record(z.string()).optional(),
  jenkinsUrl: z.string().optional(),
});

const PatchSchema = z.object({
  name: z.string().optional(),
  job: z.string().optional(),
  params: z.record(z.string()).optional(),
  jenkinsUrl: z.string().optional(),
});

const TriggerSchema = z.object({
  vars: z.record(z.string()).optional(),
});

// GET /jenkins-templates
jenkinsRouter.get('/', (c) => {
  const rows = db.prepare('SELECT * FROM jenkins_templates ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return c.json(rows.map(parseTemplate));
});

// GET /jenkins-templates/:id
jenkinsRouter.get('/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM jenkins_templates WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseTemplate(row));
});

// POST /jenkins-templates
jenkinsRouter.post('/', async (c) => {
  const body = CreateSchema.parse(await c.req.json());
  const id = newId('jt');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO jenkins_templates (id, name, job, params, jenkins_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.name,
    body.job,
    JSON.stringify(body.params ?? {}),
    body.jenkinsUrl ?? 'http://localhost:8080',
    now
  );
  const row = db.prepare('SELECT * FROM jenkins_templates WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseTemplate(row), 201);
});

// PATCH /jenkins-templates/:id
jenkinsRouter.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const body = PatchSchema.parse(await c.req.json());
  const row = db.prepare('SELECT * FROM jenkins_templates WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  if (body.name !== undefined) db.prepare('UPDATE jenkins_templates SET name=? WHERE id=?').run(body.name, id);
  if (body.job !== undefined) db.prepare('UPDATE jenkins_templates SET job=? WHERE id=?').run(body.job, id);
  if (body.params !== undefined) db.prepare('UPDATE jenkins_templates SET params=? WHERE id=?').run(JSON.stringify(body.params), id);
  if (body.jenkinsUrl !== undefined) db.prepare('UPDATE jenkins_templates SET jenkins_url=? WHERE id=?').run(body.jenkinsUrl, id);

  const updated = db.prepare('SELECT * FROM jenkins_templates WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseTemplate(updated));
});

// DELETE /jenkins-templates/:id
jenkinsRouter.delete('/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM jenkins_templates WHERE id=?').run(id);
  return c.json({ ok: true });
});

// POST /jenkins-templates/:id/trigger
jenkinsRouter.post('/:id/trigger', async (c) => {
  const { id } = c.req.param();
  const body = TriggerSchema.parse(await c.req.json());
  const row = db.prepare('SELECT * FROM jenkins_templates WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const template = parseTemplate(row);
  const vars = body.vars ?? {};

  // Substitute variables in params
  const substitutedParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(template.params)) {
    substitutedParams[key] = value
      .replace(/\{branch\}/g, vars.branch ?? '')
      .replace(/\{service\}/g, vars.service ?? '')
      .replace(/\{version\}/g, vars.version ?? '')
      .replace(/\{env\}/g, vars.env ?? '');
  }

  const buildUrl = `${template.jenkinsUrl}/job/${template.job}/lastBuild`;
  const triggerUrl = `${template.jenkinsUrl}/job/${template.job}/build`;

  try {
    const formData = new URLSearchParams();
    for (const [k, v] of Object.entries(substitutedParams)) {
      formData.append(k, v);
    }

    await fetch(triggerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    return c.json({ status: 'triggered', buildUrl });
  } catch (err) {
    const message = (err as Error).message;
    return c.json({ status: 'error', message });
  }
});
