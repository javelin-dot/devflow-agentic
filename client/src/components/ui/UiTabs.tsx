interface Tab {
  key: string;
  label: string;
  disabled?: boolean;
}

interface Props {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  variant?: 'underline' | 'pill';
}

export function UiTabs({ tabs, active, onChange, variant = 'underline' }: Props) {
  const isPill = variant === 'pill';

  return (
    <div
      style={{
        display: 'flex',
        gap: isPill ? 4 : 0,
        borderBottom: isPill ? 'none' : '1px solid var(--border-default)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            disabled={tab.disabled}
            onClick={() => onChange(tab.key)}
            style={{
              padding: isPill ? '4px 12px' : '8px 14px',
              background: isPill && isActive ? 'var(--accent-blue)' : 'transparent',
              color: tab.disabled
                ? 'var(--text-tertiary)'
                : isActive
                  ? isPill
                    ? 'var(--text-inverse)'
                    : 'var(--text-primary)'
                  : 'var(--text-tertiary)',
              border: 'none',
              borderBottom: isPill ? 'none' : isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
              borderRadius: isPill ? 'var(--radius-md)' : 0,
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              opacity: tab.disabled ? 0.5 : 1,
              transition: 'all 0.15s',
              outline: 'none',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
