import { useState, useRef, useEffect } from 'react';
import { useNotifications, useMarkRead, useMarkAllRead, useDismissNotification } from '../api/hooks';
import { Bell, Check, X } from 'lucide-react';

export function NotificationBell() {
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const dismiss = useDismissNotification();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', zIndex: 20 }}>
      <button
        type="button"
        title="通知"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: 38, height: 38, borderRadius: 9, border: 'none', cursor: 'pointer',
          background: open ? 'rgba(0,168,168,0.1)' : 'transparent',
          color: open ? 'var(--accent-blue)' : 'var(--text-tertiary)',
          fontSize: 16, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
          }
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14,
            borderRadius: 7, background: 'var(--accent-red)', color: 'var(--text-inverse)', fontSize: 9,
            fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', boxSizing: 'border-box', pointerEvents: 'none',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: 320, maxHeight: 400,
          background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 300, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border-default)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>通知</span>
            {unreadCount > 0 && (
              <button
                type="button"
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
                style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--bg-tertiary)',
                  background: n.readAt ? 'transparent' : 'var(--bg-secondary)',
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
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto', flexShrink: 0 }}>
                    {new Date(n.createdAt).toLocaleString('zh-CN')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4, flexShrink: 0 }}>
                    {!n.readAt && (
                      <button
                        type="button"
                        title="标记已读"
                        onClick={(e) => {
                          e.stopPropagation();
                          markRead.mutate(n.id);
                        }}
                        style={{
                          width: 22, height: 22, borderRadius: 4, border: 'none', cursor: 'pointer',
                          background: 'transparent', color: 'var(--accent-blue)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                      >
                        <Check size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      title="关闭"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismiss.mutate(n.id);
                      }}
                      style={{
                        width: 22, height: 22, borderRadius: 4, border: 'none', cursor: 'pointer',
                        background: 'transparent', color: 'var(--text-tertiary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <X size={13} />
                    </button>
                  </div>
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
