# DevFlow v2 — 产品需求规格说明书 (PRD)

> **文档版本**: 2.0.0-draft  
> **创建日期**: 2026-05-16  
> **文档性质**: 独立产品规格定义，面向从零开发  
> **目标读者**: 产品团队、开发团队、AI 代理执行者

---

## 文档结构导航

| 章节 | 内容 | 面向角色 |
|------|------|---------|
| [1. 产品概述与目标](#1-产品概述与目标) | 愿景、原则、范围 | 全员 |
| [2. 竞品分析与设计决策](#2-竞品分析与设计决策) | 竞品对比、设计哲学 | 产品/架构 |
| [3. 功能模块详细设计](#3-功能模块详细设计) | 12个核心模块规格 | 开发/AI代理 |
| [4. AI 代理集成机制](#4-ai-代理集成机制) | Agent编排、自治执行 | 架构/开发 |
| [5. 技术架构设计](#5-技术架构设计) | 系统架构、数据模型 | 架构/开发 |
| [6. 开发规范与标准](#6-开发规范与标准) | 编码、API、数据库规范 | 开发 |
| [7. 用户界面设计规范](#7-用户界面设计规范) | 设计语言、交互模式 | 前端/设计 |
| [8. 测试策略与质量保证](#8-测试策略与质量保证) | 测试金字塔、验收标准 | QA/开发 |
| [9. 部署方案与运维策略](#9-部署方案与运维策略) | 安装、升级、监控 | DevOps |
| [10. 项目开发路线图](#10-项目开发路线图) | 里程碑、任务拆解 | PM/全员 |

---

## 1. 产品概述与目标

### 1.1 产品定义

**DevFlow** 是一个 AI 原生的研发全生命周期编排平台。它将需求管理、智能分析、多代理开发、自动化发布、运维排查整合为统一工作流，由 AI 代理作为一等公民参与每个环节的执行。

**核心理念**: 人类定义目标和约束，AI 代理自治执行，系统保障过程可控。

### 1.2 设计原则

| 序号 | 原则 | 含义 | 约束 |
|------|------|------|------|
| P1 | **Agent-First** | 每个功能模块必须支持 AI 代理自主操作 | 所有操作必须有程序化入口 |
| P2 | **Spec-Driven** | 所有工作从结构化规格开始 | 规格是唯一的真实来源 |
| P3 | **Local-First** | 默认本地运行，数据不出网 | 核心功能离线可用 |
| P4 | **Observable** | 所有 Agent 行为可审计、可回放 | 追加式事件日志 |
| P5 | **Isolated** | 并行任务互不干扰 | Worktree 隔离 + 进程隔离 |
| P6 | **Recoverable** | 任何中断都能恢复 | 状态机 + 快照 |
| P7 | **Composable** | 模块间松耦合，可独立使用 | 最小化模块间依赖 |

### 1.3 产品范围

**包含**:
- 需求全生命周期管理 (提出 → 分析 → 开发 → 测试 → 预发布 → 发布)
- 多 AI Agent 并行编排执行
- 跨项目协作与契约管理
- Git 版本管理与自动化发布
- 运维日志智能排查
- API 文档自动生成与维护
- Jenkins/CI 集成

**不包含**:
- 多租户/SaaS 基础设施 (v1 范围外)
- 实时多人协作编辑 (v1 范围外)
- 移动端适配 (v1 范围外)

### 1.4 成功指标

| 指标 | 目标值 | 度量方式 |
|------|--------|---------|
| 需求→发布平均周期 | 缩短 40% | 阶段时间戳统计 |
| AI 代理自治完成率 | >70% 的子任务无需人工干预 | 审批/中断次数 |
| 首次安装到可用时间 | <10 分钟 | 安装向导完成率 |
| 日志问题定位时间 | 缩短 60% | 首次 grep → 根因定位 |

---

## 2. 竞品分析与设计决策

### 2.1 竞品对照

| 维度 | OpenAI Symphony | Lite-Kanban (现有) | DevFlow v2 (本规格) |
|------|----------------|-------------------|-------------------|
| **定位** | 编排规格/轻量调度器 | 全栈研发管理工具 | AI原生研发全链路平台 |
| **架构** | Elixir/BEAM,无GUI | Node.js全栈,Web GUI | Node.js全栈 + Agent编排层 |
| **Agent模型** | 单一Codex,SPEC驱动 | 多CLI适配(9种) | 多Agent + 角色分工 |
| **任务分解** | Planner自动分解 | 需求分析→手动选 | Planner自动 + 人工确认 |
| **并发模型** | OTP进程树 | Promise并发 | Worker Pool + DAG调度 |
| **隔离机制** | 独立环境/沙箱 | Git Worktree | Git Worktree + 进程隔离 |
| **容错** | OTP Supervisor重启 | SSE降级+手动恢复 | 状态机+快照+自动重试 |
| **审计** | Issue Tracker日志 | events表 | 结构化事件流+回放 |
| **部署** | 需Elixir运行时 | npm install | npm install + 可选Docker |
| **GUI** | 无(CLI/API only) | 完整Web界面 | 完整Web界面 + CLI |

### 2.2 从 Symphony 吸收的设计理念

| 理念 | Symphony 做法 | DevFlow v2 实现 |
|------|-------------|----------------|
| **Spec-Driven** | 2000行SPEC.md驱动全流程 | 结构化 RequirementSpec (YAML/JSON) |
| **Agent自治** | Agent独立领取并执行任务 | Agent自动认领已就绪的SubTask |
| **隔离执行** | 每个任务独立环境 | 每个任务独立Worktree + CWD |
| **Supervisor** | OTP进程树自动恢复 | TaskSupervisor状态机 + 重试策略 |
| **并发优先** | 无依赖任务自动并行 | DAG拓扑排序,同wave并行 |
| **人类最终审批** | 合并前人工Review | 工具执行审批 + PR审查 |

### 2.3 从 Lite-Kanban 继承的工程实践

| 实践 | 原项目做法 | DevFlow v2 保留/改进 |
|------|-----------|---------------------|
| **看板可视化** | 拖拽阶段转换 | 保留,增强统计仪表板 |
| **多Agent框架** | 9种CLI适配器 | 保留,抽象为AgentAdapter接口 |
| **运维日志** | 三栏+AI排查+多跳SSH | 完整继承,补充AlertManager |
| **冲突解决** | Monaco三列编辑器 | 完整继承,补充3-way base |
| **发布状态机** | 6阶段状态机 | 保留,增加回滚能力 |
| **安全白名单** | 引号感知命令过滤 | 保留,扩展为通用SandboxPolicy |

### 2.4 关键设计决策记录 (ADR)

**ADR-001: 选择 Node.js 而非 Elixir**
- 决策: 使用 Node.js 全栈
- 理由: 目标用户(前端/全栈开发者)熟悉度高；npm生态丰富；单进程部署简单
- 代价: 并发模型不如BEAM优雅,需用Worker Pool补偿
- 缓解: 使用 `worker_threads` + Promise并发；Agent进程天然隔离(child_process)

**ADR-002: SQLite 而非 PostgreSQL**
- 决策: SQLite(WAL模式) 作为唯一存储
- 理由: 零配置部署；单文件备份；读多写少场景性能足够
- 代价: 不支持多实例写入(单用户/单团队版够用)
- 缓解: 团队版(v2.5+)可引入PostgreSQL适配层

**ADR-003: 结构化Spec而非自由文本**
- 决策: RequirementSpec 使用强类型JSON Schema
- 理由: AI代理需要结构化输入才能可靠执行；版本比对更精准
- 代价: 用户首次填写门槛高于自由文本
- 缓解: AI辅助生成Spec；从自由文本自动提取结构化字段

---

## 3. 功能模块详细设计

### 3.1 模块总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DevFlow v2 功能架构                            │
├──────────────────┬──────────────────┬───────────────────────────────┤
│   需求管理域      │   开发执行域      │       运维保障域               │
│                  │                  │                               │
│ M01 需求生命周期  │ M05 AI工作区     │ M09 运维日志排查               │
│ M02 需求分析引擎  │ M06 子任务调度器  │ M10 事件审计中心               │
│ M03 契约管理中心  │ M07 版本与发布    │ M11 健康监控                   │
│ M04 项目配置管理  │ M08 冲突解决      │                               │
│                  │ M16 测试与验证    │                               │
├──────────────────┴──────────────────┴───────────────────────────────┤
│                        基础能力层                                      │
│ M12 Agent编排引擎 │ M13 终端服务 │ M14 设置管理 │ M15 通知系统       │
└─────────────────────────────────────────────────────────────────────┘
```

> **注**: M16 测试与验证模块的完整设计规格见独立文档 `PRD-testing-module.md`

---

### 3.2 M01 — 需求生命周期管理

#### 3.2.1 功能描述

管理需求从提出到发布的完整生命周期，提供看板视图和阶段流转控制。

#### 3.2.2 阶段定义

```
backlog → analyzing → development → uat → prerelease → released
   ↑         │            │          │
   └─────────┘            └──────────┘
   (可退回)               (可退回)
```

| 阶段 | 触发条件 | 系统行为 | AI参与 | 测试活动(M16) |
|------|---------|---------|--------|--------------|
| backlog | 创建需求 | 无 | 可选:AI辅助完善描述 | 无 |
| analyzing | 用户确认开始分析 | 启动分析引擎(M02) | AI并行分析,生成Spec | 生成验收标准→测试计划草案 |
| development | 用户选择分析结果 | 创建Worktree,生成SubTask | AI自动执行SubTask | TDD循环+单元测试+验证命令 |
| uat | 合并dev→uat分支 | 触发UAT构建 | AI执行测试套件+分析报告 | 集成测试+验收测试+缺陷管理 |
| prerelease | 填写发布日期 | 预发布检查 | AI生成发布文档+质量报告 | 回归测试+冒烟测试+质量门禁 |
| released | 确认发布完成 | 记录发布时间 | AI总结变更 | 发布质量报告归档 |

> **质量门禁** (详见 `PRD-testing-module.md`):
> - `development → uat`: 所有子任务验证通过 + 单元测试100% + 覆盖率≥60%
> - `uat → prerelease`: 集成测试通过 + 验收测试≥95% + 无P0/P1缺陷
> - `prerelease → released`: 回归测试100%通过 + 冒烟测试通过

#### 3.2.3 需求数据模型

```typescript
interface Requirement {
  // 基础信息
  id: string;                    // 格式: req_<nanoid(8)>
  title: string;                 // 1-200字符
  description: string;           // Markdown,支持附件引用
  kind: 'standard' | 'no_code'; // 是否涉及代码变更
  
  // 状态
  stage: Stage;
  priority: Priority;
  tags: string[];
  
  // 关联
  projects: RequirementProjectLink[];  // 多对多
  
  // 时间线
  createdAt: string;
  plannedReleaseDate: string | null;
  releasedAt: string | null;
  archivedAt: string | null;
  
  // AI生成产物
  spec: RequirementSpec | null;       // 结构化规格
  apiDoc: ApiDoc | null;              // API文档
  releaseDoc: ReleaseDoc | null;      // 发布文档
  
  // 附件
  attachments: Attachment[];
}
```

#### 3.2.4 看板视图需求

| 功能项 | 优先级 | 描述 |
|--------|--------|------|
| 拖拽阶段转换 | P0 | 拖拽到目标列触发转换确认Modal |
| 多维度过滤 | P0 | 按项目/优先级/标签/负责人过滤 |
| 统计仪表板 | P1 | 阶段分布/周吞吐量/平均周期 |
| 卡片实时状态 | P1 | 展示Agent运行状态/构建状态 |
| 批量操作 | P2 | 多选归档/删除/修改优先级 |
| 自定义泳道 | P2 | 按项目/优先级分组 |

#### 3.2.5 阶段转换规则

```typescript
// 正向转换:需要确认
// 反向转换:直接允许(纠错用途)
// released:单向,不可退出

interface StageTransitionRule {
  from: Stage;
  to: Stage;
  requires: {
    modal?: string;           // 需要弹出的确认Modal
    fields?: string[];        // 必填字段
    validation?: string;      // 校验函数名
  };
  sideEffects: {
    createWorktree?: boolean;
    triggerBuild?: boolean;
    archiveSessions?: boolean;
    generateDoc?: boolean;
  };
}
```

---

### 3.3 M02 — 需求分析引擎

#### 3.3.1 功能描述

利用多个 AI Agent 并行分析需求，生成结构化的技术方案(Spec)，包含任务分解、契约定义、数据模型变更等。用户对比后选择最优方案。

#### 3.3.2 分析流程

```
用户触发分析
     │
     ▼
┌────────────────────────────────────────┐
│  Prompt构建                             │
│  - 需求描述 + 附件                      │
│  - 项目上下文(技术栈/目录结构)           │
│  - 已有契约(避免重复声明)               │
│  - 分析指令模板                         │
└────────────────────────────────────────┘
     │
     ▼ (并行N路)
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Agent A  │  │ Agent B  │  │ Agent C  │
│ (Claude) │  │ (Codex)  │  │(DeepSeek)│
└──────────┘  └──────────┘  └──────────┘
     │              │              │
     ▼              ▼              ▼
┌────────────────────────────────────────┐
│  结构化输出解析                          │
│  - AnalysisOutput JSON 提取            │
│  - 验收标准提取                         │
│  - 任务列表+依赖图                      │
│  - API/MQ契约声明                      │
│  - 数据模型变更                         │
└────────────────────────────────────────┘
     │
     ▼
用户对比选择 → 自动种子SubTask
```

#### 3.3.3 分析输出规格 (AnalysisSpec)

```typescript
interface AnalysisOutput {
  // 问题理解
  problem: string;              // 问题陈述
  acceptance: string[];         // 验收标准
  outOfScope: string[];         // 明确排除范围
  
  // 任务规划
  proposedTasks: TaskProposal[];  // 任务列表
  
  // 跨项目契约
  apiContracts: ApiContract[];    // REST接口契约
  mqContracts: MqContract[];      // 消息队列契约
  dataModel: DataModelChange[];   // 数据库变更
  
  // 风险评估
  risks: string[];
  notes: string;
}

interface TaskProposal {
  title: string;
  project: string;              // 绑定项目
  type: TaskType;               // design|backend|frontend|db|test|integration
  wave: number;                 // 执行波次(同wave可并行)
  taskDependsOn: string[];      // 依赖的任务title
  acceptance: string[];         // 任务级验收标准
  verifyCommands: string[];     // 验证命令
  risk: 'low' | 'medium' | 'high';
  filesHint: string[];          // 可能涉及的文件
  dependsOn: string[];          // 依赖的契约ID
}
```

#### 3.3.4 多轮澄清机制

| 功能 | 描述 |
|------|------|
| 澄清对话 | 分析过程中Agent可向用户提问 |
| 澄清累积 | 每轮澄清追加到 `clarificationHistory[]` |
| 重试保真 | 重试时包含所有澄清历史 |
| 轮数追踪 | UI展示"已澄清N轮"标记 |

#### 3.3.5 与 Symphony 的差异

| Symphony | DevFlow v2 |
|----------|-----------|
| 自由文本SPEC.md | 结构化AnalysisOutput JSON |
| 单Agent分解 | 多Agent并行+用户选择 |
| 一次性规划 | 支持迭代澄清和修订 |
| 无UI | 可视化对比面板 |

---

### 3.4 M03 — 契约管理中心

#### 3.4.1 功能描述

跨需求、跨项目的接口契约中央仓库。确保并行开发的多个项目共享一致的接口定义。

#### 3.4.2 契约类型

```typescript
// REST API 契约
interface ApiContract {
  id: string;                    // 如 "POST /api/orders/batch"
  method: HttpMethod;
  path: string;
  owner: string;                 // 提供方项目
  consumers: string[];           // 消费方项目列表
  request: { headers?; query?; body?; };
  response: { success?; error?; };
  version: number;               // 自动递增
  status: 'active' | 'deprecated' | 'suppressed';
  declaredBy: { reqId; analysisId; };  // 溯源
}

// 消息队列契约
interface MqContract {
  id: string;                    // 如 "order.created.v1"
  topic: string;
  publisher: string;
  subscribers: string[];
  payload: JsonSchema;           // JSON Schema定义
  version: number;
}

// 数据模型变更
interface DataModelChange {
  project: string;
  table: string;
  operation: 'create' | 'alter' | 'drop';
  columns: ColumnDef[];
  migration: string;             // DDL语句
}
```

#### 3.4.3 契约生命周期

```
声明(分析阶段) → 活跃(开发阶段) → 废弃/抑制
     │                  │
     │                  ├── 版本更新(新分析覆盖)
     │                  └── 一致性检查(CI/build时)
     │
     └── 冲突检测: 两个分析声明同ID但payload不同 → 告警
```

#### 3.4.4 AI 代理交互

- 子任务执行时，Agent Prompt 自动注入相关契约的完整定义
- Agent 开发完成后自动验证: 实现是否符合契约定义
- 契约变更自动通知受影响的消费方需求

---

### 3.5 M04 — 项目配置管理

#### 3.5.1 功能描述

管理 Git 仓库、项目配置、分支策略、构建模板、数据源等基础设施元数据。

#### 3.5.2 项目数据模型

```typescript
interface Project {
  name: string;                   // 唯一标识
  path: string;                   // 本地Git路径
  lang: string;                   // 主要语言
  
  // Git 配置
  defaultBranch: string;          // master/main
  branchPrefix: string;           // 开发分支前缀模板
  mergeStrategy: 'merge' | 'squash' | 'rebase';
  autoPush: boolean;
  
  // 服务配置
  services: string[];             // 多模块服务名
  
  // 集成配置
  jenkinsTemplateId: string | null;
  dataSourceId: string | null;
  
  // 日志配置
  logDirTemplate: string | null;
  logGlobTemplate: string | null;
  
  // Git根目录(多仓库支持)
  rootDir: string | null;
  sortOrder: number;
}
```

#### 3.5.3 核心功能

| 功能 | 描述 | AI参与 |
|------|------|--------|
| 项目扫描 | 递归扫描Git目录,自动识别语言/框架 | AI识别项目类型 |
| 分支策略 | 配置开发/UAT/预发布分支命名规则 | 无 |
| Jenkins模板 | 配置构建Job和参数模板 | 无 |
| 数据源管理 | 配置DB连接信息(支持环境变量) | 无 |
| 排序管理 | 拖拽排列项目显示顺序 | 无 |
| 多仓库支持 | 同时管理多个Git根目录下的项目 | 无 |

---

### 3.6 M05 — AI 工作区 (多Agent对话)

#### 3.6.1 功能描述

提供 AI Agent 的交互界面，支持多种 CLI 代理执行代码编写、审查、修改等任务。包含会话管理、工具审批、上下文注入。

#### 3.6.2 Agent 适配器架构

```typescript
// 统一Agent能力接口
interface AgentAdapter {
  id: AgentId;
  name: string;
  
  // 能力声明
  capabilities: {
    streaming: boolean;
    toolApproval: boolean;
    vision: boolean;
    mcp: boolean;
    contextCompaction: boolean;
    midTurnSteering: boolean;
  };
  
  // 生命周期
  spawn(config: SpawnConfig): AgentProcess;
  send(message: string): void;
  interrupt(): void;
  terminate(): void;
  
  // 事件流
  on(event: 'entry', handler: (entry: NormalizedEntry) => void): void;
  on(event: 'exit', handler: (code: number) => void): void;
}
```

#### 3.6.3 支持的 Agent 列表

| Agent | 协议 | 特殊能力 |
|-------|------|---------|
| Claude Code | stream-json | MCP, Vision, Tool Approval |
| Codex | stream-json | MCP, Background Run |
| Gemini | ACP | Multi-modal |
| DeepSeek | Anthropic-compat | Context Compaction, Mid-turn Steering |
| OpenCode | stream-json | 基础 |
| Qwen Code | ACP | 中文优化 |
| Amp | stream-json | 后台自治 |

#### 3.6.4 会话管理

```typescript
interface ChatSession {
  id: string;
  reqId: string;                   // 绑定需求
  agent: AgentId;
  status: 'active' | 'done' | 'attention';
  agentLocked: boolean;            // 首次运行后锁定Agent类型
  
  // 上下文
  stageSnapshot: Stage;            // 创建时的阶段快照
  profileId: string | null;        // Runner Profile
  cwd: string | null;              // 工作目录(Worktree)
  
  // 归档
  archivedAt: string | null;
  archiveReason: string | null;
}
```

#### 3.6.5 工具审批流程

```
Agent 请求执行工具 (file_edit / command_run / ...)
         │
         ▼
┌──────────────────────┐
│ 安全策略检查          │
│ - 白名单命令?        │  ──── 自动通过
│ - 只读操作?          │  ──── 自动通过
│ - 自动批准模式开启?   │  ──── 自动通过
└──────────────────────┘
         │ (需审批)
         ▼
┌──────────────────────┐
│ 用户审批界面          │
│ - 展示操作详情        │
│ - Approve / Deny     │
│ - "总是允许此类操作"  │
└──────────────────────┘
         │
         ▼
Agent 继续执行 / 收到拒绝反馈
```

---

### 3.7 M06 — 子任务调度器

#### 3.7.1 功能描述

将分析结果转化为可执行的子任务列表，管理任务间依赖关系，按拓扑顺序自动编排 AI Agent 执行。

#### 3.7.2 任务数据模型

```typescript
interface SubTask {
  id: string;
  reqId: string;
  analysisId: string | null;
  
  // 任务定义
  title: string;
  prompt: string;                  // Agent执行指令
  project: string | null;          // 绑定项目
  type: TaskType;
  wave: number;                    // 执行波次
  
  // 依赖管理
  taskDependsOn: string[];         // 前置任务ID列表
  contractDependsOn: string[];     // 依赖的契约ID列表
  
  // 验收标准
  acceptance: string[];
  verifyCommands: string[];
  risk: 'low' | 'medium' | 'high';
  
  // 执行状态
  status: TaskStatus;              // pending|ready|running|done|error|cancelled
  sessionId: string | null;        // AI会话
  agent: AgentId | null;
  
  // 时间线
  ordering: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
}

type TaskStatus = 'pending' | 'ready' | 'running' | 'done' | 'error' | 'cancelled';
```

#### 3.7.3 DAG 调度算法

```
输入: SubTask[]
输出: 执行计划 ExecutionPlan

算法:
1. 构建有向图 G(V=tasks, E=dependencies)
2. 检测环 → 有环则报错(不可调度)
3. Kahn拓扑排序 → 生成执行层级
4. 同层级内:
   - 相同project的任务串行(共享Worktree)
   - 不同project的任务并行
5. 计算关键路径 → 展示预估完成时间

调度规则:
- pending → ready: 所有taskDependsOn的任务status=done
- ready → running: 调度器分配Agent执行
- running → done/error: Agent返回结果
- error → ready: 用户确认重试
```

#### 3.7.4 执行器 (TaskExecutor)

```typescript
class TaskExecutor {
  // 启动任务
  async start(task: SubTask): Promise<void> {
    // 1. 解析工作目录(Worktree)
    const cwd = await resolveTaskCwd(task);
    
    // 2. 构建增强Prompt
    const prompt = buildEnhancedPrompt(task, {
      contracts: await getRelevantContracts(task),
      context: await getProjectContext(task.project),
      previousResults: await getDependencyOutputs(task),
    });
    
    // 3. 创建/复用AI会话
    const session = await getOrCreateSession(task);
    
    // 4. 发送执行请求
    await agentManager.run(session, prompt, cwd);
    
    // 5. 完成后自动验证 (M16集成)
    // 详见 PRD-testing-module.md TDDTaskExecutor
  }
  
  // 验证完成 (与M16测试执行引擎集成)
  async verify(task: SubTask): Promise<VerifyResult> {
    // 运行verifyCommands
    for (const cmd of task.verifyCommands) {
      const result = await exec(cmd, { cwd });
      if (result.exitCode !== 0) return { pass: false, output: result.stderr };
    }
    // 运行关联测试套件(如有)
    if (task.tddMode) {
      const testResult = await testExecutor.runAffectedTests(task);
      if (!testResult.allPassed) return { pass: false, failures: testResult.failures };
    }
    return { pass: true };
  }
}
```

#### 3.7.5 与 Symphony 的对比

| Symphony | DevFlow v2 |
|----------|-----------|
| Conductor自动分配 | DAG调度器自动分配 |
| 无可视化 | 任务面板+依赖图可视化 |
| 失败重启(OTP) | 失败→error状态→用户决定重试/跳过 |
| 单Agent类型 | 每任务可选不同Agent |
| 无验收检查 | verifyCommands自动验证 |

---

### 3.8 M07 — 版本与发布

#### 3.8.1 功能描述

管理从开发到发布的自动化流程，包含分支合并、版本号管理、Jenkins触发、冲突处理。

#### 3.8.2 发布模式

| 模式 | 适用场景 | 流程 |
|------|---------|------|
| **mergePublish** | dev→uat合并+构建 | merge → push → jenkins |
| **release** | uat→master正式发布 | checkout → merge → bump → push → jenkins |
| **quickPublish** | 直接触发构建 | jenkins trigger |

#### 3.8.3 发布状态机

```
                    ┌─────── cancel ──────┐
                    │                     │
idle → preparing → merging → pushing → triggering → done
                    │                     │
                    └── paused-conflict ───┘
                           │
                           ├── resolve → resume
                           └── cancel → idle
```

#### 3.8.4 状态定义

```typescript
type ReleaseState = 
  | 'idle'              // 初始
  | 'preparing'         // 前置检查(fetch, branch exists)
  | 'merging'           // 执行merge操作
  | 'paused-conflict'   // 合并冲突,等待用户解决
  | 'pushing'           // push到远程
  | 'triggering'        // 触发Jenkins
  | 'done'              // 完成
  | 'error'             // 错误(可重试)
  | 'cancelled';        // 已取消

interface ReleaseRun {
  id: string;
  reqId: string;
  mode: ReleaseMode;
  state: ReleaseState;
  projects: ProjectReleaseStatus[];
  log: string;           // 滚动日志缓冲(256KB)
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}
```

#### 3.8.5 冲突解决集成

当发布过程中检测到冲突:
1. 状态机暂停到 `paused-conflict`
2. 通知前端展示冲突解决界面(M08)
3. 用户/AI 在 Monaco 编辑器中解决
4. 用户确认 → POST /resume → 状态机继续

#### 3.8.6 Jenkins 集成

```typescript
interface JenkinsTemplate {
  id: string;
  name: string;
  job: string;                    // Jenkins Job路径
  params: Record<string, string>; // 构建参数模板
  // 支持变量: {分支名}, {服务名}, {版本号}, {环境}
}

// 触发流程:
// 1. 解析模板参数(替换变量)
// 2. POST Jenkins Build API
// 3. 轮询Queue → 获取BuildURL
// 4. 轮询Build状态 → 返回结果
```

---

### 3.9 M08 — 冲突解决

#### 3.9.1 功能描述

基于 Monaco Editor 的三列合并冲突解决界面，支持逐块操作和 AI 辅助建议。

#### 3.9.2 界面布局

```
┌──────────────┬──────────────┬──────────────┐
│    OURS      │    RESULT    │   THEIRS     │
│  (当前分支)   │   (合并结果)  │  (目标分支)   │
│              │              │              │
│  [Accept]    │  [AI建议]    │  [Accept]    │
│              │  [Undo/Redo] │              │
└──────────────┴──────────────┴──────────────┘
     文件树导航 │ 进度: 2/5 已解决 │ 操作历史
```

#### 3.9.3 解决策略

| 策略 | 描述 | 自动化程度 |
|------|------|-----------|
| Accept Ours | 采用当前分支版本 | 一键 |
| Accept Theirs | 采用目标分支版本 | 一键 |
| Accept Both | 两侧内容合并保留 | 一键 |
| AI Suggest (块级) | AI为单个冲突块提供建议 | SSE流式 |
| AI Resolve (文件级) | AI接管整个文件的冲突解决 | Agent对话 |
| Manual Edit | 用户在Result面板手动编辑 | 手动 |

#### 3.9.4 AI辅助解决流程

```
冲突块内容(ours + theirs + 文件上下文)
         │
         ▼
Anthropic API (stream)
         │
         ▼
SSE text_delta → Result面板实时渲染
         │
         ▼
用户确认/修改/撤销
```

---

### 3.10 M09 — 运维日志排查

#### 3.10.1 功能描述

通过 SSH 远程连接目标服务器，由 AI 驱动的对话式日志排查工具。支持多跳跳板机、安全命令执行、链路追踪。

#### 3.10.2 三栏架构

| 左栏 (LogsSidebar) | 中栏 (LogChatPanel) | 右栏 (RightRail) |
|-------------------|--------------------|--------------------|
| 日志目标目录 | AI对话排查界面 | 主机拓扑图 |
| 按项目/环境分组 | 流式思考展示 | 会话历史列表 |
| 错误率热图 | 5-Tab结果视图 | 关键指标展示 |
| 跳板机配置 | 命令执行追踪 | 告警列表(预留) |

#### 3.10.3 SSH 连接模式

| 模式 | 路径 | 适用场景 |
|------|------|---------|
| direct | DevFlow → Target | 内网直连 |
| jump_global | DevFlow → 跳板机(脚本) → Target | 企业堡垒机 |
| jump_custom | DevFlow → Hop1 → Hop2 → ... → Target | 多层级网络 |

#### 3.10.4 AI 排查循环

```typescript
// 核心执行循环
async function logDiagnosisLoop(params: {
  userQuery: string;
  targets: LogTarget[];
  history: Message[];
}): AsyncGenerator<SSEEvent> {

  const systemPrompt = buildDiagnosisPrompt(params.targets);
  const messages = [...params.history, { role: 'user', content: params.userQuery }];
  
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const response = await anthropic.messages.create({
      system: systemPrompt,
      messages,
      tools: [{ name: 'exec_remote_command', ... }],
      stream: true,
    });
    
    if (response.stop_reason === 'tool_use') {
      // 并发执行所有tool_use请求
      const results = await Promise.all(
        response.toolUses.map(tu => executeOnTarget(tu))
      );
      messages.push(assistantMsg, ...toolResults);
      yield* streamToolResults(results);
    } else {
      yield { type: 'final_answer', content: response.text };
      break;
    }
  }
}
```

#### 3.10.5 安全防护

| 层级 | 措施 |
|------|------|
| 命令白名单 | 仅允许 tail/grep/awk/sed/cat/less 等只读命令 |
| 引号感知 | 单引号内安全,双引号内检测 `$` 和反引号 |
| 禁止符号 | `>`, `>>`, `;`, `&&`, `||`, `$()`, 反引号 |
| 输出截断 | 单次命令最多2MB输出 |
| 范围限制 | 会话只能访问 scopedTargetIds 内的目标 |

#### 3.10.6 结果视图 (5 Tab)

| Tab | 内容 |
|-----|------|
| trace | AI排查过程(思考+命令+结果) |
| conversation | 对话历史(用户+AI) |
| summary | AI总结(根因+修复建议) |
| raw | 原始日志(按traceId/host分组) |
| report | 格式化排查报告(可导出) |

---

### 3.11 M10 — 事件审计中心

#### 3.11.1 功能描述

追加式事件日志系统，记录系统中所有有意义的操作和状态变化，支持审计、回溯和分析。

#### 3.11.2 事件类型

```typescript
type EventType = 
  | 'stage_change'        // 阶段转换
  | 'agent_run'           // Agent执行
  | 'agent_exit'          // Agent退出
  | 'subtask_done'        // 子任务完成
  | 'subtask_error'       // 子任务失败
  | 'subtask_verify_failed' // 子任务验证失败(M16)
  | 'test_run_complete'   // 测试运行完成(M16)
  | 'gate_check_failed'   // 质量门禁未通过(M16)
  | 'gate_check_passed'   // 质量门禁通过(M16)
  | 'defect_created'      // 缺陷创建(M16)
  | 'defect_resolved'     // 缺陷解决(M16)
  | 'jenkins_trigger'     // Jenkins触发
  | 'jenkins_complete'    // Jenkins完成
  | 'release_start'       // 发布开始
  | 'release_complete'    // 发布完成
  | 'conflict_detected'   // 冲突检测
  | 'conflict_resolved'   // 冲突解决
  | 'settings_change'     // 设置变更
  | 'archived'            // 需求归档
  | 'manual_log';         // 手动记录

interface SystemEvent {
  id: string;             // evt_<nanoid(8)>
  reqId: string | null;   // null = 系统级事件
  type: EventType;
  payload: Record<string, unknown>;
  actor: 'user' | 'agent' | 'system';
  createdAt: string;
}
```

#### 3.11.3 视图功能

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 时间线展示 | 按时间倒序展示事件流 | P0 |
| 游标分页 | cursor-based pagination,支持万级事件 | P0 |
| 多维过滤 | 按类型/actor/时间范围/需求 | P0 |
| 事件详情 | 展开查看完整payload | P1 |
| 关联展示 | 展示事件间因果关系 | P2 |
| 导出 | JSON/CSV格式导出审计日志 | P2 |
| 统计仪表 | 今日事件数/Agent运行次数/发布次数 | P2 |

---

### 3.12 M11 — 健康监控 (新增模块)

#### 3.12.1 功能描述

监控 DevFlow 自身及所管理项目的健康状态，包含 Agent 进程状态、构建状态、资源使用。

#### 3.12.2 监控维度

| 维度 | 指标 | 告警阈值 |
|------|------|---------|
| Agent进程 | 活跃数/空闲数/僵尸数 | 僵尸>0 告警 |
| 磁盘空间 | DB大小/Worktree占用 | >10GB 警告 |
| SSH连接 | 活跃连接数/失败率 | 失败率>50% 告警 |
| AI调用 | 今日token用量/成本估算 | 超预算警告 |
| 构建状态 | 最近失败次数/成功率 | 连续3次失败告警 |

---

## 4. AI 代理集成机制

### 4.1 编排架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Orchestration Layer                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ TaskScheduler│    │ SessionMgr  │    │  EventBus   │     │
│  │ (DAG执行)   │    │ (进程池)    │    │ (事件分发)   │     │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘     │
│         │                  │                   │            │
│         ▼                  ▼                   ▼            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Agent Adapter Interface                  │    │
│  ├─────────┬─────────┬─────────┬─────────┬────────────┤    │
│  │ Claude  │ Codex   │ Gemini  │DeepSeek │  Custom    │    │
│  │ Adapter │ Adapter │ Adapter │ Adapter │  Adapter   │    │
│  └─────────┴─────────┴─────────┴─────────┴────────────┘    │
│         │         │         │         │         │           │
│         ▼         ▼         ▼         ▼         ▼           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Normalized Event Stream                    │    │
│  │  (NormalizedEntry: user_msg | assistant_msg |        │    │
│  │   thinking | tool_use | system | error | todo)      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Agent 角色分工

借鉴 Symphony 的角色分工理念，但保持用户可控:

| 角色 | 职责 | 触发方式 | 用户介入 |
|------|------|---------|---------|
| **Analyzer** | 需求分析,生成Spec | 用户触发 | 选择结果 |
| **Planner** | 任务分解,依赖排序 | 分析完成后自动 | 确认计划 |
| **Implementer** | 代码编写,测试 | 调度器自动分配 | 审批工具 |
| **Reviewer** | 代码审查,质量检查 | 任务完成后自动 | 查看报告 |
| **Diagnoser** | 日志排查,问题定位 | 用户触发 | 对话引导 |
| **DocWriter** | API文档,发布文档生成 | 阶段转换触发 | 审阅确认 |

### 4.3 自治执行模型

```
人类定义 ──────────────────────────────────────── 人类审批
    │                                              ▲
    ▼                                              │
需求描述 → Analyzer → Spec → Planner → Tasks → Implementer → PR
                        │                              │
                        ▼                              ▼
                    Contracts ─────────────────→  Reviewer
                                                      │
                                                      ▼
                                                   合并/拒绝
```

**自治级别**:
- **Level 0 (手动)**: 每步都需人工确认
- **Level 1 (半自动)**: 分析/规划需确认,执行自动
- **Level 2 (全自动)**: 仅最终PR需审批 (类似 Symphony)
- **Level 3 (自治)**: 低风险任务全自动完成+合并

### 4.4 上下文管理策略

```typescript
interface ContextStrategy {
  // 阶段上下文: 不同开发阶段注入不同背景知识
  stageContext: {
    analyzing: string;    // 分析方法论 + 项目架构概述
    development: string;  // 编码规范 + 技术栈指南
    uat: string;          // 测试规范 + 验收标准
  };
  
  // 项目上下文: 代码库相关知识
  projectContext: {
    structure: string;    // 目录结构
    conventions: string;  // 编码约定
    dependencies: string; // 依赖说明
  };
  
  // 任务上下文: 当前任务的相关契约和依赖产物
  taskContext: {
    contracts: ApiContract[];
    previousOutputs: string[];
    acceptance: string[];
  };
}
```

### 4.5 Agent 通信协议

所有 Agent 输出统一为 `NormalizedEntry`:

```typescript
interface NormalizedEntry {
  id: string;
  sessionId: string;
  type: 'user_message' | 'assistant_message' | 'thinking' 
      | 'tool_use' | 'system' | 'error' | 'todo_update' | 'plan';
  content: string;
  action?: ActionType | null;        // 结构化动作描述
  status?: 'pending' | 'running' | 'success' | 'error';
  createdAt: string;
}

// SSE 事件流
type AgentStreamEvent =
  | { type: 'entry'; entry: NormalizedEntry }
  | { type: 'patch'; entryId: string; patch: Partial<NormalizedEntry> }
  | { type: 'session'; agentSessionId: string }
  | { type: 'exit'; code: number | null }
  | { type: 'error'; message: string };
```

### 4.6 API 文档自动生成

#### 触发时机
- 开发阶段完成时 (development → uat)
- 用户手动触发
- Agent完成涉及Controller/API的子任务后

#### 生成流程
```
1. 扫描dev分支与base分支的diff
2. 识别Controller/Router文件变更
3. 提取端点定义(方法/路径/参数/返回值)
4. AI增强: 生成描述、补充枚举值说明、标记变更类型
5. 输出ApiDoc结构 → 持久化到需求
6. 标记 change='added' | 'modified'
```

#### 输出格式
```typescript
interface ApiDoc {
  summary: string;
  baseUrl: string;
  endpoints: ApiDocEndpoint[];
  generatedAt: string;
  scanNotes: string[];          // 扫描过程说明
}

interface ApiDocEndpoint {
  method: string;
  path: string;
  name: string;
  desc: string;
  change?: 'added' | 'modified';
  changeNotes?: string[];       // 变更细节
  source?: { project: string; file: string };
  fields?: ApiDocField[];
  request?: { headers?; body?; };
  response?: { success?; error?; };
}
```

---

## 5. 技术架构设计

### 5.1 整体架构

```
┌────────────────────────────────────────────────────────────────┐
│                        Client (SPA)                              │
│  React 18 + TypeScript + Vite                                   │
│  Zustand (状态) + React Query (缓存) + xterm.js + Monaco        │
└──────────────────────────────┬─────────────────────────────────┘
                               │ HTTP/WS/SSE
                               ▼
┌────────────────────────────────────────────────────────────────┐
│                      Server (Node.js)                            │
│  Hono HTTP + WebSocket + SSE                                    │
├────────────────────────────────────────────────────────────────┤
│ Routes Layer    │ Service Layer      │ Agent Layer              │
│ - requirements  │ - git.ts           │ - SessionManager         │
│ - sessions      │ - terminal.ts      │ - AgentAdapter(s)        │
│ - agent         │ - ssh.ts           │ - TaskScheduler          │
│ - analysis      │ - releaseRunner    │ - ContextBuilder         │
│ - subtasks      │ - mergePublish     │ - NormalizedStream       │
│ - release       │ - conflictRes.     │ - TestExecutor (M16)     │
│ - test-plans    │ - jenkins.ts       │ - TestGenerator (M16)    │
│ - test-runs     │ - requirements.ts  │                          │
│ - gate-checks   │ - testRunner.ts    │                          │
│ - defects       │ - qualityGate.ts   │                          │
│ - logs          │ - defectManager.ts │                          │
│ - events        │                    │                          │
├────────────────────────────────────────────────────────────────┤
│                    Data Layer                                    │
│  SQLite (WAL) + Drizzle ORM + Filesystem (attachments/docs)    │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 技术选型

| 层级 | 技术 | 选择理由 |
|------|------|---------|
| **前端框架** | React 18 + TypeScript | 生态成熟,类型安全 |
| **构建工具** | Vite | 极速HMR,ESM native |
| **状态管理** | Zustand | 轻量,无boilerplate |
| **数据缓存** | @tanstack/react-query | 智能缓存+自动刷新 |
| **终端渲染** | xterm.js | 行业标准,性能好 |
| **代码编辑** | Monaco Editor | VS Code同源,功能完整 |
| **HTTP框架** | Hono | 轻量高性能,TypeScript原生 |
| **ORM** | Drizzle | 类型安全,零运行时开销 |
| **数据库** | SQLite (better-sqlite3) | 零配置,单文件,WAL并发 |
| **Git操作** | simple-git | 稳定的git CLI封装 |
| **终端后端** | node-pty | 真实PTY,跨平台 |
| **SSH** | ssh2 | 纯JS SSH实现 |
| **AI SDK** | @anthropic-ai/sdk | Anthropic官方 |
| **WebSocket** | ws | 标准WS实现 |
| **进程管理** | child_process | Node.js原生 |

### 5.3 数据库设计

#### 核心表结构

```sql
-- 需求表
CREATE TABLE requirements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  kind TEXT DEFAULT 'standard',
  stage TEXT DEFAULT 'backlog',
  priority TEXT DEFAULT 'medium',
  workspace TEXT,
  tags TEXT DEFAULT '[]',         -- JSON array
  planned_release_date TEXT,
  released_at TEXT,
  archived_at TEXT,
  analysis_chosen_id TEXT,
  profile_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

-- 需求-项目关联表
CREATE TABLE requirement_projects (
  req_id TEXT NOT NULL REFERENCES requirements(id),
  project TEXT NOT NULL,
  dev_branch TEXT,
  uat_branch TEXT,
  is_primary INTEGER DEFAULT 0,
  PRIMARY KEY (req_id, project)
);

-- 聊天会话表
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL REFERENCES requirements(id),
  title TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  agent TEXT NOT NULL,
  agent_locked INTEGER DEFAULT 0,
  stage_snapshot TEXT,
  profile_id TEXT,
  cwd TEXT,
  archived_at TEXT,
  archive_reason TEXT,
  created_at TEXT NOT NULL
);

-- 聊天消息表
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  entry_type TEXT,
  action TEXT,                    -- JSON
  status TEXT,
  created_at TEXT NOT NULL
);

-- 子任务表
CREATE TABLE sub_tasks (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL REFERENCES requirements(id),
  analysis_id TEXT,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  project TEXT,
  type TEXT NOT NULL,
  wave INTEGER DEFAULT 1,
  task_depends_on TEXT DEFAULT '[]',  -- JSON array
  acceptance TEXT DEFAULT '[]',       -- JSON array
  verify_commands TEXT DEFAULT '[]',  -- JSON array
  risk TEXT,
  status TEXT DEFAULT 'pending',
  session_id TEXT,
  agent TEXT,
  error_message TEXT,
  ordering INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);

-- 事件审计表
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  req_id TEXT,
  type TEXT NOT NULL,
  payload TEXT DEFAULT '{}',     -- JSON
  actor TEXT DEFAULT 'system',
  created_at TEXT NOT NULL
);

-- 日志目标表
CREATE TABLE log_targets (
  id TEXT PRIMARY KEY,
  project TEXT,
  service TEXT NOT NULL,
  environment TEXT DEFAULT 'production',
  hosts TEXT NOT NULL,           -- JSON array
  connect_mode TEXT NOT NULL,
  log_dir TEXT,
  log_glob TEXT,
  jump_hops TEXT,                -- JSON array (custom chain)
  created_at TEXT NOT NULL
);

-- 日志排查会话表
CREATE TABLE log_chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  messages TEXT DEFAULT '[]',    -- JSON array
  steps TEXT DEFAULT '[]',       -- JSON array
  pending INTEGER DEFAULT 0,
  error_message TEXT,
  scoped_target_ids TEXT,        -- JSON array
  scope_key TEXT,
  tab TEXT DEFAULT 'trace',
  input TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 项目配置表
CREATE TABLE projects (
  name TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  lang TEXT,
  default_branch TEXT DEFAULT 'master',
  branch_prefix TEXT,
  merge_strategy TEXT DEFAULT 'merge',
  auto_push INTEGER DEFAULT 0,
  services TEXT DEFAULT '[]',
  jenkins_template_id TEXT,
  data_source_id TEXT,
  log_dir_template TEXT,
  log_glob_template TEXT,
  root_dir TEXT,
  sort_order INTEGER DEFAULT 0
);

-- 需求分析表
CREATE TABLE requirement_analyses (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL REFERENCES requirements(id),
  session_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  model TEXT,
  prompt TEXT NOT NULL,
  raw TEXT,
  output TEXT,                   -- JSON (AnalysisOutput)
  status TEXT DEFAULT 'running',
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
```

#### 数据库升级策略

```typescript
// bootstrap() 在启动时执行
// 1. CREATE TABLE IF NOT EXISTS (幂等)
// 2. ALTER TABLE ADD COLUMN (per-column shims, try-catch吞错)
// 3. 数据修复(如orphaned pending messages → error)
// 不使用drizzle-kit migrate运行时迁移

function bootstrap(): void {
  // 表创建...
  
  // 增量列添加 (允许失败=列已存在)
  safeAlter('ALTER TABLE requirements ADD COLUMN notes TEXT');
  safeAlter('ALTER TABLE sessions ADD COLUMN profile_id TEXT');
  // ...
  
  // 数据修复
  db.run(`UPDATE messages SET status='error' 
          WHERE status='pending' AND created_at < datetime('now', '-5 minutes')`);
}
```

### 5.4 API 设计

#### 约定

| 项目 | 规范 |
|------|------|
| 基础路径 | `/api/*` |
| 认证 | 无 (本地单用户) |
| 格式 | JSON request/response |
| 错误 | `{ error: string, code?: string, details?: unknown }` |
| 分页 | `?limit=N&cursor=<lastId>` (游标分页) |
| 过滤 | 查询参数,逗号分隔多值: `?type=a,b&actor=user` |
| 实时 | SSE (长任务) + WebSocket (终端) |
| 命名 | RESTful: `GET /resources`, `POST /resources`, `PATCH /resources/:id` |

#### 核心端点清单

```
需求管理:
  GET    /api/requirements              列表(支持过滤/分页)
  POST   /api/requirements              创建
  GET    /api/requirements/:id          详情
  PATCH  /api/requirements/:id          更新(含阶段转换)
  DELETE /api/requirements/:id          删除

会话管理:
  GET    /api/sessions?reqId=           列表
  POST   /api/sessions                  创建
  PATCH  /api/sessions/:id              更新(归档/恢复)
  DELETE /api/sessions/:id              删除
  GET    /api/sessions/:id/messages     消息列表

Agent执行:
  POST   /api/agent/run                 执行(SSE响应)
  POST   /api/agent/interrupt/:sessionId 中断
  POST   /api/agent/approve/:sessionId   审批

分析:
  POST   /api/analysis/start            启动分析(多Agent并行)
  POST   /api/analysis/:id/choose       选择候选
  POST   /api/analysis/:id/cancel       取消
  POST   /api/analysis/:id/retry        重试

子任务:
  GET    /api/subtasks?reqId=           列表
  POST   /api/subtasks                  创建
  PATCH  /api/subtasks/:id              更新
  POST   /api/subtasks/start-all        全部启动
  POST   /api/subtasks/start-wave       按波次启动

发布:
  POST   /api/release/start             启动发布(SSE)
  POST   /api/release/:id/resume        恢复(冲突解决后)
  POST   /api/release/:id/cancel        取消
  POST   /api/merge-publish/start       合并发布(SSE)

日志排查:
  POST   /api/logs/chat                 AI排查(SSE)
  POST   /api/logs/exec                 手动命令执行
  CRUD   /api/log-targets               日志目标管理
  CRUD   /api/logs/chat-sessions        排查会话管理

项目配置:
  GET    /api/projects                  列表
  POST   /api/projects/scan             扫描Git目录
  PATCH  /api/projects/:name            更新配置

测试与质量 (M16):
  GET    /api/test-plans?reqId=         测试计划列表
  POST   /api/test-plans                创建测试计划
  PATCH  /api/test-plans/:id            更新计划
  POST   /api/test-runs                 执行测试(SSE响应)
  GET    /api/test-runs/:id             运行结果详情
  GET    /api/test-runs/:id/report      测试报告
  GET    /api/gate-checks?reqId=        门禁检查历史
  POST   /api/gate-checks/run           手动触发门禁
  CRUD   /api/defects                   缺陷管理
  GET    /api/coverage?project=         覆盖率数据

事件审计:
  GET    /api/events                    全局事件流
  GET    /api/events/by-req/:reqId      需求事件
  POST   /api/events                    写入事件
```

### 5.5 实时通信设计

| 场景 | 协议 | 端点 | 帧格式 |
|------|------|------|--------|
| Agent执行 | SSE | POST /api/agent/run | `data: {AgentStreamEvent}\n\n` |
| 日志排查 | SSE | POST /api/logs/chat | `data: {LogStreamEvent}\n\n` |
| 发布进度 | SSE | POST /api/release/start | `data: {ReleaseEvent}\n\n` |
| 测试执行 | SSE | POST /api/test-runs | `data: {TestRunEvent}\n\n` |
| 门禁检查 | SSE | POST /api/gate-checks/run | `data: {GateCheckEvent}\n\n` |
| 终端 I/O | WebSocket | /api/terminal/ws/:id | 二进制帧(PTY输出) |

### 5.6 文件系统布局

```
<dataDir>/
├── lite-kanban.db              # SQLite数据库
├── attachments/                # 需求附件
│   └── <reqId>/
│       └── <filename>
├── docs/                       # 需求文档(可编辑文本)
│   └── <reqId>/
│       └── <name>.md
└── worktrees/                  # Git Worktree (按需创建)
    └── <reqId>/
        └── <project>/
```

---

## 6. 开发规范与标准

### 6.1 代码组织规范

#### 目录结构

```
/
├── client/                     # 前端工作区
│   ├── src/
│   │   ├── api/               # API客户端+hooks
│   │   │   ├── client.ts      # 类型化API客户端
│   │   │   ├── hooks.ts       # React Query hooks
│   │   │   └── agentStream.ts # SSE消费器
│   │   ├── views/             # 顶级视图组件
│   │   ├── components/        # 共享组件
│   │   │   ├── modals/        # 模态框
│   │   │   ├── logs/          # 日志模块组件
│   │   │   ├── conflict/      # 冲突解决组件
│   │   │   └── agent/         # Agent相关组件
│   │   ├── lib/               # 工具函数
│   │   ├── App.tsx            # 顶层路由+状态
│   │   └── main.tsx           # 入口
│   ├── index.html
│   └── vite.config.ts
├── server/                     # 后端工作区
│   ├── src/
│   │   ├── routes/            # HTTP路由(每模块一文件)
│   │   ├── services/          # 业务逻辑服务
│   │   ├── agents/            # Agent适配器+管理器
│   │   ├── db/                # Schema+bootstrap
│   │   └── index.ts           # 入口(Hono app)
│   └── data/                  # 运行时数据(git ignored)
├── shared/                     # 共享类型
│   └── src/
│       └── index.ts
└── package.json               # workspace根配置
```

#### 命名约定

| 对象 | 规则 | 示例 |
|------|------|------|
| 文件(组件) | PascalCase | `BoardView.tsx` |
| 文件(服务) | camelCase | `releaseRunner.ts` |
| 文件(路由) | camelCase | `requirements.ts` |
| 组件 | PascalCase | `export function LogChatPanel()` |
| 接口/类型 | PascalCase | `interface SubTask` |
| 函数 | camelCase | `function resolveTaskCwd()` |
| 常量 | UPPER_SNAKE | `const MAX_HOPS = 20` |
| 数据库列 | snake_case | `created_at`, `req_id` |
| API路径 | kebab-case | `/api/log-targets` |
| CSS类 | kebab-case | `.lg-sidebar-item` |

### 6.2 前端开发规范

#### 状态管理策略

| 状态类型 | 方案 | 示例 |
|---------|------|------|
| 服务器数据 | React Query | 需求列表、会话消息 |
| 全局UI状态 | Zustand store | 当前视图、选中需求 |
| 组件局部状态 | useState | 表单输入、展开/折叠 |
| 跨组件通信 | Props/Callbacks | 父子组件数据流 |
| 持久化偏好 | localStorage | 过滤器、排序、主题 |

#### React Query 配置

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,              // 5秒内不重新请求
      refetchOnWindowFocus: false,    // 不自动刷新
      retry: 1,                       // 最多重试1次
    },
  },
});
```

#### 组件编写原则

1. 单文件组件 < 500行; 超过则拆分为子组件或hooks
2. 复杂逻辑提取为自定义hook (`use*.ts`)
3. 副作用集中在 `useEffect` 中,明确依赖数组
4. 事件处理用 `useCallback` 包裹(传递给子组件时)
5. 列表渲染必须有稳定的 `key`

### 6.3 后端开发规范

#### 路由编写模式

```typescript
// 每个路由文件导出 Hono 实例
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../db/index.js';

export const myRouter = new Hono();

// GET - 列表
myRouter.get('/', (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);
  const rows = db.select().from(schema.myTable).limit(limit).all();
  return c.json(rows);
});

// POST - 创建 (Zod校验)
const createSchema = z.object({
  title: z.string().min(1).max(200),
  // ...
});

myRouter.post('/', async (c) => {
  const body = createSchema.parse(await c.req.json());
  // 业务逻辑...
  return c.json(result, 201);
});
```

#### 错误处理

```typescript
// 路由层: 返回HTTP错误
return c.json({ error: '需求不存在' }, 404);
return c.json({ error: '阶段转换不允许', code: 'INVALID_TRANSITION' }, 409);

// 服务层: 抛出业务异常
throw new AppError('CONFLICT_DETECTED', '合并冲突', { files: conflictFiles });

// 全局中间件: 统一捕获
app.onError((err, c) => {
  if (err instanceof AppError) return c.json({ error: err.message, code: err.code }, err.status);
  console.error('[unhandled]', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
```

### 6.4 注释规范

```typescript
// 本项目注释风格: 解释 WHY, 不解释 WHAT
// 允许混合中英文, 解释业务背景和非显而易见的设计决策

// 好的注释:
// dev→prerelease 是给 no_code 或紧急 hotfix 用的跳过 UAT 通道,
// 仍然必须填 plannedReleaseDate (由 requirements PATCH 校验)。

// 不需要的注释:
// 获取需求列表  ← 代码自解释
```

---

## 7. 用户界面设计规范

### 7.1 设计语言

| 维度 | 规范 |
|------|------|
| 色彩方案 | 深色主题为主 (bg: #1a1b2e, surface: #252640) |
| 主色调 | 蓝色系 (#4a9eff) 用于交互元素 |
| 字体 | 系统字体栈 (San Francisco / Segoe UI / 思源) |
| 间距 | 4px基准网格 |
| 圆角 | 8px (卡片), 6px (按钮), 4px (输入框) |
| 动画 | 200ms ease-out (状态变化), 300ms (进入/退出) |

### 7.2 布局模式

#### 全局布局

```
┌──────────────────────────────────────────────────────────┐
│ [Nav] │              Main Content Area                    │
│  看板  │                                                  │
│  工作区│  (视图切换区域,占据剩余空间)                       │
│  活动  │                                                  │
│  契约  │                                                  │
│  项目  │                                                  │
│  日志  │                                                  │
│  归档  │                                                  │
│       │                                                   │
│  [设置]│                              [Status Bar]        │
└──────────────────────────────────────────────────────────┘
```

#### 视图内布局模式

| 模式 | 适用视图 | 结构 |
|------|---------|------|
| 单面板 | 看板、活动、归档 | 全宽内容 |
| 双面板 | 工作区、项目 | 列表(左) + 详情(右) |
| 三面板 | 日志排查 | 目录(左) + 主操作(中) + 辅助(右) |
| 全屏覆盖 | 冲突解决 | 覆盖全屏,独立布局 |

### 7.3 交互模式

| 模式 | 描述 | 使用场景 |
|------|------|---------|
| 拖拽转换 | 拖拽到目标区域触发确认Modal | 看板阶段转换 |
| 确认Modal | 重要操作前的确认对话框 | 阶段转换/删除/发布 |
| 内联编辑 | 点击文本直接编辑 | 标题/描述/备注 |
| SSE流式 | 实时展示AI输出 | Agent对话/日志排查 |
| Toast通知 | 非阻断性结果反馈 | 保存成功/操作完成 |
| 命令面板 | Cmd+K 全局搜索跳转 | 快速导航 |

### 7.4 响应式策略

- **最小宽度**: 1280px (桌面工具,不做移动端适配)
- **面板可拖拽**: 双面板/三面板的分隔线支持拖拽调整宽度
- **折叠优先**: 空间不足时左侧栏可折叠为图标模式

---

## 8. 测试策略与质量保证

> **详细规范**: 测试模块的完整设计见 [`PRD-testing-module.md`](./PRD-testing-module.md)，本章为核心概要。

### 8.1 核心理念: PIV-TDD Loop

测试不是开发完成后的附加步骤，而是深度嵌入开发循环的核心活动。系统采用 **PIV-TDD Loop** (Plan → Test-First → Implement → Validate → Report) 模式：

```
┌─────────────────────────────────────────────────────────────┐
│                    PIV-TDD Loop (每个SubTask)                │
│                                                             │
│  Plan ──→ Test-First ──→ Implement ──→ Validate ──→ Report │
│   │         │               │             │           │     │
│   │      AI生成测试       AI写代码      自动运行     更新状态 │
│   │      用例/断言       满足测试       测试套件     质量报告 │
│   └─────────────────── 失败时回退 ←────────┘           │     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 测试金字塔与覆盖目标

```
          /\
         /  \        E2E Tests (10%)
        /    \       关键用户路径: 5-10个核心场景
       /──────\
      /        \     Integration Tests (20%)
     /          \    API端点 + 跨模块交互 + 数据流
    /────────────\
   /              \  Unit Tests (70%)
  /                \ 纯逻辑函数 + 服务层 + 算法
 /──────────────────\
```

| 层级 | 范围 | 工具 | AI参与方式 | 覆盖目标 |
|------|------|------|-----------|---------|
| 单元测试 | 纯函数/服务逻辑 | vitest/jest/node:assert | AI自动生成+运行 | ≥80% 行覆盖 |
| 集成测试 | API端点+数据库 | supertest + 测试DB | AI生成场景+验证 | 所有端点+业务规则 |
| E2E测试 | 关键用户路径 | Playwright | AI辅助场景定义 | P0功能路径 |
| 性能测试 | 响应时间/并发 | k6/autocannon | AI分析瓶颈 | 基线对比无退化 |

### 8.3 质量门禁体系

系统在阶段转换时自动执行质量门禁检查，任一必选项不通过则阻止转换：

```typescript
interface QualityGate {
  stage: 'development→uat' | 'uat→prerelease' | 'prerelease→released';
  checks: QualityCheck[];
  policy: 'all_pass' | 'weighted_score';
  threshold?: number;  // weighted_score模式下的通过分数
}

interface QualityCheck {
  type: 'unit_test' | 'integration_test' | 'e2e_test' | 'type_check' 
      | 'lint' | 'security_scan' | 'coverage' | 'performance';
  required: boolean;
  weight?: number;
  config: Record<string, unknown>;
}
```

| 门禁时机 | 必须通过 | 建议通过 |
|---------|---------|---------|
| development → uat | TypeScript编译, 单元测试, 安全白名单 | 覆盖率≥80%, lint |
| uat → prerelease | 集成测试, E2E P0用例, 无P0/P1缺陷 | 性能基线无退化 |
| prerelease → released | 回归测试全过, 冒烟测试, 安全扫描 | 变更日志完整 |

### 8.4 AI驱动的测试生成

```typescript
// AI测试生成引擎
class TestGenerator {
  async generateForTask(task: SubTask): Promise<TestSuite> {
    const context = {
      taskSpec: task.prompt,
      sourceFiles: await getAffectedFiles(task),
      existingTests: await findRelatedTests(task),
      projectConventions: await getTestConventions(task.project),
    };
    
    // AI生成测试用例 (Test-First)
    const prompt = buildTestGenPrompt(context);
    const generatedTests = await agent.generate(prompt);
    
    return {
      cases: parseTestCases(generatedTests),
      framework: detectFramework(task.project),
      coverage: 'affected_files',
    };
  }
}
```

### 8.5 缺陷管理闭环

测试失败自动创建缺陷，AI分析根因并建议修复方案：

```
测试失败 → 自动创建Defect → AI分析根因 → 关联SubTask → AI修复 → 回归验证
    │                                                               │
    └────────────── 严重缺陷阻止质量门禁通过 ──────────────────────────┘
```

### 8.6 CI/CD集成点

| 阶段 | 测试活动 | 触发方式 | 失败策略 |
|------|---------|---------|---------|
| SubTask完成 | 运行verifyCommands + 影响测试 | TaskExecutor自动 | 标记失败,AI重试 |
| dev→uat合并 | 质量门禁(单元+类型+安全) | 阶段转换拦截 | 阻止转换,报告原因 |
| UAT阶段 | 集成测试+验收测试套件 | AI自动执行 | 创建缺陷跟踪 |
| uat→prerelease | 质量门禁(集成+E2E+无缺陷) | 阶段转换拦截 | 列出未关闭缺陷 |
| 预发布阶段 | 回归测试+冒烟测试+性能基线 | AI自动执行 | 阻止发布 |

### 8.7 关键测试场景 (现有模块)

#### 必须覆盖的单元测试

```
services/logCommandWhitelist.ts
  - 白名单命令通过
  - 危险符号拒绝
  - 引号内特殊字符处理
  - 管道链合法性

services/taskScheduler.ts
  - DAG环检测
  - 拓扑排序正确性
  - 同项目串行约束
  - 依赖完成后自动就绪

services/qualityGate.ts (M16新增)
  - 门禁策略配置正确性
  - 加权评分计算
  - 必选项阻止逻辑

shared/index.ts
  - canTransition() 阶段转换规则
  - stageLabel() 标签回退
```

#### 必须覆盖的集成测试

```
routes/requirements.ts
  - 创建需求 → 验证默认值
  - 阶段转换 → 验证规则执行 + 质量门禁拦截
  - 无效转换 → 验证409拒绝
  - 关联项目 → 验证多对多

routes/test-plans.ts (M16新增)
  - 创建测试计划 → 验证自动关联需求
  - 执行测试 → 验证结果记录
  - 查询报告 → 验证覆盖率统计

routes/subtasks.ts
  - 创建任务 → 依赖校验
  - 启动任务 → TDD模式测试先行
  - 完成任务 → 验证命令通过 + 后续任务就绪
```

### 8.8 验收标准模板

每个功能模块的验收标准遵循以下模板:

```markdown
### [模块名] 验收标准

**P0 (必须通过)**:
- [ ] 核心功能场景1
- [ ] 核心功能场景2
- [ ] 错误处理场景

**P1 (应当通过)**:
- [ ] 边界条件1
- [ ] 性能基准(响应时间<Nms)
- [ ] 质量门禁不误判

**P2 (最好通过)**:
- [ ] 优化体验场景
- [ ] 测试覆盖率达标
```

---

## 9. 部署方案与运维策略

### 9.1 安装方式

#### 方式一: npm 全局安装 (推荐)

```bash
# 一键安装
npx create-devflow@latest

# 或全局安装
npm install -g devflow
devflow init
devflow start
```

#### 方式二: 源码安装

```bash
git clone <repo>
cd devflow
npm install
npm run db:seed    # 初始化数据库
npm run dev        # 开发模式
# 或
npm run build && npm start  # 生产模式
```

#### 方式三: Docker (可选)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci && npm run build
EXPOSE 4000
CMD ["npm", "start"]
```

### 9.2 首次安装向导

```
步骤1: 欢迎页面
  → 检测Node.js版本
  → 检测Git可用性

步骤2: 项目扫描
  → 输入Git根目录(支持多个)
  → 自动扫描发现项目
  → 语言/框架识别

步骤3: AI配置
  → 选择AI Provider (Anthropic/DeepSeek/OpenAI/Ollama)
  → 输入API Key
  → 连通性测试

步骤4: SSH配置 (可选)
  → 跳板机地址/凭证
  → 连通性测试

步骤5: 完成
  → 展示仪表板
  → 引导创建第一个需求
```

### 9.3 数据备份与恢复

```bash
# 备份 (单文件)
cp server/data/lite-kanban.db backup/devflow-$(date +%Y%m%d).db

# 恢复
cp backup/devflow-20260516.db server/data/lite-kanban.db

# 自动备份 (cron)
0 2 * * * cp /path/to/lite-kanban.db /path/to/backup/devflow-$(date +\%Y\%m\%d).db
```

### 9.4 升级策略

```
版本检测 → 下载新版 → 停止服务 → 备份DB → 启动新版(bootstrap自动升级)
```

- 数据库升级通过 `bootstrap()` 中的 `ALTER TABLE` shims 自动完成
- 无破坏性变更: 只加列不删列,新列有默认值
- 大版本升级: 提供迁移脚本

### 9.5 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 4000 | HTTP服务端口 |
| `LK_DB_PATH` | `server/data/lite-kanban.db` | 数据库路径 |
| `LK_AGENT_IDLE_MS` | 1800000 (30min) | Agent空闲超时 |
| `LK_AGENT_DEBUG` | 0 | 调试模式 |
| `ANTHROPIC_API_KEY` | - | Anthropic API密钥 |
| `ANTHROPIC_BASE_URL` | - | API代理地址(可选) |

### 9.6 监控与日志

| 维度 | 实现 |
|------|------|
| 应用日志 | stdout/stderr (可重定向到文件) |
| 错误追踪 | events表记录所有error类型事件 |
| 性能监控 | 内置/api/health端点(DB大小/Agent数/uptime) |
| 磁盘监控 | Worktree定期清理建议(超过阈值告警) |

---

## 10. 项目开发路线图

### 10.1 里程碑规划

```
M0: Foundation (基础架构)
│   交付: 项目骨架 + DB + 基础CRUD + 看板UI
│
M1: Core Flow (核心流程)
│   交付: 需求生命周期 + 单Agent对话 + 基础Git操作
│
M2: Agent Orchestra (Agent编排)
│   交付: 多Agent适配 + 分析引擎 + 子任务调度
│
M2.5: Testing & Quality (测试与质量保证)
│   交付: TDD引擎 + 质量门禁 + 测试生成 + 缺陷管理 + 覆盖率追踪
│
M3: Release Automation (发布自动化)
│   交付: 发布状态机 + 合并发布 + 冲突解决 + Jenkins
│
M4: Ops Intelligence (运维智能)
│   交付: 日志排查 + SSH多跳 + AI诊断
│
M5: Polish & Productize (打磨产品化)
    交付: 安装向导 + 统计仪表 + 性能优化 + 文档
```

### 10.2 M0: Foundation — 任务分解

| 任务ID | 任务 | 依赖 | 类型 |
|--------|------|------|------|
| M0-01 | 初始化monorepo结构(client/server/shared) | - | 基础设施 |
| M0-02 | 配置Vite + React + TypeScript | M0-01 | 前端 |
| M0-03 | 配置Hono + SQLite + Drizzle | M0-01 | 后端 |
| M0-04 | 定义shared类型(Stage/Priority/Requirement) | M0-01 | 共享 |
| M0-05 | 实现bootstrap() + DB schema | M0-03 | 后端 |
| M0-06 | 实现requirements CRUD路由 | M0-05 | 后端 |
| M0-07 | 实现apiClient + React Query hooks | M0-02,M0-06 | 前端 |
| M0-08 | 实现BoardView看板UI(拖拽) | M0-07 | 前端 |
| M0-09 | 实现NavSidebar + App路由 | M0-02 | 前端 |
| M0-10 | 实现settings路由 + SettingsModal | M0-05 | 全栈 |
| M0-11 | Vite代理配置 + dev脚本 | M0-02,M0-03 | 基础设施 |

### 10.3 M1: Core Flow — 任务分解

| 任务ID | 任务 | 依赖 | 类型 |
|--------|------|------|------|
| M1-01 | 阶段转换规则 + 确认Modal | M0-08 | 前端 |
| M1-02 | projects扫描 + 配置路由 | M0-05 | 后端 |
| M1-03 | ProjectsView管理界面 | M1-02 | 前端 |
| M1-04 | Git服务(simple-git封装) | M0-03 | 后端 |
| M1-05 | Worktree管理(create/remove) | M1-04 | 后端 |
| M1-06 | sessions CRUD + messages存储 | M0-05 | 后端 |
| M1-07 | AgentSession基类 + SessionManager | M1-06 | 后端 |
| M1-08 | ClaudeSession适配器(stream-json) | M1-07 | 后端 |
| M1-09 | ChatWorkspace基础UI | M1-06 | 前端 |
| M1-10 | SSE agentStream消费器 | M1-08 | 前端 |
| M1-11 | NormalizedEntry渲染组件 | M1-10 | 前端 |
| M1-12 | 工具审批UI + API | M1-11 | 全栈 |
| M1-13 | events路由 + ActivityView | M0-05 | 全栈 |

### 10.4 M2: Agent Orchestra — 任务分解

| 任务ID | 任务 | 依赖 | 类型 |
|--------|------|------|------|
| M2-01 | AgentAdapter统一接口定义 | M1-07 | 后端 |
| M2-02 | CodexSession适配器 | M2-01 | 后端 |
| M2-03 | DeepSeekSession适配器 | M2-01 | 后端 |
| M2-04 | GeminiSession(ACP)适配器 | M2-01 | 后端 |
| M2-05 | Agent可用性检测(which) | M2-01 | 后端 |
| M2-06 | Agent选择器UI + 能力展示 | M2-05 | 前端 |
| M2-07 | analysisPrompt构建器 | M1-04 | 后端 |
| M2-08 | analysis路由(并行启动) | M2-07 | 后端 |
| M2-09 | AnalysisOutput JSON解析器 | M2-08 | 后端 |
| M2-10 | AnalysisComparePanel UI | M2-09 | 前端 |
| M2-11 | SubTask数据模型 + CRUD | M2-09 | 后端 |
| M2-12 | DAG拓扑排序 + 环检测 | M2-11 | 后端 |
| M2-13 | TaskScheduler(Wave调度) | M2-12 | 后端 |
| M2-14 | TaskExecutor(上下文注入) | M2-13,M1-05 | 后端 |
| M2-15 | SubTaskPanel UI | M2-11 | 前端 |
| M2-16 | 契约管理路由 + ContractsView | M2-09 | 全栈 |

### 10.5 M2.5: Testing & Quality — 任务分解

| 任务ID | 任务 | 依赖 | 类型 |
|--------|------|------|------|
| M2.5-01 | 测试相关DB表(test_plans/suites/cases/runs/defects/gate_checks) | M0-05 | 后端 |
| M2.5-02 | TestFrameworkAdapter接口(vitest/jest/pytest/go-test) | M2.5-01 | 后端 |
| M2.5-03 | TestRunner执行引擎(运行+解析结果) | M2.5-02 | 后端 |
| M2.5-04 | TestGenerator AI测试生成器 | M2.5-03,M2-14 | 后端 |
| M2.5-05 | PIV-TDD Loop集成到TaskExecutor | M2.5-04,M2-14 | 后端 |
| M2.5-06 | QualityGate质量门禁引擎 | M2.5-03 | 后端 |
| M2.5-07 | 阶段转换拦截器(门禁校验) | M2.5-06,M1-01 | 后端 |
| M2.5-08 | CoverageCollector覆盖率收集 | M2.5-03 | 后端 |
| M2.5-09 | DefectManager缺陷管理(自动创建+关联) | M2.5-03,M2-11 | 后端 |
| M2.5-10 | test-plans CRUD路由 | M2.5-01 | 后端 |
| M2.5-11 | test-runs执行路由(SSE进度) | M2.5-03 | 后端 |
| M2.5-12 | gate-checks路由(查询/手动触发) | M2.5-06 | 后端 |
| M2.5-13 | defects CRUD路由 | M2.5-09 | 后端 |
| M2.5-14 | TestDashboard UI(覆盖率/趋势/门禁状态) | M2.5-10,M2.5-12 | 前端 |
| M2.5-15 | DefectListPanel UI(缺陷列表+详情) | M2.5-13 | 前端 |
| M2.5-16 | QualityGateModal(转换时显示门禁结果) | M2.5-07 | 前端 |
| M2.5-17 | TestReportView(测试报告+历史对比) | M2.5-11 | 前端 |
| M2.5-18 | PerformanceBaseline基线管理 | M2.5-03 | 后端 |
| M2.5-19 | 回归测试选择器(影响分析) | M2.5-04,M1-04 | 后端 |
| M2.5-20 | apiClient + hooks (测试模块) | M2.5-10~13 | 前端 |

### 10.6 M3: Release Automation — 任务分解

| 任务ID | 任务 | 依赖 | 类型 |
|--------|------|------|------|
| M3-01 | ReleaseRunner状态机 | M1-04 | 后端 |
| M3-02 | MergePublishRunner状态机 | M3-01 | 后端 |
| M3-03 | 冲突检测 + 文件列表API | M1-04 | 后端 |
| M3-04 | ConflictResolutionView框架 | M3-03 | 前端 |
| M3-05 | MergeEditor(Monaco三列) | M3-04 | 前端 |
| M3-06 | 冲突块解析器(conflictBlocks) | M3-05 | 前端 |
| M3-07 | AI冲突建议(SSE流) | M3-06 | 全栈 |
| M3-08 | Jenkins集成(模板+触发+状态) | M3-01 | 后端 |
| M3-09 | QuickPublishView | M3-08 | 前端 |
| M3-10 | 发布SSE事件流 + 前端消费 | M3-01 | 全栈 |

### 10.7 M4: Ops Intelligence — 任务分解

| 任务ID | 任务 | 依赖 | 类型 |
|--------|------|------|------|
| M4-01 | SSH服务(ssh2封装) | M0-03 | 后端 |
| M4-02 | 直连模式实现 | M4-01 | 后端 |
| M4-03 | 跳板机模式(状态机) | M4-01 | 后端 |
| M4-04 | 多跳自定义链路 | M4-03 | 后端 |
| M4-05 | logCommandWhitelist安全过滤 | M4-01 | 后端 |
| M4-06 | logCommandWhitelist.test测试 | M4-05 | 测试 |
| M4-07 | logTargets CRUD路由 | M0-05 | 后端 |
| M4-08 | logs/chat SSE路由(AI循环) | M4-02,M4-05 | 后端 |
| M4-09 | LogsView三栏布局 | M4-07 | 前端 |
| M4-10 | LogChatPanel(SSE消费+状态) | M4-08 | 前端 |
| M4-11 | LogsSidebar(目标目录) | M4-07 | 前端 |
| M4-12 | RightRail(主机拓扑+历史) | M4-10 | 前端 |
| M4-13 | 精确关键词守卫 | M4-08 | 后端 |
| M4-14 | 链路日志自动归档 | M4-08 | 后端 |
| M4-15 | node-pty终端服务 | M0-03 | 后端 |
| M4-16 | TerminalPanel(xterm.js) | M4-15 | 前端 |

### 10.8 M5: Polish & Productize — 任务分解

| 任务ID | 任务 | 依赖 | 类型 |
|--------|------|------|------|
| M5-01 | 安装向导(首次启动引导) | 全部 | 全栈 |
| M5-02 | 看板统计仪表板 | M0-08 | 前端 |
| M5-03 | API文档自动生成 | M1-04,M2-09 | 后端 |
| M5-04 | 发布文档自动生成 | M3-01 | 后端 |
| M5-05 | 归档视图(ArchiveView) | M0-06 | 全栈 |
| M5-06 | 全局快捷键系统 | M0-09 | 前端 |
| M5-07 | 性能优化(虚拟滚动/懒加载) | 全部 | 前端 |
| M5-08 | 错误边界 + 优雅降级 | 全部 | 前端 |
| M5-09 | 数据备份/恢复工具 | M0-05 | 后端 |
| M5-10 | 健康检查端点 | M0-03 | 后端 |

### 10.9 任务依赖图 (关键路径)

```
M0-01 → M0-03 → M0-05 → M0-06 → M0-07 → M0-08 (看板可用)
                    │
                    └→ M1-04 → M1-05 → M1-07 → M1-08 → M1-10 (Agent可用)
                                  │
                                  └→ M2-07 → M2-08 → M2-09 → M2-11 → M2-12 → M2-13 → M2-14 (调度可用)
                                                                                    │
                                                          M2.5-01 → M2.5-03 → M2.5-04 → M2.5-05 (TDD可用)
                                                                         │
                                                                         └→ M2.5-06 → M2.5-07 (门禁可用)
                                                                                          │
                                                                        M3-01 ← ─ ─ ─ ─ ─┘ (发布可用)
                                                                          
M0-03 → M4-01 → M4-02 → M4-08 → M4-10 (日志排查可用)
```

**关键路径**: M0-01 → M0-03 → M0-05 → M1-04 → M1-07 → M2-07 → M2-12 → M2-14 → M2.5-05 → M2.5-07 → M3-01

---

## 附录

### A. 术语表

| 术语 | 定义 |
|------|------|
| Agent | AI CLI代理程序(如Claude Code, Codex) |
| Worktree | Git工作树,用于隔离并行开发 |
| Wave | 子任务执行波次,同wave可并行 |
| Spec | 结构化需求规格(AnalysisOutput) |
| Contract | 跨项目接口契约(API/MQ/DM) |
| SSE | Server-Sent Events,服务端推送 |
| DAG | 有向无环图,描述任务依赖 |
| PTY | 伪终端,用于交互式shell |
| Runner Profile | Agent运行配置(环境变量/安装命令) |
| PIV-TDD Loop | Plan-Implement-Validate测试驱动循环 |
| Quality Gate | 质量门禁,阶段转换前的自动化检查 |
| Test-First | 测试先行,先写测试用例再实现代码 |
| Coverage | 代码覆盖率,衡量测试完整度 |
| Defect | 缺陷,测试失败产生的问题记录 |
| Regression | 回归测试,验证修改未引入新问题 |

### B. 参考竞品

| 产品 | 参考要素 |
|------|---------|
| OpenAI Symphony | Spec驱动、Agent自治、Supervisor模式、隔离执行 |
| Lite-Kanban | 看板UI、多Agent适配、运维日志、冲突解决、发布状态机 |
| Linear | 看板设计语言、快捷键体验 |
| GitLab | CI/CD集成、Merge Request流程 |
| Cursor | AI编码体验、上下文管理 |

### C. 开放设计问题

| 编号 | 问题 | 影响 | 建议决策时机 |
|------|------|------|------------|
| OQ-01 | 团队版是否需要PostgreSQL | M5后 | v2.5规划时 |
| OQ-02 | 是否支持自定义阶段(扩展Stage) | 灵活性 vs 复杂度 | v2.0规划时 |
| OQ-03 | MCP协议是否作为Agent通信标准 | Agent扩展性 | M2开发时 |
| OQ-04 | 是否引入Webhook对外通知 | 集成能力 | M5开发时 |
| OQ-05 | 是否支持多语言(i18n) | 国际化 | v2.0规划时 |

---

*本文档作为 DevFlow v2 从零开发的完整规格定义。开发团队和 AI 代理应以本文档为唯一设计参考，实现时遵循各章节约定的规范和接口定义。*
