# M10 — UI/UX 系统打磨

> 原则：M9 结束后停止新增功能，用 1 周时间统一 UI/UX。禁止引入新业务逻辑，仅做视觉体系化、组件统一、交互完善与文案优化。
> 前置文档：`PRD-next-stage.md`（M6–M8 功能需求）。

---

## M10-01　设计 Token 与色彩体系

- 引入 CSS Custom Properties 或 Tailwind theme 的 design token：
  - Background: `bg-primary` #1a1b2e、`bg-secondary` #252640、`bg-tertiary` #1e2040
  - Text: `text-primary` #e0e0e0、`text-secondary` #aaa、`text-tertiary` #888
  - Border: `border-default` #2d2e50、`border-active` #4a9eff44
  - Accent: `accent-blue` #4a9eff、`accent-green` #52c41a、`accent-orange` #fa8c16、`accent-red` #ff4d4f
  - Spacing: 4px base（xs=4, sm=8, md=12, lg=16, xl=24, 2xl=32）
  - Radius: `sm`=4, `md`=6, `lg`=8, `xl`=12
  - Shadow: `sm`=0 2px 8px rgba(0,0,0,0.2), `md`=0 4px 16px rgba(0,0,0,0.3), `lg`=0 8px 32px rgba(0,0,0,0.4)
- 所有现有 inline style / 硬编码色值必须替换为 token 引用或组件封装。

---

## M10-02　通用组件库（client/src/components/ui/*）

必须创建以下原子组件，全部业务视图迁移使用：

| 组件 | 职责 | 必须支持 |
|---|---|---|
| `UiButton` | 统一按钮 | variants: primary / secondary / ghost / danger；sizes: sm / md / lg；loading 状态；disabled 样式 |
| `UiCard` | 卡片容器 | 无 padding / 默认 padding / hoverable；支持 header / footer slot |
| `UiBadge` | 标签/状态 | variants: default / success / warning / error / info；圆点模式 |
| `UiInput` | 文本输入 | 统一高度 36px；focus ring；error 状态红色边框+提示；prefix/suffix slot |
| `UiSelect` | 下拉选择 | 与 UiInput 同高同配色；clearable；disabled 态 |
| `UiTextarea` | 多行文本 | 统一最小高度；resize: vertical；同 Input 的 focus/error 态 |
| `UiEmptyState` | 空状态 | 图标 + 标题 + 描述 + 可选 action 按钮；用于列表为空、搜索结果为空 |
| `UiSkeleton` | 骨架屏 | 适配卡片、列表、表格三种骨架模板；shimmer 动画 |
| `UiTable` | 表格 | 表头固定；行 hover；排序图标；空状态自动 fallback；分页器 |
| `UiTabs` | 标签页 | 下划线/胶囊两种风格；支持 disabled tab；切换动画 |
| `UiConfirmDialog` | 确认弹窗 | 替代原生 alert/confirm；支持危险操作红色确认按钮；可取消 |
| `UiToast` | 全局通知 | 成功/错误/警告/信息四种类型；自动消失；可手动关闭；最多同时显示 3 个 |
| `UiTooltip` | 文字提示 | hover 延迟 300ms；支持方向 top/bottom/left/right；纯文本和富内容两种模式 |

---

## M10-03　Lucide 图标替换

- 所有 emoji（`⚡`、`✓`、`✗`、`📁`、`+` 等）和 Unicode 符号替换为 `lucide-react` 图标。
- 视图级图标映射：
  - 看板: `LayoutKanban`
  - 需求: `FileText`
  - 测试: `FlaskConical`
  - 终端: `Terminal`
  - 分析: `BarChart3`
  - 发布: `Rocket`
  - 设置: `Settings`
  - 通知: `Bell`
  - 搜索: `Search`
  - 添加: `Plus`
  - 关闭: `X`
  - 删除: `Trash2`
  - 编辑: `Pencil`
  - 展开: `ChevronDown`
  - 收起: `ChevronUp`
  - 拖拽: `GripVertical`
  - 链接/附件: `Paperclip`
  - 时钟/历史: `Clock`
  - 用户: `User`
  - 退出: `LogOut`

---

## M10-04　视图级打磨清单

对每个视图逐一过以下 checklist：

1. **BoardView**
   - [ ] 列头统一用 `UiBadge` 显示计数
   - [ ] 卡片统一用 `UiCard` + `PriorityBadge` 用 `UiBadge`
   - [ ] 拖拽时 ghost 样式统一
   - [ ] 空列显示 `UiEmptyState`
   - [ ] 加载态用 `UiSkeleton` 卡片占位

2. **TestDashboard**
   - [ ] 统计卡片用 `UiCard` 封装
   - [ ] 测试运行表格换 `UiTable`
   - [ ] CoverageBadge 换 `UiBadge`
   - [ ] PIV-TDD 日志区域加 copy/download 按钮
   - [ ] 空测试计划显示 `UiEmptyState`

3. **ConflictResolutionView**
   - [ ] 文件 tab 换 `UiTabs`
   - [ ] 冲突块卡片化（`UiCard`）
   - [ ] AI 建议按钮用 `UiButton` loading 态
   - [ ] AI 日志区域加 `UiToast` 替代内部 error 显示

4. **TerminalPanel**
   - [ ] 顶部工具栏用 `UiButton` 封装（clear / reconnect / copy）
   - [ ] 状态指示用 `UiBadge`
   - [ ] 终端断开时 `UiEmptyState` 覆盖

5. **OnboardingWizard**
   - [ ] Step dot 进度条保持，但激活态用 `accent-blue`
   - [ ] 检测结果列表用 `UiBadge` 展示通过/失败
   - [ ] 扫描结果列表换 `UiTable`
   - [ ] 完成页动画（可选 fade-in）

6. **NavSidebar**
   - [ ] 所有导航项配 Lucide 图标
   - [ ] 激活态统一背景色 + 左边框指示
   - [ ] 底部设置/用户区用 `UiButton` ghost 样式
   - [ ] 通知铃铛加 `UiBadge` 红点角标

7. **SettingsView / ChatWorkspace / SubTaskPanel / AnalysisView**
   - [ ] 所有表单控件换 `UiInput` / `UiSelect` / `UiTextarea`
   - [ ] 所有操作按钮换 `UiButton`
   - [ ] 删除操作触发 `UiConfirmDialog`
   - [ ] 加载/错误态统一用 `UiSkeleton` / `UiEmptyState`
   - [ ] 成功/失败反馈统一用 `UiToast`

---

## M10-05　交互状态规范

- **Hover**: 按钮/卡片统一 0.15s transition，hover 态亮度提升或边框变 `accent-blue`
- **Focus**: 所有可 focus 元素统一 box-shadow ring（`0 0 0 2px #4a9eff44`），禁止默认 outline（`outline: none`）
- **Active/Pressed**: 按钮按下时 scale(0.98) 或亮度降低
- **Disabled**: 统一 opacity 0.5 + cursor: not-allowed，按钮禁用态不响应 hover
- **Loading**: 按钮 loading 显示 spinner + 文字变 "处理中..."，禁止重复点击
- **Empty**: 列表/表格空时绝不显示空白，必须用 `UiEmptyState`
- **Error**: 网络错误/操作失败统一用 `UiToast` 红色提示，局部表单错误用 `UiInput` error 态
- **Success**: 操作成功统一用 `UiToast` 绿色提示，持续 2.5s

---

## M10-06　文案与国际化基础

- 统一中英文混排规范：UI 标签用中文，代码/技术术语保留英文（如 PR、SSH、Git）。
- 所有用户可见文案禁止出现"Failed to..."等英文错误，必须中文提示。
- 按钮文案规范：
  - 创建类："新建xx"
  - 保存类："保存"
  - 确认类："确认"
  - 取消类："取消"
  - 危险类："删除xx"（红色）
  - 执行类："开始执行" / "重新运行"
- 为 `UiToast`、`UiEmptyState`、`UiConfirmDialog` 提供默认中文文案，支持未来通过 `i18n` 扩展。

---

## M10-07　验收标准

1. 全局搜索 `style={{` 无硬编码色值（除 token 定义文件外）；
2. 全局搜索 emoji / Unicode 符号，全部被 lucide-react 图标替换；
3. 任意页面加载中都有骨架屏或 loading 态，无空白闪烁；
4. 任意列表/表格为空时都有 `UiEmptyState`，无空白；
5. 所有 alert/confirm 被替换为 `UiConfirmDialog`，所有通知被替换为 `UiToast`；
6. 构建通过（client + server tsc + vite build）。

---

## 执行约束

M10 期间禁止修改任何 `server/src/routes/*` 的业务逻辑；只允许改动 `client/src/*` 的 UI 层和新增 `client/src/components/ui/*` 组件。server 侧改动仅限于新增/修改通用工具类（如有）。
