import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { createAgentProcess } from '../agents/SessionManager.js';
import { resolveDefaultAgent } from '../agents/resolveDefaultAgent.js';
import { runAgentUntilDone } from '../agents/agentRunner.js';
import { notificationDispatcher } from '../services/notificationDispatcher.js';
import type { NormalizedEntry } from '@devflow/shared';

export const specsRouter = new Hono();

// Resolve the primary project working directory for a requirement
function resolveProjectCwd(reqId: string): string | undefined {
  const row = db.prepare(
    `SELECT p.path FROM projects p
     JOIN requirement_projects rp ON p.name = rp.project
     WHERE rp.req_id = ? AND rp.is_primary = 1
     LIMIT 1`
  ).get(reqId) as { path: string } | undefined;
  return row?.path;
}

// Build requirement prompt from DB
function buildRequirementPrompt(reqId: string, cwd?: string): string {
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

  if (cwd) {
    prompt += `\n## Working Directory\n`;
    prompt += `You are working in the project repository located at: \`${cwd}\`.\n`;
    prompt += `All file paths and git commands are relative to this directory unless specified otherwise.\n`;
  }

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
function buildDesignPrompt(reqId: string, reqDocId?: string, cwd?: string): string {
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
  if (cwd) {
    prompt += `## Working Directory\n`;
    prompt += `You are working in the project repository located at: \`${cwd}\`.\n`;
    prompt += `All file paths and git commands are relative to this directory unless specified otherwise.\n\n`;
  }
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
  agent: z.string().optional(),
  contextRefs: z.array(z.object({ type: z.enum(['requirement', 'attachment']), id: z.string() })).optional().default([]),
});

specsRouter.post('/requirement/generate', async (c) => {
  const body = ReqGenSchema.parse(await c.req.json());

  const req = db.prepare('SELECT title FROM requirements WHERE id=?').get(body.reqId) as { title: string } | undefined;
  if (!req) return c.json({ error: 'requirement not found' }, 404);

  return streamSSE(c, async (stream) => {
    const sessionId = newId('ses');
    const agent = body.agent ?? resolveDefaultAgent();
    const cwd = resolveProjectCwd(body.reqId);
    const session = createAgentProcess(agent, sessionId, cwd);
    const prompt = buildRequirementPrompt(body.reqId, cwd);
    const { collected, errorMsg } = await runAgentUntilDone(session, prompt, {
      onEntry: (entry) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'entry', entry }) });
      },
      onPatch: (entryId, patch) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'patch', entryId, patch }) });
      },
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
    } else {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: '生成内容为空，请检查 AI 配置或模型可用性' }) });
    }
  });
});

// POST /specs/design/generate — SSE
const DesignGenSchema = z.object({
  reqId: z.string(),
  agent: z.string().optional(),
  reqDocId: z.string().optional(),
});

specsRouter.post('/design/generate', async (c) => {
  const body = DesignGenSchema.parse(await c.req.json());

  const req = db.prepare('SELECT title FROM requirements WHERE id=?').get(body.reqId) as { title: string } | undefined;
  if (!req) return c.json({ error: 'requirement not found' }, 404);

  return streamSSE(c, async (stream) => {
    const sessionId = newId('ses');
    const agent = body.agent ?? resolveDefaultAgent();
    const cwd = resolveProjectCwd(body.reqId);
    const session = createAgentProcess(agent, sessionId, cwd);
    const prompt = buildDesignPrompt(body.reqId, body.reqDocId, cwd);
    const { collected, errorMsg } = await runAgentUntilDone(session, prompt, {
      onEntry: (entry) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'entry', entry }) });
      },
      onPatch: (entryId, patch) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'patch', entryId, patch }) });
      },
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
    } else {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: '生成内容为空，请检查 AI 配置或模型可用性' }) });
    }
  });
});
