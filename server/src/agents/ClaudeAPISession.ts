import { EventEmitter } from 'node:events';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { newId } from '../db/index.js';
import type { NormalizedEntry } from '@devflow/shared';
import type { AgentMessage } from './types.js';
import { toAgentText } from './types.js';
import type { AgentProcess } from './types.js';

async function buildFetchOptions(baseOpts: RequestInit): Promise<RequestInit> {
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? process.env.https_proxy ?? process.env.http_proxy;
  if (!proxyUrl) return baseOpts;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // @ts-ignore undici is built into Node.js
    const undici: any = await import('undici');
    const ProxyAgent = undici.ProxyAgent;
    if (!ProxyAgent) {
      console.warn('[ClaudeAPISession] undici.ProxyAgent not available, proxy will not be used');
      return baseOpts;
    }
    return { ...baseOpts, dispatcher: new ProxyAgent(proxyUrl) } as RequestInit;
  } catch {
    console.warn('[ClaudeAPISession] Failed to load undici ProxyAgent, proxy will not be used');
    return baseOpts;
  }
}

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the specified path.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'The file path to read' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file at the specified path. Creates the file and parent directories if needed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'The file path to write' },
        content: { type: 'string', description: 'The content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_dir',
    description: 'List the contents of a directory.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'The directory path to list' },
      },
      required: ['path'],
    },
  },
  {
    name: 'bash',
    description: 'Execute a shell command. Use with caution. Only safe, read-only commands are recommended.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        cwd: { type: 'string', description: 'Working directory for the command (optional)' },
      },
      required: ['command'],
    },
  },
];

export class ClaudeAPISession extends EventEmitter implements AgentProcess {
  readonly sessionId: string;
  readonly agentId = 'claude-api';
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private openaiCompatible: boolean;
  private messages: Array<{ role: 'user' | 'assistant'; content: string | Array<unknown> }> = [];
  private pendingTool: { entryId: string; toolId: string; name: string; input: Record<string, unknown> } | null = null;
  private abortController: AbortController | null = null;
  private cwd: string | undefined;
  private running = false;

  constructor(sessionId: string, config?: { apiKey?: string; model?: string; baseUrl?: string; cwd?: string }) {
    super();
    this.sessionId = sessionId;
    this.apiKey = config?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_AUTH_TOKEN ?? '';
    this.model = config?.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest';
    this.baseUrl = (config?.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com').replace(/\/$/, '');
    this.openaiCompatible = !this.baseUrl.includes('anthropic.com');
    this.cwd = config?.cwd;
  }

  send(prompt: AgentMessage): void {
    if (this.running) return;
    this.abortController = new AbortController();
    const text = toAgentText(prompt);
    this.messages.push({ role: 'user', content: text });
    this.running = true;
    if (this.openaiCompatible) {
      void this.runLoopOpenAI();
    } else {
      void this.runLoopAnthropic();
    }
  }

  private async runLoopOpenAI(): Promise<void> {
    try {
      // Convert messages to OpenAI format (simplified — tools not supported in OpenAI path)
      const openaiMessages = this.messages.map(m => {
        if (typeof m.content === 'string') {
          return { role: m.role, content: m.content };
        }
        // For array content (tool results), convert to a simple text message
        return { role: m.role, content: JSON.stringify(m.content) };
      });

      const body = {
        model: this.model,
        messages: openaiMessages,
        stream: true,
      };

      const url = `${this.baseUrl}/v1/chat/completions`;
      console.log(`[ClaudeAPISession] OpenAI fetch → ${url}, model=${this.model}`);
      const fetchOpts = await buildFetchOptions({
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: this.abortController?.signal,
      });
      const response = await fetch(url, fetchOpts);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantTextEntryId: string | null = null;
      let finishReason: string | null = null;
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const dataStr = trimmed.slice(6).trim();
          if (!dataStr) continue;

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          const choices = (data.choices ?? []) as Array<Record<string, unknown>>;
          const firstChoice = choices[0];
          if (!firstChoice) continue;

          const delta = firstChoice.delta as Record<string, unknown> | undefined;
          const content = delta?.content as string | undefined;

          if (content) {
            if (!assistantTextEntryId) {
              assistantTextEntryId = newId('msg');
            }
            assistantContent += content;
            this.emit('entry', {
              id: assistantTextEntryId,
              sessionId: this.sessionId,
              type: 'assistant_message',
              content,
              action: null,
              status: 'success',
              createdAt: new Date().toISOString(),
            } satisfies NormalizedEntry);
          }

          const fr = firstChoice.finish_reason as string | null;
          if (fr) {
            finishReason = fr;
          }
        }
      }

      this.messages.push({ role: 'assistant', content: assistantContent });
      this.running = false;
      this.emit('exit', finishReason === 'stop' ? 0 : 0);
    } catch (err) {
      this.running = false;
      console.error('[ClaudeAPISession] OpenAI fetch failed:', err);
      if ((err as { name?: string }).name === 'AbortError') {
        this.emit('exit', 1);
        return;
      }
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      this.emit('exit', 1);
    }
  }

  private async runLoopAnthropic(): Promise<void> {
    try {
      const body = {
        model: this.model,
        max_tokens: 4096,
        messages: this.messages,
        tools: TOOLS,
        stream: true,
      };

      const fetchOpts = await buildFetchOptions({
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: this.abortController?.signal,
      });
      const response = await fetch(`${this.baseUrl}/v1/messages`, fetchOpts);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let currentBlockType: string | null = null;
      let currentToolId: string | null = null;
      let currentToolName: string | null = null;
      let currentToolInput = '';
      let assistantTextEntryId: string | null = null;
      let thinkingEntryId: string | null = null;
      let stopReason: string | null = null;
      const assistantBlocks: Array<Record<string, unknown>> = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        while (true) {
          const eventEnd = buffer.indexOf('\n\n');
          if (eventEnd === -1) break;

          const eventBlock = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          let eventType = '';
          let dataStr = '';
          for (const line of eventBlock.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
          }

          if (!dataStr || dataStr === '[DONE]') continue;

          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataStr);
          } catch {
            continue;
          }

          switch (eventType) {
            case 'content_block_start': {
              const block = data.content_block as Record<string, unknown> | undefined;
              currentBlockType = block?.type as string | null;
              if (currentBlockType === 'tool_use') {
                currentToolId = block?.id as string | null;
                currentToolName = block?.name as string | null;
                currentToolInput = '';
                assistantBlocks.push({ type: 'tool_use', id: currentToolId, name: currentToolName, input: {} });
              } else if (currentBlockType === 'text') {
                assistantTextEntryId = newId('msg');
                assistantBlocks.push({ type: 'text', text: '' });
              } else if (currentBlockType === 'thinking') {
                thinkingEntryId = newId('msg');
                assistantBlocks.push({ type: 'thinking', thinking: '' });
              }
              break;
            }

            case 'content_block_delta': {
              const delta = data.delta as Record<string, unknown> | undefined;
              if (currentBlockType === 'text' && delta?.type === 'text_delta') {
                const text = delta.text as string;
                const lastBlock = assistantBlocks[assistantBlocks.length - 1];
                if (lastBlock?.type === 'text') {
                  lastBlock.text = (lastBlock.text as string) + text;
                }
                if (assistantTextEntryId) {
                  this.emit('entry', {
                    id: assistantTextEntryId,
                    sessionId: this.sessionId,
                    type: 'assistant_message',
                    content: text,
                    action: null,
                    status: 'success',
                    createdAt: new Date().toISOString(),
                  } satisfies NormalizedEntry);
                }
              } else if (currentBlockType === 'thinking' && delta?.type === 'thinking_delta') {
                const thinking = delta.thinking as string;
                const lastBlock = assistantBlocks[assistantBlocks.length - 1];
                if (lastBlock?.type === 'thinking') {
                  lastBlock.thinking = (lastBlock.thinking as string) + thinking;
                }
                if (thinkingEntryId) {
                  this.emit('entry', {
                    id: thinkingEntryId,
                    sessionId: this.sessionId,
                    type: 'thinking',
                    content: thinking,
                    action: null,
                    status: 'success',
                    createdAt: new Date().toISOString(),
                  } satisfies NormalizedEntry);
                }
              } else if (currentBlockType === 'tool_use' && delta?.type === 'input_json_delta') {
                currentToolInput += (delta.partial_json as string) ?? '';
              }
              break;
            }

            case 'content_block_stop': {
              if (currentBlockType === 'tool_use' && currentToolId && currentToolName) {
                let input: Record<string, unknown>;
                try {
                  input = JSON.parse(currentToolInput);
                } catch {
                  input = {};
                }
                const lastBlock = assistantBlocks[assistantBlocks.length - 1];
                if (lastBlock?.type === 'tool_use') {
                  lastBlock.input = input;
                }
                const entryId = newId('msg');
                this.pendingTool = { entryId, toolId: currentToolId, name: currentToolName, input };

                this.emit('entry', {
                  id: entryId,
                  sessionId: this.sessionId,
                  type: 'tool_use',
                  content: JSON.stringify(input),
                  action: { type: currentToolName, ...input, status: 'pending' },
                  status: 'pending',
                  createdAt: new Date().toISOString(),
                } satisfies NormalizedEntry);
              }
              currentBlockType = null;
              break;
            }

            case 'message_delta': {
              const delta = data.delta as Record<string, unknown> | undefined;
              stopReason = (delta?.stop_reason as string) ?? null;
              break;
            }
          }
        }
      }

      if (stopReason === 'tool_use' && this.pendingTool) {
        // Save assistant message before waiting for approval
        this.messages.push({ role: 'assistant', content: assistantBlocks });
        // Pause and wait for approval; decide() will continue the loop
        await this.waitForDecision();
        return;
      }

      // Save assistant message for normal completion
      this.messages.push({ role: 'assistant', content: assistantBlocks });
      this.running = false;
      this.emit('exit', 0);
    } catch (err) {
      this.running = false;
      if ((err as { name?: string }).name === 'AbortError') {
        this.emit('exit', 1);
        return;
      }
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      this.emit('exit', 1);
    }
  }

  private async waitForDecision(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!this.pendingTool) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();

      setTimeout(() => {
        if (this.pendingTool) {
          this.decide(this.pendingTool.entryId, 'reject');
          resolve();
        }
      }, 30 * 60 * 1000);
    });
  }

  private isPathSafe(targetPath: string): boolean {
    if (!this.cwd) return true;
    const resolved = resolve(this.cwd, targetPath);
    const rel = relative(this.cwd, resolved);
    return !rel.startsWith('..') && !rel.startsWith('/');
  }

  private executeTool(name: string, input: Record<string, unknown>): { success: boolean; result: string } {
    try {
      switch (name) {
        case 'read_file': {
          const targetPath = input.path as string;
          if (!this.isPathSafe(targetPath)) {
            return { success: false, result: `Path ${targetPath} is outside the allowed directory` };
          }
          const resolved = this.cwd ? resolve(this.cwd, targetPath) : targetPath;
          if (!existsSync(resolved)) {
            return { success: false, result: `File not found: ${targetPath}` };
          }
          return { success: true, result: readFileSync(resolved, 'utf8') };
        }

        case 'write_file': {
          const targetPath = input.path as string;
          const content = input.content as string;
          if (!this.isPathSafe(targetPath)) {
            return { success: false, result: `Path ${targetPath} is outside the allowed directory` };
          }
          const resolved = this.cwd ? resolve(this.cwd, targetPath) : targetPath;
          mkdirSync(resolve(resolved, '..'), { recursive: true });
          writeFileSync(resolved, content, 'utf8');
          return { success: true, result: `File written: ${targetPath}` };
        }

        case 'list_dir': {
          const targetPath = input.path as string;
          if (!this.isPathSafe(targetPath)) {
            return { success: false, result: `Path ${targetPath} is outside the allowed directory` };
          }
          const resolved = this.cwd ? resolve(this.cwd, targetPath) : targetPath;
          if (!existsSync(resolved)) {
            return { success: false, result: `Directory not found: ${targetPath}` };
          }
          const entries = readdirSync(resolved, { withFileTypes: true });
          return { success: true, result: entries.map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`).join('\n') };
        }

        case 'bash': {
          const command = input.command as string;
          const cmdCwd = input.cwd
            ? (this.cwd ? resolve(this.cwd, input.cwd as string) : (input.cwd as string))
            : this.cwd;

          const blocked = ['rm -rf /', 'rm -rf /*', 'mkfs', 'dd if=/dev/zero', ':(){ :|:& };:'];
          if (blocked.some(b => command.includes(b))) {
            return { success: false, result: 'Command blocked for safety' };
          }

          try {
            const output = execSync(command, { cwd: cmdCwd, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
            return { success: true, result: output.slice(0, 10000) };
          } catch (err) {
            const e = err as { stdout?: Buffer; stderr?: Buffer; message: string };
            return { success: false, result: e.stderr?.toString() ?? e.stdout?.toString() ?? e.message };
          }
        }

        default:
          return { success: false, result: `Unknown tool: ${name}` };
      }
    } catch (err) {
      return { success: false, result: (err as Error).message };
    }
  }

  decide(entryId: string, decision: 'approve' | 'reject'): void {
    if (!this.pendingTool || this.pendingTool.entryId !== entryId) return;

    const tool = this.pendingTool;
    this.pendingTool = null;

    let result: string;
    if (decision === 'approve') {
      const execResult = this.executeTool(tool.name, tool.input);
      result = execResult.result;
      this.emit('patch', entryId, { status: execResult.success ? 'success' : 'error' });
    } else {
      result = `Tool ${tool.name} was rejected by user`;
      this.emit('patch', entryId, { status: 'error' });
    }

    // Add tool_result to conversation history
    this.messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: tool.toolId,
          content: result,
        },
      ],
    });

    // Continue the conversation loop
    void (this.openaiCompatible ? this.runLoopOpenAI() : this.runLoopAnthropic());
  }

  interrupt(): void {
    this.abortController?.abort();
  }
}
