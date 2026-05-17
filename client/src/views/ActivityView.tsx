import { useEvents } from '../api/hooks';
import { RefreshCw, Bot, CheckCircle, XCircle, StickyNote, Circle } from 'lucide-react';

const EVENT_ICONS: Record<string, React.ReactNode> = {
  stage_change: <RefreshCw size={16} />,
  agent_run: <Bot size={16} />,
  subtask_done: <CheckCircle size={16} />,
  subtask_error: <XCircle size={16} />,
  manual_log: <StickyNote size={16} />,
  default: <Circle size={16} />,
};

interface EventItem {
  id: string;
  type: string;
  actor: string;
  reqId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export function ActivityView({ reqId, showFilter = true }: { reqId?: string; showFilter?: boolean }) {
  const { data: events = [], isLoading } = useEvents(reqId);

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>活动记录</h1>
        {reqId && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', padding: '2px 10px', borderRadius: 4, border: '1px solid var(--border-default)' }}>
            过滤: {reqId.slice(0, 8)}...
          </span>
        )}
      </div>

      {isLoading && <div style={{ color: 'var(--text-tertiary)' }}>Loading...</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(events as EventItem[]).map((e) => (
          <div key={e.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '10px 14px', display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 16, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>{EVENT_ICONS[e.type] ?? EVENT_ICONS.default}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-blue)' }}>{e.type}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{e.actor}</span>
                {e.reqId && <span style={{ fontSize: 10, color: 'var(--border-default)', fontFamily: 'monospace' }}>{e.reqId}</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {new Date(e.createdAt).toLocaleString('zh-CN')}
              </div>
              {Object.keys(e.payload ?? {}).length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer' }}>payload</summary>
                  <pre style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, whiteSpace: 'pre-wrap', background: 'var(--bg-primary)', padding: 6, borderRadius: 3 }}>
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
        {!isLoading && (events as EventItem[]).length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 48 }}>暂无活动</div>
        )}
      </div>
    </div>
  );
}
