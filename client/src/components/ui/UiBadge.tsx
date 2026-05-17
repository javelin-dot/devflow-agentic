export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface Props {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
  style?: React.CSSProperties;
}

const VARIANT_STYLES: Record<BadgeVariant, { color: string; bg: string; border: string }> = {
  default: { color: 'var(--text-secondary)', bg: 'var(--bg-primary)', border: 'var(--border-default)' },
  success: { color: 'var(--accent-green)', bg: 'var(--accent-green-22)', border: 'var(--accent-green-44)' },
  warning: { color: 'var(--accent-orange)', bg: 'var(--accent-orange-22)', border: 'var(--accent-orange-44)' },
  error: { color: 'var(--accent-red)', bg: 'var(--accent-red-22)', border: 'var(--accent-red-44)' },
  info: { color: 'var(--accent-blue)', bg: 'var(--accent-blue-22)', border: 'var(--accent-blue-44)' },
};

export function UiBadge({ variant = 'default', children, dot, style }: Props) {
  const v = VARIANT_STYLES[variant];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 6px',
        borderRadius: 'var(--radius-sm)',
        fontSize: 10,
        fontWeight: 600,
        background: v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: v.color,
            display: 'inline-block',
          }}
        />
      )}
      {children}
    </span>
  );
}
