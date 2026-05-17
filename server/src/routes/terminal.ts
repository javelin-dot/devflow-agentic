import type { WebSocket } from 'ws';
import { terminalService } from '../services/terminal.js';
import { newId } from '../db/index.js';

export function handleTerminalWS(ws: WebSocket, pathname: string): void {
  const url = new URL(pathname, 'ws://localhost');
  const sessionId = url.searchParams.get('id') ?? newId('term');
  const cwd = url.searchParams.get('cwd') ?? undefined;

  terminalService.createSession(sessionId, ws, cwd ?? undefined);

  ws.send(JSON.stringify({ type: 'ready', sessionId }));
}
