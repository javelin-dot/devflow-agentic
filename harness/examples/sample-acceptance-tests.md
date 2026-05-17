# 示例：从 sample-requirement.yaml 派生的测试计划

> 演示 acceptance → verifyCommands → TestRunResult 的完整落地。

## 1. acceptance ↔ test mapping

| AC | type | 派生测试 | 框架 |
|----|------|---------|------|
| AC-1 | behavior | `LoginInterceptorTest#should_block_when_3_failures` | Unit (mock) |
| AC-1 | behavior | `LoginBlockIT#should_return_423_on_4th_request` | Integration |
| AC-2 | data | `LoginBlockRepoTest#should_persist_block_record` | Unit (test DB) |
| AC-3 | behavior | `LoginBlockIT#should_unblock_after_30min` | Integration (Clock 注入) |
| AC-4 | api | `UnblockAdminControllerTest#should_clear_block` | Unit (mock HTTP) |
| AC-5 | perf | 性能测试（prerelease 阶段单跑） | 压测工具 |

## 2. verifyCommands 表达

写到对应 SubTask（与 sample-requirement.yaml 中的 tasks[].verify_commands 一一对应）：

```yaml
# T1
verify_commands:
  - "cd <projectPath> && <run-unit-test LoginBlockRepoTest>"

# T2
verify_commands:
  - "cd <projectPath> && <run-unit-test LoginInterceptorTest>"
  - "cd <projectPath> && <run-integration-test LoginBlockIT>"

# T3
verify_commands:
  - "cd <projectPath> && <run-unit-test UnblockAdminControllerTest>"

# T4 (回归冒烟)
verify_commands:
  - "cd <projectPath>/tests/acceptance && bash run-login-block.sh"
```

`<run-unit-test>` 和 `<run-integration-test>` 由项目技术栈决定：

| 技术栈 | 单测命令模板 | 集成测试命令模板 |
|--------|-------------|----------------|
| Java/Maven | `./mvnw -pl <module> test -Dtest=<Class>` | `./mvnw -pl <module> verify -Pintegration -Dtest=<Class>` |
| Node/npm | `npm test -- --run <pattern>` | `npm run test:integration -- <pattern>` |
| Python | `pytest tests/unit -k <pattern>` | `pytest tests/integration -k <pattern>` |
| Go | `go test ./pkg/... -run <pattern>` | `go test ./integration/... -run <pattern>` |

## 3. 冒烟测试脚本样例

`run-login-block.sh` 内容样例：

```bash
#!/bin/bash
set -euo pipefail
BASE=${BASE:-http://localhost:8080}
IP_HEADER='X-Forwarded-For: 10.99.0.1'

# 1. 3 次错误
for i in 1 2 3; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/login \
    -H "$IP_HEADER" -d '{"username":"u","password":"wrong"}')
  [[ "$code" == "401" ]] || { echo "expected 401 on try $i, got $code"; exit 1; }
done

# 2. 第 4 次应被封
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/login \
  -H "$IP_HEADER" -d '{"username":"u","password":"correct"}')
[[ "$code" == "423" ]] || { echo "expected 423, got $code"; exit 1; }

# 3. 管理员解禁
curl -s -X POST $BASE/admin/unblock -d '{"ip":"10.99.0.1"}'

# 4. 解禁后应可登录
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/login \
  -H "$IP_HEADER" -d '{"username":"u","password":"correct"}')
[[ "$code" == "200" ]] || { echo "expected 200, got $code"; exit 1; }
echo OK
```

## 4. Agent 上报的 TestRunResult 样例（成功）

子任务 T2 跑完后，Agent POST：

```http
POST /api/events
Content-Type: application/json
X-Actor: agent

{
  "reqId": "<reqId>",
  "type": "subtask_done",
  "payload": {
    "subtaskId": "<subtaskId>",
    "result": {
      "taskId": "<subtaskId>",
      "scope": "subtask",
      "startedAt": "2026-05-18T09:12:30.000Z",
      "finishedAt": "2026-05-18T09:13:54.231Z",
      "durationMs": 84231,
      "total": 12,
      "passed": 12,
      "failed": 0,
      "skipped": 0,
      "suites": [
        { "name": "LoginInterceptorTest",
          "passed": 8, "failed": 0, "skipped": 0, "durationMs": 21000 },
        { "name": "LoginBlockIT",
          "passed": 4, "failed": 0, "skipped": 0, "durationMs": 60500 }
      ],
      "failures": [],
      "coverage": {
        "lines":     { "total": 234, "covered": 187, "pct": 79.9 },
        "branches":  { "total":  86, "covered":  62, "pct": 72.1 },
        "functions": { "total":  19, "covered":  19, "pct": 100.0 }
      },
      "commands": [
        {
          "command": "cd <projectPath> && <run-unit-test LoginInterceptorTest>",
          "exitCode": 0,
          "durationMs": 21500
        },
        {
          "command": "cd <projectPath> && <run-integration-test LoginBlockIT>",
          "exitCode": 0,
          "durationMs": 62731
        }
      ]
    }
  }
}
```

## 5. 失败样例（Agent 应这样上报）

```http
POST /api/events
{
  "reqId": "<reqId>",
  "type": "subtask_error",
  "payload": {
    "subtaskId": "<subtaskId>",
    "errorMessage": "LoginInterceptorTest#should_block_when_3_failures FAILED: expected 423 but was 401",
    "result": {
      "scope": "subtask",
      "startedAt": "...",
      "finishedAt": "...",
      "durationMs": 18000,
      "total": 12,
      "passed": 11,
      "failed": 1,
      "skipped": 0,
      "suites": ["..."],
      "failures": [
        {
          "testName": "should_block_when_3_failures",
          "suiteName": "LoginInterceptorTest",
          "message": "expected status 423 but was 401",
          "expected": "423",
          "actual": "401",
          "stack": "  at LoginInterceptorTest:67\n  at ..."
        }
      ],
      "commands": [
        {
          "command": "cd <projectPath> && <run-unit-test LoginInterceptorTest>",
          "exitCode": 1,
          "stdoutTail": "...[ERROR] should_block_when_3_failures: expected:<423> but was:<401>...",
          "stderrTail": "",
          "durationMs": 18500
        }
      ]
    }
  }
}
```

随后 Agent 应：

1. PATCH SubTask 状态为 `error`，写入 `errorMessage`
2. 新建 1 个"修复" SubTask（playbook § 4.4）
3. 不要 PATCH `stage='uat'`

## 6. 阶段汇总（开发→UAT 推进时）

```http
POST /api/events
{
  "reqId": "<reqId>",
  "type": "manual_log",
  "payload": {
    "kind": "test_run_complete",
    "stage": "development",
    "result": {
      "scope": "stage",
      "total": 48, "passed": 48, "failed": 0, "skipped": 0,
      "durationMs": 412000,
      "suites": ["... 聚合所有子任务的 suites ..."],
      "failures": [],
      "coverage": {
        "lines":     { "total": 1820, "covered": 1432, "pct": 78.7 },
        "branches":  { "total":  640, "covered":  421, "pct": 65.8 },
        "functions": { "total":  192, "covered":  187, "pct": 97.4 }
      }
    }
  }
}
```

## 7. 阶段门禁审计事件

```http
POST /api/events
{
  "reqId": "<reqId>",
  "type": "manual_log",
  "payload": {
    "kind": "gate_check",
    "from": "development",
    "to": "uat",
    "checks": [
      { "name": "all_subtasks_terminal", "passed": true },
      { "name": "all_verify_commands_pass", "passed": true,
        "details": { "passed": 48, "failed": 0 } },
      { "name": "git_clean_and_pushed", "passed": true },
      { "name": "merge_publish_completed", "passed": true,
        "details": { "runId": "<runId>", "duration_ms": 24000 } },
      { "name": "coverage_threshold_60pct",
        "passed": true, "details": { "lines_pct": 78.7 } }
    ],
    "result": "passed"
  }
}
```

## 8. 测试目录布局（推荐，按项目技术栈调整）

```
<projectPath>/
├── src/...
├── tests/
│   ├── unit/              # 单测
│   ├── integration/       # 集成测试
│   └── acceptance/        # AI 从 acceptance 生成的端到端测试
│       └── run-login-block.sh
└── ...

attachments/<reqId>/
├── spec.yaml
├── runs/
│   ├── <iso-timestamp>.json   # 完整 TestRunResult
│   ├── <iso-timestamp>.log    # 完整命令输出
│   └── ...
└── reports/
    └── uat-report.md
```
