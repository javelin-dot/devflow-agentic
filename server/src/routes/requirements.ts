import { Hono } from 'hono';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { canTransition, SPEC_EDIT_STAGES, type Stage } from '@devflow/shared';
import { qualityGateService, checkTransitionSync } from '../services/qualityGate.js';
import { rbacGuard } from '../middleware/auth.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const UPLOAD_DIR = resolve(__dirname, '../../uploads');

export const requirementsRouter = new Hono();

// Helper: parse a requirement row into API shape
function parseReq(row: Record<string, unknown>) {
  const projects = db
    .prepare('SELECT * FROM requirement_projects WHERE req_id = ?')
    .all(row.id as string) as Array<Record<string, unknown>>;

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    kind: row.kind,
    stage: row.stage,
    priority: row.priority,
    workspace: row.workspace ?? null,
    tags: JSON.parse((row.tags as string) ?? '[]'),
    plannedReleaseDate: row.planned_release_date ?? null,
    releasedAt: row.released_at ?? null,
    archivedAt: row.archived_at ?? null,
    analysisChosenId: row.analysis_chosen_id ?? null,
    profileId: row.profile_id ?? null,
    notes: row.notes ?? null,
    apiDoc: row.api_doc ? JSON.parse(row.api_doc as string) : null,
    releaseDoc: row.release_doc ? JSON.parse(row.release_doc as string) : null,
    attachments: row.attachments ? (JSON.parse(row.attachments as string) as string[]) : [],
    createdAt: row.created_at,
    projects: projects.map((p) => ({
      project: p.project,
      devBranch: p.dev_branch ?? null,
      uatBranch: p.uat_branch ?? null,
      isPrimary: p.is_primary === 1,
    })),
  };
}

// GET /requirements
requirementsRouter.get('/', (c) => {
  const { stage, priority, archived } = c.req.query();

  let sql = 'SELECT * FROM requirements WHERE 1=1';
  const params: unknown[] = [];

  if (stage) {
    sql += ' AND stage = ?';
    params.push(stage);
  }
  if (priority) {
    sql += ' AND priority = ?';
    params.push(priority);
  }
  if (archived === '1') {
    sql += ' AND archived_at IS NOT NULL';
  } else {
    sql += ' AND archived_at IS NULL';
  }

  sql += ' ORDER BY created_at DESC';

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return c.json(rows.map(parseReq));
});

// POST /requirements
const CreateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(''),
  kind: z.enum(['standard', 'no_code']).optional().default('standard'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('medium'),
  workspace: z.string().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  plannedReleaseDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  projects: z
    .array(
      z.object({
        project: z.string(),
        devBranch: z.string().nullable().optional(),
        uatBranch: z.string().nullable().optional(),
        isPrimary: z.boolean().optional().default(false),
      })
    )
    .optional()
    .default([]),
});

requirementsRouter.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;


  const id = newId('req');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO requirements (id, title, description, kind, stage, priority, workspace, tags, planned_release_date, notes, created_at)
     VALUES (?, ?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.title,
    data.description,
    data.kind,
    data.priority,
    data.workspace ?? null,
    JSON.stringify(data.tags),
    data.plannedReleaseDate ?? null,
    data.notes ?? null,
    now
  );

  for (const p of data.projects) {
    db.prepare(
      `INSERT INTO requirement_projects (req_id, project, dev_branch, uat_branch, is_primary) VALUES (?, ?, ?, ?, ?)`
    ).run(id, p.project, p.devBranch ?? null, p.uatBranch ?? null, p.isPrimary ? 1 : 0);
  }

  const row = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as Record<string, unknown>;
  return c.json(parseReq(row), 201);
});

// GET /requirements/:id
requirementsRouter.get('/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseReq(row));
});

// PATCH /requirements/:id
const PatchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  kind: z.enum(['standard', 'no_code']).optional(),
  stage: z.enum(['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  workspace: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  plannedReleaseDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  projects: z
    .array(
      z.object({
        project: z.string(),
        devBranch: z.string().nullable().optional(),
        uatBranch: z.string().nullable().optional(),
        isPrimary: z.boolean().optional().default(false),
      })
    )
    .optional(),
});

requirementsRouter.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const body = await c.req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;
  const currentStage = row.stage as Stage;
  const actor = c.req.header('X-Actor') ?? 'system';

  // 1. Stage transition validation
  if (data.stage && data.stage !== currentStage) {
    if (!canTransition(currentStage, data.stage)) {
      return c.json(
        { error: `Cannot transition from ${currentStage} to ${data.stage}` },
        400
      );
    }

    // 1b. Quality gate check for transitions that require it
    const gate = checkTransitionSync(id, currentStage, data.stage);
    if (!gate.passed) {
      return c.json({
        error: 'Quality gate check failed',
        gateChecks: gate.checks,
      }, 403);
    }
  }

  // 2. prerelease requires plannedReleaseDate
  const targetStage = data.stage ?? currentStage;
  const plannedDate =
    data.plannedReleaseDate !== undefined ? data.plannedReleaseDate : (row.planned_release_date as string | null);
  if (targetStage === 'prerelease' && !plannedDate) {
    return c.json({ error: 'plannedReleaseDate is required when stage is prerelease' }, 400);
  }

  // 3. SPEC_EDIT_STAGES: description/kind/projects only editable in backlog/analyzing
  if (
    (data.description !== undefined || data.kind !== undefined || data.projects !== undefined) &&
    !SPEC_EDIT_STAGES.includes(currentStage)
  ) {
    return c.json(
      { error: `description/kind/projects can only be edited in stages: ${SPEC_EDIT_STAGES.join(', ')}` },
      400
    );
  }

  // Build update
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.title !== undefined) { updates.push('title = ?'); params.push(data.title); }
  if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
  if (data.kind !== undefined) { updates.push('kind = ?'); params.push(data.kind); }
  if (data.stage !== undefined) { updates.push('stage = ?'); params.push(data.stage); }
  if (data.priority !== undefined) { updates.push('priority = ?'); params.push(data.priority); }
  if (data.workspace !== undefined) { updates.push('workspace = ?'); params.push(data.workspace); }
  if (data.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(data.tags)); }
  if (data.plannedReleaseDate !== undefined) { updates.push('planned_release_date = ?'); params.push(data.plannedReleaseDate); }
  if (data.notes !== undefined) { updates.push('notes = ?'); params.push(data.notes); }

  // 5. stage=released → set released_at
  if (data.stage === 'released') {
    updates.push('released_at = ?');
    params.push(new Date().toISOString());
  }

  if (updates.length > 0) {
    params.push(id);
    db.prepare(`UPDATE requirements SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  // Update projects if provided
  if (data.projects !== undefined) {
    db.prepare('DELETE FROM requirement_projects WHERE req_id = ?').run(id);
    for (const p of data.projects) {
      db.prepare(
        `INSERT INTO requirement_projects (req_id, project, dev_branch, uat_branch, is_primary) VALUES (?, ?, ?, ?, ?)`
      ).run(id, p.project, p.devBranch ?? null, p.uatBranch ?? null, p.isPrimary ? 1 : 0);
    }
  }

  // 4. Write stage_change event
  if (data.stage && data.stage !== currentStage) {
    const eventId = newId('evt');
    db.prepare(
      `INSERT INTO events (id, req_id, type, payload, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      eventId,
      id,
      'stage_change',
      JSON.stringify({ from: currentStage, to: data.stage }),
      actor,
      new Date().toISOString()
    );
  }

  const updated = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as Record<string, unknown>;
  return c.json(parseReq(updated));
});

// POST /requirements/:id/unarchive
requirementsRouter.post('/:id/unarchive', rbacGuard('admin'), (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  db.prepare('UPDATE requirements SET archived_at = NULL WHERE id = ?').run(id);
  const updated = db.prepare('SELECT * FROM requirements WHERE id = ?').get(id) as Record<string, unknown>;
  return c.json(parseReq(updated));
});

// DELETE /requirements/:id
requirementsRouter.delete('/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT id FROM requirements WHERE id = ?').get(id);
  if (!row) return c.json({ error: 'not found' }, 404);
  db.prepare('DELETE FROM requirements WHERE id = ?').run(id);
  // Clean up uploaded files
  const reqDir = join(UPLOAD_DIR, 'requirements', id);
  if (existsSync(reqDir)) {
    for (const f of readdirSync(reqDir)) {
      unlinkSync(join(reqDir, f));
    }
  }
  return c.json({ success: true });
});

// ===== Attachments =====

function getReqAttachments(reqId: string): string[] {
  const row = db.prepare('SELECT attachments FROM requirements WHERE id=?').get(reqId) as { attachments: string } | undefined;
  if (!row) return [];
  try { return JSON.parse(row.attachments) as string[]; } catch { return []; }
}

function setReqAttachments(reqId: string, attachments: string[]): void {
  db.prepare('UPDATE requirements SET attachments=? WHERE id=?').run(JSON.stringify(attachments), reqId);
}

function reqUploadDir(reqId: string): string {
  const dir = join(UPLOAD_DIR, 'requirements', reqId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// POST /requirements/:id/attachments — upload file(s)
requirementsRouter.post('/:id/attachments', async (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT id FROM requirements WHERE id=?').get(id);
  if (!row) return c.json({ error: 'not found' }, 404);

  const body = await c.req.parseBody({ all: true });
  const files = body.file;
  if (!files) return c.json({ error: 'no file' }, 400);

  const uploaded: string[] = [];
  const fileList = Array.isArray(files) ? files : [files];
  const dir = reqUploadDir(id);
  const existing = getReqAttachments(id);

  for (const file of fileList) {
    if (!(file instanceof File)) continue;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${Date.now()}_${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(join(dir, uniqueName), buffer);
    uploaded.push(uniqueName);
  }

  setReqAttachments(id, [...existing, ...uploaded]);
  return c.json({ ok: true, uploaded });
});

// GET /requirements/:id/attachments — list files
requirementsRouter.get('/:id/attachments', (c) => {
  const { id } = c.req.param();
  const list = getReqAttachments(id);
  const dir = join(UPLOAD_DIR, 'requirements', id);
  const files = list.map(name => {
    const path = join(dir, name);
    return { name, size: existsSync(path) ? readFileSync(path).length : 0 };
  });
  return c.json({ files });
});

// GET /requirements/:id/attachments/:filename — download file
requirementsRouter.get('/:id/attachments/:filename', (c) => {
  const { id, filename } = c.req.param();
  const list = getReqAttachments(id);
  if (!list.includes(filename)) return c.json({ error: 'not found' }, 404);
  const path = join(UPLOAD_DIR, 'requirements', id, filename);
  if (!existsSync(path)) return c.json({ error: 'not found' }, 404);
  const buf = readFileSync(path);
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('Content-Type', 'application/octet-stream');
  return c.body(buf);
});

// DELETE /requirements/:id/attachments/:filename
requirementsRouter.delete('/:id/attachments/:filename', (c) => {
  const { id, filename } = c.req.param();
  const list = getReqAttachments(id);
  if (!list.includes(filename)) return c.json({ error: 'not found' }, 404);
  const path = join(UPLOAD_DIR, 'requirements', id, filename);
  if (existsSync(path)) unlinkSync(path);
  setReqAttachments(id, list.filter(f => f !== filename));
  return c.json({ ok: true });
});
