import { RefreshCw } from 'lucide-react';
import { useSubTasks } from '../api/hooks';
import type { SubTask } from '@devflow/shared';

const STATUS_STYLE: Record<string, { color: string; label: string; spinning?: boolean }> = {
  pending:   { color: 'var(--text-tertiary)', label: '待处理' },
  ready:     { color: 'var(--accent-blue)', label: '就绪' },
  running:   { color: 'var(--accent-orange)', label: '运行中', spinning: true },
  done:      { color: 'var(--accent-green)', label: '完成' },
  error:     { color: 'var(--accent-red)', label: '错误' },
  cancelled: { color: 'var(--text-tertiary)', label: '已取消' },
};

const TYPE_COLORS: Record<string, string> = {
  impl:   'var(--accent-blue)',
  test:   'var(--accent-green)',
  review: 'var(--accent-orange)',
  deploy: 'var(--accent-purple)',
  docs:   'var(--accent-cyan)',
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
  return (
    <span style={{
      fontSize: 10,
      color: s.color,
      background: `${s.color}22`,
      border: `1px solid ${s.color}44`,
      padding: '2px 7px',
      borderRadius: 10,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
    }}>
      {s.spinning && <RefreshCw size={10} style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }} />}
      {s.label}
    </span>
  );
}

function TaskRow({ task }: { task: SubTask }) {
  const typeColor = TYPE_COLORS[task.type] ?? 'var(--text-tertiary)';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      borderRadius: 6,
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-default)',
      marginBottom: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
        </div>
        {task.errorMessage && (
          <div style={{ fontSize: 11, color: 'var(--accent-red)', marginTop: 2 }}>{task.errorMessage.slice(0, 100)}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {task.project && (
          <span style={{
            fontSize: 10,
            color: 'var(--accent-blue)',
            background: 'var(--bg-primary)',
            padding: '2px 7px',
            borderRadius: 10,
            border: '1px solid var(--border-default)',
          }}>
            {task.project}
          </span>
        )}
        <span style={{
          fontSize: 10,
          color: typeColor,
          background: `${typeColor}22`,
          padding: '2px 7px',
          borderRadius: 10,
          border: `1px solid ${typeColor}44`,
        }}>
          {task.type}
        </span>
        <StatusBadge status={task.status} />
      </div>
    </div>
  );
}

export function SubTaskPanel({ reqId }: { reqId: string }) {
  const { data: tasks = [], isLoading } = useSubTasks(reqId);

  // Group by wave
  const waveMap = new Map<number, SubTask[]>();
  for (const t of tasks) {
    if (!waveMap.has(t.wave)) waveMap.set(t.wave, []);
    waveMap.get(t.wave)!.push(t);
  }
  const waves = [...waveMap.entries()].sort(([a], [b]) => a - b);

  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const running = tasks.filter(t => t.status === 'running').length;
  const errored = tasks.filter(t => t.status === 'error').length;

  return (
    <div style={{ padding: 16, background: 'var(--bg-primary)', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>任务进度</div>
        {total > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', gap: 12 }}>
            <span>共 <span style={{ color: 'var(--text-primary)' }}>{total}</span> 个</span>
            <span style={{ color: 'var(--accent-green)' }}>{done} 完成</span>
            {running > 0 && <span style={{ color: 'var(--accent-orange)' }}>{running} 运行中</span>}
            {errored > 0 && <span style={{ color: 'var(--accent-red)' }}>{errored} 失败</span>}
          </div>
        )}
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32, fontSize: 13 }}>加载中...</div>
      )}

      {!isLoading && tasks.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32, fontSize: 13 }}>
          暂无任务，请先选择分析方案
        </div>
      )}

      {waves.map(([waveNum, waveTasks]) => (
        <div key={waveNum} style={{ marginBottom: 20 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--accent-blue)',
              background: 'var(--bg-primary)',
              padding: '3px 10px',
              borderRadius: 10,
              border: '1px solid var(--border-default)',
            }}>
              Wave {waveNum}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              {waveTasks.filter(t => t.status === 'done').length}/{waveTasks.length} 完成
            </span>
          </div>

          {waveTasks.map(t => <TaskRow key={t.id} task={t} />)}
        </div>
      ))}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
