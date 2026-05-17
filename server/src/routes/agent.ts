import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { db } from '../db/index.js';
import { sessionManager } from '../agents/SessionManager.js';
import { execSync } from 'node:child_process';

export const agentRouter = new Hono();

// POST /agent/run  → SSE
const RunSchema = z.object({
  sessionId: z.string(),
  agent: z.string().default('claude-code'),
  prompt: z.string(),
  model: z.string().optional(),
  cwd: z.string().optional(),
  images: z.array(z.string()).optional(),
});

agentRouter.post('/run', async (c) => {
  const body = RunSchema.parse(await c.req.json());

  return streamSSE(c, async (stream) => {
    const unsub = sessionManager.subscribe(body.sessionId, (line) => {
      stream.write(line);
    });

    try {
      await sessionManager.run({
        sessionId: body.sessionId,
        agent: body.agent,
        prompt: body.prompt,
        cwd: body.cwd,
      });
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      await stream.write(`data: ${JSON.stringify({ type: 'error', message: error.message ?? String(err) })}\n\n`);
      if (error.status === 409) {
        await stream.write(`data: ${JSON.stringify({ type: 'exit', code: 1 })}\n\n`);
      }
    } finally {
      unsub();
    }
  });
});

// POST /agent/interrupt/:sessionId
agentRouter.post('/interrupt/:sessionId', (c) => {
  const { sessionId } = c.req.param();
  const ok = sessionManager.interrupt(sessionId);
  return c.json({ ok });
});

// POST /agent/permission/:sessionId/:entryId/:decision
agentRouter.post('/permission/:sessionId/:entryId/:decision', (c) => {
  const { sessionId, entryId, decision } = c.req.param();
  if (decision !== 'approve' && decision !== 'reject') {
    return c.json({ error: 'decision must be approve or reject' }, 400);
  }
  // Update message status in DB
  db.prepare('UPDATE messages SET status=? WHERE id=?').run(
    decision === 'approve' ? 'running' : 'error',
    entryId
  );
  const ok = sessionManager.approvePermission(sessionId, entryId, decision as 'approve' | 'reject');
  return c.json({ ok: true });
});

// GET /agent/availability
agentRouter.get('/availability', (c) => {
  const agents: Record<string, { present: boolean; path?: string }> = {};
  const CLIs = ['claude', 'codex', 'gemini', 'opencode', 'deepseek', 'amp'];
  for (const cli of CLIs) {
    try {
      const path = execSync(`which ${cli}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      agents[cli === 'claude' ? 'claude-code' : cli] = { present: true, path };
    } catch {
      agents[cli === 'claude' ? 'claude-code' : cli] = { present: false };
    }
  }
  agents['claude-api'] = { present: !!process.env.ANTHROPIC_API_KEY };
  return c.json({ agents });
});

// GET /agent/status
agentRouter.get('/status', (c) => {
  return c.json({ activeSessions: 0 });
});
