import { useState } from 'react';
import { Bot } from 'lucide-react';
import { DocumentEditor } from './DocumentEditor';
import { useDocuments, useCreateDocument } from '../api/hooks';

interface RequirementSpecEditorProps {
  reqId: string;
  readonly?: boolean;
}

export function RequirementSpecEditor({ reqId, readonly }: RequirementSpecEditorProps) {
  const { data: documents = [] } = useDocuments({ reqId, type: 'requirement_spec' });
  const createDoc = useCreateDocument();
  const [generating, setGenerating] = useState(false);
  const [genLog, setGenLog] = useState('');

  const doc = documents[0];

  const handleGenerate = async () => {
    setGenerating(true);
    setGenLog('');

    try {
      const resp = await fetch('/api/specs/requirement/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId, agent: 'claude-api' }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        setGenLog(`请求失败: HTTP ${resp.status} ${text.slice(0, 200)}`);
        return;
      }

      const reader = resp.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const line = chunk.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.type === 'entry' && evt.entry?.type === 'thinking') {
              setGenLog(prev => prev + evt.entry.content);
            } else if (evt.type === 'done') {
              setGenLog('生成完成');
            } else if (evt.type === 'error') {
              setGenLog(`生成失败: ${evt.message}`);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setGenLog(`请求异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  if (!doc) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 14 }}>暂无需求 Spec</div>
        {!readonly && (
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '8px 16px', background: generating ? 'var(--bg-disabled)' : 'var(--accent-blue)',
              border: 'none', borderRadius: 4, color: 'var(--text-inverse)', cursor: generating ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600,
            }}
          >
            {generating ? '生成中...' : <><Bot size={14} style={{ display: 'inline', marginRight: 4 }} /> AI 生成需求 Spec</>}
          </button>
        )}
        {genLog && (
          <div style={{ maxWidth: 600, maxHeight: 200, overflow: 'auto', padding: 12, background: 'var(--bg-secondary)', borderRadius: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
            {genLog}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {!readonly && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)', display: 'flex', gap: 8 }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: '4px 10px', background: generating ? 'var(--bg-disabled)' : 'var(--accent-blue)',
              border: 'none', borderRadius: 4, color: 'var(--text-inverse)', cursor: generating ? 'not-allowed' : 'pointer',
              fontSize: 12,
            }}
          >
            {generating ? '生成中...' : <><Bot size={14} style={{ display: 'inline', marginRight: 4 }} /> 重新生成</>}
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DocumentEditor docId={doc.id} />
      </div>
    </div>
  );
}
