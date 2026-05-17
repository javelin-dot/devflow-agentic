interface Props extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export function UiTextarea({ error, style, ...rest }: Props) {
  return (
    <div>
      <textarea
        {...rest}
        style={{
          width: '100%',
          minHeight: 80,
          padding: '8px 10px',
          background: 'var(--bg-tertiary)',
          border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          fontSize: 14,
          outline: 'none',
          resize: 'vertical',
          lineHeight: 1.5,
          fontFamily: 'inherit',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          ...style,
        }}
        onFocus={(e) => {
          (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--border-focus)';
          (e.currentTarget as HTMLTextAreaElement).style.boxShadow = 'var(--focus-ring)';
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          (e.currentTarget as HTMLTextAreaElement).style.borderColor = error ? 'var(--accent-red)' : 'var(--border-default)';
          (e.currentTarget as HTMLTextAreaElement).style.boxShadow = 'none';
          rest.onBlur?.(e);
        }}
      />
      {error && (
        <div style={{ fontSize: 12, color: 'var(--accent-red)', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
