# doc/ 目录说明

> 本目录存放 DevFlow **产品设计文档**，面向人类读者（PM、设计师、全栈工程师）。
> Agent 执行时可只读引用获取上下文，但**不得修改**本目录任何文件。

## 文件清单

| 文件 | 内容 | 主要读者 | 更新时机 |
|---|---|---|---|
| `PRD-SPEC-v2.md` | 产品全愿景 + 长期设计原则（SSOT） | PM / 全员 | 产品方向变更 |
| `PRD-next-stage.md` | 下一阶段功能需求总览（M6–M8） | PM / 工程师 | 阶段规划调整 |
| `M10-ui-polish.md` | UI/UX 系统打磨规范 | 前端 / 设计师 | 视觉规范迭代 |
| `PRD-testing-module.md` | 测试模块详细 PRD | 工程师 | 测试需求变更 |
| `MILESTONE-STATUS.md` | 里程碑完成状态跟踪 | 全员 | 每里程碑结束 |
| `API-QUICKSTART.md` | API 快速接入指南 | 集成开发者 | API 变更 |
| `DEPLOYMENT.md` | 部署文档 | 运维 | 部署流程变更 |
| `DEVELOPMENT.md` | 本地开发指南 | 开发者 | 开发流程变更 |
| `naming-scheme.md` | 项目命名规范 | 全员 | 规范调整 |

## 写作约束

1. **每文件 < 30KB**：超过则拆分专题子文档，用索引表链接
2. **不复述**：已有详细描述的地方只给摘要 + 链接（`harness/`、`specs/`、`client/docs/`）
3. **Cross-link**：引用相邻目录时使用相对路径，禁止复制粘贴内容

## 与相邻目录的边界

| 目录 | 定位 | 边界规则 |
|---|---|---|
| `harness/` | Agent 执行协议 | harness 是 doc/ 设计意图的**可执行映射**，不得自行发明新设计。若出现冲突，以实际部署的 API 行为为准，同时**回溯更新 doc/** |
| `specs/` | 可执行里程碑 Spec | specs/ 的 YAML 是 doc/ PRD 的**结构化、可校验子集**。业务背景在 YAML 的 `notes` 中，详细需求在 `tasks[]` / `acceptance[]` 中 |
| `harness/M*-progress.md` | 执行进度 | 由 Agent 执行过程中更新，记录实际完成状态 vs Spec 的偏差 |

## 人与 Agent 的读写边界

```
人（Human）                Agent
  │                         │
  ├─ 写 doc/* ──────────────┤─ 只读 doc/*（获取上下文，不修改）
  │                         │
  ├─ 写 harness/PRINCIPLES.md ──┤─ 只读（"宪法"级，不可改）
  ├─ 写 harness/0[1-7]-*.md ────┤─ 只读（协议规范，不可改）
  │                         │
  ├─ 写 specs/*.yaml（初稿）──┤─ 读写 specs/*.yaml（执行中增量更新）
  ├─ 写 harness/M*-progress.md 的验收标准部分
  │                         ├─ 写 harness/M*-progress.md 的进度/状态部分
  │                         │
  ├─ 代码审查 ──────────────┤─ 写 server/src/*、client/src/*（代码实现）
  │                         │
  └─ 写 AGENTS.md ──────────┘─ 读 AGENTS.md（运行时入口）
```

### 硬性规则

- **Agent 禁止修改**：`doc/*`、`harness/PRINCIPLES.md`、`harness/0[1-7]-*.md`
- **人禁止直接修改**：`harness/M*-progress.md` 的状态列（由 Agent 执行后自动更新）
- **冲突解决**：若 harness/ 与 doc/ 描述不一致，以**实际部署的 API 行为**为准，同时人回溯更新 doc/ 和 harness/ 的协议文档
