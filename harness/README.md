# DevFlow Agent Harness

> 文档版本: 1.1.0 · 2026-05-16
> 这是一个**目录页**。详细规则在各篇内文，原则与 SSOT 在 `PRINCIPLES.md`。

## 是什么

`harness/` 是 DevFlow 系统的**通用 Agent 执行协议**。Agent 读完本目录，应能在任意 DevFlow 兼容实例上自主完成"需求 → 分析 → 开发 → 测试 → 发布"。

仓库根 [`AGENTS.md`](../AGENTS.md) 是**运行时入口**（给 Claude Code / Codex / OpenCode 等 CLI 读）。
本目录是**协议规范**（给协议设计者与适配器开发者读）。

## 文件清单

```
harness/
├── README.md            (本文件，目录索引)
├── PRINCIPLES.md        设计原则 + SSOT + 一致性规则
├── 01-architecture.md   架构事实速查
├── 02-requirement-spec.md   RequirementSpec 模板与字段
├── 03-domain-model.md   数据类型 & Schema 索引
├── 04-agent-protocol.md REST + SSE 接口手册
├── 05-stage-gates.md    阶段门禁（stage 推进 SSOT）
├── 06-test-contract.md  acceptance ↔ verifyCommands ↔ TestRunResult
├── 07-execution-playbook.md   端到端 Agent 操作 Playbook
├── examples/
│   ├── sample-requirement.yaml          standard / 单项目
│   ├── sample-no-code.yaml              no_code 类
│   ├── sample-multi-project.yaml        多项目 + 跨项目依赖
│   ├── sample-invalid.yaml              反例（应被 validator 拒绝）
│   └── sample-acceptance-tests.md       从 acceptance 派生的测试计划
└── tools/
    └── validate-spec.mjs                落地 02 § 4 校验规则
```

## 想做 X → 看哪篇

| 场景 | 入口 |
|------|------|
| 第一次接管一个需求 | `07-execution-playbook.md` |
| 写一个新的 RequirementSpec | `02-requirement-spec.md` + `examples/` |
| 校验 spec 合法性 | `node tools/validate-spec.mjs <spec.yaml>` |
| API 报错 / 想确认入参 | `04-agent-protocol.md` |
| 想知道某阶段能否推进 | `05-stage-gates.md`（**stage SSOT**） |
| 把"验收标准"落成可执行测试 | `06-test-contract.md` |
| 想知道某字段在哪张表 | `03-domain-model.md` |
| 设计原则 / 人机边界 / 预算治理 | `PRINCIPLES.md` |

## 适配新项目

任何符合以下条件的实例可直接使用本 harness：

- 后端暴露 `/api/*` RESTful 端点（参 `04-agent-protocol.md`）
- 实现六阶段生命周期 `backlog → analyzing → development → uat → prerelease → released`
- 有 append-only events 表用于审计
- 至少一种 Agent CLI 适配器

通过 `GET /api/settings` 与 `GET /api/agent/availability` 在运行时探测实例配置。

## 快速开始（Agent 侧）

```
1. 读 ../AGENTS.md  → 拿到 BASE_URL 与硬约束
2. GET {BASE_URL}/settings        → 200 即可达
3. GET {BASE_URL}/agent/availability → 选定可用 CLI
4. 读 07-execution-playbook.md    → 按 phase 执行
```
