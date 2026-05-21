import { forwardRef, useImperativeHandle, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DocumentEditor } from './DocumentEditor';
import { useDocuments } from '../api/hooks';
import { consumeSpecSse } from '../lib/consumeSpecSse';
import { authHeaders } from '../api/client';

export interface DesignSpecEditorRef {
  generate: () => void;
}

interface DesignSpecEditorProps {
  reqId: string;
  readonly?: boolean;
  previewVersion?: number | null;
  onPreviewVersionChange?: (v: number | null) => void;
}

export const DesignSpecEditor = forwardRef<DesignSpecEditorRef, DesignSpecEditorProps>((props, ref) => {
  const { reqId, readonly, previewVersion, onPreviewVersionChange } = props;
  const qc = useQueryClient();
  const { data: documents = [] } = useDocuments({ reqId, type: 'design_spec' });
  const [generating, setGenerating] = useState(false);
  const [streamPreview, setStreamPreview] = useState('');
  const [genLog, setGenLog] = useState('');

  const doc = documents[0];

  const handleGenerate = async () => {
    setGenerating(true);
    setStreamPreview('');
    setGenLog('');

    try {
      const resp = await fetch('/api/specs/design/generate', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ reqId }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        setGenLog(`请求失败: HTTP ${resp.status} ${text.slice(0, 200)}`);
        return;
      }

      await consumeSpecSse(resp, {
        onText: setStreamPreview,
        onDone: () => {
          void qc.invalidateQueries({ queryKey: ['documents', { reqId, type: 'design_spec' }] });
          setGenLog('生成完成');
        },
        onError: (message) => setGenLog(`生成失败: ${message}`),
      });
    } catch (err) {
      setGenLog(`请求异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  useImperativeHandle(ref, () => ({ generate: handleGenerate }));

  if (!doc) {
    const showStream = generating || !!streamPreview;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {!showStream && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>暂无设计 Spec</div>
            {genLog && !generating && (
              <div style={{ fontSize: 12, color: genLog.startsWith('生成失败') ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {genLog}
              </div>
            )}
          </div>
        )}
        {showStream && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8, flexShrink: 0 }}>
              {generating ? '流式生成中…' : '预览'}
            </div>
            <pre style={{
              flex: 1, margin: 0, overflow: 'auto', padding: 12,
              background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border-default)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)', fontFamily: 'inherit',
            }}>
              {streamPreview || (generating ? '等待 AI 输出…' : '')}
            </pre>
            {genLog && !generating && (
              <div style={{ marginTop: 8, fontSize: 12, color: genLog.startsWith('生成失败') ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {genLog}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {generating && streamPreview && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)', display: 'flex', gap: 8, flexDirection: 'column' }}>
          <pre style={{
            margin: 0, maxHeight: 120, overflow: 'auto', padding: 8,
            background: 'var(--bg-secondary)', borderRadius: 4, fontSize: 11,
            whiteSpace: 'pre-wrap', color: 'var(--text-secondary)',
          }}>
            {streamPreview.slice(-2000)}
          </pre>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DocumentEditor docId={doc.id} previewVersion={previewVersion} onPreviewVersionChange={onPreviewVersionChange} />
      </div>
    </div>
  );
});
