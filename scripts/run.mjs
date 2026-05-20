#!/usr/bin/env node
/**
 * Cross-platform entry: pick OS Node version via fnm, set env, run npm lifecycle.
 * Usage: node scripts/run.mjs <install|dev|build|rebuild|setup-node|check-node>
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProfile } from './node-profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const task = process.argv[2] ?? 'dev';
const isWin = process.platform === 'win32';

const TASKS = {
  install: ['npm', 'install'],
  dev: ['npm', 'run', 'dev:inner'],
  build: ['npm', 'run', 'build:inner'],
  rebuild: ['npm', 'rebuild', 'better-sqlite3', 'node-pty'],
  'setup-node': null,
  'check-node': null,
};

function runWrapped(command, args) {
  if (isWin) {
    const ps1 = join(__dirname, 'with-node-env.ps1');
    const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, command, ...args];
    const r = spawnSync('powershell', psArgs, { stdio: 'inherit', cwd: root });
    process.exit(r.status ?? 1);
  }

  const sh = join(__dirname, 'with-node-env.sh');
  const r = spawnSync('bash', [sh, command, ...args], {
    stdio: 'inherit',
    cwd: root,
    env: process.env,
  });
  process.exit(r.status ?? 1);
}

function runNodeScript(name) {
  const script = join(__dirname, name);
  const r = spawnSync(process.execPath, [script], { stdio: 'inherit', cwd: root });
  process.exit(r.status ?? 1);
}

if (task === 'check-node') {
  runNodeScript('check-node.mjs');
}

if (task === 'setup-node') {
  const profile = getProfile();
  console.log(`[devflow] Platform: ${profile.platform} → Node ${profile.nodeVersion}.x`);
  runWrapped('node', ['-v']);
}

const spec = TASKS[task];
if (!spec) {
  console.error(`Unknown task: ${task}. Use: ${Object.keys(TASKS).join(', ')}`);
  process.exit(1);
}

runWrapped(spec[0], spec.slice(1));
