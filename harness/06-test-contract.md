# 06 · 测试契约（acceptance ↔ verifyCommands ↔ TestRunResult）

> Agent 在 development → uat → prerelease 三个阶段都要"跑测试 + 报结果"。本文档定义统一的格式与上报协议。
> 参照 PRD-testing-module 的测试策略设计，本文档为 Agent 端的执行规约。

## 1. 设计目标

| 目标 | 措施 |
|------|------|
| 验收标准可机械执行 | 每条 measurable acceptance 必须映射到 ≥1 个 verify_command |
| 结果可机器解析 | 统一 `TestRunResult` JSON shape，附在事件 payload |
| 失败可回放 | 完整 stdout/stderr 写入 events.payload，可追溯 |
| 向前兼容 | 字段命名与 PRD-testing-module 设计完全一致，未来可无缝迁移 |

## 2. 工作流

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  RequirementSpec  │    │  SubTask         │    │  Event           │
│                  │    │                  │    │                  │
│  acceptance[].id │──▶ │  acceptance[]    │──▶ │  type=subtask_done│
│                  │    │  verifyCommands[]│──▶ │  payload.result  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
       人写                    分析阶段派生                Agent 跑完后 POST
```

## 3. verifyCommands 的契约

### 3.1 语法

- 每条命令是一行 shell（POSIX）
- 允许 `cd <path> && <cmd>` 串接（推荐显式 cd 到 project path）
- 允许 pipes：`<cmd> | grep ...`
- 禁止：交互输入（命令不能等 stdin）、长驻进程（>300s）、副作用扩散（`rm -rf`、push 远端、发邮件）
- 退出码 = 0 视为通过；非 0 视为失败

### 3.2 命令样例（按项目技术栈）

| 场景 | 命令样例 |
|------|---------|
| Java / Maven 单测 | `cd <projectPath> && ./mvnw -pl <module> test -Dtest=<Class>` |
| Java 集成测试 | `cd <projectPath> && ./mvnw -pl <module> verify -Pintegration` |
| Node 单测 | `cd <projectPath> && npm test -- --run <pattern>` |
| TypeScript 类型检查 | `cd <projectPath> && npx tsc --noEmit` |
| Python 测试 | `cd <projectPath> && pytest tests/<module> -k <pattern>` |
| Go 测试 | `cd <projectPath> && go test ./... -run <pattern>` |
| HTTP 烟测 | `curl -sf -X POST http://localhost:<port>/api/foo -d '...' \| jq -e '.ok==true'` |
| DB 验证 | `<sql-cli> -e "SELECT COUNT(*) FROM <table> WHERE <condition>"` |

### 3.3 多命令组合

```yaml
verify_commands:
  - "cd <projectPath> && <unit-test-command>"
  - "cd <projectPath> && <integration-test-command>"
  - "curl -sf <smoke-test-url>"
```

执行顺序 = 数组顺序；任一失败立即停（除非 Agent 显式继续）。

## 4. TestRunResult JSON shape

统一的测试结果格式，落到 `events.payload.result`：

```ts
type TestRunResult = {
  taskId?: string;              // SubTask.id（subtask 级）
  scope: 'subtask' | 'stage';   // subtask=单子任务；stage=阶段汇总
  startedAt: string;            // ISO
  finishedAt: string;           // ISO
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  suites: Array<{
    name: string;
    file?: string;
    passed: number;
    failed: number;
    skipped: number;
    durationMs?: number;
  }>;
  failures: Array<{
    testName: string;
    suiteName: string;
    message: string;
    expected?: string;
    actual?: string;
    stack?: string;
    file?: string;
    line?: number;
  }>;
  coverage?: {
    lines:     { total: number; covered: number; pct: number };
    branches:  { total: number; covered: number; pct: number };
    functions: { total: number; covered: number; pct: number };
    uncoveredFiles?: string[];
  };
  commands: Array<{
    command: string;
    exitCode: number;
    stdoutTail?: string;        // 截断到 ≤4KB
    stderrTail?: string;
    durationMs: number;
  }>;
};
```

> `stdoutTail/stderrTail` 保留失败相关的尾部 4KB。完整输出建议落到附件 `attachments/<reqId>/runs/<isoTimestamp>.log`。

## 5. 上报协议

### 5.1 子任务级

```
1. 跑完 SubTask 的所有 verifyCommands
2. 计算 TestRunResult (scope='subtask', taskId=<subtaskId>)
3. PATCH /api/subtasks/:id
   { status: 'done' | 'error', completedAt: <iso>, errorMessage?: <string> }
4. POST /api/events
   {
     reqId,
     type: 'subtask_done' | 'subtask_error',
     payload: { subtaskId, result: TestRunResult }
   }
```

### 5.2 阶段汇总（development → uat 时）

```
1. 收集所有 done 子任务的 result
2. 合并为 stage 级 TestRunResult (scope='stage')
3. POST /api/events
   {
     reqId,
     type: 'manual_log',
     payload: { kind: 'test_run_complete', stage: 'development', result: TestRunResult }
   }
4. 在门禁审计事件中引用本 result（见 05-stage-gates.md § 10）
```

### 5.3 发布质量报告

在 prerelease 阶段 Agent 应生成发布质量报告写到 `releaseDoc`：

```yaml
releaseDoc:
  generated_at: <iso>
  test_summary:
    development: <TestRunResult>
    uat:         <TestRunResult>
    prerelease:  <TestRunResult>
  defects_open: []
  risks: []
```

## 6. 失败处理

| 场景 | Agent 行为 |
|------|----------|
| 命令超时 | 单条命令 >300s 视为失败；记录 `exitCode=124` |
| 命令找不到 | `exitCode=127`；先尝试安装/配置 |
| 测试结果文件缺失 | 从 stdout 解析；若仍无法解析，整条命令视为失败 |
| 偶发 flaky | 同条命令重试 ≤2 次；记录重试次数 |
| verifyCommands 为空 | 该子任务不可自动判 done；必须人工 PATCH 或补 verify |

## 7. 测试用例派生（acceptance → tests）

Agent 自主完成 acceptance 到测试代码的转换。建议 Prompt 结构：

```
任务: 把下列 acceptance 转换为可执行测试

[acceptance]
- AC-<id>: <text>
  type: <behavior|api|data|ui|perf|security>

[被测代码]
- 主要文件: <从 git diff 推断>
- 入口函数: <…>

[测试框架]
- <检测 pom.xml / package.json / go.mod 等确定>

[输出要求]
1. 每条 AC 至少 1 个测试用例
2. 命名: should_<behavior>_when_<condition> 或框架惯例
3. Mock 外部依赖
4. 包含正常、错误、边界三类
5. 输出可直接保存的完整测试文件代码
```

测试代码写完后：
- 加到对应 SubTask 的 `verifyCommands`（PATCH，仅 status=pending 前）
- 若已 running/done：另开 1 个修复 SubTask 补测试

## 8. 与契约的关系

| 契约类型 | 测试映射 |
|---------|---------|
| ApiContract | HTTP 请求 + 响应 schema 校验 |
| MqContract | 消息发布/订阅 + payload 断言 |
| DataModel | DDL 比对 或 SQL 查询验证 |

## 9. 推荐目录约定

```
<projectPath>/
├── src/...
├── tests/
│   ├── unit/         # 单测
│   ├── integration/  # 集成
│   └── acceptance/   # 由 AI 从 acceptance 生成
└── ...
attachments/<reqId>/
├── runs/<iso>.log    # 完整命令输出
├── reports/<iso>.json # TestRunResult
└── spec.yaml
```

## 10. 速查表

| 你想要 | 调用 |
|--------|------|
| 把测试结果写回事件 | `POST /api/events` type=subtask_done, payload.result=TestRunResult |
| 改 SubTask 状态 | `PATCH /api/subtasks/:id` body={status:'done'} |
| 把命令输出存到附件 | `POST /api/requirements/:id/attachments` multipart |
| 让 Agent CLI 帮你写测试 | `POST /api/agent/run` 用 § 7 prompt |
| 读出某需求最近的测试结果 | `GET /api/events/by-req/:reqId?type=subtask_done,manual_log&limit=200` |

---

## 11. 裁判语义（v1.1 draft：什么叫 "通过"）

当前（v1.0）：**agent 跑 verifyCommands → agent 自报 PATCH status='done'**。这是 Symphony 明确反对的反模式——运动员兼任裁判。

迁移后（v1.1）：**独立 verify-runner 跑 verifyCommands → 后端签名落库 VerifyResult → 后端根据 VerifyResult 接纳 done**。agent 只是请求者，不是定论者。

```
v1.0（现状）        agent → [跑 commands] → agent → PATCH done
v1.1（草案）         agent → POST /subtasks/:id/verify
                              ↓
                       runner sandbox
                              ↓  签名
                       VerifyResult 落库
                              ↓  后端校验
                  PATCH done 仅在有 failed=0 VerifyResult 时被接受
```

对应领域模型：[03-domain-model.md § 14 VerifyResult](03-domain-model.md)。
对应端点：[04-agent-protocol.md § 16.2](04-agent-protocol.md)。

### 11.1 过渡期兑现规则

- 在 `runtime/state.features.verifyRunner=true` 之前，agent 仍按 v1.0 跑 + 上报 TestRunResult
- 一旦开启，**一个 SubTask 只能选一轨**：调用 `/verify` 后 agent 不得再 POST `subtask_done`，反之亦然
- TestRunResult 仍可作为事件 payload 供外部读取，但不再是状态推进的唯一依据

---

## 12. Proof Bundle（v1.1 draft）

借鉴 Symphony 的 **proof of work**：每次阶段推进应产出一份不可伪造、可重放的证据包。

### 12.1 最小 Bundle内容

```
attachments/<reqId>/runs/<runId>/
├── spec.yaml             # 发起推进时的 spec 快照（hash 在 Run.specSnapshotHash）
├── verify/
│   ├── <verifyResultId>.json   # VerifyResult 全量数据
│   └── <verifyResultId>.log    # 未截断 stdout/stderr
├── quality-gate.json     # QualityGateCheck 全量数据
├── commits.json          # [{project, sha, subject, author, date}]
├── ci.json               # ciStatus + Jenkins/GitHub Actions URL
├── complexity.json       # filesChanged / linesAdded / linesDeleted
├── artifacts/            # 可选：截屏 / 录屏 / UAT 报告
└── manifest.json         # Run 实体本身 + 上述文件 SHA-256 表
```

`manifest.json` 中所有文件哈希被 `Run.specSnapshotHash + signature` 带下游另一层保护。

### 12.2 指向 Bundle 的合法仅入点

```
GET /api/runs/:id                  # 资源详情
GET /api/runs/:id/proof-bundle.zip # 一键下载
POST /api/runs/:id/finalize        # accepted | rejected
```

### 12.3 stage 联动

| 阶段迁移 | 是否要求 Run | 详细 |
|---------|---------------|------|
| backlog ↔ analyzing | 否 | 轻量迁移 |
| analyzing → development | 否 | 由 `analysis/:id/choose` 隐式推进 |
| development → uat | ⚠️ 可选 | 建议走 Run；v1.2 升为必选 |
| uat → prerelease | ✅ | 必须能定位到 verdict='accepted' Run |
| prerelease → released | ✅✅ | 上同 + ciStatus.conclusion='success' + actor=user |

### 12.4 与 TestRunResult 的关系

- TestRunResult 是**测试结果的数据形状**（什么跳了、什么调了、覆盖多少）
- VerifyResult 是**裁判意义上的证据**（这份结果是被独立 runner 跑出来的）
- Run / Proof Bundle 是**打包起来的场景上下文**（这份证据是哪次推进产生的，spec 是什么，commits 是什么）

三者各司其职，不互相取代。
