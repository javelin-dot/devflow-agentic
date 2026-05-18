import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { db } from '../db/index.js';

interface ClaudeSettings {
  env?: Record<string, string>;
}

function loadClaudeSettings(): Record<string, string> {
  const path = resolve(homedir(), '.claude', 'settings.json');
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as ClaudeSettings;
    return parsed.env ?? {};
  } catch {
    return {};
  }
}

/** Load AI env from ~/.claude/settings.json → process.env */
export function loadUserEnv(): void {
  const env = loadClaudeSettings();

  // Map ANTHROPIC_AUTH_TOKEN to ANTHROPIC_API_KEY if the latter is missing
  if (!process.env.ANTHROPIC_API_KEY && env.ANTHROPIC_AUTH_TOKEN) {
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_AUTH_TOKEN;
    console.log('[env] loaded ANTHROPIC_API_KEY from ~/.claude/settings.json');
  }

  if (!process.env.ANTHROPIC_BASE_URL && env.ANTHROPIC_BASE_URL) {
    process.env.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL;
    console.log('[env] loaded ANTHROPIC_BASE_URL from ~/.claude/settings.json');
  }

  if (!process.env.ANTHROPIC_MODEL && env.ANTHROPIC_MODEL) {
    process.env.ANTHROPIC_MODEL = env.ANTHROPIC_MODEL;
    console.log('[env] loaded ANTHROPIC_MODEL from ~/.claude/settings.json');
  }
}

/** Override process.env with DB settings (DB wins) */
export function loadDbEnvOverrides(): void {
  const keys = ['anthropicApiKey', 'anthropicBaseUrl', 'anthropicModel'] as const;
  for (const key of keys) {
    const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
    if (row?.value) {
      const envKey = key === 'anthropicApiKey' ? 'ANTHROPIC_API_KEY'
        : key === 'anthropicBaseUrl' ? 'ANTHROPIC_BASE_URL'
        : 'ANTHROPIC_MODEL';
      process.env[envKey] = row.value;
    }
  }
}
