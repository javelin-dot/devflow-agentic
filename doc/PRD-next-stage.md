# DevFlow 下一阶段产品需求文档（M6–M8）

> 范围：在 M0–M5 已交付能力之上，补齐「需求创建 → 需求分析 → 需求研发 → 用例编写 → 缺陷管理 → 版本发布」六阶段闭环。
> 编号规则：`R{阶段}-NN`（阶段 1–6 对应六阶段，`RG` 为全局）；优先级 P0=本里程碑必须，P1=次里程碑必须，P2=可延后。
> 编写日期：2026-05-17。

---

## 一、能力现状 vs 流程描述（差距分析）

| 流程阶段 | 已有能力 | 关键缺口 |
|---|---|---|
| **1. 需求创建** | requirements CRUD、`attachments: string[]` 字段、kind=standard/no_code | 附件上传/下载接口未实现；无「AI 自动生成需求 Spec」流程；需求 Spec 无版本/比较/审批 |
| **2. 需求分析** | `/api/analysis/start` 多 Agent 并行产出 `proposedTasks` + `summary` | 产物只到任务列表，**没有结构化的开发设计文档**（业务流程图 / 接口定义 / 表结构 / 索引）；设计 Spec 无独立编辑器与版本 |
| **3. 需求研发** | sub_tasks、DAG wave、TaskScheduler、worktree-create、verifyCommands | 分支命名规则未约束 `dev/{userName}/{date}-{reqId}`；子任务无「项目运行自测 + 逻辑自洽」双闭环；父子依赖只有 DAG，无 UI 表达 |
| **4. 用例编写** | test_plans / test_cases / test_runs CRUD + SSE 执行 + 适配 vitest/jest/pytest/go-test | TestGenerator AI 未实现；测试类型 `unit/integration/e2e/...`，**与"冒烟/功能/性能/压力/渗透"不匹配**；用例无版本管理 |
| **5. 缺陷管理** | defects 表（severity P0–P3，status open/in_progress/resolved/closed） | 状态机与流程描述不一致（缺"待回归"语义、缺"不处理(reason)"分支）；无「开发 Agent 自动接缺陷」编排；无测试报告聚合产物 |
| **6. 版本发布** | release_runs 状态机、Jenkins 触发、冲突三列编辑、merge-publish 模式 | 无「PR 创建+审核」节点；无「生产验证→合并回 master」状态；released 后无归档隔离逻辑 |
| **全局** | events 表、操作记录 | 无统一文档版本表（spec/case/report 全部裸字段）；无通知系统（站内+Webhook+Email）；无文档跨阶段引用关系图 |

---

## 二、下一阶段产品设计方向

### 设计原则

1. **Spec-First 贯穿**：需求 Spec → 设计 Spec → 测试用例 → 子任务，四类文档统一进入 `documents` 抽象（含 version、diff、approval、subscriber），其余功能围绕它。
2. **Agent 是默认执行者，人是审稿人**：所有 AI 产物默认进入「待确认」状态，确认后才被下游阶段消费；变更已确认文档 → 自动通知 + 重新触发下游。
3. **状态机外显**：缺陷、发布、子任务三套状态机用同一种 `status_history` 表模式，前端用统一时间线组件渲染。

### 优先级 + 阶段规划

| 里程碑 | 主题 | 周期 | P0 范围 |
|---|---|---|---|
| **M6 — Document Lifecycle**（基石） | 文档抽象 + AI 需求/设计 Spec + 通知 | 3 周 | R1-01~04、R2-01~03、RG-01~03 |
| **M7 — Testing & Defect Engineering** | 五类测试、AI 用例生成、缺陷状态机重构、报告导出 | 3 周 | R4-01~03、R5-01~04 |
| **M8 — Release Closure** | PR 审核、生产验证、master 回合、归档隔离 | 2 周 | R6-01~04、RG-04 |
| **M9（可选）** | 性能、批量操作、移动端响应、模板市场 | 2 周 | P2 类目 |

> M6 是其他里程碑的前置依赖（R4/R5/R6 都要消费"已确认的 Spec"）。

---

## 三、完整需求文档

### R1. 需求创建

#### R1-01　附件上传 / 下载 / 预览　**P0**

- **用户故事**：作为产品经理，我希望把 PRD 图、原型截图、参考文档拖入需求详情页，让后续 AI 生成 Spec 时能直接读取。
- **功能描述**：
  - 后端 `POST /api/requirements/:id/attachments`（multipart/form-data，单文件 ≤25MB，总数 ≤50 个）；存放至 `server/data/attachments/{reqId}/{uuid}.{ext}`，DB 写入 `attachments` 表（id, reqId, filename, mime, size, sha256, uploadedBy, createdAt）。
  - `GET /api/requirements/:id/attachments`、`GET /api/attachments/:id/raw`（流式下载，带 Range 支持）、`DELETE /api/attachments/:id`。
  - 前端在 ChatWorkspace 顶部新增"附件区"：拖拽 / 点击上传、图片缩略图、PDF/Word 用 mime 图标 + 下载按钮。
  - **边界**：同名追加 `-1/-2`；上传中可取消；扩展名白名单 png/jpg/jpeg/gif/webp/pdf/docx/xlsx/md/txt/zip。
- **验收标准**：
  1. 25MB 文件 60s 内上传完成（本地）；
  2. 删除附件后磁盘文件物理删除；
  3. `requirements.attachments` 字段废弃，新表替代；旧数据 bootstrap 迁移；
  4. AI 生成 Spec（R1-02）可在 prompt 中引用 attachment URL。

#### R1-02　AI 自动生成需求 Spec　**P0**

- **用户故事**：录入需求标题 + 一段背景描述 + 关联需求 + 附件，10 分钟内拿到一份结构化的需求规格说明书（PRD）。
- **功能描述**：
  - 新增 `POST /api/specs/requirement/generate { reqId, agent, contextRefs: [{type:'requirement'|'attachment', id}] }`，SSE 返回 ThinkingStream + 最终 `RequirementSpec` 文档。
  - **RequirementSpec 结构**：背景 / 目标用户 / 核心价值 / 用户故事列表 / 功能清单（含交互逻辑、边界条件）/ 非功能要求 / 验收标准 / 风险与依赖 / 关联需求。
  - 选用 Agent 复用 settings `aiProviders` 配置；带「再生成」按钮，每次调用产生新版本（RG-01）。
  - **边界**：单需求最多 5 个并发生成；超时 10 分钟自动 cancel；失败入 `events` 表。
- **验收标准**：
  1. 至少支持 claude-api / openai-compatible 两类 Agent；
  2. 生成产物自动落 `documents` 表，状态 = `draft`；
  3. 前端「需求 Spec」Tab 可展示并标记「AI 生成 · 待确认」。

#### R1-03　需求 Spec 编辑器（Markdown + 结构化字段）　**P0**

- **功能描述**：
  - 前端组件 `RequirementSpecEditor`：左侧大纲 / 右侧 Markdown + 表单混合编辑；功能清单、用户故事、验收标准用结构化表格录入，其余用 Markdown。
  - 保存时调 `PATCH /api/documents/:id`，自动产生新版本（RG-01）。
  - 支持「另存为模板」。
- **验收标准**：保存后历史版本可见；切换版本可 diff。

#### R1-04　关联需求 / 项目背景注入　**P0**

- **功能描述**：
  - 需求创建表单新增「关联需求」多选（仅同 workspace）与「项目背景」富文本字段；
  - 关联需求选中后，R1-02 调用时把对方「已确认」的需求 Spec 摘要拼入 prompt；
  - **边界**：循环关联检测（A 关联 B、B 关联 A 仍允许，但 prompt 中只展开一层避免上下文爆炸）。
- **验收标准**：prompt 拼接结果可在 `events` 表 / SSE thinking 里完整看到；关联需求被归档后自动展示「已归档」灰标。

#### R1-05　需求 Spec 确认 / 打回　**P1**

- **功能描述**：
  - `POST /api/documents/:id/approve` 与 `/reject { reason }`；
  - 仅当 RequirementSpec 状态 = `approved` 才允许 stage 从 `backlog` → `analyzing`（写入 `stage_gates`）；
  - 打回触发通知给作者。

---

### R2. 需求分析

#### R2-01　AI 生成开发设计 Spec　**P0**

- **用户故事**：基于已确认的需求 Spec，AI 输出包含业务流程图、接口列表、数据模型的开发设计文档，并按项目维度拆分。
- **功能描述**：
  - 复用现有 `/api/analysis/start` 但产物升级：在 `AnalysisOutput` 中新增 `designSpec: DesignSpec`；
  - **DesignSpec 结构**：`businessFlow`（mermaid 字符串）/ `apis: ApiDesign[]`（method, path, request/response schema, errorCodes）/ `dataModels: TableDesign[]`（table, columns[name, type, nullable, default, comment], indexes, fkRefs）/ `riskAndCompatibility` / `rollbackPlan`；
  - 同步生成 `proposedTasks`（保持现有能力，新增 `referencedApiIds` / `referencedTableIds` 字段，让任务能反向追踪到设计点）；
  - 前端 AnalysisComparePanel 增加「设计 Spec 预览」Tab：Mermaid 渲染流程图、表格渲染 API/表结构。
- **验收标准**：
  1. 流程图能用 mermaid live editor 重渲染；
  2. 选定（choose）一个分析候选后，DesignSpec 进入 `documents` 表（type=`design_spec`），状态 = `draft`；
  3. 子任务在 ProposedTask 中保留对 designSpec.api/table 的引用 ID。

#### R2-02　设计 Spec 编辑器　**P0**

- **功能描述**：
  - `DesignSpecEditor` 组件：流程图用 mermaid 文本 + 实时预览；API 列表 / 数据模型用表格 + JSONSchema 编辑；
  - 保存触发版本化；
  - 提供「导出为 Markdown」和「导出为 OpenAPI 3.0」（仅 API 部分）。
- **验收标准**：编辑保存后版本号自增；导出的 OpenAPI 文件可被 swagger-cli validate 通过。

#### R2-03　设计 Spec 变更反向触发　**P1**

- **功能描述**：
  - 已确认（approved）的 DesignSpec 被编辑后：
    - 通知所有依赖该设计的子任务负责人（通过 RG-03）；
    - 在子任务详情显示「上游设计已变更」红标，要求人工确认是否需要重做；
    - 自动建议重新生成测试用例（R4-01）。
- **验收标准**：变更后涉及的 subtask 在 UI 上有醒目标记；通知 5s 内到达。

---

### R3. 需求研发

#### R3-01　子任务关联仓库 + 自动分支　**P0**

- **用户故事**：子任务被调度时，DevFlow 自动在对应仓库创建 `dev/{userName}/{YYYYMMDD}-{reqId}` worktree，避免污染主仓。
- **功能描述**：
  - `sub_tasks` 增加字段：`branchName`、`worktreePath`；
  - 子任务从 `pending` → `ready` 时调用 `gitService.addWorktree`：
    - 分支名规则：`dev/{settings.gitUserName}/{YYYYMMDD}-{reqId}`，若已存在则附 `-2/-3/...`；
    - userName 取自 settings `git.userName`，缺失则报 `MISSING_GIT_USER` 并阻断；
  - `requirement_projects` 表回写 `devBranch`。
- **验收标准**：
  1. 同一需求多次执行不会创建重复分支；
  2. 子任务取消时分支保留（用户决定是否清理）；
  3. 失败时 sub_task.status=`error`，errorMessage 含具体 git stderr。

#### R3-02　子任务依赖与并行调度可视化　**P1**

- **功能描述**：
  - SubTaskPanel 增加「DAG 视图」切换：以 wave 分组横向布局，依赖用箭头连线；
  - 鼠标悬停显示父任务、阻塞原因；
  - 状态颜色：pending=灰 / ready=蓝 / running=黄 / done=绿 / error=红；
  - **边界**：DAG 节点 >50 个时降级为列表。
- **验收标准**：依赖闭环时前端展示警示横幅（后端 sortWaves 已抛 CycleError）。

#### R3-03　子任务自测双闭环（运行验证 + 逻辑自洽）　**P0**

- **用户故事**：子任务完成后不仅要 verifyCommands 通过，还要确认"项目能起来 + 改动逻辑自洽"。
- **功能描述**：
  - 在现有 verifyCommands 基础上新增两类 hook：
    - `bootCheck`：项目启动探测命令 + 期望端口 / 健康路径（fetch 探活，超时 30s）；
    - `selfReview`：触发一次 Agent 自审（prompt = "请基于本任务的 diff 与验收标准，输出 PASS/FAIL + 理由"，结果存 `sub_tasks.notes`）；
  - 任何一个失败 → 状态 `error`，自动产出 1 条 P2 缺陷草稿。
- **验收标准**：
  1. bootCheck 端口探测失败 30s 内返回；
  2. selfReview 输出 PASS 后子任务才允许 status=`done`；
  3. 缺陷草稿默认 severity=P2，绑定 subTaskId。

#### R3-04　简单需求轻量化模式　**P1**

- **功能描述**：
  - 需求创建时勾选「简单需求」（新增 kind=`lightweight`）；
  - 跳过 R2 设计 Spec 强校验，但仍必须有：1 个子任务（描述即可）+ 至少 1 条测试用例（R4 必产）；
  - 前端在 BoardView 卡片右上角加「轻量」标。

---

### R4. 用例编写

#### R4-01　测试类型重构为"冒烟 / 功能 / 性能 / 压力 / 渗透"　**P0**

- **用户故事**：现有测试类型与产品口径不一致，需要重定义。
- **功能描述**：
  - `TestType` 改为 `smoke | functional | performance | stress | penetration`；
  - 数据迁移：`unit/integration/e2e/acceptance/regression` → `functional`；运行历史保留原 testType 写入 `legacyType` 字段；
  - 用例编辑器新增 type-specific 配置：
    - performance：并发数、持续时长、QPS 阈值；
    - stress：递增并发曲线、最大并发；
    - penetration：扫描工具（OWASP ZAP / sqlmap 选项）、目标 URL 白名单；
  - 各类型对应不同 `TestFrameworkAdapter`：functional 继续用 vitest/jest/pytest/go-test；performance 用 `k6`；stress 用 `wrk`；penetration 用 `zap-cli`。
- **验收标准**：
  1. 5 种类型均能 SSE 执行成功；
  2. 旧数据迁移无丢失；
  3. 渗透测试目标 URL 必须落在 `settings.security.penTestAllowList`，否则拒绝执行。

#### R4-02　AI 自动生成测试用例 + 冒烟用例　**P0**

- **功能描述**：
  - 新增 `POST /api/test-cases/generate { reqId, agent, scope: 'smoke'|'full' }`，SSE 流；
  - prompt 注入需求 Spec + 设计 Spec + 子任务列表；
  - 输出 `TestCase[]`：每条带 `testType`、`title`、`description`、`steps[]`（前置/步骤/期望）、`command`、`expectedExitCode`；
  - 触发时机：
    - DesignSpec approved 时**自动**触发一次 `scope=smoke`（生成 ≤10 条）；
    - 用户在 TestDashboard 点击「AI 生成全量用例」触发 `scope=full`；
  - 生成的用例默认 status=`draft`，需人工审阅。
- **验收标准**：
  1. smoke 用例总数 5–10 条；
  2. functional 用例覆盖每个 acceptance 至少 1 条；
  3. 生成结果自动入 `test_plans`（不存在则新建一个标题 = 需求标题的计划）。

#### R4-03　测试用例编辑 + 版本管理　**P0**

- **功能描述**：
  - TestCase 编辑器（Markdown + 步骤表格）；
  - 每次保存进 `documents` 体系做版本化，可与上一版做 diff；
  - 删除走软删除（`deletedAt`），归档视图可恢复。
- **验收标准**：用例修改记录可追溯到操作人、时间、diff。

#### R4-04　冒烟用例独立看板　**P1**

- **功能描述**：TestDashboard 顶部新增「冒烟用例」卡片：显示总数 / 通过率 / 上次运行时间；点击进入仅 smoke 类型的执行视图。

---

### R5. 缺陷管理

#### R5-01　缺陷状态机重构　**P0**

- **用户故事**：缺陷状态需符合"待确认 → 待修复 → 待回归 → 已关闭 / 不处理"。
- **功能描述**：
  - `DefectStatus` 改为 `pending_confirm | to_fix | to_regress | closed | wont_fix`；
  - `wont_fix` 必须填 `resolution` + `wontFixReason`（枚举：data_issue / product_decision / duplicate / cannot_reproduce / other）；
  - 转换规则：
    - pending_confirm → to_fix（QA 确认）
    - pending_confirm → wont_fix（带 reason）
    - to_fix → to_regress（开发提交修复）
    - to_regress → closed（QA 回归通过）
    - to_regress → to_fix（回归失败）
  - 新增 `defect_status_history` 表记录每次变更（actor, fromStatus, toStatus, note, createdAt）。
- **验收标准**：非法转换返回 409；wont_fix 缺 reason 返回 400；前端 DefectListPanel 用时间线渲染历史。

#### R5-02　开发 Agent 自动接缺陷　**P0**

- **功能描述**：
  - 新增 `POST /api/defects/:id/assign-agent { agent }` 触发自动流程：
    1. 拉起 chat session（kind=`defect_fix`）；
    2. Agent 先做分类：若判定"无需改代码" → 自动 PATCH defect 至 `wont_fix` + 填 wontFixReason；
    3. 若需改代码 → checkout 原 `devBranch` → 修复 → 触发 `verifyCommands` + `bootCheck`；
    4. 修复成功 → PATCH defect 至 `to_regress`，自动发起一次 smoke run。
  - 失败时回滚分支至修复前 commit；
- **验收标准**：1 个缺陷端到端（assign → 修复 → regress）<15 分钟（mock 项目）；中断/超时不污染原分支。

#### R5-03　测试报告聚合产物　**P0**

- **功能描述**：
  - `POST /api/test-reports/generate { reqId, scope: 'all'|'release' }` 产生 Markdown + PDF：
    - 章节：执行汇总（按 testType 分组通过率） / 失败用例明细 / 关联缺陷列表 / 性能 P95/P99 / 渗透漏洞清单；
    - 数据来源：`test_runs` + `defects` + 各类型测试结果文件；
  - 报告入 `documents` 表（type=`test_report`），可下载、可版本化。
- **验收标准**：报告生成 <30s；Markdown / PDF 一致；性能测试图表用 mermaid `gantt`/`xychart-beta`。

#### R5-04　缺陷与子任务的循环闭环　**P1**

- **功能描述**：
  - 当存在 status ∈ {pending_confirm, to_fix, to_regress} 的缺陷时，**禁止** stage 从 uat → prerelease；
  - QualityGate `gate_checks` 新增 `defect_clear` 检查项；
  - 在 BoardView 卡片角标显示「未关闭缺陷 N 个」。

---

### R6. 版本发布

#### R6-01　Release 分支 + PR 审核节点　**P0**

- **功能描述**：
  - 扩展 `ReleaseRun`：
    - 新增 state：`waiting_pr_review` / `production_verifying` / `merged_back`；
    - `release_runs` 增加字段：`prUrl`、`prStatus`、`releaseBranch`、`productionVerifyResult`；
  - 新建 release：
    1. `git checkout master && git pull && git checkout -b release/{reqId}-{YYYYMMDD}`；
    2. 依次 merge 各 devBranch（冲突走现有 ConflictResolutionView）；
    3. push 后通过 GitHub/GitLab API 创建 PR；
    4. 进入 `waiting_pr_review`，轮询 PR 状态（30s 间隔）直至 `approved` 才进入 triggering。
- **验收标准**：
  1. 三类 git provider（GitHub / GitLab / 内置 webhook）至少支持 GitHub；
  2. PR 链接前端可点击跳转；
  3. PR 被 close 自动把 release 标记为 cancelled。

#### R6-02　Jenkins 触发表单（容器/服务配置）　**P0**

- **功能描述**：
  - PR approved 后弹出 ReleaseTriggerForm：容器镜像 tag、服务名、副本数、环境（pre/prod）、自定义参数；
  - 表单字段从 `jenkins_templates.params` 模板生成；
  - 提交后调用现有 Jenkins 触发逻辑，结果存 `jenkinsBuildUrl`。
- **验收标准**：模板字段缺失时表单不出现该字段；触发失败状态 = `error` 并附 Jenkins 响应。

#### R6-03　生产验证 + 合并回 master　**P0**

- **功能描述**：
  - Jenkins 完成（state=done 前）插入 `production_verifying`：
    - 默认 manual：UI 显示「生产验证通过」按钮，点击后 verdict=`accepted`；
    - 可选 automatic：调用 settings 中配置的 healthcheck URL 列表，全部 200 即视为通过；
  - 验证通过后自动 `git checkout master && git merge release/... && git push origin master`；
  - 完成后 `release_runs.state = merged_back`，需求 stage = `released`，记录 `releasedAt`。
- **验收标准**：merge-back 冲突走同样 ConflictResolutionView；验证失败 verdict=null 且需求保持 prerelease。

#### R6-04　归档与看板隔离　**P0**

- **功能描述**：
  - 需求 stage=released 后 7 天自动 `archivedAt`（cron 1 次/日，可配置）；
  - `GET /api/requirements` 默认 `archived=false`，BoardView 不展示归档需求；
  - 新增「历史归档」视图：分页、按 workspace/季度筛选、只读；
  - 归档需求恢复需走 `POST /api/requirements/:id/unarchive`（权限：admin）。
- **验收标准**：
  1. BoardView SQL 查询自动加 `archivedAt IS NULL`；
  2. 归档自动化任务可在 settings 关闭；
  3. 已归档需求的子任务、缺陷、报告均仍可只读访问。

---

### RG. 全局约束

#### RG-01　统一文档版本系统　**P0**

- **用户故事**：所有 Spec / 用例 / 报告需要统一的"版本 + 历史 + diff + 软删"基础设施。
- **功能描述**：
  - 新表 `documents`（id, reqId, type[`requirement_spec`|`design_spec`|`test_case`|`test_report`|`release_doc`], title, status[`draft`|`pending_approval`|`approved`|`rejected`|`archived`], currentVersion, createdAt, deletedAt）；
  - 新表 `document_versions`（id, docId, version, content[JSON 或 Markdown], summary, authorId, authorAgent, createdAt）；
  - `PATCH /api/documents/:id` 自动 `currentVersion += 1` 并落 versions；
  - `GET /api/documents/:id/versions`、`GET /api/documents/:id/diff?from=&to=` 返回 unified diff；
  - 软删（deletedAt）+ `POST /api/documents/:id/restore`。
- **验收标准**：
  1. 5 类文档全部走 documents；
  2. diff 接口在 1MB Markdown 上 <500ms；
  3. 旧 `api_doc / release_doc / contracts` 数据迁移至 documents。

#### RG-02　文档下载 / 导出（Markdown + PDF + DOCX）　**P1**

- **功能描述**：
  - `GET /api/documents/:id/export?format=md|pdf|docx`；
  - PDF 用 `puppeteer` headless 渲染 Markdown；DOCX 用 `markdown-docx`；
  - 文件名 = `{需求编号}-{文档类型}-v{version}.{ext}`。
- **验收标准**：三种格式均能正常打开；中文 / Mermaid 在 PDF 中可见。

#### RG-03　通知系统（站内 + Webhook + 邮件）　**P0**

- **功能描述**：
  - 新表 `notifications`（id, userId, type, payload, channel[`inapp`|`webhook`|`email`], readAt, createdAt）；
  - 新表 `notification_subscriptions`（userId, eventType, channel, target）；
  - 事件类型（最小集）：
    - `document.changed_after_approval`
    - `document.pending_approval`
    - `defect.status_changed`
    - `release.pr_review_required`
    - `subtask.error`
  - 后端发布事件 → 异步分发到对应 channel；
  - 站内：NavSidebar 右上角铃铛（badge + dropdown）；
  - Webhook：POST JSON 到用户配置的 URL；
  - Email：使用 nodemailer + settings.smtp。
- **验收标准**：
  1. 文档审批通过后再次编辑，相关方 5s 内收到站内通知；
  2. Webhook 失败重试 3 次（指数退避）；
  3. 用户可在 SettingsView 取消订阅。

#### RG-04　文档强关联图（需求 → 设计 → 用例 → 任务）　**P1**

- **功能描述**：
  - 新表 `document_links`（fromDocId, toDocId, relation[`derives_from`|`tests`|`implements`]）；
  - 生成 R1-02 / R2-01 / R4-02 时自动建立链路；
  - 前端在需求详情新增「关联图」Tab：用 D3 force layout 渲染。
- **验收标准**：删除上游文档时，下游「上游已删除」红标自动出现。

#### RG-05　操作历史（审计）　**P0**

- **功能描述**：
  - 复用现有 `events` 表，增加 actorRole（user/agent/system）、targetType、targetId 字段；
  - 所有 PATCH/DELETE 操作通过中间件自动落 events；
  - ActivityView 支持按 targetType 过滤。
- **验收标准**：删除一条用例后能在 ActivityView 查到操作人、时间、被删 id。

#### RG-06　权限/角色（最小集）　**P1**

- **功能描述**：
  - 引入 `users` 表 + 角色 `admin / dev / qa / pm / viewer`；
  - 受控操作：审批文档（pm/admin）、unarchive（admin）、release trigger（admin）、缺陷状态变更（qa/dev/admin）；
  - 单机模式下若未启用用户系统，默认全部走 `local-admin`。
- **验收标准**：未授权操作返回 403；UI 隐藏对应按钮。

#### RG-07　性能与可观测性　**P2**

- **功能描述**：
  - BoardView 看板 >200 卡片时启用虚拟滚动；
  - 文档编辑器 >50KB Markdown 启用懒加载；
  - 后端关键接口 P95 延迟入 `/api/health`。
- **验收标准**：1000 个需求看板首屏 <2s。

---

## 四、建议立刻启动的 P0 列表（M6 前两周）

| 顺序 | 需求 | 估算（人日） |
|---|---|---|
| 1 | RG-01 文档版本系统（基石） | 5 |
| 2 | RG-03 通知系统骨架 | 4 |
| 3 | R1-01 附件上传 | 2 |
| 4 | R1-02 AI 生成需求 Spec | 3 |
| 5 | R1-03 / R1-04 编辑器 + 关联需求 | 3 |
| 6 | R2-01 / R2-02 设计 Spec 生成 + 编辑器 | 4 |

完成上述 6 项即可让"创建 → 分析"两阶段完整跑通 Spec-First 闭环，是后续 M7（测试/缺陷）与 M8（发布）的前置基础。

---

## 五、对应 Spec 文件

本里程碑的执行 Spec（M6 Document Lifecycle）落在 `specs/M6-document-lifecycle.yaml`，可用 `node harness/tools/validate-spec.mjs specs/M6-document-lifecycle.yaml` 校验。

---

## 六、后续阶段索引

| 阶段 | 文档 | 说明 |
|---|---|---|
| M10 UI/UX 打磨 | [`M10-ui-polish.md`](M10-ui-polish.md) | 设计 token、组件库规范、交互状态、视图级 checklist、文案指南。停止功能开发后的纯视觉升级。
