import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { createAgentProcess } from '../agents/SessionManager.js';
import { resolveDefaultAgent } from '../agents/resolveDefaultAgent.js';
import { runAgentUntilDone } from '../agents/agentRunner.js';

export const assistantRouter = new Hono();

const ChatSchema = z.object({
  prompt: z.string().min(1),
  agent: z.string().optional(),
});

const activeAssistantSessions = new Map<string, { interrupt: () => void; cancelled: boolean }>();

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[]';
  }
}

function buildAssistantContext(): string {
  const requirements = db.prepare(
    `SELECT id, title, stage, priority, kind, planned_release_date, released_at, archived_at
     FROM requirements
     ORDER BY created_at DESC
     LIMIT 30`
  ).all();
  const defects = db.prepare(
    `SELECT id, req_id, title, severity, status, updated_at
     FROM defects
     ORDER BY updated_at DESC
     LIMIT 30`
  ).all();
  const testRuns = db.prepare(
    `SELECT id, req_id, run_type, status, total, passed, failed, skipped, completed_at
     FROM test_runs
     ORDER BY started_at DESC
     LIMIT 20`
  ).all();
  const documents = db.prepare(
    `SELECT id, req_id, type, title, status, current_version, updated_at
     FROM documents
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC
     LIMIT 20`
  ).all();
  const releaseRuns = db.prepare(
    `SELECT id, req_id, mode, state, pr_url, pr_status, completed_at
     FROM release_runs
     ORDER BY started_at DESC
     LIMIT 15`
  ).all();

  return [
    '## Current DevFlow Database Snapshot',
    '',
    '### Recent requirements',
    safeJson(requirements),
    '',
    '### Recent defects',
    safeJson(defects),
    '',
    '### Recent test runs',
    safeJson(testRuns),
    '',
    '### Recent documents',
    safeJson(documents),
    '',
    '### Recent release runs',
    safeJson(releaseRuns),
  ].join('\n');
}

function buildAssistantPrompt(userPrompt: string): string {
  return [
    '# DevFlow AI Assistant',
    '',
    'You are the in-product AI assistant for DevFlow, an agent-first requirement lifecycle management system.',
    'Answer in Chinese unless the user asks otherwise.',
    'Use the database snapshot below to answer questions, explain system flows, summarize status, and suggest next actions.',
    'Do not modify files, do not run destructive commands, and do not perform side effects. If the user asks to generate artifacts, explain which DevFlow shortcut/API should be used.',
    '',
    buildAssistantContext(),
    '',
    '## User Request',
    userPrompt,
  ].join('\n');
}

assistantRouter.post('/chat/:sessionId/cancel', (c) => {
  const { sessionId } = c.req.param();
  const active = activeAssistantSessions.get(sessionId);
  if (!active) return c.json({ ok: false, error: 'session not active' }, 404);
  active.cancelled = true;
  active.interrupt();
  return c.json({ ok: true });
});

assistantRouter.post('/chat', async (c) => {
  const body = ChatSchema.parse(await c.req.json());

  return streamSSE(c, async (stream) => {
    const sessionId = newId('ast');
    const agent = body.agent ?? resolveDefaultAgent();
    let registered = false;

    try {
      const session = createAgentProcess(agent, sessionId);
      const active = { interrupt: () => session.interrupt(), cancelled: false };
      activeAssistantSessions.set(sessionId, active);
      registered = true;

      await stream.writeSSE({ data: JSON.stringify({ type: 'started', sessionId, agent }) });

      const { collected, errorMsg } = await runAgentUntilDone(session, buildAssistantPrompt(body.prompt), {
        onEntry: (entry) => {
          void stream.writeSSE({ data: JSON.stringify({ type: 'entry', entry }) });
        },
        onPatch: (entryId, patch) => {
          void stream.writeSSE({ data: JSON.stringify({ type: 'patch', entryId, patch }) });
        },
      });

      if (active.cancelled) {
        await stream.writeSSE({ data: JSON.stringify({ type: 'cancelled', message: '已停止' }) });
        return;
      }

      if (errorMsg) {
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: errorMsg }) });
        return;
      }

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          content: collected.join(''),
        }),
      });
    } catch (err) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: (err as Error).message || String(err) }) });
    } finally {
      if (registered) activeAssistantSessions.delete(sessionId);
    }
  });
});
