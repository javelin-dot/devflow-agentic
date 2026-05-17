import { useState, useEffect, useRef } from 'react';
import { Check, X, Pencil, Plus } from 'lucide-react';
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
  sessionId: string;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onDelete?: () => void;
}

function EntryRow({ msg, sessionId, selectMode, selected, onSelect, onDelete }: EntryRowProps) {
  const isUser = msg.role === 'user';
  const isToolUse = msg.entryType === 'tool_use';
  const isThinking = msg.entryType === 'thinking';
  const isPlan = msg.entryType === 'plan';
  const isTodo = msg.entryType === 'todo_update';
  const [hover, setHover] = useState(false);

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
        padding: '8px 12px',
        marginBottom: 4,
        borderRadius: 6,
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
          <button
            onClick={onDelete}
            title="删除"
            style={{
              marginLeft: 'auto', fontSize: 10, color: 'var(--accent-red)', background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '2px 4px',
            }}
          >
            删除
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: isToolUse ? 'monospace' : 'inherit' }}>
        {renderContent()}
      </div>
      {msg.status === 'pending' && isToolUse && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => apiFetch(`/agent/permission/${sessionId}/${msg.id}/approve`, { method: 'POST' })}
            style={{ padding: '4px 12px', background: 'var(--diff-add-bg)', border: '1px solid var(--accent-green-44)', borderRadius: 4, color: 'var(--accent-green)', cursor: 'pointer', fontSize: 12 }}
          >
            Approve
          </button>
          <button
            onClick={() => apiFetch(`/agent/permission/${sessionId}/${msg.id}/reject`, { method: 'POST' })}
            style={{ padding: '4px 12px', background: 'var(--diff-del-bg)', border: '1px solid var(--accent-red-44)', borderRadius: 4, color: 'var(--accent-red)', cursor: 'pointer', fontSize: 12 }}
          >
            Reject
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

function ChatPanel({ session, reqId, onClose }: { session: ChatSession; reqId: string; onClose: () => void }) {
  const { data: messages = [], refetch } = useMessages(session.id);
  const { data: attachmentsData } = useAttachmentsV2(reqId);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [liveEntries, setLiveEntries] = useState<ChatMessage[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const deleteMsg = useDeleteMessage();
  const deleteMsgs = useDeleteMessages();

  const attachmentFiles = attachmentsData?.filter((f: { filename: string }) => isTextFile(f.filename)) ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveEntries]);

  const allMsgs = [...messages, ...liveEntries];
  const persistedIds = new Set(messages.map(m => m.id));

  // Group messages: each id maps to the array of all ids in its conversation turn.
  // A turn starts with a user or main agent message; tool/thinking/plan/todo entries are children.
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
        // Select/deselect the whole group together
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
    if (!confirm('确定删除这条消息？')) return;
    deleteMsg.mutate({ sessionId: session.id, messageId: id });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条消息？`)) return;
    deleteMsgs.mutate(
      { sessionId: session.id, ids: Array.from(selectedIds) },
      { onSuccess: () => { setSelectMode(false); setSelectedIds(new Set()); } }
    );
  };

  const toggleFile = (name: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const sendMessage = async () => {
    if (!prompt.trim() || running) return;
    let fullPrompt = prompt.trim();
    setPrompt('');
    setRunning(true);
    setLiveEntries([]);

    // Fetch selected attachment contents and prepend to prompt
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

    try {
      const resp = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Actor': 'user' },
        body: JSON.stringify({ sessionId: session.id, agent: session.agent, prompt: fullPrompt }),
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
                  // Append to existing entry (streaming delta)
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
    } finally {
      setRunning(false);
      setLiveEntries([]);
      refetch();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', flex: 1, fontSize: 14 }}>{session.title || session.agent}</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{session.agent}</span>
        {selectMode ? (
          <>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0 || deleteMsgs.isPending}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid var(--accent-red-44)',
                background: 'var(--diff-del-bg)', color: 'var(--accent-red)', cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              删除选中 ({selectedIds.size})
            </button>
            <button
              onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-default)',
                background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              取消
            </button>
          </>
        ) : (
          <button
            onClick={() => setSelectMode(true)}
            style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-default)',
              background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            选择
          </button>
        )}
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center' }}><X size={18} /></button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {allMsgs.map(m => {
          const groupIds = msgGroupMap.get(m.id) ?? [m.id];
          const isGroupParent = groupIds[0] === m.id && groupIds.length > 1;
          // Parent checkbox: checked only when all group members are selected
          const isSelected = isGroupParent
            ? groupIds.every(gid => selectedIds.has(gid))
            : selectedIds.has(m.id);
          return (
            <EntryRow
              key={m.id}
              msg={m}
              sessionId={session.id}
              selectMode={selectMode}
              selected={isSelected}
              onSelect={() => toggleSelect(m.id)}
              onDelete={persistedIds.has(m.id) ? () => handleDeleteSingle(m.id) : undefined}
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

      {/* Input */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-default)', flexShrink: 0 }}>
        {attachmentFiles.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="输入指令... (Enter 发送, Shift+Enter 换行)"
            disabled={running}
            style={{
              flex: 1, padding: '8px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
              borderRadius: 4, color: 'var(--text-primary)', fontSize: 13, resize: 'none', minHeight: 60,
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={running || !prompt.trim()}
            style={{
              padding: '8px 16px', background: running ? 'var(--bg-disabled)' : 'var(--accent-blue)',
              border: 'none', borderRadius: 4, color: 'var(--text-inverse)', cursor: running ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, alignSelf: 'flex-end',
            }}
          >
            {running ? '运行中' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}

type WorkspaceTab = 'sessions' | 'spec' | 'design' | 'analysis' | 'tasks';

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
        padding: '8px 10px', borderRadius: 4, cursor: 'pointer', marginBottom: 2,
        background: active ? 'var(--border-default)' : 'transparent',
        border: active ? '1px solid var(--accent-blue)' : '1px solid transparent',
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

export function ChatWorkspace({ req, onClose }: { req: Requirement; onClose: () => void }) {
  const { data: sessions = [] } = useSessions(req.id);
  const createSession = useCreateSession();
  const patchSession = usePatchSession();
  const deleteSession = useDeleteSession();
  const { data: avail } = useAgentAvailability();
  const { data: settings } = useSettings();
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [tab, setTab] = useState<WorkspaceTab>(() => {
    if (req.stage === 'analyzing') return 'analysis';
    if (req.stage === 'development' || req.stage === 'uat' || req.stage === 'prerelease' || req.stage === 'released') return 'tasks';
    return 'sessions';
  });

  const availableAgents = Object.entries(avail?.agents ?? {})
    .filter(([, v]) => v.present)
    .map(([k]) => k);

  const [newAgent, setNewAgent] = useState('');

  const handleCreate = () => {
    // Only use settings.defaultAgent if it's actually available; otherwise prefer claude-api
    const settingsAgent = settings?.defaultAgent;
    const fallbackAgent = availableAgents.includes('claude-api') ? 'claude-api' : availableAgents[0] ?? 'claude-code';
    const defaultAgent = (settingsAgent && availableAgents.includes(settingsAgent))
      ? settingsAgent
      : fallbackAgent;
    const agent = newAgent || defaultAgent;
    createSession.mutate(
      { reqId: req.id, title: newTitle || `Session ${sessions.length + 1}`, agent },
      { onSuccess: (s) => { setActiveSession(s); setNewTitle(''); setNewAgent(''); } }
    );
  };

  void onClose;

  const showAnalysisTab = req.stage === 'analyzing' || req.stage === 'backlog';
  const showTasksTab = req.stage === 'development' || req.stage === 'uat' || req.stage === 'prerelease' || req.stage === 'released' || req.stage === 'analyzing';

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: active ? 700 : 400,
    color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
    background: 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent-blue)' : '2px solid transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Sidebar: sessions list */}
      <div style={{ width: 220, borderRight: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-default)' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
            {req.title.slice(0, 20)}{req.title.length > 20 ? '…' : ''}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sessions</div>
        </div>

        <AttachmentsPanel reqId={req.id} />

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {sessions.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              active={activeSession?.id === s.id && tab === 'sessions'}
              renaming={renamingId === s.id}
              renameValue={renameValue}
              onRenameValueChange={setRenameValue}
              onClick={() => { if (renamingId !== s.id) { setActiveSession(s); setTab('sessions'); } }}
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

        {/* New session */}
        <div style={{ padding: 8, borderTop: '1px solid var(--border-default)' }}>
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="新建会话..."
            style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, marginBottom: 6, boxSizing: 'border-box' }}
          />
          {availableAgents.length > 0 && (
            <UiSelect
              value={newAgent}
              onChange={setNewAgent}
              options={[
                { value: '', label: `自动选择 (${availableAgents.includes('claude-api') ? 'claude-api' : availableAgents[0]})` },
                ...availableAgents.map(a => ({
                  value: a,
                  label: `${a} ${a === 'claude-api' ? '(流式)' : a === 'claude-code' ? '(非流式)' : ''}`,
                })),
              ]}
              style={{ marginBottom: 6 }}
            />
          )}
          <button
            onClick={handleCreate}
            style={{ width: '100%', padding: '6px', background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            <Plus size={12} style={{ display: 'inline', marginRight: 2 }} />新建会话
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', flexShrink: 0, paddingLeft: 8 }}>
          <button style={tabStyle(tab === 'sessions')} onClick={() => setTab('sessions')}>会话</button>
          <button style={tabStyle(tab === 'spec')} onClick={() => setTab('spec')}>需求 Spec</button>
          <button style={tabStyle(tab === 'design')} onClick={() => setTab('design')}>设计 Spec</button>
          {showAnalysisTab && (
            <button style={tabStyle(tab === 'analysis')} onClick={() => setTab('analysis')}>分析方案</button>
          )}
          {showTasksTab && (
            <button style={tabStyle(tab === 'tasks')} onClick={() => setTab('tasks')}>任务进度</button>
          )}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {tab === 'sessions' && (
            activeSession ? (
              <ChatPanel session={activeSession} reqId={req.id} onClose={() => setActiveSession(null)} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
                选择或创建会话开始对话
              </div>
            )
          )}
          {tab === 'spec' && (
            <RequirementSpecEditor reqId={req.id} />
          )}
          {tab === 'design' && (
            <DesignSpecEditor reqId={req.id} />
          )}
          {tab === 'analysis' && (
            <AnalysisComparePanel reqId={req.id} onChosen={() => setTab('tasks')} />
          )}
          {tab === 'tasks' && (
            <SubTaskPanel reqId={req.id} />
          )}
        </div>
      </div>
    </div>
  );
}
