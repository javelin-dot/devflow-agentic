import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { STAGE_LABELS, canTransition, type Stage, type Priority } from '@devflow/shared';
import type { Requirement } from '@devflow/shared';
import { useRequirements, useCreateRequirement, usePatchRequirement, useArchiveRequirement, useProjects } from '../api/hooks';
import { QualityGateModal } from '../components/QualityGateModal';
import { UiBadge, UiEmptyState, UiSelect } from '../components/ui';
import { Plus, Archive, Sparkles } from 'lucide-react';

const STAGES: Stage[] = ['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released'];

const GATED_TRANSITIONS: Array<[Stage, Stage]> = [
  ['development', 'uat'],
  ['uat', 'prerelease'],
  ['prerelease', 'released'],
];

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#3B82F6',
  low: '#94A3B8',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const KIND_LABEL: Record<string, string> = { standard: 'Standard', no_code: 'No Code' };

const SHIMMER_STYLE = `
@keyframes card-shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.card-shimmer {
  background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-tertiary) 50%, var(--bg-secondary) 75%);
  background-size: 800px 100%;
  animation: card-shimmer 1.4s ease-in-out infinite;
  border-radius: 6px;
}
`;

function CardSkeleton() {
  return (
    <div style={{
      height: 88, borderRadius: 12, border: '1px solid var(--border-default)',
      background: 'var(--bg-secondary)', marginBottom: 8, padding: '14px 14px 14px 18px',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: '0 2px 2px 0', background: 'var(--bg-tertiary)' }} />
      <div className="card-shimmer" style={{ height: 13, width: '65%', borderRadius: 4 }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="card-shimmer" style={{ height: 10, width: 80, borderRadius: 4 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <div className="card-shimmer" style={{ height: 18, width: 44, borderRadius: 20 }} />
          <div className="card-shimmer" style={{ height: 18, width: 52, borderRadius: 20 }} />
        </div>
      </div>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <div style={{ minWidth: 220, width: 220, flexShrink: 0 }}>
      <style>{SHIMMER_STYLE}</style>
      {/* Column header */}
      <div style={{ height: 40, marginBottom: 8, borderRadius: '10px 10px 0 0', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
        <div className="card-shimmer" style={{ height: 12, width: 56, borderRadius: 4 }} />
        <div className="card-shimmer" style={{ height: 18, width: 24, borderRadius: 10, marginLeft: 'auto' }} />
      </div>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

interface ContextMenu { x: number; y: number; req: Requirement }

function RequirementCard({
  req,
  onDoubleClick,
  onDragStart,
  onContextMenu,
}: {
  req: Requirement;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent, req: Requirement) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = PRIORITY_COLOR[req.priority];
  const shortTitle = req.title.length > 8 ? req.title.slice(0, 8) + '…' : req.title;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => onContextMenu(e, req)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 80,
        minHeight: 80,
        borderRadius: 10,
        border: `1px solid ${hovered ? color + '55' : 'var(--border-default)'}`,
        background: 'var(--bg-secondary)',
        padding: '12px 12px 12px 16px',
        cursor: 'grab',
        marginBottom: 7,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: hovered ? `0 2px 12px ${color}22` : 'none',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Priority accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 10, bottom: 10, width: 3,
        borderRadius: '0 2px 2px 0', background: color,
      }} />

      {/* Title */}
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
        lineHeight: 1.35, letterSpacing: '-0.01em', whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {shortTitle}
      </div>

      {/* Bottom row — strictly single line, no wrap */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        flexWrap: 'nowrap', overflow: 'hidden',
      }}>
        <span style={{
          fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'monospace',
          flex: '1 1 0', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {req.id}
        </span>
        <span style={{
          flexShrink: 0, whiteSpace: 'nowrap',
          fontSize: 11, lineHeight: '20px', padding: '0 7px', borderRadius: 20, fontWeight: 500,
          background: color + '15', color, border: `1px solid ${color}35`,
        }}>
          {PRIORITY_LABEL[req.priority]}
        </span>
        <span style={{
          flexShrink: 0, whiteSpace: 'nowrap',
          fontSize: 11, lineHeight: '20px', padding: '0 7px', borderRadius: 20, fontWeight: 500,
          background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
          border: '1px solid var(--border-default)',
        }}>
          {KIND_LABEL[req.kind] ?? req.kind}
        </span>
      </div>
    </div>
  );
}

interface NewReqForm {
  title: string;
  priority: Priority;
  kind: 'standard' | 'no_code';
  projects: string[];
}

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'var(--accent-red)' },
  { value: 'high', label: 'High', color: 'var(--accent-orange)' },
  { value: 'medium', label: 'Medium', color: 'var(--accent-blue)' },
  { value: 'low', label: 'Low', color: 'var(--text-tertiary)' },
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && form.title.trim()) onSubmit(form);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
          borderRadius: 16, width: 520, maxWidth: '92vw', boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>新建需求</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>填写需求信息，创建后进入 Backlog</div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto' }}>
          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              需求标题 <span style={{ color: 'var(--accent-red)' }}>*</span>
            </label>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="用一句话描述这个需求..."
              style={{
                width: '100%', padding: '10px 12px', background: 'var(--bg-secondary)',
                border: '1px solid var(--border-default)', borderRadius: 8,
                color: 'var(--text-primary)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent-blue)'; }}
              onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border-default)'; }}
            />
          </div>

          {/* Priority */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>优先级</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm((f) => ({ ...f, priority: opt.value }))}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    border: `1px solid ${form.priority === opt.value ? opt.color : 'var(--border-default)'}`,
                    background: form.priority === opt.value ? `${opt.color}18` : 'var(--bg-secondary)',
                    color: form.priority === opt.value ? opt.color : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Kind */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>需求类型</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm((f) => ({ ...f, kind: opt.value, projects: opt.value === 'no_code' ? [] : f.projects }))}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${form.kind === opt.value ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                    background: form.kind === opt.value ? 'var(--accent-blue-10)' : 'var(--bg-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: form.kind === opt.value ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Repositories — only for standard requirements */}
          {form.kind === 'standard' && <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                关联代码仓库
                <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: 'var(--text-tertiary)' }}>可多选，作为后续分析和开发的背景资料</span>
              </label>
              {form.projects.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--accent-blue)' }}>已选 {form.projects.length}</span>
              )}
            </div>

            {allProjects.length === 0 ? (
              <div style={{
                padding: '12px 14px', borderRadius: 8, border: '1px dashed var(--border-default)',
                color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center',
              }}>
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
                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        border: `1px solid ${selected ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                        background: selected ? 'var(--accent-blue-10)' : 'var(--bg-secondary)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {/* Checkbox indicator */}
                      <div style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                        border: `2px solid ${selected ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                        background: selected ? 'var(--accent-blue)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                      }}>
                        {selected && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--accent-blue)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {proj.name}
                        </div>
                        {(proj.path || proj.lang) && (
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {[proj.lang, proj.path].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      {proj.branch && (
                        <span style={{
                          flexShrink: 0, fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)',
                          border: '1px solid var(--border-default)', fontFamily: 'monospace',
                        }}>
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

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid var(--border-default)', flexShrink: 0,
          display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--bg-secondary)',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-default)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13,
            }}
          >
            取消
          </button>
          <button
            onClick={() => { if (form.title.trim()) onSubmit(form); }}
            disabled={!form.title.trim()}
            style={{
              padding: '8px 20px', borderRadius: 8, border: 'none',
              background: form.title.trim() ? 'var(--accent-blue)' : 'var(--bg-disabled)',
              color: form.title.trim() ? 'var(--text-inverse)' : 'var(--text-tertiary)',
              cursor: form.title.trim() ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
            }}
          >
            创建需求
          </button>
        </div>
      </div>
    </div>
  );
}

export function BoardView({ onOpenReq, onPreviewReq }: { onOpenReq?: (req: Requirement) => void; onPreviewReq?: (req: Requirement) => void }) {
  const { data: requirements = [], isLoading, isError } = useRequirements();
  const createReq = useCreateRequirement();
  const patchReq = usePatchRequirement();
  const archiveReq = useArchiveRequirement();
  const [showModal, setShowModal] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [gateModal, setGateModal] = useState<{ reqId: string; fromStage: Stage; toStage: Stage } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
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
        title: form.title,
        priority: form.priority,
        kind: form.kind,
        projects: form.projects.map((name, i) => ({ project: name, isPrimary: i === 0 })),
      },
      {
        onSuccess: () => setShowModal(false),
        onError: (e) => alert(`创建失败: ${e.message}`),
      }
    );
  };

  function handleDragStart(e: React.DragEvent, req: Requirement) {
    e.dataTransfer.setData('application/json', JSON.stringify({ reqId: req.id, fromStage: req.stage }));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, stage: Stage) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stage);
  }

  function handleDragLeave() {
    setDragOverStage(null);
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
        alert(`无法从 ${STAGE_LABELS[fromStage]} 移动到 ${STAGE_LABELS[toStage]}`);
        return;
      }
      const needsGate = GATED_TRANSITIONS.some(([f, t]) => f === fromStage && t === toStage);
      if (needsGate) {
        setGateModal({ reqId, fromStage, toStage });
        return;
      }
      patchReq.mutate({ id: reqId, patch: { stage: toStage } });
    } catch {
      /* ignore */
    }
  }

  const byStage = useMemo(() => {
    const map = new Map<Stage, Requirement[]>();
    for (const s of STAGES) map.set(s, []);
    for (const r of requirements) {
      const list = map.get(r.stage);
      if (list) list.push(r);
    }
    return (stage: Stage) => map.get(stage) ?? [];
  }, [requirements]);

  if (isLoading) {
    return (
      <div style={{ padding: 16, display: 'flex', gap: 12, height: '100%', overflow: 'auto' }}>
        {STAGES.map((s) => <ColumnSkeleton key={s} />)}
      </div>
    );
  }

  if (isError) {
    return (
      <UiEmptyState
        title="加载失败"
        description="无法加载需求数据，请检查网络连接"
      />
    );
  }

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{SHIMMER_STYLE}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>需求看板</h1>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{requirements.length} 个需求</span>
      </div>

      {/* Board columns */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flex: 1,
          overflow: 'auto',
          minHeight: 0,
        }}
      >
        {STAGES.map((stage) => {
          const items = byStage(stage);
          const isDragOver = dragOverStage === stage;
          return (
            <div
              key={stage}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage)}
              style={{
                minWidth: 220,
                width: 220,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                background: isDragOver ? 'var(--bg-tertiary)' : 'transparent',
                borderRadius: 'var(--radius-md)',
                border: isDragOver ? '2px dashed var(--border-focus)' : '2px dashed transparent',
                transition: 'background 0.15s, border 0.15s',
              }}
            >
              {/* Column header */}
              <div
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                  borderBottom: '2px solid var(--accent-blue)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {STAGE_LABELS[stage]}
                </span>
                <UiBadge variant="default">{items.length}</UiBadge>
              </div>

              {/* Cards */}
              <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2, paddingLeft: 2 }}>
                {items.map((req) => (
                  <RequirementCard
                    key={req.id}
                    req={req}
                    onDoubleClick={() => onPreviewReq?.(req)}
                    onDragStart={(e) => handleDragStart(e, req)}
                    onContextMenu={handleContextMenu}
                  />
                ))}

                {items.length === 0 && stage !== 'backlog' && (
                  <div style={{
                    margin: '12px 0', padding: '14px 0', textAlign: 'center',
                    color: 'var(--text-secondary)', fontSize: 11,
                    border: '1px dashed var(--border-default)', borderRadius: 8,
                  }}>
                    暂无需求
                  </div>
                )}

                {/* Add button only in backlog */}
                {stage === 'backlog' && (
                  <button
                    onClick={() => setShowModal(true)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      background: 'transparent',
                      border: '1px dashed var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-focus)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
                    }}
                  >
                    <Plus size={14} />
                    新建需求
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && <NewReqModal onClose={() => setShowModal(false)} onSubmit={handleCreate} />}

      {gateModal && (
        <QualityGateModal
          reqId={gateModal.reqId}
          fromStage={gateModal.fromStage}
          toStage={gateModal.toStage}
          onPassed={() => {
            patchReq.mutate({ id: gateModal.reqId, patch: { stage: gateModal.toStage } });
            setGateModal(null);
          }}
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
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 200, minWidth: 160, padding: '4px 0', overflow: 'hidden',
          }}
        >
          <button
            onClick={() => { closeMenu(); if (onOpenReq) onOpenReq(contextMenu.req); }}
            style={{
              width: '100%', padding: '8px 14px', background: 'transparent', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              color: 'var(--text-primary)', fontSize: 13, textAlign: 'left',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <Sparkles size={14} />
            AI 助理
          </button>
          <div style={{ height: 1, background: 'var(--border-default)', margin: '3px 0' }} />
          <button
            onClick={() => {
              if (!confirm(`确定归档需求「${contextMenu.req.title}」？归档后将从看板中移除。`)) { closeMenu(); return; }
              archiveReq.mutate(contextMenu.req.id, { onSuccess: closeMenu });
            }}
            style={{
              width: '100%', padding: '8px 14px', background: 'transparent', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              color: 'var(--accent-red)', fontSize: 13, textAlign: 'left',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--diff-del-bg)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
          >
            <Archive size={14} />
            归档需求
          </button>
        </div>
      )}
    </div>
  );
}
