import { useState, useMemo } from 'react';
import { useArchivedRequirements, useUnarchiveRequirement, useMe } from '../api/hooks';
import { STAGE_LABELS } from '@devflow/shared';
import type { Requirement, Stage, Priority } from '@devflow/shared';
import { X } from 'lucide-react';
import { UiSelect } from '../components/ui';

const PRIORITY_COLORS: Record<Priority, string> = {
  critical: 'var(--accent-red)',
  high: 'var(--accent-orange)',
  medium: 'var(--accent-blue)',
  low: 'var(--accent-green)',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 3,
      fontSize: 11, fontWeight: 500, background: 'var(--bg-secondary)',
      color: 'var(--text-secondary)', border: '1px solid var(--bg-tertiary)',
    }}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3,
      fontSize: 10, fontWeight: 600,
      background: PRIORITY_COLORS[priority] + '22',
      color: PRIORITY_COLORS[priority],
      border: `1px solid ${PRIORITY_COLORS[priority]}44`,
    }}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function getQuarter(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y} Q${q}`;
}

interface DetailModalProps {
  req: Requirement;
  onClose: () => void;
  isAdmin: boolean;
  onRestore: (req: Requirement) => void;
}

function DetailModal({ req, onClose, isAdmin, onRestore }: DetailModalProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 10, padding: 28,
        width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        border: '1px solid var(--border-default)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 18 }}>需求详情</h3>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18,
          }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>ID:</span> <code style={{ fontSize: 12 }}>{req.id}</code></div>
          <div><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>标题:</span> <span style={{ color: 'var(--text-primary)' }}>{req.title}</span></div>
          <div><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>描述:</span> <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{req.description || '-'}</span></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>阶段:</span> <StageBadge stage={req.stage} /></div>
            <div><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>优先级:</span> <PriorityBadge priority={req.priority} /></div>
          </div>
          <div><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Workspace:</span> <span style={{ color: 'var(--text-secondary)' }}>{req.workspace ?? '-'}</span></div>
          <div><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>Tags:</span> <span style={{ color: 'var(--text-secondary)' }}>{req.tags.join(', ') || '-'}</span></div>
          <div><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>发布日期:</span> <span style={{ color: 'var(--text-secondary)' }}>{req.releasedAt ? new Date(req.releasedAt).toLocaleDateString('zh-CN') : '-'}</span></div>
          <div><span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>归档日期:</span> <span style={{ color: 'var(--text-secondary)' }}>{req.archivedAt ? new Date(req.archivedAt).toLocaleDateString('zh-CN') : '-'}</span></div>
        </div>

        {isAdmin && (
          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button onClick={() => { onRestore(req); onClose(); }} style={{
              padding: '8px 20px', background: 'var(--accent-blue-22)', border: '1px solid var(--accent-blue-44)',
              borderRadius: 4, color: 'var(--accent-blue)', cursor: 'pointer', fontSize: 13,
            }}>
              恢复
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ArchiveView() {
  const [search, setSearch] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [detailReq, setDetailReq] = useState<Requirement | null>(null);

  const { data: reqs, isLoading } = useArchivedRequirements();
  const unarchive = useUnarchiveRequirement();
  const { data: me } = useMe();
  const isAdmin = me?.role === 'admin';

  const filtered = useMemo(() => {
    let list = (reqs ?? []);
    if (search) list = list.filter(r => r.title.toLowerCase().includes(search.toLowerCase()));
    if (workspaceFilter) list = list.filter(r => r.workspace?.toLowerCase().includes(workspaceFilter.toLowerCase()));
    if (priorityFilter) list = list.filter(r => r.priority === priorityFilter);
    if (tagFilter) list = list.filter(r => r.tags.some(t => t.toLowerCase().includes(tagFilter.toLowerCase())));
    return list;
  }, [reqs, search, workspaceFilter, priorityFilter, tagFilter]);

  const byQuarter = useMemo(() => {
    const groups = new Map<string, Requirement[]>();
    for (const req of filtered) {
      const key = req.archivedAt ? getQuarter(req.archivedAt) : '未知';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(req);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  function handleRestore(req: Requirement) {
    unarchive.mutate(req.id);
  }

  return (
    <div style={{ padding: 24, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 20, fontWeight: 600 }}>归档需求</h2>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索标题..."
          style={{
            padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)',
            borderRadius: 4, color: 'var(--text-primary)', fontSize: 13, width: 180, outline: 'none',
          }}
        />
        <input
          value={workspaceFilter}
          onChange={e => setWorkspaceFilter(e.target.value)}
          placeholder="Workspace..."
          style={{
            padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)',
            borderRadius: 4, color: 'var(--text-primary)', fontSize: 13, width: 140, outline: 'none',
          }}
        />
        <UiSelect
          value={priorityFilter}
          onChange={setPriorityFilter}
          options={[
            { value: '', label: '全部优先级' },
            { value: 'critical', label: 'Critical' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
          style={{ width: 140 }}
        />
        <input
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          placeholder="Tag..."
          style={{
            padding: '6px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)',
            borderRadius: 4, color: 'var(--text-primary)', fontSize: 13, width: 120, outline: 'none',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{filtered.length} 条记录</span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', paddingTop: 40 }}>加载中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', paddingTop: 40 }}>暂无归档需求</div>
        ) : (
          byQuarter.map(([quarter, items]) => (
            <div key={quarter} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 14, fontWeight: 600, color: 'var(--text-tertiary)',
                marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border-default)',
              }}>
                {quarter}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(req => (
                  <div
                    key={req.id}
                    onClick={() => setDetailReq(req)}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '12px 16px',
                      background: 'var(--bg-secondary)', borderRadius: 6, gap: 12,
                      border: '1px solid var(--bg-tertiary)', cursor: 'pointer',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, color: 'var(--text-primary)', fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {req.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                        {req.workspace ?? '—'} · {req.tags.join(', ') || '无标签'}
                      </div>
                    </div>
                    <StageBadge stage={req.stage} />
                    <PriorityBadge priority={req.priority} />
                    {isAdmin && (
                      <button
                        onClick={e => { e.stopPropagation(); handleRestore(req); }}
                        style={{
                          padding: '4px 12px', background: 'var(--accent-blue-22)',
                          border: '1px solid var(--accent-blue-44)', borderRadius: 4,
                          color: 'var(--accent-blue)', cursor: 'pointer', fontSize: 12, flexShrink: 0,
                        }}
                      >
                        恢复
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {detailReq && (
        <DetailModal
          req={detailReq}
          onClose={() => setDetailReq(null)}
          isAdmin={isAdmin}
          onRestore={handleRestore}
        />
      )}
    </div>
  );
}
