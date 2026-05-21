import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';
import { db } from '../db/index.js';

interface ClaudeSettings {
  env?: Record<string, string>;
}

let currentProxy: string | null = null;

/**
 * Apply proxy URL to process.env (so spawned child processes inherit it) and
 * to undici's global dispatcher (so this server's own fetch() calls use it).
 * Pass undefined/empty to clear — undici dispatcher is reset to a default Agent.
 */
export function applyProxy(url: string | undefined | null): void {
  const next = url?.trim() || null;
  if (next === currentProxy) return;

  if (next) {
    process.env.HTTP_PROXY = next;
    process.env.HTTPS_PROXY = next;
    process.env.http_proxy = next;
    process.env.https_proxy = next;
    setGlobalDispatcher(new ProxyAgent(next));
    console.log(`[env] proxy applied: ${next}`);
  } else {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    setGlobalDispatcher(new Agent());
    console.log('[env] proxy cleared');
  }
  currentProxy = next;
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

  // Proxy: env var wins; otherwise fall back to DB setting.
  const dbProxy = (db.prepare("SELECT value FROM settings WHERE key='proxyUrl'").get() as { value: string } | undefined)?.value;
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? process.env.https_proxy ?? process.env.http_proxy ?? dbProxy;
  if (proxyUrl) applyProxy(proxyUrl);
}
