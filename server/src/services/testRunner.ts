import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../db/index.js';
import type { TestRun, TestRunEvent, TestType } from '@devflow/shared';

// ===== TestFrameworkAdapter =====

export interface TestFrameworkAdapter {
  id: string;
  name: string;
  testTypes: TestType[];
  detect: (command: string) => boolean;
  cliBinary: string;
  installHint: string;
  parseOutput: (stdout: string, stderr: string, exitCode: number) => { passed: boolean; summary?: string; tests?: Array<{ name: string; passed: boolean; durationMs?: number }> };
}

const vitestAdapter: TestFrameworkAdapter = {
  id: 'vitest',
  name: 'Vitest',
  testTypes: ['functional'],
  detect: (cmd) => cmd.includes('vitest') || cmd.includes('vite'),
  cliBinary: 'vitest',
  installHint: 'npm install -D vitest',
  parseOutput: (stdout, _stderr, exitCode) => {
    const pass = exitCode === 0;
    const match = stdout.match(/(\d+) passed\s*[,\s]*(\d+) failed/);
    const summary = match ? `${match[1]} passed, ${match[2]} failed` : stdout.slice(0, 200);
    return { passed: pass, summary };
  },
};

const jestAdapter: TestFrameworkAdapter = {
  id: 'jest',
  name: 'Jest',
  testTypes: ['functional'],
  detect: (cmd) => cmd.includes('jest'),
  cliBinary: 'jest',
  installHint: 'npm install -D jest',
  parseOutput: (stdout, _stderr, exitCode) => {
    const pass = exitCode === 0;
    const match = stdout.match(/Tests:\s+(\d+) passed[,\s]*(\d+) failed/);
    const summary = match ? `${match[1]} passed, ${match[2]} failed` : stdout.slice(0, 200);
    return { passed: pass, summary };
  },
};

const pytestAdapter: TestFrameworkAdapter = {
  id: 'pytest',
  name: 'pytest',
  testTypes: ['functional'],
  detect: (cmd) => cmd.includes('pytest') || cmd.includes('py.test'),
  cliBinary: 'pytest',
  installHint: 'pip install pytest',
  parseOutput: (stdout, _stderr, exitCode) => {
    const pass = exitCode === 0;
    const match = stdout.match(/(\d+) passed.*?((\d+) failed)?/);
    const summary = match ? stdout.match(/=+\s*(.*?)\s*=+/)?.[1] ?? stdout.slice(0, 200) : stdout.slice(0, 200);
    return { passed: pass, summary };
  },
};

const goTestAdapter: TestFrameworkAdapter = {
  id: 'go-test',
  name: 'Go Test',
  testTypes: ['functional'],
  detect: (cmd) => cmd.includes('go test'),
  cliBinary: 'go',
  installHint: 'https://go.dev/doc/install',
  parseOutput: (stdout, _stderr, exitCode) => {
    const pass = exitCode === 0;
    const match = stdout.match(/(PASS|FAIL)\s+\n/);
    const summary = match ? match[0] : stdout.slice(0, 200);
    return { passed: pass, summary };
  },
};

const k6Adapter: TestFrameworkAdapter = {
  id: 'k6',
  name: 'k6',
  testTypes: ['performance'],
  detect: (cmd) => cmd.includes('k6'),
  cliBinary: 'k6',
  installHint: 'brew install k6  (or see https://grafana.com/docs/k6/latest/set-up/install-k6/)',
  parseOutput: (stdout, _stderr, exitCode) => {
    const pass = exitCode === 0;
    const summary = stdout.match(/checks.*?(\d+\.\d+%)/)?.[0] ?? stdout.slice(0, 200);
    return { passed: pass, summary };
  },
};

const wrkAdapter: TestFrameworkAdapter = {
  id: 'wrk',
  name: 'wrk',
  testTypes: ['stress'],
  detect: (cmd) => cmd.includes('wrk'),
  cliBinary: 'wrk',
  installHint: 'brew install wrk  (or build from https://github.com/wg/wrk)',
  parseOutput: (stdout, _stderr, exitCode) => {
    const pass = exitCode === 0;
    const summary = stdout.match(/Requests\/sec:\s+[\d.]+/)?.[0] ?? stdout.slice(0, 200);
    return { passed: pass, summary };
  },
};

const zapCliAdapter: TestFrameworkAdapter = {
  id: 'zap-cli',
  name: 'OWASP ZAP CLI',
  testTypes: ['penetration'],
  detect: (cmd) => cmd.includes('zap-cli') || cmd.includes('zap-baseline'),
  cliBinary: 'zap-cli',
  installHint: 'pip install python-owasp-zap-v2.4  +  install ZAP from https://www.zaproxy.org/download/',
  parseOutput: (stdout, _stderr, exitCode) => {
    const pass = exitCode === 0;
    const summary = stdout.match(/(PASS|FAIL|WARN).*\d+/)?.[0] ?? stdout.slice(0, 200);
    return { passed: pass, summary };
  },
};

const ADAPTERS: TestFrameworkAdapter[] = [
  vitestAdapter, jestAdapter, pytestAdapter, goTestAdapter,
  k6Adapter, wrkAdapter, zapCliAdapter,
];

export function detectAdapter(command: string): TestFrameworkAdapter | undefined {
  return ADAPTERS.find(a => a.detect(command));
}

// CLI detection cache
const cliCache = new Map<string, boolean>();

export async function checkCLIExists(binary: string): Promise<boolean> {
  if (cliCache.has(binary)) return cliCache.get(binary)!;
  const found = await new Promise<boolean>((resolve) => {
    const proc = spawn(process.platform === 'win32' ? 'where' : 'command', ['-v', binary], { shell: true });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
    setTimeout(() => { proc.kill(); resolve(false); }, 5000);
  });
  cliCache.set(binary, found);
  return found;
}

export function getAdapterForTestType(testType: TestType): TestFrameworkAdapter | undefined {
  return ADAPTERS.find(a => a.testTypes.includes(testType));
}

// ===== CoverageCollector =====

function parseIstanbulSummary(cwd: string): Record<string, unknown> | null {
  const p = join(cwd, 'coverage', 'coverage-summary.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseLcov(cwd: string): Record<string, unknown> | null {
  const p = join(cwd, 'coverage', 'lcov.info');
  if (!existsSync(p)) return null;
  try {
    const content = readFileSync(p, 'utf8');
    const files = content.split('TN:\n').filter(Boolean);
    let totalLines = 0, coveredLines = 0;
    for (const file of files) {
      const lines = file.split('\n').filter(l => l.startsWith('DA:'));
      totalLines += lines.length;
      coveredLines += lines.filter(l => !l.endsWith(',0')).length;
    }
    return {
      total: { lines: { total: totalLines, covered: coveredLines, pct: totalLines ? Math.round((coveredLines / totalLines) * 10000) / 100 : 0 } },
    };
  } catch {
    return null;
  }
}

function collectCoverage(cwd: string | undefined): Record<string, unknown> | null {
  if (!cwd) return null;
  return parseIstanbulSummary(cwd) ?? parseLcov(cwd);
}

type SSECallback = (event: TestRunEvent) => void;

class TestRunnerService {
  private subs = new Map<string, SSECallback[]>();

  subscribe(runId: string, cb: SSECallback): () => void {
    const list = this.subs.get(runId) ?? [];
    list.push(cb);
    this.subs.set(runId, list);
    return () => this.subs.set(runId, (this.subs.get(runId) ?? []).filter(f => f !== cb));
  }

  private pub(runId: string, evt: TestRunEvent): void {
    for (const cb of this.subs.get(runId) ?? []) cb(evt);
  }

  async validateCommands(commands: Array<{ cmd: string; testType?: string }>): Promise<
    { ok: true } | { ok: false; missing: Array<{ command: string; adapter: string; installHint: string }> }
  > {
    const missing: Array<{ command: string; adapter: string; installHint: string }> = [];
    for (const { cmd, testType } of commands) {
      const adapter = detectAdapter(cmd) ?? (testType ? getAdapterForTestType(testType as TestType) : undefined);
      if (adapter) {
        const exists = await checkCLIExists(adapter.cliBinary);
        if (!exists) {
          missing.push({ command: cmd, adapter: adapter.name, installHint: adapter.installHint });
        }
      }
    }
    if (missing.length > 0) return { ok: false, missing };
    return { ok: true };
  }

  async runPlan(params: {
    runId: string;
    commands: Array<{ cmd: string; cwd?: string; title: string; testType?: string }>;
    runType: TestRun['runType'];
  }): Promise<void> {
    const { runId, commands } = params;
    const startedAt = Date.now();
    let passed = 0, failed = 0;
    const total = commands.length;
    let log = '';

    db.prepare('UPDATE test_runs SET status=?, total=? WHERE id=?').run('running', total, runId);
    this.pub(runId, { type: 'start', runId, total, passed: 0, failed: 0 });

    for (const { cmd, cwd, title } of commands) {
      const line = `\n[${new Date().toISOString()}] Running: ${title}\n$ ${cmd}\n`;
      log += line;
      this.pub(runId, { type: 'log', runId, message: line });

      let output = '';
      const exitCode = await new Promise<number>((resolve) => {
        const proc = spawn(cmd, [], {
          cwd: cwd ?? process.cwd(),
          shell: true,
          env: { ...process.env },
        });

        proc.stdout.on('data', (d: Buffer) => { output += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { output += d.toString(); });

        const timeout = setTimeout(() => { proc.kill('SIGTERM'); }, 5 * 60 * 1000);
        proc.on('close', (code) => {
          clearTimeout(timeout);
          const trimmed = output.slice(0, 8000);
          log += trimmed + '\n';
          this.pub(runId, { type: 'log', runId, message: trimmed });
          resolve(code ?? 1);
        });
      });

      const adapter = detectAdapter(cmd);
      const parsed = adapter ? adapter.parseOutput(output, '', exitCode) : null;

      if (exitCode === 0) {
        passed++;
        const msg = parsed?.summary ? `PASS: ${title} — ${parsed.summary}` : `PASS: ${title}`;
        this.pub(runId, { type: 'case_result', runId, message: msg, passed, failed, total });
      } else {
        failed++;
        const msg = parsed?.summary ? `FAIL: ${title} — ${parsed.summary}` : `FAIL: ${title} (exit ${exitCode})`;
        this.pub(runId, { type: 'case_result', runId, message: msg, passed, failed, total });
      }
    }

    const durationMs = Date.now() - startedAt;
    const status: TestRun['status'] = failed > 0 ? 'failed' : 'passed';
    const now = new Date().toISOString();

    // Collect coverage from first command with a valid cwd
    let coverageJson: string | null = null;
    for (const { cwd } of commands) {
      const cov = collectCoverage(cwd);
      if (cov) {
        coverageJson = JSON.stringify(cov);
        break;
      }
    }

    db.prepare('UPDATE test_runs SET status=?, passed=?, failed=?, skipped=0, duration_ms=?, log=?, completed_at=?, coverage_json=? WHERE id=?')
      .run(status, passed, failed, durationMs, log, now, coverageJson, runId);

    this.pub(runId, { type: 'done', runId, status, passed, failed, total });
  }
}

export const testRunner = new TestRunnerService();
