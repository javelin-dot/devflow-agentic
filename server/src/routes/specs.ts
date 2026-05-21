import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, newId } from '../db/index.js';
import { createAgentProcess } from '../agents/SessionManager.js';
import { resolveDefaultAgent } from '../agents/resolveDefaultAgent.js';
import { runAgentUntilDone } from '../agents/agentRunner.js';
import { notificationDispatcher } from '../services/notificationDispatcher.js';
import type { SpecGenerationPrompt } from '../agents/types.js';
import type { NormalizedEntry } from '@devflow/shared';

export const specsRouter = new Hono();

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ATTACHMENTS_DIR = resolve(__dirname, '../../data/attachments');

const TEXT_ATTACHMENT_EXTS = new Set([
  '.md', '.html', '.htm', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.py', '.go',
  '.java', '.xml', '.yaml', '.yml', '.css', '.scss', '.less', '.sql', '.sh', '.vue', '.svelte',
]);
const MAX_ATTACHMENT_BYTES = 100 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 200 * 1024;

function loadTextAttachments(reqId: string): string[] {
  const attachments = db.prepare('SELECT * FROM attachments WHERE req_id=? ORDER BY created_at ASC')
    .all(reqId) as Array<Record<string, unknown>>;
  const blocks: string[] = [];
  let totalBytes = 0;

  for (const a of attachments) {
    const filename = a.filename as string;
    const ext = extname(filename).toLowerCase();
    if (!TEXT_ATTACHMENT_EXTS.has(ext)) continue;

    const size = (a.size as number) ?? 0;
    if (size > MAX_ATTACHMENT_BYTES) continue;
    if (totalBytes + size > MAX_TOTAL_ATTACHMENT_BYTES) break;

    const storagePath = a.storage_path as string;
    const path = join(ATTACHMENTS_DIR, storagePath);
    if (!existsSync(path)) continue;

    try {
      const text = readFileSync(path, 'utf8');
      blocks.push(`<attachment filename="${filename}">\n${text}\n</attachment>`);
      totalBytes += size;
    } catch {
      // skip unreadable files
    }
  }

  return blocks;
}

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

// Resolve latest requirement_spec document for a requirement
function resolveLatestRequirementSpecDoc(reqId: string): { id: string; content: string } | null {
  const row = db.prepare(
    `SELECT id, content FROM documents
     WHERE req_id=? AND type='requirement_spec' AND deleted_at IS NULL
     ORDER BY updated_at DESC, current_version DESC LIMIT 1`,
  ).get(reqId) as { id: string; content: string } | undefined;
  return row ?? null;
}

function summarizeForDescription(markdown: string, maxLen = 500): string {
  const lines = markdown.split('\n').map((l) => l.trim()).filter(Boolean);
  const body = lines.filter((l) => !l.startsWith('#')).join(' ').replace(/\s+/g, ' ').trim();
  if (!body) return lines.slice(0, 3).join('\n').slice(0, maxLen);
  return body.length <= maxLen ? body : `${body.slice(0, maxLen - 1)}…`;
}

const SPEC_OUTPUT_RULES = `
## Output Rules
- Follow language, tone, and format requirements stated in the requirement **Description** (and attachments).
- Output **ONLY** the Markdown document. No preamble or questions.
- Use the source material provided below as the authoritative input.
`.trim();

function looksLikeIncompleteSpec(content: string): boolean {
  if (content.length > 1500) return false;
  return /what feature|should the design spec cover|what would you like to build|what should the design spec cover/i.test(content)
    || /I've loaded the brainstorming|loaded the brainstorming skill/i.test(content)
    || /To generate a design spec.*first need to understand/i.test(content);
}

// Build requirement prompt from DB
function buildRequirementPrompt(reqId: string, cwd?: string): SpecGenerationPrompt {
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

  const attachmentBlocks = loadTextAttachments(reqId);
  if (attachmentBlocks.length > 0) {
    prompt += `\n## Context Attachments\n\n`;
    prompt += attachmentBlocks.join('\n\n');
    prompt += '\n';
  } else if (attachments.length > 0) {
    prompt += `\n## Context Attachments (metadata only)\n`;
    for (const a of attachments) {
      prompt += `- ${a.filename as string} (size: ${a.size as number} bytes)\n`;
    }
  }

  prompt += `\n## Instructions\n`;
  prompt += `${SPEC_OUTPUT_RULES}\n\n`;
  prompt += `Generate a structured Requirement Spec (PRD) in Markdown. If the Description does not specify sections, use:\n`;
  prompt += `1. Background\n`;
  prompt += `2. Target Users\n`;
  prompt += `3. Core Value\n`;
  prompt += `4. User Stories\n`;
  prompt += `5. Feature List (with interaction logic and boundary conditions)\n`;
  prompt += `6. Non-functional Requirements\n`;
  prompt += `7. Acceptance Criteria\n`;
  prompt += `8. Risks and Dependencies\n`;
  prompt += `9. Related Requirements\n\n`;
  prompt += `Output ONLY the Markdown document content.\n`;

  const userLines = [
    `# Generate Requirement Spec`,
    ``,
    `Requirement title: **${req.title as string}**`,
  ];
  if (req.description) {
    userLines.push(``, `User instructions:`, `${req.description as string}`);
  }
  userLines.push(
    ``,
    `Write a complete Requirement Spec (PRD) in Markdown for the requirement above.`,
    `Context (attachments, projects, output rules, section outline) is in your appended system instructions.`,
    `Start with \`# ${req.title as string} — Requirement Spec\` and output the full document now.`,
  );

  return {
    kind: 'spec_generation',
    userMessage: userLines.join('\n'),
    systemAppend: prompt,
  };
}

// Build design spec prompt from requirement document
function buildDesignPrompt(reqId: string, reqDocId?: string, cwd?: string): SpecGenerationPrompt {
  const req = db.prepare('SELECT * FROM requirements WHERE id=?').get(reqId) as Record<string, unknown> | undefined;
  if (!req) throw new Error('requirement not found');

  let reqDoc: { id: string; content: string } | null = null;
  if (reqDocId) {
    const doc = db.prepare(
      'SELECT id, content FROM documents WHERE id=? AND type=? AND deleted_at IS NULL',
    ).get(reqDocId, 'requirement_spec') as { id: string; content: string } | undefined;
    if (doc) reqDoc = doc;
  }
  if (!reqDoc) {
    reqDoc = resolveLatestRequirementSpecDoc(reqId);
  }

  let prompt = `# Design Spec Generation Task\n\n`;
  prompt += `${SPEC_OUTPUT_RULES}\n\n`;

  if (cwd) {
    prompt += `## Working Directory\n`;
    prompt += `You are working in the project repository located at: \`${cwd}\`.\n`;
    prompt += `Inspect existing code in this repository and align the design with current architecture, modules, and conventions.\n\n`;
  }

  prompt += `## Requirement Metadata\n`;
  prompt += `- Title: ${req.title}\n`;
  if (req.description) prompt += `- Brief: ${req.description}\n`;

  if (reqDoc?.content) {
    prompt += `\n## Source Requirement Spec (authoritative — design must implement this)\n\n`;
    prompt += reqDoc.content;
    prompt += `\n`;
  } else {
    prompt += `\n## Source Requirement Spec\n\n`;
    prompt += `_No requirement spec document found. Use title/description only:_\n\n`;
    prompt += `${req.title}\n${req.description ?? ''}\n`;
  }

  prompt += `\n## Instructions\n`;
  prompt += `Generate a structured Development Design Spec in Markdown. Follow language and structure from the Description and requirement spec when specified; otherwise use:\n`;
  prompt += `1. Overview and Goals\n`;
  prompt += `2. Business Flow (use \`\`\`mermaid code blocks)\n`;
  prompt += `3. Modules and Code Changes (reference existing repo paths when cwd is set)\n`;
  prompt += `4. API Design (method, path, request/response, error codes)\n`;
  prompt += `5. Data Model (tables/fields/indexes)\n`;
  prompt += `6. Risks and Compatibility\n`;
  prompt += `7. Rollback Plan\n\n`;
  prompt += `Output ONLY the Markdown document content.\n`;

  const hasReqSpec = !!reqDoc?.content?.trim();
  const userLines = [
    `# Generate Development Design Spec`,
    ``,
    `Requirement title: **${req.title as string}**`,
  ];
  if (req.description) {
    userLines.push(``, `User instructions:`, `${req.description as string}`);
  }
  userLines.push(
    ``,
    hasReqSpec
      ? `The full **Requirement Spec** is in your appended system instructions (section "Source Requirement Spec"). Implement every feature described there — this design is for **${req.title as string}**, not a generic project overview.`
      : `No Requirement Spec document is available. Base the design on the title and user instructions above.`,
  );
  if (cwd) {
    userLines.push(``, `Inspect the codebase at \`${cwd}\` and reference actual module paths in the design.`);
  }
  userLines.push(
    ``,
    `Write the complete Development Design Spec as Markdown.`,
    `Section outline and output rules are in your appended system instructions.`,
    `Start with \`# ${req.title as string} — Design Spec\` and output the full document now.`,
  );

  return {
    kind: 'spec_generation',
    userMessage: userLines.join('\n'),
    systemAppend: prompt,
  };
}

function resolveDesignReqDocId(reqId: string, reqDocId?: string): string | undefined {
  if (reqDocId) return reqDocId;
  return resolveLatestRequirementSpecDoc(reqId)?.id;
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
      signal: c.req.raw.signal,
      onEntry: (entry) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'entry', entry }) });
      },
      onPatch: (entryId, patch) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'patch', entryId, patch }) });
      },
    });

    if (errorMsg === 'Cancelled by user') {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: '已取消生成' }) });
      return;
    }

    if (!errorMsg && collected.length > 0) {
      const content = collected.reduce((best, cur) => (cur.length > best.length ? cur : best), '');
      const result = saveDocument(body.reqId, 'requirement_spec', `${req.title} — Requirement Spec`, content);

      // Backfill requirement description when empty or still a manual generation instruction
      const reqRow = db.prepare('SELECT description FROM requirements WHERE id=?').get(body.reqId) as { description: string } | undefined;
      const desc = (reqRow?.description ?? '').trim();
      const looksLikeInstruction = /生成|spec|Spec|根据/.test(desc) && desc.length < 200;
      if (!desc || looksLikeInstruction) {
        const summary = summarizeForDescription(content);
        if (summary) {
          db.prepare('UPDATE requirements SET description=? WHERE id=?').run(summary, body.reqId);
        }
      }

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
    const linkedReqDocId = resolveDesignReqDocId(body.reqId, body.reqDocId);
    const prompt = buildDesignPrompt(body.reqId, linkedReqDocId, cwd);
    const { collected, errorMsg } = await runAgentUntilDone(session, prompt, {
      signal: c.req.raw.signal,
      onEntry: (entry) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'entry', entry }) });
      },
      onPatch: (entryId, patch) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'patch', entryId, patch }) });
      },
    });

    if (errorMsg === 'Cancelled by user') {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: '已取消生成' }) });
      return;
    }

    if (!errorMsg && collected.length > 0) {
      const content = collected.reduce((best, cur) => (cur.length > best.length ? cur : best), '');
      if (looksLikeIncompleteSpec(content)) {
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: 'AI 返回了追问而非设计文档，请确认已生成需求 Spec 后重试' }) });
        return;
      }
      const result = saveDocument(body.reqId, 'design_spec', `${req.title} — Design Spec`, content);

      await stream.writeSSE({ data: JSON.stringify({ type: 'done', documentId: result.id, version: result.version }) });

      // Link design spec to the requirement spec it was derived from
      const reqDocId = linkedReqDocId;
      if (reqDocId) {
        try {
          db.prepare(
            'INSERT INTO document_links (from_doc_id, to_doc_id, relation, created_at) VALUES (?, ?, ?, ?)'
          ).run(result.id, reqDocId, 'derives_from', new Date().toISOString());
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
