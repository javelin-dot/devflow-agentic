# 02 · RequirementSpec 模板

> 这是面向 **AI Agent** 的需求规格统一格式。Agent 拿到一个 RequirementSpec 文件，应能机械化地：分析 → 拆任务 → 写代码 → 跑测试 → 推进阶段。

## 1. 物理形态

RequirementSpec 由两部分构成：

1. **YAML frontmatter**（结构化字段）— 直接映射到 `Requirement` + `RequirementProjectLink` + `SubTask[]`。
2. **Markdown 正文**（自由叙述）— 落到 `Requirement.description`。

物理位置任选：可以是 `harness/examples/*.yaml`，也可以作为 `attachments/<reqId>/spec.md` 上传给现存 Requirement。**Agent 读取/写入时都使用同一模板**。

## 2. 完整模板

```yaml
---
# === 必填: 标识与基本信息 ===
spec_version: "1.0"               # harness 版本号，匹配本目录 README 版本
title: "<≤60 字的简短标题>"        # → Requirement.title
priority: high                    # critical | high | medium | low
kind: standard                    # standard | no_code

# === 必填(standard): 关联项目 ===
projects:
  - project: "<projectName>"      # 必须已存在于 GET /api/projects
    devBranch: "feat/<reqId>"     # 可空: 后端按 worktree 约定生成
    uatBranch: "uat"              # 可空: 默认沿用项目设置
    isPrimary: true               # 至少有 1 个 primary
# no_code 类型可省略 projects:[]

# === 可选: 计划 ===
planned_release_date: 2026-05-30  # YYYY-MM-DD; 进入 prerelease 前必填
tags: ["分类1", "分类2"]
workspace: null                   # 自定义 workspace 目录名; null = 用 reqId

# === 关键: 验收标准 ===
acceptance:                       # 写人话；Agent 后续会派生 verifyCommands
  - id: AC-1
    text: "描述期望行为或结果"
    type: behavior                # behavior | api | data | ui | perf | security
    measurable: true              # 能否被脚本/HTTP 探测验证
  - id: AC-2
    text: "另一个验收条件"
    type: data
    measurable: true

# === 关键: 任务计划(DAG) ===
# 由分析阶段生成或人工拟，进入 development 时落到 subTasks 表
tasks:
  - id: T1
    title: "具体可执行的子任务标题"
    project: "<projectName>"
    type: migration               # 自由字符串；建议: migration | impl | test | doc | config | ops
    wave: 0                       # DAG 层级；同 wave 不互相依赖
    depends_on: []                # 引用前置 task.id
    acceptance: [AC-2]            # 关联 acceptance.id
    verify_commands:              # 跑通就算这个子任务 done（agent 自己执行）
      - "cd <projectPath> && <test-command>"
    risk: low

  - id: T2
    title: "依赖 T1 的后续任务"
    project: "<projectName>"
    type: impl
    wave: 1
    depends_on: [T1]
    acceptance: [AC-1]
    verify_commands:
      - "cd <projectPath> && <test-command>"

# === 可选: 契约 ===
contracts:
  api:
    - method: POST
      path: /api/endpoint
      request: { body: { field: type } }
      response: { 200: { result: type }, 4xx: { reason: string } }
  mq: []
  data_model:
    - table: table_name
      columns:
        - { name: column_name, type: "VARCHAR(45)", nullable: false }

# === 可选: 风险与外约束 ===
risks:
  - "风险描述; mitigation: 缓解措施"
out_of_scope:
  - "明确不做的事情"
notes: ""

# === 可选: Agent 偏好 ===
agent:
  profileId: null                  # 运行配置 ID
  preferred: "claude-code"         # 仅作建议；最终由 sessionManager 接受谁就是谁
---

# 业务背景

<自由 Markdown 正文 → Requirement.description>

## 用户故事

作为 …… 我希望 …… 以便 ……

## UI / 交互（可选）

…
```

## 3. 字段语义详表

### 3.1 顶层

| 字段 | 类型 | 必填 | 映射 / 落库 |
|------|------|------|------------|
| `spec_version` | string | ✅ | 不入库；只用于 harness 升级期向前兼容 |
| `title` | string ≤60 | ✅ | `requirements.title` |
| `priority` | enum | ✅ | `requirements.priority` |
| `kind` | enum | ✅ | `requirements.kind` |
| `projects[]` | object[] | standard 类型 ≥1 | `requirementProjects` 行（全量替换） |
| `planned_release_date` | YYYY-MM-DD | 进入 prerelease 前必填 | `requirements.plannedReleaseDate` |
| `tags` | string[] | – | `requirements.tags` (json) |
| `workspace` | string \| null | – | `requirements.workspace` |
| `acceptance[]` | object[] | ✅ | 不直接入库；下沉到 SubTask.acceptance & 文档 |
| `tasks[]` | object[] | – | 进入 development 时映射为 `subTasks` 行 |
| `contracts.*` | object[] | – | 由分析输出，最终被 `/api/contracts` 聚合 |
| `risks` / `out_of_scope` / `notes` | – | – | 写入 description 末尾或 notes |
| `agent.profileId` | string \| null | – | `requirements.profileId` |
| `agent.preferred` | string | – | 不入库；用于 Agent 自我选择 |

### 3.2 `projects[]` 子结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | string | 必须 ∈ `GET /api/projects` 的 name 集合；不存在则 400 |
| `devBranch` | string \| null | 落到 `requirementProjects.devBranch`；空时由 worktree 约定生成 |
| `uatBranch` | string \| null | 默认沿用 Project 配置；merge-publish 会用 |
| `isPrimary` | bool | 至少 1 个 true；用于 worktree 主仓库判断 |

### 3.3 `acceptance[]` 子结构

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | ✅ | 形如 `AC-1`，Spec 内唯一 |
| `text` | ✅ | 一句话能跑通的人类条件 |
| `type` | – | behavior \| api \| data \| ui \| perf \| security |
| `measurable` | – | false = 仍要人工抽检；true = 必须能映射到 verify_commands |

> 编写约束：每条 `acceptance` 都应被至少一个 `task.acceptance` 引用，否则视为孤儿（Agent 应在分析阶段补任务）。

### 3.4 `tasks[]` 子结构（→ `subTasks` 表）

| 字段 | 必填 | 落库列 | 说明 |
|------|------|--------|------|
| `id` | ✅ | （Spec 内引用键，不入库） | `T<N>` |
| `title` | ✅ | `title` | 简短可执行 |
| `project` | ✅(standard) | `project` | 必须 ∈ projects[] |
| `type` | – | `type` | 自由字符串，建议词表见模板 |
| `wave` | ✅ | `wave` | DAG 层级；调度同层并行 / 同 project 串行 |
| `depends_on` | – | `taskDependsOn` (json) | 前置 task.id 列表，环必须不存在 |
| `acceptance` | – | `acceptance` (json) | 关联 acceptance.id |
| `verify_commands` | – | `verifyCommands` (json) | Agent 在 subtask done 前必须全部通过 |
| `risk` | – | `risk` | 自由文本；low/medium/high 建议 |

> **后端不会自动执行 `verifyCommands`**。它们仅以 prompt 形式注入给 agent 子进程。"通过"的语义需要 Agent 自己跑、自己判定、自己 POST `subtask_done` 事件。

### 3.5 `contracts.*` 子结构

直接对应领域模型中的 `ApiContract` / `MqContract` / `DataModel`，详细字段见 `03-domain-model.md` § 10。

## 4. 校验流程（Agent 接到 RequirementSpec 时）

```
1. spec_version 在支持范围内 (currently: 1.0)            ─ 否则失败
2. 顶层必填字段齐全                                      ─ 否则失败
3. kind=standard → projects 至少 1 且 ≥1 primary         ─ 否则失败
4. 所有 projects[*].project ∈ GET /api/projects         ─ 否则提示扫描项目
5. tasks[*].project ⊆ projects                          ─ 否则失败
6. tasks DAG 无环 (Kahn 拓扑)                           ─ 否则失败
7. acceptance.id 集合 ⊇ tasks[*].acceptance 引用         ─ 否则失败
8. 每条 measurable=true 的 acceptance 至少被一个 task.verify_commands 覆盖
9. 若 stage 起步 = prerelease 则 planned_release_date 必填
SAFETY. verify_commands 不含破坏性命令                   ─ 检测 rm -rf / push --force / sudo / dd if=
```

校验通过后，Agent 才能执行 `07-execution-playbook.md` § "新建需求" 章节。

## 5. 增量更新

Agent 可以在以下时机回写 RequirementSpec（保存到 `attachments/<reqId>/spec.yaml`）：

| 时机 | 改动 |
|------|------|
| 分析阶段结束 | 补全 `tasks[]` / `contracts.*` |
| 子任务完成 | 在 task 上加 `completedAt`（仅 spec 内，不入库；DB 由 PATCH /subtasks 更新） |
| UAT 阶段发现新验收 | 追加 `acceptance[]` + 关联新 task |

> 不允许：在 development 之后回改 `projects[]` / `kind`（INV-05）。

## 6. 序列化与传输

- 文件名约定：`spec.yaml`（结构化）+ `spec.md`（叙述）
- 上传：`POST /api/requirements/:id/attachments` (multipart, 字段名 `file`)
- 读取：`GET /api/requirements/:id/attachments/:name`
- 编辑：用 `harness/examples/sample-requirement.yaml` 起手

## 7. 反例

下列写法在 harness 内是**不合规**的：

- `tasks` 中存在环（T1 depends_on T2，T2 depends_on T1）
- `acceptance` 有条目但 `measurable=true` 且没有任何 task 引用
- `kind=standard` 但 `projects=[]`
- `stage` 已是 `development`，但 spec 中又改了 `kind`（INV-05）
- `verify_commands` 中包含破坏性命令（`rm -rf`、`push --force` 等）
