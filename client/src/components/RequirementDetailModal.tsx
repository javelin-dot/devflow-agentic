import { useState, useEffect } from 'react';
import { ChevronLeft, Save, Bot, ChevronRight, Archive, GitGraph, Check } from 'lucide-react';
import { STAGE_LABELS } from '@devflow/shared';
import type { Requirement, Stage, Priority } from '@devflow/shared';
import { usePatchRequirement, useProjects } from '../api/hooks';
import { RequirementSpecEditor } from './RequirementSpecEditor';
import { DesignSpecEditor } from './DesignSpecEditor';
import { SubTaskPanel } from '../views/SubTaskPanel';
import { AttachmentsPanel } from './AttachmentsPanel';

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: '#EF4444', high: '#F97316', medium: '#3B82F6', low: '#94A3B8',
};
const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};
const PRIORITY_OPTIONS: Priority[] = ['critical', 'high', 'medium', 'low'];
const KIND_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'no_code', label: 'No Code' },
] as const;

const STAGES: Stage[] = ['backlog', 'analyzing', 'development', 'uat', 'prerelease', 'released'];
type DocTab = 'spec' | 'design' | 'tasks' | 'attachments';

function stageIndex(s: Stage) { return STAGES.indexOf(s); }

interface Props {
  req: Requirement;
  onClose: () => void;
  onOpenAI: (req: Requirement) => void;
}

function ProjectSelector({ req }: { req: Requirement }) {
  const { data: allProjects = [] } = useProjects();
  const patchReq = usePatchRequirement();
  const linkedNames = new Set(req.projects.map(p => p.project));
  const [saving, setSaving] = useState(false);

  const toggle = (name: string) => {
    const isLinked = linkedNames.has(name);
    const next = isLinked
      ? req.projects.filter(p => p.project !== name)
      : [...req.projects, { project: name, isPrimary: req.projects.length === 0, devBranch: null, uatBranch: null }];
    setSaving(true);
    patchReq.mutate(
      { id: req.id, patch: { projects: next.map((p, i) => ({ project: p.project, isPrimary: i === 0 })) } },
      { onSettled: () => setSaving(false) }
    );
  };

  return (
    <div style={{
      borderRadius: 8, border: '1px solid var(--accent-orange-44, #F9731644)',
      background: 'var(--diff-mod-bg, #F9731608)', padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <GitGraph size={14} color="var(--accent-orange)" />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-orange)' }}>
          需选择代码仓库（Standard 需求必须关联仓库后才能进入 Development）
        </span>
      </div>
      {allProjects.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>暂无可用仓库，请先在「代码仓库」中配置</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {allProjects.map(proj => {
            const linked = linkedNames.has(proj.name);
            return (
              <button
                key={proj.name}
                onClick={() => !saving && toggle(proj.name)}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer',
                  border: `1px solid ${linked ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                  background: linked ? 'var(--accent-blue-10)' : 'var(--bg-secondary)',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${linked ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                  background: linked ? 'var(--accent-blue)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {linked && <Check size={10} color="#fff" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: linked ? 'var(--accent-blue)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {proj.name}
                    {req.projects.find(p => p.project === proj.name)?.isPrimary && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent-green)', background: 'var(--diff-add-bg)', padding: '1px 5px', borderRadius: 3 }}>主仓库</span>
                    )}
                  </div>
                  {proj.path && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.path}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RequirementDetailModal({ req, onClose, onOpenAI }: Props) {
  const patchReq = usePatchRequirement();
  const isArchived = !!req.archivedAt;
  const si = stageIndex(req.stage);
  const showDesign = si >= stageIndex('analyzing');
  const showTasks = si >= stageIndex('development');
  const needsRepo = req.stage === 'analyzing' && req.kind === 'standard';

  const [title, setTitle] = useState(req.title);
  const [description, setDescription] = useState(req.description ?? '');
  const [notes, setNotes] = useState(req.notes ?? '');
  const [priority, setPriority] = useState<Priority>(req.priority);
  const [kind, setKind] = useState<'standard' | 'no_code'>(req.kind);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const defaultTab: DocTab = showTasks ? 'tasks' : showDesign ? 'design' : 'spec';
  const [tab, setTab] = useState<DocTab>(defaultTab);

  useEffect(() => {
    setTitle(req.title);
    setDescription(req.description ?? '');
    setNotes(req.notes ?? '');
    setPriority(req.priority);
    setKind(req.kind);
    setDirty(false);
    setTab(showTasks ? 'tasks' : showDesign ? 'design' : 'spec');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.id]);

  useEffect(() => {
    setDirty(
      title !== req.title ||
      description !== (req.description ?? '') ||
      notes !== (req.notes ?? '') ||
      priority !== req.priority ||
      kind !== req.kind
    );
  }, [title, description, notes, priority, kind, req]);

  const handleSave = () => {
    setSaving(true);
    patchReq.mutate(
      { id: req.id, patch: { title, description, notes, priority, kind } },
      { onSettled: () => setSaving(false) }
    );
  };

  const tabs: { key: DocTab; label: string }[] = [
    { key: 'spec', label: '需求 Spec' },
    ...(showDesign ? [{ key: 'design' as DocTab, label: '设计 Spec' }] : []),
    ...(showTasks ? [{ key: 'tasks' as DocTab, label: '子任务' }] : []),
    { key: 'attachments', label: '附件' },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>

      {/* Top bar */}
      <div style={{
        height: 48, flexShrink: 0, borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
      }}>
        <button
          onClick={onClose}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 13, padding: '4px 8px', borderRadius: 6,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <ChevronLeft size={15} />需求列表
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border-default)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflow: 'hidden' }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
            {req.id}
          </span>
          <ChevronRight size={12} color="var(--text-tertiary)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {req.title}
          </span>
          {isArchived && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
              fontSize: 11, padding: '2px 8px', borderRadius: 6,
              background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)',
              border: '1px solid var(--border-default)',
            }}>
              <Archive size={11} />已归档·只读
            </span>
          )}
        </div>

        {/* Stage pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          {STAGES.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 8, fontWeight: 500, whiteSpace: 'nowrap',
                background: s === req.stage ? 'var(--accent-blue)' : i < si ? 'var(--diff-add-bg)' : 'var(--bg-tertiary)',
                color: s === req.stage ? 'var(--text-inverse)' : i < si ? 'var(--accent-green)' : 'var(--text-tertiary)',
                border: `1px solid ${s === req.stage ? 'transparent' : i < si ? 'var(--accent-green-44)' : 'var(--border-default)'}`,
              }}>
                {STAGE_LABELS[s]}
              </span>
              {i < STAGES.length - 1 && <ChevronRight size={9} color={i < si ? 'var(--accent-green)' : 'var(--border-default)'} />}
            </div>
          ))}
        </div>

        {!isArchived && (
          <button
            onClick={() => onOpenAI(req)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border-default)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
          >
            <Bot size={13} />AI 助理
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: info */}
        <div style={{
          width: 300, flexShrink: 0, borderRight: '1px solid var(--border-default)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          opacity: isArchived ? 0.8 : 1,
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Repo selection (Analyzing + Standard only) */}
            {needsRepo && !isArchived && <ProjectSelector req={req} />}

            <div>
              <label style={labelStyle}>需求标题</label>
              <input value={title} onChange={(e) => !isArchived && setTitle(e.target.value)}
                readOnly={isArchived} style={{ ...inputStyle, cursor: isArchived ? 'default' : 'text' }}
                onFocus={(e) => { if (!isArchived) (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--accent-blue)'; }}
                onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--border-default)'; }}
              />
            </div>

            <div>
              <label style={labelStyle}>优先级</label>
              <div style={{ display: 'flex', gap: 5 }}>
                {PRIORITY_OPTIONS.map((p) => (
                  <button key={p} onClick={() => !isArchived && setPriority(p)}
                    disabled={isArchived}
                    style={{
                      flex: 1, padding: '5px 2px', borderRadius: 6,
                      cursor: isArchived ? 'default' : 'pointer', fontSize: 11, fontWeight: 500,
                      border: `1px solid ${priority === p ? PRIORITY_COLOR[p] : 'var(--border-default)'}`,
                      background: priority === p ? `${PRIORITY_COLOR[p]}18` : 'var(--bg-secondary)',
                      color: priority === p ? PRIORITY_COLOR[p] : 'var(--text-tertiary)',
                    }}>
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>需求类型</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {KIND_OPTIONS.map((opt) => (
                  <button key={opt.value} onClick={() => !isArchived && setKind(opt.value)}
                    disabled={isArchived}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: 6,
                      cursor: isArchived ? 'default' : 'pointer', fontSize: 12,
                      border: `1px solid ${kind === opt.value ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                      background: kind === opt.value ? 'var(--accent-blue-10)' : 'var(--bg-secondary)',
                      color: kind === opt.value ? 'var(--accent-blue)' : 'var(--text-secondary)',
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>需求描述</label>
              <textarea value={description} onChange={(e) => !isArchived && setDescription(e.target.value)}
                readOnly={isArchived} rows={5} placeholder={isArchived ? '' : '描述需求背景、目标和验收条件...'}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, cursor: isArchived ? 'default' : 'text' }}
                onFocus={(e) => { if (!isArchived) (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--accent-blue)'; }}
                onBlur={(e) => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--border-default)'; }}
              />
            </div>

            <div>
              <label style={labelStyle}>备注</label>
              <textarea value={notes} onChange={(e) => !isArchived && setNotes(e.target.value)}
                readOnly={isArchived} rows={3} placeholder={isArchived ? '' : '补充说明、相关链接...'}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, cursor: isArchived ? 'default' : 'text' }}
                onFocus={(e) => { if (!isArchived) (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--accent-blue)'; }}
                onBlur={(e) => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--border-default)'; }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <MetaRow label="创建时间" value={new Date(req.createdAt).toLocaleDateString('zh-CN')} />
              {req.archivedAt && <MetaRow label="归档时间" value={new Date(req.archivedAt).toLocaleDateString('zh-CN')} color="var(--text-tertiary)" />}
              {req.plannedReleaseDate && <MetaRow label="计划发布" value={new Date(req.plannedReleaseDate).toLocaleDateString('zh-CN')} />}
              {req.releasedAt && <MetaRow label="发布时间" value={new Date(req.releasedAt).toLocaleDateString('zh-CN')} color="var(--accent-green)" />}
              {req.projects.length > 0 && (
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>关联仓库</span>
                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {req.projects.map(p => (
                      <div key={p.project} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <GitGraph size={11} color="var(--accent-blue)" />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.project}</span>
                        {p.isPrimary && <span style={{ fontSize: 10, color: 'var(--accent-green)', background: 'var(--diff-add-bg)', padding: '1px 4px', borderRadius: 3 }}>主</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {!isArchived && dirty && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-default)', background: 'var(--bg-secondary)', display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 1, padding: '7px', borderRadius: 6, border: 'none',
                background: saving ? 'var(--bg-disabled)' : 'var(--accent-blue)',
                color: saving ? 'var(--text-tertiary)' : 'var(--text-inverse)',
                cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                <Save size={13} />{saving ? '保存中...' : '保存修改'}
              </button>
              <button
                onClick={() => { setTitle(req.title); setDescription(req.description ?? ''); setNotes(req.notes ?? ''); setPriority(req.priority); setKind(req.kind); }}
                style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}
              >
                取消
              </button>
            </div>
          )}
        </div>

        {/* Right: doc tabs */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border-default)',
            padding: '0 16px', background: 'var(--bg-secondary)', flexShrink: 0,
          }}>
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '10px 16px', background: 'transparent', border: 'none',
                borderBottom: `2px solid ${tab === t.key ? 'var(--accent-blue)' : 'transparent'}`,
                color: tab === t.key ? 'var(--accent-blue)' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
                marginBottom: -1, transition: 'all 0.12s', whiteSpace: 'nowrap',
              }}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {tab === 'spec' && <RequirementSpecEditor reqId={req.id} readonly={isArchived} />}
            {tab === 'design' && showDesign && <DesignSpecEditor reqId={req.id} readonly={isArchived} />}
            {tab === 'tasks' && showTasks && <SubTaskPanel reqId={req.id} />}
            {tab === 'attachments' && (
              <div style={{ height: '100%', overflowY: 'auto', padding: '16px' }}>
                <AttachmentsPanel reqId={req.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: color ?? 'var(--text-secondary)' }}>{value}</span>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
  marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', background: 'var(--bg-secondary)',
  border: '1px solid var(--border-default)', borderRadius: 6,
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.12s',
};
