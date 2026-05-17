import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { newId, db } from '../db/index.js';
import type { NormalizedEntry } from '@devflow/shared';
import type { AgentProcess } from './types.js';

export class ClaudeSession extends EventEmitter implements AgentProcess {
  readonly sessionId: string;
  readonly agentId = 'claude-code';
  private proc: ChildProcess | null = null;
  private cwd: string | undefined;
  private pendingDecisions = new Map<string, 'approve' | 'reject'>();

  constructor(sessionId: string, cwd?: string) {
    super();
    this.sessionId = sessionId;
    this.cwd = cwd;
  }

  send(prompt: string): void {
    // --verbose is required for stream-json output mode
    const args = [
      '--output-format', 'stream-json',
      '--verbose',
      '--print', prompt,
    ];

    // Ensure /opt/homebrew/bin is in PATH (macOS Homebrew install location)
    const env = { ...process.env };
    if (!env.PATH?.includes('/opt/homebrew/bin')) {
      env.PATH = `/opt/homebrew/bin:${env.PATH ?? ''}`;
    }
    // Proxy: env var takes priority, then DB setting
    const dbProxy = (db.prepare("SELECT value FROM settings WHERE key='proxyUrl'").get() as { value: string } | undefined)?.value;
    const proxyUrl = env.HTTPS_PROXY ?? env.HTTP_PROXY ?? env.https_proxy ?? env.http_proxy ?? dbProxy;
    if (proxyUrl) {
      env.HTTP_PROXY = proxyUrl;
      env.HTTPS_PROXY = proxyUrl;
      env.http_proxy = proxyUrl;
      env.https_proxy = proxyUrl;
    }

    this.proc = spawn('claude', args, {
      cwd: this.cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],  // ignore stdin to avoid 3s wait
      env,
    });

    let buffer = '';

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.parseLine(trimmed);
      }
    });

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (!text) return;
      const entry: NormalizedEntry = {
        id: newId('msg'),
        sessionId: this.sessionId,
        type: 'system',
        content: text,
        action: null,
        status: 'error',
        createdAt: new Date().toISOString(),
      };
      this.emit('entry', entry);
    });

    this.proc.on('exit', (code) => {
      this.emit('exit', code);
      this.proc = null;
    });

    this.proc.on('error', (err) => {
      this.emit('error', err);
    });
  }

  private parseLine(line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch {
      // Non-JSON line → treat as assistant text
      const entry: NormalizedEntry = {
        id: newId('msg'),
        sessionId: this.sessionId,
        type: 'assistant_message',
        content: line,
        action: null,
        status: 'success',
        createdAt: new Date().toISOString(),
      };
      this.emit('entry', entry);
      return;
    }

    const msgType = parsed.type as string;

    if (msgType === 'assistant') {
      // Actual stream-json format: message.content is an array of blocks
      const message = parsed.message as { content?: Array<{ type: string; text?: string; name?: string; id?: string; input?: unknown }> } | undefined;
      const blocks = message?.content ?? [];
      for (const block of blocks) {
        if (block.type === 'text' && block.text) {
          this.emit('entry', {
            id: newId('msg'),
            sessionId: this.sessionId,
            type: 'assistant_message',
            content: block.text,
            action: null,
            status: 'success',
            createdAt: new Date().toISOString(),
          } satisfies NormalizedEntry);
        } else if (block.type === 'tool_use') {
          const entryId = newId('msg');
          this.emit('entry', {
            id: entryId,
            sessionId: this.sessionId,
            type: 'tool_use',
            content: JSON.stringify(block.input ?? {}),
            action: { type: block.name ?? 'unknown', ...(block.input as Record<string, unknown> ?? {}), status: 'pending' },
            status: 'pending',
            createdAt: new Date().toISOString(),
          } satisfies NormalizedEntry);
        }
      }

    } else if (msgType === 'result' || msgType === 'system') {
      // result: content already emitted via 'assistant' event above
      // system: init/info, not useful in chat
      // Init / info events — skip, not useful in chat
    } else if (msgType === 'thinking' || msgType === 'thought') {
      this.emit('entry', {
        id: newId('msg'),
        sessionId: this.sessionId,
        type: 'thinking',
        content: (parsed.thinking as string) ?? (parsed.content as string) ?? '',
        action: null,
        status: 'success',
        createdAt: new Date().toISOString(),
      } satisfies NormalizedEntry);
    }
    // rate_limit_event, tool_result and other types silently ignored
  }

  interrupt(): void {
    this.proc?.kill('SIGINT');
  }

  decide(_entryId: string, _decision: 'approve' | 'reject'): void {
    // claude --output-format stream-json handles tool approval differently
    // For now, we auto-approve at the process level; real approval in M2
  }
}
