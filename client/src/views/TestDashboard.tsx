import { useState, useRef } from 'react';
import { Check, X, Minus, HelpCircle, Bot, Play } from 'lucide-react';
import { useTestPlans, useCreateTestPlan, useTestRuns, useGateChecks, useTestCases } from '../api/hooks';
import type { GateCheckEvent, TestRunEvent, TestCase, TestType, TestRun } from '@devflow/shared';
import { UiBadge, UiButton, UiSelect } from '../components/ui';

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
  onDone?: () => void;
}

function AIGenerateCasesButton({ reqId, scope, label, color, onDone }: AIGenerateCasesButtonProps) {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number } | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const handleClick = async () => {
    setRunning(true);
    setLog('');
    setError(null);
    setResult(null);

    try {
      const resp = await fetch(`${API_BASE}/test-cases/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId, scope }),
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
            };
            if (ev.type === 'entry' && ev.entry?.content) {
              setLog(prev => prev + ev.entry!.content);
            } else if (ev.type === 'patch' && ev.patch?.content) {
              setLog(prev => prev + ev.patch!.content);
            } else if (ev.type === 'done') {
              setResult({ count: ev.count ?? 0 });
            } else if (ev.type === 'error' && ev.message) {
              setError(ev.message);
            }
            if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
          } catch { /* ignore non-JSON SSE lines */ }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      onDone?.();
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <button
        onClick={() => { void handleClick(); }}
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
      {result && (
        <span style={{ fontSize: 11, color: 'var(--accent-green)' }}>
          ✓ 已生成 {result.count} 条用例
        </span>
      )}
      {error && (
        <span style={{ fontSize: 11, color: 'var(--accent-red)', maxWidth: 280, wordBreak: 'break-all' }}>
          ✗ {error}
        </span>
      )}
      {(running || log) && (
        <pre
          ref={logRef}
          style={{
            margin: 0, marginTop: 4, background: 'var(--bg-code)',
            border: '1px solid var(--bg-tertiary)', borderRadius: 4,
            padding: 8, fontSize: 11, color: 'var(--text-secondary)',
            maxHeight: 160, minWidth: 280, maxWidth: 420, overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}
        >{log || '等待 AI 响应...'}</pre>
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

export function TestDashboard({ reqId: initialReqId }: { reqId?: string }) {
  const [reqId, setReqId] = useState(initialReqId ?? '');
  const [showNewPlanForm, setShowNewPlanForm] = useState(false);
  const [activeTypeTab, setActiveTypeTab] = useState<TestType | 'all'>('all');
  const [showNewCasePlanId, setShowNewCasePlanId] = useState<string | null>(null);

  const { data: plans = [], refetch: refetchPlans } = useTestPlans(reqId);
  const { data: runs = [] } = useTestRuns(reqId || undefined);
  const { data: checks = [] } = useGateChecks(reqId);
  const { data: allCases = [], refetch: refetchCases } = useTestCases(reqId);

  const card: React.CSSProperties = {
    background: 'var(--bg-secondary)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    border: '1px solid var(--bg-tertiary)',
  };

  // Smoke card data
  const smokeCases = allCases.filter(c => c.testType === 'smoke');
  const smokeRuns = runs.filter(r => r.runType === 'manual');
  const latestSmokeRun = smokeRuns[0];
  const smokePassed = latestSmokeRun ? latestSmokeRun.passed : 0;
  const smokeTotal = latestSmokeRun ? latestSmokeRun.total : smokeCases.length;

  // Cases by type
  const typeCases = activeTypeTab === 'all' ? allCases : allCases.filter(c => c.testType === activeTypeTab);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>测试与质量</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>需求ID:</span>
          <input
            value={reqId}
            onChange={e => setReqId(e.target.value)}
            placeholder="输入需求ID..."
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-primary)', padding: '4px 10px', fontSize: 13, width: 200 }}
          />
        </div>
      </div>

      {!reqId && (
        <div style={{ color: 'var(--text-tertiary)', padding: 24 }}>请输入需求ID以查看测试数据</div>
      )}

      {reqId && (
        <>
          {/* Smoke Card */}
          <div style={{
            ...card,
            display: 'flex',
            gap: 24,
            alignItems: 'center',
            background: 'linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
          }}>
            <div style={{ textAlign: 'center', minWidth: 100 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-orange)' }}>{smokeTotal}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>冒烟用例</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border-default)' }} />
            <div style={{ textAlign: 'center', minWidth: 100 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-green)' }}>{smokeTotal > 0 ? Math.round((smokePassed / smokeTotal) * 100) : 0}%</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>通过率</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--border-default)' }} />
            <div style={{ textAlign: 'center', minWidth: 100 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-blue)' }}>{latestSmokeRun ? new Date(latestSmokeRun.startedAt).toLocaleDateString('zh-CN') : '-'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>最近运行</div>
            </div>
            <div style={{ flex: 1 }} />
            <AIGenerateCasesButton
              reqId={reqId}
              scope="smoke"
              label="冒烟用例"
              color="var(--accent-orange)"
              onDone={() => { void refetchCases(); void refetchPlans(); }}
            />
            <TddLoopRunner reqId={reqId} onDone={() => { void refetchPlans(); }} />
          </div>

          {/* Test Type Tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTypeTab('all')}
              style={{
                padding: '6px 14px', borderRadius: 4, border: '1px solid ' + (activeTypeTab === 'all' ? 'var(--accent-blue)' : 'var(--bg-tertiary)'),
                background: activeTypeTab === 'all' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                color: activeTypeTab === 'all' ? 'var(--text-inverse)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 12,
              }}
            >全部 ({allCases.length})</button>
            {(Object.keys(TEST_TYPE_LABELS) as TestType[]).map(t => {
              const count = allCases.filter(c => c.testType === t).length;
              return (
                <button
                  key={t}
                  onClick={() => setActiveTypeTab(t)}
                  style={{
                    padding: '6px 14px', borderRadius: 4, border: '1px solid ' + (activeTypeTab === t ? TEST_TYPE_COLORS[t] : 'var(--bg-tertiary)'),
                    background: activeTypeTab === t ? TEST_TYPE_COLORS[t] : 'var(--bg-secondary)',
                    color: 'var(--text-inverse)',
                    cursor: 'pointer', fontSize: 12,
                  }}
                >{TEST_TYPE_LABELS[t]} ({count})</button>
              );
            })}
          </div>

          {/* Test Cases by Type */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>用例列表</h3>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{typeCases.length} 条用例</span>
            </div>
            {typeCases.length === 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>暂无用例</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {typeCases.map(tc => (
                <div key={tc.id} style={{
                  background: 'var(--bg-primary)', borderRadius: 4, padding: '8px 12px',
                  border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{
                    background: TEST_TYPE_COLORS[tc.testType as TestType] ?? 'var(--text-tertiary)',
                    color: 'var(--text-inverse)', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 600,
                  }}>{TEST_TYPE_LABELS[tc.testType as TestType] ?? tc.testType}</span>
                  <span style={{ flex: 1, fontSize: 13 }}>{tc.title}</span>
                  <code style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-code)', padding: '2px 6px', borderRadius: 3 }}>{tc.command.slice(0, 60)}</code>
                  <StatusBadge status={tc.status} />
                </div>
              ))}
            </div>
          </div>

          {/* Test Plans */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>测试计划</h3>
              <button
                onClick={() => setShowNewPlanForm(v => !v)}
                style={{ background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)', padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}
              >+ 新建测试计划</button>
            </div>

            {showNewPlanForm && (
              <NewPlanForm reqId={reqId} onCreated={() => { setShowNewPlanForm(false); void refetchPlans(); }} />
            )}

            {plans.length === 0 && !showNewPlanForm && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>暂无测试计划</div>
            )}

            {plans.map(plan => (
              <div key={plan.id} style={{ borderTop: '1px solid var(--bg-tertiary)', paddingTop: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{plan.title}</span>
                  <StatusBadge status={plan.status} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{plan.caseCount} 个用例</span>
                  <button
                    onClick={() => setShowNewCasePlanId(showNewCasePlanId === plan.id ? null : plan.id)}
                    style={{ marginLeft: 'auto', background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-secondary)', padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}
                  >+ 用例</button>
                </div>
                <PlanRunner planId={plan.id} planTitle={plan.title} reqId={reqId} />
                {showNewCasePlanId === plan.id && (
                  <NewCaseForm planId={plan.id} reqId={reqId} onCreated={() => { setShowNewCasePlanId(null); void refetchPlans(); }} />
                )}
              </div>
            ))}
          </div>

          {/* Recent Test Runs */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>最近测试运行</h3>
            {runs.length === 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>暂无测试运行记录</div>}
            {runs.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 8px' }}>类型</th>
                    <th style={{ padding: '4px 8px' }}>状态</th>
                    <th style={{ padding: '4px 8px' }}>通过/失败/总计</th>
                    <th style={{ padding: '4px 8px' }}>覆盖率</th>
                    <th style={{ padding: '4px 8px' }}>耗时(ms)</th>
                    <th style={{ padding: '4px 8px' }}>开始时间</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(run => {
                    const cov = getCoveragePct(run);
                    return (
                      <tr key={run.id} style={{ borderTop: '1px solid var(--bg-tertiary)' }}>
                        <td style={{ padding: '6px 8px' }}><RunTypeBadge runType={run.runType} /></td>
                        <td style={{ padding: '6px 8px' }}><StatusBadge status={run.status} /></td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ color: 'var(--accent-green)' }}>{run.passed}</span>
                          {' / '}
                          <span style={{ color: 'var(--accent-red)' }}>{run.failed}</span>
                          {' / '}
                          <span style={{ color: 'var(--text-secondary)' }}>{run.total}</span>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          {cov !== null ? <CoverageBadge pct={cov} /> : <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>-</span>}
                        </td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{run.durationMs ?? '-'}</td>
                        <td style={{ padding: '6px 8px', color: 'var(--text-secondary)' }}>{run.startedAt.slice(0, 19).replace('T', ' ')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Gate Checks */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>门禁状态</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {GATE_TRANSITIONS.map(gt => (
                <GateCard
                  key={`${gt.from}-${gt.to}`}
                  reqId={reqId}
                  from={gt.from}
                  to={gt.to}
                  label={gt.label}
                  checks={checks}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
