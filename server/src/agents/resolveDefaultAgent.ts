import { isCliAvailable } from '../utils/findCli.js';

export function isClaudeCliAvailable(): boolean {
  return isCliAvailable('claude');
}

/** Prefer Claude CLI (reads ~/.claude/settings.json like Claude Code); fall back to HTTP claude-api. */
export function resolveDefaultAgent(): string {
  if (isClaudeCliAvailable()) return 'claude-code';
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'claude-api';
  return 'claude-code';
}
