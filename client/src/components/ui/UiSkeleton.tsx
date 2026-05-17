interface Props {
  variant?: 'text' | 'rect' | 'circle';
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
}

export function UiSkeleton({ variant = 'rect', width = '100%', height, style }: Props) {
  const computedHeight =
    height ?? (variant === 'text' ? 16 : variant === 'circle' ? width : 80);

  return (
    <div
      style={{
        width,
        height: computedHeight,
        borderRadius: variant === 'circle' ? '50%' : 'var(--radius-sm)',
        background: 'linear-gradient(90deg, var(--bg-tertiary) 25%, var(--bg-hover) 50%, var(--bg-tertiary) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.5s infinite',
        ...style,
      }}
    />
  );
}
