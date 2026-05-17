import { useState, useMemo, memo } from 'react';
import { STAGE_LABELS, canTransition, type Stage, type Priority } from '@devflow/shared';
import type { Requirement } from '@devflow/shared';
import { useRequirements, useCreateRequirement, usePatchRequirement } from '../api/hooks';
import { QualityGateModal } from '../components/QualityGateModal';
import { UiBadge, UiEmptyState, UiSkeleton, UiButton, UiSelect } from '../components/ui';
import { Plus } from 'lucide-react';

const STAGES: Stage[] = ['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released'];

const GATED_TRANSITIONS: Array<[Stage, Stage]> = [
  ['development', 'uat'],
  ['uat', 'prerelease'],
  ['prerelease', 'released'],
];

const PRIORITY_VARIANTS: Record<Priority, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error',
  high: 'warning',
  medium: 'info',
  low: 'default',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <UiBadge variant={PRIORITY_VARIANTS[priority]}>
      {PRIORITY_LABELS[priority]}
    </UiBadge>
  );
}

const RequirementCard = memo(({
  req,
  expanded,
  onToggle,
  onDragStart,
}: {
  req: Requirement;
  expanded: boolean;
  onToggle: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) => (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onToggle}
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        cursor: 'grab',
        transition: 'border-color 0.15s, opacity 0.15s',
        marginBottom: 8,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-focus)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-default)';
      }}
    >
      <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 6, color: 'var(--text-primary)' }}>
        {req.title}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <PriorityBadge priority={req.priority} />
        {req.tags.map((tag) => (
          <span
            key={tag}
            style={{
              display: 'inline-block',
              padding: '1px 6px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 10,
              background: 'var(--bg-tertiary)',
              color: 'var(--text-tertiary)',
              border: '1px solid var(--border-default)',
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {expanded && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}
        >
          <div>
            <span style={{ color: 'var(--text-tertiary)' }}>ID:</span> {req.id}
          </div>
          <div>
            <span style={{ color: 'var(--text-tertiary)' }}>Stage:</span> {req.stage}
          </div>
          <div>
            <span style={{ color: 'var(--text-tertiary)' }}>Kind:</span> {req.kind}
          </div>
          {req.description && (
            <div style={{ marginTop: 4 }}>
              <span style={{ color: 'var(--text-tertiary)' }}>Desc:</span> {req.description}
            </div>
          )}
        </div>
      )}
    </div>
  )
);

interface NewReqForm {
  title: string;
  priority: Priority;
  kind: 'standard' | 'no_code';
}

function NewReqModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (form: NewReqForm) => void;
}) {
  const [form, setForm] = useState<NewReqForm>({
    title: '',
    priority: 'medium',
    kind: 'no_code',
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-xl)',
          width: 400,
          maxWidth: '90vw',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: 16, fontSize: 16, color: 'var(--text-primary)' }}>新建需求</h3>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            标题 *
          </label>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none',
            }}
            placeholder="需求标题..."
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            优先级
          </label>
          <UiSelect
            value={form.priority}
            onChange={(v) => setForm((f) => ({ ...f, priority: v as Priority }))}
            options={[
              { value: 'critical', label: 'Critical' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ]}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
            类型
          </label>
          <UiSelect
            value={form.kind}
            onChange={(v) => setForm((f) => ({ ...f, kind: v as 'standard' | 'no_code' }))}
            options={[
              { value: 'no_code', label: 'No Code' },
              { value: 'standard', label: 'Standard' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <UiButton variant="ghost" size="md" onClick={onClose}>
            取消
          </UiButton>
          <UiButton
            size="md"
            onClick={() => {
              if (form.title.trim()) onSubmit(form);
            }}
          >
            创建
          </UiButton>
        </div>
      </div>
    </div>
  );
}

export function BoardView({ onOpenReq }: { onOpenReq?: (req: Requirement) => void }) {
  const { data: requirements = [], isLoading, isError } = useRequirements();
  const createReq = useCreateRequirement();
  const patchReq = usePatchRequirement();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [gateModal, setGateModal] = useState<{ reqId: string; fromStage: Stage; toStage: Stage } | null>(null);

  const handleCreate = (form: NewReqForm) => {
    createReq.mutate(
      {
        title: form.title,
        priority: form.priority,
        kind: form.kind,
        projects: [],
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

  if (isLoading) {
    return (
      <div style={{ padding: 16, display: 'flex', gap: 12, height: '100%' }}>
        {STAGES.map((s) => (
          <div key={s} style={{ minWidth: 220, width: 220, flexShrink: 0 }}>
            <UiSkeleton height={36} style={{ marginBottom: 8 }} />
            <UiSkeleton height={80} style={{ marginBottom: 8 }} />
            <UiSkeleton height={80} style={{ marginBottom: 8 }} />
          </div>
        ))}
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

  const byStage = useMemo(() => {
    const map = new Map<Stage, Requirement[]>();
    for (const s of STAGES) map.set(s, []);
    for (const r of requirements) {
      const list = map.get(r.stage);
      if (list) list.push(r);
    }
    return (stage: Stage) => map.get(stage) ?? [];
  }, [requirements]);

  return (
    <div style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                    expanded={expandedId === req.id}
                    onToggle={() => {
                      if (onOpenReq) {
                        onOpenReq(req);
                      } else {
                        setExpandedId((prev) => (prev === req.id ? null : req.id));
                      }
                    }}
                    onDragStart={(e) => handleDragStart(e, req)}
                  />
                ))}

                {items.length === 0 && stage !== 'backlog' && (
                  <UiEmptyState title="暂无需求" icon={null} />
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
                      color: 'var(--text-tertiary)',
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
    </div>
  );
}
