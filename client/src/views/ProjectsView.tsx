import { useState } from 'react';
import { useProjects, useScanProjects, usePatchProject } from '../api/hooks';
import { UiSelect } from '../components/ui';
import type { Project } from '@devflow/shared';

export function ProjectsView() {
  const { data: projects = [], isLoading } = useProjects();
  const scanMut = useScanProjects();
  const patchMut = usePatchProject();
  const [scanRoot, setScanRoot] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  if (isLoading) return <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>Loading...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>项目管理</h1>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>{projects.length} 个项目</span>
      </div>

      {/* Scan */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input
          value={scanRoot}
          onChange={e => setScanRoot(e.target.value)}
          placeholder="/path/to/git/repos"
          style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 13 }}
        />
        <button
          onClick={() => { if (scanRoot) scanMut.mutate({ root: scanRoot }); }}
          disabled={scanMut.isPending || !scanRoot}
          style={{ padding: '8px 16px', background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
        >
          {scanMut.isPending ? '扫描中...' : '扫描目录'}
        </button>
      </div>

      {scanMut.data && (
        <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--scan-success-bg)', borderRadius: 4, color: 'var(--accent-green)', fontSize: 13 }}>
          发现 {scanMut.data.scanned} 个 Git 仓库
        </div>
      )}

      {/* Project list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projects.map((p: Project) => (
          <div key={p.name} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>{p.name}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 12, marginLeft: 8 }}>{p.lang ?? 'unknown'}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11, marginLeft: 8 }}>@{p.branch}</span>
              </div>
              <button
                onClick={() => setEditing(editing === p.name ? null : p.name)}
                style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 4, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
              >
                {editing === p.name ? '收起' : '编辑'}
              </button>
            </div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 4 }}>{p.path}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>分支前缀:</span>
              <input
                key={p.name + '-prefix'}
                defaultValue={p.branchPrefix ?? ''}
                placeholder="feature"
                onBlur={e => patchMut.mutate({ name: p.name, patch: { branchPrefix: e.target.value || null } })}
                style={{ padding: '2px 6px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 11, width: 90 }}
              />
            </div>

            {editing === p.name && (
              <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-primary)', borderRadius: 4 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>默认分支</span>
                    <input
                      defaultValue={p.branch}
                      onBlur={e => patchMut.mutate({ name: p.name, patch: { branch: e.target.value } })}
                      style={{ padding: '4px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 12 }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>合并策略</span>
                    <UiSelect
                      value={p.mergeStrategy}
                      onChange={v => patchMut.mutate({ name: p.name, patch: { mergeStrategy: v as 'merge' | 'squash' | 'rebase' } })}
                      options={[
                        { value: 'merge', label: 'merge' },
                        { value: 'squash', label: 'squash' },
                        { value: 'rebase', label: 'rebase' },
                      ]}
                      style={{ width: 100 }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        ))}
        {projects.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 48, fontSize: 14 }}>
            暂无项目，请先扫描 Git 目录
          </div>
        )}
      </div>
    </div>
  );
}
