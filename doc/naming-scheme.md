# Naming Scheme: Agentic Dev Harness

> 确定日期: 2026-05-16

## 最终命名

| 层级 | 名称 | 用途 |
|------|------|------|
| 品牌全称 | **Agentic Dev Harness** | 文档标题、对外介绍 |
| 目录名 | `harness/` | 项目内物理路径（保持简短） |
| SEO 关键词组 | `agentic-dev-harness` | URL slug、包名、搜索优化标识 |
| README H1 | `DevFlow Agent Harness` | 当前 README 标题（兼容存量引用） |

## 构词要素

| 要素 | 选用 | 理由 |
|------|------|------|
| Agent 主导 | **Agentic** | 2024-2026 AI 领域高频搜索词，精确匹配"自主 Agent"语义 |
| 开发者受众 | **Dev** | 核心目标用户是开发者，Dev 作为缩写兼具搜索覆盖与简洁性 |
| 马具隐喻 | **Harness** | 项目主打概念——用协议"驾驭"AI Agent，harness 同时是技术术语（test harness）和隐喻（马具） |

## SEO 搜索覆盖分析

`agentic-dev-harness` 可被以下搜索模式命中：

- `agentic development` / `agentic dev`
- `agent harness` / `dev harness`
- `agentic harness`
- `AI agent development harness`
- `agent-driven developer harness`
- `coding agent harness protocol`

## 备选方案记录（已淘汰）

| 方案 | 淘汰原因 |
|------|---------|
| `agentic-sdlc-protocol` | 缺少 harness 品牌词，SDLC 过于学术 |
| `Harnetic` | 造词辨识度高但搜索命中率低，新词无自然流量 |
| `DevHarness` | 缺少 Agent/Agentic 要素 |
| `agent-sdlc-protocol` | 同上，缺 harness |
| `devflow-agent-protocol` | "devflow" 非通用术语，搜索覆盖窄 |

## 使用规范

- 对外文档、博客、搜索优化场景使用 **Agentic Dev Harness** 全称
- 项目内引用使用 `harness/` 路径
- package.json name 字段（若独立发包）使用 `agentic-dev-harness`
- 中文语境可用"Agentic 开发马具"或直接用英文原名
