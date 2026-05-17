import { db, newId } from '../db/index.js';
import type { NormalizedEntry, AIProvider } from '@devflow/shared';
import type { AgentProcess, RunConfig } from './types.js';
import { ClaudeSession } from './ClaudeSession.js';
import { ClaudeAPISession } from './ClaudeAPISession.js';
import { OpenAISession } from './OpenAISession.js';

type SSECallback = (event: string) => void;

class SessionManager {
  // sessionId → active AgentProcess
  private active = new Map<string, AgentProcess>();
  // sessionId → list of SSE subscribers
  private subscribers = new Map<string, SSECallback[]>();

  subscribe(sessionId: string, cb: SSECallback): () => void {
    if (!this.subscribers.has(sessionId)) this.subscribers.set(sessionId, []);
    this.subscribers.get(sessionId)!.push(cb);
    return () => {
      const list = this.subscribers.get(sessionId) ?? [];
      this.subscribers.set(sessionId, list.filter(x => x !== cb));
    };
  }

  private emit(sessionId: string, data: object) {
    const line = `data: ${JSON.stringify(data)}\n\n`;
    (this.subscribers.get(sessionId) ?? []).forEach(cb => cb(line));
  }

  async run(config: RunConfig): Promise<void> {
    const { sessionId, agent, prompt, cwd } = config;

    // Check agent lock (INV-01)
    const sesRow = db.prepare('SELECT agent, agent_locked FROM sessions WHERE id=?').get(sessionId) as
      | { agent: string; agent_locked: number }
      | undefined;
    if (!sesRow) throw new Error('session not found');
    if (sesRow.agent_locked && sesRow.agent !== agent) {
      throw Object.assign(new Error('agent_locked'), { status: 409 });
    }

    // Mark agent locked
    db.prepare('UPDATE sessions SET agent_locked=1, agent=? WHERE id=?').run(agent, sessionId);

    // Spawn agent process
    let proc: AgentProcess;
    try {
      proc = createAgentProcess(agent, sessionId, cwd);
    } catch (err) {
      this.emit(sessionId, { type: 'error', message: (err as Error).message });
      this.emit(sessionId, { type: 'exit', code: 1 });
      return;
    }

    this.active.set(sessionId, proc);

    // Write user message to DB
    const userMsgId = newId('msg');
    db.prepare(
      `INSERT INTO messages (id, session_id, role, content, entry_type, status, created_at)
       VALUES (?, ?, 'user', ?, 'user_message', 'success', ?)`
    ).run(userMsgId, sessionId, prompt, new Date().toISOString());

    // Entry events
    proc.on('entry', (entry) => {
      // Persist to DB
      db.prepare(
        `INSERT OR REPLACE INTO messages (id, session_id, role, content, entry_type, action, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        entry.id,
        sessionId,
        entry.type === 'user_message' ? 'user' : 'assistant',
        entry.content,
        entry.type,
        entry.action ? JSON.stringify(entry.action) : null,
        entry.status ?? 'success',
        entry.createdAt
      );
      this.emit(sessionId, { type: 'entry', entry });
    });

    // Patch events (status updates on existing entries)
    proc.on('patch', (entryId, patch) => {
      if (patch.status !== undefined) {
        db.prepare('UPDATE messages SET status=? WHERE id=?').run(patch.status, entryId);
      }
      if (patch.content !== undefined) {
        db.prepare('UPDATE messages SET content=? WHERE id=?').run(patch.content, entryId);
      }
      this.emit(sessionId, { type: 'patch', entryId, patch });
    });

    proc.on('exit', (code) => {
      this.active.delete(sessionId);
      this.emit(sessionId, { type: 'exit', code });
    });

    proc.on('error', (err) => {
      this.emit(sessionId, { type: 'error', message: err.message });
    });

    proc.send(prompt);
  }

  interrupt(sessionId: string): boolean {
    const proc = this.active.get(sessionId);
    if (!proc) return false;
    proc.interrupt();
    return true;
  }

  approvePermission(sessionId: string, entryId: string, decision: 'approve' | 'reject'): boolean {
    const proc = this.active.get(sessionId);
    if (!proc) return false;
    // Send decision back to process via stdin signal
    // ClaudeSession handles this via its own mechanism
    if ((proc as unknown as { decide?: (id: string, d: 'approve' | 'reject') => void }).decide) {
      (proc as unknown as { decide: (id: string, d: 'approve' | 'reject') => void }).decide(entryId, decision);
      return true;
    }
    return false;
  }

  isActive(sessionId: string): boolean {
    return this.active.has(sessionId);
  }
}

export function createAgentProcess(agent: string, sessionId: string, cwd?: string): AgentProcess {
  if (agent === 'claude-api') {
    return new ClaudeAPISession(sessionId, { cwd });
  }
  if (agent === 'claude-code' || agent === 'claude') {
    return new ClaudeSession(sessionId, cwd);
  }

  // Try to find in aiProviders DB setting
  const row = db.prepare("SELECT value FROM settings WHERE key='aiProviders'").get() as { value: string } | undefined;
  const providers: AIProvider[] = row ? JSON.parse(row.value) : [];
  const provider = providers.find(p => p.id === agent || p.name === agent);
  if (provider?.type === 'openai-compatible' && provider.baseUrl && provider.apiKey && provider.model) {
    return new OpenAISession(sessionId, { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model });
  }

  throw new Error(`Agent ${agent} not supported or not configured`);
}

export const sessionManager = new SessionManager();
