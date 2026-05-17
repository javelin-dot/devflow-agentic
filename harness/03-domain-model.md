# 03 · 领域模型与 Schema 索引

> 字段速查表。定义 DevFlow 系统的核心数据模型，不依赖特定实现的源码行号。

## 0. 命名约定

| 层级 | 命名风格 | 说明 |
|------|---------|------|
| 共享类型 | PascalCase | `Requirement`, `SubTask`, `ChatSession` |
| 数据库列 | snake_case | `created_at`, `req_id`, `dev_branch` |
| API 字段 | camelCase | `devBranch`, `createdAt`, `reqId` |
| 枚举值 | snake_case 或小写 | `stage_change`, `backlog` |

## 1. 核心枚举

```ts
Stage     = 'backlog' | 'analyzing' | 'development' | 'uat' | 'prerelease' | 'released';
Priority  = 'critical' | 'high' | 'medium' | 'low';
RequirementKind = 'standard' | 'no_code';
EventType =
  'stage_change' | 'agent_run' | 'subtask_done' |
  'subtask_error' | 'ops_action' | 'manual_log';
SubTaskStatus = 'pending' | 'ready' | 'running' | 'done' | 'error' | 'cancelled';
```

`STAGE_TRANSITIONS` 见 `01-architecture.md` § 2。

## 2. Requirement

主实体，代表一个需求的完整生命周期。

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| id | string | ✅ | auto-gen | 主键 |
| title | string | ✅ | – | ≤60 字（约定） |
| description | string | – | "" | Markdown |
| kind | RequirementKind | ✅ | standard | – |
| stage | Stage | ✅ | backlog | – |
| priority | Priority | ✅ | medium | – |
| createdAt | iso string | ✅ | server now | – |
| releasedAt | YYYY-MM-DD \| null | – | null | stage=released 时自动写入 |
| archivedAt | iso string \| null | – | null | 独立于 stage |
| plannedReleaseDate | YYYY-MM-DD \| null | – | null | prerelease 必填 |
| workspace | string \| null | – | null | worktree 目录名 |
| tags | string[] | – | [] | JSON 数组 |
| projects | RequirementProjectLink[] | – | [] | 多对多关联 |
| apiDoc | json \| null | – | null | AI 生成的 API 文档 |
| releaseDoc | json \| null | – | null | DDL/DML/config/rollback |
| analysisChosenId | string \| null | – | null | 已采纳的 analysis.id |
| profileId | string \| null | – | null | RunnerProfile 引用 |
| notes | string \| null | – | null | – |
| attachments | string[] | – | [] | 文件名列表（由 fs 扫描） |

## 3. RequirementProjectLink

需求与项目的多对多关联。

| 字段 | 说明 |
|------|------|
| project | Project.name |
| devBranch | string \| null |
| uatBranch | string \| null |
| isPrimary | bool；至少 1 个 true |

PK = (reqId, project)，全量替换语义（PATCH `projects[]` 会清空再插入）。

## 4. SubTask

子任务，表示一个可被 Agent 独立执行的工作单元。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | auto-gen |
| reqId | string | FK requirements.id |
| analysisId | string \| null | 由哪一份 analysis 派生 |
| title | string | 简短可执行的描述 |
| prompt | string | 注入给 agent 的子任务 prompt（含 acceptance/verifyCommands） |
| project | string \| null | 关联项目 |
| type | string | 自由字符串（migration / impl / test / doc / config / ops） |
| wave | number | DAG 层级 |
| taskDependsOn | string[] (json) | 前置 task id |
| acceptance | string[] (json) | 关联 acceptance.id |
| verifyCommands | string[] (json) | 子任务自检命令 |
| risk | string \| null | – |
| sessionId | string \| null | 关联 chatSession |
| agent | string \| null | 执行该任务的 agent |
| status | SubTaskStatus | pending → ready → running → done/error/cancelled |
| errorMessage | string \| null | – |
| notes | string \| null | – |
| ordering | number | 同 wave 内的顺序 |
| createdAt / startedAt / completedAt | iso \| null | 时间戳 |

## 5. Project

项目配置，代表一个可被管理的代码仓库。

| 字段 | 说明 |
|------|------|
| name (PK) | 项目唯一标识 |
| path | 仓库本地路径 |
| lang | "java" / "node" / "python" / "go" / … |
| branch | 默认主分支 |
| services | string[]；多服务仓库的子服务名 |
| sortOrder | UI 排序 |
| rootDir | 扫描根 |
| mergeStrategy | merge \| squash \| rebase |
| autoPush | merge 后是否自动推 origin |
| jenkinsTemplateId | CI 模板外键 |

## 6. ChatSession & Message

ChatSession：Agent 会话实例。

| 字段 | 说明 |
|------|------|
| id | – |
| reqId | 关联需求 |
| title | 会话标题 |
| status | active \| archived |
| agent | "claude-code" / "codex" / "gemini" / … |
| stageSnapshot | 创建时所在 stage |
| archiveReason | manual \| stage_changed |
| cwd | 子进程 CWD（worktree 路径） |
| agentLocked | 一旦跑过即 true，换 agent 返回 409 |
| profileId | RunnerProfile 引用 |

Message：会话内的消息。

| 字段 | 说明 |
|------|------|
| id | – |
| sessionId | FK |
| role | user \| assistant \| tool |
| content | 文本或 JSON 字符串 |
| entryType | NormalizedEntryType |
| action | json（ActionType payload） |
| status | pending \| running \| success \| error |

启动时 `pending` → `error`（INV-09）。

## 7. RequirementAnalysis

分析候选结果。

| 字段 | 说明 |
|------|------|
| id | – |
| reqId | FK |
| sessionId | FK |
| agent / model / prompt | 启动参数 |
| raw | 原始流式输出 |
| output | json（AnalysisOutput） |
| status | running \| awaiting \| done \| error \| cancelled |
| errorMessage | – |
| createdAt / completedAt | – |

## 8. AnalysisOutput（Spec 内化的中间结构）

分析引擎产出的结构化结果，存入 `requirementAnalyses.output`：

```yaml
problem: string
acceptance: AcceptanceItem[]      # 同 02-requirement-spec.md § 3.3
proposedTasks: TaskProposal[]     # 字段映射 SubTask 字段子集
apiContracts: ApiContract[]
mqContracts: MqContract[]
dataModel: DataModelEntry[]
risks: string[]
outOfScope: string[]
notes: string
```

> Agent 在分析阶段产出该结构后，调用 `POST /api/analysis/:id/choose` 时由后端派生 SubTasks。

## 9. NormalizedEntry & AgentStreamEvent

Agent 输出的归一化格式。

NormalizedEntry.type 取值：

```
user_message  assistant_message  thinking  tool_use  system
error         todo_update        plan      token_usage
```

ActionType（部分）：

```
file_read  file_edit  command_run  search  web_fetch
todo       plan       task         tool
```

ToolStatus：`pending | running | success | error`

AgentStreamEvent（SSE 帧）：

```
{ type: 'entry', entry: NormalizedEntry }
{ type: 'patch', entryId: string, patch: Partial<NormalizedEntry> }
{ type: 'session', agentSessionId: string }
{ type: 'exit', code: number }
{ type: 'error', message: string }
```

工具审批：`entry.type='tool_use'` 且 `entry.status='pending'` 时等待
`POST /api/agent/permission/:sessionId/:entryId/:decision`。

## 10. 契约相关类型

| 类型 | 说明 |
|------|------|
| ApiContract | method / path / owner / request / response / notes |
| MqContract | topic / publisher / subscribers / payload |
| DataModelEntry | table + columns |

`GET /api/contracts` 聚合三类契约数据。

## 11. RequirementEvent

事件审计记录。

```ts
{ id, reqId|null, type: EventType|string, payload: json, actor: 'user'|'agent'|'system', createdAt }
```

Agent 写入规约：
- 标识 actor 为 `agent`
- `type` 未在枚举里也能存（数据库列是 TEXT），但建议优先用已定义枚举
- `payload` 惯例字段：

```yaml
stage_change:   { from: Stage|null, to: Stage, reason?: string }
agent_run:      { sessionId, agent, model?, prompt_preview, exitCode?, duration_ms? }
subtask_done:   { subtaskId, verifyCommands?: string[], duration_ms?, result?: TestRunResult }
subtask_error:  { subtaskId, errorMessage, retries? }
ops_action:     { action: string, refId? }
manual_log:     { text, level?: 'info'|'warn'|'error' }
```

## 12. ReleaseRun / MergePublishRun

| 维度 | ReleaseRun | MergePublishRun |
|------|-----------|-----------------|
| 用途 | 正式发布流程 | dev → uat 合并 |
| 状态 | running \| paused-conflict \| completed \| failed \| cancelled | 同 |
| 事件流 | SSE | SSE |
| 冲突处理 | GET/PUT conflicts + AI suggest | 共用同基础设施 |

Agent 一般不直接构造，而是 `POST start → poll status → resume on conflict`。

## 13. RunnerProfile

Agent 运行配置。

| 字段 | 说明 |
|------|------|
| id / name / agentId | 标识 |
| installCommand | 安装/升级该 CLI 的脚本 |
| envOverrides | json；运行时合并到子进程 env |

> Agent 不应直接读写 envOverrides；profile 的语义是"由人配好，agent 接受即用"。

---

## v1.1 协议草案（status: draft，待后端实现）

> 这三个模型把当前 "agent 自报通过" 升级为 "机械事实证明通过"。
> 参照 OpenAI Symphony 的 isolated autonomous run + proof of work 命题。
> 后端实现前，agent 不应假设这些端点已存在；实现后本节"draft" 标识移除。

## 14. VerifyResult（draft）

独立 verify-runner 子系统签名落库的命令执行结果。**唯一合法的 "verify_commands 通过" 凭据**——agent 自报不可作数。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | – |
| subtaskId | string | FK subtasks.id |
| reqId | string | 冗余便于查询 |
| commands | json | 执行的命令列表 + 每条 exitCode / durationMs / stdoutTail / stderrTail |
| total / passed / failed | number | 汇总（按命令计） |
| durationMs | number | – |
| sandboxId | string | runner 内部沙箱标识，便于回放 |
| signedAt | iso | runner 签名时间 |
| signature | string | HMAC(`subtaskId|commandsHash|signedAt`, runnerSecret)，防伪造 |
| logArtifact | string \| null | `attachments/<reqId>/runs/<iso>.log` 全量输出路径 |

约定：
- subtask `status='done'` 仅当存在最新 VerifyResult.failed=0 时成立
- 后端 PATCH `/subtasks/:id { status:'done' }` 时校验 VerifyResult 存在与签名
- agent 不能直接 POST VerifyResult；只能调 `POST /subtasks/:id/verify` 触发 runner

## 15. QualityGateCheck（draft）

阶段推进前的机械门禁检查记录。把 [05-stage-gates.md § 10](05-stage-gates.md) 现在以 `manual_log` 自报的 gate_check **升级为后端正式资源**。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | – |
| reqId | string | – |
| fromStage / toStage | Stage | – |
| checks | CheckItem[] | 见下 |
| result | `passed` \| `failed` | – |
| createdAt | iso | – |
| createdBy | `user` \| `agent` \| `system` | 触发方 |

```ts
CheckItem = {
  name: string;            // 标准化 name（见下表）
  level: 'HARD' | 'SOFT';  // HARD 失败则后端拒绝 PATCH
  passed: boolean;
  details?: object;
}
```

标准化 name（与 [05](05-stage-gates.md) 各小节门禁对应）：

```
stage_transition_legal      // STAGE_TRANSITIONS 合法
planned_release_date_set    // prerelease 阶段必填
spec_v4_validation          // validate-spec 全过
all_subtasks_terminal       // 无 pending/ready/running
verify_commands_all_pass    // 每个 done subtask 有签名 VerifyResult
git_clean_and_pushed        // 工作区干净 + 已推 origin
merge_publish_completed     // dev→uat 合并完成
coverage_threshold          // ≥ 配置阈值
ci_green                    // CI run conclusion=success
release_run_completed       // ReleaseRun.state=completed
```

## 16. Run（draft）— Proof Bundle 容器

一次完整的 stage 推进尝试。把 spec 快照、commits、verify 结果、CI 状态、复杂度、产物链接打包成**可重放、不可伪造**的快照。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | – |
| reqId | string | – |
| fromStage / toStage | Stage | 本次推进的两端 |
| specSnapshotHash | string | spec.yaml 内容 SHA-256 |
| specSnapshotPath | string | `attachments/<reqId>/runs/<runId>/spec.yaml` |
| commits | `[{project, sha, subject}]` | 本次涉及的全部 commit |
| verifyResultIds | string[] | 关联的 VerifyResult.id 集合 |
| qualityGateCheckId | string | 关联的 QualityGateCheck.id |
| ciStatus | `{ url, conclusion, durationMs }` \| null | 来自 CI 集成 |
| complexity | `{ filesChanged, linesAdded, linesDeleted }` | 由后端 git diff 派生 |
| artifacts | string[] | 截屏 / 录屏 / 报告路径列表 |
| verdict | `accepted` \| `rejected` \| `pending` | – |
| createdBy | `user` \| `agent` | – |
| createdAt / completedAt | iso | – |

约定：
- 每次合法的 stage PATCH 必须能定位到一个 `verdict='accepted'` 的 Run
- Run 是不可变记录；rejected 后开新 Run，不修改旧记录
- agent 推进 prerelease→released 时**必须**把当前 Run 的 ciStatus 与 qualityGateCheck 一并提交

> Symphony 把这种 bundle 称为 **proof of work**。我们沿用同一概念但落到 DevFlow 的领域字段。
