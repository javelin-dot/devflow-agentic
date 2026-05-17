# DevFlow API 快速入门

> 通过 curl 示例快速掌握核心 API。完整协议见 `harness/04-agent-protocol.md`。

---

## 基础信息

- **Base URL**: `http://localhost:4000/api`
- **鉴权**: 无（本地工具，禁止公网暴露）
- **Actor 标识**: Agent 调用建议带 `X-Actor: agent`，用于事件审计

---

## 典型工作流

### 1. 创建需求

```bash
curl -s http://localhost:4000/api/requirements \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "实现用户登录接口",
    "description": "支持邮箱+密码登录，返回 JWT token",
    "priority": "high",
    "kind": "standard",
    "projects": [{"project": "backend-api", "devBranch": null, "uatBranch": null}]
  }' | jq .
```

响应：

```json
{
  "id": "req_A1b2C3d4",
  "title": "实现用户登录接口",
  "stage": "backlog",
  "priority": "high",
  "kind": "standard",
  "projects": [...],
  "createdAt": "2026-05-17T10:00:00.000Z"
}
```

---

### 2. 启动分析（多 Agent 并行）

```bash
REQ_ID="req_A1b2C3d4"

curl -s http://localhost:4000/api/analysis/start \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Actor: agent' \
  -d "{
    \"reqId\": \"$REQ_ID\",
    \"agents\": [\"claude-code\", \"claude-code\"]
  }" | jq .
```

响应：

```json
{
  "analyses": [
    { "id": "anl_xxxx", "agent": "claude-code", "status": "running" },
    { "id": "anl_yyyy", "agent": "claude-code", "status": "running" }
  ]
}
```

---

### 3. 查看分析结果

```bash
curl -s "http://localhost:4000/api/analysis/by-req/$REQ_ID" | jq '.[].{id,status,output}'
```

---

### 4. 选择分析候选（自动推进到 development）

```bash
ANALYSIS_ID="anl_xxxx"

curl -s "http://localhost:4000/api/analysis/$ANALYSIS_ID/choose" \
  -X POST \
  -H 'X-Actor: agent' | jq .
```

副作用：
- 自动创建 SubTask 列表
- `requirements.stage` 变为 `development`
- 写入 `stage_change` 事件

---

### 5. 查看 SubTask

```bash
curl -s "http://localhost:4000/api/subtasks/by-req/$REQ_ID" | jq '.[] | {id,title,wave,status}'
```

---

### 6. 创建会话并运行 Agent

```bash
# 6.1 创建会话
SESSION=$(curl -s http://localhost:4000/api/sessions \
  -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"reqId\": \"$REQ_ID\", \"title\": \"实现登录接口\", \"agent\": \"claude-code\"}" | jq -r '.id')

echo "Session: $SESSION"

# 6.2 SSE 执行 Agent
curl -s http://localhost:4000/api/agent/run \
  -X POST \
  -H 'Content-Type: application/json' \
  -N \
  -d "{
    \"sessionId\": \"$SESSION\",
    \"agent\": \"claude-code\",
    \"prompt\": \"实现一个用户登录接口，使用 Hono + JWT，包含单元测试\"
  }"
```

SSE 输出示例：

```
data: {"type":"entry","entry":{"id":"msg_xxx","type":"assistant_message","content":"我将为您实现..."}}

data: {"type":"entry","entry":{"id":"msg_yyy","type":"tool_use","action":{"type":"file_edit","path":"src/routes/auth.ts"},"status":"pending"}}

data: {"type":"exit","code":0}
```

---

### 7. 审批工具执行

当 SSE 中出现 `tool_use` 且 `status=pending` 时：

```bash
curl -s "http://localhost:4000/api/agent/permission/$SESSION/msg_yyy/approve" \
  -X POST \
  -H 'X-Actor: agent'
```

---

### 8. 推进阶段

```bash
# development → uat
curl -s "http://localhost:4000/api/requirements/$REQ_ID" \
  -X PATCH \
  -H 'Content-Type: application/json' \
  -H 'X-Actor: agent' \
  -d '{"stage": "uat"}'

# uat → prerelease（必须带 plannedReleaseDate）
curl -s "http://localhost:4000/api/requirements/$REQ_ID" \
  -X PATCH \
  -H 'Content-Type: application/json' \
  -H 'X-Actor: agent' \
  -d '{"stage": "prerelease", "plannedReleaseDate": "2026-05-20"}'
```

> `prerelease → released` 必须由人工（`X-Actor: user`）触发，Agent 会被拒绝。

---

### 9. 写入审计事件

```bash
curl -s http://localhost:4000/api/events \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Actor: agent' \
  -d "{
    \"reqId\": \"$REQ_ID\",
    \"type\": \"manual_log\",
    \"payload\": {
      \"kind\": \"gate_check\",
      \"from\": \"development\",
      \"to\": \"uat\",
      \"result\": \"passed\"
    }
  }"
```

---

## 常用查询

### 需求列表

```bash
curl -s 'http://localhost:4000/api/requirements?limit=50' | jq '.[] | {id,title,stage,priority}'
```

### 项目列表

```bash
curl -s http://localhost:4000/api/projects | jq '.[] | {name,path,lang}'
```

### 扫描 Git 目录

```bash
curl -s http://localhost:4000/api/projects/scan \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"root": "/Users/jiangjianmin/ai/code"}'
```

### 系统状态

```bash
curl -s http://localhost:4000/api/runtime/state | jq .
```

### 事件流

```bash
curl -s 'http://localhost:4000/api/events?limit=20' | jq '.[] | {type,actor,createdAt}'
```

---

## 错误码速查

| 状态码 | 场景 | 处理 |
|--------|------|------|
| 400 | 阶段转换不合法 / 字段校验失败 | 读 `error` 字段理解原因 |
| 404 | 资源不存在 | 检查 ID 是否正确 |
| 409 | Agent 锁定（INV-01）| 新建会话，不要复用已锁定的会话 |
| 422 | 质量门禁未通过 | 见 `harness/05-stage-gates.md` |
| 500 | 服务器内部错误 | 查看后端日志 |
