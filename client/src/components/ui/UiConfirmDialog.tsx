import { UiButton } from './UiButton';

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function UiConfirmDialog({
  open,
  title = '确认操作',
  description,
  confirmText = '确认',
  cancelText = '取消',
  danger,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-xl)',
          width: 360,
          maxWidth: '90vw',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: description ? 8 : 20,
          }}
        >
          {title}
        </div>
        {description && (
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 20,
              lineHeight: 1.5,
            }}
          >
            {description}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <UiButton variant="ghost" size="md" onClick={onCancel}>
            {cancelText}
          </UiButton>
          <UiButton
            variant={danger ? 'danger' : 'primary'}
            size="md"
            onClick={onConfirm}
          >
            {confirmText}
          </UiButton>
        </div>
      </div>
    </div>
  );
}
