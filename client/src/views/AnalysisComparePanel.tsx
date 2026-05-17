import { useState } from 'react';
import { RefreshCw, Plus } from 'lucide-react';
import { useAnalyses, useStartAnalysis, useChooseAnalysis, useCancelAnalysis } from '../api/hooks';
import type { RequirementAnalysis } from '@devflow/shared';

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--accent-orange)',
  awaiting: 'var(--accent-blue)',
  done: 'var(--accent-green)',
  error: 'var(--accent-red)',
  cancelled: 'var(--text-secondary)',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'var(--text-secondary)';
  return (
    <span style={{
      fontSize: 11,
      color,
      background: `${color}22`,
      border: `1px solid ${color}44`,
      padding: '2px 8px',
      borderRadius: 10,
      fontWeight: 600,
    }}>
      {status === 'running' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><RefreshCw size={11} /> 分析中</span> : status === 'awaiting' ? '等待选择' : status === 'done' ? '已选择' : status === 'error' ? '错误' : '已取消'}
    </span>
  );
}

function AnalysisCard({
  analysis,
  onChoose,
  onCancel,
}: {
  analysis: RequirementAnalysis;
  onChoose: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-default)',
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>{analysis.agent}</span>
        <StatusBadge status={analysis.status} />
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {new Date(analysis.createdAt).toLocaleTimeString()}
        </span>
      </div>

      {analysis.status === 'running' && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 12, fontStyle: 'italic', marginBottom: 8 }}>Agent 正在分析需求...</div>
      )}

      {analysis.output && (
        <>
          <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>
            {analysis.output.summary}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
            建议任务数: <span style={{ color: 'var(--accent-blue)', fontWeight: 600 }}>{analysis.output.proposedTasks.length}</span>
          </div>

          {expanded && (
            <div style={{ marginBottom: 12 }}>
              {analysis.output.proposedTasks.map((t, i) => (
                <div key={i} style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 4,
                  padding: '8px 12px',
                  marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{t.title}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3 }}>
                      Wave {t.wave}
                    </span>
                    {t.project && (
                      <span style={{ fontSize: 10, color: 'var(--accent-blue)', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3 }}>
                        {t.project}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3 }}>
                      {t.type}
                    </span>
                  </div>
                  {t.acceptance.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      验收: {t.acceptance.slice(0, 2).join(' · ')}{t.acceptance.length > 2 ? '...' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              fontSize: 11,
              padding: '3px 10px',
              marginBottom: 10,
            }}
          >
            {expanded ? '收起详情' : '查看任务详情'}
          </button>
        </>
      )}

      {analysis.errorMessage && (
        <div style={{ color: 'var(--accent-red)', fontSize: 12, marginBottom: 10 }}>{analysis.errorMessage}</div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {analysis.status === 'awaiting' && (
          <button
            onClick={() => onChoose(analysis.id)}
            style={{
              padding: '6px 16px',
              background: 'var(--accent-blue)',
              border: 'none',
              borderRadius: 4,
              color: 'var(--text-inverse)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            选择此方案
          </button>
        )}
        {analysis.status === 'running' && (
          <button
            onClick={() => onCancel(analysis.id)}
            style={{
              padding: '6px 14px',
              background: 'var(--diff-del-bg)',
              border: '1px solid var(--accent-red-44)',
              borderRadius: 4,
              color: 'var(--accent-red)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}

export function AnalysisComparePanel({ reqId, onChosen }: { reqId: string; onChosen?: () => void }) {
  const { data: analyses = [] } = useAnalyses(reqId);
  const startAnalysis = useStartAnalysis();
  const chooseAnalysis = useChooseAnalysis();
  const cancelAnalysis = useCancelAnalysis();
  const [customPrompt, setCustomPrompt] = useState('');

  const handleStart = () => {
    startAnalysis.mutate({
      reqId,
      agents: ['claude-code'],
      prompt: customPrompt || undefined,
    });
    setCustomPrompt('');
  };

  const handleChoose = (id: string) => {
    chooseAnalysis.mutate({ id }, {
      onSuccess: () => onChosen?.(),
    });
  };

  const handleCancel = (id: string) => {
    cancelAnalysis.mutate({ id, reqId });
  };

  return (
    <div style={{ padding: 16, background: 'var(--bg-primary)', height: '100%', overflowY: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', marginBottom: 4 }}>分析方案对比</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>启动并行分析，选择最佳任务拆解方案</div>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexDirection: 'column' }}>
        <textarea
          value={customPrompt}
          onChange={e => setCustomPrompt(e.target.value)}
          placeholder="可选：自定义分析提示词（留空使用默认）"
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 12,
            resize: 'vertical',
            minHeight: 60,
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleStart}
          disabled={startAnalysis.isPending}
          style={{
            padding: '8px 16px',
            background: startAnalysis.isPending ? 'var(--bg-disabled)' : 'var(--accent-blue)',
            border: 'none',
            borderRadius: 4,
            color: 'var(--text-inverse)',
            cursor: startAnalysis.isPending ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            alignSelf: 'flex-start',
          }}
        >
          {startAnalysis.isPending ? '启动中...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Plus size={12} /> 启动新分析</span>}
        </button>
      </div>

      {analyses.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 32, fontSize: 13 }}>
          暂无分析，点击上方按钮启动
        </div>
      )}

      {analyses.map(a => (
        <AnalysisCard
          key={a.id}
          analysis={a}
          onChoose={handleChoose}
          onCancel={handleCancel}
        />
      ))}
    </div>
  );
}
