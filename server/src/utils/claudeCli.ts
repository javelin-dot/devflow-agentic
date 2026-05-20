import { execFile, exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import { db } from '../db/index.js';
import { findCliOnPath } from './findCli.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/** Windows Node may set Path but not PATH — normalize before spawning children. */
function getPathEnv(env: NodeJS.ProcessEnv): string {
  return env.PATH ?? env.Path ?? '';
}

function setPathEnv(env: NodeJS.ProcessEnv, value: string): void {
  env.PATH = value;
  if (platform() === 'win32') {
    env.Path = value;
  }
}

function pathHasDir(envPath: string, dir: string): boolean {
  const sep = platform() === 'win32' ? ';' : ':';
  const target = dir.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
  return envPath.split(sep).some((p) => {
    const part = p.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
    return part === target;
  });
}

function prependPathDir(env: NodeJS.ProcessEnv, dir: string): void {
  const current = getPathEnv(env);
  if (!dir || pathHasDir(current, dir)) {
    setPathEnv(env, current);
    return;
  }
  const sep = platform() === 'win32' ? ';' : ':';
  setPathEnv(env, current ? `${dir}${sep}${current}` : dir);
}

function windowsClaudeCandidates(env: NodeJS.ProcessEnv): string[] {
  const out: string[] = [];
  if (env.APPDATA) {
    out.push(`${env.APPDATA}\\npm\\claude.cmd`);
    out.push(`${env.APPDATA}\\npm\\claude`);
  }
  const wingetRoot = env.LOCALAPPDATA
    ? `${env.LOCALAPPDATA}\\Microsoft\\WinGet\\Packages`
    : null;
  if (wingetRoot && existsSync(wingetRoot)) {
    out.push(
      `${wingetRoot}\\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\\claude.exe`,
    );
  }
  return out;
}

/** PATH tweaks so child processes find `claude` (macOS Homebrew, Windows npm global). */
export function buildClaudeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  setPathEnv(env, getPathEnv(env));

  if (platform() === 'darwin' && !getPathEnv(env).includes('/opt/homebrew/bin')) {
    prependPathDir(env, '/opt/homebrew/bin');
  }

  if (platform() === 'win32') {
    if (env.APPDATA) prependPathDir(env, `${env.APPDATA}\\npm`);
  }

  const dbProxy = (db.prepare("SELECT value FROM settings WHERE key='proxyUrl'").get() as { value: string } | undefined)?.value;
  const proxyUrl = env.HTTPS_PROXY ?? env.HTTP_PROXY ?? env.https_proxy ?? env.http_proxy ?? dbProxy;
  if (proxyUrl) {
    env.HTTP_PROXY = proxyUrl;
    env.HTTPS_PROXY = proxyUrl;
    env.http_proxy = proxyUrl;
    env.https_proxy = proxyUrl;
  }

  return env;
}

export function resolveClaudeExecutable(): string {
  const lookupEnv = { ...process.env };
  setPathEnv(lookupEnv, getPathEnv(lookupEnv));

  const fromPath = findCliOnPath('claude', lookupEnv);
  if (fromPath) return fromPath;

  if (platform() === 'win32') {
    for (const candidate of windowsClaudeCandidates(lookupEnv)) {
      if (existsSync(candidate)) return candidate;
    }
  }

  const row = db.prepare("SELECT value FROM settings WHERE key='claudeCliPath'").get() as { value: string } | undefined;
  if (row?.value && existsSync(row.value)) return row.value;

  return 'claude';
}

export function quoteForShell(arg: string): string {
  if (platform() === 'win32') {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  if (/[\s'"\\$`!]/.test(arg)) {
    return `'${arg.replace(/'/g, `'\\''`)}'`;
  }
  return arg;
}

/** Run `claude` with args; uses full path + shell on Windows (.cmd). */
export async function runClaudeCli(args: string[], timeoutMs: number): Promise<string> {
  const env = buildClaudeEnv();
  const executable = resolveClaudeExecutable();

  if (executable === 'claude' && !findCliOnPath('claude', env)) {
    const hint = platform() === 'win32'
      ? `未在 PATH 中找到 claude。已搜索: ${windowsClaudeCandidates(env).join(', ')}`
      : '未在 PATH 中找到 claude';
    throw new Error(
      `${hint}。请在能执行 claude --version 的终端里启动 npm run dev，或在设置中配置 claudeCliPath。`,
    );
  }

  if (platform() === 'win32') {
    const cmd = [quoteForShell(executable), ...args.map(quoteForShell)].join(' ');
    const { stdout, stderr } = await execAsync(cmd, {
      env,
      timeout: timeoutMs,
      windowsHide: true,
      shell: true,
    });
    return (stdout || stderr || '').trim();
  }

  const { stdout, stderr } = await execFileAsync(executable, args, {
    env,
    timeout: timeoutMs,
    windowsHide: true,
  });
  return (stdout || stderr || '').trim();
}
