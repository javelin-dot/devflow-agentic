import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { releaseRunner } from '../services/releaseRunner.js';
import type { ReleaseEvent } from '@devflow/shared';

export const mergePublishRouter = new Hono();

const StartSchema = z.object({
  reqId: z.string().optional(),
  projects: z.array(z.string()).optional(),
});

// POST /merge-publish/start
mergePublishRouter.post('/start', async (c) => {
  const body = StartSchema.parse(await c.req.json());
  const runId = newId('run');
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO release_runs (id, req_id, mode, state, projects, log, started_at)
    VALUES (?, ?, 'mergePublish', 'idle', '[]', '', ?)
  `).run(runId, body.reqId ?? null, now);

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
