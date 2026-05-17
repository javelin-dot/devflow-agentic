# M8 Release Closure — 执行进度

> 目标：PR审核 → 生产验证 → 合并回master → 归档 + 最小可用RBAC，让发布从半自动升到全自动闭环。
> 开始日期：2026-05-17
> 完成日期：2026-05-17
> Spec 来源：`specs/M8-release-closure.yaml`

---

## AC 检查清单

| AC | 内容 | 状态 | 验证方式 |
|---|---|---|---|
| AC-1 | ReleaseState 扩展 + release_runs 字段扩展 | ✅ | 类型检查 + DB 迁移 |
| AC-2 | POST /release/start mode=release 链路（创建PR） | ✅ | 代码实现 |
| AC-3 | PR 状态轮询 30s | ✅ | 代码实现 |
| AC-4 | 生产验证 manual/auto | ✅ | 代码实现 |
| AC-5 | merge-back 自动合并回 master | ✅ | 代码实现 |
| AC-6 | 归档自动化 cron | ✅ | 代码实现 |
| AC-7 | GET /requirements 默认过滤 archived + unarchive | ✅ | 代码实现 |
| AC-8 | users 表 + JWT login + seed local-admin | ✅ | 代码实现 |
| AC-9 | RBAC 4 个受控点 | ✅ | 代码实现 |
| AC-10 | ReleaseView 增强 | ✅ | 类型检查 |
| AC-11 | ArchiveView 完善 | ✅ | 类型检查 |
| AC-12 | LoginView + SettingsView 用户管理 | ✅ | 类型检查 |

---

## Wave 执行计划

### Wave 0 — 数据迁移 ✅
- [x] **T1**: release_runs 字段扩展 + users/roles 表 + settings 默认值 + seed local-admin

### Wave 1 — 后端 API ✅
- [x] **T2**: GitHubProvider 适配器
- [x] **T3**: ReleaseRunner 状态机扩展
- [x] **T4**: 生产验证模块
- [x] **T5**: merge-back 实现
- [x] **T6**: 归档 cron + requirements 过滤 + unarchive
- [x] **T7**: auth 路由 + JWT + middleware
- [x] **T8**: RBAC 装饰 4 个受控点

### Wave 2 — 前端 ✅
- [x] **T9**: ReleaseView 增强
- [x] **T10**: ArchiveView 完善
- [x] **T11**: LoginView + SettingsView

---

## 构建状态

```
npm run build  ✅ 2026-05-17
server tsc     ✅
client tsc     ✅
shared tsc     ✅
vite build     ✅
```
