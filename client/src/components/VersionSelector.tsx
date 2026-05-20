import { useState, useRef, useEffect } from 'react';
import { Cloud, History } from 'lucide-react';
import type { DocumentVersion } from '@devflow/shared';

interface VersionSelectorProps {
  versions: DocumentVersion[];
  current: number;
  latest: number;
  onSelect: (v: number | null) => void;
}

export function VersionSelector({ versions, current, latest, onSelect }: VersionSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const isLatest = current === latest;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-default)',
          background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
          cursor: 'pointer', fontSize: 11,
        }}
      >
        {isLatest ? <Cloud size={11} /> : <History size={11} />}
        {isLatest ? '已加载最新版本' : `v${current}`}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
          background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
          borderRadius: 8, boxShadow: 'var(--shadow-md)', minWidth: 220, maxHeight: 320, overflowY: 'auto',
        }}>
          <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border-default)' }}>
            版本历史
          </div>
          <div
            onClick={() => { onSelect(null); setOpen(false); }}
            style={{
              padding: '8px 12px', cursor: 'pointer',
              background: isLatest ? 'var(--accent-blue-10)' : 'transparent',
              borderBottom: '1px solid var(--bg-tertiary)',
            }}
          >
            <div style={{ fontSize: 12, color: isLatest ? 'var(--accent-blue)' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Cloud size={11} /> 最新版本
            </div>
          </div>
          {versions.map((v) => (
            <div
              key={v.id}
              onClick={() => { onSelect(v.version); setOpen(false); }}
              style={{
                padding: '8px 12px', cursor: 'pointer',
                background: !isLatest && current === v.version ? 'var(--accent-blue-10)' : 'transparent',
                borderBottom: '1px solid var(--bg-tertiary)',
              }}
            >
              <div style={{ fontSize: 12, color: !isLatest && current === v.version ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                v{v.version}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {new Date(v.createdAt).toLocaleString('zh-CN')}
              </div>
              {v.summary && (
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v.summary}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
