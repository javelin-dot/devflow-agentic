import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  style?: React.CSSProperties;
}

export function UiSelect({ value, onChange, options, placeholder = '请选择', disabled, error, style }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  const close = useCallback(() => {
    setOpen(false);
    setHighlighted(-1);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, close]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && highlighted >= 0) {
        onChange(options[highlighted].value);
        close();
      } else {
        setOpen((v) => !v);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setHighlighted(0);
      } else {
        setHighlighted((i) => Math.min(i + 1, options.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          padding: '8px 28px 8px 10px',
          background: disabled ? 'var(--bg-disabled)' : 'var(--bg-tertiary)',
          border: `1px solid ${error ? 'var(--accent-red)' : 'var(--border-default)'}`,
          borderRadius: 'var(--radius-md)',
          color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
          fontSize: 14,
          outline: 'none',
          height: 36,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: open ? 'var(--focus-ring)' : 'none',
          borderColor: open && !error ? 'var(--border-focus)' : undefined,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedLabel}
        </span>
        <ChevronDown
          size={14}
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            transition: 'transform 0.15s',
            color: 'var(--text-tertiary)',
            pointerEvents: 'none',
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            maxHeight: 240,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlighted;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlighted(idx)}
                onClick={() => {
                  onChange(opt.value);
                  close();
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: 14,
                  cursor: 'pointer',
                  background: isSelected
                    ? 'var(--accent-blue-10)'
                    : isHighlighted
                      ? 'var(--bg-hover)'
                      : 'transparent',
                  color: isSelected ? 'var(--accent-blue)' : 'var(--text-primary)',
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {opt.label}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: 'var(--accent-red)', marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
