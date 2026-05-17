import { useState } from 'react';
import { Folder, FolderOpen, ChevronRight, ArrowLeft, X, Check } from 'lucide-react';
import { useFsLs } from '../api/hooks';

interface Props {
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function DirPickerModal({ onSelect, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const { data, isLoading } = useFsLs(currentPath);

  const segments = data?.path.split('/').filter(Boolean) ?? [];

  function navigateTo(path: string) {
    setCurrentPath(path);
  }

  function handleSelect() {
    if (data?.path) onSelect(data.path);
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 560, maxHeight: '70vh',
        background: 'var(--bg-secondary)',
        borderRadius: 12,
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-default)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>选择目录</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
          padding: '8px 18px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-primary)',
          minHeight: 36,
        }}>
          <button
            onClick={() => setCurrentPath(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-blue)', fontSize: 12, padding: '2px 4px' }}
          >
            ~
          </button>
          {segments.map((seg, i) => {
            const path = '/' + segments.slice(0, i + 1).join('/');
            return (
              <span key={path} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <ChevronRight size={12} color="var(--text-tertiary)" />
                <button
                  onClick={() => navigateTo(path)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: i === segments.length - 1 ? 'var(--text-primary)' : 'var(--accent-blue)',
                    fontSize: 12, padding: '2px 4px', fontWeight: i === segments.length - 1 ? 500 : 400,
                  }}
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>

        {/* Directory list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {/* Up arrow */}
          {data?.parent && (
            <button
              onClick={() => navigateTo(data.parent!)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', background: 'none', border: 'none',
                cursor: 'pointer', borderRadius: 6, color: 'var(--text-secondary)',
                fontSize: 13, textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <ArrowLeft size={14} color="var(--text-tertiary)" />
              <span style={{ color: 'var(--text-tertiary)' }}>..</span>
            </button>
          )}

          {isLoading && (
            <div style={{ padding: '12px 10px', color: 'var(--text-tertiary)', fontSize: 13 }}>加载中…</div>
          )}

          {!isLoading && data?.dirs.length === 0 && (
            <div style={{ padding: '12px 10px', color: 'var(--text-tertiary)', fontSize: 13 }}>此目录下没有子目录</div>
          )}

          {data?.dirs.map(dir => {
            const name = dir.split('/').pop() ?? dir;
            return (
              <button
                key={dir}
                onClick={() => navigateTo(dir)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', background: 'none', border: 'none',
                  cursor: 'pointer', borderRadius: 6,
                  fontSize: 13, textAlign: 'left',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; (e.currentTarget.querySelector('.folder-icon') as HTMLElement | null)?.setAttribute('data-open', 'true'); }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <Folder size={15} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px',
          borderTop: '1px solid var(--border-default)',
          background: 'var(--bg-primary)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>
            {data?.path ?? '…'}
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={onClose} style={{
              padding: '7px 14px', background: 'transparent',
              border: '1px solid var(--border-default)', borderRadius: 6,
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
            }}>
              取消
            </button>
            <button onClick={handleSelect} style={{
              padding: '7px 14px', background: 'var(--accent-blue)',
              border: 'none', borderRadius: 6,
              color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Check size={14} /> 选择此目录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
