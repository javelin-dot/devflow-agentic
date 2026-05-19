export type SpecSseEvent =
  | { type: 'entry'; entry?: { type?: string; content?: string; id?: string } }
  | { type: 'patch'; entryId?: string; patch?: { content?: string } }
  | { type: 'done'; documentId?: string; version?: number }
  | { type: 'error'; message?: string };

export type ConsumeSpecSseOptions = {
  onText?: (fullText: string) => void;
  onDone?: (evt: Extract<SpecSseEvent, { type: 'done' }>) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

function parseSseEvents(chunk: string): SpecSseEvent[] {
  const out: SpecSseEvent[] = [];
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      out.push(JSON.parse(payload) as SpecSseEvent);
    } catch {
      // ignore malformed lines
    }
  }
  return out;
}

/** Read spec generate SSE and accumulate assistant/thinking text for live preview. */
export async function consumeSpecSse(resp: Response, options: ConsumeSpecSseOptions): Promise<string> {
  let fullText = '';
  const entryTexts = new Map<string, string>();

  const applyEntry = (entry: { type?: string; content?: string; id?: string }) => {
    if (!entry.content) return;
    if (entry.type === 'assistant_message' || entry.type === 'thinking') {
      if (entry.id) {
        const prev = entryTexts.get(entry.id) ?? '';
        const next = prev + entry.content;
        entryTexts.set(entry.id, next);
        fullText = [...entryTexts.values()].join('');
      } else {
        fullText += entry.content;
      }
      options.onText?.(fullText);
    }
  };

  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const chunks = buf.split('\n\n');
      buf = chunks.pop() ?? '';
      for (const raw of chunks) {
        for (const evt of parseSseEvents(raw)) {
          if (evt.type === 'entry' && evt.entry) {
            applyEntry(evt.entry);
          } else if (evt.type === 'patch' && evt.patch?.content != null && evt.entryId) {
            entryTexts.set(evt.entryId, evt.patch.content);
            fullText = [...entryTexts.values()].join('');
            options.onText?.(fullText);
          } else if (evt.type === 'done') {
            options.onDone?.(evt);
          } else if (evt.type === 'error') {
            options.onError?.(evt.message ?? '生成失败');
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}
