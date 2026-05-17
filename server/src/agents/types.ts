import type { NormalizedEntry } from '@devflow/shared';

export interface AgentProcess {
  sessionId: string;
  agentId: string;
  send(message: string): void;
  interrupt(): void;
  on(event: 'entry', cb: (entry: NormalizedEntry) => void): void;
  on(event: 'patch', cb: (entryId: string, patch: Partial<NormalizedEntry>) => void): void;
  on(event: 'exit', cb: (code: number | null) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
}

export interface RunConfig {
  sessionId: string;
  agent: string;
  prompt: string;
  model?: string;
  cwd?: string;
  images?: string[];
}
