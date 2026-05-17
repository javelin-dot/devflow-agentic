interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'suffix'> {
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export function UiInput({ error, prefix, suffix, style, ...rest }: Props) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 10px',
          background: 'var(--bg-tertiary)',
          border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          height: 36,
        }}
      >
        {prefix}
        <input
          {...rest}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: 14,
            outline: 'none',
            minWidth: 0,
            ...style,
          }}
          onFocus={(e) => {
            (e.currentTarget.parentElement as HTMLDivElement).style.borderColor = 'var(--border-focus)';
            (e.currentTarget.parentElement as HTMLDivElement).style.boxShadow = 'var(--focus-ring)';
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            (e.currentTarget.parentElement as HTMLDivElement).style.borderColor = error ? 'var(--accent-red)' : 'var(--border-default)';
            (e.currentTarget.parentElement as HTMLDivElement).style.boxShadow = 'none';
            rest.onBlur?.(e);
          }}
        />
        {suffix}
      </div>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--accent-red)', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
