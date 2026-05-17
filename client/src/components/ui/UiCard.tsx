interface Props {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  padding?: 'none' | 'default';
  hoverable?: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function UiCard({
  children,
  header,
  footer,
  padding = 'default',
  hoverable,
  style,
  onClick,
}: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        transition: 'border-color 0.15s, opacity 0.15s',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      onMouseEnter={
        hoverable
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-focus)';
            }
          : undefined
      }
      onMouseLeave={
        hoverable
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-default)';
            }
          : undefined
      }
    >
      {header && (
        <div
          style={{
            padding: padding === 'default' ? '10px 12px' : 0,
            borderBottom: '1px solid var(--border-default)',
            fontWeight: 600,
            fontSize: 13,
            color: 'var(--text-primary)',
          }}
        >
          {header}
        </div>
      )}
      <div style={{ padding: padding === 'default' ? '10px 12px' : 0 }}>{children}</div>
      {footer && (
        <div
          style={{
            padding: padding === 'default' ? '10px 12px' : 0,
            borderTop: '1px solid var(--border-default)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
