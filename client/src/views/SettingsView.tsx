import { useState, useEffect } from 'react';
import { Check, X, Plus, Sun, Moon, Monitor, FolderOpen, GitBranch, Trash2, RefreshCw } from 'lucide-react';
import { UiSelect } from '../components/ui';
import {
  useSettings, useUpdateSettings, useAgentAvailability, useTestConnection,
  useUsers, useCreateUser, useUpdateUser, useDeleteUser, useMe,
  useProjects, useScanProjects, useDeleteProject,
} from '../api/hooks';
import type { AIProvider } from '@devflow/shared';
import { useTheme } from '../hooks/useTheme';
import { DirPickerModal } from '../components/DirPickerModal';

interface ApiUser {
  id: string;
  username: string;
  displayName: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

// ─── styles ──────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  borderRadius: 8,
  padding: '20px 24px',
  marginBottom: 16,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '7px 16px',
  background: 'var(--accent-blue)',
  border: 'none',
  borderRadius: 4,
  color: 'var(--text-inverse)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
};

const btnSecondary: React.CSSProperties = {
  padding: '7px 16px',
  background: 'transparent',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 13,
};

const btnDanger: React.CSSProperties = {
  padding: '5px 10px',
  background: 'transparent',
  border: '1px solid var(--accent-red)',
  borderRadius: 4,
  color: 'var(--accent-red)',
  cursor: 'pointer',
  fontSize: 12,
};

// ─── sub-component: TestButton ────────────────────────────────────────────────

function TestButton({ provider }: { provider: Pick<AIProvider, 'type' | 'baseUrl' | 'apiKey' | 'model'> }) {
  const testConn = useTestConnection();
  const [result, setResult] = useState<{ ok: boolean; latencyMs?: number; message?: string; error?: string } | null>(null);

  function run() {
    setResult(null);
    testConn.mutate(
      { type: provider.type, baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model },
      {
        onSuccess: (r) => setResult(r),
        onError: (e) => setResult({ ok: false, error: e.message }),
      }
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button onClick={run} disabled={testConn.isPending} style={btnSecondary}>
        {testConn.isPending ? '测试中…' : '测试'}
      </button>
      {result && (
        <span style={{ fontSize: 12, color: result.ok ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {result.ok
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={14} /> 连通 {result.latencyMs}ms{result.message ? ' · ' + result.message : ''}</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={14} /> {result.error ?? '失败'}</span>}
        </span>
      )}
    </span>
  );
}

// ─── sub-component: AddProviderForm ──────────────────────────────────────────

interface AddProviderFormProps {
  onAdd: (p: AIProvider) => void;
  onCancel: () => void;
}

function AddProviderForm({ onAdd, onCancel }: AddProviderFormProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'claude-code' | 'openai-compatible'>('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const testConn = useTestConnection();
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; message?: string; error?: string } | null>(null);

  function runTest() {
    setTestResult(null);
    testConn.mutate(
      { type, baseUrl: baseUrl || undefined, apiKey: apiKey || undefined, model: model || undefined },
      {
        onSuccess: (r) => setTestResult(r),
        onError: (e) => setTestResult({ ok: false, error: e.message }),
      }
    );
  }

  function handleAdd() {
    if (!name.trim()) return;
    const id = `provider-${Date.now()}`;
    const p: AIProvider = {
      id,
      name: name.trim(),
      type,
      isDefault: false,
      ...(type === 'claude-code' ? {} : {
        baseUrl: baseUrl || undefined,
        apiKey: apiKey || undefined,
        model: model || undefined,
      }),
    };
    onAdd(p);
  }

  return (
    <div style={{ marginTop: 16, padding: '16px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border-default)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>添加供应商</div>

      {/* Name */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>名称 *</div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="例: DeepSeek API"
          style={inputStyle}
        />
      </div>

      {/* Type */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>类型</div>
        <div style={{ display: 'flex', gap: 16 }}>
          {(['claude-code', 'openai-compatible'] as const).map(t => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
              <input
                type="radio"
                name="addType"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                style={{ accentColor: 'var(--accent-blue)' }}
              />
              {t === 'claude-code' ? 'Claude Code CLI' : 'OpenAI Compatible'}
            </label>
          ))}
        </div>
      </div>

      {/* OpenAI-compatible fields */}
      {type === 'openai-compatible' && (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Base URL</div>
            <input
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>API Key</div>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>Model</div>
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="gpt-4o"
              style={inputStyle}
            />
          </div>
        </>
      )}

      {/* Test connection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <button onClick={runTest} disabled={testConn.isPending} style={btnSecondary}>
          {testConn.isPending ? '测试中…' : '测试连接'}
        </button>
        {testResult && (
          <span style={{ fontSize: 12, color: testResult.ok ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {testResult.ok
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={14} /> 连通 {testResult.latencyMs}ms{testResult.message ? ' · ' + testResult.message : ''}</span>
              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={14} /> {testResult.error ?? '失败'}</span>}
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleAdd} disabled={!name.trim()} style={btnPrimary}>添加</button>
        <button onClick={onCancel} style={btnSecondary}>取消</button>
      </div>
    </div>
  );
}

// ─── User Management ──────────────────────────────────────────────────────────

function UserManagement() {
  const { data: users, isLoading } = useUsers();
  const { data: me } = useMe();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', displayName: '', role: 'viewer' as string });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', role: 'viewer' as string, password: '' });

  const isAdmin = me?.role === 'admin';

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createUser.mutate({
      username: newUser.username,
      password: newUser.password,
      displayName: newUser.displayName || null,
      role: newUser.role,
    }, {
      onSuccess: () => { setShowForm(false); setNewUser({ username: '', password: '', displayName: '', role: 'viewer' }); },
    });
  }

  function startEdit(u: ApiUser) {
    setEditingId(u.id);
    setEditForm({ displayName: u.displayName ?? '', role: u.role, password: '' });
  }

  function handleEditSave() {
    if (!editingId) return;
    const patch: Record<string, unknown> = { displayName: editForm.displayName || null, role: editForm.role };
    if (editForm.password) patch.password = editForm.password;
    updateUser.mutate({ id: editingId, patch }, {
      onSuccess: () => setEditingId(null),
    });
  }

  if (isLoading) return <div style={{ color: 'var(--text-tertiary)' }}>加载中...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>用户管理</div>
        {isAdmin && (
          <button onClick={() => setShowForm(v => !v)} style={btnPrimary}>
            {showForm ? '取消' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={14} /> 添加用户</span>}
          </button>
        )}
      </div>

      {showForm && isAdmin && (
        <form onSubmit={handleCreate} style={{ marginBottom: 16, padding: 16, background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border-default)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>用户名 *</div>
              <input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>密码 *</div>
              <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>角色</div>
              <UiSelect
                value={newUser.role}
                onChange={v => setNewUser({ ...newUser, role: v })}
                options={[
                  { value: 'admin', label: 'admin' },
                  { value: 'pm', label: 'pm' },
                  { value: 'dev', label: 'dev' },
                  { value: 'qa', label: 'qa' },
                  { value: 'viewer', label: 'viewer' },
                ]}
              />
            </div>
            <button type="submit" disabled={!newUser.username || !newUser.password || createUser.isPending} style={btnPrimary}>
              添加
            </button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(users ?? []).map(u => (
          <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border-default)' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--text-inverse)', fontWeight: 600 }}>
              {(u.displayName ?? u.username).charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                {u.displayName ?? u.username}
                {u.id === me?.id && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-blue)' }}>(我)</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{u.username} · {u.role}</div>
            </div>

            {editingId === u.id ? (
              <>
                <input value={editForm.displayName} onChange={e => setEditForm({ ...editForm, displayName: e.target.value })} placeholder="显示名" style={{ ...inputStyle, width: 120 }} />
                <UiSelect
                  value={editForm.role}
                  onChange={v => setEditForm({ ...editForm, role: v })}
                  options={[
                    { value: 'admin', label: 'admin' },
                    { value: 'pm', label: 'pm' },
                    { value: 'dev', label: 'dev' },
                    { value: 'qa', label: 'qa' },
                    { value: 'viewer', label: 'viewer' },
                  ]}
                  style={{ width: 100 }}
                />
                <input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="新密码(留空不改)" style={{ ...inputStyle, width: 140 }} />
                <button onClick={handleEditSave} style={btnPrimary}>保存</button>
                <button onClick={() => setEditingId(null)} style={btnSecondary}>取消</button>
              </>
            ) : (
              <>
                {(isAdmin || u.id === me?.id) && (
                  <button onClick={() => startEdit(u)} style={btnSecondary}>编辑</button>
                )}
                {isAdmin && u.id !== me?.id && (
                  <button onClick={() => deleteUser.mutate(u.id)} style={btnDanger}>删除</button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── sub-component: ReposTab ─────────────────────────────────────────────────

function ReposTab() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: projects = [] } = useProjects();
  const scanProjects = useScanProjects();
  const deleteProject = useDeleteProject();
  const [scanDirs, setScanDirs] = useState<string[]>([]);
  const [newDir, setNewDir] = useState('');
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!settings) return;
    try {
      const parsed = settings.scanDirs ? JSON.parse(settings.scanDirs) : [];
      setScanDirs(parsed);
    } catch { /* */ }
  }, [settings]);

  function saveDirs(next: string[]) {
    setScanDirs(next);
    updateSettings.mutate({ scanDirs: JSON.stringify(next) });
  }

  function addDir(path?: string) {
    const trimmed = (path ?? newDir).trim();
    if (!trimmed || scanDirs.includes(trimmed)) return;
    saveDirs([...scanDirs, trimmed]);
    setNewDir('');
  }

  function removeDir(dir: string) {
    saveDirs(scanDirs.filter(d => d !== dir));
  }

  function handleAddClick() {
    if (newDir.trim()) {
      addDir();
    } else {
      setShowPicker(true);
    }
  }

  async function handleScan() {
    if (scanDirs.length === 0) return;
    setScanResult(null);
    scanProjects.mutate(
      { root: scanDirs },
      {
        onSuccess: (r) => setScanResult(`扫描完成，共发现 ${r.scanned} 个仓库`),
        onError: (e) => setScanResult(`扫描失败: ${e.message}`),
      }
    );
  }

  return (
    <div>
      {showPicker && (
        <DirPickerModal
          onSelect={(path) => { addDir(path); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Scan directories */}
      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>扫描目录</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
          添加目录后点击扫描，系统会递归查找所有 Git 仓库（含子目录）
        </div>

        {/* Directory list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {scanDirs.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>暂无目录，点击下方添加</div>
          )}
          {scanDirs.map(dir => (
            <div key={dir} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border-default)' }}>
              <FolderOpen size={14} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir}</span>
              <button onClick={() => removeDir(dir)} style={{ ...btnDanger, padding: '3px 8px', display: 'flex', alignItems: 'center' }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Add dir input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            value={newDir}
            onChange={e => setNewDir(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addDir()}
            placeholder="输入路径或点击添加浏览目录…"
            style={{ ...inputStyle, flex: 1, fontFamily: 'monospace' }}
          />
          <button onClick={handleAddClick} style={btnSecondary}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={14} /> 添加</span>
          </button>
        </div>

        {/* Scan button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleScan}
            disabled={scanDirs.length === 0 || scanProjects.isPending}
            style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} style={scanProjects.isPending ? { animation: 'spin 1s linear infinite' } : undefined} />
            {scanProjects.isPending ? '扫描中…' : '扫描所有目录'}
          </button>
          {scanResult && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{scanResult}</span>
          )}
        </div>
      </div>

      {/* Discovered repos */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>已发现仓库</div>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{projects.length} 个</span>
        </div>

        {projects.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>暂无仓库，请先添加目录并扫描</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {projects.map(p => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border-default)' }}>
              <GitBranch size={14} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.path}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {p.branch && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4 }}>{p.branch}</span>
                )}
                {p.lang && (
                  <span style={{ fontSize: 11, color: 'var(--accent-blue)', background: 'var(--accent-blue-10)', padding: '2px 6px', borderRadius: 4 }}>{p.lang}</span>
                )}
                <button
                  onClick={() => deleteProject.mutate(p.name)}
                  disabled={deleteProject.isPending}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }}
                  title="移除仓库"
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-red)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function SettingsView({ onRerunOnboarding }: { onRerunOnboarding: () => void }) {
  const { data: settings } = useSettings();
  const { data: availData } = useAgentAvailability();
  const updateSettings = useUpdateSettings();
  const { data: me } = useMe();
  const { mode, setMode } = useTheme();

  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxySaved, setProxySaved] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'ai' | 'repos' | 'users'>('ai');

  // On load: populate providers from settings, then auto-add detected claude-code if missing
  useEffect(() => {
    if (!settings) return;

    let parsed: AIProvider[] = [];
    try {
      parsed = settings.aiProviders ? JSON.parse(settings.aiProviders) : [];
    } catch { /* */ }

    setProxyUrl(settings.proxyUrl ?? '');

    // Auto-populate claude-code entries from availability API
    if (availData?.agents) {
      const existing = new Set(parsed.filter(p => p.type === 'claude-code').map(p => p.cliPath ?? 'claude'));
      const toAdd: AIProvider[] = [];
      for (const [name, info] of Object.entries(availData.agents)) {
        if (!info.present) continue;
        const cliPath = info.path ?? name;
        if (!existing.has(cliPath)) {
          toAdd.push({
            id: `claude-code-${name}`,
            name: name === 'claude' || name === 'claude-code' ? 'Claude Code' : name,
            type: 'claude-code',
            cliPath,
            isDefault: parsed.length === 0 && toAdd.length === 0,
          });
        }
      }
      if (toAdd.length > 0) {
        parsed = [...toAdd, ...parsed];
      }
    }

    setProviders(parsed);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, availData]);

  function saveProviders(next: AIProvider[]) {
    setProviders(next);
    updateSettings.mutate({ aiProviders: JSON.stringify(next) });
  }

  function setDefault(id: string) {
    saveProviders(providers.map(p => ({ ...p, isDefault: p.id === id })));
  }

  function deleteProvider(id: string) {
    saveProviders(providers.filter(p => p.id !== id));
  }

  function addProvider(p: AIProvider) {
    const next = [...providers, p];
    saveProviders(next);
    setShowAddForm(false);
  }

  function saveProxy() {
    updateSettings.mutate({ proxyUrl }, {
      onSuccess: () => {
        setProxySaved(true);
        setTimeout(() => setProxySaved(false), 2000);
      },
    });
  }

  const isAdmin = me?.role === 'admin';

  return (
    <div style={{ padding: 32, maxWidth: 800, color: 'var(--text-primary)' }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>设置</div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-default)' }}>
        <button
          onClick={() => setActiveTab('ai')}
          style={{
            padding: '8px 16px', border: 'none', background: 'transparent',
            color: activeTab === 'ai' ? 'var(--accent-blue)' : 'var(--text-tertiary)', cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
            borderBottom: activeTab === 'ai' ? '2px solid var(--accent-blue)' : '2px solid transparent',
          }}
        >
          AI 与网络
        </button>
        <button
          onClick={() => setActiveTab('repos')}
          style={{
            padding: '8px 16px', border: 'none', background: 'transparent',
            color: activeTab === 'repos' ? 'var(--accent-blue)' : 'var(--text-tertiary)', cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
            borderBottom: activeTab === 'repos' ? '2px solid var(--accent-blue)' : '2px solid transparent',
          }}
        >
          代码仓库
        </button>
        <button
          onClick={() => setActiveTab('users')}
          style={{
            padding: '8px 16px', border: 'none', background: 'transparent',
            color: activeTab === 'users' ? 'var(--accent-blue)' : 'var(--text-tertiary)', cursor: 'pointer',
            fontSize: 14, fontWeight: 600,
            borderBottom: activeTab === 'users' ? '2px solid var(--accent-blue)' : '2px solid transparent',
          }}
        >
          用户管理
        </button>
      </div>

      {activeTab === 'ai' && (
        <>
          {/* ── AI 供应商 ── */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>AI 供应商</div>
              <button onClick={() => setShowAddForm(v => !v)} style={btnPrimary}>
                {showAddForm ? '取消' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={14} /> 添加</span>}
              </button>
            </div>

            {providers.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '8px 0' }}>暂无供应商，点击「+ 添加」配置</div>
            )}

            {providers.map(p => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  marginBottom: 8,
                  background: 'var(--bg-primary)',
                  borderRadius: 6,
                  border: p.isDefault ? '1px solid var(--accent-blue)' : '1px solid var(--border-default)',
                }}
              >
                {/* Left: dot + info */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{
                    marginTop: 3,
                    width: 8, height: 8, borderRadius: '50%',
                    background: p.isDefault ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                    flexShrink: 0,
                    display: 'inline-block',
                  }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {p.name}
                      {p.isDefault && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', borderRadius: 3, padding: '1px 5px' }}>
                          默认
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {p.type === 'claude-code'
                        ? (p.cliPath ?? 'claude')
                        : `openai-compatible · ${p.model ?? ''}${p.baseUrl ? ' · ' + p.baseUrl : ''}`}
                    </div>
                  </div>
                </div>

                {/* Right: actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 12 }}>
                  {!p.isDefault && (
                    <button onClick={() => setDefault(p.id)} style={btnSecondary} title="设为默认">
                      设为默认
                    </button>
                  )}
                  <TestButton provider={p} />
                  <button onClick={() => deleteProvider(p.id)} style={btnDanger} title="删除"><X size={12} /></button>
                </div>
              </div>
            ))}

            {showAddForm && (
              <AddProviderForm onAdd={addProvider} onCancel={() => setShowAddForm(false)} />
            )}
          </div>

          {/* ── 网络代理 ── */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>网络代理</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
              代理地址（留空则直连）
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={proxyUrl}
                onChange={e => setProxyUrl(e.target.value)}
                placeholder="http://127.0.0.1:15236"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={saveProxy} disabled={updateSettings.isPending} style={btnPrimary}>
                {proxySaved ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>已保存 <Check size={12} /></span> : '保存'}
              </button>
            </div>
          </div>

          {/* ── 外观 ── */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>外观</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {([
                { key: 'light' as const, label: '浅色', icon: <Sun size={16} /> },
                { key: 'dark' as const, label: '深色', icon: <Moon size={16} /> },
                { key: 'system' as const, label: '跟随系统', icon: <Monitor size={16} /> },
              ]).map((t) => {
                const active = mode === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setMode(t.key)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '14px 8px',
                      borderRadius: 10,
                      border: active ? '1px solid var(--accent-blue)' : '1px solid var(--border-default)',
                      background: active ? 'var(--accent-blue-10)' : 'var(--bg-primary)',
                      color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 12,
                      transition: 'all 0.15s',
                    }}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 其他 ── */}
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>其他</div>
            <button onClick={onRerunOnboarding} style={btnSecondary}>
              重新运行初始化向导
            </button>
          </div>
        </>
      )}

      {activeTab === 'repos' && <ReposTab />}

      {activeTab === 'users' && (
        <div style={card}>
          <UserManagement />
        </div>
      )}
    </div>
  );
}
