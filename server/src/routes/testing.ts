import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { db, newId } from '../db/index.js';
import { testRunner, detectAdapter, checkCLIExists, getAdapterForTestType } from '../services/testRunner.js';
import { qualityGateService } from '../services/qualityGate.js';
import { notificationDispatcher } from '../services/notificationDispatcher.js';
import { defectFixOrchestrator } from '../services/defectFixOrchestrator.js';
import { createAgentProcess } from '../agents/SessionManager.js';
import { resolveDefaultAgent } from '../agents/resolveDefaultAgent.js';
import { runAgentUntilDone } from '../agents/agentRunner.js';
import { rbacGuard } from '../middleware/auth.js';
import type { TestPlan, TestCase, TestRun, GateCheck, Defect, TestType, NormalizedEntry } from '@devflow/shared';

export const testingRouter = new Hono();

// ===== Parse helpers =====

function parsePlan(row: Record<string, unknown>): TestPlan {
  return {
    id: row.id as string,
    reqId: row.req_id as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    status: (row.status as TestPlan['status']) ?? 'active',
    createdAt: row.created_at as string,
  };
}

function parseCase(row: Record<string, unknown>): TestCase {
  return {
    id: row.id as string,
    planId: row.plan_id as string,
    reqId: row.req_id as string,
    title: row.title as string,
    description: (row.description as string) ?? '',
    testType: (row.test_type as TestCase['testType']) ?? 'functional',
    legacyType: (row.legacy_type as string | null) ?? null,
    command: (row.command as string) ?? '',
    expectedExitCode: (row.expected_exit_code as number) ?? 0,
    status: (row.status as TestCase['status']) ?? 'draft',
    cwd: (row.cwd as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function parseRun(row: Record<string, unknown>): TestRun {
  return {
    id: row.id as string,
    planId: (row.plan_id as string | null) ?? null,
    reqId: (row.req_id as string | null) ?? null,
    runType: (row.run_type as TestRun['runType']) ?? 'manual',
    status: (row.status as TestRun['status']) ?? 'pending',
    total: (row.total as number) ?? 0,
    passed: (row.passed as number) ?? 0,
    failed: (row.failed as number) ?? 0,
    skipped: (row.skipped as number) ?? 0,
    durationMs: (row.duration_ms as number | null) ?? null,
    log: (row.log as string) ?? '',
    coverageJson: (row.coverage_json as string | null) ?? null,
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function parseCheck(row: Record<string, unknown>): GateCheck {
  return {
    id: row.id as string,
    reqId: row.req_id as string,
    fromStage: row.from_stage as string,
    toStage: row.to_stage as string,
    checkType: row.check_type as string,
    result: (row.result as GateCheck['result']) ?? 'pending',
    detail: (row.detail as string) ?? '',
    createdAt: row.created_at as string,
  };
}

function parseDefect(row: Record<string, unknown>): Defect {
  return {
    id: row.id as string,
    reqId: row.req_id as string,
    subTaskId: (row.sub_task_id as string | null) ?? null,
    testRunId: (row.test_run_id as string | null) ?? null,
    title: row.title as string,
    description: (row.description as string) ?? '',
    severity: (row.severity as Defect['severity']) ?? 'P2',
    status: (row.status as Defect['status']) ?? 'pending_confirm',
    resolution: (row.resolution as string | null) ?? null,
    wontFixReason: (row.wont_fix_reason as Defect['wontFixReason']) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ===== Test Plans =====

// GET /test-plans/by-req/:reqId — list plans for req (with test_cases count)
testingRouter.get('/test-plans/by-req/:reqId', (c) => {
  const { reqId } = c.req.param();
  const rows = db.prepare(`
    SELECT tp.*, COUNT(tc.id) as case_count
    FROM test_plans tp
    LEFT JOIN test_cases tc ON tc.plan_id = tp.id
    WHERE tp.req_id = ?
    GROUP BY tp.id
    ORDER BY tp.created_at DESC
  `).all(reqId) as Record<string, unknown>[];
  return c.json(rows.map(r => ({ ...parsePlan(r), caseCount: (r.case_count as number) ?? 0 })));
});

// GET /test-plans/:id — single plan with its test_cases
testingRouter.get('/test-plans/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM test_plans WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  const cases = db.prepare('SELECT * FROM test_cases WHERE plan_id=? ORDER BY created_at ASC').all(id) as Record<string, unknown>[];
  return c.json({ ...parsePlan(row), testCases: cases.map(parseCase) });
});

// POST /test-plans — create
testingRouter.post('/test-plans', async (c) => {
  const body = await c.req.json() as { reqId: string; title: string; description?: string };
  const id = newId('tp');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO test_plans (id, req_id, title, description, status, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, body.reqId, body.title, body.description ?? '', 'active', now);
  const row = db.prepare('SELECT * FROM test_plans WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parsePlan(row), 201);
});

// PATCH /test-plans/:id — update
testingRouter.patch('/test-plans/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json() as Partial<{ title: string; description: string; status: string }>;
  const updates: string[] = [];
  const vals: unknown[] = [];
  if (body.title !== undefined) { updates.push('title=?'); vals.push(body.title); }
  if (body.description !== undefined) { updates.push('description=?'); vals.push(body.description); }
  if (body.status !== undefined) { updates.push('status=?'); vals.push(body.status); }
  if (updates.length === 0) return c.json({ error: 'no fields' }, 400);
  vals.push(id);
  db.prepare(`UPDATE test_plans SET ${updates.join(',')} WHERE id=?`).run(...vals);
  const row = db.prepare('SELECT * FROM test_plans WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parsePlan(row));
});

// DELETE /test-plans/:id
testingRouter.delete('/test-plans/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM test_plans WHERE id=?').run(id);
  return c.json({ ok: true });
});

// ===== Test Cases =====

// GET /test-cases?reqId=
testingRouter.get('/test-cases', (c) => {
  const reqId = c.req.query('reqId');
  if (!reqId) return c.json({ error: 'reqId required' }, 400);
  const rows = db.prepare('SELECT * FROM test_cases WHERE req_id=? ORDER BY created_at DESC').all(reqId) as Array<Record<string, unknown>>;
  return c.json(rows.map(parseCase));
});

// POST /test-plans/:planId/cases
testingRouter.post('/test-plans/:planId/cases', async (c) => {
  const { planId } = c.req.param();
  const plan = db.prepare('SELECT req_id FROM test_plans WHERE id=?').get(planId) as { req_id: string } | undefined;
  if (!plan) return c.json({ error: 'plan not found' }, 404);
  const body = await c.req.json() as { title: string; testType?: string; command: string; cwd?: string; description?: string };
  const id = newId('tc');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO test_cases (id, plan_id, req_id, title, description, test_type, command, expected_exit_code, status, cwd, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, planId, plan.req_id, body.title, body.description ?? '', body.testType ?? 'functional', body.command, 0, 'draft', body.cwd ?? null, now);

  // M7 T5: dual-write to documents
  const docId = newId('doc');
  db.prepare(
    `INSERT INTO documents (id, req_id, type, title, content, status, current_version, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'test_case', ?, ?, 'draft', 1, ?, ?, NULL)`
  ).run(docId, plan.req_id, body.title, JSON.stringify({ ...body, planId, testCaseId: id }), now, now);

  const row = db.prepare('SELECT * FROM test_cases WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseCase(row), 201);
});

// PATCH /test-cases/:id
testingRouter.patch('/test-cases/:id', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json() as Partial<{ title: string; description: string; testType: string; command: string; cwd: string; status: string; expectedExitCode: number }>;
  const updates: string[] = [];
  const vals: unknown[] = [];
  if (body.title !== undefined) { updates.push('title=?'); vals.push(body.title); }
  if (body.description !== undefined) { updates.push('description=?'); vals.push(body.description); }
  if (body.testType !== undefined) { updates.push('test_type=?'); vals.push(body.testType); }
  if (body.command !== undefined) { updates.push('command=?'); vals.push(body.command); }
  if (body.cwd !== undefined) { updates.push('cwd=?'); vals.push(body.cwd); }
  if (body.status !== undefined) { updates.push('status=?'); vals.push(body.status); }
  if (body.expectedExitCode !== undefined) { updates.push('expected_exit_code=?'); vals.push(body.expectedExitCode); }
  if (updates.length === 0) return c.json({ error: 'no fields' }, 400);
  vals.push(id);
  db.prepare(`UPDATE test_cases SET ${updates.join(',')} WHERE id=?`).run(...vals);
  const row = db.prepare('SELECT * FROM test_cases WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);

  // M7 T5: update corresponding document
  const doc = db.prepare("SELECT id, content FROM documents WHERE type='test_case' AND content LIKE ? AND deleted_at IS NULL LIMIT 1")
    .get(`%"testCaseId":"${id}"%`) as { id: string; content: string } | undefined;
  if (doc) {
    const content = JSON.parse(doc.content);
    if (body.title !== undefined) content.title = body.title;
    if (body.description !== undefined) content.description = body.description;
    if (body.testType !== undefined) content.testType = body.testType;
    if (body.command !== undefined) content.command = body.command;
    if (body.cwd !== undefined) content.cwd = body.cwd;
    if (body.status !== undefined) content.status = body.status;
    if (body.expectedExitCode !== undefined) content.expectedExitCode = body.expectedExitCode;
    db.prepare("UPDATE documents SET title=?, content=?, updated_at=? WHERE id=?")
      .run(body.title ?? content.title, JSON.stringify(content), new Date().toISOString(), doc.id);
  }

  return c.json(parseCase(row));
});

// DELETE /test-cases/:id
testingRouter.delete('/test-cases/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM test_cases WHERE id=?').run(id);

  // M7 T5: soft delete corresponding document
  const doc = db.prepare("SELECT id FROM documents WHERE type='test_case' AND content LIKE ? AND deleted_at IS NULL LIMIT 1")
    .get(`%"testCaseId":"${id}"%`) as { id: string } | undefined;
  if (doc) {
    db.prepare('UPDATE documents SET deleted_at=? WHERE id=?').run(new Date().toISOString(), doc.id);
  }

  return c.json({ ok: true });
});

// ===== Test Runs =====

// GET /test-runs?reqId=
testingRouter.get('/test-runs', (c) => {
  const reqId = c.req.query('reqId');
  const rows = reqId
    ? db.prepare('SELECT * FROM test_runs WHERE req_id=? ORDER BY started_at DESC LIMIT 20').all(reqId) as Record<string, unknown>[]
    : db.prepare('SELECT * FROM test_runs ORDER BY started_at DESC LIMIT 20').all() as Record<string, unknown>[];
  return c.json(rows.map(parseRun));
});

// GET /test-runs/:id
testingRouter.get('/test-runs/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM test_runs WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseRun(row));
});

// POST /test-runs — SSE streaming run
testingRouter.post('/test-runs', async (c) => {
  const body = await c.req.json() as {
    planId?: string;
    reqId?: string;
    runType?: string;
    commands: Array<{ cmd: string; cwd?: string; title: string; testType?: string }>;
  };

  // M7: CLI detection — return 424 if any adapter CLI is missing
  const validation = await testRunner.validateCommands(body.commands);
  if (!validation.ok) {
    return c.json({
      error: 'Missing test framework CLI',
      missing: validation.missing,
    }, 424);
  }

  // M7: Penetration whitelist check
  for (const cmd of body.commands) {
    if (cmd.testType === 'penetration') {
      const allowListRaw = db.prepare("SELECT value FROM settings WHERE key='security.penTestAllowList'").get() as { value: string } | undefined;
      const allowList = allowListRaw ? JSON.parse(allowListRaw.value) as string[] : [];
      if (allowList.length === 0) {
        return c.json({ error: 'penetration testing blocked: penTestAllowList is empty' }, 403);
      }
      // Extract target URL from command (naive: first http/https URL)
      const urlMatch = cmd.cmd.match(/https?:\/\/[^\s]+/);
      const targetUrl = urlMatch?.[0] ?? '';
      const allowed = allowList.some((pattern: string) => targetUrl.includes(pattern));
      if (!allowed) {
        return c.json({ error: `penetration testing target ${targetUrl} not in allowList`, allowList }, 403);
      }
    }
  }

  const runId = newId('run');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO test_runs (id, plan_id, req_id, run_type, status, total, passed, failed, skipped, log, started_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(runId, body.planId ?? null, body.reqId ?? null, body.runType ?? 'manual', 'pending', 0, 0, 0, 0, '', now);

  return streamSSE(c, async (stream) => {
    let done = false;
    const unsub = testRunner.subscribe(runId, async (evt) => {
      await stream.writeSSE({ data: JSON.stringify(evt) });
      if (evt.type === 'done' || evt.type === 'error') done = true;
    });
    setImmediate(() => {
      void testRunner.runPlan({
        runId,
        commands: body.commands,
        runType: (body.runType ?? 'manual') as TestRun['runType'],
      });
    });
    await new Promise<void>((resolve) => {
      const iv = setInterval(() => { if (done) { clearInterval(iv); resolve(); } }, 200);
      setTimeout(() => { clearInterval(iv); resolve(); }, 10 * 60 * 1000);
    });
    unsub();
  });
});

// ===== Gate Checks =====

// GET /gate-checks?reqId=
testingRouter.get('/gate-checks', (c) => {
  const reqId = c.req.query('reqId');
  const rows = reqId
    ? db.prepare('SELECT * FROM gate_checks WHERE req_id=? ORDER BY created_at DESC LIMIT 50').all(reqId) as Record<string, unknown>[]
    : db.prepare('SELECT * FROM gate_checks ORDER BY created_at DESC LIMIT 50').all() as Record<string, unknown>[];
  return c.json(rows.map(parseCheck));
});

// POST /gate-checks/run — SSE streaming gate check
testingRouter.post('/gate-checks/run', async (c) => {
  const body = await c.req.json() as { reqId: string; fromStage: string; toStage: string };
  const subKey = newId('gk');

  return streamSSE(c, async (stream) => {
    let done = false;
    const unsub = qualityGateService.subscribe(subKey, async (evt) => {
      await stream.writeSSE({ data: JSON.stringify(evt) });
      if (evt.type === 'done' || evt.type === 'error') done = true;
    });
    setImmediate(() => {
      void qualityGateService.runGate({
        reqId: body.reqId,
        fromStage: body.fromStage,
        toStage: body.toStage,
        subKey,
      });
    });
    await new Promise<void>((resolve) => {
      const iv = setInterval(() => { if (done) { clearInterval(iv); resolve(); } }, 200);
      setTimeout(() => { clearInterval(iv); resolve(); }, 5 * 60 * 1000);
    });
    unsub();
  });
});

// ===== AI Test Case Generation =====

function buildTestCasePrompt(reqId: string, scope: 'smoke' | 'full'): string {
  const req = db.prepare('SELECT * FROM requirements WHERE id=?').get(reqId) as Record<string, unknown> | undefined;
  if (!req) throw new Error('requirement not found');

  // Get requirement spec
  const reqSpec = db.prepare("SELECT content FROM documents WHERE req_id=? AND type='requirement_spec' AND deleted_at IS NULL ORDER BY current_version DESC LIMIT 1")
    .get(reqId) as { content: string } | undefined;

  // Get design spec
  const designSpec = db.prepare("SELECT content FROM documents WHERE req_id=? AND type='design_spec' AND deleted_at IS NULL ORDER BY current_version DESC LIMIT 1")
    .get(reqId) as { content: string } | undefined;

  // Get subtasks
  const subtasks = db.prepare('SELECT title, prompt, acceptance FROM sub_tasks WHERE req_id=? ORDER BY wave, ordering').all(reqId) as Array<Record<string, unknown>>;

  // Get attachments
  const attachments = db.prepare('SELECT filename FROM attachments WHERE req_id=?').all(reqId) as Array<{ filename: string }>;

  let prompt = `# Test Case Generation Task\n\n`;
  prompt += `## Source Requirement\n`;
  prompt += `- Title: ${req.title}\n`;
  prompt += `- Description: ${req.description ?? ''}\n`;

  if (reqSpec) {
    prompt += `\n## Requirement Spec\n${reqSpec.content}\n`;
  }
  if (designSpec) {
    prompt += `\n## Design Spec\n${designSpec.content}\n`;
  }

  if (subtasks.length > 0) {
    prompt += `\n## Sub Tasks\n`;
    for (const st of subtasks) {
      prompt += `- ${st.title as string}\n`;
    }
  }

  if (attachments.length > 0) {
    prompt += `\n## Attachments\n`;
    for (const a of attachments) {
      prompt += `- ${a.filename}\n`;
    }
  }

  prompt += `\n## Instructions\n`;
  prompt += `Generate ${scope === 'smoke' ? '5 to 10 smoke test cases' : 'a comprehensive set of test cases'} for this requirement.\n`;
  prompt += `Output MUST be a valid JSON array with this structure:\n`;
  prompt += `[{"title":"string","description":"string","testType":"smoke|functional|performance|stress|penetration","command":"string","expectedExitCode":0,"steps":["step1","step2"]}]\n`;
  prompt += `Do NOT wrap in markdown code blocks. Output raw JSON only.\n`;

  return prompt;
}

function saveGeneratedCases(reqId: string, cases: Array<Partial<TestCase>>, scope: string): { planId: string; count: number } {
  const now = new Date().toISOString();

  // Find or create test plan
  let plan = db.prepare('SELECT id FROM test_plans WHERE req_id=? AND status=? ORDER BY created_at DESC LIMIT 1')
    .get(reqId, 'active') as { id: string } | undefined;

  if (!plan) {
    const req = db.prepare('SELECT title FROM requirements WHERE id=?').get(reqId) as { title: string } | undefined;
    const planId = newId('tp');
    db.prepare('INSERT INTO test_plans (id, req_id, title, description, status, created_at) VALUES (?,?,?,?,?,?)')
      .run(planId, reqId, req?.title ?? 'Test Plan', `AI generated ${scope} cases`, 'active', now);
    plan = { id: planId };
  }

  let count = 0;
  for (const tc of cases) {
    if (!tc.title || !tc.command) continue;
    const id = newId('tc');
    const testType = (tc.testType as TestType) ?? 'functional';
    db.prepare(
      `INSERT INTO test_cases (id, plan_id, req_id, title, description, test_type, command, expected_exit_code, status, cwd, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, plan.id, reqId, tc.title, tc.description ?? '', testType, tc.command, tc.expectedExitCode ?? 0, 'draft', tc.cwd ?? null, now);

    // M7 T5: dual-write to documents
    const docId = newId('doc');
    db.prepare(
      `INSERT INTO documents (id, req_id, type, title, content, status, current_version, created_at, updated_at, deleted_at)
       VALUES (?, ?, 'test_case', ?, ?, 'draft', 1, ?, ?, NULL)`
    ).run(docId, reqId, tc.title, JSON.stringify({ ...tc, planId: plan.id, testCaseId: id }), now, now);

    count++;
  }

  return { planId: plan.id, count };
}

const GenerateSchema = z.object({
  reqId: z.string(),
  agent: z.string().optional(),
  scope: z.enum(['smoke', 'full']).optional().default('full'),
});

testingRouter.post('/test-cases/generate', async (c) => {
  const body = GenerateSchema.parse(await c.req.json());

  const req = db.prepare('SELECT title FROM requirements WHERE id=?').get(body.reqId) as { title: string } | undefined;
  if (!req) return c.json({ error: 'requirement not found' }, 404);

  return streamSSE(c, async (stream) => {
    const sessionId = newId('ses');
    const agent = body.agent ?? resolveDefaultAgent();
    const session = createAgentProcess(agent, sessionId);
    const prompt = buildTestCasePrompt(body.reqId, body.scope);
    let { collected, errorMsg } = await runAgentUntilDone(session, prompt, {
      onEntry: (entry) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'entry', entry }) });
      },
      onPatch: (entryId, patch) => {
        void stream.writeSSE({ data: JSON.stringify({ type: 'patch', entryId, patch }) });
      },
    });

    if (!errorMsg && collected.length > 0) {
      let parsed: Array<Partial<TestCase>> = [];
      try {
        const raw = collected.join('').trim();
        // Remove markdown code block wrapper if present
        const jsonStr = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        parsed = JSON.parse(jsonStr) as Array<Partial<TestCase>>;
        if (!Array.isArray(parsed)) parsed = [];
      } catch (e) {
        errorMsg = `Failed to parse generated test cases: ${(e as Error).message}`;
      }

      if (!errorMsg) {
        const result = saveGeneratedCases(body.reqId, parsed, body.scope);
        await stream.writeSSE({ data: JSON.stringify({ type: 'done', planId: result.planId, count: result.count }) });

        // Record event
        const evtId = newId('evt');
        db.prepare(
          `INSERT INTO events (id, req_id, type, payload, actor, created_at) VALUES (?,?,?,?,?,?)`
        ).run(evtId, body.reqId, 'test_cases_generated', JSON.stringify({ scope: body.scope, count: result.count, planId: result.planId }), 'system', new Date().toISOString());
      }
    }

    if (errorMsg) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: errorMsg }) });
    }
  });
});

// ===== Test Reports =====

function generateTestReportMarkdown(reqId: string, scope: 'all' | 'release'): string {
  const req = db.prepare('SELECT title FROM requirements WHERE id=?').get(reqId) as { title: string } | undefined;
  const reqTitle = req?.title ?? reqId;

  // Aggregate test runs by testType
  const runs = db.prepare('SELECT * FROM test_runs WHERE req_id=? ORDER BY started_at DESC').all(reqId) as Array<Record<string, unknown>>;

  // Aggregate defects
  const defects = db.prepare('SELECT * FROM defects WHERE req_id=? ORDER BY severity, created_at DESC').all(reqId) as Array<Record<string, unknown>>;

  let md = `# Test Report — ${reqTitle}\n\n`;
  md += `**Scope:** ${scope} | **Generated:** ${new Date().toISOString()}\n\n`;

  // Execution summary
  md += `## Execution Summary\n\n`;
  if (runs.length === 0) {
    md += '> No test runs found.\n\n';
  } else {
    md += `| Run ID | Type | Status | Passed | Failed | Total | Duration(ms) |\n`;
    md += `|--------|------|--------|--------|--------|-------|-------------|\n`;
    for (const r of runs) {
      md += `| ${r.id} | ${r.run_type} | ${r.status} | ${r.passed} | ${r.failed} | ${r.total} | ${r.duration_ms ?? '-'} |\n`;
    }
    md += '\n';
  }

  // Defects
  md += `## Defects\n\n`;
  if (defects.length === 0) {
    md += '> No defects found.\n\n';
  } else {
    md += `| ID | Severity | Status | Title |\n`;
    md += `|----|----------|--------|-------|\n`;
    for (const d of defects) {
      md += `| ${d.id} | ${d.severity} | ${d.status} | ${d.title} |\n`;
    }
    md += '\n';
  }

  // Performance metrics placeholder
  md += `## Performance Metrics\n\n`;
  const perfRuns = runs.filter(r => r.run_type === 'performance');
  if (perfRuns.length === 0) {
    md += '> No performance test runs found.\n\n';
  } else {
    md += `| Run ID | P95 | P99 |\n`;
    md += `|--------|-----|-----|\n`;
    for (const r of perfRuns) {
      md += `| ${r.id} | — | — |\n`;
    }
    md += '\n';
  }

  // Penetration findings placeholder
  md += `## Penetration Findings\n\n`;
  const penRuns = runs.filter(r => r.run_type === 'penetration');
  if (penRuns.length === 0) {
    md += '> No penetration test runs found.\n\n';
  } else {
    md += `| Run ID | Findings |\n`;
    md += `|--------|----------|\n`;
    for (const r of penRuns) {
      md += `| ${r.id} | — |\n`;
    }
    md += '\n';
  }

  return md;
}

testingRouter.post('/test-reports/generate', async (c) => {
  const body = await c.req.json() as { reqId: string; scope?: 'all' | 'release' };
  const { reqId, scope = 'all' } = body;

  const req = db.prepare('SELECT title FROM requirements WHERE id=?').get(reqId) as { title: string } | undefined;
  if (!req) return c.json({ error: 'requirement not found' }, 404);

  const content = generateTestReportMarkdown(reqId, scope);
  const now = new Date().toISOString();

  // Save to documents as test_report
  const docId = newId('doc');
  db.prepare(
    `INSERT INTO documents (id, req_id, type, title, content, status, current_version, created_at, updated_at)
     VALUES (?, ?, 'test_report', ?, ?, 'draft', 1, ?, ?)`
  ).run(docId, reqId, `${req.title} — Test Report`, content, now, now);

  const vId = newId('dvr');
  db.prepare(
    `INSERT INTO document_versions (id, doc_id, version, content, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(vId, docId, 1, content, 'Generated test report', now);

  return c.json({ id: docId, content });
});

// ===== Defects =====

// GET /defects?reqId=
testingRouter.get('/defects', (c) => {
  const reqId = c.req.query('reqId');
  const rows = reqId
    ? db.prepare("SELECT * FROM defects WHERE req_id=? ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, created_at DESC").all(reqId) as Record<string, unknown>[]
    : db.prepare("SELECT * FROM defects ORDER BY CASE severity WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, created_at DESC").all() as Record<string, unknown>[];
  return c.json(rows.map(parseDefect));
});

// GET /defects/:id
testingRouter.get('/defects/:id', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT * FROM defects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(parseDefect(row));
});

// POST /defects
testingRouter.post('/defects', async (c) => {
  const body = await c.req.json() as {
    reqId: string;
    title: string;
    severity?: string;
    subTaskId?: string;
    testRunId?: string;
    description?: string;
  };
  const id = newId('df');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO defects (id, req_id, sub_task_id, test_run_id, title, description, severity, status, resolution, wont_fix_reason, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, body.reqId, body.subTaskId ?? null, body.testRunId ?? null, body.title, body.description ?? '', body.severity ?? 'P2', 'pending_confirm', null, null, now, now);
  const row = db.prepare('SELECT * FROM defects WHERE id=?').get(id) as Record<string, unknown>;
  return c.json(parseDefect(row), 201);
});

// Defect status transition rules
function assertDefectStatusTransition(current: Defect['status'], next: Defect['status']): boolean {
  const allowed: Record<string, string[]> = {
    pending_confirm: ['to_fix', 'wont_fix'],
    to_fix: ['to_regress'],
    to_regress: ['closed', 'to_fix'],
    closed: ['to_fix'],
    wont_fix: ['to_fix'],
  };
  return allowed[current]?.includes(next) ?? false;
}

// PATCH /defects/:id
testingRouter.patch('/defects/:id', rbacGuard('qa', 'dev', 'admin'), async (c) => {
  const { id } = c.req.param();
  const oldRow = db.prepare('SELECT * FROM defects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!oldRow) return c.json({ error: 'not found' }, 404);
  const oldStatus = oldRow.status as Defect['status'];

  const body = await c.req.json() as Partial<{
    title: string; description: string; severity: string; status: string;
    resolution: string; wontFixReason: string;
  }>;

  // Validate status transition
  if (body.status !== undefined && body.status !== oldStatus) {
    if (!assertDefectStatusTransition(oldStatus, body.status as Defect['status'])) {
      return c.json({ error: `cannot transition from ${oldStatus} to ${body.status}` }, 409);
    }
  }

  // wont_fix must have reason
  if (body.status === 'wont_fix' && !body.wontFixReason && !oldRow.wont_fix_reason) {
    return c.json({ error: 'wont_fix requires wontFixReason' }, 400);
  }

  const updates: string[] = [];
  const vals: unknown[] = [];
  if (body.title !== undefined) { updates.push('title=?'); vals.push(body.title); }
  if (body.description !== undefined) { updates.push('description=?'); vals.push(body.description); }
  if (body.severity !== undefined) { updates.push('severity=?'); vals.push(body.severity); }
  if (body.status !== undefined) { updates.push('status=?'); vals.push(body.status); }
  if (body.resolution !== undefined) { updates.push('resolution=?'); vals.push(body.resolution); }
  if (body.wontFixReason !== undefined) { updates.push('wont_fix_reason=?'); vals.push(body.wontFixReason); }
  if (updates.length === 0) return c.json({ error: 'no fields' }, 400);
  updates.push('updated_at=?');
  vals.push(new Date().toISOString());
  vals.push(id);
  db.prepare(`UPDATE defects SET ${updates.join(',')} WHERE id=?`).run(...vals);
  const row = db.prepare('SELECT * FROM defects WHERE id=?').get(id) as Record<string, unknown> | undefined;

  // Record status history
  if (body.status !== undefined && body.status !== oldStatus) {
    const hId = newId('dsh');
    db.prepare(
      `INSERT INTO defect_status_history (id, defect_id, actor, from_status, to_status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(hId, id, 'user', oldStatus, body.status, body.resolution ?? null, new Date().toISOString());

    // M6: trigger notification on status change
    notificationDispatcher.dispatch('defect.status_changed', {
      defectId: id,
      reqId: row?.req_id as string,
      title: row?.title as string,
      fromStatus: oldStatus,
      toStatus: body.status,
    });
  }

  return c.json(parseDefect(row!));
});

// POST /defects/:id/assign-agent
testingRouter.post('/defects/:id/assign-agent', async (c) => {
  const { id } = c.req.param();
  const body = await c.req.json() as { agent?: string };
  const defect = db.prepare('SELECT * FROM defects WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!defect) return c.json({ error: 'not found' }, 404);

  const result = await defectFixOrchestrator.run(id, body.agent);
  return c.json(result);
});

// GET /defects/:id/history
testingRouter.get('/defects/:id/history', (c) => {
  const { id } = c.req.param();
  const rows = db.prepare(
    'SELECT * FROM defect_status_history WHERE defect_id=? ORDER BY created_at ASC'
  ).all(id) as Array<Record<string, unknown>>;
  return c.json(rows.map(r => ({
    id: r.id as string,
    defectId: r.defect_id as string,
    actor: r.actor as string,
    fromStatus: r.from_status as string | null,
    toStatus: r.to_status as string,
    note: r.note as string | null,
    createdAt: r.created_at as string,
  })));
});

// DELETE /defects/:id
testingRouter.delete('/defects/:id', (c) => {
  const { id } = c.req.param();
  db.prepare('DELETE FROM defects WHERE id=?').run(id);
  return c.json({ ok: true });
});

// ===== CoverageCollector =====

// GET /test-runs/:id/coverage
testingRouter.get('/test-runs/:id/coverage', (c) => {
  const { id } = c.req.param();
  const row = db.prepare('SELECT coverage_json FROM test_runs WHERE id=?').get(id) as { coverage_json: string | null } | undefined;
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({ coverage: row.coverage_json ? JSON.parse(row.coverage_json) : null });
});

// ===== PIV-TDD Loop =====

// POST /tdd-loop/run — Plan → Generate → Run → Verify via SSE
testingRouter.post('/tdd-loop/run', async (c) => {
  const body = await c.req.json() as { reqId: string; scope?: 'smoke' | 'full' };
  const req = db.prepare('SELECT title FROM requirements WHERE id=?').get(body.reqId) as { title: string } | undefined;
  if (!req) return c.json({ error: 'requirement not found' }, 404);

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ type: 'phase', phase: 'plan', message: 'Generating test cases with AI...' }) });

    // Phase 1: Plan — generate test cases
    const sessionId = newId('ses');
    const session = createAgentProcess(resolveDefaultAgent(), sessionId);
    const prompt = buildTestCasePrompt(body.reqId, body.scope ?? 'full');
    const { collected, errorMsg: genError } = await runAgentUntilDone(session, prompt, {
      onEntry: (entry) => {
        if (entry.type === 'assistant_message') {
          void stream.writeSSE({ data: JSON.stringify({ type: 'chunk', content: entry.content }) });
        }
      },
    });

    if (genError) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: genError }) });
      return;
    }

    let parsedCases: Array<Partial<TestCase>> = [];
    try {
      const raw = collected.join('').trim();
      const jsonStr = raw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      parsedCases = JSON.parse(jsonStr) as Array<Partial<TestCase>>;
      if (!Array.isArray(parsedCases)) parsedCases = [];
    } catch (e) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: `Failed to parse generated cases: ${(e as Error).message}` }) });
      return;
    }

    const saveResult = saveGeneratedCases(body.reqId, parsedCases, body.scope ?? 'full');
    await stream.writeSSE({ data: JSON.stringify({ type: 'phase', phase: 'implement', message: `Saved ${saveResult.count} test cases to plan ${saveResult.planId}` }) });

    // Phase 2: Verify — run generated test cases
    const commands = parsedCases
      .filter(tc => tc.command)
      .map(tc => ({ cmd: tc.command!, cwd: tc.cwd ?? undefined, title: tc.title ?? 'Untitled', testType: tc.testType ?? 'functional' }));

    if (commands.length === 0) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'done', planId: saveResult.planId, count: saveResult.count, runId: null }) });
      return;
    }

    const validation = await testRunner.validateCommands(commands);
    if (!validation.ok) {
      await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: 'Missing test framework CLI', missing: validation.missing }) });
      return;
    }

    const runId = newId('run');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO test_runs (id, plan_id, req_id, run_type, status, total, passed, failed, skipped, log, started_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(runId, saveResult.planId, body.reqId, 'manual', 'pending', 0, 0, 0, 0, '', now);

    await stream.writeSSE({ data: JSON.stringify({ type: 'phase', phase: 'verify', message: `Running ${commands.length} tests...`, runId }) });

    let runDone = false;
    const unsub = testRunner.subscribe(runId, async (evt) => {
      await stream.writeSSE({ data: JSON.stringify({ type: 'run_event', event: evt }) });
      if (evt.type === 'done' || evt.type === 'error') runDone = true;
    });

    setImmediate(() => {
      void testRunner.runPlan({
        runId,
        commands,
        runType: 'manual',
      });
    });

    await new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        if (runDone) { clearInterval(iv); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(iv); runDone = true; resolve(); }, 10 * 60 * 1000);
    });

    unsub();

    // Fetch coverage
    const runRow = db.prepare('SELECT coverage_json FROM test_runs WHERE id=?').get(runId) as { coverage_json: string | null } | undefined;
    const coverage = runRow?.coverage_json ? JSON.parse(runRow.coverage_json) : null;

    await stream.writeSSE({ data: JSON.stringify({ type: 'done', planId: saveResult.planId, count: saveResult.count, runId, coverage }) });

    // Record event
    const evtId = newId('evt');
    db.prepare(
      `INSERT INTO events (id, req_id, type, payload, actor, created_at) VALUES (?,?,?,?,?,?)`
    ).run(evtId, body.reqId, 'tdd_loop_completed', JSON.stringify({ scope: body.scope ?? 'full', count: saveResult.count, planId: saveResult.planId, runId }), 'system', new Date().toISOString());
  });
});
