import type { NormalizedEntry } from '@devflow/shared';
import type { AgentProcess } from './types.js';

export interface AgentRunResult {
  collected: string[];
  errorMsg: string;
  exitCode: number | null;
}

export async function runAgentUntilDone(
  session: AgentProcess,
  prompt: string,
  options?: {
    timeoutMs?: number;
    onEntry?: (entry: NormalizedEntry) => void;
    onPatch?: (entryId: string, patch: Partial<NormalizedEntry>) => void;
  },
): Promise<AgentRunResult> {
  const collected: string[] = [];
  let done = false;
  let errorMsg = '';
  let exitCode: number | null = null;

  session.on('entry', (entry: NormalizedEntry) => {
    options?.onEntry?.(entry);
    if (entry.type === 'assistant_message') collected.push(entry.content);
  });

  session.on('patch', (entryId, patch) => {
    options?.onPatch?.(entryId, patch);
  });

  session.on('exit', (code) => {
    done = true;
    exitCode = code;
    if (code !== 0 && !errorMsg) errorMsg = 'Agent exited with error';
  });

  session.on('error', (err) => {
    done = true;
    errorMsg = err.message;
  });

  session.send(prompt);

  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
  await new Promise<void>((resolve) => {
    const iv = setInterval(() => {
      if (done) {
        clearInterval(iv);
        resolve();
      }
    }, 200);
    setTimeout(() => {
      clearInterval(iv);
      if (!done) {
        done = true;
        errorMsg = errorMsg || 'Agent timed out';
      }
      resolve();
    }, timeoutMs);
  });

  return { collected, errorMsg, exitCode };
}
