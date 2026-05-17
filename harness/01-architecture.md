# 01 · 架构事实速查

> 这是给 Agent 看的"系统速记本"。读完这一篇，你就知道：能调用哪些进程、数据存在哪里、流式事件长什么样。

## 1. 部署拓扑

```
┌──────────────────┐   /api/* (HTTP, SSE)    ┌────────────────────────┐
│  Client (SPA)    │ ───────────────────────▶│  Server (HTTP)          │
│  Web UI          │                          │                        │
│  - kanban board   │  WebSocket (terminal)   │  routes/*    (REST+SSE)│
│  - chat panel    │ ◀──────────────────────▶│  services/*  (业务逻辑) │
│  - terminal      │                          │  agents/*    (CLI适配)  │
└──────────────────┘                          └────────┬───────────────┘
                                                       │
                                              ┌────────┴───────────────┐
                                              │ Persistence Layer       │
                                              │  Database (SQLite/PG)  │
                                              │  Attachments (fs)      │
                                              │  Worktrees (git)       │
                                              │ Agent CLIs (PATH)      │
                                              │  claude / codex /      │
                                              │  gemini / opencode /   │
                                              │  deepseek              │
                                              └────────────────────────┘
```

- **后端端口**: 由 `PORT` 环境变量决定（默认值见实例配置）
- **前端**: SPA，开发模式下通过代理转发 `/api` 请求到后端
- **DB**: 支持 SQLite（WAL 模式 + `foreign_keys = ON`）或 PostgreSQL
- **附件**: 与 DB 同级的 `attachments/<reqId>/<file>`，文件系统为真相源
- **Worktree 根**: 设置项 `workspaceRoot` 决定（`GET /api/settings`）
- **Agent CLI**: 通过 `which <cli>` 嗅探可用性（`GET /api/agent/availability`）

## 2. 阶段流（STAGE_TRANSITIONS）

```
                ┌────────────────────────────┐
                │                            ▼
backlog ──▶ analyzing ──▶ development ──▶ uat ──▶ prerelease ──▶ released
   ▲           │              │           │           │
   │           ▼              │           │           │
   └────────  退路            ▼           ▼           │
                            backlog     development  │
                                                     │
                                                     ▼
                                                    uat
```

转换规则（参照 PRD-SPEC-v2 § 3.2）：

```
backlog:     ['analyzing', 'development']
analyzing:   ['development', 'backlog']
development: ['uat', 'prerelease', 'backlog']
uat:         ['prerelease', 'development']
prerelease:  ['released', 'uat']
released:    []   // 终态，不可回退
```

关键事实：
- `released` 之后只能归档（`archivedAt` 为独立维度），不可回退
- `development → prerelease` 是 no_code / hotfix 通道（仍需 `plannedReleaseDate`）
- `archivedAt` 是**独立维度**，与 stage 无关；归档不影响阶段

## 3. 模块映射

| 子系统 | 职责 | 关键服务 |
|--------|------|---------|
| HTTP/SSE 路由层 | 全部对外接口 | `routes/*` |
| Agent 会话池 | 管理 Agent CLI 子进程生命周期 | SessionManager + *Session 适配器 |
| 发布编排 | git merge/push + CI 触发 | ReleaseRunner 状态机 |
| 合并发布 | dev → uat 多项目合并 | MergePublishRunner 状态机 |
| 终端 PTY | 交互式 shell（经 WS bridge） | TerminalService |
| 日志执行 | 远程命令 + SSH 多跳 | SSH Service + 命令白名单 |
| Git 操作 | 仓库扫描 / 分支 / worktree | GitService |
| 数据访问 | ORM + 启动时自动迁移 | Database + bootstrap() |

## 4. 关键不变量（Agent 必须遵守）

| # | 不变量 | 后果 |
|---|--------|------|
| INV-01 | 同一 chatSessionId 一旦跑过某 agent，会话锁定，再换 agent 返回 409 | 想换 agent 必须新建 chatSession |
| INV-02 | Agent 直接 PATCH `/api/requirements/:id { stage: ... }` 推进阶段 | 后端不会替 Agent 检查业务门禁，门禁由 Agent 自检 |
| INV-03 | 后端禁止违反 STAGE_TRANSITIONS 的 PATCH（返回 400） | 必须按图走 |
| INV-04 | `stage=prerelease` 必须有 `plannedReleaseDate`，否则 400 | PATCH 时一起提交日期 |
| INV-05 | `description` / `kind` / `projects` 仅在 SPEC_EDIT_STAGES（backlog / analyzing）允许改 | 进入 development 后锁定核心字段 |
| INV-06 | SubTask 仅在 `status=pending` 时可改字段，其他状态 PATCH 失败 | 改前看清状态 |
| INV-07 | Worktree 在 development 阶段创建 | 若 Agent 直接 PATCH 进入 development，需额外触发 worktree 补建 |
| INV-08 | `archivedAt` 与阶段独立 | 已发布需求归档不影响 released 状态 |
| INV-09 | 启动时孤儿 pending 消息自动标记为 error | Agent 接管前先重新 GET messages 看实际状态 |

## 5. Agent 与服务器的进程关系

```
Server (Node.js / 其他运行时)
├── HTTP/SSE handlers
├── SessionManager
│   ├── AgentSession-A  ── spawn ──▶ agent-cli-a (子进程)
│   ├── AgentSession-B  ── spawn ──▶ agent-cli-b (子进程)
│   └── ...（每个 chatSessionId 至多对应一个活跃子进程）
├── ReleaseRunner / MergePublishRunner (进程内状态机)
└── PTY children (terminals)
```

要点：
- Agent CLI 是**子进程**，不是独立服务；通过 `POST /api/agent/run` SSE 与之交互
- Agent 输出经各 Session 适配器**归一化**为 `NormalizedEntry`
- 工具执行走"审批"流程：服务端先把 entry 状态置为 `pending`，等 `POST /api/agent/permission/:sessionId/:entryId/:decision`
- ReleaseRunner / MergePublishRunner 与 Agent 互不感知；Agent 想推动发布需调对应 REST 端点

## 6. 事件总线（events 表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 唯一标识 |
| reqId | string \| null | 可为空（运维/设置类事件） |
| type | string | 见 EventType 枚举，运行时是 string，agent 可写自定义类型 |
| payload | json | 任意结构化数据 |
| actor | string | `user` / `agent` / `system` |
| createdAt | iso | 服务器写入时间 |

写事件入口：`POST /api/events`，Agent 操作时**必须**标识 actor=agent（通过请求头或 body）。

已定义的事件类型：

```
stage_change   subtask_done   subtask_error
agent_run      ops_action     manual_log
```

其他字符串会被存储但 UI 可能不会特殊渲染。

## 7. 环境配置

| 变量 | 用途 |
|------|------|
| `PORT` | 后端监听端口 |
| `DB_PATH` | 数据库文件位置（SQLite 模式） |
| `AGENT_IDLE_MS` | SessionManager 空闲驱逐阈值 |
| `AGENT_DEBUG=1` | Agent 子进程 passthrough 输出作为 system entry |
| AI Provider Keys | 由 RunnerProfile.envOverrides 覆盖；Agent 不应自己改环境 |

具体变量名由实例决定，通过 `GET /api/settings` 获取运行时配置。
