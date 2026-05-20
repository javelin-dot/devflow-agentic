import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform } from 'node:os';
import { EventEmitter } from 'node:events';
import { newId } from '../db/index.js';
import { buildClaudeEnv, quoteForShell, resolveClaudeExecutable } from '../utils/claudeCli.js';
import type { NormalizedEntry } from '@devflow/shared';
import type { AgentProcess } from './types.js';

/** Leave headroom for executable path and CLI flags on Windows cmd.exe (~8191). */
const WIN32_MAX_INLINE_PROMPT = 6000;
const SPEC_PRINT_BRIEF =
  'Generate the document exactly as specified in the appended system instructions. Output ONLY the Markdown document content with no preamble or questions.';

export class ClaudeSession extends EventEmitter implements AgentProcess {
  readonly sessionId: string;
  readonly agentId = 'claude-code';
  private proc: ChildProcess | null = null;
  private cwd: string | undefined;
  private pendingDecisions = new Map<string, 'approve' | 'reject'>();
  private promptTempFile: string | null = null;

  constructor(sessionId: string, cwd?: string) {
    super();
    this.sessionId = sessionId;
    this.cwd = cwd;
  }

  /** Build CLI args; spill long prompts to a file the CLI reads (not the model Read tool). */
  private buildCliArgs(prompt: string): string[] {
    const base: string[] = ['--output-format', 'stream-json', '--verbose', '--include-partial-messages'];

    if (platform() === 'win32' && prompt.length > WIN32_MAX_INLINE_PROMPT) {
      const workDir = this.cwd ?? process.cwd();
      const dir = join(workDir, '.devflow');
      mkdirSync(dir, { recursive: true });
      const file = resolve(dir, 'spec-generate-task.md');
      writeFileSync(file, prompt, 'utf8');
      this.promptTempFile = file;
      return [
        ...base,
        '--permission-mode', 'dontAsk',
        '--append-system-prompt-file', file,
        '--print', SPEC_PRINT_BRIEF,
      ];
    }

    return [...base, '--print', prompt];
  }

  private cleanupPromptTempFile(): void {
    if (!this.promptTempFile) return;
    try {
      unlinkSync(this.promptTempFile);
    } catch {
      // ignore
    }
    this.promptTempFile = null;
  }

  send(prompt: string): void {
    const args = this.buildCliArgs(prompt);

    const env = buildClaudeEnv();
    const executable = resolveClaudeExecutable();
    const spawnOpts: SpawnOptions = {
      cwd: this.cwd ?? process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      windowsHide: true,
    };

    // On Windows, spawn(executable, args, { shell: true }) drops long --print payloads.
    // Use a single quoted command string (same pattern as runClaudeCli).
    if (platform() === 'win32') {
      const cmd = [quoteForShell(executable), ...args.map(quoteForShell)].join(' ');
      this.proc = spawn(cmd, [], { ...spawnOpts, shell: true });
    } else {
      this.proc = spawn(executable, args, spawnOpts);
    }

    const proc = this.proc;
    let buffer = '';

    proc.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.parseLine(trimmed);
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
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

    proc.on('exit', (code) => {
      this.cleanupPromptTempFile();
      this.emit('exit', code);
      this.proc = null;
    });

    proc.on('error', (err) => {
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
        } else if (block.type === 'thinking') {
          const thinkingText = (block as { thinking?: string }).thinking ?? '';
          if (!thinkingText) continue;
          this.emit('entry', {
            id: newId('msg'),
            sessionId: this.sessionId,
            type: 'thinking',
            content: thinkingText,
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
