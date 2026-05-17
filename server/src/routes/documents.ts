import { Hono } from 'hono';
import { z } from 'zod';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { db, newId } from '../db/index.js';
import { notificationDispatcher } from '../services/notificationDispatcher.js';
import { rbacGuard } from '../middleware/auth.js';
import type { Document, DocumentVersion, DocumentLink } from '@devflow/shared';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const EXPORTS_DIR = resolve(__dirname, '../../data/exports');
mkdirSync(EXPORTS_DIR, { recursive: true });

export const documentsRouter = new Hono();

function parseDocument(row: Record<string, unknown>): Document {
  return {
    id: row.id as string,
    reqId: (row.req_id as string | null) ?? null,
    type: row.type as Document['type'],
    title: row.title as string,
    content: (row.content as string) ?? '',
    status: (row.status as Document['status']) ?? 'draft',
    currentVersion: (row.current_version as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

function parseVersion(row: Record<string, unknown>): DocumentVersion {
  return {
    id: row.id as string,
    docId: row.doc_id as string,
    version: row.version as number,
    content: (row.content as string) ?? '',
    summary: (row.summary as string | null) ?? null,
    authorId: (row.author_id as string | null) ?? null,
    authorAgent: (row.author_agent as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

// GET /documents?reqId=&type=&status=
documentsRouter.get('/', (c) => {
  const reqId = c.req.query('reqId');
  const type = c.req.query('type');
  const status = c.req.query('status');

  const conditions: string[] = ['deleted_at IS NULL'];
  const params: unknown[] = [];

  if (reqId) { conditions.push('req_id=?'); params.push(reqId); }
  if (type) { conditions.push('type=?'); params.push(type); }
  if (status) { conditions.push('status=?'); params.push(status); }

  const sql = `SELECT * FROM documents WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`;
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return c.json(rows.map(parseDocument));
});

// GET /documents/:id
documentsRouter.get('/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseDocument(row));
});

// POST /documents
const CreateDocSchema = z.object({
  reqId: z.string().nullable().optional(),
  type: z.enum(['requirement_spec', 'design_spec', 'test_case', 'test_report', 'release_doc']),
  title: z.string().min(1),
  content: z.string().default(''),
  status: z.enum(['draft', 'pending_approval', 'approved', 'rejected']).optional(),
});

documentsRouter.post('/', async (c) => {
  const data = CreateDocSchema.parse(await c.req.json());
  const id = newId('doc');
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO documents (id, req_id, type, title, content, status, current_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.reqId ?? null, data.type, data.title, data.content, data.status ?? 'draft', 0, now, now);

  // Create initial version
  const vId = newId('dvr');
  db.prepare(
    `INSERT INTO document_versions (id, doc_id, version, content, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(vId, id, 1, data.content, 'Initial version', now);

  db.prepare('UPDATE documents SET current_version=1 WHERE id=?').run(id);

  const row = db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseDocument(row), 201);
});

// PATCH /documents/:id — auto-versioning on content change
const PatchDocSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  status: z.enum(['draft', 'pending_approval', 'approved', 'rejected', 'archived']).optional(),
});

documentsRouter.patch('/:id', async (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const data = PatchDocSchema.parse(await c.req.json());
  const updates: string[] = [];
  const params: unknown[] = [];
  const now = new Date().toISOString();

  if (data.title !== undefined) { updates.push('title=?'); params.push(data.title); }
  if (data.status !== undefined) { updates.push('status=?'); params.push(data.status); }

  let newVersion = (row.current_version as number) ?? 0;

  if (data.content !== undefined && data.content !== (row.content as string)) {
    updates.push('content=?'); params.push(data.content);
    newVersion = newVersion + 1;
    updates.push('current_version=?'); params.push(newVersion);

    // Save version history
    const vId = newId('dvr');
    db.prepare(
      `INSERT INTO document_versions (id, doc_id, version, content, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(vId, id, newVersion, data.content, `Version ${newVersion}`, now);

    // M6: Trigger notification if document was approved and content changed
    if ((row.status as Document['status']) === 'approved') {
      notificationDispatcher.dispatch('document.changed_after_approval', {
        docId: id,
        reqId: row.req_id as string | null,
        title: row.title as string,
        type: row.type as string,
        newVersion,
      });
    }
  }

  if (updates.length === 0) {
    return c.json(parseDocument(row));
  }

  updates.push('updated_at=?'); params.push(now);
  params.push(id);

  db.prepare(`UPDATE documents SET ${updates.join(',')} WHERE id=?`).run(...params);

  const updated = db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseDocument(updated));
});

// DELETE /documents/:id — soft delete
documentsRouter.delete('/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('UPDATE documents SET deleted_at=? WHERE id=?').run(new Date().toISOString(), id);
  return c.json({ ok: true });
});

// POST /documents/:id/restore
documentsRouter.post('/:id/restore', (c) => {
  const { id } = c.req.param();
  db.prepare('UPDATE documents SET deleted_at=NULL WHERE id=?').run(id);
  const row = db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseDocument(row));
});

// GET /documents/:id/export?format=pdf|docx
documentsRouter.get('/:id/export', async (c) => {
  const { id } = c.req.param();
  const format = c.req.query('format') ?? 'pdf';
  if (!['pdf', 'docx'].includes(format)) {
    return c.json({ error: 'format must be pdf or docx' }, 400);
  }

  const row = db.prepare('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const content = (row.content as string) ?? '';
  const title = (row.title as string) ?? 'document';
  const type = (row.type as string) ?? 'doc';
  const version = (row.current_version as number) ?? 1;
  const reqId = (row.req_id as string) ?? 'unknown';
  const filename = `${reqId}-${type}-v${version}.${format}`;

  if (format === 'pdf') {
    try {
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #333; line-height: 1.6; }
            h1, h2, h3 { color: #111; }
            pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
            code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f0f0f0; }
          </style>
        </head>
        <body>
          ${await marked(content)}
        </body>
        </html>
      `;

      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({ format: 'A4', margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' } });
      await browser.close();

      c.header('Content-Type', 'application/pdf');
      c.header('Content-Disposition', `attachment; filename="${filename}"`);
      return c.body(pdfBuffer as unknown as null);
    } catch (e) {
      console.error('[export pdf]', e);
      return c.json({ error: 'PDF export failed', detail: (e as Error).message }, 503);
    }
  }

  if (format === 'docx') {
    try {
      const { default: markdownDocx, Packer } = await import('markdown-docx');
      const doc = await markdownDocx(content);
      const buffer = await Packer.toBuffer(doc);

      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      c.header('Content-Disposition', `attachment; filename="${filename}"`);
      return c.body(buffer as unknown as null);
    } catch (e) {
      console.error('[export docx]', e);
      return c.json({ error: 'DOCX export failed', detail: (e as Error).message }, 503);
    }
  }

  return c.json({ error: 'unsupported format' }, 400);
});

// GET /documents/:id/versions
documentsRouter.get('/:id/versions', (c) => {
  const { id } = c.req.param();
  const rows = db.prepare('SELECT * FROM document_versions WHERE doc_id=? ORDER BY version DESC')
    .all(id) as Array<Record<string, unknown>>;
  return c.json(rows.map(parseVersion));
});

// GET /documents/:id/diff?from=&to= — returns unified diff as text/plain
documentsRouter.get('/:id/diff', (c) => {
  const { id } = c.req.param();
  const fromVer = Number(c.req.query('from') ?? '0');
  const toVer = Number(c.req.query('to') ?? '0');

  if (fromVer <= 0 || toVer <= 0 || fromVer === toVer) {
    return c.json({ error: 'invalid from/to version' }, 400);
  }

  const fromRow = db.prepare('SELECT content FROM document_versions WHERE doc_id=? AND version=?')
    .get(id, fromVer) as { content: string } | undefined;
  const toRow = db.prepare('SELECT content FROM document_versions WHERE doc_id=? AND version=?')
    .get(id, toVer) as { content: string } | undefined;

  if (!fromRow || !toRow) {
    return c.json({ error: 'version not found' }, 404);
  }

  const diff = makeUnifiedDiff(fromRow.content, toRow.content, `v${fromVer}`, `v${toVer}`);
  c.header('Content-Type', 'text/plain; charset=utf-8');
  return c.body(diff);
});

// POST /documents/:id/approve | /reject
function assertStatusTransition(current: Document['status'], next: Document['status']): boolean {
  const allowed: Record<string, string[]> = {
    draft: ['pending_approval', 'archived'],
    pending_approval: ['approved', 'rejected', 'draft'],
    approved: ['draft', 'archived'],
    rejected: ['draft', 'archived'],
    archived: ['draft'],
  };
  return allowed[current]?.includes(next) ?? false;
}

documentsRouter.post('/:id/approve', rbacGuard('pm', 'admin'), async (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const current = (row.status as Document['status']) ?? 'draft';
  if (!assertStatusTransition(current, 'approved')) {
    return c.json({ error: `cannot transition from ${current} to approved` }, 409);
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE documents SET status=?, updated_at=? WHERE id=?').run('approved', now, id);

  // M7 T10: design_spec approved → auto-trigger smoke test case generation
  const docRow = db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown>;
  if (docRow.type === 'design_spec' && docRow.req_id) {
    try {
      const resp = await fetch('http://localhost:4000/api/test-cases/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId: docRow.req_id as string, scope: 'smoke', agent: 'claude-api' }),
      });
      if (!resp.ok) {
        console.error('[auto-smoke] trigger failed:', resp.status);
      }
    } catch (e) {
      console.error('[auto-smoke] trigger error:', (e as Error).message);
    }
  }

  const updated = db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseDocument(updated));
});

documentsRouter.post('/:id/reject', rbacGuard('pm', 'admin'), async (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const body = z.object({ reason: z.string().min(1) }).parse(await c.req.json());

  const current = (row.status as Document['status']) ?? 'draft';
  if (!assertStatusTransition(current, 'rejected')) {
    return c.json({ error: `cannot transition from ${current} to rejected` }, 409);
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE documents SET status=?, updated_at=? WHERE id=?').run('rejected', now, id);

  // Store rejection reason in the latest version summary
  const latestVer = db.prepare('SELECT id FROM document_versions WHERE doc_id=? ORDER BY version DESC LIMIT 1')
    .get(id) as { id: string } | undefined;
  if (latestVer) {
    db.prepare('UPDATE document_versions SET summary=? || "\n[REJECTED]: " || ? WHERE id=?')
      .run(latestVer.id, body.reason, latestVer.id);
  }

  const updated = db.prepare('SELECT * FROM documents WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseDocument(updated));
});

// GET /documents/links?reqId= — all links for documents belonging to a requirement
documentsRouter.get('/links', (c) => {
  const reqId = c.req.query('reqId');
  if (!reqId) return c.json({ error: 'reqId required' }, 400);

  const docIds = db.prepare('SELECT id FROM documents WHERE req_id=? AND deleted_at IS NULL').all(reqId) as Array<{ id: string }>;
  const ids = docIds.map(d => d.id);
  if (ids.length === 0) return c.json([]);

  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT from_doc_id, to_doc_id, relation, created_at FROM document_links WHERE from_doc_id IN (${placeholders}) OR to_doc_id IN (${placeholders})`
  ).all(...ids, ...ids) as Array<Record<string, unknown>>;

  const links: DocumentLink[] = rows.map(r => ({
    fromDocId: r.from_doc_id as string,
    toDocId: r.to_doc_id as string,
    relation: r.relation as DocumentLink['relation'],
    createdAt: r.created_at as string,
  }));
  return c.json(links);
});

// GET /documents/:id/links
documentsRouter.get('/:id/links', (c) => {
  const { id } = c.req.param();
  const rows = db.prepare(
    `SELECT from_doc_id, to_doc_id, relation, created_at FROM document_links WHERE from_doc_id=? OR to_doc_id=?`
  ).all(id, id) as Array<Record<string, unknown>>;

  const links: DocumentLink[] = rows.map(r => ({
    fromDocId: r.from_doc_id as string,
    toDocId: r.to_doc_id as string,
    relation: r.relation as DocumentLink['relation'],
    createdAt: r.created_at as string,
  }));
  return c.json(links);
});

// POST /documents/:id/links
const LinkSchema = z.object({
  toDocId: z.string(),
  relation: z.enum(['derives_from', 'tests', 'implements']),
});

documentsRouter.post('/:id/links', async (c) => {
  const { id } = c.req.param();
  const data = LinkSchema.parse(await c.req.json());

  const target = db.prepare('SELECT id FROM documents WHERE id=? AND deleted_at IS NULL').get(data.toDocId);
  if (!target) return c.json({ error: 'target document not found' }, 404);

  try {
    db.prepare(
      `INSERT INTO document_links (from_doc_id, to_doc_id, relation, created_at) VALUES (?, ?, ?, ?)`
    ).run(id, data.toDocId, data.relation, new Date().toISOString());
  } catch {
    return c.json({ error: 'link already exists' }, 409);
  }

  return c.json({ ok: true });
});

// Simple unified diff implementation (no external deps)
function makeUnifiedDiff(oldText: string, newText: string, oldLabel: string, newLabel: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Myers diff (simplified LCS for small docs)
  const lcs = computeLCS(oldLines, newLines);

  let result = `--- ${oldLabel}\n+++ ${newLabel}\n`;
  let i = 0, j = 0;

  for (const op of lcs) {
    if (op.type === 'same') {
      result += ` ${op.line}\n`;
      i++; j++;
    } else if (op.type === 'del') {
      result += `-${op.line}\n`;
      i++;
    } else if (op.type === 'add') {
      result += `+${op.line}\n`;
      j++;
    }
  }

  return result;
}

interface DiffOp {
  type: 'same' | 'del' | 'add';
  line: string;
}

function computeLCS(a: string[], b: string[]): DiffOp[] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', line: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', line: a[i] });
      i++;
    } else {
      ops.push({ type: 'add', line: b[j] });
      j++;
    }
  }
  while (i < m) { ops.push({ type: 'del', line: a[i] }); i++; }
  while (j < n) { ops.push({ type: 'add', line: b[j] }); j++; }

  return ops;
}
