# AGENTS.md

> 这是仓库根入口。Claude Code / Codex / OpenCode / Gemini 等 CLI 默认会读本文件。
> **不要**把整本 PRD 抄进来。本文件是地图，不是百科全书。
> **目标 < 100 行**。新增内容前先想：能不能放到 harness/ 子文档里？

## 一句话定位

DevFlow 是一个 **agent-first 的需求生命周期管理系统**：从 backlog 到 released，全部由 Agent 通过 `/api/*` 自治推进。

## 快速路径

| 场景 | 第一步 | 第二步 | 第三步 |
|---|---|---|---|
| **继续开发**（当前需求没跑完） | 读 `harness/M*-progress.md` 看已完成 task | 读对应 `specs/*.yaml` 找下一个 wave | 按 `harness/07-execution-playbook.md` 继续 |
| **下一阶段**（里程碑已完成） | 读 `doc/PRD-next-stage.md` 找下一阶段 Spec | 读对应 `specs/*.yaml` 理解 DAG + AC | 新建 `harness/M*-progress.md`，按 playbook 执行 |

## 你（Agent）应该读的入口

| 你想做的事 | 去读 |
|---|---|
| 接管一个需求，从头到尾跑完 | [`harness/07-execution-playbook.md`](harness/07-execution-playbook.md) |
| 写 / 校验 RequirementSpec | [`harness/02-requirement-spec.md`](harness/02-requirement-spec.md) + `node harness/tools/validate-spec.mjs` |
| 调 API 报错 | [`harness/04-agent-protocol.md`](harness/04-agent-protocol.md) |
| 推进阶段（stage） | [`harness/05-stage-gates.md`](harness/05-stage-gates.md) **（唯一权威）** |
| 跑测试 / 上报结果 | [`harness/06-test-contract.md`](harness/06-test-contract.md) |
| 设计原则 / 人机边界 | [`harness/PRINCIPLES.md`](harness/PRINCIPLES.md) |
| 产品蓝图（背景知识） | [`doc/PRD-SPEC-v2.md`](doc/PRD-SPEC-v2.md) **（只读）** |

## 文件边界

| 目录 | 权限 | 说明 |
|---|---|---|
| `doc/` | **只读** | 产品设计文档，人写你读 |
| `harness/PRINCIPLES.md` + `0[1-7]-*.md` | **只读** | 协议"宪法"，不可修改 |
| `harness/M*-progress.md` | **读写** | 执行进度，完成 task 后更新状态 |
| `specs/*.yaml` | **读写** | 执行 Spec，执行中增量更新 tasks |
| `server/src/*` `client/src/*` | **读写** | 代码实现 |

## 三条 must-never（违反 = 任务直接失败）

1. **不要在不更新 PRD/harness 的前提下"先把代码写了再说"**
   - 设计变更必须先反映到 `/doc` 与 `harness/`，然后才允许产生代码 diff
2. **不要在 `development` 之后改 `description / kind / projects`**
   - 这是 INV-05；后端会返回 400，硬重试只会浪费 token
3. **`verify_commands` 没全跑通，不允许 PATCH 推进 stage**
   - 这是 humans steer, agents execute 的底线：通过 = 机械事实，不是 agent 的承诺

## 三条 must-do

1. 任何有副作用的动作 → `POST /api/events`，`actor=agent`
2. 任何 spec 修改 → 先跑 `node harness/tools/validate-spec.mjs <file>`，0 才允许提交
3. 任何阶段推进 → 自检 `harness/05-stage-gates.md` 中**全部**门禁，写 `gate_check` 事件后再 PATCH

## 运行时探测（不要硬编码）

```
BASE_URL          → 由实例配置，默认 http://localhost:4000/api
WORKSPACE_ROOT    → GET /api/settings
可用 Agent CLI    → GET /api/agent/availability
v1.1 特性开关    → GET /api/runtime/state 取 .features
                  （qualityGate / verifyRunner / runs 三个开关）
```

> v1.1 端点（`/quality-gate/check` / `/subtasks/:id/verify` / `/runs/*`）目前为 draft。
> features 未出现之前 **不要调用**；出现后按 [04-agent-protocol.md § 16](harness/04-agent-protocol.md) 走。

## 常用命令

```bash
# 校验 spec
node harness/tools/validate-spec.mjs harness/examples/sample-requirement.yaml

# 拉一个需求详情
curl -s "$BASE_URL/requirements/$REQ_ID" -H 'X-Actor: agent' | jq .

# 写一条审计事件
curl -s "$BASE_URL/events" -X POST -H 'Content-Type: application/json' -H 'X-Actor: agent' \
  -d '{"reqId":"'"$REQ_ID"'","type":"manual_log","payload":{"kind":"agent_note","text":"..."}}'
```

## 出错时的反向指针

| 现象 | 第一站 |
|---|---|
| HTTP 400 / 422 | `harness/04-agent-protocol.md` § 14 错误码速查 |
| HTTP 409 agent_locked | `harness/01-architecture.md` § 4 INV-01 |
| stage PATCH 被拒 | `harness/05-stage-gates.md` 对应小节 |
| spec 校验失败 | `harness/02-requirement-spec.md` § 4 + § 7 反例 |
| 测试结果格式不被接受 | `harness/06-test-contract.md` § 4 TestRunResult shape |

## 不在本文件管的事

- 业务术语 / 领域知识 → `doc/`
- 字段语义 / Schema → `harness/03-domain-model.md`
- 架构图 / 进程关系 → `harness/01-architecture.md`
