import { useEffect, useRef, useState } from 'react';
import { Square } from 'lucide-react';
import type { SpecStreamParts } from '../lib/consumeSpecSse';

interface SpecGenerateStreamPanelProps {
  generating: boolean;
  stream: SpecStreamParts;
  genLog?: string;
  onCancel?: () => void;
}

function charCount(parts: SpecStreamParts): number {
  return parts.thinking.length + parts.assistant.length;
}

export function SpecGenerateStreamPanel({ generating, stream, genLog, onCancel }: SpecGenerateStreamPanelProps) {
  const outputRef = useRef<HTMLPreElement>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAt = useRef<number | null>(null);

  const hasThinking = !!stream.thinking.trim();
  const hasOutput = !!stream.assistant.trim();
  const chars = charCount(stream);

  useEffect(() => {
    if (!generating) {
      startedAt.current = null;
      setElapsedSec(0);
      return;
    }
    startedAt.current = Date.now();
    const iv = setInterval(() => {
      if (startedAt.current) {
        setElapsedSec(Math.floor((Date.now() - startedAt.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [generating]);

  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [stream.assistant, stream.thinking, stream.toolStatus]);

  const statusLabel = stream.toolStatus
    ? stream.toolStatus
    : hasThinking && !hasOutput
      ? '思考中…'
      : hasOutput
        ? `正在写入文档…（${chars} 字）`
        : generating
          ? '连接 AI，读取仓库…'
          : '预览';

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden', minHeight: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8, flexShrink: 0, gap: 8,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {generating ? 'AI 正在生成 Spec' : '生成预览'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {statusLabel}
            {generating && elapsedSec > 0 && ` · 已用时 ${elapsedSec}s`}
          </div>
        </div>
        {generating && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--accent-red)', background: 'transparent',
              color: 'var(--accent-red)', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}
          >
            <Square size={12} fill="currentColor" />
            停止生成
          </button>
        )}
      </div>

      {hasThinking && (
        <details open style={{ marginBottom: 10, flexShrink: 0 }}>
          <summary style={{ fontSize: 12, color: 'var(--accent-orange)', cursor: 'pointer', userSelect: 'none' }}>
            思考过程（{stream.thinking.length} 字）
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

      <pre
        ref={outputRef}
        style={{
          flex: 1, margin: 0, overflow: 'auto', padding: 12,
          background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border-default)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)', fontFamily: 'inherit',
        }}
      >
        {hasOutput ? stream.assistant : (generating ? '等待文档正文输出…' : '')}
      </pre>

      {genLog && (
        <div style={{
          marginTop: 8, fontSize: 12, flexShrink: 0,
          color: genLog.startsWith('生成失败') || genLog.startsWith('请求')
            ? 'var(--accent-red)'
            : genLog === '已停止生成'
              ? 'var(--text-secondary)'
              : 'var(--accent-green)',
        }}>
          {genLog}
        </div>
      )}
    </div>
  );
}
