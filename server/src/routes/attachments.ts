import { Hono } from 'hono';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { resolve, join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Attachment } from '@devflow/shared';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');
const ATTACHMENTS_DIR = resolve(DATA_DIR, 'attachments');
mkdirSync(ATTACHMENTS_DIR, { recursive: true });

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.docx', '.xlsx', '.md', '.txt', '.zip']);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export const attachmentsRouter = new Hono();

function parseAttachment(row: Record<string, unknown>): Attachment {
  return {
    id: row.id as string,
    reqId: row.req_id as string,
    filename: row.filename as string,
    mime: (row.mime as string | null) ?? null,
    size: (row.size as number) ?? 0,
    sha256: (row.sha256 as string | null) ?? null,
    uploadedBy: (row.uploaded_by as string | null) ?? null,
    storagePath: row.storage_path as string,
    createdAt: row.created_at as string,
  };
}

function storagePath(reqId: string, filename: string): string {
  return join(reqId, filename);
}

function fullPath(storagePath: string): string {
  return join(ATTACHMENTS_DIR, storagePath);
}

// GET /attachments?reqId=
attachmentsRouter.get('/', (c) => {
  const reqId = c.req.query('reqId');
  if (!reqId) return c.json({ error: 'reqId required' }, 400);

  const rows = db.prepare('SELECT * FROM attachments WHERE req_id=? ORDER BY created_at DESC')
    .all(reqId) as Array<Record<string, unknown>>;
  return c.json(rows.map(parseAttachment));
});

// GET /attachments/:id
attachmentsRouter.get('/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM attachments WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseAttachment(row));
});

// POST /attachments?reqId= multipart upload
attachmentsRouter.post('/', async (c) => {
  const reqId = c.req.query('reqId');
  if (!reqId) return c.json({ error: 'reqId required' }, 400);

  const reqRow = db.prepare('SELECT id FROM requirements WHERE id=?').get(reqId);
  if (!reqRow) return c.json({ error: 'requirement not found' }, 404);

  const body = await c.req.parseBody({ all: true });
  const files = body.file;
  if (!files) return c.json({ error: 'no file' }, 400);

  const fileList = Array.isArray(files) ? files : [files];
  const uploaded: Attachment[] = [];
  const errors: string[] = [];

  for (const file of fileList) {
    if (!(file instanceof File)) continue;

    const ext = extname(file.name).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      errors.push(`Rejected ${file.name}: extension not allowed`);
      continue;
    }

    if (file.size > MAX_FILE_SIZE) {
      errors.push(`Rejected ${file.name}: exceeds 25MB`);
      continue;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${Date.now()}_${safeName}`;
    const sPath = storagePath(reqId, uniqueName);
    const dest = fullPath(sPath);

    mkdirSync(join(ATTACHMENTS_DIR, reqId), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(dest, buffer);

    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const id = newId('att');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO attachments (id, req_id, filename, mime, size, sha256, uploaded_by, storage_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, reqId, file.name, file.type || null, file.size, sha256, null, sPath, now);

    const row = db.prepare('SELECT * FROM attachments WHERE id=?').get(id) as Record<string, unknown>;
    uploaded.push(parseAttachment(row));
  }

  return c.json({ uploaded, errors, count: uploaded.length });
});

// GET /attachments/:id/raw — stream download with Range support
attachmentsRouter.get('/:id/raw', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM attachments WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const path = fullPath(row.storage_path as string);
  if (!existsSync(path)) return c.json({ error: 'file missing on disk' }, 404);

  const stat = statSync(path);
  const mime = (row.mime as string) || 'application/octet-stream';
  const filename = (row.filename as string) || 'download';

  const rangeHeader = c.req.header('range');
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (start >= 0 && end < stat.size && start <= end) {
        const stream = createReadStream(path, { start, end });
        c.header('Content-Type', mime);
        c.header('Content-Disposition', `inline; filename="${filename}"`);
        c.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        c.header('Accept-Ranges', 'bytes');
        c.status(206);
        return c.body(Readable.toWeb(stream) as ReadableStream<Uint8Array>);
      }
    }
  }

  const stream = createReadStream(path);
  c.header('Content-Type', mime);
  c.header('Content-Disposition', `inline; filename="${filename}"`);
  c.header('Accept-Ranges', 'bytes');
  c.header('Content-Length', String(stat.size));
  return c.body(Readable.toWeb(stream) as ReadableStream<Uint8Array>);
});

// DELETE /attachments/:id
attachmentsRouter.delete('/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT storage_path FROM attachments WHERE id=?').get(id) as { storage_path: string } | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  const path = fullPath(row.storage_path);
  if (existsSync(path)) unlinkSync(path);

  db.prepare('DELETE FROM attachments WHERE id=?').run(id);
  return c.json({ ok: true });
});
