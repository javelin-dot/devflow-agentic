# DevFlow 部署指南

> 生产环境部署、数据备份与运维策略。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 4000 | HTTP 服务端口 |
| `LK_DB_PATH` | `server/data/devflow.db` | SQLite 数据库路径 |
| `LK_WORKSPACE_ROOT` | `process.cwd()` | 默认工作区根目录 |
| `LK_AGENT_IDLE_MS` | 1800000 (30min) | Agent 会话空闲超时 |
| `LK_AGENT_DEBUG` | 0 | 调试模式（1=透传 Agent stderr） |
| `ANTHROPIC_API_KEY` | - | Anthropic API 密钥 |
| `ANTHROPIC_BASE_URL` | - | API 代理地址（可选） |

---

## 生产构建

```bash
# 1. 安装依赖
npm ci

# 2. 构建共享包
npm run build --workspace=shared

# 3. 构建后端
npm run build --workspace=server

# 4. 构建前端
npm run build --workspace=client

# 5. 启动生产服务器
PORT=4000 node server/dist/index.js
```

前端静态文件（`client/dist/`）需要通过 Nginx 或 Hono 的静态文件中间件提供。

---

## Docker 部署（可选）

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY client/package*.json client/
COPY server/package*.json server/
COPY shared/package*.json shared/
RUN npm ci
COPY . .
RUN npm run build --workspace=shared \
  && npm run build --workspace=server \
  && npm run build --workspace=client
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
```

```bash
docker build -t devflow .
docker run -p 4000:4000 -v devflow-data:/app/server/data devflow
```

---

## 数据备份与恢复

### 手动备份

```bash
# 备份（单文件，随时可做）
cp server/data/devflow.db backup/devflow-$(date +%Y%m%d).db

# 恢复
cp backup/devflow-20260517.db server/data/devflow.db
```

### 自动备份（crontab）

```bash
# 每天凌晨 2 点备份
0 2 * * * cp /path/to/devflow/server/data/devflow.db /path/to/backup/devflow-$(date +\%Y\%m\%d).db

# 保留最近 7 天
cd /path/to/backup && ls -t devflow-*.db | tail -n +8 | xargs rm -f
```

---

## 升级策略

```
版本检测 → 下载新版 → 停止服务 → 备份 DB → 启动新版（bootstrap 自动升级）
```

- 数据库升级通过 `bootstrap()` 中的 `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` shims 自动完成
- 无破坏性变更：只加列不删列，新列有默认值
- 大版本升级：提供迁移脚本

---

## 健康检查

```bash
curl -s http://localhost:4000/api/runtime/state | jq .
```

响应：

```json
{
  "features": {},
  "activeSessions": [],
  "activeRuns": []
}
```

> 完整的 `/api/health` 端点（DB 大小、Agent 数、uptime）计划在 M5 实现。

---

## 监控建议

| 维度 | 指标 | 告警阈值 |
|------|------|---------|
| Agent 进程 | 活跃数/僵尸数 | 僵尸 > 0 |
| 磁盘空间 | DB 大小 / Worktree 占用 | > 10GB |
| AI 调用 | 今日 token 用量 | 超预算 |
| 构建状态 | 最近失败次数 | 连续 3 次失败 |

---

## 安全须知

1. **禁止公网暴露**：DevFlow 无鉴权，仅用于本地/内网
2. **SSH 密钥**：`log_targets.ssh_key_path` 指向的密钥文件需设置 600 权限
3. **Agent 审批**：生产环境建议开启工具审批，不要自动 approve 文件写入
4. **Worktree 隔离**：所有 Agent 执行在独立 worktree，不污染主仓库
