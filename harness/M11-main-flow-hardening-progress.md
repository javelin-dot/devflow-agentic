# M11 Main Flow Hardening — 执行进度

> 目标：按开发顺序扫描并修复「需求管理 → Agent 开发 → 测试缺陷 → 发布上线」主流程中的阻断点与契约漂移。
> 开始日期：2026-05-21
> Spec 来源：用户即时要求，依据 `harness/05-stage-gates.md`、`specs/M1-core-flow.yaml`、`specs/M3-release-automation.yaml`、`specs/M7-testing-defect-engineering.yaml`、`specs/M8-release-closure.yaml`。

---

## AC 检查清单

| AC | 内容 | 状态 | 验证方式 |
|---|---|---|---|
| AC-1 | 后端阶段推进与 `harness/05-stage-gates.md` 对齐，避免跳过开发/测试/发布关键事实 | ✅ | `npm run build` + API 冒烟 |
| AC-2 | 前端主流程 SSE 调用统一携带认证信息，RBAC 开启后仍可运行 | ✅ | `npm run build` + 浏览器冒烟 |
| AC-3 | 发布上线必须存在已接受的发布记录，且 `released` 推进由用户触发 | ✅ | API 冒烟 |
| AC-4 | 文档审批、冒烟生成、拒绝理由等主流程旁路不因硬编码地址或 SQL 错误失效 | ✅ | `npm run build` |
| AC-5 | 构建通过，并完成至少一条需求阶段门禁 API 冒烟 | ✅ | `npm run build` + curl |

---

## Wave 执行计划

### Wave 0 — 扫描与定位
- [x] **T1**: 梳理 harness/spec 中主流程阶段与门禁
- [x] **T2**: 扫描后端 requirements / qualityGate / release / documents / testing 路由
- [x] **T3**: 扫描前端 Board / Release / Chat / Spec 相关 SSE 调用

### Wave 1 — 后端硬化
- [x] **T4**: 阶段门禁补齐：至少一个完成子任务、mergePublish 完成、发布记录 accepted
- [x] **T5**: `prerelease → released` 强制用户确认，防止 agent/system 直推
- [x] **T6**: 修复文档拒绝理由版本摘要与自动冒烟触发旁路

### Wave 2 — 前端契约修复
- [x] **T7**: 统一直接 `fetch('/api/*')` 的认证头与相对 API 地址
- [x] **T8**: 优化发布入口和门禁弹窗错误反馈

### Wave 3 — 验证
- [x] **T9**: 运行 `npm run build`
- [x] **T10**: 启动服务并用 curl/浏览器冒烟验证关键路径

---

## 验证记录

```text
npm run build ✅ 2026-05-21
API smoke ✅ 2026-05-21
- development → uat 无 mergePublish 时返回 403
- 补齐 mergePublish accepted 后可进入 uat
- prerelease → released 使用 X-Actor: agent 返回 403
- X-Actor: user 但无正式 release accepted 返回 403
- 补齐 release accepted 后可进入 released
Browser smoke ✅ 2026-05-21
- /release 页面可加载
- /testing 页面可加载
Server start smoke ✅ 2026-05-21
- `PORT=4311 LK_DB_PATH=/tmp/devflow-main-flow-smoke.db npm run start --workspace=server` 可启动
```
