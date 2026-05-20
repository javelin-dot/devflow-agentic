import { useState, type ReactNode } from 'react';
import { Folder, ChevronRight, ArrowLeft, X, Check, HardDrive, Home } from 'lucide-react';
import { useFsLs } from '../api/hooks';
import {
  FS_ROOTS,
  splitPathSegments,
  pathThroughSegments,
  formatDirEntryName,
  formatPathLabel,
} from '../utils/fsPath';

interface Props {
  onSelect: (path: string) => void;
  onClose: () => void;
}

const panelStyle = {
  width: 560,
  maxHeight: '70vh',
  background: 'var(--bg-secondary)',
  borderRadius: 12,
  border: '1px solid var(--border-default)',
  boxShadow: 'var(--shadow-lg)',
  display: 'flex',
  flexDirection: 'column' as const,
  overflow: 'hidden',
};

export function DirPickerModal({ onSelect, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const { data, isLoading } = useFsLs(currentPath);

  const isRoots = data?.isRoots === true;
  const showDrivesEntry = data?.isWindows === true;
  const segments = data?.path && !isRoots ? splitPathSegments(data.path) : [];

  function navigateTo(path: string) {
    setCurrentPath(path);
  }

  function handleSelect() {
    if (data?.path && !isRoots) onSelect(data.path);
  }

  const selectDisabled = !data?.path || isRoots;

  return (
    <ModalOverlay onClose={onClose}>
      <div style={panelStyle}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-default)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>选择目录</div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>

        <ModalBreadcrumb>
          <NavBtn title="用户主目录" onClick={() => setCurrentPath(null)}>
            <Home size={12} />
            ~
          </NavBtn>
          {showDrivesEntry && (
            <>
              <ChevronRight size={12} color="var(--text-tertiary)" />
              <NavBtn title="所有磁盘分区" onClick={() => navigateTo(FS_ROOTS)} active={isRoots}>
                此电脑
              </NavBtn>
            </>
          )}
          {!isRoots && segments.map((seg, i) => {
            const path = pathThroughSegments(segments, i);
            const isLast = i === segments.length - 1;
            return (
              <span key={path} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <ChevronRight size={12} color="var(--text-tertiary)" />
                <NavBtn onClick={() => navigateTo(path)} active={isLast}>
                  {seg}
                </NavBtn>
              </span>
            );
          })}
        </ModalBreadcrumb>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {data?.parent && (
            <DirRow
              icon={<ArrowLeft size={14} color="var(--text-tertiary)" />}
              label=".."
              muted
              onClick={() => navigateTo(data.parent!)}
            />
          )}

          {isLoading && (
            <div style={{ padding: '12px 10px', color: 'var(--text-tertiary)', fontSize: 13 }}>加载中…</div>
          )}

          {!isLoading && data?.dirs.length === 0 && (
            <ModalEmpty>{isRoots ? '未检测到磁盘' : '此目录下没有子目录'}</ModalEmpty>
          )}

          {data?.dirs.map(dir => (
            <DirRow
              key={dir}
              icon={
                isRoots
                  ? <HardDrive size={15} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
                  : <Folder size={15} color="var(--accent-blue)" style={{ flexShrink: 0 }} />
              }
              label={formatDirEntryName(dir, isRoots)}
              onClick={() => navigateTo(dir)}
            />
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px',
          borderTop: '1px solid var(--border-default)',
          background: 'var(--bg-primary)',
        }}>
          <span style={{
            fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320,
          }}>
            {formatPathLabel(data?.path, isRoots)}
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={onClose} style={{
              padding: '7px 14px', background: 'transparent',
              border: '1px solid var(--border-default)', borderRadius: 6,
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
            }}>
              取消
            </button>
            <button
              type="button"
              onClick={handleSelect}
              disabled={selectDisabled}
              style={{
                padding: '7px 14px',
                background: selectDisabled ? 'var(--border-default)' : 'var(--accent-blue)',
                border: 'none', borderRadius: 6,
                color: '#fff',
                cursor: selectDisabled ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                opacity: selectDisabled ? 0.6 : 1,
              }}
            >
              <Check size={14} /> 选择此目录
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function NavBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: active ? 'var(--text-primary)' : 'var(--accent-blue)',
        fontSize: 12,
        padding: '2px 4px',
        fontWeight: active ? 500 : 400,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      {children}
    </button>
  );
}

function DirRow({
  icon,
  label,
  onClick,
  muted,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        borderRadius: 6,
        fontSize: 13,
        textAlign: 'left',
        color: muted ? 'var(--text-tertiary)' : 'var(--text-primary)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
    >
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}

function ModalOverlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </div>
  );
}

function ModalBreadcrumb({ children }: { children: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      padding: '8px 18px',
      borderBottom: '1px solid var(--border-default)',
      background: 'var(--bg-primary)',
      minHeight: 36,
    }}>
      {children}
    </div>
  );
}

function ModalEmpty({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '12px 10px', color: 'var(--text-tertiary)', fontSize: 13 }}>{children}</div>
  );
}
