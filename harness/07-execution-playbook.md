# 07 · 端到端 Agent Playbook

> 这是 Agent 从"看到一个新 RequirementSpec"到"需求被标记 released"的标准操作序列。
> 严格按本 playbook 执行可以保证：阶段不漏过、事件可审计、失败可回滚。

## 0. 前置假设

- 后端在 `{BASE_URL}` 运行且可达。
- 至少一个 Agent CLI 已安装（`GET /api/agent/availability`）。
- 已扫描项目（`GET /api/projects` 非空）。
- 已配置工作区根目录（`GET /api/settings`，key=`workspaceRoot`）。

## 1. Phase 0 — 摄入 RequirementSpec

### 1.1 输入来源

Agent 可能从以下来源拿到 RequirementSpec：

| 来源 | 处理 |
|------|------|
| 用户给文本 `spec.yaml` | 解析 → 校验（见 `02-requirement-spec.md` § 4） |
| 已存在的需求附件 | `GET /api/requirements/:id/attachments/spec.yaml` |
| 自然语言描述 | Agent 自己起一份 RequirementSpec 草稿，提交用户审批 |

### 1.2 校验 + 创建

```
1. 校验 spec（02-requirement-spec.md § 4）
2. POST /api/projects/scan { root: <若 spec 中 projects 不在现有列表> }
3. POST /api/requirements
   {
     title, description, priority, kind,
     stage: 'backlog',
     plannedReleaseDate?, tags, projects:[...]
   }
   → 拿到 { id }
4. （可选）上传 spec 作为附件:
   POST /api/requirements/:id/attachments  (file=spec.yaml)
5. POST /api/events
   { reqId:<id>, type:'manual_log',
     payload:{ kind:'spec_ingested', spec_version:'1.0' } }
```

## 2. Phase 1 — backlog → analyzing

```
1. GET /api/requirements/:id → 确认 stage='backlog'
2. GET /api/agent/availability → 选 ≥1 个可用 CLI
3. POST /api/analysis/start
   {
     reqId,
     agents: ['<agent-1>', '<agent-2>'],     // 多候选
     prompt: <省略 = 用后端默认 analysis prompt>,
     profileId?: <可选>
   }
   → { analyses: [...] }
4. PATCH /api/requirements/:id { stage:'analyzing' }
5. POST /api/events(stage_change, from:'backlog', to:'analyzing')
```

### 2.1 等待 / 监督分析

```
loop {
  GET /api/analysis/by-req/:reqId
  if 所有 analyses.status ∈ {done, awaiting, error, cancelled} → break
  else sleep 5s
}
```

## 3. Phase 2 — analyzing → development

### 3.1 选择候选

```
1. GET /api/analysis/by-req/:reqId
2. 过滤 status='awaiting' 的候选
3. 对每个候选: 解析 output.proposedTasks 并自检
   - DAG 无环
   - 所有 task.project ∈ requirement.projects
   - 每条 measurable acceptance 至少被引用
4. 选定最优候选
```

### 3.2 落地（关键：choose 自动改 stage）

```
1. POST /api/analysis/:analysisId/choose
   副作用:
     - 派生 subTasks 入库
     - requirements.analysisChosenId = <analysisId>
     - requirements.stage = 'development'   ← 不要手动 PATCH
2. GET /api/requirements/:id/worktree-status
   若 ready=false:
     - 触发 worktree 创建
     - 重新 GET 验证 ready=true
3. POST /api/events
   { type:'stage_change', from:'analyzing', to:'development', payload:{ analysisId } }
```

## 4. Phase 3 — development（核心循环）

> 阶段进入/退出规则的权威定义见 `05-stage-gates.md`。本节仅描述 development 阶段内部的执行回路。

按 SubTask 的 DAG wave 逐层执行。

### 4.1 调度

```
function nextRunnableSubtasks(reqId): SubTask[] {
  const all = GET /api/subtasks/by-req/:reqId
  return all.filter(t =>
    t.status === 'pending'
    && t.taskDependsOn.every(d => all.find(x => x.id===d)?.status === 'done')
  )
}
```

同 wave 内：
- 同 project 必须**串行**（避免 worktree race）
- 跨 project 可**并行**

### 4.2 执行单个 SubTask

```
1. 创建/复用 chatSession:
   POST /api/sessions { reqId, title:'<SubTask.title>', agent:'<choice>', cwd:'<worktree path>' }
2. PATCH /api/subtasks/:id { status:'running', startedAt:<iso> }
3. POST /api/agent/run (SSE)
   { sessionId, agent, prompt: <subtask.prompt>, cwd: <worktree> }
4. 流式消费：
   - tool_use pending → approve/reject
     自治策略建议：
       - 文件读取/搜索 → 自动 approve
       - 文件写入/shell → 在 worktree 内 approve，外部 reject
       - 网络请求 → 默认 reject
   - plan → accept
   - exit code !=0 → 标错
5. 子进程 exit 后: 跑 verifyCommands（见 06-test-contract.md § 3）
6. 若全部 verify 通过:
   PATCH /api/subtasks/:id { status:'done', completedAt:<iso> }
   POST /api/events(subtask_done, payload.result=TestRunResult)
   否则:
   PATCH /api/subtasks/:id { status:'error', errorMessage:<摘要> }
   POST /api/events(subtask_error)
```

### 4.3 并发控制

```
const inflight = new Set<projectName>()
function tryStart(task) {
  if (inflight.has(task.project)) return false      // 同 project 串行
  inflight.add(task.project)
  runTask(task).finally(() => inflight.delete(task.project))
  return true
}
```

### 4.4 失败重试

```
1. 第 1 次 subtask_error:
   - 创建修复 SubTask:
     POST /api/subtasks {
       reqId, title:'修复: <原 title>',
       project, type: 'fix', wave: <original.wave + 1>,
       taskDependsOn: [<original.id>],
       acceptance: [<original.acceptance>],
       verifyCommands: [<original.verifyCommands>],
       prompt: <"失败摘要 + 原 prompt">
     }
   - 重新进入 § 4.2
2. 同一 acceptance 累计失败 ≥3 次 → 停止，等待人工干预
```

### 4.5 推进到 uat

推进逻辑（门禁清单 + 顺序）的**唯一权威**是 `05-stage-gates.md` § 3。
本 Playbook 不复述；按 05 跑即可。

## 5. Phase 4 — uat

```
1. 在 UAT 环境跑集成/系统/验收测试套件
2. 收集 TestRunResult，记到 stage 级事件
3. 解决发现的缺陷: 每个缺陷 → 1 个新 SubTask (type='bug')
4. 若通过 ≥ 95% 且无开放 P0/P1 → 推进 prerelease
5. PATCH /api/requirements/:id { stage:'prerelease', plannedReleaseDate:'YYYY-MM-DD' }
6. POST /api/events(stage_change)
```

## 6. Phase 5 — prerelease

```
1. 全量回归: 复用 development 阶段所有 verifyCommands + 独立 smoke test
2. 生成发布文档: POST /api/ai/gen-release-doc { reqId }
   PATCH /api/requirements/:id { releaseDoc: <result> }
3. 启动 release run: POST /api/release/start { ... }
4. 订阅 SSE，处理冲突
5. ⛔ release run 完成后：Agent 不可自行 PATCH { stage:'released' }
   - prerelease → released 是唯一必须由人工（actor=user）触发的迁移（PRINCIPLES.md § 5）
   - Agent 操作：写 manual_log 告知人工"release run 已完成，等待人工确认发布"
     POST /api/events { type:'manual_log', payload:{ kind:'agent_note',
       text:'Release run completed. Awaiting human signoff to push to released.' } }
   - 人工在 UI 或通过 curl -H 'X-Actor: user' 执行阶段迁移
```

## 7. Phase 6 — released（终态）

```
1. 归档当前活跃 chatSessions
2. 生成发布质量报告（06 § 5.3）
3. 关闭循环
```

## 8. 异常恢复

| 异常 | 检测 | 处理 |
|------|------|------|
| 服务器重启 | API 失败 | sleep 30s 后重试；GET /api/runtime/state 恢复 |
| chatSession 死锁 | messages.status='pending' 长期不变 | POST /api/agent/interrupt；重启会话 |
| worktree 损坏 | git status 报 fatal | 删除目录，重跑 worktree-status |
| analysis 永远 awaiting | 时间戳过老 | cancel + retry |
| CI 卡队列 | SSE 长时间无 meta | 探活 CI 系统 |
| 数据库锁住 | API 5xx | 等待自动恢复 |

## 9. 自我审计清单（每个阶段末尾跑一遍）

```
[ ] 我读了 stage 当前状态（GET /requirements/:id）
[ ] 我跑过了所有 SOFT 门禁（05-stage-gates.md）
[ ] 我写了 stage_change 事件
[ ] 我把测试结果落到 events.payload.result
[ ] 我把命令完整输出存到 attachments/<reqId>/runs/
[ ] 我没有改不该改的字段（INV-05）
[ ] 我没有在 development 之后修 projects/kind
[ ] 我新建过 chatSession 而非复用已 lock 的会话（INV-01）
```

## 10. 推荐的执行框架（伪代码）

```typescript
async function drive(reqId: string) {
  while (true) {
    const req = await GET(`/requirements/${reqId}`)
    switch (req.stage) {
      case 'backlog':     await phase_backlog_to_analyzing(req); break
      case 'analyzing':   await phase_analyzing_to_development(req); break
      case 'development': await phase_development(req); break
      case 'uat':         await phase_uat(req); break
      case 'prerelease':  await phase_prerelease(req); break
      case 'released':    return  // terminal
    }
  }
}
```

每个 phase_* 函数都遵循"读状态 → 自检门禁 → 执行动作 → 写事件 → PATCH stage"四步骤。
