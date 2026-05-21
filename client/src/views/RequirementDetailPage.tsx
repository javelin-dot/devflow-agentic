import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Save, Bot, Archive, GitGraph, Check, ChevronDown, PanelLeftOpen } from 'lucide-react';
import { STAGE_LABELS } from '@devflow/shared';
import type { Requirement, Stage, Priority } from '@devflow/shared';
import { useRequirement, usePatchRequirement, useProjects, useDocuments, useDocumentVersions } from '../api/hooks';
import { VersionSelector } from '../components/VersionSelector';
import { RequirementSpecEditor } from '../components/RequirementSpecEditor';
import { DesignSpecEditor } from '../components/DesignSpecEditor';
import type { RequirementSpecEditorRef } from '../components/RequirementSpecEditor';
import type { DesignSpecEditorRef } from '../components/DesignSpecEditor';
import { SubTaskPanel } from './SubTaskPanel';
import { AttachmentsPanel } from '../components/AttachmentsPanel';
import { UiEmptyState } from '../components/ui';

const STAGE_CONFIG_LABELS: Record<string, string> = {
  backlog: 'Backlog', analyzing: 'Analyzing', development: 'Dev',
  uat: 'UAT', prerelease: 'Pre', released: 'Done',
};

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

function ProjectSelector({ req }: { req: Requirement }) {
  const { data: allProjects = [] } = useProjects();
  const patchReq = usePatchRequirement();
  const linkedNames = new Set(req.projects.map(p => p.project));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggle = (name: string) => {
    const isLinked = linkedNames.has(name);
    const next = isLinked
      ? req.projects.filter(p => p.project !== name)
      : [...req.projects, { project: name, isPrimary: req.projects.length === 0, devBranch: null, uatBranch: null }];
    setSaving(true);
    patchReq.mutate(
      { id: req.id, patch: { projects: next.map((p, i) => ({ project: p.project, isPrimary: i === 0, devBranch: p.devBranch ?? null, uatBranch: p.uatBranch ?? null })) } },
      { onSettled: () => setSaving(false) }
    );
  };

  const selected = req.projects.map(p => p.project);

  return (
    <div>
      <label style={labelStyle}>关联代码仓库</label>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => !saving && setOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 10px', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer',
            border: `1px solid ${open ? 'var(--accent-blue)' : 'var(--border-default)'}`,
            background: 'var(--bg-secondary)', color: selected.length ? 'var(--text-primary)' : 'var(--text-tertiary)',
            fontSize: 13, textAlign: 'left', boxSizing: 'border-box',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {selected.length === 0 ? '请选择代码仓库...' : selected.join('、')}
          </span>
          <ChevronDown size={13} style={{ flexShrink: 0, marginLeft: 6, opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
            background: 'var(--bg-secondary)', border: '1px solid var(--border-default)',
            borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
          }}>
            {allProjects.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                暂无可用仓库，请先在「代码仓库」中配置
              </div>
            ) : (
              allProjects.map(proj => {
                const linked = linkedNames.has(proj.name);
                const isPrimary = req.projects.find(p => p.project === proj.name)?.isPrimary;
                return (
                  <button
                    key={proj.name}
                    onClick={() => toggle(proj.name)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', cursor: 'pointer', textAlign: 'left',
                      background: linked ? 'var(--accent-blue-10)' : 'transparent',
                      border: 'none', borderBottom: '1px solid var(--border-default)',
                      color: 'var(--text-primary)',
                    }}
                    onMouseEnter={(e) => { if (!linked) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { if (!linked) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  >
                    <div style={{
                      width: 15, height: 15, borderRadius: 3, flexShrink: 0,
                      border: `2px solid ${linked ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                      background: linked ? 'var(--accent-blue)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {linked && <Check size={9} color="#fff" />}
                    </div>
                    <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: linked ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                      {proj.name}
                    </span>
                    {isPrimary && (
                      <span style={{ fontSize: 10, color: 'var(--accent-green)', background: 'var(--diff-add-bg)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>主</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function RequirementDetailPage() {
  const { reqId } = useParams<{ reqId: string }>();
  const navigate = useNavigate();
  const { data: req, isLoading, isError } = useRequirement(reqId || '');
  const patchReq = usePatchRequirement();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [kind, setKind] = useState<'standard' | 'no_code'>('standard');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<DocTab>('spec');

  const [specPreviewVersion, setSpecPreviewVersion] = useState<number | null>(null);
  const [designPreviewVersion, setDesignPreviewVersion] = useState<number | null>(null);

  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sidebarWidthRef = useRef(280);

  const specRef = useRef<RequirementSpecEditorRef>(null);
  const designRef = useRef<DesignSpecEditorRef>(null);

  const { data: specDocs = [] } = useDocuments({ reqId: req?.id ?? '', type: 'requirement_spec' });
  const { data: designDocs = [] } = useDocuments({ reqId: req?.id ?? '', type: 'design_spec' });
  const specDoc = specDocs[0];
  const designDoc = designDocs[0];
  const { data: specVersions = [] } = useDocumentVersions(specDoc?.id ?? '');
  const { data: designVersions = [] } = useDocumentVersions(designDoc?.id ?? '');

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      const newWidth = Math.max(40, Math.min(480, e.clientX));
      setSidebarWidth(newWidth);
    };
    const handleUp = () => {
      setDragging(false);
      if (sidebarWidthRef.current < 60) {
        setSidebarCollapsed(true);
        setSidebarWidth(280);
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (!req) return;
    setTitle(req.title);
    setDescription(req.description ?? '');
    setNotes(req.notes ?? '');
    setPriority(req.priority);
    setKind(req.kind);
    setDirty(false);
    const si = stageIndex(req.stage);
    const showDesign = si >= stageIndex('analyzing');
    const showTasks = si >= stageIndex('development');
    setTab(showTasks ? 'tasks' : showDesign ? 'design' : 'spec');
  }, [req?.id]);

  useEffect(() => {
    if (!req) return;
    setDirty(
      title !== req.title ||
      description !== (req.description ?? '') ||
      notes !== (req.notes ?? '') ||
      priority !== req.priority ||
      kind !== req.kind
    );
  }, [title, description, notes, priority, kind, req]);

  if (isLoading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>加载中...</div>
      </div>
    );
  }

  if (isError || !req) {
    return (
      <div style={{ height: '100%', background: 'var(--bg-primary)', padding: 24 }}>
        <UiEmptyState title="需求不存在" description="该需求可能已被删除或编号有误" />
      </div>
    );
  }

  const isArchived = !!req.archivedAt;
  const si = stageIndex(req.stage);
  const showDesign = si >= stageIndex('analyzing');
  const showTasks = si >= stageIndex('development');
  const showProjectSelector = kind === 'standard' && !isArchived;

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

  const activeDoc = tab === 'spec' ? specDoc : tab === 'design' ? designDoc : null;
  const activeVersions = tab === 'spec' ? specVersions : tab === 'design' ? designVersions : [];
  const activePreviewVersion = tab === 'spec' ? specPreviewVersion : tab === 'design' ? designPreviewVersion : null;
  const setActivePreviewVersion = (v: number | null) => {
    if (tab === 'spec') setSpecPreviewVersion(v);
    else if (tab === 'design') setDesignPreviewVersion(v);
  };
  const activeLatestVersion = activeDoc?.currentVersion ?? 0;
  const activeCurrentVersion = activePreviewVersion ?? activeLatestVersion;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Top bar */}
      <div style={{
        height: 48, flexShrink: 0, borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12,
      }}>
        <button
          onClick={() => navigate('/board')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 13, padding: '4px 8px', borderRadius: 6,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <ChevronLeft size={15} />返回看板
        </button>

        <div style={{ width: 1, height: 16, background: 'var(--border-default)' }} />

        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
          {req.id}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
          {req.title}
        </span>

        {activeDoc && activeVersions.length > 0 && (
          <VersionSelector
            versions={activeVersions}
            current={activeCurrentVersion}
            latest={activeLatestVersion}
            onSelect={(v) => setActivePreviewVersion(v)}
          />
        )}

        {isArchived ? (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            fontSize: 11, padding: '2px 8px', borderRadius: 6,
            background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)',
            border: '1px solid var(--border-default)',
          }}>
            <Archive size={11} />已归档·只读
          </span>
        ) : (
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 8, fontWeight: 500, flexShrink: 0,
            background: 'var(--accent-blue)', color: 'var(--text-inverse)',
          }}>
            {STAGE_LABELS[req.stage]}
          </span>
        )}

        {!isArchived && (
          <button
            onClick={() => navigate(`/workspace/${req.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border-default)',
              background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 500, flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-blue)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-blue)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'; }}
          >
            <Bot size={13} />研发助手
          </button>
        )}
      </div>

      {/* Stage stepper bar */}
      <div style={{
        height: 36, flexShrink: 0, borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-primary)',
        display: 'flex', alignItems: 'center', padding: '0 16px',
        position: 'relative',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: 560 }}>
          {STAGES.map((s, i) => {
            const isCurrent = s === req.stage;
            const isPast = i < si;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STAGES.length - 1 ? 1 : 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{
                    width: isCurrent ? 10 : isPast ? 7 : 7,
                    height: isCurrent ? 10 : isPast ? 7 : 7,
                    borderRadius: '50%',
                    background: isCurrent ? 'var(--accent-blue)' : isPast ? 'var(--accent-green)' : 'transparent',
                    border: `2px solid ${isCurrent ? 'var(--accent-blue)' : isPast ? 'var(--accent-green)' : 'var(--border-default)'}`,
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 10, whiteSpace: 'nowrap', lineHeight: 1,
                    color: isCurrent ? 'var(--accent-blue)' : isPast ? 'var(--accent-green)' : 'var(--text-tertiary)',
                    fontWeight: isCurrent ? 600 : 400,
                  }}>
                    {STAGE_CONFIG_LABELS[s]}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div style={{
                    flex: 1, height: 1, margin: '0 3px', marginBottom: 10,
                    background: isPast ? 'var(--accent-green)' : 'var(--border-default)',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {sidebarCollapsed ? (
          <div style={{
            width: 44, flexShrink: 0, borderRight: '1px solid var(--border-default)',
            background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', padding: '12px 0', gap: 8,
          }}>
            <button
              onClick={() => { setSidebarCollapsed(false); }}
              title="展开侧边栏"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-tertiary)', padding: 6, borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        ) : (
          <>
            <div style={{
              width: sidebarWidth, flexShrink: 0, borderRight: '1px solid var(--border-default)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              opacity: isArchived ? 0.8 : 1, position: 'relative',
            }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {showProjectSelector && <ProjectSelector req={req} />}

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
                    readOnly={isArchived} rows={4} placeholder={isArchived ? '' : '描述需求背景、目标和验收条件...'}
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

              {!isArchived && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-default)', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(tab === 'spec' || tab === 'design') && (
                    <button
                      onClick={() => {
                        if (tab === 'spec') specRef.current?.generate();
                        else if (tab === 'design') designRef.current?.generate();
                      }}
                      style={{
                        width: '100%', padding: '7px', borderRadius: 6, border: '1px solid var(--accent-blue)',
                        background: 'transparent', color: 'var(--accent-blue)',
                        cursor: 'pointer', fontSize: 13, fontWeight: 500,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-blue-10)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <Bot size={13} />
                      {tab === 'spec'
                        ? (specDoc ? '重新生成需求 Spec' : 'AI 生成需求 Spec')
                        : (designDoc ? '重新生成设计 Spec' : 'AI 生成设计 Spec')}
                    </button>
                  )}
                  {dirty && (
                    <div style={{ display: 'flex', gap: 8 }}>
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
              )}

              {/* Drag handle */}
              <div
                onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
                style={{
                  position: 'absolute', right: 0, top: 0, bottom: 0, width: 4,
                  cursor: 'col-resize', zIndex: 10,
                }}
              />
            </div>
          </>
        )}

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
            {tab === 'spec' && (
              <RequirementSpecEditor
                ref={specRef}
                reqId={req.id}
                readonly={isArchived}
                previewVersion={specPreviewVersion}
                onPreviewVersionChange={setSpecPreviewVersion}
              />
            )}
            {tab === 'design' && showDesign && (
              <DesignSpecEditor
                ref={designRef}
                reqId={req.id}
                readonly={isArchived}
                previewVersion={designPreviewVersion}
                onPreviewVersionChange={setDesignPreviewVersion}
              />
            )}
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
