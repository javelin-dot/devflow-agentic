import type { SpecStreamParts } from '../lib/consumeSpecSse';

interface SpecGenerateStreamPanelProps {
  generating: boolean;
  stream: SpecStreamParts;
  genLog?: string;
}

export function SpecGenerateStreamPanel({ generating, stream, genLog }: SpecGenerateStreamPanelProps) {
  const hasThinking = !!stream.thinking.trim();
  const hasOutput = !!stream.assistant.trim();
  const statusLabel = stream.toolStatus
    ? stream.toolStatus
    : hasThinking && !hasOutput
      ? '思考中…'
      : generating
        ? '生成中…'
        : '预览';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden', minHeight: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, flexShrink: 0 }}>
        {statusLabel}
      </div>

      {hasThinking && (
        <details open style={{ marginBottom: 10, flexShrink: 0 }}>
          <summary style={{ fontSize: 12, color: 'var(--accent-orange)', cursor: 'pointer', userSelect: 'none' }}>
            思考过程
          </summary>
          <pre style={{
            margin: '6px 0 0', maxHeight: 140, overflow: 'auto', padding: 10,
            background: 'var(--bg-tertiary)', borderRadius: 6, border: '1px solid var(--border-default)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', fontFamily: 'inherit',
          }}>
            {stream.thinking}
          </pre>
        </details>
      )}

      <pre style={{
        flex: 1, margin: 0, overflow: 'auto', padding: 12,
        background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border-default)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)', fontFamily: 'inherit',
      }}>
        {hasOutput ? stream.assistant : (generating ? '等待 AI 输出…' : '')}
      </pre>

      {genLog && !generating && (
        <div style={{
          marginTop: 8, fontSize: 12, flexShrink: 0,
          color: genLog.startsWith('生成失败') || genLog.startsWith('请求') ? 'var(--accent-red)' : 'var(--accent-green)',
        }}>
          {genLog}
        </div>
      )}
    </div>
  );
}
