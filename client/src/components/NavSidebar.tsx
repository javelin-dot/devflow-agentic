import { useLocation, useNavigate } from 'react-router-dom';
import {
  Kanban,
  Rocket,
  FileText,
  FlaskConical,
  AlertTriangle,
  LayoutDashboard,
  Settings,
  Bot,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';

const ICON_SIZE = 18;

const NAV_ITEMS: { path: string; label: string; icon: React.ReactNode }[] = [
  { path: '/board', label: '需求', icon: <Kanban size={ICON_SIZE} /> },
  { path: '/testing', label: '测试', icon: <FlaskConical size={ICON_SIZE} /> },
  { path: '/defects', label: '缺陷', icon: <AlertTriangle size={ICON_SIZE} /> },
  { path: '/release', label: '发布', icon: <Rocket size={ICON_SIZE} /> },
  { path: '/logs', label: '日志', icon: <FileText size={ICON_SIZE} /> },
  { path: '/dashboard', label: '仪表', icon: <LayoutDashboard size={ICON_SIZE} /> },
];

export function NavSidebar({ aiPanelOpen, onToggleAiPanel }: { aiPanelOpen?: boolean; onToggleAiPanel?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      style={{
        width: 56,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 0 12px',
        flexShrink: 0,
        position: 'relative',
        zIndex: 100,
        overflow: 'visible',
      }}
    >
      {/* Logo */}
      <img
        src="/logo.png"
        alt="DevFlow"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          marginBottom: 20,
          objectFit: 'cover',
        }}
      />

      {/* Main nav */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              title={item.label}
              onClick={() => navigate(item.path)}
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontSize: 18,
                background: isActive ? 'rgba(0,168,168,0.1)' : 'transparent',
                color: isActive ? 'var(--accent-blue)' : 'var(--text-tertiary)',
                marginBottom: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
                }
              }}
            >
              {item.icon}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <button
          title="研发助手"
          onClick={onToggleAiPanel}
          style={{
            width: 38, height: 38, borderRadius: 9, border: 'none', cursor: 'pointer',
            background: aiPanelOpen ? 'rgba(0,168,168,0.1)' : 'transparent',
            color: aiPanelOpen ? 'var(--accent-blue)' : 'var(--text-tertiary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { if (!aiPanelOpen) { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; } }}
          onMouseLeave={(e) => { if (!aiPanelOpen) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; } }}
        >
          <Bot size={18} />
        </button>
        <button
          title="设置"
          onClick={() => navigate('/settings')}
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            border: 'none',
            cursor: 'pointer',
            background: location.pathname === '/settings' ? 'rgba(0,168,168,0.1)' : 'transparent',
            color: location.pathname === '/settings' ? 'var(--accent-blue)' : 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            if (location.pathname !== '/settings') {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            }
          }}
          onMouseLeave={(e) => {
            if (location.pathname !== '/settings') {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
            }
          }}
        >
          <Settings size={ICON_SIZE} />
        </button>
        <NotificationBell />
      </div>
    </nav>
  );
}
