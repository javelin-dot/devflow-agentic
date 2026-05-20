import { forwardRef, useImperativeHandle, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DocumentEditor } from './DocumentEditor';
import { SpecGenerateStreamPanel } from './SpecGenerateStreamPanel';
import { useDocuments } from '../api/hooks';
import { consumeSpecSse, type SpecStreamParts } from '../lib/consumeSpecSse';

export interface DesignSpecEditorRef {
  generate: () => void;
}

interface DesignSpecEditorProps {
  reqId: string;
  readonly?: boolean;
  previewVersion?: number | null;
  onPreviewVersionChange?: (v: number | null) => void;
}

const EMPTY_STREAM: SpecStreamParts = { thinking: '', assistant: '', toolStatus: '' };

export const DesignSpecEditor = forwardRef<DesignSpecEditorRef, DesignSpecEditorProps>((props, ref) => {
  const { reqId, readonly, previewVersion, onPreviewVersionChange } = props;
  const qc = useQueryClient();
  const { data: documents = [] } = useDocuments({ reqId, type: 'design_spec' });
  const [generating, setGenerating] = useState(false);
  const [stream, setStream] = useState<SpecStreamParts>(EMPTY_STREAM);
  const [genLog, setGenLog] = useState('');

  const doc = documents[0];

  const handleGenerate = async () => {
    setGenerating(true);
    setStream(EMPTY_STREAM);
    setGenLog('');

    try {
      const resp = await fetch('/api/specs/design/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        setGenLog(`请求失败: HTTP ${resp.status} ${text.slice(0, 200)}`);
        return;
      }

      await consumeSpecSse(resp, {
        onStream: setStream,
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

  if (generating || (!doc && (stream.thinking || stream.assistant))) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <SpecGenerateStreamPanel generating={generating} stream={stream} genLog={genLog} />
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>暂无设计 Spec</div>
        {genLog && (
          <div style={{ fontSize: 12, color: genLog.startsWith('生成失败') ? 'var(--accent-red)' : 'var(--accent-green)' }}>
            {genLog}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DocumentEditor docId={doc.id} previewVersion={previewVersion} onPreviewVersionChange={onPreviewVersionChange} />
      </div>
      {genLog && (
        <div style={{
          padding: '6px 12px', fontSize: 12, flexShrink: 0, borderTop: '1px solid var(--border-default)',
          color: genLog.startsWith('生成失败') ? 'var(--accent-red)' : 'var(--accent-green)',
        }}>
          {genLog}
        </div>
      )}
    </div>
  );
});
