# M9 打磨收尾 — 执行进度

> 目标：关闭 M1-M5 已知缺口，补齐 AI 冲突建议、CoverageCollector、PIV-TDD、node-pty 终端、安装向导环境检测与前端性能优化。
> 开始日期：2026-05-17
> 完成日期：2026-05-17

---

## AC 检查清单

| AC | 内容 | 状态 | 验证方式 |
|---|---|---|---|
| AC-1 | BoardView 拖拽阶段转换（已前置完成） | ✅ | 代码实现 |
| AC-2 | AI 冲突建议 SSE 流 + 冲突块解析 | ✅ | 构建 + 类型检查 |
| AC-3 | QualityGateModal 与 BoardView 集成 | ✅ | 代码实现 |
| AC-4 | CoverageCollector（Istanbul/lcov 解析 + 数据库存储 + API） | ✅ | 构建 + 类型检查 |
| AC-5 | PIV-TDD Loop 端点（Plan→Generate→Run→Verify SSE） | ✅ | 构建 + 类型检查 |
| AC-6 | node-pty 终端服务 + WebSocket 路由 | ✅ | 构建 + 类型检查 |
| AC-7 | TerminalPanel 前端（xterm.js + 导航集成） | ✅ | 构建 + 类型检查 |
| AC-8 | OnboardingWizard 环境检测（Node/Git/SSH） | ✅ | 构建 + 类型检查 |
| AC-9 | BoardView 性能优化（memo + useMemo） | ✅ | 构建 + 类型检查 |

---

## Wave 执行计划

### Wave 0 — BoardView 拖拽 ✅
- [x] **T1**: BoardView 拖拽阶段转换 + canTransition 校验

### Wave 1 — AI 冲突建议 + QualityGateModal ✅
- [x] **T2**: `releaseRunner.ts` 冲突块解析（parseConflictBlocks / resolveConflictFiles）
- [x] **T3**: `getConflicts` 从数据库反序列化返回真实冲突文件
- [x] **T4**: `POST /release/:id/conflict-suggest` SSE 端点（ClaudeAPISession）
- [x] **T5**: `ConflictResolutionView` AI 建议按钮 + SSE 消费
- [x] **T6**: `QualityGateModal` 与 BoardView 拖拽集成（已在 M8 完成）

### Wave 2 — AI 测试生成 + CoverageCollector + PIV-TDD ✅
- [x] **T7**: `test_runs` 表增加 `coverage_json` 字段
- [x] **T8**: `testRunner.ts` 覆盖率解析（Istanbul JSON + lcov）
- [x] **T9**: `GET /test-runs/:id/coverage` 端点
- [x] **T10**: `TestDashboard` 覆盖率展示（CoverageBadge + 表格列）
- [x] **T11**: `POST /tdd-loop/run` SSE 端点（Plan→Implement→Verify）
- [x] **T12**: `TestDashboard` PIV-TDD Loop 按钮 + 实时日志

### Wave 3 — node-pty 终端 + TerminalPanel ✅
- [x] **T13**: 安装 `node-pty`、`ws`、`@xterm/xterm`、`@xterm/addon-fit`
- [x] **T14**: `server/src/services/terminal.ts` TerminalService（node-pty 管理）
- [x] **T15**: `server/src/routes/terminal.ts` WebSocket 处理
- [x] **T16**: `server/src/index.ts` WebSocketServer 集成
- [x] **T17**: `client/src/views/TerminalPanel.tsx` xterm.js 组件
- [x] **T18**: `App.tsx` + `NavSidebar.tsx` 终端导航集成

### Wave 4 — 安装向导步骤 + 性能优化 ✅
- [x] **T19**: `GET /system/env-checks` 端点（Node/Git/SSH 检测）
- [x] **T20**: `OnboardingWizard.tsx` Step 1 环境依赖展示
- [x] **T21**: `BoardView.tsx` `RequirementCard` memo + `byStage` useMemo 优化

---

## 构建状态

```
npm run build  ✅ 2026-05-17
server tsc     ✅
client tsc     ✅
shared tsc     ✅
vite build     ✅
```
