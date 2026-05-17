import { useState } from 'react';
import { Bot, Plus } from 'lucide-react';
import { UiSelect } from '../components/ui';
import { useDefects, useCreateDefect, usePatchDefect, useDefectStatusHistory, useAssignAgentFix } from '../api/hooks';
import type { Defect, DefectSeverity, DefectStatus } from '@devflow/shared';

const SEVERITY_COLORS: Record<DefectSeverity, string> = {
  P0: 'var(--accent-red)',
  P1: 'var(--accent-orange)',
  P2: 'var(--accent-blue)',
  P3: 'var(--text-tertiary)',
};

const STATUS_COLORS: Record<DefectStatus, string> = {
  pending_confirm: 'var(--accent-red)',
  to_fix: 'var(--accent-orange)',
  to_regress: 'var(--accent-blue)',
  closed: 'var(--accent-green)',
  wont_fix: 'var(--text-tertiary)',
};

const STATUS_LABELS: Record<DefectStatus, string> = {
  pending_confirm: '待确认',
  to_fix: '待修复',
  to_regress: '待回归',
  closed: '已关闭',
  wont_fix: '不处理',
};

const STATUS_TRANSITIONS: Record<DefectStatus, Array<{ status: DefectStatus; label: string }>> = {
  pending_confirm: [
    { status: 'to_fix', label: '确认修复' },
    { status: 'wont_fix', label: '不处理' },
  ],
  to_fix: [
    { status: 'to_regress', label: '提交修复' },
  ],
  to_regress: [
    { status: 'closed', label: '回归通过' },
    { status: 'to_fix', label: '回归失败' },
  ],
  closed: [
    { status: 'to_fix', label: '重新打开' },
  ],
  wont_fix: [
    { status: 'to_fix', label: '重新打开' },
  ],
};

function SeverityBadge({ severity }: { severity: DefectSeverity }) {
  return (
    <span style={{
      background: SEVERITY_COLORS[severity] ?? 'var(--text-tertiary)',
      color: 'var(--text-inverse)',
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 700,
      minWidth: 30,
      textAlign: 'center',
      display: 'inline-block',
    }}>{severity}</span>
  );
}

function StatusBadge({ status }: { status: DefectStatus }) {
  return (
    <span style={{
      background: STATUS_COLORS[status] ?? 'var(--text-tertiary)',
      color: 'var(--text-inverse)',
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 600,
      display: 'inline-block',
    }}>{STATUS_LABELS[status] ?? status}</span>
  );
}

interface NewDefectFormProps {
  reqId: string;
  onCreated: () => void;
  onCancel: () => void;
}

function NewDefectForm({ reqId, onCreated, onCancel }: NewDefectFormProps) {
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<DefectSeverity>('P2');
  const [description, setDescription] = useState('');
  const createDefect = useCreateDefect();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createDefect.mutateAsync({ reqId, title: title.trim(), severity, description });
    onCreated();
  };

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} style={{
      background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, marginBottom: 16,
      border: '1px solid var(--accent-blue)', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>新建缺陷</div>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="缺陷标题..."
        required
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-primary)', padding: '6px 10px', fontSize: 13 }}
      />
      <UiSelect
        value={severity}
        onChange={v => setSeverity(v as DefectSeverity)}
        options={[
          { value: 'P0', label: 'P0 - 致命' },
          { value: 'P1', label: 'P1 - 严重' },
          { value: 'P2', label: 'P2 - 一般' },
          { value: 'P3', label: 'P3 - 轻微' },
        ]}
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="缺陷描述（可选）..."
        rows={3}
        style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-primary)', padding: '6px 10px', fontSize: 13, resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="submit"
          disabled={createDefect.isPending}
          style={{ background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)', padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}
        >提交</button>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: 'var(--bg-tertiary)', border: 'none', borderRadius: 4, color: 'var(--text-primary)', padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}
        >取消</button>
      </div>
    </form>
  );
}

interface DefectRowProps {
  defect: Defect;
}

function DefectRow({ defect }: DefectRowProps) {
  const [expanded, setExpanded] = useState(false);
  const patchDefect = usePatchDefect();
  const assignAgent = useAssignAgentFix();
  const { data: history = [] } = useDefectStatusHistory(expanded ? defect.id : '');

  const handleTransition = async (nextStatus: DefectStatus) => {
    const patch: Partial<Defect> = { status: nextStatus };
    if (nextStatus === 'wont_fix' && !defect.wontFixReason) {
      patch.wontFixReason = 'other';
    }
    await patchDefect.mutateAsync({ id: defect.id, reqId: defect.reqId, patch });
  };

  const transitions = STATUS_TRANSITIONS[defect.status] ?? [];

  return (
    <div style={{
      background: 'var(--bg-secondary)', borderRadius: 6, padding: '10px 14px',
      marginBottom: 8, border: '1px solid var(--bg-tertiary)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SeverityBadge severity={defect.severity} />
        <StatusBadge status={defect.status} />
        <span
          onClick={() => setExpanded(v => !v)}
          style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}
        >{defect.title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{defect.createdAt.slice(0, 10)}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          {/* Description */}
          {defect.description && (
            <div style={{ padding: '6px 10px', background: 'var(--bg-primary)', borderRadius: 4, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', marginBottom: 10 }}>
              {defect.description}
            </div>
          )}

          {/* Status transition buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {transitions.map(t => (
              <button
                key={t.status}
                onClick={() => { void handleTransition(t.status); }}
                disabled={patchDefect.isPending}
                style={{
                  background: STATUS_COLORS[t.status] ?? 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: 4,
                  color: 'var(--text-inverse)',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >{t.label}</button>
            ))}
            {defect.status !== 'closed' && (
              <button
                onClick={() => { void handleTransition('closed'); }}
                disabled={patchDefect.isPending}
                style={{
                  background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
                  borderRadius: 4, color: 'var(--text-secondary)', padding: '4px 10px',
                  cursor: 'pointer', fontSize: 12,
                }}
              >直接关闭</button>
            )}
            <button
              onClick={() => { void assignAgent.mutateAsync({ id: defect.id, reqId: defect.reqId }); }}
              disabled={assignAgent.isPending}
              style={{
                background: 'var(--accent-blue)', border: 'none', borderRadius: 4,
                color: 'var(--text-inverse)', padding: '4px 10px', cursor: 'pointer', fontSize: 12,
              }}
            >{assignAgent.isPending ? '指派中...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Bot size={14} /> 指派 Agent 修复</span>}</button>
          </div>

          {/* Status history timeline */}
          {history.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>状态变更历史:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.map((h, i) => (
                  <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-tertiary)', minWidth: 140 }}>{new Date(h.createdAt).toLocaleString('zh-CN')}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>{h.fromStatus ? STATUS_LABELS[h.fromStatus as DefectStatus] ?? h.fromStatus : '创建'}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>→</span>
                    <StatusBadge status={h.toStatus as DefectStatus} />
                    <span style={{ color: 'var(--text-tertiary)' }}>{h.actor}</span>
                    {h.note && <span style={{ color: 'var(--text-tertiary)' }}>({h.note})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {defect.wontFixReason && (
            <div style={{ padding: '4px 10px', background: 'var(--bg-tertiary)', borderRadius: 4, fontSize: 12, color: 'var(--text-tertiary)' }}>
              不处理原因: {defect.wontFixReason}
            </div>
          )}

          {assignAgent.data && (
            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 4, background: assignAgent.data.success ? 'var(--scan-success-bg)' : 'var(--diff-del-bg)', color: 'var(--text-inverse)', fontSize: 12 }}>
              <div>Agent 结果: {assignAgent.data.success ? '成功' : '失败'} → {STATUS_LABELS[assignAgent.data.status as DefectStatus] ?? assignAgent.data.status}</div>
              {assignAgent.data.reason && <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{assignAgent.data.reason}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DefectListPanel({ reqId: initialReqId }: { reqId?: string }) {
  const [reqId, setReqId] = useState(initialReqId ?? '');
  const [showNewForm, setShowNewForm] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [wontFixReasonFilter, setWontFixReasonFilter] = useState<string>('all');

  const { data: defects = [] } = useDefects(reqId || undefined);

  const filtered = defects.filter(d => {
    if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (wontFixReasonFilter !== 'all' && d.wontFixReason !== wontFixReasonFilter) return false;
    return true;
  });

  const btn = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--accent-blue)' : 'var(--bg-secondary)',
    border: '1px solid ' + (active ? 'var(--accent-blue)' : 'var(--bg-tertiary)'),
    borderRadius: 4,
    color: active ? 'var(--text-inverse)' : 'var(--text-secondary)',
    padding: '3px 10px',
    cursor: 'pointer',
    fontSize: 12,
  });

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>缺陷管理</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>需求ID:</span>
          <input
            value={reqId}
            onChange={e => setReqId(e.target.value)}
            placeholder="输入需求ID..."
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-primary)', padding: '4px 10px', fontSize: 13, width: 200 }}
          />
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowNewForm(v => !v)}
            style={{ background: 'var(--accent-blue)', border: 'none', borderRadius: 4, color: 'var(--text-inverse)', padding: '5px 14px', cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          ><Plus size={14} /> 新建缺陷</button>
        </div>
      </div>

      {showNewForm && reqId && (
        <NewDefectForm
          reqId={reqId}
          onCreated={() => setShowNewForm(false)}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      {/* Filter row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginRight: 4 }}>严重程度:</span>
        {(['all', 'P0', 'P1', 'P2', 'P3'] as const).map(s => (
          <button key={s} onClick={() => setSeverityFilter(s)} style={btn(severityFilter === s)}>{s === 'all' ? '全部' : s}</button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 12, marginRight: 4 }}>状态:</span>
        {(['all', 'pending_confirm', 'to_fix', 'to_regress', 'wont_fix'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={btn(statusFilter === s)}>
            {s === 'all' ? '全部' : STATUS_LABELS[s] ?? s}
          </button>
        ))}
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 12, marginRight: 4 }}>不处理原因:</span>
        {(['all', 'data_issue', 'product_decision', 'duplicate', 'cannot_reproduce', 'other'] as const).map(s => (
          <button key={s} onClick={() => setWontFixReasonFilter(s)} style={btn(wontFixReasonFilter === s)}>
            {s === 'all' ? '全部' : s}
          </button>
        ))}
      </div>

      {!reqId && (
        <div style={{ color: 'var(--text-tertiary)', padding: 24 }}>请输入需求ID以查看缺陷</div>
      )}

      {reqId && filtered.length === 0 && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 16, textAlign: 'center' }}>暂无符合条件的缺陷</div>
      )}

      {filtered.map(defect => (
        <DefectRow key={defect.id} defect={defect} />
      ))}

      {reqId && defects.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'right' }}>
          共 {defects.length} 条缺陷，显示 {filtered.length} 条
        </div>
      )}
    </div>
  );
}
