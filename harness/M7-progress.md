# M7 Testing & Defect Engineering — 执行进度

> 目标：五类测试 + AI 用例生成 + 缺陷状态机重构 + 报告导出，让「开发 → 测试 → 缺陷修复 → 报告」形成可循环的工程化通路。
> 开始日期：2026-05-17
> 完成日期：2026-05-17
> Spec 来源：`specs/M7-testing-defect-engineering.yaml`

---

## AC 检查清单

| AC | 内容 | 状态 | 验证方式 |
|---|---|---|---|
| AC-1 | TestType 重构 + 旧数据迁移 + legacyType | ✅ | 类型检查 + DB 迁移 |
| AC-2 | 5 类适配器(k6/wrk/zap-cli) + CLI 探测 + 424 | ✅ | 类型检查 + 单元测试 |
| AC-3 | 渗透白名单校验 403 | ✅ | 类型检查 |
| AC-4 | POST /api/test-cases/generate SSE | ✅ | 代码实现 |
| AC-5 | design_spec approved 自动触发 smoke | ✅ | 代码实现 |
| AC-6 | TestCase 入 documents 体系 + 软删 + 恢复 | ✅ | 类型检查 |
| AC-7 | DefectStatus 重构 + history 表 + 409/400 | ✅ | 类型检查 |
| AC-8 | POST /defects/:id/assign-agent 自动修复闭环 | ✅ | 代码实现 |
| AC-9 | POST /test-reports/generate Markdown 聚合 | ✅ | 代码实现 |
| AC-10 | uat→prerelease 缺陷拦截 + defect_clear | ✅ | 代码实现 |
| AC-11 | GET /documents/:id/export pdf/docx | ✅ | 代码实现 |
| AC-12 | TestDashboard 增强（冒烟卡片 + 5 类 tab） | ✅ | 类型检查 |
| AC-13 | DefectListPanel 时间线 + 状态机 + Agent 指派 | ✅ | 类型检查 |
| AC-14 | DocumentLinkGraph D3 force layout | ✅ | 类型检查 |
| AC-15 | DocumentEditor 导出 PDF/DOCX 按钮 | ✅ | 类型检查 |

---

## Wave 执行计划

### Wave 0 — 数据迁移（无依赖）✅
- [x] **T1**: test_cases testType 迁移 + legacyType + defects 状态枚举迁移 + defect_status_history 表 + settings.security.penTestAllowList

### Wave 1 — 后端 API（依赖 Wave 0）✅
- [x] **T2**: TestFrameworkAdapter 重构 — 5 类适配器 + CLI 探测 + installHint
- [x] **T3**: POST /api/test-cases/generate SSE — prompt 拼装 + Agent + 落 test_plans/test_cases
- [x] **T4**: 缺陷状态机 — PATCH /defects/:id/status 校验 + history + 通知
- [x] **T5**: TestCase 编辑入 documents 体系 — dual-write 过渡期

### Wave 2 — 编排 + 报告 + 集成（依赖 Wave 1）✅
- [x] **T6**: DefectFixOrchestrator — assign-agent → 分类 → 修复/ wont_fix → 回归 → 回滚
- [x] **T7**: POST /api/test-reports/generate — 聚合 → Markdown 落 documents
- [x] **T8**: QualityGate defect_clear + uat→prerelease 拦截
- [x] **T9**: GET /documents/:id/export pdf/docx — puppeteer + markdown-docx
- [x] **T10**: design_spec approved 自动触发 smoke 生成钩子

### Wave 3 — 前端（依赖 Wave 1/2）✅
- [x] **T11**: TestDashboard 增强 — 冒烟卡片 + 5 类 tab + type-specific 配置
- [x] **T12**: DefectListPanel 时间线 + 状态机面板 + 指派 Agent + wontFixReason 过滤
- [x] **T13**: DocumentLinkGraph — D3 force layout
- [x] **T14**: DocumentEditor 导出 PDF/DOCX 按钮

---

## 新增/修改的文件清单

### 后端
| 文件 | 说明 |
|---|---|
| `server/src/db/index.ts` | bootstrap：testType 迁移、legacyType、defect_status_history 表、penTestAllowList |
| `server/src/services/testFrameworkAdapter.ts` | 重构：5 类适配器 + CLI 探测 |
| `server/src/routes/testCases.ts` | 新增：POST /test-cases/generate SSE |
| `server/src/routes/defects.ts` | 修改：状态机校验 + history + 通知 |
| `server/src/routes/documents.ts` | 修改：TestCase dual-write + export + approved 钩子 |
| `server/src/services/defectFixOrchestrator.ts` | 新增：缺陷自动修复编排 |
| `server/src/routes/testReports.ts` | 新增：POST /test-reports/generate |
| `server/src/services/qualityGate.ts` | 修改：defect_clear 检查项 |
| `server/src/routes/stage.ts` | 修改：uat→prerelease 缺陷拦截 |

### 前端
| 文件 | 说明 |
|---|---|
| `client/src/views/TestDashboard.tsx` | 增强：冒烟卡片 + 5 类 tab |
| `client/src/components/DefectListPanel.tsx` | 增强：时间线 + 状态机 + Agent 指派 |
| `client/src/components/DocumentLinkGraph.tsx` | 新增：D3 force layout |
| `client/src/components/DocumentEditor.tsx` | 增强：导出 PDF/DOCX 按钮 |

### Shared
| 文件 | 说明 |
|---|---|
| `shared/src/index.ts` | 新增/修改：TestType、DefectStatus、DefectStatusHistory、TestReport 类型 |

### Harness
| 文件 | 说明 |
|---|---|
| `harness/M7-progress.md` | 本进度文件 |

---

## 关键设计决策

1. **test_cases 表保留 + dual-write**：M7 内 test_cases 仍是读写表，但新增 type=test_case 的 documents 记录做版本化；M8 再彻底切到 documents。
2. **渗透白名单默认空**：settings.security.penTestAllowList 未配置时所有 penetration 测试直接 403。
3. **DefectFixOrchestrator 回滚**：用 git reflog 拿修复前 SHA，失败时 git reset --hard 回原状态。
4. **k6/wrk/zap-cli 适配器**：先探测 CLI 是否存在，缺失返回 424 + installHint，不进入 running。
5. **puppeteer 懒加载**：export PDF 时才 require('puppeteer')，首次运行自动下载 Chromium；CI 设 PUPPETEER_SKIP_DOWNLOAD=1。

---

## 构建状态

```
npm run build  ✅ 2026-05-17
server tsc     ✅
client tsc     ✅
shared tsc     ✅
vite build     ✅
```
