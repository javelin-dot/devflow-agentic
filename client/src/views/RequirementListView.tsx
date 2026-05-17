import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { STAGE_LABELS } from '@devflow/shared';
import type { Requirement, Stage, Priority } from '@devflow/shared';
import { useRequirements, useArchivedRequirements } from '../api/hooks';

const STAGES: Stage[] = ['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released'];

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: '#EF4444', high: '#F97316', medium: '#3B82F6', low: '#94A3B8',
};
const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};

type StageFilter = 'all' | Stage | 'archived';

const STAGE_FILTER_OPTIONS: { value: StageFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  ...STAGES.map(s => ({ value: s as StageFilter, label: STAGE_LABELS[s] })),
  { value: 'archived', label: '已归档' },
];

interface Props {
  onSelectReq: (req: Requirement) => void;
}

export function RequirementListView({ onSelectReq }: Props) {
  const { data: active = [], isLoading: loadingActive } = useRequirements();
  const { data: archived = [], isLoading: loadingArchived } = useArchivedRequirements();

  const [searchName, setSearchName] = useState('');
  const [searchId, setSearchId] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');

  const isLoading = loadingActive || loadingArchived;
  const all = useMemo(() => [...active, ...archived], [active, archived]);

  const filtered = useMemo(() => {
    return all.filter(r => {
      if (stageFilter === 'archived') return !!r.archivedAt;
      if (stageFilter !== 'all') return r.stage === stageFilter && !r.archivedAt;
      return true;
    }).filter(r => {
      if (searchId.trim() && !r.id.toLowerCase().includes(searchId.trim().toLowerCase())) return false;
      if (searchName.trim() && !r.title.toLowerCase().includes(searchName.trim().toLowerCase())) return false;
      return true;
    });
  }, [all, stageFilter, searchId, searchName]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>需求列表</h1>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{filtered.length} / {all.length} 个需求</span>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* Name search */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="搜索需求名称..."
              style={{
                width: '100%', padding: '7px 10px 7px 28px', boxSizing: 'border-box',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent-blue)'; }}
              onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border-default)'; }}
            />
          </div>

          {/* ID search */}
          <div style={{ position: 'relative', flex: '0 1 160px', minWidth: 120 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
            <input
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              placeholder="需求编号..."
              style={{
                width: '100%', padding: '7px 10px 7px 28px', boxSizing: 'border-box',
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'monospace',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent-blue)'; }}
              onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border-default)'; }}
            />
          </div>

          {/* Stage filter pills */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {STAGE_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStageFilter(opt.value)}
                style={{
                  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  border: `1px solid ${stageFilter === opt.value ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                  background: stageFilter === opt.value ? 'var(--accent-blue-10)' : 'var(--bg-tertiary)',
                  color: stageFilter === opt.value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  transition: 'all 0.12s', whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>加载中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>暂无匹配需求</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)' }}>
                {['需求编号', '需求名称', '状态', '优先级', '类型', '创建时间'].map(h => (
                  <th key={h} style={{
                    padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                    color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => (
                <ReqRow key={req.id} req={req} onDoubleClick={() => onSelectReq(req)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ReqRow({ req, onDoubleClick }: { req: Requirement; onDoubleClick: () => void }) {
  const [hover, setHover] = useState(false);
  const isArchived = !!req.archivedAt;
  const color = PRIORITY_COLOR[req.priority];

  return (
    <tr
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderBottom: '1px solid var(--border-default)',
        background: hover ? 'var(--bg-hover)' : 'transparent',
        cursor: 'pointer',
        opacity: isArchived ? 0.65 : 1,
        transition: 'background 0.1s',
      }}
      title="双击进入需求详情"
    >
      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-tertiary)' }}>{req.id}</span>
      </td>
      <td style={{ padding: '10px 16px', maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {req.title}
          </span>
          {isArchived && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 4,
              background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)',
              border: '1px solid var(--border-default)', flexShrink: 0,
            }}>
              已归档
            </span>
          )}
        </div>
      </td>
      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
        {isArchived ? (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
        ) : (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 500,
            background: 'var(--accent-blue-10)', color: 'var(--accent-blue)',
            border: '1px solid var(--accent-blue-44)',
          }}>
            {STAGE_LABELS[req.stage]}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 500,
          background: color + '15', color, border: `1px solid ${color}35`,
        }}>
          {PRIORITY_LABEL[req.priority]}
        </span>
      </td>
      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 8,
          background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
          border: '1px solid var(--border-default)',
        }}>
          {req.kind === 'standard' ? 'Standard' : 'No Code'}
        </span>
      </td>
      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          {new Date(req.createdAt).toLocaleDateString('zh-CN')}
        </span>
      </td>
    </tr>
  );
}
