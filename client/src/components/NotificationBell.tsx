import { useState, useRef, useEffect } from 'react';
import { useNotifications, useMarkRead, useMarkAllRead } from '../api/hooks';
import { Bell } from 'lucide-react';

export function NotificationBell() {
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: 'transparent', color: 'var(--text-tertiary)', fontSize: 16, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14,
            borderRadius: 7, background: 'var(--accent-red)', color: 'var(--text-inverse)', fontSize: 9,
            fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', boxSizing: 'border-box',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 38, right: 0, width: 320, maxHeight: 400,
          background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 200, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>通知</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                style={{
                  fontSize: 11, color: 'var(--accent-blue)', background: 'transparent',
                  border: 'none', cursor: 'pointer',
                }}
              >
                全部已读
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                暂无通知
              </div>
            )}
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => {
                  if (!n.readAt) markRead.mutate(n.id);
                }}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--bg-tertiary)',
                  cursor: 'pointer', background: n.readAt ? 'transparent' : 'var(--bg-secondary)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!n.readAt && (
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-blue)', flexShrink: 0,
                    }} />
                  )}
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{n.type}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    {new Date(n.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                  {n.payload && typeof n.payload === 'object' ? (
                    Object.entries(n.payload).slice(0, 3).map(([k, v]) => (
                      <div key={k}><span style={{ color: 'var(--text-tertiary)' }}>{k}:</span> {String(v).slice(0, 60)}</div>
                    ))
                  ) : String(n.payload)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
