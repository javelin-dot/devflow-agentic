import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');
mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = process.env.LK_DB_PATH ?? resolve(DATA_DIR, 'devflow.db');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function bootstrap(): void {
  // requirements 表
  db.exec(`CREATE TABLE IF NOT EXISTS requirements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    kind TEXT DEFAULT 'standard',
    stage TEXT DEFAULT 'backlog',
    priority TEXT DEFAULT 'medium',
    workspace TEXT,
    tags TEXT DEFAULT '[]',
    planned_release_date TEXT,
    released_at TEXT,
    archived_at TEXT,
    analysis_chosen_id TEXT,
    profile_id TEXT,
    notes TEXT,
    api_doc TEXT,
    release_doc TEXT,
    created_at TEXT NOT NULL
  )`);

  // requirement_projects 关联表
  db.exec(`CREATE TABLE IF NOT EXISTS requirement_projects (
    req_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    project TEXT NOT NULL,
    dev_branch TEXT,
    uat_branch TEXT,
    is_primary INTEGER DEFAULT 0,
    PRIMARY KEY (req_id, project)
  )`);

  // events 表
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    req_id TEXT,
    type TEXT NOT NULL,
    payload TEXT DEFAULT '{}',
    actor TEXT DEFAULT 'system',
    created_at TEXT NOT NULL
  )`);

  // settings 表 (key-value)
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  // 默认 settings
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  insertSetting.run('workspaceRoot', process.env.LK_WORKSPACE_ROOT ?? process.cwd());
  insertSetting.run('port', '4000');

  // projects 表
  db.exec(`CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    lang TEXT,
    branch TEXT DEFAULT 'master',
    branch_prefix TEXT,
    merge_strategy TEXT DEFAULT 'merge',
    auto_push INTEGER DEFAULT 0,
    services TEXT DEFAULT '[]',
    jenkins_template_id TEXT,
    data_source_id TEXT,
    log_dir_template TEXT,
    log_glob_template TEXT,
    root_dir TEXT,
    sort_order INTEGER DEFAULT 0
  )`);

  // sessions 表
  db.exec(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    req_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    title TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    agent TEXT NOT NULL,
    agent_locked INTEGER DEFAULT 0,
    stage_snapshot TEXT,
    profile_id TEXT,
    cwd TEXT,
    archived_at TEXT,
    archive_reason TEXT,
    created_at TEXT NOT NULL
  )`);

  // messages 表
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    entry_type TEXT,
    action TEXT,
    status TEXT,
    created_at TEXT NOT NULL
  )`);

  // sub_tasks 表
  db.exec(`CREATE TABLE IF NOT EXISTS sub_tasks (
    id TEXT PRIMARY KEY,
    req_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    analysis_id TEXT,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL DEFAULT '',
    project TEXT,
    type TEXT NOT NULL DEFAULT 'impl',
    wave INTEGER DEFAULT 0,
    task_depends_on TEXT DEFAULT '[]',
    acceptance TEXT DEFAULT '[]',
    verify_commands TEXT DEFAULT '[]',
    risk TEXT,
    status TEXT DEFAULT 'pending',
    session_id TEXT,
    agent TEXT,
    error_message TEXT,
    notes TEXT,
    ordering INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT
  )`);

  // analyses 表
  db.exec(`CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    req_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    agent TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    prompt TEXT NOT NULL DEFAULT '',
    output TEXT,
    error_message TEXT,
    session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  // contracts 表
  db.exec(`CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    req_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    schema_type TEXT DEFAULT 'json',
    schema_content TEXT NOT NULL DEFAULT '{}',
    status TEXT DEFAULT 'draft',
    declared_by_task_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  // INV-09: 启动时孤儿 pending 消息标记为 error
  db.exec(`UPDATE messages SET status='error' WHERE status='pending'`);

  // 添加 attachments 字段到 requirements 表（如果不存在）
  try {
    db.exec(`ALTER TABLE requirements ADD COLUMN attachments TEXT DEFAULT '[]'`);
  } catch { /* 已存在则忽略 */ }

  // M3: release runs 表
  db.exec(`CREATE TABLE IF NOT EXISTS release_runs (
    id TEXT PRIMARY KEY,
    req_id TEXT REFERENCES requirements(id) ON DELETE SET NULL,
    mode TEXT NOT NULL,
    state TEXT DEFAULT 'idle',
    projects TEXT DEFAULT '[]',
    log TEXT DEFAULT '',
    verdict TEXT,
    jenkins_build_url TEXT,
    error TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    pr_url TEXT,
    pr_status TEXT,
    release_branch TEXT,
    production_verify_result TEXT
  )`);

  // M3: jenkins templates 表
  db.exec(`CREATE TABLE IF NOT EXISTS jenkins_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    job TEXT NOT NULL,
    params TEXT DEFAULT '{}',
    jenkins_url TEXT NOT NULL DEFAULT 'http://localhost:8080',
    created_at TEXT NOT NULL
  )`);

  // M4: log targets 表
  db.exec(`CREATE TABLE IF NOT EXISTS log_targets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project TEXT,
    service TEXT NOT NULL,
    environment TEXT DEFAULT 'production',
    hosts TEXT NOT NULL DEFAULT '[]',
    connect_mode TEXT NOT NULL DEFAULT 'direct',
    ssh_user TEXT,
    ssh_port INTEGER DEFAULT 22,
    ssh_key_path TEXT,
    ssh_password TEXT,
    jump_host TEXT,
    jump_user TEXT,
    jump_port INTEGER DEFAULT 22,
    log_dir TEXT,
    log_glob TEXT DEFAULT '*.log',
    created_at TEXT NOT NULL
  )`);

  // M4: log chat sessions 表
  db.exec(`CREATE TABLE IF NOT EXISTS log_chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    scoped_target_ids TEXT NOT NULL DEFAULT '[]',
    messages TEXT NOT NULL DEFAULT '[]',
    steps TEXT NOT NULL DEFAULT '[]',
    tab TEXT NOT NULL DEFAULT 'trace',
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  // M2.5: test plans 表
  db.exec(`CREATE TABLE IF NOT EXISTS test_plans (
    id TEXT PRIMARY KEY,
    req_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL
  )`);

  // M2.5: test cases 表
  db.exec(`CREATE TABLE IF NOT EXISTS test_cases (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES test_plans(id) ON DELETE CASCADE,
    req_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    test_type TEXT DEFAULT 'unit',
    command TEXT NOT NULL DEFAULT '',
    expected_exit_code INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    cwd TEXT,
    created_at TEXT NOT NULL
  )`);

  // M2.5: test runs 表
  db.exec(`CREATE TABLE IF NOT EXISTS test_runs (
    id TEXT PRIMARY KEY,
    plan_id TEXT,
    req_id TEXT,
    run_type TEXT DEFAULT 'manual',
    status TEXT DEFAULT 'pending',
    total INTEGER DEFAULT 0,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    skipped INTEGER DEFAULT 0,
    duration_ms INTEGER,
    log TEXT DEFAULT '',
    started_at TEXT NOT NULL,
    completed_at TEXT
  )`);

  // M2.5: gate checks 表
  db.exec(`CREATE TABLE IF NOT EXISTS gate_checks (
    id TEXT PRIMARY KEY,
    req_id TEXT NOT NULL,
    from_stage TEXT NOT NULL,
    to_stage TEXT NOT NULL,
    check_type TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT 'pending',
    detail TEXT DEFAULT '',
    created_at TEXT NOT NULL
  )`);

  // M2.5: defects 表
  db.exec(`CREATE TABLE IF NOT EXISTS defects (
    id TEXT PRIMARY KEY,
    req_id TEXT NOT NULL,
    sub_task_id TEXT,
    test_run_id TEXT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    severity TEXT DEFAULT 'P2',
    status TEXT DEFAULT 'open',
    resolution TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  // ===== M6: Document Lifecycle =====

  // M6: documents 表（统一文档抽象）
  db.exec(`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    req_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    current_version INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`);

  // M6: document_versions 表（版本历史）
  db.exec(`CREATE TABLE IF NOT EXISTS document_versions (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    summary TEXT,
    author_id TEXT,
    author_agent TEXT,
    created_at TEXT NOT NULL
  )`);

  // M6: document_links 表（文档关联图）
  db.exec(`CREATE TABLE IF NOT EXISTS document_links (
    from_doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    to_doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    relation TEXT NOT NULL DEFAULT 'derives_from',
    created_at TEXT NOT NULL,
    PRIMARY KEY (from_doc_id, to_doc_id, relation)
  )`);

  // M6: attachments 表（替换 requirements.attachments JSON 字段）
  db.exec(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    req_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime TEXT,
    size INTEGER DEFAULT 0,
    sha256 TEXT,
    uploaded_by TEXT,
    storage_path TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  // M6: notifications 表
  db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    type TEXT NOT NULL,
    payload TEXT DEFAULT '{}',
    channel TEXT DEFAULT 'inapp',
    read_at TEXT,
    created_at TEXT NOT NULL,
    delivery_status TEXT DEFAULT 'pending'
  )`);

  // M6: notification_subscriptions 表
  db.exec(`CREATE TABLE IF NOT EXISTS notification_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'inapp',
    target TEXT,
    created_at TEXT NOT NULL
  )`);

  // M6: 迁移旧 requirements.attachments JSON 字段数据到 attachments 表
  try {
    const reqsWithAttachments = db.prepare(`SELECT id, attachments FROM requirements WHERE attachments IS NOT NULL AND attachments != '[]'`).all() as Array<{ id: string; attachments: string }>;
    for (const row of reqsWithAttachments) {
      try {
        const files = JSON.parse(row.attachments) as string[];
        for (const filename of files) {
          const existing = db.prepare('SELECT id FROM attachments WHERE req_id=? AND filename=?').get(row.id, filename);
          if (!existing) {
            const id = newId('att');
            db.prepare(
              `INSERT INTO attachments (id, req_id, filename, storage_path, created_at)
               VALUES (?, ?, ?, ?, ?)`
            ).run(id, row.id, filename, `${row.id}/${filename}`, new Date().toISOString());
          }
        }
      } catch { /* 解析失败则跳过 */ }
    }
  } catch { /* 旧字段不存在则跳过 */ }

  // M6: RG-05 events 表增加审计字段（兼容旧数据，忽略失败）
  try {
    db.exec(`ALTER TABLE events ADD COLUMN actor_role TEXT DEFAULT 'system'`);
  } catch { /* 已存在则忽略 */ }
  try {
    db.exec(`ALTER TABLE events ADD COLUMN target_type TEXT`);
  } catch { /* 已存在则忽略 */ }
  try {
    db.exec(`ALTER TABLE events ADD COLUMN target_id TEXT`);
  } catch { /* 已存在则忽略 */ }

  // M6: 创建 attachments 存储目录
  mkdirSync(resolve(DATA_DIR, 'attachments'), { recursive: true });

  // ===== M7: Testing & Defect Engineering =====

  // M7: defect_status_history 表
  db.exec(`CREATE TABLE IF NOT EXISTS defect_status_history (
    id TEXT PRIMARY KEY,
    defect_id TEXT NOT NULL REFERENCES defects(id) ON DELETE CASCADE,
    actor TEXT DEFAULT 'system',
    from_status TEXT,
    to_status TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  )`);

  // M7: test_cases 增加 legacyType 字段
  try {
    db.exec(`ALTER TABLE test_cases ADD COLUMN legacy_type TEXT`);
  } catch { /* 已存在则忽略 */ }

  // M7: 迁移旧 test_type → functional，原值写入 legacy_type
  const OLD_TEST_TYPES = ['unit', 'integration', 'e2e', 'acceptance', 'regression'];
  for (const oldType of OLD_TEST_TYPES) {
    db.prepare(`UPDATE test_cases SET legacy_type = test_type, test_type = 'functional' WHERE test_type = ?`).run(oldType);
  }

  // M7: defects 增加 wont_fix_reason 字段
  try {
    db.exec(`ALTER TABLE defects ADD COLUMN wont_fix_reason TEXT`);
  } catch { /* 已存在则忽略 */ }

  // M7: 迁移旧缺陷状态到新枚举
  db.prepare(`UPDATE defects SET status = 'pending_confirm' WHERE status = 'open'`).run();
  db.prepare(`UPDATE defects SET status = 'to_fix' WHERE status = 'in_progress'`).run();
  db.prepare(`UPDATE defects SET status = 'to_regress' WHERE status = 'resolved'`).run();
  // 'closed' 保持不变

  // M7: penTestAllowList 默认空（拒绝所有渗透测试直到显式配置）
  insertSetting.run('security.penTestAllowList', '[]');

  // M9: test_runs 增加 coverage_json 字段
  try { db.exec(`ALTER TABLE test_runs ADD COLUMN coverage_json TEXT`); } catch { /* 已存在则忽略 */ }

  // ===== M8: Release Closure =====

  // M8: release_runs 字段扩展（兼容旧表）
  try { db.exec(`ALTER TABLE release_runs ADD COLUMN pr_url TEXT`); } catch { /* 已存在则忽略 */ }
  try { db.exec(`ALTER TABLE release_runs ADD COLUMN pr_status TEXT`); } catch { /* 已存在则忽略 */ }
  try { db.exec(`ALTER TABLE release_runs ADD COLUMN release_branch TEXT`); } catch { /* 已存在则忽略 */ }
  try { db.exec(`ALTER TABLE release_runs ADD COLUMN production_verify_result TEXT`); } catch { /* 已存在则忽略 */ }

  // M8: users 表
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  // M8: settings 默认值
  insertSetting.run('archive.enabled', 'true');
  insertSetting.run('archive.afterDays', '7');
  insertSetting.run('release.healthCheckUrls', '[]');
  insertSetting.run('release.verifyMode', 'manual');
  insertSetting.run('git.provider', 'github');
  insertSetting.run('git.token', '');
  insertSetting.run('security.rbacEnabled', 'false');

  // M8: 首次启动自动 seed local-admin
  const adminExists = db.prepare("SELECT id FROM users WHERE username='local-admin'").get();
  if (!adminExists) {
    const hash = bcrypt.hashSync('local-admin', 10);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, username, display_name, role, password_hash, created_at, updated_at)
       VALUES (?, 'local-admin', 'Local Admin', 'admin', ?, ?, ?)`
    ).run(newId('usr'), hash, now, now);
  }
}

// 生成 nanoid 风格 ID（不依赖外部包）
export function newId(prefix: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}_${id}`;
}
