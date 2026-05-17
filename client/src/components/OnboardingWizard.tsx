import { useState, useEffect } from 'react';
import { apiFetch } from '../api/client';
import { Zap, FolderOpen, Check, AlertCircle } from 'lucide-react';
import { UiBadge } from '../components/ui';

interface Props {
  onComplete: () => void;
}

interface HealthStatus {
  status: string;
  uptimeSeconds: number;
  dbSizeKb: number;
  nodeVersion: string;
  platform: string;
}

interface EnvCheck {
  present: boolean;
  version?: string;
  message?: string;
}

interface ScannedProject {
  name: string;
  lang: string | null;
  path: string;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ['系统检测', '项目扫描', 'AI 配置', '完成设置'];

function StepDots({ current }: { current: Step }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {([1, 2, 3, 4] as Step[]).map(s => (
        <div
          key={s}
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: s < current ? 'var(--accent-green)' : s === current ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  );
}

export function OnboardingWizard({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [envChecks, setEnvChecks] = useState<Record<string, EnvCheck> | null>(null);

  // Step 2 state
  const [gitRoot, setGitRoot] = useState('');
  const [scannedProjects, setScannedProjects] = useState<ScannedProject[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Step 3 state
  const [agents, setAgents] = useState<Record<string, { present: boolean; path?: string }>>({});
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Step 1: auto-fetch health + env checks on mount
  useEffect(() => {
    apiFetch<HealthStatus>('/health')
      .then(setHealth)
      .catch(e => setHealthError(String(e.message ?? e)));
    apiFetch<Record<string, EnvCheck>>('/system/env-checks')
      .then(setEnvChecks)
      .catch(() => setEnvChecks({}));
  }, []);

  // Step 3: load agent availability when entering step 3
  useEffect(() => {
    if (step === 3) {
      setAgentsLoading(true);
      apiFetch<{ agents: Record<string, { present: boolean; path?: string }> }>('/agent/availability')
        .then(data => { setAgents(data.agents ?? {}); setAgentsLoading(false); })
        .catch(() => setAgentsLoading(false));
    }
  }, [step]);

  async function handlePickFolder() {
    setPicking(true);
    setScanError(null);
    try {
      const data = await apiFetch<{ path: string | null; hasGit: boolean }>('/pick-folder');
      if (data.path) {
        setGitRoot(data.path);
        if (!data.hasGit) {
          setScanError('所选目录下未找到 .git，将尝试扫描子目录中的 Git 仓库');
        }
        // 自动触发扫描
        await handleScanWith(data.path);
      }
    } catch {
      setScanError('无法打开文件夹选择器');
    } finally {
      setPicking(false);
    }
  }

  async function handleScanWith(root: string) {
    setScanning(true);
    setScanError(null);
    try {
      const data = await apiFetch<{ projects: ScannedProject[] }>('/projects/scan', {
        method: 'POST',
        body: JSON.stringify({ root }),
      });
      setScannedProjects(data.projects ?? []);
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }

  async function handleScan() {
    if (!gitRoot.trim()) return;
    await handleScanWith(gitRoot.trim());
  }

  async function handleComplete() {
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify({ onboardingDone: 'true' }),
      });
    } catch { /* ignore */ }
    onComplete();
  }

  const availableAgents = Object.entries(agents).filter(([, v]) => v.present);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-primary)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        width: 500,
        background: 'var(--bg-secondary)',
        borderRadius: 12,
        padding: 32,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Title + skip */}
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 8 }}>
          <button
            onClick={handleComplete}
            title="跳过向导"
            style={{
              position: 'absolute', top: 0, right: 0,
              background: 'none', border: 'none', color: 'var(--text-tertiary)',
              cursor: 'pointer', fontSize: 12, padding: '2px 6px',
            }}
          >
            跳过
          </button>
          <div style={{ fontSize: 24, color: 'var(--accent-blue)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Zap size={28} /> DevFlow
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>初始化向导 — {STEP_LABELS[step - 1]}</div>
        </div>

        <div style={{ margin: '20px 0' }}>
          <StepDots current={step} />
        </div>

        {/* Step 1: 系统检测 */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>系统检测</div>
            {healthError ? (
              <div style={{ color: 'var(--accent-red)', marginBottom: 16, fontSize: 13 }}>
                <AlertCircle size={14} color="var(--accent-red)" style={{ display: 'inline', marginRight: 4 }} /> 连接失败: {healthError}
              </div>
            ) : health ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>状态</span>
                  <span style={{ color: 'var(--accent-green)', fontWeight: 600 }}><Check size={14} /> 正常</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>数据库大小</span>
                  <span style={{ color: 'var(--text-primary)' }}>{health.dbSizeKb} KB</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>运行时间</span>
                  <span style={{ color: 'var(--text-primary)' }}>{Math.floor(health.uptimeSeconds / 60)} 分钟</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>平台</span>
                  <span style={{ color: 'var(--text-primary)' }}>{health.platform}</span>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-tertiary)', marginBottom: 20, fontSize: 13 }}>检测中...</div>
            )}

            {/* Env checks: Node / Git / SSH */}
            {envChecks && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>环境依赖</div>
                {Object.entries(envChecks).map(([name, check]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{name.toUpperCase()}</span>
                    <span style={{ color: check.present ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
                      {check.present ? `<Check size={14} /> ${check.version ?? ''}` : `<AlertCircle size={14} color="var(--accent-red)" style={{ display: 'inline', marginRight: 4 }} /> ${check.message ?? '未找到'}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setStep(2)}
              disabled={!health && !healthError}
              style={{
                width: '100%', padding: '10px', background: 'var(--accent-blue)', border: 'none',
                borderRadius: 6, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              }}
            >
              下一步
            </button>
          </div>
        )}

        {/* Step 2: 项目扫描 */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>添加代码仓库</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>选择存放项目代码的文件夹，可跳过稍后再添加</div>

            {/* 点击选择文件夹 */}
            <div
              onClick={picking || scanning ? undefined : handlePickFolder}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 14px',
                background: 'var(--bg-primary)',
                border: `1px solid ${gitRoot ? 'var(--accent-blue-66)' : 'var(--bg-tertiary)'}`,
                borderRadius: 6,
                cursor: picking || scanning ? 'wait' : 'pointer',
                marginBottom: 8,
                transition: 'border-color 0.2s',
              }}
            >
              <FolderOpen size={20} color="var(--text-secondary)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                {picking ? (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>正在打开文件夹选择器...</span>
                ) : gitRoot ? (
                  <>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gitRoot}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>点击重新选择</div>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>点击选择文件夹…</span>
                )}
              </div>
              {scanning && <span style={{ fontSize: 12, color: 'var(--accent-blue)' }}>扫描中…</span>}
            </div>

            {scanError && (
              <div style={{ color: 'var(--accent-orange)', fontSize: 12, marginBottom: 8, padding: '6px 10px', background: 'var(--accent-orange-10)', borderRadius: 4 }}>
                {scanError}
              </div>
            )}

            {scannedProjects.length > 0 && (
              <div style={{ marginBottom: 12, maxHeight: 150, overflowY: 'auto' }}>
                <div style={{ fontSize: 12, color: 'var(--accent-green)', marginBottom: 6 }}><Check size={14} /> 找到 {scannedProjects.length} 个仓库</div>
                {scannedProjects.map(p => (
                  <div key={p.name} style={{
                    padding: '6px 10px',
                    background: 'var(--bg-primary)',
                    borderRadius: 4,
                    marginBottom: 4,
                    fontSize: 12,
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{p.name}</span>
                    {p.lang && <span style={{ color: 'var(--text-tertiary)' }}>{p.lang}</span>}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setStep(3)}
              style={{
                width: '100%', padding: '10px', background: 'var(--accent-blue)', border: 'none',
                borderRadius: 6, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 14, fontWeight: 500,
                marginTop: 4,
              }}
            >
              {scannedProjects.length > 0 ? `已添加 ${scannedProjects.length} 个仓库，下一步 →` : '跳过，下一步 →'}
            </button>
          </div>
        )}

        {/* Step 3: AI 配置 */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>AI 配置</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              DevFlow 使用系统已安装的 claude CLI 执行 Agent 任务
            </div>
            {agentsLoading ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13, marginBottom: 16 }}>检测中...</div>
            ) : availableAgents.length > 0 ? (
              <div style={{ marginBottom: 16 }}>
                {availableAgents.map(([name]) => (
                  <div key={name} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 4, marginBottom: 6,
                  }}>
                    <span style={{ color: 'var(--accent-green)', fontSize: 14 }}><Check size={14} /></span>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: 16, padding: '12px', background: 'var(--bg-primary)', borderRadius: 6, fontSize: 12, color: 'var(--accent-orange)' }}>
                请先安装 claude CLI:<br />
                <code style={{ color: 'var(--accent-blue)' }}>npm install -g @anthropic-ai/claude-code</code>
              </div>
            )}
            <button
              onClick={() => setStep(4)}
              style={{
                width: '100%', padding: '10px', background: 'var(--accent-blue)', border: 'none',
                borderRadius: 6, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 14, fontWeight: 500,
              }}
            >
              下一步
            </button>
          </div>
        )}

        {/* Step 4: 完成设置 */}
        {step === 4 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, color: 'var(--accent-green)', marginBottom: 16 }}><Check size={14} /></div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>设置完成</div>
            <div style={{ marginBottom: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>摘要：</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                已扫描项目：{scannedProjects.length} 个
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                可用 Agent：{availableAgents.length > 0 ? availableAgents.map(([n]) => n).join(', ') : '无（可跳过）'}
              </div>
            </div>
            <button
              onClick={handleComplete}
              style={{
                width: '100%', padding: '12px', background: 'var(--accent-green)', border: 'none',
                borderRadius: 6, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              完成并进入看板
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
