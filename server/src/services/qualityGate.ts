import { db, newId } from '../db/index.js';
import type { GateCheckResult, GateCheckEvent } from '@devflow/shared';

type GateSSECallback = (event: GateCheckEvent) => void;

// Check definitions per transition
const GATE_CHECKS: Record<string, Array<{ type: string; desc: string }>> = {
  'development→uat': [
    { type: 'all_subtasks_terminal', desc: '所有子任务到达终态且至少一个完成' },
    { type: 'merge_publish_completed', desc: 'dev → uat 合并发布已完成' },
    { type: 'no_open_defects_p0', desc: '无 P0 级别未解决缺陷' },
    { type: 'test_run_pass', desc: '最近一次测试运行通过' },
  ],
  'uat→prerelease': [
    { type: 'defect_clear', desc: '无未关闭缺陷（待确认/待修复/待回归）' },
    { type: 'acceptance_test_pass', desc: '验收测试通过' },
  ],
  'prerelease→released': [
    { type: 'release_run_accepted', desc: '正式发布记录已完成并验收通过' },
    { type: 'no_open_defects_any', desc: '无任何未解决缺陷' },
    { type: 'regression_pass', desc: '回归测试全部通过' },
  ],
};

function runCheck(reqId: string, checkType: string): { result: GateCheckResult; detail: string } {
  switch (checkType) {
    case 'all_subtasks_done':
    case 'all_subtasks_terminal': {
      const row = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
          SUM(CASE WHEN status NOT IN ('done','cancelled') THEN 1 ELSE 0 END) as open
        FROM sub_tasks
        WHERE req_id=?
      `).get(reqId) as { total: number; done: number | null; open: number | null };
      const total = row.total ?? 0;
      const done = row.done ?? 0;
      const open = row.open ?? 0;
      if (total === 0) return { result: 'failed', detail: '没有可验收的开发子任务' };
      if (done === 0) return { result: 'failed', detail: '没有已完成的开发子任务' };
      return open === 0
        ? { result: 'passed', detail: `子任务已到达终态，完成 ${done}/${total}` }
        : { result: 'failed', detail: `${open} 个子任务未到达终态` };
    }
    case 'merge_publish_completed': {
      const row = db.prepare(`
        SELECT id, state, verdict
        FROM release_runs
        WHERE req_id=? AND mode='mergePublish'
        ORDER BY started_at DESC
        LIMIT 1
      `).get(reqId) as { id: string; state: string; verdict: string | null } | undefined;
      if (!row) return { result: 'failed', detail: '没有 dev → uat 合并发布记录' };
      const completed = row.state === 'done' || row.state === 'completed';
      if (completed && row.verdict === 'accepted') {
        return { result: 'passed', detail: `合并发布已完成: ${row.id}` };
      }
      return { result: 'failed', detail: `最近合并发布 ${row.id} 状态=${row.state}, verdict=${row.verdict ?? '-'}` };
    }
    case 'no_open_defects_p0': {
      const r = db.prepare("SELECT COUNT(*) as cnt FROM defects WHERE req_id=? AND severity='P0' AND status IN ('pending_confirm','to_fix','to_regress')").get(reqId) as { cnt: number };
      return r.cnt === 0
        ? { result: 'passed', detail: '无 P0 缺陷' }
        : { result: 'failed', detail: `存在 ${r.cnt} 个未解决 P0 缺陷` };
    }
    case 'defect_clear': {
      const r = db.prepare("SELECT COUNT(*) as cnt FROM defects WHERE req_id=? AND status IN ('pending_confirm','to_fix','to_regress')").get(reqId) as { cnt: number };
      return r.cnt === 0
        ? { result: 'passed', detail: '无未关闭缺陷' }
        : { result: 'failed', detail: `存在 ${r.cnt} 个未关闭缺陷` };
    }
    case 'no_open_defects_any': {
      const r = db.prepare("SELECT COUNT(*) as cnt FROM defects WHERE req_id=? AND status IN ('pending_confirm','to_fix','to_regress')").get(reqId) as { cnt: number };
      return r.cnt === 0
        ? { result: 'passed', detail: '无未解决缺陷' }
        : { result: 'failed', detail: `存在 ${r.cnt} 个未解决缺陷` };
    }
    case 'test_run_pass': {
      const r = db.prepare("SELECT status FROM test_runs WHERE req_id=? ORDER BY started_at DESC LIMIT 1").get(reqId) as { status: string } | undefined;
      if (!r) return { result: 'skipped', detail: '无测试运行记录（跳过）' };
      return r.status === 'passed'
        ? { result: 'passed', detail: '最近测试运行通过' }
        : { result: 'failed', detail: `最近测试运行状态: ${r.status}` };
    }
    case 'acceptance_test_pass': {
      const r = db.prepare("SELECT status FROM test_runs WHERE req_id=? AND run_type='acceptance' ORDER BY started_at DESC LIMIT 1").get(reqId) as { status: string } | undefined;
      if (!r) return { result: 'skipped', detail: '无验收测试记录（跳过）' };
      return r.status === 'passed'
        ? { result: 'passed', detail: '验收测试通过' }
        : { result: 'failed', detail: `验收测试状态: ${r.status}` };
    }
    case 'regression_pass': {
      const r = db.prepare("SELECT status FROM test_runs WHERE req_id=? AND run_type='regression' ORDER BY started_at DESC LIMIT 1").get(reqId) as { status: string } | undefined;
      if (!r) return { result: 'skipped', detail: '无回归测试记录（跳过）' };
      return r.status === 'passed'
        ? { result: 'passed', detail: '回归测试通过' }
        : { result: 'failed', detail: `回归测试状态: ${r.status}` };
    }
    case 'release_run_accepted': {
      const row = db.prepare(`
        SELECT id, state, verdict
        FROM release_runs
        WHERE req_id=? AND mode='release'
        ORDER BY started_at DESC
        LIMIT 1
      `).get(reqId) as { id: string; state: string; verdict: string | null } | undefined;
      if (!row) return { result: 'failed', detail: '没有正式发布记录' };
      const completed = row.state === 'done' || row.state === 'completed';
      if (completed && row.verdict === 'accepted') {
        return { result: 'passed', detail: `正式发布已验收: ${row.id}` };
      }
      return { result: 'failed', detail: `最近正式发布 ${row.id} 状态=${row.state}, verdict=${row.verdict ?? '-'}` };
    }
    default:
      return { result: 'skipped', detail: `未知检查项: ${checkType}` };
  }
}

class QualityGateService {
  private subs = new Map<string, GateSSECallback[]>();

  subscribe(key: string, cb: GateSSECallback): () => void {
    const list = this.subs.get(key) ?? [];
    list.push(cb);
    this.subs.set(key, list);
    return () => this.subs.set(key, (this.subs.get(key) ?? []).filter(f => f !== cb));
  }

  private pub(key: string, evt: GateCheckEvent): void {
    for (const cb of this.subs.get(key) ?? []) cb(evt);
  }

  async runGate(params: { reqId: string; fromStage: string; toStage: string; subKey: string }): Promise<boolean> {
    const { reqId, fromStage, toStage, subKey } = params;
    const key = `${fromStage}→${toStage}`;
    const checks = GATE_CHECKS[key] ?? [];
    const now = new Date().toISOString();
    let allPassed = true;

    for (const check of checks) {
      this.pub(subKey, { type: 'check_start', checkType: check.type });
      const { result, detail } = runCheck(reqId, check.type);

      const id = newId('gc');
      db.prepare('INSERT INTO gate_checks (id, req_id, from_stage, to_stage, check_type, result, detail, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, reqId, fromStage, toStage, check.type, result, detail, now);

      this.pub(subKey, { type: 'check_result', checkType: check.type, result, detail });

      if (result === 'failed') allPassed = false;
    }

    if (checks.length === 0) {
      this.pub(subKey, { type: 'done', allPassed: true, message: '无需检查项' });
    } else {
      this.pub(subKey, { type: 'done', allPassed, message: allPassed ? '所有门禁通过' : '存在门禁失败项' });
    }

    return allPassed;
  }
}

export function checkTransitionSync(reqId: string, fromStage: string, toStage: string): { passed: boolean; checks: Array<{ type: string; result: GateCheckResult; detail: string }> } {
  const key = `${fromStage}→${toStage}`;
  const checks = GATE_CHECKS[key] ?? [];
  const results: Array<{ type: string; result: GateCheckResult; detail: string }> = [];
  let passed = true;
  for (const check of checks) {
    const { result, detail } = runCheck(reqId, check.type);
    results.push({ type: check.type, result, detail });
    if (result === 'failed') passed = false;
  }
  return { passed, checks: results };
}

export const qualityGateService = new QualityGateService();
export { GATE_CHECKS };
