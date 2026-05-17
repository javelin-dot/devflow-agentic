# DevFlow Harness · 设计原则与一致性规则

> 本文件抽离自 README，避免索引页过厚。
> 任何 harness 文档的修改都必须先满足本文规则。

## 1. 七条设计原则（继承自 PRD-SPEC-v2 § 1.2）

| 原则 | 在 harness 中的体现 |
|------|---------------------|
| **P1 Agent-First** | 全部生命周期操作可通过 HTTP 调用完成，无人参与必经路径 |
| **P2 Spec-Driven** | `spec.md`（原 02-requirement-spec.md）定义唯一的 RequirementSpec 格式 |
| **P3 Local-First** | 协议假定本地网络访问，不依赖外部服务 |
| **P4 Observable** | 每个动作必须 `POST /api/events`（actor=agent），保证可审计 |
| **P5 Isolated** | 默认在 worktree CWD 内执行 shell，不污染主仓库 |
| **P6 Recoverable** | 状态全部持久化到数据库；Agent 重启可从 `GET /api/requirements/:id` 恢复 |
| **P7 Composable** | 各文档之间互相 cross-link，但每篇可独立阅读 |

## 2. 三条 single source of truth 约定

1. `/doc/PRD-SPEC-v2.md` 是产品设计的唯一权威来源
2. `harness/04-agent-protocol.md` 是 API 真实形状的镜像（实现变更时同步更新）
3. `harness/05-stage-gates.md` 是阶段推进规则的唯一权威来源；其它文档只引用，不复述

> harness 文档之间若出现描述漂移，以上述三个权威来源为准。

## 3. 一致性规则

- harness 是 `/doc` 设计意图的可执行映射，**不得自行发明新设计**
- 若 harness 与 PRD 存在差异，以实际部署实例的 API 行为为准，同时**必须回溯更新 PRD**
- 任何修改系统 API 形状的变更**必须同步**更新 `04-agent-protocol.md`
- `gates.md` 若加新门禁，**必须先在后端实现门禁服务**，再写进文档（"先代码后文档"）
- 版本号跟随 `/doc/PRD-SPEC-v2.md` 主版本

## 4. Agent legibility 优先

借鉴 OpenAI Harness Engineering 的核心命题：**运行时拿不到的知识 = 不存在**。

- 任何对 agent 行为有约束力的规则必须写在 harness/ 下，并能被 validate-spec / doc-lint 机械校验
- 仅在 Slack / Google Doc / 个人脑中存在的"约定"对本系统不成立
- 当出现"agent 又犯了同一个错"——优先反应不是改 prompt，而是把这条经验沉淀为 lint / 后端门禁 / spec 字段

## 5. 人在 loop 里的位点（humans steer, agents execute）

下列动作必须保留人工干预通道（具体端点见 `protocol.md`）：

| 位点 | 期望 |
|------|------|
| 高风险 analysis 的 `choose` | 支持 `requireApproval=true`，未批前不派生 SubTask |
| `prerelease → released` 终态推进 | 后端拒绝 actor=agent 直推；必须 actor=user |
| 同一 acceptance 累计失败 ≥3 次 | 自动转 human-decision 队列，agent 停手 |
| merge 冲突 AI 无法解决 | 写 `manual_log(level=warn)` 提示人工接管 |

## 6. 资源治理（注意力守恒）

模型可平行扩展，**人类注意力是稀缺资源**。harness 必须能给 agent 设上限：

- `RequirementBudget`：`maxTokens` / `maxParallelSubtasks` / `maxRunDurationMs`
- 超额自动暂停 + 写 `manual_log(level=warn)`
- 这是门禁可观测性的一部分，不是可选项

> 💡 **v1.1 draft 提示**：`/quality-gate/check`、`/subtasks/:id/verify`、`/runs/*` 三组端点尚未实现。Agent 可通过 `GET /api/runtime/state` 的 `features` 字段探测可用性，见 [04-agent-protocol.md § 16](04-agent-protocol.md)。后端实现后移除本注释。
