import { X } from 'lucide-react';
import { UiButton, type ButtonVariant } from './UiButton';

export interface ActionDialogAction {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
}

interface Props {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  actions: ActionDialogAction[];
}

/** Modal dialog that only closes via the header button or explicit actions (not backdrop click). */
export function UiActionDialog({ open, title, description, onClose, actions }: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        style={{
          position: 'relative',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-xl)',
          width: 400,
          maxWidth: '90vw',
          boxShadow: 'var(--shadow-lg)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            border: 'none',
            borderRadius: 6,
            background: 'transparent',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
          }}
        >
          <X size={16} />
        </button>

        <div
          id="action-dialog-title"
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary)',
            paddingRight: 28,
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
              lineHeight: 1.55,
            }}
          >
            {description}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actions.map((action) => (
            <UiButton
              key={action.label}
              variant={action.variant ?? 'secondary'}
              size="md"
              onClick={action.onClick}
              style={{ width: '100%' }}
            >
              {action.label}
            </UiButton>
          ))}
        </div>
      </div>
    </div>
  );
}
