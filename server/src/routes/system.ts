import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { statSync, createReadStream, copyFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { db, DB_PATH } from '../db/index.js';

const execAsync = promisify(exec);

export const systemRouter = new Hono();

// GET /pick-folder — 打开原生文件夹选择对话框，返回所选路径
systemRouter.get('/pick-folder', async (c) => {
  try {
    let cmd: string;
    if (process.platform === 'darwin') {
      cmd = `osascript -e 'POSIX path of (choose folder with prompt "选择项目根目录")'`;
    } else if (process.platform === 'linux') {
      cmd = `zenity --file-selection --directory --title="选择项目根目录" 2>/dev/null`;
    } else {
      return c.json({ error: '当前平台不支持文件夹选择' }, 400);
    }
    const { stdout } = await execAsync(cmd);
    const folderPath = stdout.trim();
    const hasGit = existsSync(join(folderPath, '.git'));
    return c.json({ path: folderPath, hasGit });
  } catch {
    // 用户取消选择时 osascript 会抛错，返回 null
    return c.json({ path: null, hasGit: false });
  }
});

// POST /test-connection
systemRouter.post('/test-connection', async (c) => {
  const body = await c.req.json() as { type: string; baseUrl?: string; apiKey?: string; model?: string };
  const start = Date.now();

  if (body.type === 'claude-code') {
    try {
      const env = { ...process.env };
      if (!env.PATH?.includes('/opt/homebrew/bin')) env.PATH = `/opt/homebrew/bin:${env.PATH ?? ''}`;
      // Apply proxy from DB if not already in env
      const dbProxy = (db.prepare("SELECT value FROM settings WHERE key='proxyUrl'").get() as { value: string } | undefined)?.value;
      const proxyUrl = env.HTTPS_PROXY ?? env.HTTP_PROXY ?? dbProxy;
      if (proxyUrl) {
        env.HTTP_PROXY = proxyUrl; env.HTTPS_PROXY = proxyUrl;
        env.http_proxy = proxyUrl; env.https_proxy = proxyUrl;
      }
      // Get version first (fast, no network)
      const { stdout: ver } = await execAsync('claude --version', { env, timeout: 5000 });
      // Then do a real API call to verify authentication + network
      await execAsync('claude --output-format text --print "hi"', { env, timeout: 20000 });
      return c.json({ ok: true, latencyMs: Date.now() - start, message: ver.trim() });
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      // Binary exists but API failed — surface the real error
      return c.json({ ok: false, latencyMs: Date.now() - start, error: msg.includes('claude') ? msg.split('\n')[0] : msg });
    }
  }

  if (body.type === 'openai-compatible') {
    if (!body.baseUrl || !body.apiKey) return c.json({ ok: false, error: 'baseUrl and apiKey required' }, 400);
    try {
      const resp = await fetch(`${body.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${body.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        const text = await resp.text();
        return c.json({ ok: false, latencyMs: Date.now() - start, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` });
      }
      return c.json({ ok: true, latencyMs: Date.now() - start });
    } catch (err) {
      return c.json({ ok: false, latencyMs: Date.now() - start, error: (err as Error).message });
    }
  }

  return c.json({ ok: false, error: 'unknown type' }, 400);
});

// GET /system/env-checks — Node / Git / SSH detection
systemRouter.get('/system/env-checks', async (c) => {
  const checks: Record<string, { present: boolean; version?: string; message?: string }> = {};

  // Node
  checks.node = {
    present: true,
    version: process.version,
    message: Number(process.version.slice(1).split('.')[0]) >= 18 ? 'ok' : '建议升级至 Node 18+',
  };

  // Git
  try {
    const { stdout } = await execAsync('git --version', { timeout: 5000 });
    checks.git = { present: true, version: stdout.trim().split(' ')[2] };
  } catch {
    checks.git = { present: false, message: '请安装 Git: https://git-scm.com' };
  }

  // SSH
  try {
    const { stdout } = await execAsync('ssh -V', { timeout: 5000 });
    checks.ssh = { present: true, version: stdout.trim().split(' ')[0] };
  } catch {
    checks.ssh = { present: false, message: 'SSH 客户端未找到' };
  }

  return c.json(checks);
});

// GET /health
systemRouter.get('/health', (c) => {
  const tables = ['requirements', 'sessions', 'sub_tasks', 'analyses', 'test_runs', 'defects', 'release_runs', 'log_targets'];
  const counts: Record<string, number> = {};
  for (const t of tables) {
    try {
      const r = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get() as { n: number };
      counts[t] = r.n;
    } catch { counts[t] = -1; }
  }
  let dbSizeKb = 0;
  try { dbSizeKb = Math.round(statSync(DB_PATH).size / 1024); } catch { /* */ }

  return c.json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    dbSizeKb,
    tableRowCounts: counts,
    agentCount: 0,
    version: '2.0.0',
    nodeVersion: process.version,
    platform: process.platform,
  });
});

// GET /stats
systemRouter.get('/stats', (c) => {
  const stages = ['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released'];
  const byStage: Record<string, number> = {};
  for (const s of stages) {
    const r = db.prepare("SELECT COUNT(*) as n FROM requirements WHERE stage=? AND archived_at IS NULL").get(s) as { n: number };
    byStage[s] = r.n;
  }
  const total = db.prepare("SELECT COUNT(*) as n FROM requirements WHERE archived_at IS NULL").get() as { n: number };
  const openDefects = db.prepare("SELECT COUNT(*) as n FROM defects WHERE status='open'").get() as { n: number };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekly = db.prepare("SELECT COUNT(*) as n FROM requirements WHERE stage='released' AND released_at >= ?").get(sevenDaysAgo) as { n: number };

  const cycleRows = db.prepare("SELECT created_at, released_at FROM requirements WHERE stage='released' AND released_at IS NOT NULL").all() as Array<{ created_at: string; released_at: string }>;
  let avgCycleDays = 0;
  if (cycleRows.length > 0) {
    const totalDays = cycleRows.reduce((sum, r) => {
      const diff = (new Date(r.released_at).getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return sum + diff;
    }, 0);
    avgCycleDays = Math.round(totalDays / cycleRows.length * 10) / 10;
  }

  return c.json({
    byStage,
    totalRequirements: total.n,
    openDefects: openDefects.n,
    weeklyThroughput: weekly.n,
    avgCycleDays,
  });
});

// GET /backup — stream the SQLite file
systemRouter.get('/backup', async (c) => {
  c.header('Content-Type', 'application/octet-stream');
  c.header('Content-Disposition', `attachment; filename="devflow-${new Date().toISOString().slice(0, 10)}.db"`);

  return stream(c, async (s) => {
    const fileStream = createReadStream(DB_PATH);
    for await (const chunk of fileStream) {
      await s.write(chunk as Uint8Array);
    }
  });
});

// POST /restore — upload and replace DB file
systemRouter.post('/restore', async (c) => {
  try {
    const body = await c.req.arrayBuffer();
    if (!body.byteLength) return c.json({ error: 'empty body' }, 400);

    // Validate it's a valid SQLite file (starts with magic bytes "SQLite format 3\x00")
    const magic = Buffer.from(body, 0, 16).toString('utf8');
    if (!magic.startsWith('SQLite format 3')) {
      return c.json({ error: 'not a valid SQLite file' }, 400);
    }

    const backupPath = DB_PATH + '.bak';
    // Backup current DB first
    copyFileSync(DB_PATH, backupPath);

    // Write new DB (hot swap)
    writeFileSync(DB_PATH + '.new', Buffer.from(body));
    renameSync(DB_PATH + '.new', DB_PATH);

    return c.json({ ok: true, message: 'Database restored. Restart server for full effect.' });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500);
  }
});

// POST /docs/release/:reqId — generate release doc
systemRouter.post('/docs/release/:reqId', (c) => {
  const { reqId } = c.req.param();
  const req = db.prepare('SELECT * FROM requirements WHERE id=?').get(reqId) as Record<string, unknown> | undefined;
  if (!req) return c.json({ error: 'not found' }, 404);

  const events = db.prepare("SELECT * FROM events WHERE req_id=? ORDER BY created_at ASC").all(reqId) as Array<Record<string, unknown>>;
  const releaseRuns = db.prepare("SELECT * FROM release_runs WHERE req_id=? ORDER BY started_at ASC").all(reqId) as Array<Record<string, unknown>>;
  const defects = db.prepare("SELECT * FROM defects WHERE req_id=?").all(reqId) as Array<Record<string, unknown>>;
  const subTasks = db.prepare("SELECT * FROM sub_tasks WHERE req_id=? ORDER BY wave, ordering").all(reqId) as Array<Record<string, unknown>>;

  const stageChanges = events.filter(e => e.type === 'stage_change');

  const doc = [
    `# 发布文档: ${req.title as string}`,
    ``,
    `**需求ID**: ${req.id as string}  `,
    `**优先级**: ${req.priority as string}  `,
    `**发布日期**: ${(req.released_at as string | null) ?? '未发布'}  `,
    ``,
    `## 阶段历程`,
    ...stageChanges.map(e => {
      const p = JSON.parse((e.payload as string) || '{}') as Record<string, unknown>;
      return `- ${e.created_at as string}: ${p.from as string} → ${p.to as string}`;
    }),
    ``,
    `## 子任务完成情况`,
    ...subTasks.map(t => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title as string} (wave ${t.wave as number})`),
    ``,
    `## 缺陷统计`,
    `- 总计: ${defects.length} 个`,
    `- P0: ${defects.filter(d => d.severity === 'P0').length} 个`,
    `- P1: ${defects.filter(d => d.severity === 'P1').length} 个`,
    `- 已解决: ${defects.filter(d => ['resolved', 'closed'].includes(d.status as string)).length} 个`,
    ``,
    `## 发布运行`,
    ...releaseRuns.map(r => `- [${r.state as string}] ${r.mode as string} 于 ${r.started_at as string}`),
    ``,
    `## 生成时间`,
    new Date().toISOString(),
  ].join('\n');

  db.prepare('UPDATE requirements SET release_doc=? WHERE id=?').run(doc, reqId);

  return c.json({ doc, reqId });
});
