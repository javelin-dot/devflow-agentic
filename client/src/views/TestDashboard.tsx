import React, { useState, useRef, useMemo } from 'react';
import { Check, X, Minus, HelpCircle, Bot, Play, Search, ChevronDown, ChevronRight, RefreshCw, Plus } from 'lucide-react';
import { useTestPlans, useCreateTestPlan, useTestRuns, useGateChecks, useTestCases, useRequirements, useRequirement, useDefects } from '../api/hooks';
import type { GateCheckEvent, TestRunEvent, TestCase, TestType, TestRun, Stage, TestStatus, Defect, DefectSeverity, DefectStatus } from '@devflow/shared';
import { STAGE_LABELS } from '@devflow/shared';
import { UiBadge, UiSelect } from '../components/ui';
import { DefectRow, NewDefectForm, DEFECT_STATUS_LABELS } from './DefectListPanel';

const STAGES: Stage[] = ['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released'];
const CASE_STATUS_LABELS: Record<TestStatus, string> = {
  draft: '草稿', ready: '就绪', running: '运行中', passed: '通过', failed: '失败', skipped: '跳过',
};

const API_BASE = 'http://localhost:4000/api';

const TEST_TYPE_LABELS: Record<TestType, string> = {
  smoke: '冒烟',
  functional: '功能',
  performance: '性能',
  stress: '压力',
  penetration: '渗透',
};

const TEST_TYPE_COLORS: Record<TestType, string> = {
  smoke: 'var(--accent-orange)',
  functional: 'var(--accent-blue)',
  performance: 'var(--accent-purple)',
  stress: 'var(--accent-red)',
  penetration: 'var(--accent-green)',
};

const GATE_TRANSITIONS = [
  { from: 'development', to: 'uat', label: 'development → uat' },
  { from: 'uat', to: 'prerelease', label: 'uat → prerelease' },
  { from: 'prerelease', to: 'released', label: 'prerelease → released' },
];

function getCoveragePct(run: TestRun): number | null {
  if (!run.coverageJson) return null;
  try {
    const cov = JSON.parse(run.coverageJson) as Record<string, unknown>;
    const total = cov.total as Record<string, unknown> | undefined;
    if (total) {
      const lines = total.lines as Record<string, unknown> | undefined;
      if (lines && typeof lines.pct === 'number') return lines.pct;
    }
    // lcov fallback
    const lines = total?.lines as Record<string, unknown> | undefined;
    if (lines && typeof lines.pct === 'number') return lines.pct;
  } catch { /* ignore */ }
  return null;
}

function CoverageBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>-</span>;
  const variant = pct >= 80 ? 'success' : pct >= 60 ? 'warning' : 'error';
  return (
    <UiBadge variant={variant}>覆盖率 {pct.toFixed(1)}%</UiBadge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'success' | 'error' | 'info' | 'default'> = {
    passed: 'success',
    failed: 'error',
    running: 'info',
    pending: 'default',
    error: 'error',
    active: 'success',
    archived: 'default',
  };
  return <UiBadge variant={variantMap[status] ?? 'default'}>{status}</UiBadge>;
}

function RunTypeBadge({ runType }: { runType: string }) {
  const variantMap: Record<string, 'info' | 'warning' | 'default' | 'success'> = {
    manual: 'info',
    gate: 'warning',
    regression: 'default',
    acceptance: 'success',
  };
  return <UiBadge variant={variantMap[runType] ?? 'default'}>{runType}</UiBadge>;
}

function GateResultBadge({ result }: { result: string }) {
  const variantMap: Record<string, 'success' | 'error' | 'default' | 'warning'> = {
    passed: 'success',
    failed: 'error',
    skipped: 'default',
    pending: 'warning',
  };
  const iconMap: Record<string, React.ReactNode> = {
    passed: <Check size={12} />,
    failed: <X size={12} />,
    skipped: <Minus size={12} />,
    pending: <HelpCircle size={12} />,
  };
  return (
    <UiBadge variant={variantMap[result] ?? 'default'}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {iconMap[result] ?? <HelpCircle size={12} />}
        {result}
      </span>
    </UiBadge>
  );
}

interface GateCardProps {
  reqId: string;
  from: string;
  to: string;
  label: string;
  checks: import('@devflow/shared').GateCheck[];
}

function GateCard({ reqId, from, to, label, checks }: GateCardProps) {
  const key = `${from}→${to}`;
  const relevant = checks.filter(c => c.fromStage === from && c.toStage === to);
  const latestByType = new Map<string, import('@devflow/shared').GateCheck>();
  for (const c of relevant) {
    const existing = latestByType.get(c.checkType);
    if (!existing || c.createdAt > existing.createdAt) {
      latestByType.set(c.checkType, c);
    }
  }
  const latestChecks = Array.from(latestByType.values());

  const [running, setRunning] = useState(false);
  const [liveEvents, setLiveEvents] = useState<GateCheckEvent[]>([]);
  const [liveLog, setLiveLog] = useState('');
  const logRef = useRef<HTMLPreElement>(null);

  const handleRunGate = async () => {
    setRunning(true);
    setLiveEvents([]);
    setLiveLog('');

    const resp = await fetch(`${API_BASE}/gate-checks/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reqId, fromStage: from, toStage: to }),
    });

    if (!resp.body) { setRunning(false); return; }
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
            setLiveEvents(prev => [...prev, evt]);
            setLiveLog(prev => prev + `[${evt.type}] ${evt.checkType ?? ''} ${evt.result ?? ''} ${evt.detail ?? evt.message ?? ''}\n`);
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          } catch { /* ignore */ }
        }
      }
    }
    setRunning(false);
  };

  void key;

  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, border: '1px solid var(--bg-tertiary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
        <button
          onClick={() => { void handleRunGate(); }}
          disabled={running}
          style={{
            background: running ? 'var(--bg-tertiary)' : 'var(--accent-blue)', border: 'none', borderRadius: 4,
            color: 'var(--text-inverse)', padding: '4px 12px', cursor: running ? 'not-allowed' : 'pointer', fontSize: 12,
          }}
        >{running ? '检查中...' : '运行检查'}</button>
      </div>

      {latestChecks.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>上次检查结果:</div>
          {latestChecks.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <GateResultBadge result={c.result} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.checkType}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{c.detail}</span>
            </div>
          ))}
        </div>
      )}

      {liveEvents.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>实时结果:</div>
          {liveEvents.filter(e => e.type === 'check_result').map((e, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <GateResultBadge result={e.result ?? 'pending'} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{e.checkType}</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{e.detail}</span>
            </div>
          ))}
          {liveEvents.find(e => e.type === 'done') && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 4, background: liveEvents.find(e => e.type === 'done')?.allPassed ? 'var(--gate-pass-bg)' : 'var(--gate-fail-bg)', color: 'var(--text-inverse)', fontSize: 12 }}>
              {liveEvents.find(e => e.type === 'done')?.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PlanRunnerProps {
  planId: string;
  planTitle: string;
  reqId: string;
}

function PlanRunner({ planId, planTitle, reqId }: PlanRunnerProps) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const [status, setStatus] = useState('');
  const logRef = useRef<HTMLPreElement>(null);

  const handleRun = async () => {
    const resp0 = await fetch(`${API_BASE}/test-plans/${planId}`);
    const planData = await resp0.json() as { testCases?: Array<{ command: string; cwd?: string; title: string; testType?: string }> };
    const cases = planData.testCases ?? [];
    if (cases.length === 0) {
      setLog('该计划没有测试用例');
      return;
    }

    setRunning(true);
    setLog('');
    setStatus('running');

    const commands = cases.map(c => ({ cmd: c.command, cwd: c.cwd ?? undefined, title: c.title, testType: c.testType }));
    const resp = await fetch(`${API_BASE}/test-runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, reqId, runType: 'manual', commands }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'unknown error' }));
      setLog(`运行失败: ${err.error}\n${err.missing?.map((m: { adapter: string; installHint: string }) => `${m.adapter}: ${m.installHint}`).join('\n') ?? ''}`);
      setRunning(false);
      setStatus('error');
      return;
    }

    if (!resp.body) { setRunning(false); return; }
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
            const evt = JSON.parse(raw) as TestRunEvent;
            if (evt.type === 'log' && evt.message) {
              setLog(prev => prev + evt.message);
              if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
            } else if (evt.type === 'done') {
              setStatus(evt.status ?? 'done');
            } else if (evt.type === 'case_result' && evt.message) {
              setLog(prev => prev + evt.message + '\n');
            }
          } catch { /* ignore */ }
        }
      }
    }
    setRunning(false);
  };

  return (
    <div>
      <button
        onClick={() => { void handleRun(); }}
        disabled={running}
        style={{
          background: running ? 'var(--bg-tertiary)' : 'var(--accent-green)', border: 'none', borderRadius: 4,
          color: 'var(--text-inverse)', padding: '4px 10px', cursor: running ? 'not-allowed' : 'pointer', fontSize: 12,
        }}
      >{running ? '运行中...' : '运行测试'}</button>
      {status && <span style={{ marginLeft: 8, fontSize: 12 }}><StatusBadge status={status} /></span>}
      {log && (
        <pre
          ref={logRef}
          style={{
            marginTop: 8, background: 'var(--bg-code)', border: '1px solid var(--bg-tertiary)', borderRadius: 4,
            padding: 10, fontSize: 11, color: 'var(--text-secondary)', maxHeight: 200, overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}
        >{log}</pre>
      )}
      <span style={{ display: 'none' }}>{planTitle}</span>
    </div>
  );
}

interface NewPlanFormProps {
  reqId: string;
  onCreated: () => void;
}

function NewPlanForm({ reqId, onCreated }: NewPlanFormProps) {
  const [title, setTitle] = useState('');
  const createPlan = useCreateTestPlan();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createPlan.mutateAsync({ reqId, title: title.trim() });
    setTitle('');
    onCreated();
  };

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="计划名称..."
        style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-primary)', padding: '6px 10px', fontSize: 13 }}
      />
      <button
        type="submit"
        disabled={createPlan.isPending}
        style={{ background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)', padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
      >创建</button>
    </form>
  );
}

interface NewCaseFormProps {
  planId: string;
  reqId: string;
  onCreated: () => void;
}

function NewCaseForm({ planId, reqId, onCreated }: NewCaseFormProps) {
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [testType, setTestType] = useState<TestType>('functional');
  const [description, setDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !command.trim()) return;
    await fetch(`${API_BASE}/test-plans/${planId}/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, command, testType, description }),
    });
    onCreated();
    setTitle('');
    setCommand('');
    setDescription('');
  };

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} style={{
      background: 'var(--bg-primary)', borderRadius: 6, padding: 12, marginTop: 8,
      border: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>新建用例</div>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="用例标题..."
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-primary)', padding: '5px 10px', fontSize: 13 }}
      />
      <UiSelect
        value={testType}
        onChange={v => setTestType(v as TestType)}
        options={(Object.keys(TEST_TYPE_LABELS) as TestType[]).map(t => ({ value: t, label: TEST_TYPE_LABELS[t] }))}
      />
      <input
        value={command}
        onChange={e => setCommand(e.target.value)}
        placeholder="测试命令..."
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-primary)', padding: '5px 10px', fontSize: 13 }}
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="描述（可选）..."
        rows={2}
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-primary)', padding: '5px 10px', fontSize: 13, resize: 'vertical' }}
      />
      <button
        type="submit"
        style={{ background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)', padding: '5px 14px', cursor: 'pointer', fontSize: 12, alignSelf: 'flex-start' }}
      >添加</button>
    </form>
  );
}

interface AIGenerateCasesButtonProps {
  reqId: string;
  scope: 'smoke' | 'full';
  label: string;
  color: string;
  onDone?: (count: number) => void;
}

function AIGenerateCasesButton({ reqId, scope, label, color, onDone }: AIGenerateCasesButtonProps) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const handleCancel = async () => {
    setCancelled(true);
    const sid = sessionIdRef.current;
    if (sid) {
      // best-effort: ask server to interrupt the agent process
      try {
        await fetch(`${API_BASE}/test-cases/generate/${sid}/cancel`, { method: 'POST' });
      } catch { /* ignore */ }
    }
    abortRef.current?.abort();
  };

  const handleClick = async () => {
    setRunning(true);
    setLog('');
    setError(null);
    setResult(null);
    setCancelled(false);
    sessionIdRef.current = null;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch(`${API_BASE}/test-cases/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId, scope }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        setError(`请求失败 (HTTP ${resp.status})${text ? `: ${text.slice(0, 200)}` : ''}`);
        setRunning(false);
        return;
      }
      if (!resp.body) {
        setError('响应没有 body');
        setRunning(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let doneCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            const ev = JSON.parse(raw) as {
              type?: string;
              entry?: { content?: string };
              patch?: { content?: string };
              count?: number;
              planId?: string;
              message?: string;
              sessionId?: string;
              agent?: string;
            };
            if (ev.type === 'started' && ev.sessionId) {
              sessionIdRef.current = ev.sessionId;
              setLog(prev => prev + `[已启动 ${ev.agent ?? ''} session=${ev.sessionId}]\n`);
            } else if (ev.type === 'entry' && ev.entry?.content) {
              setLog(prev => prev + ev.entry!.content);
            } else if (ev.type === 'patch' && ev.patch?.content) {
              setLog(prev => prev + ev.patch!.content);
            } else if (ev.type === 'done') {
              doneCount = ev.count ?? 0;
              setResult({ count: doneCount });
            } else if (ev.type === 'cancelled') {
              setCancelled(true);
              setLog(prev => prev + `\n[${ev.message ?? '已取消'}]\n`);
            } else if (ev.type === 'error' && ev.message) {
              setError(ev.message);
            }
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          } catch { /* ignore non-JSON SSE lines */ }
        }
      }
      if (doneCount > 0) onDone?.(doneCount);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setCancelled(true);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const [showLog, setShowLog] = useState(false);
  // auto-open log when running starts; user can close
  if (running && !showLog && !error) {
    // best-effort one-shot; setState in render is OK here because it's gated
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <button
          onClick={() => { setShowLog(true); void handleClick(); }}
          disabled={running}
          title={`使用 AI 根据需求生成${label}`}
          style={{
            background: running ? 'var(--bg-tertiary)' : color, border: 'none', borderRadius: 4,
            color: 'var(--text-inverse)', padding: '6px 14px',
            cursor: running ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Bot size={14} />
          {running ? '生成中...' : `AI 生成${label}`}
        </button>
        {running && (
          <button
            onClick={() => { void handleCancel(); }}
            title="取消本次生成"
            style={{
              background: 'var(--accent-red)', border: 'none', borderRadius: 4,
              color: 'var(--text-inverse)', padding: '6px 10px',
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <X size={14} />
            取消
          </button>
        )}
        {(log || result || error) && !running && (
          <button
            onClick={() => setShowLog(v => !v)}
            title="查看 AI 日志"
            style={{
              background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 4,
              color: 'var(--text-secondary)', padding: '5px 8px',
              cursor: 'pointer', fontSize: 11,
            }}
          >日志</button>
        )}
      </div>
      {result && !showLog && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, fontSize: 11, color: 'var(--accent-green)', whiteSpace: 'nowrap' }}>
          ✓ 已生成 {result.count} 条
        </div>
      )}
      {error && !showLog && (
        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, fontSize: 11, color: 'var(--accent-red)', maxWidth: 300, wordBreak: 'break-all' }}>
          ✗ {error.slice(0, 80)}
        </div>
      )}
      {showLog && (running || log || result || error) && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 50,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
          borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          width: 460, maxWidth: '90vw',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-default)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              AI 日志 · {label}
              {result && <span style={{ color: 'var(--accent-green)', marginLeft: 8 }}>✓ {result.count} 条</span>}
              {cancelled && <span style={{ color: 'var(--accent-orange)', marginLeft: 8 }}>已取消</span>}
              {error && <span style={{ color: 'var(--accent-red)', marginLeft: 8 }}>失败</span>}
            </div>
            <button
              onClick={() => setShowLog(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
            ><X size={14} /></button>
          </div>
          {error && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--accent-red)', borderBottom: '1px solid var(--border-default)', wordBreak: 'break-all' }}>
              {error}
            </div>
          )}
          <pre
            ref={logRef}
            style={{
              margin: 0, background: 'var(--bg-code)', padding: 10, fontSize: 11,
              color: 'var(--text-secondary)', maxHeight: 280, overflow: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderRadius: '0 0 6px 6px',
            }}
          >{log || '等待 AI 响应...'}</pre>
        </div>
      )}
    </div>
  );
}

interface TddLoopRunnerProps {
  reqId: string;
  onDone?: () => void;
}

function TddLoopRunner({ reqId, onDone }: TddLoopRunnerProps) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const [result, setResult] = useState<{ planId?: string; runId?: string; count?: number; coverage?: unknown } | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const handleRun = async () => {
    setRunning(true);
    setLog('');
    setResult(null);

    const resp = await fetch(`${API_BASE}/tdd-loop/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reqId, scope: 'full' }),
    });

    if (!resp.body) { setRunning(false); return; }
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
            const ev = JSON.parse(raw) as { type?: string; phase?: string; message?: string; content?: string; event?: TestRunEvent; planId?: string; runId?: string; count?: number; coverage?: unknown };
            if (ev.type === 'phase' && ev.message) {
              setLog(prev => prev + `[${ev.phase}] ${ev.message}\n`);
            }
            if (ev.type === 'chunk' && ev.content) {
              setLog(prev => prev + ev.content);
            }
            if (ev.type === 'run_event' && ev.event) {
              const evt = ev.event;
              if (evt.type === 'log' && evt.message) setLog(prev => prev + evt.message);
              if (evt.type === 'case_result' && evt.message) setLog(prev => prev + evt.message + '\n');
            }
            if (ev.type === 'done') {
              setResult({ planId: ev.planId, runId: ev.runId, count: ev.count, coverage: ev.coverage });
            }
            if (ev.type === 'error' && ev.message) {
              setLog(prev => prev + `Error: ${ev.message}\n`);
            }
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          } catch { /* ignore */ }
        }
      }
    }
    setRunning(false);
    onDone?.();
  };

  return (
    <div>
      <button
        onClick={() => { void handleRun(); }}
        disabled={running}
        style={{
          background: running ? 'var(--bg-tertiary)' : 'var(--accent-purple)', border: 'none', borderRadius: 4,
          color: 'var(--text-inverse)', padding: '6px 14px', cursor: running ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600,
        }}
      >{running ? 'PIV-TDD 运行中...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Play size={14} /> 运行 PIV-TDD 循环</span>}</button>
      {result?.coverage != null && (
        <span style={{ marginLeft: 10 }}>
          <CoverageBadge pct={getCoveragePct({ coverageJson: JSON.stringify(result.coverage), durationMs: null, failed: 0, log: '', passed: 0, runType: 'manual', skipped: 0, startedAt: '', status: 'passed', total: 0 } as TestRun)} />
        </span>
      )}
      {log && (
        <pre
          ref={logRef}
          style={{
            marginTop: 8, background: 'var(--bg-code)', border: '1px solid var(--bg-tertiary)', borderRadius: 4,
            padding: 10, fontSize: 11, color: 'var(--text-secondary)', maxHeight: 240, overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}
        >{log}</pre>
      )}
    </div>
  );
}

// ===== Single-pane Test Management =====
type SectionKey = 'cases' | 'defects' | 'plans' | 'runs' | 'gates';

function RequirementTestPanel({ reqId, reqFilter, stageFilter, onReqChange, onStageChange }: {
  reqId: string;
  reqFilter: string;       // dropdown selected value ('' = 全部)
  stageFilter: 'all' | Stage;
  onReqChange: (id: string) => void;
  onStageChange: (s: 'all' | Stage) => void;
}) {
  const [section, setSection] = useState<SectionKey>('cases');
  const [showNewPlanForm, setShowNewPlanForm] = useState(false);
  const [activeTypeTab, setActiveTypeTab] = useState<TestType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TestStatus>('all');
  const [caseSearch, setCaseSearch] = useState('');
  const [showNewCasePlanId, setShowNewCasePlanId] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  // defect tab state
  const [defectSeverity, setDefectSeverity] = useState<'all' | DefectSeverity>('all');
  const [defectStatus, setDefectStatus] = useState<'all' | DefectStatus>('all');
  const [defectSearch, setDefectSearch] = useState('');
  const [showNewDefectForm, setShowNewDefectForm] = useState(false);

  const { data: req } = useRequirement(reqId);
  const { data: allReqs = [] } = useRequirements();
  const { data: plans = [], refetch: refetchPlans } = useTestPlans(reqId);
  const { data: runs = [] } = useTestRuns(reqId || undefined);
  const { data: checks = [] } = useGateChecks(reqId);
  const { data: allCases = [], refetch: refetchCases } = useTestCases(reqId || undefined);
  const { data: defects = [] } = useDefects(reqId || undefined);

  // For "全部" cross-req view: build map of req id → stage to support stage filter on cases
  const reqStageMap = useMemo(() => {
    const m = new Map<string, Stage>();
    for (const r of allReqs) m.set(r.id, r.stage);
    return m;
  }, [allReqs]);

  const filteredReqOptions = useMemo(() => {
    return allReqs.filter(r => !r.archivedAt && (stageFilter === 'all' || r.stage === stageFilter));
  }, [allReqs, stageFilter]);

  const reqTitleMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allReqs) m.set(r.id, r.title);
    return m;
  }, [allReqs]);

  const handleCaseStatusChange = async (id: string, status: TestStatus) => {
    await fetch(`${API_BASE}/test-cases/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    void refetchCases();
  };

  // Stats
  const totalCases = allCases.length;
  const passedCases = allCases.filter(c => c.status === 'passed').length;
  const failedCases = allCases.filter(c => c.status === 'failed').length;
  const passRate = totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 0;
  const latestRun = runs[0];

  // Defects filtering (in 全部 mode also filter by stage)
  const filteredDefects = useMemo(() => {
    let list = defects;
    if (defectSeverity !== 'all') list = list.filter(d => d.severity === defectSeverity);
    if (defectStatus !== 'all') list = list.filter(d => d.status === defectStatus);
    if (!reqId && stageFilter !== 'all') {
      list = list.filter(d => reqStageMap.get(d.reqId) === stageFilter);
    }
    if (defectSearch.trim()) {
      const q = defectSearch.trim().toLowerCase();
      list = list.filter(d => d.title.toLowerCase().includes(q) || (d.description ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [defects, defectSeverity, defectStatus, defectSearch, reqId, stageFilter, reqStageMap]);

  // Cases filtering — in 全部 mode also filter by stage via the req→stage map
  const filteredCases = useMemo(() => {
    let list = activeTypeTab === 'all' ? allCases : allCases.filter(c => c.testType === activeTypeTab);
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (!reqId && stageFilter !== 'all') {
      list = list.filter(c => reqStageMap.get(c.reqId) === stageFilter);
    }
    if (caseSearch.trim()) {
      const q = caseSearch.trim().toLowerCase();
      list = list.filter(c => c.title.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [allCases, activeTypeTab, statusFilter, caseSearch, reqId, stageFilter, reqStageMap]);

  const handleGenerated = async (tab: TestType | 'all', count: number) => {
    setSection('cases');
    setActiveTypeTab(tab);
    setStatusFilter('all');
    await refetchCases();
    await refetchPlans();
    void count;
  };

  const sectionBtn = (k: SectionKey, label: string, count?: number): React.CSSProperties => ({
    padding: '8px 14px', fontSize: 13, cursor: 'pointer',
    background: 'transparent', border: 'none',
    borderBottom: '2px solid ' + (section === k ? 'var(--accent-blue)' : 'transparent'),
    color: section === k ? 'var(--accent-blue)' : 'var(--text-secondary)',
    fontWeight: section === k ? 600 : 400,
    display: 'inline-flex', alignItems: 'center', gap: 6,
  });
  void sectionBtn;

  const isAll = !reqId;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>用例管理</h2>

          {/* Requirement dropdown */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>需求:</span>
            <select
              value={reqFilter}
              onChange={e => onReqChange(e.target.value)}
              style={{
                background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                borderRadius: 4, color: 'var(--text-primary)', fontSize: 12,
                padding: '5px 8px', cursor: 'pointer', minWidth: 220, maxWidth: 360,
              }}
            >
              <option value="">全部需求</option>
              {filteredReqOptions.map(r => (
                <option key={r.id} value={r.id}>{r.title} ({r.id})</option>
              ))}
            </select>
            {reqId && req?.stage && <UiBadge variant="info">{req.stage}</UiBadge>}
          </div>

          {/* Stage chips — applies to the requirement dropdown options & cases filter */}
          <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              onClick={() => onStageChange('all')}
              style={chipStyle(stageFilter === 'all')}
            >全部阶段</button>
            {STAGES.map(s => (
              <button key={s} onClick={() => onStageChange(s)} style={chipStyle(stageFilter === s)}>
                {STAGE_LABELS[s]}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Per-requirement actions — disabled when 全部 */}
          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }} title={isAll ? '请先选择一个需求' : undefined}>
            {isAll && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>选择需求后可生成</span>}
            <div style={{ display: 'inline-flex', gap: 8, opacity: isAll ? 0.4 : 1, pointerEvents: isAll ? 'none' : 'auto' }}>
              <AIGenerateCasesButton
                reqId={reqId} scope="smoke" label="冒烟用例" color="var(--accent-orange)"
                onDone={(count) => { void handleGenerated('smoke', count); }}
              />
              <AIGenerateCasesButton
                reqId={reqId} scope="full" label="完整用例" color="var(--accent-blue)"
                onDone={(count) => { void handleGenerated('all', count); }}
              />
              <TddLoopRunner reqId={reqId} onDone={() => { void refetchPlans(); }} />
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatTile label={isAll ? '全部用例' : '用例总数'} value={totalCases} color="var(--text-primary)" />
          <StatTile label="通过" value={passedCases} color="var(--accent-green)" />
          <StatTile label="失败" value={failedCases} color="var(--accent-red)" />
          <StatTile label="通过率" value={`${passRate}%`} color={passRate >= 80 ? 'var(--accent-green)' : passRate >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)'} />
          <StatTile label="缺陷" value={defects.length} color="var(--accent-red)" onClick={() => setSection('defects')} />
          <StatTile label="最近执行" value={latestRun ? new Date(latestRun.startedAt).toLocaleDateString('zh-CN') : '-'} color="var(--text-secondary)" small />
        </div>

        {/* Section tabs */}
        <div style={{ display: 'flex', marginTop: 14, marginBottom: -14, borderBottom: 'none' }}>
          <button onClick={() => setSection('cases')} style={sectionBtn('cases', '用例')}>用例 <CountChip n={allCases.length} /></button>
          <button onClick={() => setSection('defects')} style={sectionBtn('defects', '缺陷')}>缺陷 <CountChip n={defects.length} /></button>
          <button
            onClick={() => !isAll && setSection('plans')}
            disabled={isAll}
            title={isAll ? '选择具体需求查看计划' : undefined}
            style={{ ...sectionBtn('plans', '计划'), opacity: isAll ? 0.4 : 1, cursor: isAll ? 'not-allowed' : 'pointer' }}
          >计划 <CountChip n={plans.length} /></button>
          <button onClick={() => setSection('runs')} style={sectionBtn('runs', '执行历史')}>执行历史 <CountChip n={runs.length} /></button>
          <button
            onClick={() => !isAll && setSection('gates')}
            disabled={isAll}
            title={isAll ? '选择具体需求查看门禁' : undefined}
            style={{ ...sectionBtn('gates', '门禁'), opacity: isAll ? 0.4 : 1, cursor: isAll ? 'not-allowed' : 'pointer' }}
          >门禁 <CountChip n={checks.length} /></button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {section === 'cases' && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8 }}>
            {/* Toolbar */}
            <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input
                  value={caseSearch}
                  onChange={e => setCaseSearch(e.target.value)}
                  placeholder="搜索用例标题 / 描述"
                  style={{ padding: '5px 8px 5px 26px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, width: 240, outline: 'none' }}
                />
              </div>
              <FilterDropdown
                label="类型"
                value={activeTypeTab}
                options={[
                  { value: 'all', label: `全部 (${allCases.length})` },
                  ...(Object.keys(TEST_TYPE_LABELS) as TestType[]).map(t => ({
                    value: t,
                    label: `${TEST_TYPE_LABELS[t]} (${allCases.filter(c => c.testType === t).length})`,
                  })),
                ]}
                onChange={(v) => setActiveTypeTab(v as TestType | 'all')}
              />
              <FilterDropdown
                label="状态"
                value={statusFilter}
                options={[
                  { value: 'all', label: `全部 (${allCases.length})` },
                  ...(Object.keys(CASE_STATUS_LABELS) as TestStatus[]).map(s => ({
                    value: s,
                    label: `${CASE_STATUS_LABELS[s]} (${allCases.filter(c => c.status === s).length})`,
                  })),
                ]}
                onChange={(v) => setStatusFilter(v as TestStatus | 'all')}
              />
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>显示 {filteredCases.length} / {allCases.length}</span>
              <button
                onClick={() => { void refetchCases(); }}
                title="刷新"
                style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-secondary)', padding: '4px 10px', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              ><RefreshCw size={12} /> 刷新</button>
            </div>
            {/* Case Table */}
            <CaseTable
              cases={filteredCases}
              defects={defects}
              onStatusChange={handleCaseStatusChange}
              onSelect={setSelectedCaseId}
              selectedId={selectedCaseId}
              showReqColumn={isAll}
              reqTitleMap={reqTitleMap}
            />
          </div>
        )}

        {section === 'defects' && (
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 8 }}>
            {/* Toolbar */}
            <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border-default)', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                <input
                  value={defectSearch}
                  onChange={e => setDefectSearch(e.target.value)}
                  placeholder="搜索缺陷标题 / 描述"
                  style={{ padding: '5px 8px 5px 26px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, width: 240, outline: 'none' }}
                />
              </div>
              <FilterDropdown
                label="严重程度"
                value={defectSeverity}
                options={[
                  { value: 'all', label: `全部 (${defects.length})` },
                  ...(['P0', 'P1', 'P2', 'P3'] as DefectSeverity[]).map(s => ({
                    value: s,
                    label: `${s} (${defects.filter(d => d.severity === s).length})`,
                  })),
                ]}
                onChange={(v) => setDefectSeverity(v as DefectSeverity | 'all')}
              />
              <FilterDropdown
                label="状态"
                value={defectStatus}
                options={[
                  { value: 'all', label: `全部 (${defects.length})` },
                  ...(Object.keys(DEFECT_STATUS_LABELS) as DefectStatus[]).map(s => ({
                    value: s,
                    label: `${DEFECT_STATUS_LABELS[s]} (${defects.filter(d => d.status === s).length})`,
                  })),
                ]}
                onChange={(v) => setDefectStatus(v as DefectStatus | 'all')}
              />
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>显示 {filteredDefects.length} / {defects.length}</span>
              <button
                onClick={() => !isAll && setShowNewDefectForm(v => !v)}
                disabled={isAll}
                title={isAll ? '请先选择具体需求' : undefined}
                style={{
                  background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)',
                  padding: '5px 12px', cursor: isAll ? 'not-allowed' : 'pointer', fontSize: 12, opacity: isAll ? 0.5 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              ><Plus size={12} /> 新建缺陷</button>
            </div>
            {/* Body */}
            <div style={{ padding: 14 }}>
              {showNewDefectForm && reqId && (
                <NewDefectForm
                  reqId={reqId}
                  onCreated={() => setShowNewDefectForm(false)}
                  onCancel={() => setShowNewDefectForm(false)}
                />
              )}
              {filteredDefects.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                  {defects.length === 0 ? '暂无缺陷' : '暂无符合条件的缺陷'}
                </div>
              ) : (
                filteredDefects.map(d => (
                  <div key={d.id}>
                    {isAll && (
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 2 }}>
                        {reqTitleMap.get(d.reqId) ?? d.reqId} <code>{d.reqId}</code>
                      </div>
                    )}
                    <DefectRow defect={d} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {section === 'plans' && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-default)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>测试计划</span>
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>{plans.length} 个</span>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setShowNewPlanForm(v => !v)}
                style={{ background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)', padding: '5px 12px', cursor: 'pointer', fontSize: 12 }}
              >+ 新建计划</button>
            </div>
            <div style={{ padding: 14 }}>
              {showNewPlanForm && (
                <NewPlanForm reqId={reqId} onCreated={() => { setShowNewPlanForm(false); void refetchPlans(); }} />
              )}
              {plans.length === 0 && !showNewPlanForm && (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>暂无测试计划</div>
              )}
              {plans.map((plan, idx) => (
                <div key={plan.id} style={{ paddingTop: idx === 0 ? 0 : 14, marginTop: idx === 0 ? 0 : 14, borderTop: idx === 0 ? 'none' : '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{plan.title}</span>
                    <StatusBadge status={plan.status} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{plan.caseCount} 个用例</span>
                    <button
                      onClick={() => setShowNewCasePlanId(showNewCasePlanId === plan.id ? null : plan.id)}
                      style={{ marginLeft: 'auto', background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-secondary)', padding: '3px 10px', cursor: 'pointer', fontSize: 11 }}
                    >+ 用例</button>
                  </div>
                  <PlanRunner planId={plan.id} planTitle={plan.title} reqId={reqId} />
                  {showNewCasePlanId === plan.id && (
                    <NewCaseForm planId={plan.id} reqId={reqId} onCreated={() => { setShowNewCasePlanId(null); void refetchPlans(); }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {section === 'runs' && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-default)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-default)', fontSize: 13, fontWeight: 600 }}>执行历史</div>
            {runs.length === 0 ? (
              <div style={{ padding: 14, color: 'var(--text-tertiary)', fontSize: 13 }}>暂无执行记录</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead style={{ background: 'var(--bg-tertiary)' }}>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>类型</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>状态</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>通过/失败/总计</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>覆盖率</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>耗时</th>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>开始时间</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const cov = getCoveragePct(run);
                    return (
                      <tr key={run.id} style={{ borderTop: '1px solid var(--border-default)' }}>
                        <td style={{ padding: '8px 12px' }}><RunTypeBadge runType={run.runType} /></td>
                        <td style={{ padding: '8px 12px' }}><StatusBadge status={run.status} /></td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ color: 'var(--accent-green)' }}>{run.passed}</span>
                          {' / '}
                          <span style={{ color: 'var(--accent-red)' }}>{run.failed}</span>
                          {' / '}
                          <span style={{ color: 'var(--text-secondary)' }}>{run.total}</span>
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {cov !== null ? <CoverageBadge pct={cov} /> : <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>-</span>}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{run.durationMs ? `${run.durationMs}ms` : '-'}</td>
                        <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{run.startedAt.slice(0, 19).replace('T', ' ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {section === 'gates' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {GATE_TRANSITIONS.map(gt => (
              <GateCard
                key={`${gt.from}-${gt.to}`}
                reqId={reqId} from={gt.from} to={gt.to} label={gt.label} checks={checks}
              />
            ))}
          </div>
        )}
      </div>

      {/* Case detail drawer */}
      {selectedCaseId && (() => {
        const tc = allCases.find(c => c.id === selectedCaseId);
        if (!tc) return null;
        return (
          <CaseDetailDrawer
            tc={tc}
            reqTitle={reqTitleMap.get(tc.reqId)}
            defects={defects}
            onStatusChange={handleCaseStatusChange}
            onClose={() => setSelectedCaseId(null)}
          />
        );
      })()}
    </div>
  );
}

function StatTile({ label, value, color, small, onClick }: { label: string; value: number | string; color: string; small?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-primary)', borderRadius: 6, padding: '8px 14px',
        border: '1px solid var(--border-default)', minWidth: 92,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: small ? 13 : 18, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '3px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
    border: '1px solid ' + (active ? 'var(--accent-blue)' : 'var(--border-default)'),
    background: active ? 'var(--accent-blue)' : 'transparent',
    color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
  };
}

function CountChip({ n }: { n: number }) {
  return (
    <span style={{
      background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
      fontSize: 10, padding: '0 6px', borderRadius: 8, fontWeight: 500,
    }}>{n}</span>
  );
}

function FilterDropdown({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, padding: '4px 6px', cursor: 'pointer' }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

interface CaseTableProps {
  cases: TestCase[];
  defects: Defect[];
  onStatusChange: (id: string, status: TestStatus) => void;
  onSelect: (id: string) => void;
  selectedId?: string | null;
  showReqColumn?: boolean;
  reqTitleMap?: Map<string, string>;
}

function CaseTable({ cases, defects, onStatusChange, onSelect, selectedId, showReqColumn, reqTitleMap }: CaseTableProps) {
  if (cases.length === 0) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>暂无符合条件的用例</div>;
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead style={{ background: 'var(--bg-tertiary)' }}>
        <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
          <th style={{ padding: '8px 12px', fontWeight: 600, width: 70 }}>类型</th>
          {showReqColumn && <th style={{ padding: '8px 12px', fontWeight: 600 }}>需求</th>}
          <th style={{ padding: '8px 12px', fontWeight: 600 }}>标题</th>
          <th style={{ padding: '8px 12px', fontWeight: 600 }}>命令</th>
          <th style={{ padding: '8px 12px', fontWeight: 600, width: 110 }}>状态</th>
          <th style={{ padding: '8px 12px', fontWeight: 600, width: 80 }}>缺陷</th>
        </tr>
      </thead>
      <tbody>
        {cases.map(tc => {
          const isSelected = selectedId === tc.id;
          const related = defects.filter(d =>
            (d.description?.includes(tc.title) ?? false) || (d.title?.includes(tc.title) ?? false),
          );
          return (
            <tr
              key={tc.id}
              onClick={() => onSelect(tc.id)}
              style={{
                borderTop: '1px solid var(--border-default)', cursor: 'pointer',
                background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
              }}
            >
              <td style={{ padding: '8px 12px' }}>
                <span style={{
                  background: TEST_TYPE_COLORS[tc.testType as TestType] ?? 'var(--text-tertiary)',
                  color: 'var(--text-inverse)', borderRadius: 3, padding: '2px 6px', fontSize: 10, fontWeight: 600,
                }}>{TEST_TYPE_LABELS[tc.testType as TestType] ?? tc.testType}</span>
              </td>
              {showReqColumn && (
                <td style={{ padding: '8px 12px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{reqTitleMap?.get(tc.reqId) ?? tc.reqId}</span>
                  <code style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>{tc.reqId}</code>
                </td>
              )}
              <td style={{ padding: '8px 12px', color: 'var(--text-primary)' }}>{tc.title}</td>
              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <code style={{ fontSize: 11, background: 'var(--bg-code)', padding: '1px 5px', borderRadius: 3 }}>{tc.command}</code>
              </td>
              <td style={{ padding: '8px 12px' }}>
                <select
                  value={tc.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={e => onStatusChange(tc.id, e.target.value as TestStatus)}
                  style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 11, padding: '2px 4px' }}
                >
                  {(Object.keys(CASE_STATUS_LABELS) as TestStatus[]).map(s => (
                    <option key={s} value={s}>{CASE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </td>
              <td style={{ padding: '8px 12px' }}>
                {related.length > 0
                  ? <UiBadge variant="error">{related.length}</UiBadge>
                  : <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>-</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ===== Detail Drawer =====
interface CaseDetailDrawerProps {
  tc: TestCase;
  reqTitle: string | undefined;
  defects: Defect[];
  onStatusChange: (id: string, status: TestStatus) => void;
  onClose: () => void;
}

function CaseDetailDrawer({ tc, reqTitle, defects, onStatusChange, onClose }: CaseDetailDrawerProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const related = defects.filter(d =>
    (d.description?.includes(tc.title) ?? false) || (d.title?.includes(tc.title) ?? false),
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100,
        }}
      />
      {/* Drawer */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 580, maxWidth: '92vw',
          background: 'var(--bg-primary)', borderLeft: '1px solid var(--border-default)',
          boxShadow: '-8px 0 24px rgba(0,0,0,0.25)', zIndex: 101,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span style={{
            background: TEST_TYPE_COLORS[tc.testType as TestType] ?? 'var(--text-tertiary)',
            color: 'var(--text-inverse)', borderRadius: 3, padding: '3px 8px',
            fontSize: 11, fontWeight: 600, marginTop: 2,
          }}>{TEST_TYPE_LABELS[tc.testType as TestType] ?? tc.testType}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{tc.title}</div>
            <code style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{tc.id}</code>
          </div>
          <button
            onClick={onClose}
            title="关闭 (Esc)"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
          ><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 基本信息 */}
          <DrawerCard title="基本信息">
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 8, columnGap: 12, fontSize: 12 }}>
              <Field label="需求">
                <span style={{ color: 'var(--text-primary)' }}>{reqTitle ?? tc.reqId}</span>
                <code style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>{tc.reqId}</code>
              </Field>
              <Field label="状态">
                <select
                  value={tc.status}
                  onChange={e => onStatusChange(tc.id, e.target.value as TestStatus)}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 12, padding: '3px 6px' }}
                >
                  {(Object.keys(CASE_STATUS_LABELS) as TestStatus[]).map(s => (
                    <option key={s} value={s}>{CASE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="类型">{TEST_TYPE_LABELS[tc.testType as TestType] ?? tc.testType}</Field>
              <Field label="期望退出码"><code>{tc.expectedExitCode}</code></Field>
              <Field label="工作目录"><code style={{ wordBreak: 'break-all' }}>{tc.cwd || '-'}</code></Field>
              <Field label="创建时间">{tc.createdAt.slice(0, 19).replace('T', ' ')}</Field>
            </div>
          </DrawerCard>

          {/* 描述 / 预期 */}
          <DrawerCard title="描述 / 预期结果">
            <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {tc.description || <em style={{ color: 'var(--text-tertiary)' }}>无描述</em>}
            </div>
          </DrawerCard>

          {/* 执行命令 */}
          <DrawerCard title="执行命令">
            <pre style={{
              margin: 0, padding: 10, background: 'var(--bg-code)', borderRadius: 4,
              fontSize: 12, color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              maxHeight: 240, overflow: 'auto',
            }}>{tc.command || '-'}</pre>
          </DrawerCard>

          {/* 关联缺陷 */}
          <DrawerCard title={`关联缺陷 (${related.length})`}>
            {related.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>暂无关联缺陷</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {related.map(d => (
                  <div key={d.id} style={{ padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 4, border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UiBadge variant="error">{d.severity}</UiBadge>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1 }}>{d.title}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{d.status}</span>
                  </div>
                ))}
              </div>
            )}
          </DrawerCard>
        </div>
      </div>
    </>
  );
}

function DrawerCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 6 }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 11, paddingTop: 3 }}>{label}</div>
      <div style={{ color: 'var(--text-secondary)' }}>{children}</div>
    </>
  );
}

// ===== Public entry: single-pane with requirement filter in the header =====
export function TestDashboard({ reqId: initialReqId }: { reqId?: string }) {
  const [selectedId, setSelectedId] = useState(initialReqId ?? '');
  const [stageFilter, setStageFilter] = useState<'all' | Stage>('all');

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%', background: 'var(--bg-primary)' }}>
      <RequirementTestPanel
        reqId={selectedId}
        reqFilter={selectedId}
        stageFilter={stageFilter}
        onReqChange={setSelectedId}
        onStageChange={setStageFilter}
      />
    </div>
  );
}
