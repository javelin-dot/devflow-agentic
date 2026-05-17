import type { View } from '../App';
import {
  Kanban,
  FolderOpen,
  Rocket,
  FileText,
  FlaskConical,
  AlertTriangle,
  LayoutDashboard,
  Settings,
  Zap,
  Sun,
  Moon,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useTheme } from '../hooks/useTheme';

const ICON_SIZE = 18;

const NAV_ITEMS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: 'board', label: '看板', icon: <Kanban size={ICON_SIZE} /> },
  { key: 'projects', label: '项目', icon: <FolderOpen size={ICON_SIZE} /> },
  { key: 'testing', label: '测试', icon: <FlaskConical size={ICON_SIZE} /> },
  { key: 'defects', label: '缺陷', icon: <AlertTriangle size={ICON_SIZE} /> },
  { key: 'release', label: '发布', icon: <Rocket size={ICON_SIZE} /> },
  { key: 'logs', label: '日志', icon: <FileText size={ICON_SIZE} /> },
  { key: 'dashboard', label: '仪表', icon: <LayoutDashboard size={ICON_SIZE} /> },
  { key: 'settings', label: '设置', icon: <Settings size={ICON_SIZE} /> },
];

export function NavSidebar({ view, onViewChange }: { view: View; onViewChange: (v: string) => void }) {
  const { effectiveTheme, toggle } = useTheme();
  const isDark = effectiveTheme === 'dark';

  return (
    <nav
      style={{
        width: 56,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ fontSize: 20, marginBottom: 16, color: 'var(--accent-blue)' }}>
        <Zap size={22} />
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = view === item.key;
        return (
          <button
            key={item.key}
            title={item.label}
            onClick={() => onViewChange(item.key)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              background: isActive ? 'var(--bg-hover)' : 'transparent',
              color: isActive ? 'var(--accent-blue)' : 'var(--text-tertiary)',
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {item.icon}
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <button
        title={isDark ? '切换到浅色' : '切换到深色'}
        onClick={toggle}
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          border: 'none',
          cursor: 'pointer',
          background: 'transparent',
          color: 'var(--text-tertiary)',
          marginBottom: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
        }}
      >
        {isDark ? <Sun size={ICON_SIZE} /> : <Moon size={ICON_SIZE} />}
      </button>
      <NotificationBell />
    </nav>
  );
}
