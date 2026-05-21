import { EventEmitter } from 'node:events';
import { newId } from '../db/index.js';
import type { NormalizedEntry } from '@devflow/shared';
import type { AgentMessage } from './types.js';
import { toAgentText } from './types.js';
import type { AgentProcess } from './types.js';

export class OpenAISession extends EventEmitter implements AgentProcess {
  readonly sessionId: string;
  readonly agentId: string;
  private abortController: AbortController | null = null;
  private config: { baseUrl: string; apiKey: string; model: string };

  constructor(
    sessionId: string,
    config: { baseUrl: string; apiKey: string; model: string; cwd?: string },
  ) {
    super();
    this.sessionId = sessionId;
    this.agentId = `openai-${config.model}`;
    this.config = {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
    };
  }

  send(prompt: AgentMessage): void {
    this.abortController = new AbortController();
    const text = toAgentText(prompt);
    const { baseUrl, apiKey, model } = this.config;
    const signal = this.abortController.signal;

    // Run in async IIFE so send() returns immediately
    (async () => {
      let accumulatedContent = '';
      const streamEntryId = newId('msg');

      // Emit an initial streaming entry
      const initialEntry: NormalizedEntry = {
        id: streamEntryId,
        sessionId: this.sessionId,
        type: 'assistant_message',
        content: '',
        action: null,
        status: 'running',
        createdAt: new Date().toISOString(),
      };
      this.emit('entry', initialEntry);

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: text }],
            stream: true,
          }),
          signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          const err = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
          this.emit('error', err);
          this.emit('exit', 1);
          return;
        }

        if (!response.body) {
          const err = new Error('Response body is null');
          this.emit('error', err);
          this.emit('exit', 1);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const dataStr = trimmed.slice('data: '.length).trim();
            if (dataStr === '[DONE]') continue;

            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(dataStr);
            } catch {
              continue;
            }

            const choices = parsed.choices as Array<{
              delta?: { content?: string };
              finish_reason?: string | null;
            }> | undefined;

            if (!choices || choices.length === 0) continue;

            const delta = choices[0]?.delta;
            const content = delta?.content;

            if (typeof content === 'string' && content.length > 0) {
              accumulatedContent += content;
              // Emit patch to update existing entry
              this.emit('patch', streamEntryId, { content: accumulatedContent });
            }
          }
        }

        // Emit final patch with success status
        this.emit('patch', streamEntryId, {
          content: accumulatedContent,
          status: 'success',
        });

        this.emit('exit', 0);
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') {
          this.emit('patch', streamEntryId, { status: 'error' });
          this.emit('exit', 1);
          return;
        }
        const error = err instanceof Error ? err : new Error(String(err));
        this.emit('error', error);
        this.emit('patch', streamEntryId, { status: 'error' });
        this.emit('exit', 1);
      }
    })();
  }

  interrupt(): void {
    this.abortController?.abort();
  }
}
