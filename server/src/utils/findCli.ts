import { execSync } from 'node:child_process';
import { platform } from 'node:os';

/** Resolve CLI on PATH (Windows: where.exe, Unix: which). */
export function findCliOnPath(command: string, env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    if (platform() === 'win32') {
      const out = execSync(`where.exe ${command}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
      }).trim();
      const first = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
      return first ?? null;
    }
    return execSync(`which ${command}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    }).trim();
  } catch {
    return null;
  }
}

export function isCliAvailable(command: string): boolean {
  return findCliOnPath(command) != null;
}
