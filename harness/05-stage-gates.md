# 05 · 阶段门禁（stage 推进 SSOT）

> **本文档是阶段推进规则的唯一权威**。`04-agent-protocol.md` 只定义 HTTP 形状，`07-execution-playbook.md` 只定义阶段内的执行回路；两者的 stage 描述都指针回这里。
>
> 后端 **不会** 自动执行业务门禁（仅强制 STAGE_TRANSITIONS + plannedReleaseDate）。
> 本文档定义的是 **Agent 必须自检** 的门禁条件。门禁失败时 Agent 应拒绝 PATCH，并写入 `manual_log` 解释原因。
>
> ⚠️ 当前多数门禁是 SOFT（agent 自律）。规划中：将 `all_subtasks_terminal` / `verify_commands_all_pass` / `git_clean_and_pushed` 升为 HARD（后端 `POST /api/quality-gate/check` 拒绝）。届时本文档会同步更新。

## 0. 门禁的执行模型

```
┌────────────────┐       ┌──────────────────┐       ┌────────────────────────┐
│ Agent 想推进阶段 │ ───▶ │ 调用本文档的检查清单 │ ───▶ │ 全部通过 → PATCH stage  │
│                │       │ (使用 GET 接口)    │       │ 任一失败 → 不 PATCH +    │
│                │       │                  │       │ POST manual_log + 提示   │
└────────────────┘       └──────────────────┘       └────────────────────────┘
```

检查项分两类：

- **HARD**（后端兜底会拒绝）— Agent 即使遗漏，服务端也会返回 400。
- **SOFT**（仅 Agent 自检）— 后端无校验；Agent 漏检会带病推进。

## 1. backlog → analyzing

| 类型 | 条件 |
|------|------|
| HARD | `STAGE_TRANSITIONS.backlog` 包含 `analyzing` |
| HARD | RequirementSpec § 4 校验通过（title / priority / projects） |
| SOFT | `projects[*].project` 全部存在（`GET /api/projects`） |
| SOFT | `kind=standard` 时 `projects.length ≥ 1` |

Agent 操作：

```
1. GET /api/requirements/:id → 确认 stage='backlog'
2. （可选）GET /api/projects 验证 projects 存在
3. POST /api/analysis/start { agents:[...] }
4. PATCH /api/requirements/:id { stage:'analyzing' }
5. POST /api/events { type:'stage_change', payload:{from:'backlog', to:'analyzing'} }
```

## 2. analyzing → development

| 类型 | 条件 |
|------|------|
| HARD | 必须有至少一份 RequirementAnalysis 处于 `awaiting` 或 `done` 才能 choose |
| HARD | `POST /api/analysis/:id/choose` 会自动把 stage 设为 development（无需再 PATCH） |
| SOFT | 选择的 analysis 的 proposedTasks 全部 DAG 校验通过 |
| SOFT | 至少 1 个 task；每条 measurable acceptance 至少被 1 个 task 引用 |
| SOFT | Workspace 已就绪：`GET /requirements/:id/worktree-status` → `ready: true` |

Agent 操作：

```
1. GET /api/analysis/by-req/:reqId
2. 选定 status='awaiting' 的最优候选
3. 自检 proposedTasks（DAG / acceptance 覆盖）
4. POST /api/analysis/:id/choose
   副作用: 落 subTasks + stage='development'
5. 验证 worktree: GET /api/requirements/:id/worktree-status
6. POST /api/events { type:'stage_change', payload:{from:'analyzing', to:'development'} }
```

> 切勿先 PATCH stage 再 choose：先 PATCH 会让 choose 校验失败。

## 3. development → uat

最重要的一道门禁。

| 类型 | 条件 | 标准化 name | v1.1 状态 |
|------|------|------|------|
| HARD | `STAGE_TRANSITIONS.development` 含 `uat` | `stage_transition_legal` | 已实现 |
| HARD（计划） | 所有 subTasks 达到终态：`status ∈ {done, cancelled}`，且至少 1 个 `done` | `all_subtasks_terminal` | **SOFT → HARD**（待后端实现） |
| HARD（计划） | 所有 done 子任务都有签名 VerifyResult 且 failed=0 | `verify_commands_all_pass` | **SOFT → HARD**（待 verify-runner） |
| HARD（计划） | dev→uat 合并已完成，MergePublishRun.state=`completed` | `merge_publish_completed` | **SOFT → HARD** |
| HARD（计划） | git 工作区干净且本地分支已推 origin | `git_clean_and_pushed` | **SOFT → HARD** |
| SOFT | Lint / Typecheck 在每个 project 仓库均通过 | `lint_clean` | 仍 SOFT |
| SOFT | 单元测试覆盖率 ≥ 60%（建议值，可按项目配置） | `coverage_threshold` | 仍 SOFT，阈值可调 |

> SOFT → HARD 的升级路径见 [04-agent-protocol.md § 16.5](04-agent-protocol.md)。后端上线后，**在 PATCH 阶段时后端会主动调 `POST /quality-gate/check`**，任一 HARD 失败返回 422。agent 不需重复自检这些 HARD 项，但仍需自检 SOFT 项以减少无效 PATCH。

Agent 操作：

```
1. GET /api/subtasks/by-req/:reqId
   → 任一 status='running'/'pending'/'ready' 都视为门禁未通过
2. 对每个 SubTask: 跑 verifyCommands，收集 TestRunResult
3. POST /api/merge-publish/start { reqId, projects:[...] }
   订阅 SSE → 若 paused-conflict，进入冲突解决子流程（§ 7）
4. 合并完成后: PATCH /api/requirements/:id { stage:'uat' }
5. POST /api/events { type:'stage_change', from:'development', to:'uat' }
```

## 4. uat → prerelease

| 类型 | 条件 |
|------|------|
| HARD | `STAGE_TRANSITIONS.uat` 含 `prerelease` |
| HARD | `plannedReleaseDate` 必须在 PATCH 时已设置 |
| SOFT | 集成/系统测试通过率 ≥ 95% |
| SOFT | 无 P0 / P1 缺陷开着 |
| SOFT | 验收测试在 UAT 环境跑过；测试报告作为附件保存 |

Agent 操作：

```
1. 跑集成/系统/E2E 测试套件
2. 收集结果 → TestRunResult
3. 将报告写为附件: POST /api/requirements/:id/attachments
4. PATCH /api/requirements/:id { stage:'prerelease', plannedReleaseDate:'YYYY-MM-DD' }
5. POST /api/events(stage_change)
```

## 5. prerelease → released

| 类型 | 条件 | 标准化 name | v1.1 状态 |
|------|------|------|------|
| HARD | `STAGE_TRANSITIONS.prerelease` 含 `released` | `stage_transition_legal` | 已实现 |
| HARD | `released` 是终态，进入后不可回退 | — | 已实现 |
| HARD（计划） | 必须 actor=user。拒绝 actor=agent 直推 | `human_signoff` | **新增 HARD**（备注） |
| HARD（计划） | 存在一条 verdict='accepted' 且 ciStatus.conclusion='success' 的 Run | `release_run_completed` + `ci_green` | **新增 HARD**（待 Runs） |
| SOFT | 全量回归测试通过（100%） | `regression_pass` | 仍 SOFT |
| SOFT | 冒烟测试在生产/预生产环境通过 | `smoke_pass` | 仍 SOFT |
| SOFT | 发布文档已生成：`releaseDoc` 不为 null | `release_doc_present` | 仍 SOFT |

> 备注：`prerelease → released` 是唯一**拒绝 agent 独立完成**的阶段迁移，对应 [PRINCIPLES.md § 5](PRINCIPLES.md) 人在 loop 里的位点。

Agent 操作：

```
1. POST /api/release/start
   订阅 SSE → 跟随状态机
2. 完成后 PATCH /api/requirements/:id { stage:'released' }
   服务端自动写 releasedAt
3. POST /api/events(stage_change)
```

## 6. 任意阶段 → backlog（回退）

| 类型 | 条件 |
|------|------|
| HARD | 仅 `analyzing` / `development` 允许回退到 backlog（STAGE_TRANSITIONS） |
| SOFT | 回退前应归档当前 chatSessions |
| SOFT | 若 worktree 已 commit 的工作要保留，回退前先 push |

## 7. 冲突解决子流程（被多个门禁共享）

任何阶段进入 paused-conflict（release / merge-publish）时：

```
1. GET /api/<release|merge-publish>/:runId/conflicts → ConflictFile[]
2. 对每个冲突文件:
   a. GET /:runId/conflicts/file?project&path → { ours, theirs, base }
   b. 选项 A: POST /:runId/conflicts/ai-suggest → { merged }
   c. 选项 B: Agent 自己合并出 merged 文本
   d. PUT /:runId/conflicts/file body:{ project, path, merged }
3. POST /:runId/resume
4. 继续监听 SSE 直到 state='completed' 或 'failed'
```

## 8. 归档（独立维度）

```
PATCH /api/requirements/:id { archivedAt: '<iso>' }   归档
PATCH /api/requirements/:id { archivedAt: null }      取消归档
```

无门禁；任何阶段都可归档。归档不影响 stage。

## 9. 失败处理与回滚

| 场景 | Agent 行为 |
|------|----------|
| verifyCommands 失败 N 次 | 创建修复 SubTask |
| merge 冲突无法 AI 解决 | 写 manual_log 标 `level: warn`，提示用户接管 |
| CI 部署失败 | cancel release run，做根因排查 |
| 后端 PATCH 返回 400 | 读返回 error 字符串理解原因；不要硬重试 |

## 10. 门禁审计

每次门禁通过/失败，Agent **必须**写一条审计事件（v1.0 现状）：

```json
POST /api/events
{
  "reqId": "<id>",
  "type": "manual_log",
  "payload": {
    "kind": "gate_check",
    "from": "<source_stage>",
    "to": "<target_stage>",
    "checks": [
      { "name": "all_subtasks_terminal", "level": "HARD", "passed": true },
      { "name": "verify_commands_all_pass", "level": "HARD", "passed": true, "details": { "passed": 12, "failed": 0 } },
      { "name": "lint_clean", "level": "SOFT", "passed": true }
    ],
    "result": "passed"
  }
}
```

> v1.1 后：本事件被后端 `QualityGateCheck` 资源取代（参 [04-agent-protocol.md § 16.1](04-agent-protocol.md)）。进入过渡期后 `manual_log gate_check` 以"冗余审计"身份保留。
