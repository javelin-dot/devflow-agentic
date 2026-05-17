import { EventEmitter } from 'node:events';
import * as pty from 'node-pty';
import type { WebSocket } from 'ws';

export interface TerminalSession {
  id: string;
  pty: pty.IPty;
  ws: WebSocket;
  cwd: string;
  createdAt: number;
}

class TerminalService extends EventEmitter {
  private sessions = new Map<string, TerminalSession>();

  createSession(id: string, ws: WebSocket, cwd?: string): TerminalSession {
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: cwd ?? process.cwd(),
      env: process.env as { [key: string]: string },
    });

    const session: TerminalSession = {
      id,
      pty: ptyProcess,
      ws,
      cwd: cwd ?? process.cwd(),
      createdAt: Date.now(),
    };

    this.sessions.set(id, session);

    ptyProcess.onData((data) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
      }
      this.sessions.delete(id);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; data?: string; cols?: number; rows?: number };
        if (msg.type === 'input' && msg.data) {
          ptyProcess.write(msg.data);
        } else if (msg.type === 'resize' && msg.cols && msg.rows) {
          ptyProcess.resize(msg.cols, msg.rows);
        }
      } catch { /* ignore */ }
    });

    ws.on('close', () => {
      ptyProcess.kill();
      this.sessions.delete(id);
    });

    return session;
  }

  getSession(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): Array<{ id: string; cwd: string; createdAt: number }> {
    return Array.from(this.sessions.values()).map(s => ({
      id: s.id,
      cwd: s.cwd,
      createdAt: s.createdAt,
    }));
  }

  killSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.pty.kill();
    this.sessions.delete(id);
    return true;
  }
}

export const terminalService = new TerminalService();
