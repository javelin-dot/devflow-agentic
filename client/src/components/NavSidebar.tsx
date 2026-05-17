import type { View } from '../App';
import {
  Kanban,
  ClipboardList,
  Rocket,
  FileText,
  FlaskConical,
  AlertTriangle,
  LayoutDashboard,
  Settings,
  Zap,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';

const ICON_SIZE = 18;

const NAV_ITEMS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: 'board', label: '看板', icon: <Kanban size={ICON_SIZE} /> },
  { key: 'req_detail', label: '需求详情', icon: <ClipboardList size={ICON_SIZE} /> },
  { key: 'testing', label: '测试', icon: <FlaskConical size={ICON_SIZE} /> },
  { key: 'defects', label: '缺陷', icon: <AlertTriangle size={ICON_SIZE} /> },
  { key: 'release', label: '发布', icon: <Rocket size={ICON_SIZE} /> },
  { key: 'logs', label: '日志', icon: <FileText size={ICON_SIZE} /> },
  { key: 'dashboard', label: '仪表', icon: <LayoutDashboard size={ICON_SIZE} /> },
];

export function NavSidebar({ view, onViewChange }: { view: View; onViewChange: (v: string) => void }) {
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
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px var(--accent-blue-22)',
          marginBottom: 20,
        }}
      >
        <Zap size={20} color="#fff" strokeWidth={2.5} />
      </div>

      {/* Main nav */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
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
                color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
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
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <button
          title="设置"
          onClick={() => onViewChange('settings')}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            background: view === 'settings' ? 'var(--bg-hover)' : 'transparent',
            color: view === 'settings' ? 'var(--accent-blue)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            if (view !== 'settings') (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            if (view !== 'settings') (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          <Settings size={ICON_SIZE} />
        </button>
        <NotificationBell />
      </div>
    </nav>
  );
}
