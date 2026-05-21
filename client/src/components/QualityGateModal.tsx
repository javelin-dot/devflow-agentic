import { useState } from 'react';
import { Check, X, Minus, HelpCircle } from 'lucide-react';
import type { GateCheckEvent, GateCheckResult } from '@devflow/shared';
import { UiBadge } from '../components/ui';
import { authHeaders } from '../api/client';

interface CheckItem {
  checkType: string;
  result: GateCheckResult;
  detail: string;
}

function ResultBadge({ result }: { result: GateCheckResult }) {
  const variantMap: Record<GateCheckResult, 'success' | 'error' | 'default' | 'warning'> = {
    passed: 'success',
    failed: 'error',
    skipped: 'default',
    pending: 'warning',
  };
  const iconMap: Record<GateCheckResult, React.ReactNode> = {
    passed: <Check size={12} />,
    failed: <X size={12} />,
    skipped: <Minus size={12} />,
    pending: <HelpCircle size={12} />,
  };
  return (
    <UiBadge variant={variantMap[result]}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {iconMap[result]}
        {result}
      </span>
    </UiBadge>
  );
}

export interface QualityGateModalProps {
  reqId: string;
  fromStage: string;
  toStage: string;
  onPassed: () => void;
  onClose: () => void;
}

export function QualityGateModal({ reqId, fromStage, toStage, onPassed, onClose }: QualityGateModalProps) {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [running, setRunning] = useState(false);
  const [allPassed, setAllPassed] = useState<boolean | null>(null);
  const [doneMessage, setDoneMessage] = useState('');
  const [error, setError] = useState('');

  const handleRun = async () => {
    setRunning(true);
    setChecks([]);
    setAllPassed(null);
    setDoneMessage('');
    setError('');

    const resp = await fetch('/api/gate-checks/run', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reqId, fromStage, toStage }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      setError(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
      setRunning(false);
      return;
    }

    if (!resp.body) {
      setError('门禁检查响应为空');
      setRunning(false);
      return;
    }
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
        if (line.startsWith('data:')) {
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw) as GateCheckEvent;
            if (evt.type === 'check_result' && evt.checkType) {
              setChecks(prev => {
                const next = prev.filter(c => c.checkType !== evt.checkType);
                return [...next, {
                  checkType: evt.checkType!,
                  result: evt.result ?? 'pending',
                  detail: evt.detail ?? '',
                }];
              });
            } else if (evt.type === 'done') {
              setAllPassed(evt.allPassed ?? false);
              setDoneMessage(evt.message ?? '');
            }
          } catch { /* ignore */ }
        }
      }
    }
    setRunning(false);
  };

  const canProceed = allPassed === true || (allPassed !== null && checks.every(c => c.result === 'passed' || c.result === 'skipped'));

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 12, padding: 28,
        width: 480, maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto',
        border: '1px solid var(--bg-tertiary)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
            阶段门禁: {fromStage} → {toStage}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', fontSize: 20, cursor: 'pointer' }}
          ><X size={20} /></button>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          需求: <span style={{ color: 'var(--accent-blue)' }}>{reqId}</span>
        </div>

        {/* Run button */}
        <button
          onClick={() => { void handleRun(); }}
          disabled={running}
          style={{
            background: running ? 'var(--bg-tertiary)' : 'var(--accent-blue)',
            border: 'none', borderRadius: 6, color: 'var(--text-inverse)',
            padding: '8px 20px', cursor: running ? 'not-allowed' : 'pointer',
            fontSize: 14, fontWeight: 600, marginBottom: 20, width: '100%',
          }}
        >{running ? '检查中...' : '运行检查'}</button>

        {/* Check results */}
        {error && (
          <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 16, background: 'var(--gate-fail-bg)', color: 'var(--text-inverse)', fontSize: 13 }}>
            {error}
          </div>
        )}

        {checks.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {checks.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 0', borderBottom: '1px solid var(--bg-tertiary)',
              }}>
                <ResultBadge result={c.result} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{c.checkType}</div>
                  {c.detail && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{c.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Done message */}
        {doneMessage && (
          <div style={{
            padding: '8px 12px', borderRadius: 6, marginBottom: 16,
            background: canProceed ? 'var(--gate-pass-bg)' : 'var(--gate-fail-bg)',
            color: 'var(--text-inverse)', fontSize: 13,
          }}>
            {doneMessage}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-tertiary)', border: 'none', borderRadius: 6,
              color: 'var(--text-primary)', padding: '7px 18px', cursor: 'pointer', fontSize: 13,
            }}
          >取消</button>
          {canProceed && (
            <button
              onClick={onPassed}
              style={{
                background: 'var(--accent-green)', border: 'none', borderRadius: 6,
                color: 'var(--text-inverse)', padding: '7px 18px', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
              }}
            >继续转换</button>
          )}
        </div>
      </div>
    </div>
  );
}
