import { FileQuestion } from 'lucide-react';

interface Props {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export function UiEmptyState({
  title = '暂无数据',
  description,
  action,
  icon,
}: Props) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-2xl)',
        gap: 'var(--space-md)',
        color: 'var(--text-tertiary)',
        textAlign: 'center',
      }}
    >
      {icon ?? <FileQuestion size={40} strokeWidth={1.2} />}
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 320 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}
