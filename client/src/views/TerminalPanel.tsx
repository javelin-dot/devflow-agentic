import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Trash2, Copy, RefreshCw, Terminal as TerminalIcon } from 'lucide-react';
import { UiBadge, UiButton } from '../components/ui';

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: 'var(--bg-code)',
        foreground: 'var(--text-primary)',
        cursor: 'var(--accent-blue)',
        selectionBackground: 'var(--accent-blue-44)',
        black: 'var(--bg-primary)',
        red: 'var(--accent-red)',
        green: 'var(--accent-green)',
        yellow: 'var(--accent-orange)',
        blue: 'var(--accent-blue)',
        magenta: 'var(--accent-purple)',
        cyan: 'var(--accent-cyan)',
        white: 'var(--text-primary)',
      },
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const ws = new WebSocket(`ws://${window.location.host}/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type: string; data?: string; sessionId?: string };
        if (msg.type === 'data' && msg.data) {
          term.write(msg.data);
        }
        if (msg.type === 'ready' && msg.sessionId) {
          setSessionId(msg.sessionId);
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      term.write('\r\n\x1b[31m[Disconnected]\x1b[0m\r\n');
    };

    ws.onerror = () => {
      term.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const handleResize = () => {
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
    };
  }, []);

  const handleClear = () => {
    termRef.current?.clear();
  };

  const handleCopy = () => {
    const text = termRef.current?.getSelection() ?? '';
    if (text) {
      void navigator.clipboard.writeText(text);
    }
  };

  const handleReconnect = () => {
    wsRef.current?.close();
    window.location.reload();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-code)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: 'var(--bg-primary)', borderBottom: '1px solid var(--border-default)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TerminalIcon size={16} color="var(--text-secondary)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>终端</span>
          <UiBadge variant={connected ? 'success' : 'error'} dot>
            {connected ? '已连接' : '未连接'}
          </UiBadge>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {sessionId && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace', marginRight: 8 }}>
              {sessionId}
            </span>
          )}
          <UiButton variant="ghost" size="sm" onClick={handleClear} title="清空">
            <Trash2 size={14} />
          </UiButton>
          <UiButton variant="ghost" size="sm" onClick={handleCopy} title="复制选中">
            <Copy size={14} />
          </UiButton>
          <UiButton variant="ghost" size="sm" onClick={handleReconnect} title="重新连接">
            <RefreshCw size={14} />
          </UiButton>
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, padding: 4, overflow: 'hidden' }} />
    </div>
  );
}
