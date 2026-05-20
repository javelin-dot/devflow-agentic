export type SpecSseEvent =
  | { type: 'entry'; entry?: { type?: string; content?: string; id?: string } }
  | { type: 'patch'; entryId?: string; patch?: { content?: string } }
  | { type: 'done'; documentId?: string; version?: number }
  | { type: 'error'; message?: string };

export type SpecStreamParts = {
  thinking: string;
  assistant: string;
  toolStatus: string;
};

export type ConsumeSpecSseOptions = {
  /** @deprecated Use onStream for structured preview */
  onText?: (fullText: string) => void;
  onStream?: (parts: SpecStreamParts) => void;
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

function formatToolStatus(entry: { type?: string; content?: string; action?: unknown }): string | null {
  if (entry.type !== 'tool_use') return null;
  const action = entry.action as { type?: string } | null;
  const name = action?.type ?? 'tool';
  return `正在使用工具: ${name}`;
}

/** Read spec generate SSE and accumulate thinking / assistant / tool status for live preview. */
export async function consumeSpecSse(resp: Response, options: ConsumeSpecSseOptions): Promise<string> {
  const thinkingById = new Map<string, string>();
  const assistantById = new Map<string, string>();
  let toolStatus = '';

  const emit = () => {
    const parts: SpecStreamParts = {
      thinking: [...thinkingById.values()].join('\n\n'),
      assistant: [...assistantById.values()].join('\n\n'),
      toolStatus,
    };
    options.onStream?.(parts);
    options.onText?.(parts.thinking + parts.assistant);
  };

  const applyEntry = (entry: { type?: string; content?: string; id?: string; action?: unknown }) => {
    const tool = formatToolStatus(entry);
    if (tool) {
      toolStatus = tool;
      emit();
      return;
    }
    if (!entry.content) return;

    if (entry.type === 'thinking') {
      if (entry.id) {
        thinkingById.set(entry.id, (thinkingById.get(entry.id) ?? '') + entry.content);
      }
      emit();
      return;
    }

    if (entry.type === 'assistant_message') {
      if (entry.id) {
        assistantById.set(entry.id, (assistantById.get(entry.id) ?? '') + entry.content);
      }
      emit();
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
            const existing = thinkingById.get(evt.entryId) ?? assistantById.get(evt.entryId);
            if (thinkingById.has(evt.entryId)) {
              thinkingById.set(evt.entryId, evt.patch.content);
            } else if (assistantById.has(evt.entryId)) {
              assistantById.set(evt.entryId, evt.patch.content);
            } else if (existing === undefined) {
              assistantById.set(evt.entryId, evt.patch.content);
            }
            emit();
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

  const parts: SpecStreamParts = {
    thinking: [...thinkingById.values()].join('\n\n'),
    assistant: [...assistantById.values()].join('\n\n'),
    toolStatus,
  };
  return parts.thinking + parts.assistant;
}
