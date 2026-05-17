import { SHORTCUTS } from '../hooks/useKeyboardShortcuts';

const VIEW_LABELS: Record<string, string> = {
  board: '看板',
  workspace: '工作区',
  activity: '动态',
  projects: '项目',
  logs: '日志',
  testing: '测试',
  release: '发布',
  dashboard: '仪表板',
  help: '帮助',
};

interface Props {
  onClose: () => void;
}

export function ShortcutsHelpPanel({ onClose }: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 10,
          padding: '24px 32px',
          minWidth: 320,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          border: '1px solid var(--bg-tertiary)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>
          键盘快捷键
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {Object.entries(SHORTCUTS).map(([key, view]) => (
              <tr key={key}>
                <td style={{ padding: '6px 0' }}>
                  <kbd style={{
                    display: 'inline-block',
                    padding: '2px 10px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4,
                    fontSize: 13,
                    color: 'var(--accent-blue)',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    minWidth: 28,
                    textAlign: 'center',
                  }}>
                    {key === '?' ? '?' : key.toUpperCase()}
                  </kbd>
                </td>
                <td style={{ padding: '6px 0 6px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {VIEW_LABELS[view] ?? view}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          onClick={onClose}
          style={{
            marginTop: 20,
            width: '100%',
            padding: '8px',
            background: 'transparent',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          关闭 (Esc)
        </button>
      </div>
    </div>
  );
}
