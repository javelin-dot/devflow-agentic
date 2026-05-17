import { useState } from 'react';
import { Plus } from 'lucide-react';
import { UiSelect } from '../components/ui';
import { useReleaseRuns, useCancelRelease, useVerifyProduction } from '../api/hooks';
import type { ReleaseRun, ReleaseMode, ReleaseState } from '@devflow/shared';
import { ConflictResolutionView } from './ConflictResolutionView';

const TERMINAL_STATES: ReleaseState[] = ['done', 'error', 'cancelled'];

function modeBadge(mode: ReleaseMode) {
  const map: Record<ReleaseMode, { label: string; bg: string }> = {
    mergePublish: { label: 'Merge+Publish', bg: 'var(--accent-blue)' },
    release: { label: 'Release', bg: 'var(--accent-purple)' },
    quickPublish: { label: 'QuickPublish', bg: 'var(--accent-green)' },
  };
  const { label, bg } = map[mode] ?? { label: mode, bg: 'var(--bg-tertiary)' };
  return (
    <span style={{ background: bg, color: 'var(--text-primary)', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
      {label}
    </span>
  );
}

function stateBadge(state: ReleaseState) {
  const map: Record<ReleaseState, string> = {
    idle: 'var(--text-tertiary)',
    preparing: 'var(--accent-blue)',
    merging: 'var(--accent-blue)',
    'paused-conflict': 'var(--accent-orange)',
    pushing: 'var(--accent-blue)',
    waiting_pr_review: 'var(--accent-purple)',
    triggering: 'var(--accent-blue)',
    production_verifying: 'var(--accent-orange)',
    merged_back: 'var(--accent-green)',
    done: 'var(--accent-green)',
    error: 'var(--accent-red)',
    cancelled: 'var(--text-tertiary)',
  };
  const bg = map[state] ?? 'var(--text-tertiary)';
  return (
    <span style={{ background: bg, color: 'var(--text-primary)', borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
      {state}
    </span>
  );
}

function formatTs(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN');
}

interface StartModalProps {
  onClose: () => void;
}

function StartModal({ onClose }: StartModalProps) {
  const [reqId, setReqId] = useState('');
  const [mode, setMode] = useState<ReleaseMode>('mergePublish');
  const [log, setLog] = useState('');
  const [running, setRunning] = useState(false);

  async function handleSubmit() {
    setRunning(true);
    setLog('');
    try {
      const resp = await fetch('/api/release/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId: reqId || undefined, mode }),
      });
      if (!resp.body) throw new Error('No response body');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.slice(6)) as { message?: string; type?: string };
              if (ev.message) setLog(prev => prev + ev.message);
              if (ev.type === 'done' || ev.type === 'error') {
                setRunning(false);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      setLog(prev => prev + `\nError: ${(err as Error).message}`);
    }
    setRunning(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, padding: 28, width: 480, maxWidth: '95vw' }}>
        <h3 style={{ margin: '0 0 20px', color: 'var(--text-primary)' }}>新建发布</h3>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4, fontSize: 13 }}>需求 ID (可选)</label>
          <input
            value={reqId}
            onChange={e => setReqId(e.target.value)}
            placeholder="req_xxxxx"
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 6, padding: '8px 10px' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 4, fontSize: 13 }}>模式</label>
          <UiSelect
            value={mode}
            onChange={v => setMode(v as ReleaseMode)}
            options={[
              { value: 'mergePublish', label: 'Merge + Publish' },
              { value: 'release', label: 'Release' },
              { value: 'quickPublish', label: 'Quick Publish' },
            ]}
          />
        </div>

        {log && (
          <pre style={{
            background: 'var(--bg-code)', color: 'var(--accent-green-light)', fontFamily: 'monospace', fontSize: 12,
            padding: 12, borderRadius: 6, maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap',
            marginBottom: 16,
          }}>
            {log}
          </pre>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            关闭
          </button>
          <button
            onClick={handleSubmit}
            disabled={running}
            style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: running ? 'var(--text-tertiary)' : 'var(--accent-blue)', color: 'var(--text-inverse)', cursor: running ? 'not-allowed' : 'pointer' }}
          >
            {running ? '发布中...' : '开始发布'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface RunRowProps {
  run: ReleaseRun;
  onCancel: (id: string) => void;
}

function RunRow({ run, onCancel }: RunRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isTerminal = TERMINAL_STATES.includes(run.state);
  const isConflict = run.state === 'paused-conflict';
  const isProductionVerifying = run.state === 'production_verifying';
  const verifyMut = useVerifyProduction();

  return (
    <>
      <tr
        style={{ cursor: 'pointer', borderBottom: '1px solid var(--bg-tertiary)' }}
        onClick={() => setExpanded(v => !v)}
      >
        <td style={{ padding: '10px 12px' }}>{modeBadge(run.mode)}</td>
        <td style={{ padding: '10px 12px' }}>{stateBadge(run.state)}</td>
        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{run.reqId ?? '—'}</td>
        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{formatTs(run.startedAt)}</td>
        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>{formatTs(run.completedAt)}</td>
        <td style={{ padding: '10px 12px' }}>
          {!isTerminal && (
            <button
              onClick={e => { e.stopPropagation(); onCancel(run.id); }}
              style={{ padding: '4px 12px', borderRadius: 4, border: '1px solid var(--accent-red)', background: 'transparent', color: 'var(--accent-red)', cursor: 'pointer', fontSize: 12 }}
            >
              取消
            </button>
          )}
          {run.jenkinsBuildUrl && (
            <a
              href={run.jenkinsBuildUrl}
              target="_blank"
              rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ marginLeft: 8, color: 'var(--accent-blue)', fontSize: 12 }}
            >
              CI构建
            </a>
          )}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'var(--bg-primary)' }}>
          <td colSpan={6} style={{ padding: '12px 16px' }}>
            {/* PR Card */}
            {run.prUrl && (
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: 6, padding: 12, marginBottom: 12,
                border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Pull Request</div>
                  <a href={run.prUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent-blue)' }}>
                    {run.prUrl}
                  </a>
                </div>
                {run.prStatus && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: run.prStatus === 'approved' ? 'var(--accent-green-22)' : run.prStatus === 'changes_requested' ? 'var(--accent-red-22)' : 'var(--accent-blue-22)',
                    color: run.prStatus === 'approved' ? 'var(--accent-green)' : run.prStatus === 'changes_requested' ? 'var(--accent-red)' : 'var(--accent-blue)',
                    border: `1px solid ${run.prStatus === 'approved' ? 'var(--accent-green-44)' : run.prStatus === 'changes_requested' ? 'var(--accent-red-44)' : 'var(--accent-blue-44)'}`,
                  }}>
                    {run.prStatus}
                  </span>
                )}
              </div>
            )}

            {/* Production Verification */}
            {isProductionVerifying && (
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: 6, padding: 12, marginBottom: 12,
                border: '1px solid var(--border-default)',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>生产验证</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => verifyMut.mutate({ id: run.id, verdict: 'accepted' })}
                    disabled={verifyMut.isPending}
                    style={{
                      padding: '6px 14px', borderRadius: 4, border: 'none',
                      background: 'var(--accent-green)', color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    验证通过
                  </button>
                  <button
                    onClick={() => verifyMut.mutate({ id: run.id, verdict: 'rejected' })}
                    disabled={verifyMut.isPending}
                    style={{
                      padding: '6px 14px', borderRadius: 4, border: '1px solid var(--accent-red)',
                      background: 'transparent', color: 'var(--accent-red)', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    验证失败
                  </button>
                </div>
              </div>
            )}

            {/* Merge-back info */}
            {run.state === 'merged_back' && (
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: 6, padding: 12, marginBottom: 12,
                border: '1px solid var(--accent-green-44)', color: 'var(--accent-green)', fontSize: 13,
              }}>
                已自动合并回 master 分支
              </div>
            )}

            {isConflict && (
              <div style={{ marginBottom: 16 }}>
                <ConflictResolutionView runId={run.id} onResolved={() => setExpanded(false)} />
              </div>
            )}
            <pre style={{
              background: 'var(--bg-code)', color: 'var(--accent-green-light)', fontFamily: 'monospace', fontSize: 12,
              padding: 12, borderRadius: 6, maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap',
              margin: 0,
            }}>
              {run.log || '(no log)'}
            </pre>
            {run.error && (
              <div style={{ color: 'var(--accent-red)', marginTop: 8, fontSize: 13 }}>
                Error: {run.error}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function ReleaseView() {
  const [showModal, setShowModal] = useState(false);
  const [filterReqId, setFilterReqId] = useState('');
  const { data: allRuns = [], isLoading } = useReleaseRuns();
  const cancelMut = useCancelRelease();

  const runs = filterReqId
    ? allRuns.filter(r => r.reqId === filterReqId)
    : allRuns;

  return (
    <div style={{ padding: 24, background: 'var(--bg-primary)', minHeight: '100%', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>发布管理</h2>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: 'var(--accent-blue)', color: 'var(--text-inverse)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Plus size={16} /> 新建发布
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>筛选需求ID:</span>
        <input
          value={filterReqId}
          onChange={e => setFilterReqId(e.target.value)}
          placeholder="全部"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', color: 'var(--text-primary)', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: 160 }}
        />
        {filterReqId && (
          <button
            onClick={() => setFilterReqId('')}
            style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
          >
            清除
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>加载中...</div>
      ) : runs.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', padding: 40, textAlign: 'center' }}>暂无发布记录</div>
      ) : (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 500 }}>模式</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 500 }}>状态</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 500 }}>需求ID</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 500 }}>开始时间</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 500 }}>完成时间</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 13, fontWeight: 500 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <RunRow
                  key={run.id}
                  run={run}
                  onCancel={(id) => cancelMut.mutate({ id })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <StartModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
