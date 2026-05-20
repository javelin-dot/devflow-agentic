# DevFlow 开发指南

> 面向开发者的本地环境搭建、调试与贡献指南。

---

## 环境要求

- **fnm**（推荐）或 **nvm** — 按操作系统自动切换 Node 主版本（见 `scripts/node-versions.json`）
- **npm** >= 10
- **Git**
- **Claude CLI**（可选，用于 Agent 执行）— `npm install -g @anthropic-ai/claude-code`

### 各系统 Node 版本（由脚本自动选择）

| 系统 | Node 主版本 | 原因 |
|------|-------------|------|
| **Windows** | **20** | `better-sqlite3` 有预编译包，免装 VS 编译链 |
| **macOS / Linux** | **22** | 与 `puppeteer@25` 引擎要求一致，原生模块预编译齐全 |

修改版本：编辑 `scripts/node-versions.json`，然后 `npm run setup:node`。

---

## 快速启动

```bash
# 1. 进入项目目录
cd devflow-agentic

# 2. 安装 fnm 对应 Node 并确认版本（首次 / 换机后）
npm run setup:node

# 3. 安装依赖（自动选 Node + 跳过 Puppeteer 浏览器下载）
npm run install:dev

# 4. 启动开发模式（前后端同时启动）
npm run dev
```

> 请使用 **`npm run install:dev`** 和 **`npm run dev`**，不要直接裸跑 `npm install` / 手写 `fnm use`，以免 Windows 与 macOS Node 版本不一致导致原生模块报错。

- 前端：`http://localhost:5173`
- 后端：`http://localhost:4000`
- 前端通过 Vite proxy 将 `/api/*` 转发到后端

---

## 单独启动

```bash
# 仅启动后端
cd server && npm run dev

# 仅启动前端
cd client && npm run dev
```

---

## 数据库

### 位置

`server/data/devflow.db`（SQLite，WAL 模式）

### 调试

```bash
# 直接连接 SQLite
sqlite3 server/data/devflow.db

# 查看表结构
.schema

# 查看需求列表
SELECT id, title, stage, priority FROM requirements ORDER BY created_at DESC;

# 查看事件
SELECT type, actor, created_at FROM events ORDER BY created_at DESC LIMIT 20;
```

### 重置数据库

```bash
rm server/data/devflow.db
# 重启后端，bootstrap() 会自动重新建表
```

---

## 前后端联调

### 检查后端是否存活

```bash
curl -s http://localhost:4000/api/requirements | jq '.[:3]'
```

### 手动创建需求

```bash
curl -s http://localhost:4000/api/requirements \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"title":"测试需求","priority":"medium","kind":"no_code","projects":[]}'
```

### 检查 Agent 可用性

```bash
curl -s http://localhost:4000/api/agent/availability | jq .
```

---

## 代码组织约定

### 后端

- 每模块一个路由文件：`server/src/routes/<module>.ts`
- 业务逻辑放在 `server/src/services/`
- Agent 适配器放在 `server/src/agents/`
- DB 访问直接通过 `db.prepare()`，不使用 ORM 抽象层

### 前端

- 视图组件：`client/src/views/`（每页面一个文件）
- 共享组件：`client/src/components/`
- API hooks：`client/src/api/hooks.ts`
- 状态管理：服务器数据用 TanStack Query，全局 UI 状态用 Zustand

---

## 常见问题

### better-sqlite3 编译失败

**Windows：** 使用项目脚本（自动 Node 20）：

```powershell
npm run setup:node
npm run install:dev
```

若仍失败：`npm run rebuild:native`（需 VS 2022 Build Tools +「使用 C++ 的桌面开发」）。

**macOS / Linux：**

```bash
npm run setup:node
npm run install:dev
# 若仍失败
xcode-select --install   # macOS
npm run rebuild:native
```

### Windows：fnm / npm 找不到

新开终端后先执行一次（或写入 PowerShell `$PROFILE`）：

```powershell
fnm env --use-on-cd | Out-String | Invoke-Expression
```

然后使用 `npm run dev`（脚本内会再次激活 fnm）。

### Puppeteer 安装 / 解压失败

项目根目录 `.npmrc` 已设置 `puppeteer_skip_download=true`。PDF 导出需本机安装 Google Chrome。

### 前端代理不生效

检查 `client/vite.config.ts` 中的 proxy 配置：

```ts
proxy: {
  '/api': { target: 'http://localhost:4000', changeOrigin: true },
}
```

确保后端端口确实是 4000（或修改 `PORT` 环境变量）。

### Agent 执行无输出

1. 检查 `claude` 是否在 PATH 中：`which claude`
2. 检查 Claude Code 是否已登录：`claude auth login`
3. 查看后端日志中的 stderr 输出

---

## 测试

```bash
# 类型检查（后端）
cd server && npx tsc --noEmit

# 类型检查（前端）
cd client && npx tsc --noEmit
```

> 当前项目尚未配置测试框架。计划在 M2.5 引入 vitest。

---

## 贡献流程

1. 遵循 `harness/PRINCIPLES.md` 中的设计原则
2. 任何 API 变更同步更新 `harness/04-agent-protocol.md`
3. 任何阶段规则变更同步更新 `harness/05-stage-gates.md`
4. 新功能先写 spec（`specs/` 目录），再写代码
