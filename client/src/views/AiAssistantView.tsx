import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, X, Bot, FileText, FlaskConical, BarChart3, Bug, HelpCircle, Sparkles, Square } from 'lucide-react';
import { useRequirements, useDefects, useTestCases, useTestRuns } from '../api/hooks';
import { authHeaders } from '../api/client';
import type { Requirement, Stage } from '@devflow/shared';
import { STAGE_LABELS } from '@devflow/shared';

const API_BASE = '/api';

type MessageRole = 'user' | 'assistant' | 'system';

interface Message {
  id: string;
  role: MessageRole;
  content: string;
  pending?: boolean;
  error?: string;
  sessionId?: string;
  /** which quick-action produced this (for badge) */
  source?: string;
}

type QuickActionKey = 'spec' | 'smoke' | 'test-report' | 'defect-stats' | 'guide';

interface QuickAction {
  key: QuickActionKey;
  label: string;
  desc: string;
  icon: React.ReactNode;
  needsReq: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  { key: 'spec',         label: '生成需求 Spec',    desc: '基于需求草稿生成 RequirementSpec',  icon: <FileText size={14} />,    needsReq: true },
  { key: 'smoke',        label: '生成冒烟用例',     desc: 'AI 根据需求生成冒烟测试用例',         icon: <FlaskConical size={14} />, needsReq: true },
  { key: 'test-report',  label: '生成测试报告',     desc: '聚合执行记录、缺陷生成 Markdown 报告', icon: <BarChart3 size={14} />,    needsReq: true },
  { key: 'defect-stats', label: '缺陷统计',         desc: '按严重程度 / 状态 / 阶段 输出当前快照', icon: <Bug size={14} />,           needsReq: false },
  { key: 'guide',        label: '系统指引',         desc: '查看常用功能、命令、键盘快捷键',       icon: <HelpCircle size={14} />,    needsReq: false },
];

const GUIDE_TEXT = `**DevFlow 速查表**

- **需求看板** \`/board\`: 需求按阶段流转 (backlog → analyzing → development → uat → prerelease → released)
- **测试与缺陷** \`/testing\`: 用例 / 计划 / 执行历史 / 门禁 / 缺陷 在同一视图，通过顶部"需求/阶段"过滤
- **AI 助手** \`/assistant\`: 当前页 — 通过快捷指令或自由对话调用 Agent
- **发布** \`/release\`: 灰度 / QuickPublish
- **日志** \`/logs\`: 服务日志与异常排查
- **仪表板** \`/dashboard\`: 全局健康度与活动

**常用快捷指令**
- 选中需求后点击 "生成需求 Spec" / "生成冒烟用例"
- 输入框直接发自然语言指令，AI 会结合数据库快照给出流程建议、状态摘要和操作指引
- ESC 可关闭抽屉 / 弹层

**Agent 驱动原则**
- 阶段流转、Spec 撰写、用例生成、缺陷修复均由 Agent 通过 HTTP API 执行，人是引导者
- 每次 Agent 副作用都会写入 \`/api/events\`（actor=agent），可在仪表板回溯
`;

function uid() { return Math.random().toString(36).slice(2, 10); }

function pickRequirement(reqs: Requirement[], stage: 'all' | Stage, search: string): Requirement[] {
  let list = reqs.filter(r => !r.archivedAt);
  if (stage !== 'all') list = list.filter(r => r.stage === stage);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(r => r.title.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }
  return list;
}

export function AiAssistantView() {
  const [messages, setMessages] = useState<Message[]>(() => [{
    id: uid(), role: 'assistant', content: '你好，我是 DevFlow AI 助手。可以使用下方快捷指令调用研发流程，或直接输入自然语言提问。',
  }]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [picker, setPicker] = useState<{ action: QuickAction; stage: 'all' | Stage; search: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: reqs = [] } = useRequirements();
  const { data: allDefects = [] } = useDefects(undefined);
  const { data: allCases = [] } = useTestCases(undefined);
  const { data: allRuns = [] } = useTestRuns(undefined);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const appendMessage = (m: Omit<Message, 'id'>) => {
    const id = uid();
    setMessages(prev => [...prev, { ...m, id }]);
    return id;
  };

  const updateMessage = (id: string, patch: Partial<Message>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  };

  const handleQuickAction = (action: QuickAction) => {
    if (action.key === 'guide') {
      appendMessage({ role: 'assistant', content: GUIDE_TEXT, source: '系统指引' });
      return;
    }
    if (action.key === 'defect-stats') {
      runDefectStats();
      return;
    }
    if (action.needsReq) {
      setPicker({ action, stage: 'all', search: '' });
    }
  };

  const runDefectStats = () => {
    const total = allDefects.length;
    if (total === 0) {
      appendMessage({ role: 'assistant', content: '当前系统中没有缺陷数据。', source: '缺陷统计' });
      return;
    }
    const bySeverity = allDefects.reduce((m, d) => { m[d.severity] = (m[d.severity] ?? 0) + 1; return m; }, {} as Record<string, number>);
    const byStatus = allDefects.reduce((m, d) => { m[d.status] = (m[d.status] ?? 0) + 1; return m; }, {} as Record<string, number>);
    const stageOfReq = new Map(reqs.map(r => [r.id, r.stage]));
    const byStage = allDefects.reduce((m, d) => {
      const s = stageOfReq.get(d.reqId) ?? 'unknown';
      m[s] = (m[s] ?? 0) + 1; return m;
    }, {} as Record<string, number>);

    let md = `**缺陷统计** · 共 ${total} 条\n\n`;
    md += `**按严重程度**\n`;
    for (const k of ['P0', 'P1', 'P2', 'P3']) {
      const c = bySeverity[k] ?? 0;
      if (c) md += `- ${k}: ${c}\n`;
    }
    md += `\n**按状态**\n`;
    for (const [k, v] of Object.entries(byStatus)) md += `- ${k}: ${v}\n`;
    md += `\n**按阶段**\n`;
    for (const [k, v] of Object.entries(byStage)) md += `- ${k}: ${v}\n`;
    md += `\n用例总数 ${allCases.length}，最近 ${allRuns.length} 次执行（来自仪表板缓存）`;
    appendMessage({ role: 'assistant', content: md, source: '缺陷统计' });
  };

  const runRequirementAction = async (action: QuickAction, req: Requirement) => {
    setPicker(null);
    const userMsgId = appendMessage({ role: 'user', content: `${action.label} · ${req.title} (${req.id})` });
    void userMsgId;
    const replyId = appendMessage({ role: 'assistant', content: '', pending: true, source: action.label });
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    activeSessionIdRef.current = null;

    try {
      const endpoint =
        action.key === 'spec' ? '/specs/requirement/generate' :
        action.key === 'smoke' ? '/test-cases/generate' :
        action.key === 'test-report' ? '/test-reports/generate' : null;
      if (!endpoint) throw new Error('未知动作');

      const body: Record<string, unknown> = { reqId: req.id };
      if (action.key === 'smoke') body.scope = 'smoke';

      const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        updateMessage(replyId, { pending: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` });
        return;
      }

      if (action.key === 'test-report') {
        // Non-streaming JSON response
        const data = await resp.json() as { content?: string; docId?: string };
        updateMessage(replyId, { pending: false, content: data.content ?? '已生成，但未返回正文。' });
        return;
      }

      // SSE streaming for spec & smoke
      if (!resp.body) {
        updateMessage(replyId, { pending: false, error: '响应为空' });
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      let count: number | null = null;
      let cancelled = false;
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
              message?: string;
              sessionId?: string;
            };
            if (ev.type === 'started' && ev.sessionId) {
              activeSessionIdRef.current = ev.sessionId;
            } else if (ev.type === 'entry' && ev.entry?.content) {
              acc += ev.entry.content;
              updateMessage(replyId, { content: acc });
            } else if (ev.type === 'patch' && ev.patch?.content) {
              acc += ev.patch.content;
              updateMessage(replyId, { content: acc });
            } else if (ev.type === 'done') {
              count = ev.count ?? null;
            } else if (ev.type === 'cancelled') {
              cancelled = true;
            } else if (ev.type === 'error' && ev.message) {
              updateMessage(replyId, { pending: false, error: ev.message });
              return;
            }
          } catch { /* ignore */ }
        }
      }
      if (cancelled) {
        updateMessage(replyId, { pending: false, content: acc, error: '已取消' });
      } else {
        const suffix = action.key === 'smoke' && count != null ? `\n\n✓ 已生成 ${count} 条用例` : '';
        updateMessage(replyId, { pending: false, content: (acc || '完成') + suffix });
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        updateMessage(replyId, { pending: false, error: '已取消' });
      } else {
        updateMessage(replyId, { pending: false, error: (e as Error).message });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      activeSessionIdRef.current = null;
    }
  };

  const handleSendFreeForm = async () => {
    const text = input.trim();
    if (!text || running) return;
    setInput('');
    appendMessage({ role: 'user', content: text });
    const replyId = appendMessage({ role: 'assistant', content: '', pending: true });
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    activeSessionIdRef.current = null;

    try {
      const resp = await fetch(`${API_BASE}/assistant/chat`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prompt: text }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        updateMessage(replyId, { pending: false, error: `HTTP ${resp.status}: ${t.slice(0, 200)}` });
        return;
      }
      if (!resp.body) {
        updateMessage(replyId, { pending: false, error: '响应为空' });
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let acc = '';
      let cancelled = false;
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
              entry?: { content?: string; type?: string };
              patch?: { content?: string };
              message?: string;
              content?: string;
              sessionId?: string;
            };
            if (ev.type === 'started' && ev.sessionId) {
              activeSessionIdRef.current = ev.sessionId;
              updateMessage(replyId, { sessionId: ev.sessionId });
            } else if (ev.type === 'entry' && ev.entry?.type === 'assistant_message' && ev.entry.content) {
              acc += ev.entry.content;
              updateMessage(replyId, { content: acc });
            } else if (ev.type === 'patch' && ev.patch?.content) {
              acc += ev.patch.content;
              updateMessage(replyId, { content: acc });
            } else if (ev.type === 'cancelled') {
              cancelled = true;
            } else if (ev.type === 'error' && ev.message) {
              updateMessage(replyId, { pending: false, error: ev.message });
              return;
            } else if (ev.type === 'done' && (ev.content || ev.message)) {
              acc += ev.content ?? ev.message ?? '';
              updateMessage(replyId, { content: acc });
            }
          } catch { /* ignore */ }
        }
      }
      if (cancelled) {
        updateMessage(replyId, { pending: false, content: acc, error: '已取消' });
      } else {
        updateMessage(replyId, { pending: false, content: acc || '(无回复)' });
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        updateMessage(replyId, { pending: false, error: '已取消' });
      } else {
        updateMessage(replyId, { pending: false, error: (e as Error).message });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      activeSessionIdRef.current = null;
    }
  };

  const handleCancel = async () => {
    const sid = activeSessionIdRef.current;
    if (sid) {
      try { await fetch(`${API_BASE}/assistant/chat/${sid}/cancel`, { method: 'POST', headers: authHeaders() }); } catch { /* ignore */ }
    }
    abortRef.current?.abort();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendFreeForm();
    }
  };

  const pickerReqs = useMemo(() => picker ? pickRequirement(reqs, picker.stage, picker.search) : [], [picker, reqs]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkles size={18} style={{ color: 'var(--accent-blue)' }} />
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>AI 助手</h2>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Agent 驱动 · 调用研发流程 · 自由对话</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions + Input */}
      <div style={{ borderTop: '1px solid var(--border-default)', background: 'var(--bg-secondary)', padding: '12px 24px' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {QUICK_ACTIONS.map(a => (
            <button
              key={a.key}
              onClick={() => handleQuickAction(a)}
              disabled={running}
              title={a.desc}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 16, fontSize: 12,
                background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                color: 'var(--text-secondary)', cursor: running ? 'not-allowed' : 'pointer',
                opacity: running ? 0.5 : 1,
              }}
              onMouseEnter={(e) => { if (!running) (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; }}
            >{a.icon}{a.label}</button>
          ))}
        </div>
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 8,
          background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 8,
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={running ? '生成中…' : '输入指令，Enter 发送，Shift+Enter 换行'}
            rows={2}
            disabled={running}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none',
              color: 'var(--text-primary)', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit',
              maxHeight: 160,
            }}
          />
          {running ? (
            <button
              onClick={() => { void handleCancel(); }}
              title="停止"
              style={{
                background: 'var(--accent-red)', border: 'none', borderRadius: 6, color: 'var(--text-inverse)',
                width: 32, height: 32, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><Square size={14} fill="currentColor" /></button>
          ) : (
            <button
              onClick={() => { void handleSendFreeForm(); }}
              disabled={!input.trim()}
              title="发送 (Enter)"
              style={{
                background: input.trim() ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                border: 'none', borderRadius: 6,
                color: input.trim() ? 'var(--text-inverse)' : 'var(--text-tertiary)',
                width: 32, height: 32, cursor: input.trim() ? 'pointer' : 'not-allowed',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            ><Send size={14} /></button>
          )}
        </div>
      </div>

      {/* Requirement picker modal */}
      {picker && (
        <ReqPickerModal
          action={picker.action}
          stage={picker.stage}
          search={picker.search}
          reqs={pickerReqs}
          onStageChange={(s) => setPicker(p => p ? { ...p, stage: s } : p)}
          onSearchChange={(s) => setPicker(p => p ? { ...p, search: s } : p)}
          onClose={() => setPicker(null)}
          onPick={(r) => { void runRequirementAction(picker.action, r); }}
        />
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const align: React.CSSProperties = isUser
    ? { alignSelf: 'flex-end', maxWidth: '80%' }
    : { alignSelf: 'flex-start', maxWidth: '92%' };
  const bg = isUser ? 'var(--accent-blue)' : 'var(--bg-secondary)';
  const fg = isUser ? 'var(--text-inverse)' : 'var(--text-primary)';

  return (
    <div style={{ ...align, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {!isUser && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
          <Bot size={12} /> AI 助手
          {msg.source && (
            <span style={{ background: 'var(--bg-tertiary)', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>{msg.source}</span>
          )}
        </div>
      )}
      <div style={{
        background: bg, color: fg, borderRadius: 8, padding: '10px 14px',
        fontSize: 13, lineHeight: 1.6, border: isUser ? 'none' : '1px solid var(--border-default)',
      }}>
        {msg.pending && !msg.content && (
          <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>正在生成…</span>
        )}
        {msg.content && (
          <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</pre>
        )}
        {msg.error && (
          <div style={{ marginTop: msg.content ? 8 : 0, fontSize: 12, color: 'var(--accent-red)' }}>✗ {msg.error}</div>
        )}
      </div>
    </div>
  );
}

const STAGES: Stage[] = ['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released'];

interface ReqPickerProps {
  action: QuickAction;
  stage: 'all' | Stage;
  search: string;
  reqs: Requirement[];
  onStageChange: (s: 'all' | Stage) => void;
  onSearchChange: (s: string) => void;
  onClose: () => void;
  onPick: (r: Requirement) => void;
}

function ReqPickerModal({ action, stage, search, reqs, onStageChange, onSearchChange, onClose, onPick }: ReqPickerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200 }} />
      <div
        style={{
          position: 'fixed', top: '15%', left: '50%', transform: 'translateX(-50%)',
          width: 540, maxWidth: '92vw', maxHeight: '70vh',
          background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
          borderRadius: 8, boxShadow: '0 12px 32px rgba(0,0,0,0.3)', zIndex: 201,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>选择需求 · {action.label}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索 ID 或标题..."
            autoFocus
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-primary)', padding: '6px 10px', fontSize: 12, outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button onClick={() => onStageChange('all')} style={pickerChip(stage === 'all')}>全部</button>
            {STAGES.map(s => (
              <button key={s} onClick={() => onStageChange(s)} style={pickerChip(stage === s)}>{STAGE_LABELS[s]}</button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {reqs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>暂无符合条件的需求</div>
          ) : reqs.map(r => (
            <div
              key={r.id}
              onClick={() => onPick(r)}
              style={{
                padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-default)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <code style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{r.id}</code>
                <span style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', borderRadius: 3, padding: '0 6px', fontSize: 10 }}>{STAGE_LABELS[r.stage]}</span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{r.title}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function pickerChip(active: boolean): React.CSSProperties {
  return {
    padding: '2px 8px', borderRadius: 3, fontSize: 10, cursor: 'pointer',
    border: '1px solid ' + (active ? 'var(--accent-blue)' : 'var(--border-default)'),
    background: active ? 'var(--accent-blue)' : 'transparent',
    color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
  };
}
