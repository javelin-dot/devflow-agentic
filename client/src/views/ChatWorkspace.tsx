import { useState, useEffect, useRef } from 'react';
import { Check, X, Pencil, Plus, FileText, BookOpen, ListChecks, GitBranch, ArrowUp, Sparkles, ChevronRight, Info, Bot } from 'lucide-react';
import { UiSelect } from '../components/ui';
import { useSessions, useCreateSession, usePatchSession, useDeleteSession, useMessages, useAgentAvailability, useSettings, useAttachmentsV2, useDeleteMessage, useDeleteMessages } from '../api/hooks';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { apiFetch } from '../api/client';
import type { ChatSession, ChatMessage, AgentStreamEvent, Requirement } from '@devflow/shared';
import { AnalysisComparePanel } from './AnalysisComparePanel';
import { SubTaskPanel } from './SubTaskPanel';
import { RequirementSpecEditor } from '../components/RequirementSpecEditor';
import { DesignSpecEditor } from '../components/DesignSpecEditor';

interface EntryRowProps {
  msg: ChatMessage;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
  onApprove?: () => Promise<void>;
  onReject?: () => Promise<void>;
}

function EntryRow({ msg, selectMode, selected, onSelect, onDelete, onApprove, onReject }: EntryRowProps) {
  const isUser = msg.role === 'user';
  const isToolUse = msg.entryType === 'tool_use';
  const isThinking = msg.entryType === 'thinking';
  const isPlan = msg.entryType === 'plan';
  const isTodo = msg.entryType === 'todo_update';
  const [hover, setHover] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [approving, setApproving] = useState<'approve' | 'reject' | null>(null);

  const label = isUser ? '用户' : isThinking ? '思考' : isToolUse ? '工具' : isPlan ? '计划' : isTodo ? '待办' : 'Agent';
  const labelColor = isUser ? 'var(--accent-blue)' : isThinking ? 'var(--accent-orange)' : isToolUse ? 'var(--accent-blue)' : isPlan ? 'var(--accent-purple)' : isTodo ? 'var(--accent-green)' : 'var(--text-secondary)';
  const bgColor = isUser ? 'var(--bg-tertiary)' : isThinking ? 'var(--bg-tertiary)' : isPlan ? 'var(--bg-tertiary)' : isTodo ? 'var(--bg-tertiary)' : 'var(--bg-secondary)';
  const borderColor = isUser ? 'var(--border-default)' : isPlan ? 'var(--border-default)' : isTodo ? 'var(--border-default)' : 'var(--border-default)';

  const renderContent = () => {
    if (isToolUse && msg.action) {
      return (
        <span>
          <span style={{ color: 'var(--accent-blue)' }}>{(msg.action as Record<string, unknown>).type as string ?? 'tool'}</span>
          {' '}
          <span style={{ color: 'var(--text-secondary)' }}>{msg.content?.slice(0, 200)}</span>
        </span>
      );
    }
    if (isPlan) {
      try {
        const plan = JSON.parse(msg.content) as { title?: string; steps?: string[] };
        return (
          <div>
            {plan.title && <div style={{ fontWeight: 600, color: 'var(--accent-purple)', marginBottom: 6 }}>{plan.title}</div>}
            {plan.steps && (
              <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)' }}>
                {plan.steps.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
              </ol>
            )}
            {!plan.title && !plan.steps && <span>{msg.content}</span>}
          </div>
        );
      } catch {
        return <span>{msg.content?.slice(0, 2000)}</span>;
      }
    }
    if (isTodo) {
      try {
        const todos = JSON.parse(msg.content) as Array<{ title: string; status: 'pending' | 'done' | 'in_progress' }>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {todos.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 11, padding: '1px 6px', borderRadius: 3,
                  background: t.status === 'done' ? 'var(--diff-add-bg)' : t.status === 'in_progress' ? 'var(--bg-tertiary)' : 'var(--bg-tertiary)',
                  color: t.status === 'done' ? 'var(--accent-green)' : t.status === 'in_progress' ? 'var(--accent-orange)' : 'var(--text-secondary)',
                  border: `1px solid ${t.status === 'done' ? 'var(--accent-green-44)' : t.status === 'in_progress' ? 'var(--accent-orange-44)' : 'var(--border-default)'}`,
                }}>
                  {t.status === 'done' ? '已完成' : t.status === 'in_progress' ? '进行中' : '待办'}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{t.title}</span>
              </div>
            ))}
          </div>
        );
      } catch {
        return <span>{msg.content?.slice(0, 2000)}</span>;
      }
    }
    return <span>{msg.content?.slice(0, 2000)}</span>;
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '10px 14px',
        marginBottom: 6,
        borderRadius: 10,
        background: bgColor,
        border: `1px solid ${selected ? 'var(--accent-blue)' : borderColor}`,
        opacity: msg.status === 'error' ? 0.7 : 1,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        {selectMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            style={{ cursor: 'pointer', margin: 0 }}
          />
        )}
        <span style={{ fontSize: 10, color: labelColor, fontWeight: 600 }}>
          {label}
        </span>
        {msg.status === 'pending' && (
          <span style={{ fontSize: 10, color: 'var(--accent-orange)', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3 }}>
            待审批
          </span>
        )}
        {msg.status === 'error' && (
          <span style={{ fontSize: 10, color: 'var(--accent-red)' }}>失败</span>
        )}
        {!selectMode && hover && onDelete && (
          deleteConfirm ? (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>确认删除？</span>
              <button
                onClick={() => { onDelete(); setDeleteConfirm(false); }}
                style={{ fontSize: 10, color: 'var(--accent-red)', background: 'var(--diff-del-bg)', border: '1px solid var(--accent-red-44)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer' }}
              >确认</button>
              <button
                onClick={() => setDeleteConfirm(false)}
                style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 3, padding: '1px 6px', cursor: 'pointer' }}
              >取消</button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent-red)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
            >删除</button>
          )
        )}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: isToolUse ? 'monospace' : 'inherit', lineHeight: 1.6 }}>
        {renderContent()}
      </div>
      {msg.status === 'pending' && isToolUse && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={async () => { setApproving('approve'); await onApprove?.(); setApproving(null); }}
            disabled={approving !== null}
            style={{ padding: '4px 12px', background: approving === 'approve' ? 'var(--bg-disabled)' : 'var(--diff-add-bg)', border: '1px solid var(--accent-green-44)', borderRadius: 4, color: approving === 'approve' ? 'var(--text-tertiary)' : 'var(--accent-green)', cursor: approving !== null ? 'not-allowed' : 'pointer', fontSize: 12 }}
          >
            {approving === 'approve' ? '处理中...' : 'Approve'}
          </button>
          <button
            onClick={async () => { setApproving('reject'); await onReject?.(); setApproving(null); }}
            disabled={approving !== null}
            style={{ padding: '4px 12px', background: approving === 'reject' ? 'var(--bg-disabled)' : 'var(--diff-del-bg)', border: '1px solid var(--accent-red-44)', borderRadius: 4, color: approving === 'reject' ? 'var(--text-tertiary)' : 'var(--accent-red)', cursor: approving !== null ? 'not-allowed' : 'pointer', fontSize: 12 }}
          >
            {approving === 'reject' ? '处理中...' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  );
}

const TEXT_EXTS = ['.md', '.html', '.htm', '.txt', '.json', '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.xml', '.yaml', '.yml', '.css', '.scss', '.less', '.sql', '.sh', '.vue', '.svelte'];
const MAX_ATTACHMENT_SIZE = 100 * 1024;
const MAX_TOTAL_ATTACHMENTS = 200 * 1024;

function isTextFile(name: string) {
  const lower = name.toLowerCase();
  return TEXT_EXTS.some(ext => lower.endsWith(ext));
}

const QUICK_CHIP: React.CSSProperties = {
  fontSize: 12,
  padding: '5px 10px',
  borderRadius: 12,
  border: '1px solid var(--border-default)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

type OutputMode = 'chat' | 'spec' | 'design' | 'tasks';

function ChatPanel({ session, reqId, req, onClose, onOpenPanel, autoPrompt, onAutoPromptConsumed, initialMode }: {
  session: ChatSession;
  reqId: string;
  req: Requirement;
  onClose: () => void;
  onOpenPanel: (panel: 'spec' | 'design' | 'tasks' | 'analysis') => void;
  autoPrompt?: string;
  onAutoPromptConsumed?: () => void;
  initialMode?: OutputMode;
}) {
  const { data: messages = [], refetch } = useMessages(session.id);
  const { data: attachmentsData } = useAttachmentsV2(reqId);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [liveEntries, setLiveEntries] = useState<ChatMessage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const deleteMsg = useDeleteMessage();
  const deleteMsgs = useDeleteMessages();

  const attachmentFiles = attachmentsData?.filter((f: { filename: string }) => isTextFile(f.filename)) ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveEntries]);

  const allMsgs = [...messages, ...liveEntries];
  const persistedIds = new Set(messages.map(m => m.id));

  const msgGroupMap = (() => {
    const map = new Map<string, string[]>();
    let group: string[] = [];
    for (const msg of allMsgs) {
      const isChild = msg.entryType === 'tool_use' || msg.entryType === 'thinking' ||
                      msg.entryType === 'plan' || msg.entryType === 'todo_update';
      if (!isChild) {
        group = [msg.id];
      } else {
        group.push(msg.id);
      }
      map.set(msg.id, group);
    }
    return map;
  })();

  const toggleSelect = (id: string) => {
    const groupIds = msgGroupMap.get(id) ?? [id];
    const isGroupParent = groupIds[0] === id && groupIds.length > 1;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (isGroupParent) {
        const allSelected = groupIds.every(gid => next.has(gid));
        if (allSelected) groupIds.forEach(gid => next.delete(gid));
        else groupIds.forEach(gid => next.add(gid));
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSingle = (id: string) => {
    deleteMsg.mutate({ sessionId: session.id, messageId: id });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    deleteMsgs.mutate(
      { sessionId: session.id, ids: Array.from(selectedIds) },
      { onSuccess: () => { setSelectMode(false); setSelectedIds(new Set()); } }
    );
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setLiveEntries([]);
  };

  const handleApprove = async (msgId: string) => {
    await apiFetch(`/agent/permission/${session.id}/${msgId}/approve`, { method: 'POST' });
    refetch();
  };

  const handleReject = async (msgId: string) => {
    await apiFetch(`/agent/permission/${session.id}/${msgId}/reject`, { method: 'POST' });
    refetch();
  };

  const toggleFile = (name: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const runAgent = async (fullPrompt: string) => {
    if (running) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setLiveEntries([]);

    try {
      const resp = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Actor': 'user' },
        body: JSON.stringify({ sessionId: session.id, agent: session.agent, prompt: fullPrompt }),
        signal: ac.signal,
      });

      const reader = resp.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line) as AgentStreamEvent;
            if (evt.type === 'entry') {
              const e = evt.entry;
              setLiveEntries(prev => {
                const idx = prev.findIndex(m => m.id === e.id);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], content: updated[idx].content + e.content };
                  return updated;
                }
                return [...prev, {
                  id: e.id,
                  sessionId: e.sessionId,
                  role: e.type === 'user_message' ? 'user' : 'assistant',
                  content: e.content,
                  entryType: e.type,
                  action: e.action,
                  status: e.status,
                  createdAt: e.createdAt,
                }];
              });
            } else if (evt.type === 'patch') {
              setLiveEntries(prev => prev.map(m =>
                m.id === evt.entryId ? { ...m, ...evt.patch } : m
              ));
            } else if (evt.type === 'exit') {
              break readLoop;
            }
          } catch {
            // ignore parse errors on SSE lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') throw err;
    } finally {
      setRunning(false);
      abortRef.current = null;
      setLiveEntries([]);
      refetch();
    }
  };

  useEffect(() => {
    if (autoPrompt && !running) {
      const text = autoPrompt;
      onAutoPromptConsumed?.();
      runAgent(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt]);

  const sendMessage = async () => {
    if (!prompt.trim() || running) return;
    let fullPrompt = prompt.trim();
    setPrompt('');

    if (selectedFiles.size > 0) {
      const filesToFetch = attachmentFiles.filter((f: { filename: string; size: number }) => selectedFiles.has(f.filename) && f.size <= MAX_ATTACHMENT_SIZE);
      const totalSize = filesToFetch.reduce((sum: number, f: { size: number }) => sum + f.size, 0);
      if (totalSize <= MAX_TOTAL_ATTACHMENTS && filesToFetch.length > 0) {
        const contents = await Promise.all(
          filesToFetch.map(async (f: { id: string; filename: string }) => {
            try {
              const res = await fetch(`/api/attachments/${f.id}/raw`);
              if (!res.ok) return null;
              const text = await res.text();
              return { name: f.filename, text };
            } catch {
              return null;
            }
          })
        );
        const valid = contents.filter((c): c is { name: string; text: string } => c !== null);
        if (valid.length > 0) {
          const context = valid.map(c => `<attachment filename="${c.name}">\n${c.text}\n</attachment>`).join('\n\n');
          fullPrompt = `${context}\n\n${fullPrompt}`;
        }
      }
    }

    await runAgent(fullPrompt);
  };

  const showAnalysis = req.stage === 'analyzing' || req.stage === 'backlog';
  const showTasks = req.stage === 'development' || req.stage === 'uat' || req.stage === 'prerelease' || req.stage === 'released' || req.stage === 'analyzing';

  const [mode, setMode] = useState<OutputMode>(initialMode ?? 'chat');

  const runGenerateSpec = async () => {
    if (running) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    const tempId = `gen-spec-${Date.now()}`;
    setLiveEntries([{
      id: tempId,
      sessionId: session.id,
      role: 'assistant',
      content: '正在生成需求 Spec...',
      entryType: 'thinking',
      action: null,
      status: 'running',
      createdAt: new Date().toISOString(),
    }]);
    let streamError = '';
    let streamDone = false;
    try {
      const resp = await fetch('/api/specs/requirement/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId: req.id, agent: session.agent }),
        signal: ac.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        setLiveEntries(prev => prev.map(e =>
          e.id === tempId ? { ...e, content: `请求失败: HTTP ${resp.status} ${text.slice(0, 200)}` } : e
        ));
        return;
      }

      const reader = resp.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === 'entry' && (evt.entry?.type === 'thinking' || evt.entry?.type === 'assistant_message')) {
              const chunk = evt.entry.content ?? '';
              setLiveEntries(prev => prev.map(e => {
                const prefix = '正在生成需求 Spec...\n\n';
                const body = e.id === tempId && e.content.startsWith(prefix)
                  ? e.content.slice(prefix.length) + chunk
                  : chunk;
                return e.id === tempId ? { ...e, content: prefix + body } : e;
              }));
            } else if (evt.type === 'error') {
              streamError = evt.message || '未知错误';
              setLiveEntries(prev => prev.map(e =>
                e.id === tempId ? { ...e, content: `生成失败: ${streamError}` } : e
              ));
            } else if (evt.type === 'done') {
              streamDone = true;
              setLiveEntries(prev => prev.map(e =>
                e.id === tempId ? { ...e, content: '需求 Spec 生成完成 ✅\n\n您可以在右侧「需求 Spec」面板查看和编辑。' } : e
              ));
            }
          } catch { /* ignore */ }
        }
      }
      if (!streamError && !streamDone) {
        setLiveEntries(prev => prev.map(e =>
          e.id === tempId ? { ...e, content: '生成未返回有效内容，请检查后端日志与 AI 配置。' } : e
        ));
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setLiveEntries(prev => prev.filter(e => e.id !== tempId));
      } else {
        setLiveEntries(prev => prev.map(e =>
          e.id === tempId ? { ...e, content: `生成失败: ${err instanceof Error ? err.message : String(err)}` } : e
        ));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const runGenerateDesign = async () => {
    if (running) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    const tempId = `gen-design-${Date.now()}`;
    setLiveEntries([{
      id: tempId,
      sessionId: session.id,
      role: 'assistant',
      content: '正在生成设计 Spec...',
      entryType: 'thinking',
      action: null,
      status: 'running',
      createdAt: new Date().toISOString(),
    }]);
    let streamError = '';
    let streamDone = false;
    try {
      const resp = await fetch('/api/specs/design/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId: req.id, agent: session.agent }),
        signal: ac.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        setLiveEntries(prev => prev.map(e =>
          e.id === tempId ? { ...e, content: `请求失败: HTTP ${resp.status} ${text.slice(0, 200)}` } : e
        ));
        return;
      }

      const reader = resp.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === 'entry' && (evt.entry?.type === 'thinking' || evt.entry?.type === 'assistant_message')) {
              const chunk = evt.entry.content ?? '';
              setLiveEntries(prev => prev.map(e => {
                const prefix = '正在生成设计 Spec...\n\n';
                const body = e.id === tempId && e.content.startsWith(prefix)
                  ? e.content.slice(prefix.length) + chunk
                  : chunk;
                return e.id === tempId ? { ...e, content: prefix + body } : e;
              }));
            } else if (evt.type === 'error') {
              streamError = evt.message || '未知错误';
              setLiveEntries(prev => prev.map(e =>
                e.id === tempId ? { ...e, content: `生成失败: ${streamError}` } : e
              ));
            } else if (evt.type === 'done') {
              streamDone = true;
              setLiveEntries(prev => prev.map(e =>
                e.id === tempId ? { ...e, content: '设计 Spec 生成完成 ✅\n\n您可以在右侧「设计 Spec」面板查看和编辑。' } : e
              ));
            }
          } catch { /* ignore */ }
        }
      }
      if (!streamError && !streamDone) {
        setLiveEntries(prev => prev.map(e =>
          e.id === tempId ? { ...e, content: '生成未返回有效内容，请检查后端日志与 AI 配置。' } : e
        ));
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setLiveEntries(prev => prev.filter(e => e.id !== tempId));
      } else {
        setLiveEntries(prev => prev.map(e =>
          e.id === tempId ? { ...e, content: `设计 Spec 生成失败: ${err instanceof Error ? err.message : String(err)}` } : e
        ));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleSend = async () => {
    if (running) return;
    if (mode === 'spec') {
      setMode('chat');
      await runGenerateSpec();
      return;
    }
    if (mode === 'design') {
      setMode('chat');
      await runGenerateDesign();
      return;
    }
    if (mode === 'tasks') {
      setMode('chat');
      setPrompt('');
      await runAgent('请查看并汇报当前需求的任务进度，包括各子任务的状态和完成情况。');
      return;
    }
    await sendMessage();
  };

  const toggleMode = (next: 'chat' | 'spec' | 'design' | 'tasks') => {
    setMode(prev => prev === next ? 'chat' : next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{session.title || session.agent}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{session.agent}</span>
          {running && (
            <button
              onClick={handleStop}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid var(--accent-red-44)', background: 'var(--diff-del-bg)', color: 'var(--accent-red)', cursor: 'pointer' }}
            >
              停止
            </button>
          )}
          {selectMode ? (
            <>
              <button
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0 || deleteMsgs.isPending}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--accent-red-44)', background: 'var(--diff-del-bg)', color: 'var(--accent-red)', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer' }}
              >
                删除 ({selectedIds.size})
              </button>
              <button
                onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-default)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                取消
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-default)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              选择
            </button>
          )}
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 20px' }}>
          {allMsgs.map(m => {
            const groupIds = msgGroupMap.get(m.id) ?? [m.id];
            const isGroupParent = groupIds[0] === m.id && groupIds.length > 1;
            const isSelected = isGroupParent
              ? groupIds.every(gid => selectedIds.has(gid))
              : selectedIds.has(m.id);
            return (
              <EntryRow
                key={m.id}
                msg={m}
                selectMode={selectMode}
                selected={isSelected}
                onSelect={() => toggleSelect(m.id)}
                onDelete={persistedIds.has(m.id) ? () => handleDeleteSingle(m.id) : undefined}
                onApprove={() => handleApprove(m.id)}
                onReject={() => handleReject(m.id)}
              />
            );
          })}
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {liveEntries.some(e => e.entryType === 'thinking') ? '思考中' : '生成中'}
              </span>
              <span style={{ display: 'flex', gap: 3 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-blue)',
                    animation: `typing-dot 1.2s ${i * 0.2}s infinite ease-in-out both`,
                  }} />
                ))}
              </span>
            </div>
          )}
          <style>{`
            @keyframes typing-dot {
              0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
              40% { transform: scale(1); opacity: 1; }
            }
          `}</style>
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          {attachmentFiles.length > 0 && (
            <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {attachmentFiles.map((f: { filename: string; id: string }) => {
                const display = f.filename;
                const active = selectedFiles.has(f.filename);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFile(f.filename)}
                    title={active ? '点击取消引用' : '点击引用该文件'}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 4,
                      border: `1px solid ${active ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                      background: active ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                      color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {active ? <Check size={12} style={{ display: 'inline', marginRight: 2 }} /> : null}{display}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '12px 16px', boxShadow: 'var(--shadow-sm)' }}>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(); } }}
              placeholder="输入指令... (⌘/Ctrl+Enter 发送)"
              disabled={running}
              style={{
                width: '100%', border: 'none', background: 'transparent', outline: 'none',
                color: 'var(--text-primary)', fontSize: 14, resize: 'none', minHeight: 48,
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {showAnalysis && (
                  <button onClick={() => onOpenPanel('analysis')} style={QUICK_CHIP} onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; }} onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}>
                    <GitBranch size={11} />分析方案
                  </button>
                )}
                <button
                  onClick={() => toggleMode('spec')}
                  style={{
                    ...QUICK_CHIP,
                    borderColor: mode === 'spec' ? 'var(--accent-blue)' : 'var(--border-default)',
                    color: mode === 'spec' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    background: mode === 'spec' ? 'var(--accent-blue-10)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (mode !== 'spec') { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; }}}
                  onMouseLeave={e => { if (mode !== 'spec') { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}}
                >
                  <FileText size={11} />生成需求Spec
                </button>
                <button
                  onClick={() => toggleMode('design')}
                  style={{
                    ...QUICK_CHIP,
                    borderColor: mode === 'design' ? 'var(--accent-blue)' : 'var(--border-default)',
                    color: mode === 'design' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    background: mode === 'design' ? 'var(--accent-blue-10)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (mode !== 'design') { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; }}}
                  onMouseLeave={e => { if (mode !== 'design') { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}}
                >
                  <BookOpen size={11} />生成设计Spec
                </button>
                {showTasks && (
                  <button
                    onClick={() => toggleMode('tasks')}
                    style={{
                      ...QUICK_CHIP,
                      borderColor: mode === 'tasks' ? 'var(--accent-blue)' : 'var(--border-default)',
                      color: mode === 'tasks' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                      background: mode === 'tasks' ? 'var(--accent-blue-10)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (mode !== 'tasks') { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; }}}
                    onMouseLeave={e => { if (mode !== 'tasks') { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}}
                  >
                    <ListChecks size={11} />任务进度
                  </button>
                )}
              </div>
              <button
                onClick={handleSend}
                disabled={running || (mode === 'chat' && !prompt.trim())}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none',
                  background: running || (mode === 'chat' && !prompt.trim()) ? 'var(--bg-disabled)' : 'var(--accent-blue)',
                  color: 'var(--text-inverse)', cursor: running || (mode === 'chat' && !prompt.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SessionItemProps {
  session: ChatSession;
  active: boolean;
  renaming: boolean;
  renameValue: string;
  onRenameValueChange: (v: string) => void;
  onClick: () => void;
  onStartRename: () => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
}

function SessionItem({ session: s, active, renaming, renameValue, onRenameValueChange, onClick, onStartRename, onConfirmRename, onCancelRename, onDelete }: SessionItemProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 2,
        background: active ? 'var(--bg-hover)' : 'transparent',
        border: active ? '1px solid var(--accent-blue-44)' : '1px solid transparent',
        position: 'relative',
      }}
    >
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={e => onRenameValueChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onConfirmRename();
            if (e.key === 'Escape') onCancelRename();
          }}
          onBlur={onConfirmRename}
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', padding: '2px 4px', background: 'var(--bg-primary)', border: '1px solid var(--accent-blue)',
            borderRadius: 3, color: 'var(--text-primary)', fontSize: 12, boxSizing: 'border-box',
          }}
        />
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, paddingRight: hover ? 40 : 0 }}>
          {s.title || s.agent}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>{s.agent}</div>
      {hover && !renaming && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2 }}
        >
          <button
            onClick={onStartRename}
            title="重命名"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, padding: '1px 4px', display: 'flex', alignItems: 'center' }}
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={onDelete}
            title="删除"
            style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: 11, padding: '1px 4px', display: 'flex', alignItems: 'center' }}
          >
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyGuide({ onSend, req }: { onSend: (prompt: string) => void; req: Requirement }) {
  const [prompt, setPrompt] = useState('');

  const chips = [
    '生成需求 Spec',
    '生成设计 Spec',
    '查看当前任务进度',
    '分析需求可行性',
    '帮我优化这段代码',
    '总结最近的发布变更',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Center content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 24 }}>
          有什么我能帮你的吗？
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 640 }}>
          {chips.map((text, i) => (
            <button
              key={i}
              onClick={() => onSend(text)}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      {/* Input area */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 16, padding: '12px 16px', boxShadow: 'var(--shadow-sm)' }}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSend(prompt); setPrompt(''); } }}
              placeholder="输入指令... (⌘/Ctrl+Enter 发送)"
              style={{
                width: '100%', border: 'none', background: 'transparent', outline: 'none',
                color: 'var(--text-primary)', fontSize: 14, resize: 'none', minHeight: 48,
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {req.title.slice(0, 30)}{req.title.length > 30 ? '…' : ''}
              </div>
              <button
                onClick={() => { onSend(prompt); setPrompt(''); }}
                disabled={!prompt.trim()}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none',
                  background: !prompt.trim() ? 'var(--bg-disabled)' : 'var(--accent-blue)',
                  color: 'var(--text-inverse)', cursor: !prompt.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkModeTooltip() {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{ color: 'var(--text-tertiary)', cursor: 'default', display: 'flex', alignItems: 'center' }}
      >
        <Info size={12} />
      </span>
      {visible && (
        <div style={{
          position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)',
          background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
          borderRadius: 6, padding: '6px 10px', whiteSpace: 'nowrap',
          fontSize: 11, color: 'var(--text-secondary)', boxShadow: 'var(--shadow-md)',
          zIndex: 200, pointerEvents: 'none',
        }}>
          选择 Agent 本次会话的执行方式
        </div>
      )}
    </div>
  );
}

const OUTPUT_MODE_OPTIONS: { value: OutputMode; label: string; desc: string }[] = [
  { value: 'chat', label: '普通对话', desc: '直接与 Agent 对话' },
  { value: 'spec', label: '生成需求 Spec', desc: '梳理业务目标与功能规格' },
  { value: 'design', label: '生成设计 Spec', desc: '生成技术方案与实现设计' },
  { value: 'tasks', label: '开发执行', desc: '根据任务进行代码实现、调试与验证' },
];

const STAGE_AUTO_MODE: Partial<Record<string, OutputMode>> = {
  backlog: 'spec',
  analyzing: 'design',
  development: 'tasks',
};

export function ChatWorkspace({ req, onClose, panelMode }: { req: Requirement; onClose: () => void; panelMode?: boolean }) {
  const { data: sessions = [], isSuccess: sessionsLoaded } = useSessions(req.id);
  const createSession = useCreateSession();
  const patchSession = usePatchSession();
  const deleteSession = useDeleteSession();
  const { data: avail } = useAgentAvailability();
  const { data: settings } = useSettings();
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [showNewPanel, setShowNewPanel] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newAgent, setNewAgent] = useState('');
  const [newOutputMode, setNewOutputMode] = useState<OutputMode>('chat');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [rightPanel, setRightPanel] = useState<'spec' | 'design' | 'tasks' | 'analysis' | null>(null);
  const [sessionInitialMode, setSessionInitialMode] = useState<OutputMode | undefined>(undefined);
  const didInit = useRef(false);

  const availableAgents = Object.entries(avail?.agents ?? {})
    .filter(([, v]) => v.present)
    .map(([k]) => k);

  const [autoPrompt, setAutoPrompt] = useState<string | null>(null);

  const resolveAgent = (overrideAgent?: string) => {
    const settingsAgent = settings?.defaultAgent;
    const fallbackAgent = avail?.defaultAgent && availableAgents.includes(avail.defaultAgent)
      ? avail.defaultAgent
      : availableAgents.includes('claude-code')
        ? 'claude-code'
        : availableAgents.includes('claude-api')
          ? 'claude-api'
          : availableAgents[0] ?? 'claude-code';
    const defaultAgent = (settingsAgent && availableAgents.includes(settingsAgent)) ? settingsAgent : fallbackAgent;
    return overrideAgent || newAgent || defaultAgent;
  };

  useEffect(() => {
    if (!sessionsLoaded || didInit.current) return;
    didInit.current = true;

    if (sessions.length > 0) {
      setActiveSession(sessions[0]);
      return;
    }

    const autoMode = STAGE_AUTO_MODE[req.stage];
    if (!autoMode) return;

    const agent = resolveAgent();
    const title = `${req.id} ${req.title}`;
    createSession.mutate(
      { reqId: req.id, title, agent },
      {
        onSuccess: (s) => {
          setActiveSession(s);
          setSessionInitialMode(autoMode);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsLoaded]);

  const handleCreate = () => {
    const agent = resolveAgent();
    const outputMode = newOutputMode;
    createSession.mutate(
      { reqId: req.id, title: newTitle || `Session ${sessions.length + 1}`, agent },
      {
        onSuccess: (s) => {
          setActiveSession(s);
          setNewTitle('');
          setNewAgent('');
          setNewOutputMode('chat');
          setShowNewPanel(false);
          setSessionInitialMode(outputMode !== 'chat' ? outputMode : undefined);
        },
      }
    );
  };

  const handleEmptySend = (prompt: string) => {
    if (!prompt.trim()) return;
    const agent = resolveAgent();
    createSession.mutate(
      { reqId: req.id, title: newTitle || `Session ${sessions.length + 1}`, agent },
      { onSuccess: (s) => { setActiveSession(s); setNewTitle(''); setNewAgent(''); setShowNewPanel(false); setAutoPrompt(prompt.trim()); } }
    );
  };

  const panelTitle = rightPanel === 'spec' ? '需求 Spec' : rightPanel === 'design' ? '设计 Spec' : rightPanel === 'tasks' ? '任务进度' : rightPanel === 'analysis' ? '分析方案' : '';

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)', position: 'relative' }}>
      {/* Sidebar: sessions list — hidden in panelMode */}
      {!panelMode && (
        <div style={{ width: 220, borderRight: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 }}>
                {req.title.slice(0, 20)}{req.title.length > 20 ? '…' : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sessions</div>
            </div>
            <button
              onClick={() => {
                setNewTitle(`${req.id} ${req.title}`);
                setShowNewPanel(true);
              }}
              title="新建会话"
              style={{
                width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border-default)',
                background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Plus size={14} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {sessions.map(s => (
              <SessionItem
                key={s.id}
                session={s}
                active={activeSession?.id === s.id}
                renaming={renamingId === s.id}
                renameValue={renameValue}
                onRenameValueChange={setRenameValue}
                onClick={() => { if (renamingId !== s.id) { setActiveSession(s); } }}
                onStartRename={() => { setRenamingId(s.id); setRenameValue(s.title || s.agent); }}
                onConfirmRename={() => {
                  const title = renameValue.trim();
                  if (title) patchSession.mutate({ id: s.id, reqId: req.id, patch: { title } });
                  setRenamingId(null);
                }}
                onCancelRename={() => setRenamingId(null)}
                onDelete={() => {
                  if (!confirm(`确定删除会话「${s.title || s.agent}」？`)) return;
                  if (activeSession?.id === s.id) setActiveSession(null);
                  deleteSession.mutate({ id: s.id, reqId: req.id });
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Main area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Panel mode compact header */}
        {panelMode && (
          <div style={{
            height: 44, flexShrink: 0,
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8,
          }}>
            <Bot size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>研发助手</span>
            <div style={{ width: 1, height: 12, background: 'var(--border-default)', flexShrink: 0 }} />
            <span style={{
              fontSize: 12, color: 'var(--text-tertiary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {req.title.slice(0, 24)}{req.title.length > 24 ? '…' : ''}
            </span>
            <button
              onClick={onClose}
              style={{
                width: 26, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer',
                background: 'transparent', color: 'var(--text-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {activeSession ? (
          <ChatPanel
            session={activeSession}
            reqId={req.id}
            req={req}
            onClose={() => { setActiveSession(null); setSessionInitialMode(undefined); }}
            onOpenPanel={setRightPanel}
            autoPrompt={autoPrompt ?? undefined}
            onAutoPromptConsumed={() => setAutoPrompt(null)}
            initialMode={sessionInitialMode}
          />
        ) : (
          <EmptyGuide req={req} onSend={handleEmptySend} />
        )}

        {/* New session right-side panel */}
        {showNewPanel && (
          <>
            <div
              onClick={() => setShowNewPanel(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40 }}
            />
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 360,
              background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-lg)', zIndex: 50, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>新建会话</span>
                <button onClick={() => setShowNewPanel(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Title */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>会话名称</label>
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                    placeholder={`Session ${sessions.length + 1}`}
                    style={{
                      width: '100%', padding: '8px 10px', background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-default)', borderRadius: 6,
                      color: 'var(--text-primary)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Agent */}
                {availableAgents.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>Agent</label>
                    <UiSelect
                      value={newAgent}
                      onChange={setNewAgent}
                      options={[
                        { value: '', label: `自动选择 (${avail?.defaultAgent && availableAgents.includes(avail.defaultAgent) ? avail.defaultAgent : availableAgents.includes('claude-code') ? 'claude-code' : availableAgents[0] ?? 'claude-code'})` },
                        ...availableAgents.map(a => ({
                          value: a,
                          label: `${a}${a === 'claude-api' ? ' (流式)' : a === 'claude-code' ? ' (非流式)' : ''}`,
                        })),
                      ]}
                    />
                  </div>
                )}

                {/* Work mode */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>工作模式</label>
                    <WorkModeTooltip />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {OUTPUT_MODE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setNewOutputMode(opt.value)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                          border: `1px solid ${newOutputMode === opt.value ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                          background: newOutputMode === opt.value ? 'var(--accent-blue-10)' : 'var(--bg-tertiary)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${newOutputMode === opt.value ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                          background: newOutputMode === opt.value ? 'var(--accent-blue)' : 'transparent',
                        }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Attachments */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>附件</label>
                  <AttachmentsPanel reqId={req.id} embedded />
                </div>
              </div>
              <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }}>
                <button
                  onClick={handleCreate}
                  disabled={createSession.isPending}
                  style={{
                    width: '100%', padding: '10px', background: 'var(--accent-blue)', border: 'none',
                    borderRadius: 8, color: 'var(--text-inverse)', cursor: createSession.isPending ? 'not-allowed' : 'pointer',
                    fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <Plus size={14} />新建会话
                </button>
              </div>
            </div>
          </>
        )}

        {/* Overlay panel */}
        {rightPanel && (
          <>
            <div
              onClick={() => setRightPanel(null)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40 }}
            />
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 520,
              background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-lg)', zIndex: 50, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{panelTitle}</span>
                <button
                  onClick={() => setRightPanel(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                {rightPanel === 'spec' && <RequirementSpecEditor reqId={req.id} />}
                {rightPanel === 'design' && <DesignSpecEditor reqId={req.id} />}
                {rightPanel === 'tasks' && <SubTaskPanel reqId={req.id} />}
                {rightPanel === 'analysis' && <AnalysisComparePanel reqId={req.id} onChosen={() => setRightPanel('tasks')} />}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
