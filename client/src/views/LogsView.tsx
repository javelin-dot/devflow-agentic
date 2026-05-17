import { useState, useRef, useEffect } from 'react';
import { Check, MessageCircle, X, DollarSign, Plus } from 'lucide-react';
import { useLogTargets, useCreateLogTarget, useLogSessions, useCreateLogSession, useDeleteLogSession } from '../api/hooks';
import type { DiagnosisStep, LogStreamEvent, LogChatSession } from '@devflow/shared';

const API_BASE = 'http://localhost:4000/api';

// ===== LogsSidebar =====
interface LogsSidebarProps {
  scopedTargetIds: string[];
  onToggleTarget: (id: string) => void;
}

function LogsSidebar({ scopedTargetIds, onToggleTarget }: LogsSidebarProps) {
  const { data: targets = [] } = useLogTargets();
  const createTarget = useCreateLogTarget();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', service: '', host: '', sshUser: '', logDir: '' });

  const grouped = targets.reduce<Record<string, typeof targets>>((acc, t) => {
    const env = t.environment ?? 'production';
    if (!acc[env]) acc[env] = [];
    acc[env].push(t);
    return acc;
  }, {});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.service) return;
    await createTarget.mutateAsync({
      name: form.name,
      service: form.service,
      hosts: form.host ? [form.host] : [],
      sshUser: form.sshUser || undefined,
      logDir: form.logDir || undefined,
    });
    setForm({ name: '', service: '', host: '', sshUser: '', logDir: '' });
    setShowForm(false);
  };

  return (
    <div style={{ width: 240, background: 'var(--bg-secondary)', borderRight: '1px solid var(--bg-tertiary)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--bg-tertiary)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>日志目标</span>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: showForm ? 'var(--accent-blue)' : 'var(--bg-tertiary)', color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        ><Plus size={14} /></button>
      </div>

      {showForm && (
        <form onSubmit={(e) => { void handleSubmit(e); }} style={{ padding: 10, borderBottom: '1px solid var(--bg-tertiary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['name', 'service', 'host', 'sshUser', 'logDir'] as const).map(field => (
            <input
              key={field}
              placeholder={field === 'sshUser' ? 'SSH用户' : field === 'logDir' ? '日志目录' : field === 'host' ? '主机' : field}
              value={form[field]}
              onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-primary)', padding: '4px 8px', fontSize: 12 }}
            />
          ))}
          <button type="submit" style={{ background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)', padding: '5px 0', cursor: 'pointer', fontSize: 12 }}>
            添加
          </button>
        </form>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {Object.entries(grouped).map(([env, envTargets]) => (
          <div key={env}>
            <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1 }}>{env}</div>
            {envTargets.map(t => {
              const selected = scopedTargetIds.includes(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => onToggleTarget(t.id)}
                  style={{
                    padding: '6px 12px',
                    cursor: 'pointer',
                    background: selected ? 'var(--bg-primary)' : 'transparent',
                    borderLeft: selected ? '3px solid var(--accent-blue)' : '3px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 13, color: selected ? 'var(--accent-blue)' : 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  <span style={{ fontSize: 10, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{t.service}</span>
                </div>
              );
            })}
          </div>
        ))}
        {targets.length === 0 && (
          <div style={{ padding: '16px 12px', color: 'var(--text-tertiary)', fontSize: 12 }}>暂无目标，点击 + 添加</div>
        )}
      </div>
    </div>
  );
}

// ===== LogChatPanel =====
type TabType = 'trace' | 'conversation' | 'summary' | 'raw' | 'report';

interface LogChatPanelProps {
  steps: DiagnosisStep[];
  setSteps: React.Dispatch<React.SetStateAction<DiagnosisStep[]>>;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  scopedTargetIds: string[];
  sessions: LogChatSession[];
  activeTab: TabType;
  setActiveTab: (t: TabType) => void;
}

function LogChatPanel({
  steps, setSteps, activeSessionId, setActiveSessionId, scopedTargetIds, sessions, activeTab, setActiveTab,
}: LogChatPanelProps) {
  const createSession = useCreateLogSession();
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const traceEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  const TABS: { key: TabType; label: string }[] = [
    { key: 'trace', label: '追踪' },
    { key: 'conversation', label: '对话' },
    { key: 'summary', label: '摘要' },
    { key: 'raw', label: '原始' },
    { key: 'report', label: '报告' },
  ];

  const activeSession = sessions.find(s => s.id === activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];
  const lastAnswer = [...steps].reverse().find(s => s.type === 'answer');
  const rawContent = steps.filter(s => s.type === 'result').map(s => s.content).join('\n---\n');

  const handleSend = async () => {
    if (!query.trim() || sending) return;
    setSending(true);
    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const sess = await createSession.mutateAsync({ title: query.slice(0, 40), scopedTargetIds });
        sessionId = sess.id;
        setActiveSessionId(sessionId);
      }
      const resp = await fetch(`${API_BASE}/logs/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, query }),
      });
      setQuery('');
      const reader = resp.body!.getReader();
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
              const evt = JSON.parse(line.slice(6)) as LogStreamEvent;
              if (evt.type !== 'done') {
                setSteps(prev => [...prev, {
                  type: evt.type as DiagnosisStep['type'],
                  content: evt.content,
                  targetId: evt.targetId,
                  command: evt.command,
                  exitCode: evt.exitCode,
                  createdAt: new Date().toISOString(),
                }]);
              }
            } catch { /* ignore */ }
          }
        }
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--bg-tertiary)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'transparent',
              color: activeTab === tab.key ? 'var(--accent-blue)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent-blue)' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {activeTab === 'trace' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((step, i) => (
              <StepItem key={i} step={step} />
            ))}
            {steps.length === 0 && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>选择目标后输入问题开始诊断</div>
            )}
            <div ref={traceEndRef} />
          </div>
        )}
        {activeTab === 'conversation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {messages.length === 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>暂无对话记录</div>}
          </div>
        )}
        {activeTab === 'summary' && (
          <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, color: 'var(--text-primary)', fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {lastAnswer ? lastAnswer.content : <span style={{ color: 'var(--text-tertiary)' }}>暂无摘要</span>}
          </div>
        )}
        {activeTab === 'raw' && (
          <pre style={{ background: 'var(--bg-code)', color: 'var(--text-secondary)', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {rawContent || '暂无原始输出'}
          </pre>
        )}
        {activeTab === 'report' && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>报告生成中...</div>
        )}
      </div>

      {/* Input area */}
      <div style={{ borderTop: '1px solid var(--bg-tertiary)', padding: 12, display: 'flex', gap: 8, flexShrink: 0, background: 'var(--bg-secondary)' }}>
        <textarea
          rows={3}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={scopedTargetIds.length === 0 ? '请先选择日志目标...' : '输入诊断问题...'}
          disabled={scopedTargetIds.length === 0 || sending}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { void handleSend(); } }}
          style={{
            flex: 1,
            background: 'var(--bg-primary)',
            border: '1px solid var(--bg-tertiary)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            padding: '8px 10px',
            fontSize: 13,
            resize: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={() => { void handleSend(); }}
          disabled={!query.trim() || sending || scopedTargetIds.length === 0}
          style={{
            background: sending ? 'var(--bg-tertiary)' : 'var(--accent-blue)',
            border: 'none',
            borderRadius: 6,
            color: 'var(--text-inverse)',
            padding: '0 16px',
            cursor: sending ? 'default' : 'pointer',
            fontSize: 14,
            alignSelf: 'stretch',
          }}
        >
          {sending ? '...' : '发送'}
        </button>
      </div>
    </div>
  );
}

function StepItem({ step }: { step: DiagnosisStep }) {
  if (step.type === 'thinking') {
    return (
      <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: 12, padding: '4px 8px', borderLeft: '3px solid var(--bg-tertiary)' }}>
        <MessageCircle size={12} style={{ display: 'inline', marginRight: 4 }} /> {step.content}
      </div>
    );
  }
  if (step.type === 'command') {
    return (
      <div style={{ background: 'var(--bg-primary)', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', fontSize: 12 }}>
        <span style={{ color: 'var(--text-tertiary)', marginRight: 8, display: 'inline-flex', alignItems: 'center' }}><DollarSign size={12} /></span>
        <span style={{ color: 'var(--accent-blue)' }}>{step.content}</span>
        {step.targetId && (
          <span style={{ marginLeft: 8, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: 3, padding: '1px 5px', fontSize: 11 }}>{step.targetId}</span>
        )}
      </div>
    );
  }
  if (step.type === 'result') {
    return (
      <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--bg-code)', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {step.content || '(empty)'}
        {step.exitCode !== undefined && step.exitCode !== 0 && (
          <div style={{ color: 'var(--accent-red-light)', marginTop: 4 }}>exit: {step.exitCode}</div>
        )}
      </div>
    );
  }
  if (step.type === 'answer') {
    return (
      <div style={{ color: 'var(--accent-green)', padding: '8px 10px', background: 'var(--answer-bg)', borderRadius: 6, fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
        <Check size={12} style={{ display: 'inline', marginRight: 4 }} /> {step.content}
      </div>
    );
  }
  return null;
}

// ===== RightRail =====
interface RightRailProps {
  sessions: LogChatSession[];
  activeSessionId: string | null;
  onSelectSession: (session: LogChatSession) => void;
  scopedTargetIds: string[];
}

function RightRail({ sessions, activeSessionId, onSelectSession, scopedTargetIds }: RightRailProps) {
  const { data: targets = [] } = useLogTargets();
  const deleteSession = useDeleteLogSession();
  const recent = sessions.slice(0, 5);

  return (
    <div style={{ width: 220, background: 'var(--bg-secondary)', borderLeft: '1px solid var(--bg-tertiary)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      {/* History */}
      <div style={{ padding: '12px 12px 6px', borderBottom: '1px solid var(--bg-tertiary)' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>历史会话</div>
        {recent.length === 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>暂无会话</div>}
        {recent.map(s => (
          <div
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 0',
              cursor: 'pointer',
              borderLeft: s.id === activeSessionId ? '3px solid var(--accent-blue)' : '3px solid transparent',
              paddingLeft: s.id === activeSessionId ? 6 : 0,
            }}
          >
            <div
              onClick={() => onSelectSession(s)}
              style={{ flex: 1, overflow: 'hidden' }}
            >
              <div style={{ fontSize: 12, color: s.id === activeSessionId ? 'var(--accent-blue)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.title || '未命名会话'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.createdAt.slice(0, 10)}</div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); void deleteSession.mutateAsync(s.id); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px 4px', fontSize: 12, flexShrink: 0, display: 'flex', alignItems: 'center' }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Current targets */}
      <div style={{ padding: '10px 12px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>当前目标</div>
        {scopedTargetIds.length === 0 && <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>未选择目标</div>}
        {scopedTargetIds.map(id => {
          const t = targets.find(x => x.id === id);
          return (
            <div key={id} style={{ fontSize: 12, color: 'var(--text-primary)', padding: '3px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t?.name ?? id}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== LogsView =====
export function LogsView() {
  const [scopedTargetIds, setScopedTargetIds] = useState<string[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [steps, setSteps] = useState<DiagnosisStep[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('trace');
  const { data: sessions = [] } = useLogSessions();

  const handleToggleTarget = (id: string) => {
    setScopedTargetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectSession = (session: LogChatSession) => {
    setActiveSessionId(session.id);
    setSteps(session.steps ?? []);
    setActiveTab(session.tab ?? 'trace');
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <LogsSidebar
        scopedTargetIds={scopedTargetIds}
        onToggleTarget={handleToggleTarget}
      />
      <LogChatPanel
        steps={steps}
        setSteps={setSteps}
        activeSessionId={activeSessionId}
        setActiveSessionId={setActiveSessionId}
        scopedTargetIds={scopedTargetIds}
        sessions={sessions}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
      <RightRail
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        scopedTargetIds={scopedTargetIds}
      />
    </div>
  );
}
