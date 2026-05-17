# 04 · Agent 协议手册（REST + SSE）

> Base URL: `{BASE_URL}`（默认 `http://localhost:4000/api`，由实例配置决定）
> 所有请求建议带 header：`X-Actor: agent`（事件审计会写到 `events.actor`）
> 返回值默认 JSON；SSE 端点显式标注

## 0. 约定

| 约定 | 说明 |
|------|------|
| 时间戳 | ISO-8601 字符串 |
| 日期 | `YYYY-MM-DD` |
| 错误体 | `{ error: string }` 加合理 HTTP 状态码 |
| 鉴权 | 无（local-only 工具，禁止公网暴露） |
| 限流 | 无 |
| Idempotency | 大部分 POST 不幂等；Agent 自己防重试风暴 |

## 1. 需求管理 (`/requirements`)

### 1.1 列表

```
GET /requirements
→ Requirement[]
```

### 1.2 详情

```
GET /requirements/:id
→ Requirement（含 projects、attachments 列表）
404 → { error: 'not found' }
```

### 1.3 新建

```
POST /requirements
Body:
{
  title: string,                                  // required, min 1
  description?: string,                           // default ""
  priority: 'critical'|'high'|'medium'|'low',
  kind?: 'standard'|'no_code',                    // default 'standard'
  stage?: Stage,                                  // 默认 'backlog'
  workspace?: string | null,
  tags?: string[],
  plannedReleaseDate?: 'YYYY-MM-DD'|null,
  projects?: [{ project: string, devBranch?: string|null, uatBranch?: string|null }]
}
约束:
  - kind=standard → projects.length ≥ 1
  - stage='prerelease' → plannedReleaseDate 必填
→ Requirement
```

### 1.4 PATCH（核心：阶段推进）

```
PATCH /requirements/:id
Body 可选字段（不传即不改）:
{
  title?, description?, stage?, priority?, kind?,
  workspace?, archivedAt?, tags?,
  apiDoc?, releaseDoc?, profileId?, notes?,
  plannedReleaseDate?,
  projects?: RequirementProjectLink[]   // 全量替换
}
后端校验:
  - stage 必须满足 STAGE_TRANSITIONS（否则 400）
  - stage=prerelease 时 plannedReleaseDate 必须非 null
  - description / kind / projects 仅在 SPEC_EDIT_STAGES (backlog/analyzing) 改
  - stage=released 时自动写 releasedAt
副作用:
  - 若 stage 变化：写一条 events(type='stage_change')
  - 旧 stage 的 chatSession 自动归档(archiveReason='stage_changed')
→ Requirement
```

> **Agent 用法**：大多数阶段推进通过这个 PATCH 完成，但有两个例外：
> - `analyzing → development`：必须通过 `POST /analysis/:id/choose`（会自动改 stage，**切勿再手动 PATCH**）
> - `prerelease → released`：后端仅接受 `actor=user`，拒绝 agent 直推
>
> 推进规则的**唯一权威**是 `05-stage-gates.md`；本节只描述 HTTP 形状，不复述业务规则。

### 1.5 Worktree 状态

```
GET /requirements/:id/worktree-status
→ { ready: boolean, projects: [{ project, path, exists, branch, branchExists }] }
```

### 1.6 附件

```
GET    /requirements/:id/attachments              → string[]
POST   /requirements/:id/attachments              multipart, 字段 'file', ≤20MB
DELETE /requirements/:id/attachments/:name        → { ok: true }
```

### 1.7 文档

```
GET    /requirements/:id/docs                     → string[]
GET    /requirements/:id/docs/:name               → { content: string }
POST   /requirements/:id/docs    body: {name,content}
PATCH  /requirements/:id/docs/:name body: {content}
DELETE /requirements/:id/docs/:name
```

## 2. 分析 (`/analysis`)

```
POST /analysis/start
Body:
{
  reqId: string,
  agents: string[],         // 多 CLI 并发候选
  model?: string,
  prompt?: string,          // 可留空，让后端用默认 prompt
  profileId?: string|null
}
→ { analyses: RequirementAnalysis[] }

GET  /analysis/by-req/:reqId            → RequirementAnalysis[]
POST /analysis/:id/choose               → { ok, requirement }（采纳后：派生 subTasks + stage→development）
POST /analysis/:id/retry                → 新的 RequirementAnalysis
POST /analysis/:id/cancel               → { ok: true }
```

`status` 流转：`running → awaiting | error | cancelled`，被 choose 后变 `done`。

## 3. 子任务 (`/subtasks`)

```
GET    /subtasks/by-req/:reqId          → SubTask[]
POST   /subtasks                        Body: 同 SubTask 必填字段（手动创建）
PATCH  /subtasks/:id                    仅 status=pending 时可改字段
DELETE /subtasks/:id
POST   /subtasks/:id/run                启动执行
POST   /subtasks/:id/cancel
```

> **Agent 用法**：子任务的"完成"是 Agent 自己 PATCH 改 `status='done'` + POST `subtask_done` 事件。后端不会替你判定。

## 4. 会话 (`/sessions`) 与 Agent 执行 (`/agent`)

### 4.1 会话 CRUD

```
GET    /sessions/by-req/:reqId?archived=0|1   → ChatSession[]
POST   /sessions                              Body: { reqId, title?, agent?, cwd?, profileId? }
PATCH  /sessions/:id                          Body: { title?, profileId? }
POST   /sessions/:id/archive                  Body: { reason?: 'manual'|'stage_changed' }
POST   /sessions/:id/unarchive
DELETE /sessions/:id
GET    /sessions/:id/messages?limit=200&before=<ISO>   → ChatMessage[]
```

### 4.2 SSE 执行

```
POST /agent/run                       Content-Type: application/json
Body:
{
  sessionId: string,
  agent: string,
  prompt: string,
  model?: string,
  mode?: string,
  effort?: 'low'|'medium'|'high',
  resumeAtMessageId?: string,
  cwd?: string,
  profileId?: string|null,
  images?: string[]
}
Response: text/event-stream
帧（每行 'data: <json>\n\n'）:
  { type:'entry', entry: NormalizedEntry }
  { type:'patch', entryId: string, patch: Partial<NormalizedEntry> }
  { type:'session', agentSessionId: string }
  { type:'exit', code: number }
  { type:'error', message: string }
```

工具审批：

```
POST /agent/permission/:sessionId/:entryId/:decision
:decision ∈ {'approve','reject'}
→ { ok: true }
```

计划审批：

```
POST /agent/plan/:sessionId/:decision
:decision ∈ {'accept','reject'}
```

### 4.3 控制面

```
POST   /agent/interrupt/:sessionId           中断当前流
DELETE /agent/session/:sessionId             删除持久化会话
GET    /agent/availability                   → { agents: Record<id, {present, path?}> }
GET    /agent/status                         → 运行时信息
POST   /agent/install/:id                    触发 RunnerProfile.installCommand
```

## 5. 事件 (`/events`)

```
GET  /events/by-req/:reqId?limit=200&type=<csv>&actor=<csv>   → RequirementEvent[]
GET  /events?limit=200&type=...&actor=...                     → RequirementEvent[]
POST /events
Body: { reqId?: string|null, type: string, payload: object }
→ RequirementEvent
```

> **Agent 用法**：每一个有影响的动作都应写一条事件。

## 6. 项目 (`/projects`)

```
GET   /projects                          → Project[]
POST  /projects/scan      body: { root: string | string[] }
POST  /projects/reorder   body: { names: string[] }
PATCH /projects/:name     body: { lang?, branch?, services?, ... }
```

## 7. Git (`/git/:project`)

| 端点 | 说明 |
|------|------|
| `GET /commits?req=<id>` | 该需求在该项目的相关 commits |
| `GET /diff/:hash` | 单 commit 完整 diff |
| `GET /status` | 工作区状态 |
| `GET /branch-diff?base=<b>&head=<b>` | 两分支差异 |
| `GET /working-diff` | 未提交 diff |
| `GET /branches` | 分支列表 |
| `POST /branches/refresh` | `git fetch --prune` |

## 8. 契约 (`/contracts`)

```
GET    /contracts                                 → { api, mq, dataModel }
POST   /contracts/suppress    body: { kind, key }
POST   /contracts/unsuppress  body: { kind, key }
DELETE /contracts             body: { kind, key, reqId }
```

## 9. 发布 (`/release`)

```
POST  /release/start
Body:
{
  reqId: string,
  version: { bump?: 'patch'|'minor'|'major'|'none', explicit?: string },
  branches: { project: string, baseBranch: string, headBranch: string }[],
  deploy: { jenkinsParams?: Record<string,string>, autoTrigger: boolean }[]
}
→ { runId }
GET   /release/:id                                → ReleaseRun
POST  /release/:id/resume                         恢复 paused-conflict
POST  /release/:id/cancel
GET   /release/:id/events     SSE
```

冲突解决（Agent 在 paused-conflict 时调用）：

```
GET  /release/:id/conflicts                       → ConflictFile[]
GET  /release/:id/conflicts/file?project&path     → { ours, theirs, base, merged?, status }
PUT  /release/:id/conflicts/file                  body: { project, path, merged }
POST /release/:id/conflicts/ai-suggest            body: { project, path } → { merged }
```

## 10. 合并发布 (`/merge-publish`)

```
POST  /merge-publish/start
Body:
{
  reqId: string,
  projects: [{
    project: string,
    uatBranch: string,
    devBranches: string[],
    commitMessage?: string
  }]
}
→ { runId }
GET   /merge-publish/:id
POST  /merge-publish/:id/resume
POST  /merge-publish/:id/cancel
GET   /merge-publish/:id/events     SSE
```

## 11. 日志排查 (`/logs`)

```
POST /logs/exec
Body: { targetId: string, command: string, timeoutMs?: number, host?: string }
→ { stdout, stderr, exitCode, durationMs }
  受命令白名单限制（仅允许 read-only 命令）

POST /logs/chat              SSE
Body: { messages: [{role,content}], targetIds?: string[], scopeKey?: string }
SSE 帧:
  { type:'thought', text }
  { type:'text_delta', text }
  { type:'tool_start', id, command, host, target }
  { type:'tool_result', id, stdout, stderr, exitCode, duration_ms }
  { type:'error', message }
```

## 12. 其他端点

| 模块 | 端点 |
|------|------|
| CI 模板 | `CRUD /jenkins-templates` |
| CI 触发 | `POST /jenkins/trigger`、`GET /jenkins/build-status` |
| 运行配置 | `CRUD /profiles` |
| 日志目标 | `CRUD /log-targets` |
| 设置 | `GET /settings`、`PUT /settings` |
| 运行时 | `GET /runtime/state` → 活跃 sessions/runs 快照 |
| 终端 | `GET/POST /terminal`；WS `/api/terminal/ws/:id` |
| AI 生成 | `POST /ai/gen-apidoc`、`POST /ai/gen-release-doc` |

## 13. SSE 客户端实现要点

```
1. POST SSE 端点 → 流式读取
2. 按 '\n\n' 分包，每包以 'data: ' 开头
3. JSON.parse 后按 type 分发
4. 'exit' / 'error' 收到后关闭 reader
5. 中断: abort signal + POST /api/agent/interrupt/:sessionId
```

## 14. 错误码速查

| HTTP | 含义 / 触发 |
|------|-----------|
| 400 | 校验失败 / 阶段非法 / plannedReleaseDate 缺失 |
| 404 | 资源不存在 |
| 409 | agent_locked 但试图换 agent / 冲突未解决 |
| 422 | 业务校验（比 400 更具体） |
| 500 | 服务器内部 |

## 15. 推荐的客户端契约（伪 TS）

```ts
async function patchStage(reqId: string, to: Stage, extra?: { plannedReleaseDate?: string }) {
  const res = await fetch(`${BASE_URL}/requirements/${reqId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Actor': 'agent' },
    body: JSON.stringify({ stage: to, ...extra }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.json()).error}`);
  return res.json();
}
```

---

## 16. v1.1 协议草案（status: draft，待后端实现）

> 以下端点尚未实现。Agent **不要主动调用**；可通过 `GET /api/runtime/state` 的 `features` 字段探测可用性（后端在上线后返回 `{ qualityGate: true, verifyRunner: true, runs: true }`）。
>
> 对应领域模型：[03-domain-model.md § 14-16](03-domain-model.md)。

### 16.1 Quality Gate（draft）

```
POST /quality-gate/check
Body:
{
  reqId: string,
  fromStage: Stage,
  toStage: Stage
}
处理：
  - 后端运行 [05-stage-gates.md] 中 toStage 对应节的全部 HARD/SOFT 检查
  - 产出 QualityGateCheck 资源并返回
→ QualityGateCheck   // 含 checks[].level=HARD|SOFT

GET /quality-gate/by-req/:reqId?limit=20
→ QualityGateCheck[]
```

联动：`PATCH /requirements/:id { stage }` 在 v1.1 后会后端主动触发一次 `quality-gate/check`；任一 HARD 失败返回 **422** + `{ error, gateCheck }`。

### 16.2 Verify Runner（draft）

```
POST /subtasks/:id/verify
Body: { timeoutMs?: number }   // 默认 300_000
处理：
  - 后端在隔离沙箱中按 SubTask.verifyCommands 顺序跑
  - 退出后签名产出 VerifyResult 并落库
→ VerifyResult

GET /subtasks/:id/verify-results?limit=10
→ VerifyResult[]

POST /subtasks/:id/verify  SSE变体（可选）
帧:
  { type:'command_start', command, idx }
  { type:'command_chunk', idx, stream:'stdout'|'stderr', text }
  { type:'command_end',   idx, exitCode, durationMs }
  { type:'done', resultId, signature }
```

联动：`PATCH /subtasks/:id { status:'done' }` 在 v1.1 后要求该 SubTask **至少存在 1 份 VerifyResult 且 failed=0**，否则 422。

### 16.3 Runs（draft）

```
POST /runs
Body:
{
  reqId: string,
  fromStage: Stage,
  toStage: Stage
}
处理：
  - 后端启动一次 Run：快照 spec.yaml + 收集 commits + 关联最新 VerifyResult / QualityGateCheck
  - verdict 初始为 'pending'
→ Run

GET /runs/by-req/:reqId?limit=10
→ Run[]
GET /runs/:id
→ Run                 // 包含 artifacts 与下载路径
POST /runs/:id/finalize
Body: { verdict: 'accepted' | 'rejected', notes?: string }
→ Run
GET /runs/:id/proof-bundle.zip   // 一键下载可重放 bundle
```

联动：`prerelease → released` 的 PATCH 在 v1.1 后要求存在一条 verdict='accepted' 且 ciStatus.conclusion='success' 的 Run，否则 422。

### 16.4 错误补充（draft阶段限定）

| HTTP | 含义 |
|------|------|
| 422 + `{error, gateCheck}` | quality-gate HARD 检查失败 |
| 422 + `{error, missing:'verify_result'}` | subtask done 但无合法 VerifyResult |
| 422 + `{error, missing:'run'}` | stage 推进但无对应 accepted Run |

### 16.5 迁移路径

```
v1.0 现状→ v1.1 过渡期 → v1.1 正式
agent 自报    两轨运行   迁移完成
manual_log    feature flag  后端强制
gate_check    后端返回 领先   manual_log gate_check 以“冗余审计”身份保留
```

