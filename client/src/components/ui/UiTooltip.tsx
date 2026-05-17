import { useState, useRef, useEffect } from 'react';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface Props {
  content: React.ReactNode;
  children: React.ReactNode;
  placement?: TooltipPlacement;
  delay?: number;
}

export function UiTooltip({ content, children, placement = 'top', delay = 300 }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (visible && triggerRef.current && tooltipRef.current) {
      const tr = triggerRef.current.getBoundingClientRect();
      const tt = tooltipRef.current.getBoundingClientRect();
      let left = 0;
      let top = 0;

      switch (placement) {
        case 'top':
          left = tr.left + tr.width / 2 - tt.width / 2;
          top = tr.top - tt.height - 6;
          break;
        case 'bottom':
          left = tr.left + tr.width / 2 - tt.width / 2;
          top = tr.bottom + 6;
          break;
        case 'left':
          left = tr.left - tt.width - 6;
          top = tr.top + tr.height / 2 - tt.height / 2;
          break;
        case 'right':
          left = tr.right + 6;
          top = tr.top + tr.height / 2 - tt.height / 2;
          break;
      }

      setPos({ left, top });
    }
  }, [visible, placement]);

  const show = () => {
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{ display: 'inline-flex' }}
      >
        {children}
      </span>
      {visible && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            zIndex: 250,
            padding: '6px 10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            boxShadow: 'var(--shadow-sm)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            maxWidth: 300,
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
