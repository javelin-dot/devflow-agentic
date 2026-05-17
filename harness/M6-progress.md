# M6 Document Lifecycle — 执行进度

> 目标：补齐「文档版本 + AI 需求/设计 Spec + 通知 + 附件」，让「创建 → 分析」两阶段跑通 Spec-First 闭环。
> 开始日期：2026-05-17
> 完成日期：2026-05-17
> Spec 来源：`specs/M6-document-lifecycle.yaml`

---

## AC 检查清单

| AC | 内容 | 状态 | 验证方式 |
|---|---|---|---|
| AC-1 | documents 表 + 版本化 PATCH | ✅ | 类型检查 + 构建通过 |
| AC-2 | GET /documents/:id/diff unified diff | ✅ | 代码实现 (LCS diff) |
| AC-3 | approve/reject + 非法转换 409 | ✅ | 代码实现 |
| AC-4 | multipart 上传 + attachments 表 | ✅ | 代码实现 |
| AC-5 | Range 流式下载 + DELETE | ✅ | Readable.toWeb 转换 |
| AC-6 | SSE 生成 requirement_spec | ✅ | ClaudeAPISession 复用 |
| AC-7 | SSE 生成 design_spec | ✅ | ClaudeAPISession 复用 |
| AC-8 | notifications 表 + 五类事件触发 | ✅ | 内存队列 + setTimeout 链 |
| AC-9 | Webhook 指数退避重试 3 次 | ✅ | 1s/4s/16s 退避 |
| AC-10 | DocumentEditor 通用组件 | ✅ | 版本列表 + diff + 导出MD |
| AC-11 | RequirementSpecEditor + DesignSpecEditor | ✅ | ChatWorkspace Tab 集成 |
| AC-12 | AttachmentsPanel 拖拽上传 | ✅ | 图片缩略图 + 删除确认 |
| AC-13 | NotificationBell 铃铛组件 | ✅ | 红点 badge + 下拉列表 |

---

## Wave 执行计划

### Wave 0 — 数据层（无依赖，可并行）✅
- [x] **T1**: documents / document_versions / document_links 三张表
- [x] **T2**: attachments 表（替换 requirements.attachments JSON 字段）+ 数据迁移
- [x] **T3**: notifications / notification_subscriptions 两张表 + events 审计字段

### Wave 1 — 后端路由层（依赖 Wave 0）✅
- [x] **T4**: documents 路由 — CRUD + 版本化 + diff + approve/reject + links
- [x] **T5**: attachments 路由 — multipart 上传 + Range 下载 + DELETE
- [x] **T6**: notifications 路由 + NotificationDispatcher 服务（inapp/webhook/email + 指数退避）

### Wave 2 — AI 生成 + 事件钩子（依赖 Wave 1）✅
- [x] **T7**: POST /specs/requirement/generate SSE — prompt 拼装 + Agent + 落 documents
- [x] **T8**: POST /specs/design/generate SSE — 设计 Spec 生成 + document_links 自动关联
- [x] **T9**: 事件钩子 — document.changed_after_approval / defect.status_changed / subtask.error

### Wave 3 — 前端（依赖 Wave 1/2）✅
- [x] **T10**: DocumentEditor 通用组件（版本列表 + diff 视图 + 导出MD）
- [x] **T11**: RequirementSpecEditor + DesignSpecEditor（AI 生成按钮 + DocumentEditor 集成）
- [x] **T12**: AttachmentsPanel（拖拽上传 + 缩略图 + 删除确认）→ ChatWorkspace 替换旧组件
- [x] **T13**: NotificationBell（铃铛 + 红点 badge + 下拉列表 + 标记已读）→ NavSidebar 集成

---

## 新增/修改的文件清单

### 后端
| 文件 | 说明 |
|---|---|
| `server/src/db/index.ts` | bootstrap 增加 6 张表 + 数据迁移 + events 审计字段 |
| `server/src/routes/documents.ts` | 新路由：CRUD + 版本化 + diff + approve/reject + links |
| `server/src/routes/attachments.ts` | 新路由：multipart + Range 下载 + DELETE |
| `server/src/routes/notifications.ts` | 新路由：notifications + subscriptions CRUD |
| `server/src/routes/specs.ts` | 新路由：/specs/requirement/generate + /specs/design/generate SSE |
| `server/src/services/notificationDispatcher.ts` | 通知分发器：三通道 + 指数退避 |
| `server/src/index.ts` | 注册 4 个新路由 |
| `server/src/routes/documents.ts` | 事件钩子：approved 后编辑触发通知 |
| `server/src/routes/testing.ts` | 事件钩子：defect 状态变更触发通知 |
| `server/src/routes/subtasks.ts` | 事件钩子：subtask error 触发通知 |

### 前端
| 文件 | 说明 |
|---|---|
| `client/src/api/hooks.ts` | 新增 M6 hooks（documents/attachmentsV2/notifications） |
| `client/src/components/DocumentEditor.tsx` | 新组件：通用文档编辑器 |
| `client/src/components/RequirementSpecEditor.tsx` | 新组件：需求 Spec 编辑器 + AI 生成 |
| `client/src/components/DesignSpecEditor.tsx` | 新组件：设计 Spec 编辑器 + AI 生成 |
| `client/src/components/AttachmentsPanel.tsx` | 新组件：拖拽上传 + 缩略图 + 删除确认 |
| `client/src/components/NotificationBell.tsx` | 新组件：铃铛 + badge + 下拉 |
| `client/src/components/NavSidebar.tsx` | 集成 NotificationBell |
| `client/src/views/ChatWorkspace.tsx` | 替换 AttachmentPanel → AttachmentsPanel，新增 spec/design Tab |

### Shared
| 文件 | 说明 |
|---|---|
| `shared/src/index.ts` | 新增 M6 类型（Document/DocumentVersion/DocumentLink/Attachment/Notification/NotificationSubscription） |

### Harness
| 文件 | 说明 |
|---|---|
| `harness/M6-progress.md` | 本进度文件 |

---

## 关键设计决策

1. **旧字段兼容**：requirements.api_doc / release_doc / contracts 保留只读到 M7，新数据全部入 documents。
2. **通知队列**：内存 setTimeout 链，不引入 Redis；M9 评估持久化。
3. **Mermaid 渲染**：前端动态 import，后端只存字符串。
4. **附件存储**：`server/data/attachments/{reqId}/{uuid}.{ext}`，DB 存 metadata。
5. **文档 status 机**：draft → pending_approval → approved/rejected → archived。
6. **Stream 类型兼容**：Node.js ReadStream → Web ReadableStream 通过 `Readable.toWeb()` 转换，适配 Hono c.body()。

---

## 构建状态

```
npm run build  ✅ 全部通过
server tsc     ✅ 无错误
client tsc     ✅ 无错误
shared tsc     ✅ 无错误
vite build     ✅ 318KB bundle
```
