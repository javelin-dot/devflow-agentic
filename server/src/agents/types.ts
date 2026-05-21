import type { NormalizedEntry } from '@devflow/shared';

/** Spec generate: explicit user message + large context appended to system prompt. */
export interface SpecGenerationPrompt {
  kind: 'spec_generation';
  userMessage: string;
  systemAppend: string;
}

export type AgentMessage = string | SpecGenerationPrompt;

export function isSpecGenerationPrompt(message: AgentMessage): message is SpecGenerationPrompt {
  return typeof message === 'object' && message !== null && message.kind === 'spec_generation';
}

/** Flatten spec prompt for agents that only accept a single text prompt. */
export function toAgentText(message: AgentMessage): string {
  if (isSpecGenerationPrompt(message)) {
    return `${message.userMessage}\n\n---\n\n${message.systemAppend}`;
  }
  return message;
}

export interface AgentProcess {
  sessionId: string;
  agentId: string;
  send(message: AgentMessage): void;
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
