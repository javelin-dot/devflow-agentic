import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { ClaudeAPISession } from '../agents/ClaudeAPISession.js';
import { notificationDispatcher } from '../services/notificationDispatcher.js';
import type { NormalizedEntry } from '@devflow/shared';

export const specsRouter = new Hono();

// Build requirement prompt from DB
function buildRequirementPrompt(reqId: string): string {
  const req = db.prepare('SELECT * FROM requirements WHERE id=?').get(reqId) as Record<string, unknown> | undefined;
  if (!req) throw new Error('requirement not found');

  const projects = db.prepare('SELECT * FROM requirement_projects WHERE req_id=?').all(reqId) as Array<Record<string, unknown>>;
  const attachments = db.prepare('SELECT * FROM attachments WHERE req_id=?').all(reqId) as Array<Record<string, unknown>>;

  let prompt = `# Requirement Spec Generation Task\n\n`;
  prompt += `## Source Requirement\n`;
  prompt += `- Title: ${req.title}\n`;
  prompt += `- Description: ${req.description ?? ''}\n`;
  prompt += `- Kind: ${req.kind}\n`;
  prompt += `- Priority: ${req.priority}\n`;

  if (projects.length > 0) {
    prompt += `\n## Associated Projects\n`;
    for (const p of projects) {
      prompt += `- ${p.project as string}\n`;
    }
  }

  if (attachments.length > 0) {
    prompt += `\n## Context Attachments\n`;
    for (const a of attachments) {
      prompt += `- ${a.filename as string} (size: ${a.size as number} bytes)\n`;
    }
  }

  prompt += `\n## Instructions\n`;
  prompt += `Generate a structured Requirement Spec (PRD) in Markdown format with the following sections:\n`;
  prompt += `1. Background\n`;
  prompt += `2. Target Users\n`;
  prompt += `3. Core Value\n`;
  prompt += `4. User Stories\n`;
  prompt += `5. Feature List (with interaction logic and boundary conditions)\n`;
  prompt += `6. Non-functional Requirements\n`;
  prompt += `7. Acceptance Criteria\n`;
  prompt += `8. Risks and Dependencies\n`;
  prompt += `9. Related Requirements\n\n`;
  prompt += `Output ONLY the Markdown document content, without any additional explanation.\n`;

  return prompt;
}

// Build design spec prompt from requirement document
function buildDesignPrompt(reqId: string, reqDocId?: string): string {
  const req = db.prepare('SELECT * FROM requirements WHERE id=?').get(reqId) as Record<string, unknown> | undefined;
  if (!req) throw new Error('requirement not found');

  let reqContent = '';
  if (reqDocId) {
    const doc = db.prepare('SELECT content FROM documents WHERE id=?').get(reqDocId) as { content: string } | undefined;
    if (doc) reqContent = doc.content;
  }
  if (!reqContent) {
    reqContent = `${req.title}\n${req.description ?? ''}`;
  }

  let prompt = `# Design Spec Generation Task\n\n`;
  prompt += `## Source Requirement\n${reqContent}\n\n`;
  prompt += `## Instructions\n`;
  prompt += `Generate a structured Development Design Spec in Markdown format with the following sections:\n`;
  prompt += `1. Business Flow (describe in Mermaid diagram syntax within a \`\`\`mermaid code block)\n`;
  prompt += `2. API Design (method, path, request/response schema, error codes as a table)\n`;
  prompt += `3. Data Models (tables, columns, types, indexes, foreign keys as a table)\n`;
  prompt += `4. Risk and Compatibility\n`;
  prompt += `5. Rollback Plan\n\n`;
  prompt += `Output ONLY the Markdown document content, without any additional explanation.\n`;

  return prompt;
}

// Save generated spec to documents table
function saveDocument(
  reqId: string,
  type: 'requirement_spec' | 'design_spec',
  title: string,
  content: string
): { id: string; version: number } {
  const existing = db.prepare('SELECT id FROM documents WHERE req_id=? AND type=? AND deleted_at IS NULL')
    .get(reqId, type) as { id: string } | undefined;

  const now = new Date().toISOString();

  if (existing) {
    // Update existing document with new version
    const doc = db.prepare('SELECT current_version FROM documents WHERE id=?').get(existing.id) as { current_version: number };
    const newVersion = (doc.current_version ?? 0) + 1;

    db.prepare('UPDATE documents SET title=?, content=?, status=?, current_version=?, updated_at=? WHERE id=?')
      .run(title, content, 'draft', newVersion, now, existing.id);

    const vId = newId('dvr');
    db.prepare(
      `INSERT INTO document_versions (id, doc_id, version, content, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(vId, existing.id, newVersion, content, `AI generated version ${newVersion}`, now);

    return { id: existing.id, version: newVersion };
  } else {
    // Create new document
    const id = newId('doc');
    db.prepare(
      `INSERT INTO documents (id, req_id, type, title, content, status, current_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, reqId, type, title, content, 'draft', 1, now, now);

    const vId = newId('dvr');
    db.prepare(
      `INSERT INTO document_versions (id, doc_id, version, content, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(vId, id, 1, content, 'AI generated initial version', now);

    return { id, version: 1 };
  }
}

// POST /specs/requirement/generate — SSE
const ReqGenSchema = z.object({
  reqId: z.string(),
  agent: z.string().optional().default('claude-api'),
  contextRefs: z.array(z.object({ type: z.enum(['requirement', 'attachment']), id: z.string() })).optional().default([]),
});

specsRouter.post('/requirement/generate', async (c) => {
  const body = ReqGenSchema.parse(await c.req.json());

  const req = db.prepare('SELECT title FROM requirements WHERE id=?').get(body.reqId) as { title: string } | undefined;
  if (!req) return c.json({ error: 'requirement not found' }, 404);

  return streamSSE(c, async (stream) => {
    const sessionId = newId('ses');
    const session = new ClaudeAPISession(sessionId, {});

    const collected: string[] = [];
    let done = false;
    let errorMsg = '';

    session.on('entry', (entry: NormalizedEntry) => {
      void stream.writeSSE({ data: JSON.stringify({ type: 'entry', entry }) });
      if (entry.type === 'assistant_message') {
        collected.push(entry.content);
      }
    });

    session.on('patch', (entryId: string, patch: Partial<NormalizedEntry>) => {
      void stream.writeSSE({ data: JSON.stringify({ type: 'patch', entryId, patch }) });
    });

    session.on('exit', (code: number | null) => {
      done = true;
      if (code !== 0) errorMsg = 'Agent exited with error';
    });

    session.on('error', (err: Error) => {
      done = true;
      errorMsg = err.message;
    });

    const prompt = buildRequirementPrompt(body.reqId);
    session.send(prompt);

    // Wait for completion
    await new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        if (done) { clearInterval(iv); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(iv); done = true; resolve(); }, 10 * 60 * 1000);
    });

    if (!errorMsg && collected.length > 0) {
      const content = collected.join('');
      const result = saveDocument(body.reqId, 'requirement_spec', `${req.title} — Requirement Spec`, content);

      await stream.writeSSE({ data: JSON.stringify({ type: 'done', documentId: result.id, version: result.version }) });

      // Trigger notification
      notificationDispatcher.dispatch('document.pending_approval', {
        reqId: body.reqId,
        documentId: result.id,
        type: 'requirement_spec',
        title: req.title,
      });
    } else if (errorMsg) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: errorMsg }) });
    }
  });
});

// POST /specs/design/generate — SSE
const DesignGenSchema = z.object({
  reqId: z.string(),
  agent: z.string().optional().default('claude-api'),
  reqDocId: z.string().optional(),
});

specsRouter.post('/design/generate', async (c) => {
  const body = DesignGenSchema.parse(await c.req.json());

  const req = db.prepare('SELECT title FROM requirements WHERE id=?').get(body.reqId) as { title: string } | undefined;
  if (!req) return c.json({ error: 'requirement not found' }, 404);

  return streamSSE(c, async (stream) => {
    const sessionId = newId('ses');
    const session = new ClaudeAPISession(sessionId, {});

    const collected: string[] = [];
    let done = false;
    let errorMsg = '';

    session.on('entry', (entry: NormalizedEntry) => {
      void stream.writeSSE({ data: JSON.stringify({ type: 'entry', entry }) });
      if (entry.type === 'assistant_message') {
        collected.push(entry.content);
      }
    });

    session.on('patch', (entryId: string, patch: Partial<NormalizedEntry>) => {
      void stream.writeSSE({ data: JSON.stringify({ type: 'patch', entryId, patch }) });
    });

    session.on('exit', (code: number | null) => {
      done = true;
      if (code !== 0) errorMsg = 'Agent exited with error';
    });

    session.on('error', (err: Error) => {
      done = true;
      errorMsg = err.message;
    });

    const prompt = buildDesignPrompt(body.reqId, body.reqDocId);
    session.send(prompt);

    // Wait for completion
    await new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        if (done) { clearInterval(iv); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(iv); done = true; resolve(); }, 10 * 60 * 1000);
    });

    if (!errorMsg && collected.length > 0) {
      const content = collected.join('');
      const result = saveDocument(body.reqId, 'design_spec', `${req.title} — Design Spec`, content);

      await stream.writeSSE({ data: JSON.stringify({ type: 'done', documentId: result.id, version: result.version }) });

      // Create document link from design to requirement spec if reqDocId provided
      if (body.reqDocId) {
        try {
          db.prepare(
            'INSERT INTO document_links (from_doc_id, to_doc_id, relation, created_at) VALUES (?, ?, ?, ?)'
          ).run(result.id, body.reqDocId, 'derives_from', new Date().toISOString());
        } catch { /* ignore duplicate link */ }
      }

      // Trigger notification
      notificationDispatcher.dispatch('document.pending_approval', {
        reqId: body.reqId,
        documentId: result.id,
        type: 'design_spec',
        title: req.title,
      });
    } else if (errorMsg) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: errorMsg }) });
    }
  });
});
