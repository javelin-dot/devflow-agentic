import { execSync } from 'node:child_process';

export function isClaudeCliAvailable(): boolean {
  try {
    execSync('which claude', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

/** Prefer Claude CLI (reads ~/.claude/settings.json like Claude Code); fall back to HTTP claude-api. */
export function resolveDefaultAgent(): string {
  if (isClaudeCliAvailable()) return 'claude-code';
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'claude-api';
  return 'claude-code';
}
