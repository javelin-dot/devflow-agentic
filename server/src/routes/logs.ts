import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db, newId } from '../db/index.js';
import { sshService } from '../services/ssh.js';
import { checkCommand } from '../services/logCommandWhitelist.js';
import { logDiagnosis } from '../services/logDiagnosis.js';
import type { LogTarget, LogChatSession, DiagnosisStep } from '@devflow/shared';

export const logsRouter = new Hono();

function parseTarget(row: Record<string, unknown>): LogTarget {
  return {
    id: row.id as string,
    name: row.name as string,
    project: (row.project as string | null) ?? null,
    service: row.service as string,
    environment: (row.environment as string) ?? 'production',
    hosts: row.hosts ? JSON.parse(row.hosts as string) as string[] : [],
    connectMode: (row.connect_mode as LogTarget['connectMode']) ?? 'direct',
    sshUser: (row.ssh_user as string | null) ?? null,
    sshPort: (row.ssh_port as number) ?? 22,
    sshKeyPath: (row.ssh_key_path as string | null) ?? null,
    sshPassword: (row.ssh_password as string | null) ?? null,
    jumpHost: (row.jump_host as string | null) ?? null,
    jumpUser: (row.jump_user as string | null) ?? null,
    jumpPort: (row.jump_port as number) ?? 22,
    logDir: (row.log_dir as string | null) ?? null,
    logGlob: (row.log_glob as string) ?? '*.log',
    createdAt: row.created_at as string,
  };
}

function parseSession(row: Record<string, unknown>): LogChatSession {
  return {
    id: row.id as string,
    title: (row.title as string) ?? '',
    scopedTargetIds: row.scoped_target_ids ? JSON.parse(row.scoped_target_ids as string) as string[] : [],
    messages: row.messages ? JSON.parse(row.messages as string) as LogChatSession['messages'] : [],
    steps: row.steps ? JSON.parse(row.steps as string) as DiagnosisStep[] : [],
    tab: (row.tab as LogChatSession['tab']) ?? 'trace',
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ===== Log Targets CRUD =====

// GET /targets
logsRouter.get('/targets', (c) => {
  const rows = db.prepare('SELECT * FROM log_targets ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return c.json(rows.map(parseTarget));
});

// GET /targets/:id
logsRouter.get('/targets/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM log_targets WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseTarget(row));
});

// POST /targets
logsRouter.post('/targets', async (c) => {
  const body = await c.req.json() as {
    name: string;
    service: string;
    project?: string;
    environment?: string;
    hosts?: string[];
    connectMode?: LogTarget['connectMode'];
    sshUser?: string;
    sshPort?: number;
    sshKeyPath?: string;
    sshPassword?: string;
    jumpHost?: string;
    jumpUser?: string;
    jumpPort?: number;
    logDir?: string;
    logGlob?: string;
  };
  const id = newId('tgt');
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO log_targets (
    id, name, project, service, environment, hosts, connect_mode,
    ssh_user, ssh_port, ssh_key_path, ssh_password,
    jump_host, jump_user, jump_port, log_dir, log_glob, created_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      id,
      body.name,
      body.project ?? null,
      body.service,
      body.environment ?? 'production',
      JSON.stringify(body.hosts ?? []),
      body.connectMode ?? 'direct',
      body.sshUser ?? null,
      body.sshPort ?? 22,
      body.sshKeyPath ?? null,
      body.sshPassword ?? null,
      body.jumpHost ?? null,
      body.jumpUser ?? null,
      body.jumpPort ?? 22,
      body.logDir ?? null,
      body.logGlob ?? '*.log',
      now,
    );
  const row = db.prepare('SELECT * FROM log_targets WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseTarget(row), 201);
});

// PATCH /targets/:id
logsRouter.patch('/targets/:id', async (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM log_targets WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json() as Partial<LogTarget>;
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (body.name !== undefined) { fields.push('name=?'); vals.push(body.name); }
  if (body.project !== undefined) { fields.push('project=?'); vals.push(body.project); }
  if (body.service !== undefined) { fields.push('service=?'); vals.push(body.service); }
  if (body.environment !== undefined) { fields.push('environment=?'); vals.push(body.environment); }
  if (body.hosts !== undefined) { fields.push('hosts=?'); vals.push(JSON.stringify(body.hosts)); }
  if (body.connectMode !== undefined) { fields.push('connect_mode=?'); vals.push(body.connectMode); }
  if (body.sshUser !== undefined) { fields.push('ssh_user=?'); vals.push(body.sshUser); }
  if (body.sshPort !== undefined) { fields.push('ssh_port=?'); vals.push(body.sshPort); }
  if (body.sshKeyPath !== undefined) { fields.push('ssh_key_path=?'); vals.push(body.sshKeyPath); }
  if (body.sshPassword !== undefined) { fields.push('ssh_password=?'); vals.push(body.sshPassword); }
  if (body.jumpHost !== undefined) { fields.push('jump_host=?'); vals.push(body.jumpHost); }
  if (body.jumpUser !== undefined) { fields.push('jump_user=?'); vals.push(body.jumpUser); }
  if (body.jumpPort !== undefined) { fields.push('jump_port=?'); vals.push(body.jumpPort); }
  if (body.logDir !== undefined) { fields.push('log_dir=?'); vals.push(body.logDir); }
  if (body.logGlob !== undefined) { fields.push('log_glob=?'); vals.push(body.logGlob); }
  if (fields.length === 0) return c.json(parseTarget(row));
  vals.push(id);
  db.prepare(`UPDATE log_targets SET ${fields.join(',')} WHERE id=?`).run(...vals);
  const updated = db.prepare('SELECT * FROM log_targets WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseTarget(updated));
});

// DELETE /targets/:id
logsRouter.delete('/targets/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM log_targets WHERE id=?').run(id);
  return c.json({ ok: true });
});

// ===== Exec =====

// POST /exec
logsRouter.post('/exec', async (c) => {
  const body = await c.req.json() as { targetId: string; cmd: string };
  const { targetId, cmd } = body;
  const chk = checkCommand(cmd);
  if (!chk.allowed) return c.json({ error: chk.reason }, 400);
  const row = db.prepare('SELECT * FROM log_targets WHERE id=?').get(targetId) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'target not found' }, 404);
  const target = parseTarget(row);
  const result = await sshService.exec(target, cmd);
  return c.json(result);
});

// ===== Log Chat Sessions CRUD =====

// GET /sessions
logsRouter.get('/sessions', (c) => {
  const rows = db.prepare('SELECT * FROM log_chat_sessions ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return c.json(rows.map(parseSession));
});

// GET /sessions/:id
logsRouter.get('/sessions/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM log_chat_sessions WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseSession(row));
});

// POST /sessions
logsRouter.post('/sessions', async (c) => {
  const body = await c.req.json() as { title?: string; scopedTargetIds: string[] };
  const id = newId('lcs');
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO log_chat_sessions (id, title, scoped_target_ids, messages, steps, tab, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, body.title ?? '', JSON.stringify(body.scopedTargetIds ?? []), '[]', '[]', 'trace', now, now);
  const row = db.prepare('SELECT * FROM log_chat_sessions WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseSession(row), 201);
});

// DELETE /sessions/:id
logsRouter.delete('/sessions/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM log_chat_sessions WHERE id=?').run(id);
  return c.json({ ok: true });
});

// ===== Chat SSE =====

logsRouter.post('/chat', async (c) => {
  const body = await c.req.json() as { sessionId: string; query: string };
  const { sessionId, query } = body;

  const sessionRow = db.prepare('SELECT * FROM log_chat_sessions WHERE id=?').get(sessionId) as Record<string, unknown> | undefined;
  if (!sessionRow) return c.json({ error: 'session not found' }, 404);

  const scopedIds = JSON.parse(sessionRow.scoped_target_ids as string) as string[];
  const targets = scopedIds
    .map(id => db.prepare('SELECT * FROM log_targets WHERE id=?').get(id) as Record<string, unknown> | undefined)
    .filter((r): r is Record<string, unknown> => !!r)
    .map(parseTarget);

  return streamSSE(c, async (stream) => {
    let done = false;
    const unsub = logDiagnosis.subscribe(sessionId, async (evt) => {
      await stream.writeSSE({ data: JSON.stringify(evt) });
      if (evt.type === 'done' || evt.type === 'error') done = true;
    });
    setImmediate(() => { void logDiagnosis.diagnose({ sessionId, userQuery: query, targets }); });
    await new Promise<void>((resolve) => {
      const iv = setInterval(() => { if (done) { clearInterval(iv); resolve(); } }, 200);
      setTimeout(() => { clearInterval(iv); resolve(); }, 10 * 60 * 1000);
    });
    unsub();
  });
});
