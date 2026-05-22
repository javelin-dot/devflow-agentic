import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { canTransition, type Stage, type Priority } from '@devflow/shared';
import type { Requirement } from '@devflow/shared';
import {
  useRequirements, useArchivedRequirements,
  useCreateRequirement, usePatchRequirement, useArchiveRequirement, useProjects,
} from '../api/hooks';
import { QualityGateModal } from '../components/QualityGateModal';
import { UiEmptyState } from '../components/ui';
import { Plus, Archive, Bot, Search, MoreHorizontal, LayoutList, Kanban } from 'lucide-react';

const STAGES: Stage[] = ['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released'];

const STAGE_CONFIG: Record<Stage, { label: string; subtitle: string }> = {
  backlog:     { label: 'Backlog',      subtitle: '待梳理' },
  analyzing:   { label: 'Analyzing',   subtitle: '分析中' },
  development: { label: 'Development', subtitle: '开发中' },
  uat:         { label: 'UAT',         subtitle: '验收测试' },
  prerelease:  { label: 'Pre-release', subtitle: '待发布' },
  released:    { label: 'Released',    subtitle: '已发布' },
};

const GATED_TRANSITIONS: Array<[Stage, Stage]> = [
  ['development', 'uat'],
  ['uat', 'prerelease'],
  ['prerelease', 'released'],
];

const PRIORITY_BADGE: Record<Priority, { color: string; bg: string; border: string; dot: string; label: string }> = {
  critical: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#DC2626', label: 'Critical' },
  high:     { color: '#DC6803', bg: '#FFFAEB', border: '#FEDF89', dot: '#DC6803', label: 'High' },
  medium:   { color: '#2563EB', bg: '#EFF6FF', border: '#DBEAFE', dot: '#2563EB', label: 'Medium' },
  low:      { color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)', border: 'var(--border-default)', dot: '#9CA3AF', label: 'Low' },
};

const KIND_LABEL: Record<string, string> = { standard: 'Standard', no_code: 'No Code' };
const KIND_BADGE = { color: 'var(--text-secondary)', bg: 'var(--bg-tertiary)', border: 'var(--border-default)' };

type StageFilter = 'all' | Stage | 'archived';
type ViewMode = 'kanban' | 'list';

const STAGE_FILTER_OPTIONS: { value: StageFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  ...STAGES.map(s => ({ value: s as StageFilter, label: STAGE_CONFIG[s].label })),
  { value: 'archived', label: '已归档' },
];

const SHIMMER_STYLE = `
@keyframes card-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.card-shimmer {
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--border-default) 50%, var(--bg-tertiary) 75%);
  background-size: 800px 100%;
  animation: card-shimmer 1.4s ease-in-out infinite;
  border-radius: 6px;
}
`;

function CardSkeleton() {
  return (
    <div style={{
      borderRadius: 10, border: '1px solid var(--border-default)', background: 'var(--bg-secondary)',
      marginBottom: 8, padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 8,
      boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-default)', flexShrink: 0 }} />
        <div className="card-shimmer" style={{ height: 13, width: '65%' }} />
      </div>
      <div className="card-shimmer" style={{ height: 10, width: 90, marginLeft: 13 }} />
      <div style={{ display: 'flex', gap: 5, marginLeft: 13 }}>
        <div className="card-shimmer" style={{ height: 20, width: 50, borderRadius: 999 }} />
        <div className="card-shimmer" style={{ height: 20, width: 58, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <div style={{ width: 290, flexShrink: 0 }}>
      <style>{SHIMMER_STYLE}</style>
      <div style={{ padding: '10px 12px', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="card-shimmer" style={{ height: 13, width: 70 }} />
          <div className="card-shimmer" style={{ height: 11, width: 40 }} />
        </div>
        <div className="card-shimmer" style={{ height: 20, width: 24, borderRadius: 999 }} />
      </div>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

interface ContextMenu { x: number; y: number; req: Requirement }

function KanbanCard({
  req, onClick, onDragStart, onContextMenu,
}: {
  req: Requirement;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent, req: Requirement) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const p = PRIORITY_BADGE[req.priority];
  const shortId = req.id.length > 22 ? req.id.slice(0, 22) + '…' : req.id;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={(e) => onContextMenu(e, req)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 10,
        border: `1px solid ${hovered ? 'var(--text-tertiary)' : 'var(--border-default)'}`,
        background: 'var(--bg-secondary)',
        padding: '12px 14px 11px',
        cursor: 'grab',
        marginBottom: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        position: 'relative',
        boxShadow: hovered ? '0 3px 10px rgba(16,24,40,0.09)' : '0 1px 2px rgba(16,24,40,0.04)',
        transition: 'box-shadow 0.15s, border-color 0.15s, transform 0.1s',
        transform: hovered ? 'translateY(-1px)' : 'none',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.dot, flexShrink: 0, marginTop: 5 }} />
        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
          lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {req.title}
        </div>
        {hovered && (
          <div style={{ flexShrink: 0, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}>
            <MoreHorizontal size={14} />
          </div>
        )}
      </div>
      <div style={{
        fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        paddingLeft: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {shortId}
      </div>
      <div style={{ display: 'flex', gap: 5, paddingLeft: 13, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, lineHeight: '20px', padding: '0 7px', borderRadius: 999, fontWeight: 500, flexShrink: 0,
          background: p.bg, color: p.color, border: `1px solid ${p.border}`,
        }}>
          {p.label}
        </span>
        <span style={{
          fontSize: 11, lineHeight: '20px', padding: '0 7px', borderRadius: 999, fontWeight: 500, flexShrink: 0,
          background: KIND_BADGE.bg, color: KIND_BADGE.color, border: `1px solid ${KIND_BADGE.border}`,
        }}>
          {KIND_LABEL[req.kind] ?? req.kind}
        </span>
      </div>
    </div>
  );
}

function ListRow({ req, onClick }: { req: Requirement; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const isArchived = !!req.archivedAt;
  const p = PRIORITY_BADGE[req.priority];

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderBottom: '1px solid var(--bg-tertiary)',
        background: hover ? 'var(--bg-tertiary)' : 'transparent',
        cursor: 'pointer',
        opacity: isArchived ? 0.6 : 1,
        transition: 'background 0.1s',
      }}
    >
      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11, fontFamily: 'ui-monospace, SFMono-Regular, monospace', color: 'var(--text-tertiary)' }}>{req.id}</span>
      </td>
      <td style={{ padding: '10px 16px', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: p.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {req.title}
          </span>
          {isArchived && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
              background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)', border: '1px solid var(--border-default)',
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
            fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 500,
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)',
          }}>
            {STAGE_CONFIG[req.stage].label}
          </span>
        )}
      </td>
      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 500,
          background: p.bg, color: p.color, border: `1px solid ${p.border}`,
        }}>
          {p.label}
        </span>
      </td>
      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 6,
          background: KIND_BADGE.bg, color: KIND_BADGE.color, border: `1px solid ${KIND_BADGE.border}`,
        }}>
          {KIND_LABEL[req.kind] ?? req.kind}
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

interface NewReqForm {
  title: string;
  priority: Priority;
  kind: 'standard' | 'no_code';
  projects: string[];
}

const PRIORITY_OPTIONS: { value: Priority }[] = [
  { value: 'critical' }, { value: 'high' }, { value: 'medium' }, { value: 'low' },
];

const KIND_OPTIONS: { value: 'standard' | 'no_code'; label: string; desc: string }[] = [
  { value: 'standard', label: 'Standard', desc: '需要代码实现的标准需求' },
  { value: 'no_code', label: 'No Code', desc: '无需编写代码的需求' },
];

function NewReqModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (form: NewReqForm) => void }) {
  const [form, setForm] = useState<NewReqForm>({ title: '', priority: 'medium', kind: 'standard', projects: [] });
  const { data: allProjects = [] } = useProjects();

  const toggleProject = (name: string) => {
    setForm(f => ({
      ...f,
      projects: f.projects.includes(name) ? f.projects.filter(p => p !== name) : [...f.projects, name],
    }));
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && form.title.trim()) onSubmit(form); }}
    >
      <div
        style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 14,
          width: 520, maxWidth: '92vw', boxShadow: '0 20px 40px rgba(16,24,40,0.16)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--bg-tertiary)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>新建需求</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>填写需求信息，创建后进入 Backlog</div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              需求标题 <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="用一句话描述这个需求..."
              style={{
                width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)',
                border: '1px solid var(--text-tertiary)', borderRadius: 8, color: 'var(--text-primary)',
                fontSize: 14, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = '#00a8a8'; }}
              onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--text-tertiary)'; }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>优先级</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITY_OPTIONS.map((opt) => {
                const p = PRIORITY_BADGE[opt.value];
                const selected = form.priority === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setForm((f) => ({ ...f, priority: opt.value }))}
                    style={{
                      flex: 1, padding: '7px 4px', borderRadius: 8, cursor: 'pointer',
                      fontSize: 12, fontWeight: 500,
                      border: `1px solid ${selected ? p.border : 'var(--border-default)'}`,
                      background: selected ? p.bg : 'var(--bg-secondary)',
                      color: selected ? p.color : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}
                  >
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: selected ? p.dot : 'var(--text-tertiary)' }} />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>需求类型</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm((f) => ({ ...f, kind: opt.value, projects: opt.value === 'no_code' ? [] : f.projects }))}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${form.kind === opt.value ? '#00a8a8' : 'var(--border-default)'}`,
                    background: form.kind === opt.value ? 'rgba(0,168,168,0.06)' : 'var(--bg-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: form.kind === opt.value ? '#00a8a8' : 'var(--text-primary)' }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {form.kind === 'standard' && <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                关联代码仓库
                <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>可多选</span>
              </label>
              {form.projects.length > 0 && (
                <span style={{ fontSize: 11, color: '#00a8a8' }}>已选 {form.projects.length}</span>
              )}
            </div>
            {allProjects.length === 0 ? (
              <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px dashed var(--border-default)', color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center' }}>
                暂无可用仓库，请先在「项目」页面添加
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allProjects.map((proj) => {
                  const selected = form.projects.includes(proj.name);
                  return (
                    <button
                      key={proj.name}
                      onClick={() => toggleProject(proj.name)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        border: `1px solid ${selected ? '#00a8a8' : 'var(--border-default)'}`,
                        background: selected ? 'rgba(0,168,168,0.06)' : 'var(--bg-secondary)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${selected ? '#00a8a8' : 'var(--text-tertiary)'}`,
                        background: selected ? '#00a8a8' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {selected && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? '#00a8a8' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {proj.name}
                        </div>
                        {(proj.path || proj.lang) && (
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {[proj.lang, proj.path].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      {proj.branch && (
                        <span style={{ flexShrink: 0, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', fontFamily: 'monospace' }}>
                          {proj.branch}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--bg-tertiary)', display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--bg-secondary)' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}
          >
            取消
          </button>
          <button
            onClick={() => { if (form.title.trim()) onSubmit(form); }}
            disabled={!form.title.trim()}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: form.title.trim() ? '#00a8a8' : 'var(--border-default)',
              color: form.title.trim() ? 'var(--text-inverse)' : 'var(--text-tertiary)',
              cursor: form.title.trim() ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600,
            }}
          >
            创建需求
          </button>
        </div>
      </div>
    </div>
  );
}

export function BoardView({ onOpenReq }: { onOpenReq?: (req: Requirement) => void }) {
  const { data: activeReqs = [], isLoading, isError } = useRequirements();
  const { data: archivedReqs = [] } = useArchivedRequirements();
  const createReq = useCreateRequirement();
  const patchReq = usePatchRequirement();
  const archiveReq = useArchiveRequirement();
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [showModal, setShowModal] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [gateModal, setGateModal] = useState<{ reqId: string; fromStage: Stage; toStage: Stage } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

  // shared filters
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<Priority | ''>('');
  const [filterKind, setFilterKind] = useState<'standard' | 'no_code' | ''>('');
  // list-only filters
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');

  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu, closeMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, req: Requirement) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, req });
  }, []);

  const handleCreate = (form: NewReqForm) => {
    createReq.mutate(
      {
        title: form.title, priority: form.priority, kind: form.kind,
        projects: form.projects.map((name, i) => ({ project: name, isPrimary: i === 0, devBranch: null, uatBranch: null })),
      },
      { onSuccess: () => setShowModal(false), onError: (e) => alert(`创建失败: ${e.message}`) }
    );
  };

  function handleDragStart(e: React.DragEvent, req: Requirement) {
    e.dataTransfer.setData('application/json', JSON.stringify({ reqId: req.id, fromStage: req.stage, req }));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(e: React.DragEvent, toStage: Stage) {
    e.preventDefault();
    setDragOverStage(null);
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;
    try {
      const { reqId, fromStage } = JSON.parse(data) as { reqId: string; fromStage: Stage };
      if (fromStage === toStage) return;
      if (!canTransition(fromStage, toStage)) {
        alert(`无法从 ${STAGE_CONFIG[fromStage].label} 移动到 ${STAGE_CONFIG[toStage].label}`);
        return;
      }
      const needsGate = GATED_TRANSITIONS.some(([f, t]) => f === fromStage && t === toStage);
      if (needsGate) { setGateModal({ reqId, fromStage, toStage }); return; }
      patchReq.mutate({ id: reqId, patch: { stage: toStage } });
    } catch { /* ignore */ }
  }

  // All requirements combined for list view
  const allReqs = useMemo(() => [...activeReqs, ...archivedReqs], [activeReqs, archivedReqs]);

  // Filtered list for list view
  const filteredList = useMemo(() => {
    const base = stageFilter === 'archived'
      ? allReqs.filter(r => !!r.archivedAt)
      : stageFilter === 'all'
        ? allReqs
        : allReqs.filter(r => r.stage === stageFilter && !r.archivedAt);

    return base.filter(r => {
      if (search && !r.title.toLowerCase().includes(search.toLowerCase()) && !r.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterPriority && r.priority !== filterPriority) return false;
      if (filterKind && r.kind !== filterKind) return false;
      return true;
    });
  }, [allReqs, stageFilter, search, filterPriority, filterKind]);

  // Filtered requirements per stage for kanban
  const byStage = useMemo(() => {
    const map = new Map<Stage, Requirement[]>();
    for (const s of STAGES) map.set(s, []);
    for (const r of activeReqs) {
      if (search && !r.title.toLowerCase().includes(search.toLowerCase())) continue;
      if (filterPriority && r.priority !== filterPriority) continue;
      if (filterKind && r.kind !== filterKind) continue;
      const list = map.get(r.stage);
      if (list) list.push(r);
    }
    return (stage: Stage) => map.get(stage) ?? [];
  }, [activeReqs, search, filterPriority, filterKind]);

  const hasFilters = search || filterPriority || filterKind;

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-default)',
    background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: 13,
    cursor: 'pointer', outline: 'none', appearance: 'none',
    WebkitAppearance: 'none', paddingRight: 28,
  };

  if (isLoading) {
    return (
      <div style={{ padding: '24px 20px', display: 'flex', gap: 12, height: '100%', overflow: 'auto', background: 'var(--bg-primary)' }}>
        <style>{SHIMMER_STYLE}</style>
        {STAGES.map((s) => <ColumnSkeleton key={s} />)}
      </div>
    );
  }

  if (isError) {
    return <UiEmptyState title="加载失败" description="无法加载需求数据，请检查网络连接" />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      <style>{SHIMMER_STYLE}</style>

      {/* ── Header ── */}
      <div style={{
        padding: '16px 24px 12px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* Title */}
        <div style={{ flex: '0 0 auto' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>需求管理</h1>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap' }}>
            {viewMode === 'kanban' ? '按交付阶段跟踪需求状态、优先级与研发进度' : '全量需求列表，支持按阶段、优先级筛选'}
          </p>
        </div>

        {/* View mode toggle */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: 'var(--bg-tertiary)', borderRadius: 8, padding: 3, gap: 1, marginLeft: 8,
        }}>
          {([['kanban', <Kanban size={13} />, '看板'] as const, ['list', <LayoutList size={13} />, '列表'] as const]).map(([mode, icon, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                background: viewMode === mode ? 'var(--bg-secondary)' : 'transparent',
                color: viewMode === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: viewMode === mode ? '0 1px 3px rgba(16,24,40,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={viewMode === 'kanban' ? '搜索需求...' : '搜索名称或编号...'}
            style={{
              paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
              borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-secondary)',
              fontSize: 13, color: 'var(--text-primary)', width: 180, outline: 'none', transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = '#00a8a8'; }}
            onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border-default)'; }}
          />
        </div>

        {/* Priority filter */}
        <div style={{ position: 'relative' }}>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value as Priority | '')} style={selectStyle}>
            <option value="">优先级</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>

        {/* Kind filter */}
        <div style={{ position: 'relative' }}>
          <select value={filterKind} onChange={(e) => setFilterKind(e.target.value as 'standard' | 'no_code' | '')} style={selectStyle}>
            <option value="">类型</option>
            <option value="standard">Standard</option>
            <option value="no_code">No Code</option>
          </select>
          <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1L5 5L9 1" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>

        {hasFilters && (
          <button
            onClick={() => { setSearch(''); setFilterPriority(''); setFilterKind(''); setStageFilter('all'); }}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-default)', background: 'var(--bg-secondary)', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12 }}
          >
            清除
          </button>
        )}

        <div style={{ width: 1, height: 20, background: 'var(--border-default)' }} />

        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8, border: 'none',
            background: '#00a8a8', color: 'var(--text-inverse)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#009090'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#00a8a8'; }}
        >
          <Plus size={14} />新建需求
        </button>

        <span style={{ fontSize: 13, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
          {activeReqs.length} 个需求
        </span>
      </div>

      {/* ── List mode sub-filter bar ── */}
      {viewMode === 'list' && (
        <div style={{
          padding: '8px 24px', borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-secondary)', flexShrink: 0,
          display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap',
        }}>
          {STAGE_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStageFilter(opt.value)}
              style={{
                padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                border: `1px solid ${stageFilter === opt.value ? '#00a8a8' : 'var(--border-default)'}`,
                background: stageFilter === opt.value ? 'rgba(0,168,168,0.07)' : 'var(--bg-secondary)',
                color: stageFilter === opt.value ? '#00a8a8' : 'var(--text-secondary)',
                transition: 'all 0.12s', whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-tertiary)' }}>
            {filteredList.length} / {allReqs.length} 个
          </span>
        </div>
      )}

      {/* ── Kanban view ── */}
      {viewMode === 'kanban' && (
        <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'auto', minHeight: 0, padding: '16px 20px' }}>
          {STAGES.map((stage) => {
            const items = byStage(stage);
            const isDragOver = dragOverStage === stage;
            const config = STAGE_CONFIG[stage];
            return (
              <div
                key={stage}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverStage(stage); }}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => handleDrop(e, stage)}
                style={{
                  width: 290, minWidth: 290, flexShrink: 0,
                  display: 'flex', flexDirection: 'column', borderRadius: 10,
                  background: isDragOver ? 'rgba(0,168,168,0.05)' : 'transparent',
                  border: isDragOver ? '1px dashed rgba(0,168,168,0.4)' : '1px dashed transparent',
                  transition: 'background 0.15s, border 0.15s',
                }}
              >
                {/* Column header */}
                <div style={{
                  padding: '10px 12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexShrink: 0, marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{config.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{config.subtitle}</span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
                    padding: '1px 8px', borderRadius: 999, lineHeight: '18px',
                  }}>
                    {items.length}
                  </span>
                </div>
                <div style={{ height: 1, background: 'var(--border-default)', marginBottom: 8, flexShrink: 0 }} />

                {/* Cards */}
                <div style={{ flex: 1, overflowY: 'auto', paddingLeft: 1, paddingRight: 1, paddingBottom: 8 }}>
                  {items.map((req) => (
                    <KanbanCard
                      key={req.id}
                      req={req}
                      onClick={() => navigate(`/requirements/${req.id}`)}
                      onDragStart={(e) => handleDragStart(e, req)}
                      onContextMenu={handleContextMenu}
                    />
                  ))}
                  {items.length === 0 && stage !== 'backlog' && (
                    <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>暂无需求</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>拖拽需求到此阶段</div>
                    </div>
                  )}
                  {stage === 'backlog' && (
                    <button
                      onClick={() => setShowModal(true)}
                      style={{
                        width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)',
                        border: '1px dashed var(--text-tertiary)', borderRadius: 10, color: 'var(--text-tertiary)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 500,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        transition: 'border-color 0.15s, color 0.15s',
                        marginTop: items.length > 0 ? 4 : 0,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00a8a8'; (e.currentTarget as HTMLButtonElement).style.color = '#00a8a8'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-tertiary)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
                    >
                      <Plus size={13} />新建需求
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ── */}
      {viewMode === 'list' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredList.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>暂无匹配需求</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-default)', position: 'sticky', top: 0 }}>
                  {['需求编号', '需求名称', '阶段', '优先级', '类型', '创建时间'].map(h => (
                    <th key={h} style={{
                      padding: '9px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                      color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredList.map((req) => (
                  <ListRow key={req.id} req={req} onClick={() => navigate(`/requirements/${req.id}`)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modals */}
      {showModal && <NewReqModal onClose={() => setShowModal(false)} onSubmit={handleCreate} />}

      {gateModal && (
        <QualityGateModal
          reqId={gateModal.reqId}
          fromStage={gateModal.fromStage}
          toStage={gateModal.toStage}
          onPassed={() => { patchReq.mutate({ id: gateModal.reqId, patch: { stage: gateModal.toStage } }); setGateModal(null); }}
          onClose={() => setGateModal(null)}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
            borderRadius: 9, boxShadow: '0 8px 24px rgba(16,24,40,0.12)',
            zIndex: 400, minWidth: 160, padding: '4px 0', overflow: 'hidden',
          }}
        >
          <button
            onClick={() => { closeMenu(); navigate(`/requirements/${contextMenu.req.id}`); }}
            style={{ width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'left' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            查看详情
          </button>
          <button
            onClick={() => { closeMenu(); if (onOpenReq) onOpenReq(contextMenu.req); }}
            style={{ width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13, textAlign: 'left' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <Bot size={14} />AI 助手
          </button>
          <div style={{ height: 1, background: 'var(--bg-tertiary)', margin: '3px 0' }} />
          <button
            onClick={() => {
              if (!confirm(`确定归档需求「${contextMenu.req.title}」？`)) { closeMenu(); return; }
              archiveReq.mutate(contextMenu.req.id, { onSuccess: closeMenu });
            }}
            style={{ width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#DC2626', fontSize: 13, textAlign: 'left' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <Archive size={14} />归档需求
          </button>
        </div>
      )}
    </div>
  );
}
