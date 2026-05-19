import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { releaseRunner } from '../services/releaseRunner.js';
import { rbacGuard } from '../middleware/auth.js';
import { createAgentProcess } from '../agents/SessionManager.js';
import { resolveDefaultAgent } from '../agents/resolveDefaultAgent.js';
import { runAgentUntilDone } from '../agents/agentRunner.js';
import type { ReleaseRun, ReleaseEvent, ConflictFile } from '@devflow/shared';

export const releaseRouter = new Hono();

function parseRun(row: Record<string, unknown>): ReleaseRun {
  return {
    id: row.id as string,
    reqId: (row.req_id as string | null) ?? null,
    mode: row.mode as ReleaseRun['mode'],
    state: row.state as ReleaseRun['state'],
    projects: row.projects ? JSON.parse(row.projects as string) : [],
    log: (row.log as string) ?? '',
    verdict: (row.verdict as 'accepted' | null) ?? null,
    jenkinsBuildUrl: (row.jenkins_build_url as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
    prUrl: (row.pr_url as string | null) ?? null,
    prStatus: (row.pr_status as string | null) ?? null,
    releaseBranch: (row.release_branch as string | null) ?? null,
    productionVerifyResult: (row.production_verify_result as string | null) ?? null,
  };
}

const StartSchema = z.object({
  reqId: z.string().optional(),
  mode: z.enum(['mergePublish', 'release', 'quickPublish']),
  projects: z.array(z.string()).optional(),
});

// GET /release/list — all runs
releaseRouter.get('/list', (c) => {
  const rows = db.prepare('SELECT * FROM release_runs ORDER BY started_at DESC LIMIT 100').all() as Record<string, unknown>[];
  return c.json(rows.map(parseRun));
});

// GET /release/by-req/:reqId
releaseRouter.get('/by-req/:reqId', (c) => {
  const { reqId } = c.req.param();
  const rows = db.prepare(
    'SELECT * FROM release_runs WHERE req_id=? ORDER BY started_at DESC'
  ).all(reqId) as Record<string, unknown>[];
  return c.json(rows.map(parseRun));
});

// GET /release/:id
releaseRouter.get('/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM release_runs WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseRun(row));
});

// GET /release/:id/conflicts
releaseRouter.get('/:id/conflicts', (c) => {
  const { id } = c.req.param();
  return c.json(releaseRunner.getConflicts(id));
});

// POST /release/start — returns SSE stream
releaseRouter.post('/start', rbacGuard('admin'), async (c) => {
  const body = StartSchema.parse(await c.req.json());
  const runId = newId('run');
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO release_runs (id, req_id, mode, state, projects, log, started_at)
    VALUES (?, ?, ?, 'idle', '[]', '', ?)
  `).run(runId, body.reqId ?? null, body.mode, now);

  return streamSSE(c, async (stream) => {
    const unsub = releaseRunner.subscribe(runId, async (event: ReleaseEvent) => {
      await stream.writeSSE({ data: JSON.stringify(event) });
    });

    setImmediate(() => { void releaseRunner.startRun(runId); });

    await new Promise<void>((resolve) => {
      releaseRunner.on('event', (e: ReleaseEvent) => {
        if (e.runId === runId && ['done', 'error', 'cancelled'].includes(e.state ?? '')) {
          resolve();
        }
      });
      setTimeout(resolve, 5 * 60 * 1000);
    });

    unsub();
  });
});

// POST /release/:id/resume
releaseRouter.post('/:id/resume', async (c) => {
  const { id } = c.req.param();
  setImmediate(() => { void releaseRunner.resume(id); });
  return c.json({ ok: true });
});

// POST /release/:id/cancel
releaseRouter.post('/:id/cancel', (c) => {
  const { id } = c.req.param();
  releaseRunner.cancel(id);
  return c.json({ ok: true });
});

// POST /release/:id/verify — manual production verification
const VerifySchema = z.object({
  verdict: z.enum(['accepted', 'rejected']),
});

releaseRouter.post('/:id/verify', async (c) => {
  const { id } = c.req.param();
  const body = VerifySchema.parse(await c.req.json());
  try {
    await releaseRunner.verifyProduction(id, body.verdict);
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// POST /release/:id/conflict-suggest — AI-powered conflict resolution suggestions via SSE
const ConflictSuggestSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    blocks: z.array(z.object({
      index: z.number(),
      startLine: z.number(),
      oursLines: z.array(z.string()),
      theirsLines: z.array(z.string()),
    })),
  })),
});

releaseRouter.post('/:id/conflict-suggest', async (c) => {
  const { id } = c.req.param();
  const body = ConflictSuggestSchema.parse(await c.req.json());
  const files = body.files as ConflictFile[];

  if (files.length === 0) {
    return c.json({ error: 'no conflict files provided' }, 400);
  }

  function buildPrompt(files: ConflictFile[]): string {
    let prompt = `You are a senior software engineer resolving Git merge conflicts.\n\n`;
    prompt += `For each conflict block below, analyze both "ours" (current branch) and "theirs" (incoming branch) changes, and produce the best merged resolution.\n\n`;
    prompt += `Output MUST be valid JSON with this exact structure (no markdown code blocks):\n`;
    prompt += `{"resolutions":[{"fileIdx":0,"blockIdx":0,"text":"merged code"},{"fileIdx":0,"blockIdx":1,"text":"..."}...]}\n\n`;
    prompt += `Where fileIdx is the index of the file in the input array, blockIdx is the index of the conflict block within that file, and text is the complete resolved code for that block.\n\n`;
    prompt += `Conflict files:\n`;
    for (let fIdx = 0; fIdx < files.length; fIdx++) {
      const f = files[fIdx];
      prompt += `\n=== File ${fIdx}: ${f.path} ===\n`;
      for (const block of f.blocks) {
        prompt += `\n-- Block ${block.index} (starting at line ${block.startLine}) --\n`;
        prompt += `OURS:\n${block.oursLines.join('\n')}\n`;
        prompt += `THEIRS:\n${block.theirsLines.join('\n')}\n`;
      }
    }
    return prompt;
  }

  return streamSSE(c, async (stream) => {
    const sessionId = newId('ses');
    const session = createAgentProcess(resolveDefaultAgent(), sessionId);
    const prompt = buildPrompt(files);
    let { collected, errorMsg } = await runAgentUntilDone(session, prompt, {
      timeoutMs: 5 * 60 * 1000,
      onEntry: (entry) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'chunk', content: entry.content }) });
      },
      onPatch: (entryId, patch) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'patch', entryId, patch }) });
      },
    });

    if (!errorMsg && collected.length > 0) {
      try {
        const raw = collected.join('').trim();
        const jsonStr = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        const parsed = JSON.parse(jsonStr) as { resolutions?: Array<{ fileIdx: number; blockIdx: number; text: string }> };
        const suggestions = parsed.resolutions ?? [];
        await stream.writeSSE({ data: JSON.stringify({ type: 'suggestions', suggestions }) });
        await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) });
      } catch (e) {
        errorMsg = `Failed to parse AI response: ${(e as Error).message}`;
      }
    }

    if (errorMsg) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: errorMsg }) });
    }
  });
});
