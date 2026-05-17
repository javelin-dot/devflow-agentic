import { Client as SshClient } from 'ssh2';
import { readFileSync } from 'node:fs';
import type { LogTarget } from '@devflow/shared';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const MAX_OUTPUT = 2 * 1024 * 1024;

function buildConnConfig(target: LogTarget, useJump = false): Parameters<SshClient['connect']>[0] {
  const host = useJump ? (target.jumpHost ?? '') : (target.hosts[0] ?? 'localhost');
  const port = useJump ? target.jumpPort : target.sshPort;
  const username = useJump
    ? (target.jumpUser ?? target.sshUser ?? process.env.USER ?? 'root')
    : (target.sshUser ?? process.env.USER ?? 'root');

  const cfg: Parameters<SshClient['connect']>[0] = {
    host,
    port,
    username,
    readyTimeout: 8000,
  };

  if (target.sshKeyPath) {
    try { cfg.privateKey = readFileSync(target.sshKeyPath); }
    catch { /* ignore */ }
  }
  if (!cfg.privateKey) {
    if (target.sshPassword) {
      cfg.password = target.sshPassword;
    } else {
      cfg.agent = process.env.SSH_AUTH_SOCK;
    }
  }
  return cfg;
}

function execOnClient(conn: SshClient, cmd: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    conn.exec(cmd, (err, stream) => {
      if (err) { conn.end(); resolve({ stdout: '', stderr: err.message, exitCode: 1 }); return; }
      stream.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT) + '\n[truncated]';
      });
      stream.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      stream.on('close', (code: number | null) => { conn.end(); resolve({ stdout, stderr, exitCode: code ?? 0 }); });
    });
  });
}

export class SshService {
  async exec(target: LogTarget, cmd: string): Promise<ExecResult> {
    if (target.connectMode === 'jump_global' && target.jumpHost) {
      return this.execViaJump(target, cmd);
    }
    return this.execDirect(target, cmd);
  }

  private execDirect(target: LogTarget, cmd: string): Promise<ExecResult> {
    return new Promise((resolve) => {
      const conn = new SshClient();
      const cfg = buildConnConfig(target);

      conn.on('ready', () => {
        void execOnClient(conn, cmd).then(resolve);
      });

      conn.on('error', (err) => resolve({ stdout: '', stderr: err.message, exitCode: 1 }));
      conn.connect(cfg);
    });
  }

  private execViaJump(target: LogTarget, cmd: string): Promise<ExecResult> {
    return new Promise((resolve) => {
      const jumpConn = new SshClient();
      const jumpCfg = buildConnConfig(target, true);
      const targetHost = target.hosts[0] ?? 'localhost';
      const targetPort = target.sshPort;
      const targetUser = target.sshUser ?? process.env.USER ?? 'root';

      jumpConn.on('ready', () => {
        jumpConn.forwardOut('127.0.0.1', 0, targetHost, targetPort, (err, stream) => {
          if (err) { jumpConn.end(); resolve({ stdout: '', stderr: `Jump forward error: ${err.message}`, exitCode: 1 }); return; }

          const targetConn = new SshClient();
          const targetCfg: Parameters<SshClient['connect']>[0] = {
            sock: stream,
            username: targetUser,
            readyTimeout: 8000,
          };

          if (target.sshKeyPath) {
            try { targetCfg.privateKey = readFileSync(target.sshKeyPath); }
            catch { /* ignore */ }
          }
          if (!targetCfg.privateKey) {
            if (target.sshPassword) targetCfg.password = target.sshPassword;
            else targetCfg.agent = process.env.SSH_AUTH_SOCK;
          }

          targetConn.on('ready', () => {
            void execOnClient(targetConn, cmd).then((r) => {
              jumpConn.end();
              resolve(r);
            });
          });
          targetConn.on('error', (err) => {
            jumpConn.end();
            resolve({ stdout: '', stderr: err.message, exitCode: 1 });
          });
          targetConn.connect(targetCfg);
        });
      });

      jumpConn.on('error', (err) => resolve({ stdout: '', stderr: err.message, exitCode: 1 }));
      jumpConn.connect(jumpCfg);
    });
  }
}

export const sshService = new SshService();
