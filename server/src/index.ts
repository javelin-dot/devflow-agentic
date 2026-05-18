import 'dotenv/config';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { bootstrap } from './db/index.js';
import { loadUserEnv, loadDbEnvOverrides } from './config/loadUserEnv.js';
import { taskScheduler } from './services/scheduler.js';
import { requirementsRouter } from './routes/requirements.js';
import { settingsRouter } from './routes/settings.js';
import { eventsRouter } from './routes/events.js';
import { projectsRouter } from './routes/projects.js';
import { sessionsRouter } from './routes/sessions.js';
import { agentRouter } from './routes/agent.js';
import { worktreeRouter } from './routes/worktree.js';
import { analysisRouter } from './routes/analysis.js';
import { subtasksRouter } from './routes/subtasks.js';
import { releaseRouter } from './routes/release.js';
import { mergePublishRouter } from './routes/mergePublish.js';
import { jenkinsRouter } from './routes/jenkins.js';
import { logsRouter } from './routes/logs.js';
import { testingRouter } from './routes/testing.js';
import { systemRouter } from './routes/system.js';
import { documentsRouter } from './routes/documents.js';
import { attachmentsRouter } from './routes/attachments.js';
import { notificationsRouter } from './routes/notifications.js';
import { specsRouter } from './routes/specs.js';
import { authRouter } from './routes/auth.js';
import { fsRouter } from './routes/fs.js';
import { authGuard } from './middleware/auth.js';
import { db } from './db/index.js';
import { handleTerminalWS } from './routes/terminal.js';

bootstrap();
loadUserEnv();
loadDbEnvOverrides();

const app = new Hono();
app.use('*', cors());
app.use('*', authGuard);

app.route('/api/auth', authRouter);
app.route('/api/requirements', requirementsRouter);
app.route('/api/fs', fsRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/events', eventsRouter);
app.route('/api/projects', projectsRouter);
app.route('/api/sessions', sessionsRouter);
app.route('/api/agent', agentRouter);
// worktree-status is under /api/requirements/:id/worktree-status
app.route('/api/requirements', worktreeRouter);
app.route('/api/analysis', analysisRouter);
app.route('/api/subtasks', subtasksRouter);
app.route('/api/release', releaseRouter);
app.route('/api/merge-publish', mergePublishRouter);
app.route('/api/jenkins-templates', jenkinsRouter);
app.route('/api/logs', logsRouter);
app.route('/api', testingRouter);
app.route('/api', systemRouter);
app.route('/api/documents', documentsRouter);
app.route('/api/attachments', attachmentsRouter);
app.route('/api/notifications', notificationsRouter);
app.route('/api/specs', specsRouter);

// GET /api/runtime/state
app.get('/api/runtime/state', (c) =>
  c.json({ features: {}, activeSessions: [], activeRuns: [] })
);

app.onError((err, c) => {
  console.error('[error]', err.message);
  return c.json({ error: err.message }, 500);
});

const PORT = Number(process.env.PORT ?? 4000);
const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`DevFlow server running on http://localhost:${PORT}`);
  taskScheduler.startPolling(30000);

  // M8: Archive cron — daily at 03:00
  function scheduleArchiveCron() {
    const now = new Date();
    const next3am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0);
    if (next3am <= now) next3am.setDate(next3am.getDate() + 1);
    const delay = next3am.getTime() - now.getTime();
    setTimeout(() => {
      runArchiveJob();
      setInterval(runArchiveJob, 24 * 60 * 60 * 1000);
    }, delay);
  }

  function runArchiveJob() {
    try {
      const enabledRow = db.prepare("SELECT value FROM settings WHERE key='archive.enabled'").get() as { value: string } | undefined;
      if (enabledRow?.value === 'false') return;

      const daysRow = db.prepare("SELECT value FROM settings WHERE key='archive.afterDays'").get() as { value: string } | undefined;
      const days = Number(daysRow?.value ?? 7);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const result = db.prepare(
        `UPDATE requirements SET archived_at = ? WHERE stage = 'released' AND released_at IS NOT NULL AND released_at < ? AND archived_at IS NULL`
      ).run(new Date().toISOString(), cutoff);
      console.log(`[ArchiveCron] Archived ${result.changes} requirements older than ${days} days`);
    } catch (err) {
      console.error('[ArchiveCron] Error:', (err as Error).message);
    }
  }

  scheduleArchiveCron();
});

// M9: Terminal WebSocket
const wss = new WebSocketServer({ server: server as import('http').Server });
wss.on('connection', (ws, req) => {
  const pathname = req.url ?? '/';
  if (pathname.startsWith('/terminal')) {
    handleTerminalWS(ws, pathname);
  } else {
    ws.close(1002, 'Invalid path');
  }
});
