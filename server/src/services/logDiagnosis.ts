import { EventEmitter } from 'node:events';
import { ClaudeSession } from '../agents/ClaudeSession.js';
import { sshService } from './ssh.js';
import { checkCommand } from './logCommandWhitelist.js';
import { db, newId } from '../db/index.js';
import type { LogTarget, LogStreamEvent, DiagnosisStep } from '@devflow/shared';

type SSECallback = (event: LogStreamEvent) => void;

const MAX_HOPS = 10;

function buildSystemPrompt(targets: LogTarget[]): string {
  const desc = targets.map(t =>
    `- id="${t.id}" name="${t.name}" service=${t.service} env=${t.environment} hosts=[${t.hosts.join(',')}] logDir=${t.logDir ?? 'unknown'} logGlob=${t.logGlob}`
  ).join('\n');
  return `You are a DevOps AI assistant for log diagnosis.
Available targets:\n${desc}\n
To run a command on a target, respond with JSON on its own line:
TOOL_CALL: {"tool":"exec_remote_command","targetId":"<id>","command":"<cmd>"}

Only use read-only commands. Do not use >, ;, &&, ||, $(), backticks.
When done, provide your final analysis prefixed with FINAL_ANSWER:`;
}

export class LogDiagnosisService extends EventEmitter {
  private subs = new Map<string, SSECallback[]>();

  subscribe(sessionId: string, cb: SSECallback): () => void {
    const list = this.subs.get(sessionId) ?? [];
    list.push(cb);
    this.subs.set(sessionId, list);
    return () => this.subs.set(sessionId, (this.subs.get(sessionId) ?? []).filter(f => f !== cb));
  }

  private pub(sessionId: string, evt: LogStreamEvent): void {
    for (const cb of this.subs.get(sessionId) ?? []) cb(evt);
  }

  private addStep(sessionId: string, step: DiagnosisStep): void {
    const row = db.prepare('SELECT steps FROM log_chat_sessions WHERE id=?').get(sessionId) as { steps: string } | undefined;
    if (!row) return;
    const steps = JSON.parse(row.steps) as DiagnosisStep[];
    steps.push(step);
    db.prepare('UPDATE log_chat_sessions SET steps=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(steps), new Date().toISOString(), sessionId);
  }

  async diagnose(params: { sessionId: string; userQuery: string; targets: LogTarget[] }): Promise<void> {
    const { sessionId, userQuery, targets } = params;
    this.saveMsg(sessionId, 'user', userQuery);
    const targetMap = new Map(targets.map(t => [t.id, t]));
    const systemPrompt = buildSystemPrompt(targets);
    let conversationContext = `${systemPrompt}\n\nUser: ${userQuery}`;
    let hopCount = 0;
    let finalAnswer = '';

    while (hopCount < MAX_HOPS) {
      hopCount++;
      const agentId = newId('ags');
      const session = new ClaudeSession(agentId);
      let outputBuffer = '';

      await new Promise<void>((resolve) => {
        session.on('entry', (entry) => {
          if (entry.type === 'thinking') {
            this.pub(sessionId, { type: 'thinking', sessionId, content: entry.content });
            this.addStep(sessionId, { type: 'thinking', content: entry.content, createdAt: new Date().toISOString() });
          } else if (entry.type === 'assistant_message') {
            outputBuffer += entry.content;
          }
        });
        session.on('exit', () => resolve());
        session.on('error', () => resolve());
        session.send(conversationContext);
      });

      // Check for TOOL_CALL in output
      const toolMatch = outputBuffer.match(/TOOL_CALL:\s*(\{[^\n]+\})/);
      if (toolMatch) {
        let toolCall: Record<string, unknown>;
        try { toolCall = JSON.parse(toolMatch[1]) as Record<string, unknown>; }
        catch { finalAnswer = outputBuffer; break; }

        const targetId = (toolCall.targetId ?? toolCall.target_id ?? '') as string;
        const cmd = (toolCall.command ?? toolCall.cmd ?? '') as string;
        const target = targetMap.get(targetId);

        this.pub(sessionId, { type: 'command', sessionId, content: cmd, targetId, command: cmd });
        this.addStep(sessionId, { type: 'command', content: cmd, targetId, command: cmd, createdAt: new Date().toISOString() });

        let result: string;
        let exitCode: number;

        if (!target) {
          result = `Error: target '${targetId}' not found`; exitCode = 1;
        } else {
          const chk = checkCommand(cmd);
          if (!chk.allowed) {
            result = `Blocked: ${chk.reason}`; exitCode = 1;
          } else {
            const r = await sshService.exec(target, cmd);
            result = r.stdout || r.stderr; exitCode = r.exitCode;
          }
        }

        this.pub(sessionId, { type: 'result', sessionId, content: result, exitCode });
        this.addStep(sessionId, { type: 'result', content: result, exitCode, createdAt: new Date().toISOString() });
        conversationContext += `\nAssistant: ${outputBuffer}\nTool result [exit ${exitCode}]:\n${result}`;
      } else {
        // Extract final answer (strip FINAL_ANSWER: prefix if present)
        finalAnswer = outputBuffer.replace(/^FINAL_ANSWER:\s*/m, '').trim() || outputBuffer;
        break;
      }
    }

    if (!finalAnswer) finalAnswer = 'Diagnosis complete.';
    this.pub(sessionId, { type: 'answer', sessionId, content: finalAnswer });
    this.addStep(sessionId, { type: 'answer', content: finalAnswer, createdAt: new Date().toISOString() });
    this.pub(sessionId, { type: 'done', sessionId, content: '' });
    this.saveMsg(sessionId, 'assistant', finalAnswer);
  }

  private saveMsg(sessionId: string, role: 'user' | 'assistant', content: string): void {
    const row = db.prepare('SELECT messages FROM log_chat_sessions WHERE id=?').get(sessionId) as { messages: string } | undefined;
    if (!row) return;
    const msgs = JSON.parse(row.messages) as Array<{ role: string; content: string; createdAt: string }>;
    msgs.push({ role, content, createdAt: new Date().toISOString() });
    db.prepare('UPDATE log_chat_sessions SET messages=?, updated_at=? WHERE id=?')
      .run(JSON.stringify(msgs), new Date().toISOString(), sessionId);
  }
}

export const logDiagnosis = new LogDiagnosisService();
