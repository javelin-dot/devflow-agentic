# DevFlow

> AI 原生的研发全生命周期编排平台。从需求提出到发布上线，人类定义目标，AI 自治执行，系统保障过程可控。

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器（同时启动前后端）
npm run dev

# 3. 打开浏览器
open http://localhost:5173
```

后端运行在 `http://localhost:4000`，前端通过 Vite proxy 将 `/api` 转发到后端。

## 核心能力

| 能力 | 状态 | 说明 |
|------|------|------|
| 需求看板 | 可用 | 6 列看板（backlog → released），支持新建、详情、阶段流转 |
| AI Agent 执行 | 可用 | 支持 Claude Code / OpenAI 兼容模型，SSE 流式渲染 |
| 多 Agent 分析 | 可用 | 并行启动多 Agent 分析需求，对比候选方案 |
| 子任务调度 | 基础可用 | SubTask CRUD + 分析自动派生，DAG 调度器骨架已就位 |
| 项目扫描 | 可用 | 自动扫描 Git 目录，识别语言框架 |
| 发布管理 | 骨架 | ReleaseRun / MergePublishRun 表 + 路由已定义 |
| 测试质量 | 骨架 | TestPlan / TestCase / TestRun / Defect / GateCheck 表已定义 |
| 运维日志 | 骨架 | LogTarget / LogChatSession 表 + 路由已定义 |
| 安装向导 | 可用 | 首次启动引导配置 |

## 技术栈

- **Runtime**: Node.js 20+ (frontend), Python 3.12+ (backend)
- **后端**: FastAPI + SQLAlchemy async + PostgreSQL (pgvector) + MinIO + Redis
- **前端**: React 18 + TypeScript + Vite + TanStack Query + Zustand
- **Agent 适配**: Claude Code (stream-json) + OpenAI 兼容 API
- **Monorepo**: npm workspaces

## 项目结构

```
dev-flow-agentein/
├── client/              # 前端 SPA
│   ├── src/views/       # 页面级视图（看板、工作区、项目等）
│   ├── src/components/  # 共享组件（NavSidebar、ErrorBoundary 等）
│   ├── src/api/         # API 客户端 + React Query hooks
│   └── src/hooks/       # 自定义 hooks
├── server-py/           # FastAPI 后端
│   ├── src/devflow/modules/   # 业务模块（auth、requirement、document、agent 等）
│   ├── src/devflow/core/      # 核心基础设施（DB、RBAC、存储、事件）
│   ├── alembic/               # 数据库迁移
│   └── pyproject.toml         # Python 依赖
├── shared/              # 共享类型定义
│   └── src/index.ts     # Stage、Requirement、SubTask 等类型
├── harness/             # Agent 执行规范与契约
│   ├── 01-architecture.md
│   ├── 04-agent-protocol.md
│   ├── 05-stage-gates.md
│   └── 07-execution-playbook.md
├── specs/               # 里程碑规格（M0 ~ M5）
├── doc/                 # 产品文档与开发指南
│   ├── PRD-SPEC-v2.md
│   ├── DEVELOPMENT.md
│   ├── API-QUICKSTART.md
│   └── DEPLOYMENT.md
└── package.json         # workspace 根配置
```

## 文档索引

| 你想了解 | 读这里 |
|---------|--------|
| 产品规格与蓝图 | `doc/PRD-SPEC-v2.md` |
| 本地开发调试 | `doc/DEVELOPMENT.md` |
| API 使用示例 | `doc/API-QUICKSTART.md` |
| 部署与运维 | `doc/DEPLOYMENT.md` |
| 里程碑完成度 | `doc/MILESTONE-STATUS.md` |
| Agent 执行规范 | `harness/07-execution-playbook.md` |
| 阶段推进规则 | `harness/05-stage-gates.md` |
| API 协议详情 | `harness/04-agent-protocol.md` |

## 设计原则

1. **Agent-First** — 所有功能支持 AI 代理自主操作
2. **Spec-Driven** — 工作从结构化规格开始
3. **Local-First** — 默认本地运行，数据不出网
4. **Observable** — 所有行为可审计、可回放
5. **Isolated** — Worktree + 进程隔离，并行互不干扰

## 许可证

MIT
