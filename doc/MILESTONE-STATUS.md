# DevFlow 里程碑状态追踪

> 本文档对照 `specs/` 目录下的里程碑规格，逐项核实代码实现状态。更新日期：2026-05-17。

---

## 总览

| 里程碑 | 计划交付 | 整体状态 | 核心缺口 |
|--------|---------|---------|---------|
| M0 Foundation | 2026-05-24 | 95% 完成 | 类型检查少量警告 |
| M1 Core Flow | 2026-05-31 | 98% 完成 | BoardView 拖拽阶段转换 |
| M2 Agent Orchestra | 2026-06-30 | 95% 完成 | analysis/start 多 Agent 并行（不同 provider）可进一步优化 |
| M2.5 Testing & Quality | 2026-06-30 | 85% 完成 | CoverageCollector、TestGenerator AI、PIV-TDD Loop |
| M3 Release Automation | 2026-07-15 | 90% 完成 | AI 冲突建议 SSE 流 |
| M4 Ops Intelligence | 2026-07-31 | 85% 完成 | node-pty 终端服务、TerminalPanel 前端集成 |
| M5 Polish & Productize | 2026-08-15 | 75% 完成 | 安装向导各步骤、性能优化 |

---

## M0 Foundation — monorepo 骨架 + 看板 UI + 基础 CRUD

### 已完成

- [x] monorepo workspace 配置（client / server / shared）
- [x] `npm run dev` 同时启动前后端
- [x] Vite proxy `/api` → `localhost:4000`
- [x] Hono + better-sqlite3 + bootstrap 幂等迁移
- [x] `shared/src/index.ts` 导出 Stage / Priority / Requirement / STAGE_TRANSITIONS / canTransition()
- [x] `GET/POST/PATCH/DELETE /api/requirements` 完整 CRUD
- [x] `GET/PUT /api/settings`
- [x] BoardView 看板（6 列：backlog / analyzing / development / uat / prerelease / released）
- [x] NavSidebar 导航 + App.tsx 路由
- [x] apiClient + React Query hooks
- [x] SettingsModal / SettingsView

### 已知缺口

- [ ] `requirements` 路由缺少附件上传/下载实现
- [ ] `requirements` 路由缺少 docs 读写实现
- [ ] BoardView 暂不支持拖拽阶段转换（需通过 PATCH 手动推进）
- [ ] 缺少 E2E 测试

---

## M1 Core Flow — Agent 执行 + 项目管理 + 看板交互

### 已完成

- [x] `projects` 表 + `GET /api/projects` + `POST /api/projects/scan`
- [x] `sessions` 表 + CRUD 路由 + `GET /sessions/by-req/:reqId`
- [x] `messages` 表 + 消息持久化
- [x] `POST /api/agent/run` SSE 流式返回 NormalizedEntry
- [x] `POST /api/agent/permission/:sessionId/:entryId/:decision` 审批端点
- [x] `GET /api/agent/availability` 检测已安装 CLI
- [x] `GET /api/requirements/:id/worktree-status`
- [x] `events` 表 + `POST /api/events`
- [x] ProjectsView 项目列表 + 扫描 + 编辑
- [x] ChatWorkspace 需求详情 + session 列表 + agent 运行
- [x] ActivityView events 时间线
- [x] ClaudeSession 适配器（stream-json 解析）
- [x] SessionManager 进程池 + 订阅分发 + agentLock（INV-01）

### 已知缺口

- [x] ~~Worktree 自动创建~~ → `POST /requirements/:id/worktree-create` 已实现（调用 `gitService.addWorktree`）
- [x] ~~Agent 工具审批闭环~~ → `ClaudeAPISession` 完整实现：tool_use → pause → `decide()` → execute → tool_result → 续跑
- [x] ~~NormalizedEntry 特殊类型渲染~~ → `EntryRow` 支持 `thinking`/`plan`/`todo_update` 结构化展示 + 语法高亮
- [x] ~~ActivityView 按 reqId 过滤~~ → `ActivityView` 接收 `reqId` prop，`useEvents(reqId)` 自动过滤，`App.tsx` 传入 `selectedReq?.id`
- [ ] `ClaudeSession`（CLI 版）仍无法审批，需使用 `claude-api` Agent
- [ ] `OpenAISession` 基础实现存在，但未完整测试流式输出
- [ ] BoardView 暂不支持拖拽阶段转换（需通过 PATCH 手动推进）

---

## M2 Agent Orchestra — 分析编排 + SubTask 调度 + 看板交互

### 已完成

- [x] `analyses` 表 + bootstrap 迁移
- [x] `POST /api/analysis/start` 并行启动多 Agent
- [x] `GET /api/analysis/by-req/:reqId`
- [x] `POST /api/analysis/:id/choose` 选定候选 + 自动派生 subTasks + stage→development
- [x] `POST /api/analysis/:id/cancel` / `retry`
- [x] `sub_tasks` 表 + `GET/POST/PATCH/DELETE /api/subtasks`
- [x] AnalysisComparePanel 前端组件
- [x] SubTaskPanel 前端组件
- [x] `contracts` 表 + 路由骨架

### 已知缺口

- [x] ~~DAG 拓扑排序 + 环检测 util~~ → `server/src/utils/dag.ts` `sortWaves()` + `CycleError` 已实现
- [x] ~~TaskScheduler 按 wave 调度~~ → `TaskScheduler.schedule()` wave 分组已实现
- [x] ~~TaskExecutor Agent 执行闭环~~ → `runAgentForTask()` 已集成到 `runTask()`：创建 session → SSE 订阅 → 等待 exit/error
- [x] ~~`analysis/start` 多 Agent 并行 spawn~~ → `createAgentProcess()` 工厂函数 + `analysis.ts` 中根据 `agent` 参数创建对应适配器（claude-api / claude-code / openai-compatible）
- [x] ~~同 project 串行、跨 project 并行的并发控制~~ → `schedule()` 内按 project 分组 + `Promise.all(projectPromises)`
- [x] ~~`verifyCommands` 自动验证~~ → `runTask()` Step 2 执行 `verifyCommands`，失败标记 error
- [x] ~~TaskScheduler 缺少 cron/定时触发~~ → `startPolling()` 30s 轮询 + `analysis/choose` 自动触发 + `POST /subtasks/schedule/:reqId` 手动触发

---

## M2.5 Testing & Quality — 测试与质量保证

### 已完成

- [x] `test_plans` / `test_cases` / `test_runs` / `gate_checks` / `defects` 表已定义
- [x] `testing` 路由骨架已注册
- [x] TestDashboard 前端视图
- [x] DefectListPanel 前端视图

### 已知缺口

- [x] ~~TestRunner 执行引擎~~ → `TestRunnerService.runPlan()` spawn 执行 + SSE 流 + 状态更新
- [x] ~~TestFrameworkAdapter 接口~~ → `TestFrameworkAdapter` + vitest/jest/pytest/go-test 适配器，`detectAdapter()` 自动识别
- [x] ~~QualityGate 质量门禁引擎~~ → `QualityGateService.runGate()` 实现 development→uat→prerelease→released 各阶段检查
- [x] ~~阶段转换拦截器~~ → `requirements PATCH` stage 变更时调用 `checkTransitionSync()`，失败返回 403
- [ ] TestGenerator AI 测试生成器
- [ ] PIV-TDD Loop 集成到 TaskExecutor
- [ ] CoverageCollector 覆盖率收集
- [x] ~~`test-plans` / `test-runs` / `gate-checks` / `defects` 路由~~ → CRUD + SSE 流式执行全部实现
- [ ] QualityGateModal 前端未接入实际门禁数据

---

## M3 Release Automation — 发布自动化

### 已完成

- [x] `release_runs` 表 + bootstrap 迁移
- [x] `jenkins_templates` 表 + bootstrap 迁移
- [x] `release` / `mergePublish` / `jenkins` 路由已注册
- [x] ReleaseView / QuickPublishPanel / ConflictResolutionView 前端组件

### 已知缺口

- [x] ~~ReleaseRunner 状态机实现~~ → `startRun()` 已实现：preparing → merging（fetch/checkout/merge）→ paused-conflict / pushing → triggering → done
- [x] ~~MergePublishRunner 状态机实现~~ → `mergePublish` 模式在 `startRun()` 中支持（dev→uat）
- [x] ~~冲突检测 + 文件列表~~ → `g.merge()` 冲突检测，`conflictFiles` 已写入 `release_runs.projects`
- [x] ~~三列合并编辑器~~ → `ConflictResolutionView` 增强：语法高亮、行号、文件标签、diff 状态栏
- [ ] AI 冲突建议 SSE 流
- [x] ~~Jenkins 真实触发~~ → `ReleaseRunner` `startRun()` / `resume()` 中真正调用 `fetch(triggerUrl, {method: 'POST'})`
- [x] ~~`POST /api/release/start` SSE 事件流~~ → `ReleaseRunner` publish + subscribe 机制完整

---

## M4 Ops Intelligence — 运维智能

### 已完成

- [x] `log_targets` / `log_chat_sessions` 表 + bootstrap 迁移
- [x] `logs` 路由已注册
- [x] LogsView / LogChatPanel / LogsSidebar / RightRail 前端组件

### 已知缺口

- [x] ~~SSH 服务（ssh2 封装）~~ → `SshService` 实现，支持密钥/密码/SSH agent
- [x] ~~直连模式实现~~ → `execDirect()` 直接 SSH 到目标主机
- [x] ~~跳板机模式~~ → `execViaJump()` 通过 jumpHost forwardOut 到目标主机
- [x] ~~`logCommandWhitelist` 安全过滤~~ → `checkCommand()` 白名单 + 禁止模式过滤
- [x] ~~`logs/chat` SSE 路由~~ → `LogDiagnosisService.diagnose()` ClaudeSession → TOOL_CALL → SSH 执行 → 结果返回 循环
- [ ] node-pty 终端服务
- [ ] TerminalPanel 前端集成

---

## M5 Polish & Productize — 打磨产品化

### 已完成

- [x] OnboardingWizard 安装向导
- [x] ErrorBoundary 错误边界
- [x] useKeyboardShortcuts 全局快捷键
- [x] ShortcutsHelpPanel 快捷键帮助
- [x] DashboardView 统计仪表板（骨架）
- [x] ArchiveView 归档视图
- [x] `/api/runtime/state` 端点

### 已知缺口

- [ ] 安装向导各步骤（Node 检测、Git 检测、项目扫描、AI 配置、SSH 配置）
- [x] ~~看板统计仪表板接入真实数据~~ → `/api/stats` 真实 DB 查询 + `/api/health` 系统状态，`DashboardView` 已接入
- [ ] API 文档自动生成
- [x] ~~发布文档自动生成~~ → `POST /api/docs/release/:reqId` 自动生成 Markdown 发布文档
- [x] ~~数据备份/恢复工具~~ → `GET /api/backup` 流式下载 SQLite，`POST /api/restore` 上传替换并验证 magic bytes
- [x] ~~`/api/health` 健康检查端点~~ → `/api/health` 返回 uptime、dbSize、tableRowCounts、version 等
- [ ] 虚拟滚动/懒加载性能优化

---

## 下一步重点（按优先级）

1. **M1 收尾**：BoardView 拖拽阶段转换
2. **M2.5 收尾**：TestGenerator AI 测试生成器 + CoverageCollector + PIV-TDD Loop
3. **M3 收尾**：AI 冲突建议 SSE 流
4. **M4 收尾**：node-pty 终端服务 + TerminalPanel 前端集成
5. **M5 收尾**：安装向导各步骤（Node/Git/项目/AI/SSH 检测）+ 性能优化
