import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { consumeSpecSse, type SpecStreamParts } from '../lib/consumeSpecSse';

const EMPTY_STREAM: SpecStreamParts = { thinking: '', assistant: '', toolStatus: '' };

export type UseSpecGenerateOptions = {
  endpoint: string;
  body: Record<string, unknown>;
  reqId: string;
  documentType: 'requirement_spec' | 'design_spec';
  onGeneratingChange?: (generating: boolean) => void;
};

export function useSpecGenerate({
  endpoint,
  body,
  reqId,
  documentType,
  onGeneratingChange,
}: UseSpecGenerateOptions) {
  const qc = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  const [generating, setGenerating] = useState(false);
  const [stream, setStream] = useState<SpecStreamParts>(EMPTY_STREAM);
  const [genLog, setGenLog] = useState('');

  const setGeneratingState = useCallback((v: boolean) => {
    setGenerating(v);
    onGeneratingChange?.(v);
  }, [onGeneratingChange]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const generate = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setGeneratingState(true);
    setStream(EMPTY_STREAM);
    setGenLog('');

    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => 'Unknown error');
        setGenLog(`请求失败: HTTP ${resp.status} ${text.slice(0, 200)}`);
        return;
      }

      await consumeSpecSse(resp, {
        signal: ac.signal,
        onStream: setStream,
        onDone: () => {
          void qc.invalidateQueries({ queryKey: ['documents', { reqId, type: documentType }] });
          void qc.invalidateQueries({ queryKey: ['requirement', reqId] });
          setGenLog('生成完成');
        },
        onError: (message) => setGenLog(`生成失败: ${message}`),
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setGenLog('已停止生成');
        return;
      }
      setGenLog(`请求异常: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      abortRef.current = null;
      setGeneratingState(false);
    }
  }, [body, documentType, endpoint, qc, reqId, setGeneratingState]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { generating, stream, genLog, generate, cancel };
}
