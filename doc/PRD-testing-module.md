# DevFlow v2 — 测试与质量保障模块规格说明书

> **文档版本**: 1.0.0  
> **创建日期**: 2026-05-16  
> **关联文档**: PRD-devflow-v2.md  
> **文档性质**: 测试模块详细设计规格，作为PRD补充章节

---

## 目录

1. [设计背景与目标](#1-设计背景与目标)
2. [测试流程与生命周期集成](#2-测试流程与生命周期集成)
3. [测试模块功能设计 (M16)](#3-测试模块功能设计-m16)
4. [AI 驱动的测试生成机制](#4-ai-驱动的测试生成机制)
5. [测试执行引擎](#5-测试执行引擎)
6. [测试结果管理与可视化](#6-测试结果管理与可视化)
7. [与现有模块的集成规范](#7-与现有模块的集成规范)
8. [数据模型设计](#8-数据模型设计)
9. [API 设计](#9-api-设计)
10. [技术实现方案](#10-技术实现方案)
11. [任务分解与开发路线](#11-任务分解与开发路线)

---

## 1. 设计背景与目标

### 1.1 问题陈述

当前 PRD 的流程设计存在关键缺陷：

```
现有流程:
  development(开发) → uat(测试) → prerelease(预发布)
                       ↑
                       └── 此处仅是"阶段名称"，缺少具体测试执行机制
```

**核心问题**:
- 子任务(SubTask)完成后没有自动化验证闭环
- 开发阶段缺少 TDD 支持（先写测试→再实现）
- UAT 阶段无系统化测试用例管理和执行跟踪
- 阶段转换缺少质量门禁（可以无测试通过即发布）
- AI Agent 生成的代码没有可靠的验证手段

### 1.2 设计目标

| 目标 | 度量指标 | 目标值 |
|------|---------|--------|
| 测试覆盖自动化 | AI自动生成测试用例占比 | >60% |
| 开发阶段质量 | 子任务完成时验证通过率 | 100% (未通过不允许标记done) |
| UAT质量门禁 | 进入prerelease前测试通过率 | >95% |
| 回归保护 | 发布前回归测试通过率 | 100% |
| 测试反馈速度 | 单元测试执行时间 | <30秒 |

### 1.3 设计原则

| 原则 | 含义 |
|------|------|
| **Test-First** | 验收标准在分析阶段就转化为可执行测试 |
| **Agent-Verifiable** | 每个测试都能被AI代理自动运行和判定 |
| **Progressive Confidence** | 从单元→集成→系统逐层建立信心 |
| **Gate-Enforced** | 阶段转换必须通过对应级别的质量门禁 |
| **Continuous Feedback** | 测试结果实时反馈到开发循环中 |

### 1.4 参考研究总结

**从 TDFlow (Test-Driven Agentic Workflow)**:
- AI Agent 先生成测试用例，再编写实现代码
- 测试失败驱动代码修正循环
- 测试作为 Agent 执行的"验收契约"

**从 PIV Loop (Plan-Implement-Validate)**:
- 每个短周期都以验证结束
- 验证不仅是测试，还包括静态分析和人工审查
- 失败的验证触发精准修正或重新规划

**从 AWS CI/CD Testing Stages**:
- 测试金字塔: 70%单元 / 20%集成 / 10%端到端
- Build阶段: 单元测试 + 静态分析 + 安全扫描
- Staging阶段: 集成测试 + 系统测试 + 性能测试 + 验收测试
- Production阶段: Canary测试 + Smoke测试

---

## 2. 测试流程与生命周期集成

### 2.1 增强后的阶段流程

```
backlog → analyzing → development → uat → prerelease → released
             │              │          │         │
             ▼              ▼          ▼         ▼
        [验收标准生成]  [TDD循环]  [UAT测试]  [回归测试]
        [测试计划草案]  [单元测试]  [集成测试]  [冒烟测试]
                        [验证命令]  [性能测试]  [质量报告]
```

### 2.2 各阶段测试职责

| 阶段 | 测试活动 | AI参与方式 | 质量门禁 |
|------|---------|-----------|---------|
| **analyzing** | 生成验收标准→转化为测试用例模板 | AI从需求描述提取可测试的验收条件 | 无(规划阶段) |
| **development** | TDD循环: 测试先行→实现→验证 | AI生成单元测试→编写代码→运行验证 | 子任务验证命令全部通过 |
| **uat** | 执行集成/系统/验收测试 | AI执行测试套件+报告分析 | 测试通过率≥95% |
| **prerelease** | 回归测试 + 冒烟测试 | AI运行全量回归+生成发布质量报告 | 回归100%通过 + 无P0/P1缺陷 |

### 2.3 TDD 与 Agent 执行的融合 (PIV-TDD Loop)

```
┌─────────────────────────────────────────────────────────────────┐
│                  Agent TDD 执行循环 (per SubTask)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. PLAN (规划)                                                   │
│     ├── 解析 SubTask.acceptance[] → 验收条件列表                   │
│     ├── 解析 SubTask.verifyCommands[] → 预定义验证命令              │
│     └── 生成测试执行计划 (哪些测试类/函数需要创建)                   │
│                                                                   │
│  2. TEST-FIRST (测试先行)                                         │
│     ├── Agent 编写测试用例 (基于验收条件)                           │
│     ├── 运行测试 → 确认测试失败(RED) → 证明测试有效                │
│     └── 若测试本身有问题 → 修正测试                                │
│                                                                   │
│  3. IMPLEMENT (实现)                                              │
│     ├── Agent 编写最小化实现代码                                   │
│     ├── 运行测试 → 检查是否通过(GREEN)                            │
│     └── 未通过 → 修正实现 → 重新运行(循环)                        │
│                                                                   │
│  4. VALIDATE (验证)                                               │
│     ├── 运行 verifyCommands[] → 全部通过?                         │
│     ├── 运行项目级测试套件(回归) → 无新增失败?                     │
│     ├── 静态分析(lint/typecheck) → 无错误?                        │
│     └── 全部通过 → 任务标记 done                                   │
│         任何失败 → 记录失败详情 → 修正循环(最多N次)                 │
│                                                                   │
│  5. REPORT (报告)                                                 │
│     ├── 生成测试覆盖率报告                                         │
│     ├── 记录测试执行历史                                           │
│     └── 更新需求级测试进度                                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 质量门禁 (Quality Gates)

```typescript
interface QualityGate {
  // 门禁名称
  name: string;
  // 触发时机: 阶段转换前
  triggerOn: { from: Stage; to: Stage };
  // 检查项
  checks: QualityCheck[];
  // 策略: 全部通过 / 允许跳过(带警告)
  policy: 'strict' | 'warn';
}

// 预定义质量门禁
const QUALITY_GATES: QualityGate[] = [
  {
    name: 'development_to_uat',
    triggerOn: { from: 'development', to: 'uat' },
    checks: [
      { type: 'all_subtasks_done', desc: '所有子任务状态为done' },
      { type: 'verify_commands_pass', desc: '所有verifyCommands执行通过' },
      { type: 'no_lint_errors', desc: '无lint/typecheck错误' },
      { type: 'unit_test_pass', desc: '单元测试通过率100%' },
      { type: 'test_coverage_min', threshold: 60, desc: '测试覆盖率≥60%' },
    ],
    policy: 'strict',
  },
  {
    name: 'uat_to_prerelease',
    triggerOn: { from: 'uat', to: 'prerelease' },
    checks: [
      { type: 'integration_test_pass', desc: '集成测试通过' },
      { type: 'acceptance_test_pass', threshold: 95, desc: '验收测试通过率≥95%' },
      { type: 'no_open_defects', severity: ['P0', 'P1'], desc: '无P0/P1未解决缺陷' },
      { type: 'performance_baseline', desc: '性能不低于基线' },
    ],
    policy: 'strict',
  },
  {
    name: 'prerelease_to_released',
    triggerOn: { from: 'prerelease', to: 'released' },
    checks: [
      { type: 'regression_pass', desc: '回归测试100%通过' },
      { type: 'smoke_test_pass', desc: '冒烟测试通过' },
      { type: 'quality_report_generated', desc: '质量报告已生成' },
    ],
    policy: 'strict',
  },
];
```

---

## 3. 测试模块功能设计 (M16)

### 3.1 模块定位

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DevFlow v2 功能架构 (增强)                      │
├──────────────────┬──────────────────┬───────────────────────────────┤
│   需求管理域      │   开发执行域      │       运维保障域               │
│                  │                  │                               │
│ M01 需求生命周期  │ M05 AI工作区     │ M09 运维日志排查               │
│ M02 需求分析引擎  │ M06 子任务调度器  │ M10 事件审计中心               │
│ M03 契约管理中心  │ M07 版本与发布    │ M11 健康监控                   │
│ M04 项目配置管理  │ M08 冲突解决      │                               │
│                  │ ┌──────────────┐ │                               │
│                  │ │M16 测试与验证 │ │                               │
│                  │ └──────────────┘ │                               │
├──────────────────┴──────────────────┴───────────────────────────────┤
│                        基础能力层                                      │
│ M12 Agent编排引擎 │ M13 终端服务 │ M14 设置管理 │ M15 通知系统       │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 功能分解

| 子模块 | 功能 | 优先级 |
|--------|------|--------|
| **M16.1 测试计划管理** | 测试用例组织、测试套件定义、覆盖映射 | P0 |
| **M16.2 测试生成引擎** | AI从验收标准自动生成测试代码 | P0 |
| **M16.3 测试执行引擎** | 在Worktree中运行测试套件、收集结果 | P0 |
| **M16.4 质量门禁系统** | 阶段转换前的自动化检查 | P0 |
| **M16.5 缺陷管理** | 测试失败→缺陷记录→跟踪→关闭 | P1 |
| **M16.6 测试报告生成** | 覆盖率报告、趋势图、发布质量评估 | P1 |
| **M16.7 性能测试** | 基线建立、回归对比、阈值告警 | P2 |
| **M16.8 契约测试** | 验证API实现与契约定义一致性 | P2 |

### 3.3 M16.1 — 测试计划管理

#### 功能描述

将需求的验收标准系统化地转化为可执行的测试计划，管理测试用例的生命周期。

#### 测试计划层次

```
需求 (Requirement)
  └── 测试计划 (TestPlan)
       ├── 测试套件 (TestSuite) ← 按项目/模块分组
       │    ├── 测试用例 (TestCase) ← 验收标准→具体测试
       │    │    ├── 测试步骤 (TestStep)
       │    │    └── 预期结果 (Expected)
       │    └── ...
       └── ...
```

#### 测试用例来源

| 来源 | 生成时机 | 方式 |
|------|---------|------|
| 验收标准(acceptance[]) | 分析阶段选择方案时 | AI自动转化 |
| 验证命令(verifyCommands[]) | 子任务创建时 | 直接映射 |
| 契约定义(contracts[]) | 开发阶段 | AI生成契约测试 |
| 手动添加 | 任何时候 | 用户在UI中添加 |
| 回归补充 | 修复bug后 | AI为修复生成回归测试 |

#### 测试用例状态流转

```
draft → ready → running → passed/failed/skipped/blocked
  │                              │
  └── AI生成后默认draft ──────────── failed → defect_linked
                                              │
                                              └── fixed → re_run → passed
```

### 3.4 M16.2 — 测试生成引擎

#### AI 测试生成策略

```typescript
interface TestGenerationRequest {
  // 输入源
  source: 
    | { type: 'acceptance'; criteria: string[] }     // 从验收标准
    | { type: 'contract'; contract: ApiContract }    // 从API契约
    | { type: 'code_change'; diff: string }          // 从代码变更
    | { type: 'defect'; description: string }        // 从缺陷描述
  ;
  
  // 目标项目上下文
  project: string;
  testFramework: TestFramework;     // jest/vitest/pytest/junit/go-test
  language: string;
  
  // 已有测试(避免重复)
  existingTests: string[];
}

interface TestGenerationResult {
  testCases: GeneratedTestCase[];
  testFilePath: string;            // 建议的文件路径
  testCode: string;                // 完整的测试代码
  setupRequired: string[];         // 需要的测试基础设施(mock/fixture)
}
```

#### 测试框架自动检测

```typescript
// 根据项目配置自动选择测试框架
function detectTestFramework(project: Project): TestFramework {
  // 检查 package.json 依赖
  if (has('vitest')) return 'vitest';
  if (has('jest')) return 'jest';
  if (has('@testing-library/react')) return 'testing-library';
  
  // 检查项目语言
  if (project.lang === 'java') return detectJavaTestFramework(); // junit5/testng
  if (project.lang === 'python') return 'pytest';
  if (project.lang === 'go') return 'go-test';
  
  // 默认
  return 'generic-command';  // 使用verifyCommands直接执行
}
```

#### 生成模式

| 模式 | 适用场景 | AI Prompt策略 |
|------|---------|--------------|
| **Unit Test** | 单个函数/方法 | 输入边界值、错误路径、正常路径 |
| **Integration Test** | API端点 | HTTP请求→响应断言、错误码覆盖 |
| **Contract Test** | 跨项目接口 | 请求格式→响应Schema验证 |
| **E2E Scenario** | 用户验收流程 | 步骤序列化→状态断言 |
| **Regression Test** | Bug修复 | 复现步骤→修复后验证→边界条件 |

### 3.5 M16.3 — 测试执行引擎

#### 执行模型

```typescript
interface TestExecutor {
  // 运行单个测试套件
  runSuite(params: {
    project: string;
    suite: TestSuite;
    cwd: string;           // Worktree路径
    timeout: number;       // 超时(ms)
    env?: Record<string, string>;
  }): Promise<TestRunResult>;
  
  // 运行质量门禁检查
  runGateChecks(params: {
    reqId: string;
    gate: QualityGate;
  }): Promise<GateCheckResult>;
  
  // 运行回归测试
  runRegression(params: {
    project: string;
    branch: string;
    scope: 'full' | 'affected';  // 全量 vs 影响范围
  }): Promise<RegressionResult>;
}
```

#### 执行环境

```
测试执行发生在 Worktree 内:

project-worktree/
├── src/                    # 源代码
├── tests/                  # 测试代码
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── .devflow/
    └── test-results/       # 测试结果输出目录
        ├── junit.xml       # 标准报告格式
        ├── coverage/       # 覆盖率数据
        └── screenshots/    # E2E测试截图(如有)
```

#### 执行策略

| 策略 | 触发条件 | 范围 | 超时 |
|------|---------|------|------|
| **即时验证** | SubTask完成时 | verifyCommands + 相关单元测试 | 60秒 |
| **套件执行** | 用户手动/定时 | 指定测试套件 | 5分钟 |
| **门禁检查** | 阶段转换前 | 对应门禁的所有检查项 | 10分钟 |
| **回归测试** | 发布前 | 全量测试 | 30分钟 |
| **影响分析** | 代码变更后 | 仅受影响的测试 | 2分钟 |

#### 影响分析算法

```typescript
// 确定代码变更影响了哪些测试
function analyzeTestImpact(params: {
  changedFiles: string[];
  testIndex: TestDependencyIndex;
}): string[] {
  const affectedTests: Set<string> = new Set();
  
  for (const file of params.changedFiles) {
    // 1. 直接测试: tests/unit/foo.test.ts 测试 src/foo.ts
    const directTest = findDirectTest(file);
    if (directTest) affectedTests.add(directTest);
    
    // 2. 导入链分析: 哪些测试import了变更的文件
    const importers = params.testIndex.getImporters(file);
    importers.forEach(t => affectedTests.add(t));
    
    // 3. 契约关联: 变更了API契约相关代码→契约测试
    const contractTests = findContractTests(file);
    contractTests.forEach(t => affectedTests.add(t));
  }
  
  return Array.from(affectedTests);
}
```

### 3.6 M16.4 — 质量门禁系统

#### 门禁执行流程

```
用户触发阶段转换 (拖拽到目标列)
         │
         ▼
┌──────────────────────────┐
│  查找适用的QualityGate    │
│  (基于 from → to)        │
└──────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│  并行执行所有checks       │
│  (Promise.allSettled)    │
└──────────────────────────┘
         │
         ▼
┌──────────────────────────┐     全部通过
│  汇总结果                 │ ──────────→ 允许转换
│                          │
│  policy === 'strict'     │     有失败
│  && 有未通过项            │ ──────────→ 阻断转换 + 展示失败详情
│                          │
│  policy === 'warn'       │     有失败
│  && 有未通过项            │ ──────────→ 警告 + 允许用户确认跳过
└──────────────────────────┘
```

#### 门禁检查项类型

```typescript
type QualityCheckType =
  // 子任务相关
  | 'all_subtasks_done'           // 所有子任务status=done
  | 'verify_commands_pass'        // 所有verifyCommands执行通过
  
  // 代码质量
  | 'no_lint_errors'              // lint/typecheck无错误
  | 'no_security_issues'          // 安全扫描无高危
  | 'code_review_approved'        // 代码审查通过(可选)
  
  // 测试相关
  | 'unit_test_pass'              // 单元测试100%通过
  | 'integration_test_pass'       // 集成测试通过
  | 'acceptance_test_pass'        // 验收测试通过率≥阈值
  | 'regression_pass'             // 回归测试通过
  | 'smoke_test_pass'             // 冒烟测试通过
  | 'test_coverage_min'           // 覆盖率≥阈值
  | 'performance_baseline'        // 性能不退化
  
  // 流程相关
  | 'no_open_defects'             // 无指定级别未解决缺陷
  | 'quality_report_generated'    // 质量报告已生成
  | 'api_doc_updated'             // API文档已更新
  | 'release_doc_ready';          // 发布文档已就绪
```

#### 门禁结果UI

```
┌───────────────────────────────────────────────────┐
│  质量门禁: development → uat                       │
├───────────────────────────────────────────────────┤
│                                                   │
│  ✓ 所有子任务已完成                    通过        │
│  ✓ 验证命令执行通过 (8/8)              通过        │
│  ✓ 无lint/typecheck错误               通过        │
│  ✓ 单元测试通过 (47/47)               通过        │
│  ✗ 测试覆盖率≥60%                     未通过      │
│    当前: 52%  |  要求: 60%                        │
│    未覆盖文件: src/utils/parser.ts (0%)           │
│               src/services/notify.ts (23%)        │
│                                                   │
├───────────────────────────────────────────────────┤
│  结果: 1项未通过 (策略: strict)                    │
│                                                   │
│  [AI补充测试]  [查看详情]  [强制跳过(需确认)]      │
└───────────────────────────────────────────────────┘
```

### 3.7 M16.5 — 缺陷管理

#### 缺陷数据模型

```typescript
interface Defect {
  id: string;                     // def_<nanoid(8)>
  reqId: string;                  // 关联需求
  title: string;
  description: string;
  severity: 'P0' | 'P1' | 'P2' | 'P3';
  status: DefectStatus;
  
  // 来源
  source: 
    | { type: 'test_failure'; testCaseId: string; runId: string }
    | { type: 'manual'; reporter: string }
    | { type: 'ai_detected'; context: string }
  ;
  
  // 关联
  testCaseId: string | null;      // 关联的测试用例
  subtaskId: string | null;       // 修复此缺陷的子任务
  
  // 时间线
  createdAt: string;
  resolvedAt: string | null;
  verifiedAt: string | null;
}

type DefectStatus = 
  | 'open'        // 新发现
  | 'assigned'    // 已分配(关联子任务)
  | 'fixing'      // 修复中
  | 'resolved'    // 已修复
  | 'verified'    // 已验证(回归测试通过)
  | 'closed'      // 已关闭
  | 'wontfix';    // 不修复
```

#### 缺陷自动发现

```
测试失败
    │
    ▼
自动创建 Defect (source.type = 'test_failure')
    │
    ▼
AI 分析失败原因 → 生成修复建议
    │
    ▼
(可选) 自动创建修复 SubTask
    │
    ▼
修复完成 → 重运行关联测试 → 通过 → Defect状态→verified
```

### 3.8 M16.6 — 测试报告生成

#### 报告类型

| 报告 | 触发时机 | 内容 |
|------|---------|------|
| **子任务验证报告** | SubTask完成 | 验证命令结果+覆盖率 |
| **阶段质量报告** | 阶段转换前 | 门禁检查汇总+风险评估 |
| **UAT测试报告** | UAT阶段结束 | 测试执行汇总+覆盖矩阵 |
| **发布质量报告** | prerelease→released | 完整质量评估+回归结果 |
| **趋势报告** | 按需/周期 | 覆盖率趋势+缺陷趋势+修复速度 |

#### 发布质量报告模板

```markdown
# 发布质量报告

## 概要
- 需求: [REQ-ID] [标题]
- 涉及项目: project-a, project-b
- 发布日期: 2026-05-16
- 质量评级: A / B / C / D

## 测试执行摘要
| 级别 | 总数 | 通过 | 失败 | 跳过 | 通过率 |
|------|------|------|------|------|--------|
| 单元测试 | 127 | 127 | 0 | 0 | 100% |
| 集成测试 | 23 | 22 | 0 | 1 | 95.7% |
| 验收测试 | 8 | 8 | 0 | 0 | 100% |
| 回归测试 | 342 | 342 | 0 | 0 | 100% |

## 代码覆盖率
- 行覆盖率: 78.3% (↑ +5.2% vs 上次发布)
- 分支覆盖率: 64.1% (↑ +3.8%)
- 新增代码覆盖率: 89.2%

## 缺陷统计
- 发现: 3 | 已修复: 3 | 遗留: 0
- P0: 0 | P1: 1(已修复) | P2: 2(已修复)

## 风险评估
- [低] 无未解决缺陷
- [低] 性能基线无退化
- [注意] src/utils/parser.ts 覆盖率偏低(52%)

## 结论
可以发布。
```

### 3.9 M16.7 — 性能测试

#### 性能基线机制

```typescript
interface PerformanceBaseline {
  project: string;
  branch: string;                  // 基线所在分支(通常是master)
  metrics: PerformanceMetric[];
  capturedAt: string;
}

interface PerformanceMetric {
  name: string;                    // 如 "API /orders response time"
  type: 'response_time' | 'throughput' | 'memory' | 'startup';
  value: number;
  unit: string;                    // ms / rps / MB / s
  threshold: number;               // 允许退化的上限
}

// 对比逻辑
function comparePerformance(baseline: PerformanceBaseline, current: PerformanceMetric[]): {
  passed: boolean;
  regressions: Array<{ metric: string; baseline: number; current: number; threshold: number }>;
} {
  // 当前值超过 baseline.value * (1 + threshold/100) 视为退化
}
```

### 3.10 M16.8 — 契约测试

#### 契约验证流程

```
ApiContract 定义
     │
     ▼
┌─────────────────────────────┐
│ AI 生成契约测试代码          │
│ - 请求格式校验              │
│ - 响应Schema校验            │
│ - 错误码覆盖               │
│ - 边界条件(大payload等)     │
└─────────────────────────────┘
     │
     ▼
在 Provider 项目中执行
     │
     ├── 通过 → 契约一致
     └── 失败 → 创建Defect + 通知Contract owner
```

---

## 4. AI 驱动的测试生成机制

### 4.1 测试生成 Prompt 架构

```typescript
function buildTestGenerationPrompt(params: {
  acceptance: string[];           // 验收标准
  sourceCode?: string;            // 被测代码(如有)
  testFramework: string;          // 测试框架
  existingTests?: string;         // 已有测试(避免重复)
  projectConventions?: string;    // 项目测试约定
}): string {
  return `
## 任务: 生成测试用例

### 验收标准
${params.acceptance.map((a, i) => `${i+1}. ${a}`).join('\n')}

### 被测代码
\`\`\`
${params.sourceCode ?? '(尚未实现,仅基于验收标准生成)'}
\`\`\`

### 测试框架
使用 ${params.testFramework}

### 要求
1. 每个验收标准至少一个测试用例
2. 包含正常路径和错误路径
3. 包含边界条件测试
4. 测试应独立可运行,不依赖外部状态
5. 使用 describe/it 结构组织
6. Mock 外部依赖

### 输出格式
直接输出完整的测试文件代码
`;
}
```

### 4.2 测试生成时机

| 时机 | 触发方式 | 输入 | 输出 |
|------|---------|------|------|
| 分析完成选择方案 | 自动 | acceptance[] | 验收测试模板(draft) |
| SubTask开始前 | 自动(TDD模式) | task.acceptance + task.prompt | 单元测试代码 |
| Agent编写完代码 | 自动 | 代码diff + 验收标准 | 补充测试用例 |
| 契约声明时 | 自动 | ApiContract/MqContract | 契约测试代码 |
| 缺陷修复后 | 自动 | defect.description + fix.diff | 回归测试用例 |

### 4.3 TDD 子任务执行增强

对现有 SubTask 执行流程的增强:

```typescript
// 增强后的 TaskExecutor
class TDDTaskExecutor extends TaskExecutor {
  
  async start(task: SubTask): Promise<void> {
    const cwd = await resolveTaskCwd(task);
    const testFramework = detectTestFramework(task.project);
    
    // ===== Phase 1: 生成测试 =====
    const testGenPrompt = buildTestGenerationPrompt({
      acceptance: task.acceptance,
      testFramework,
      projectConventions: await getTestConventions(task.project),
    });
    
    // Agent 先写测试
    const testSession = await createSession(task, 'test-generation');
    await agentManager.run(testSession, testGenPrompt, cwd);
    
    // 确认测试存在且能运行(应该失败,因为实现还没写)
    const redResult = await runTests(cwd, testFramework, 'red-check');
    if (redResult.allPassed) {
      // 测试全通过说明测试无效(没有测到新功能)
      emit('warning', '测试未检测到缺失实现,可能测试无效');
    }
    
    // ===== Phase 2: 实现代码 =====
    const implPrompt = buildImplementationPrompt(task, {
      testsToPass: redResult.failedTests,
      contracts: await getRelevantContracts(task),
    });
    
    const implSession = await getOrCreateSession(task);
    await agentManager.run(implSession, implPrompt, cwd);
    
    // ===== Phase 3: 验证 =====
    const greenResult = await runTests(cwd, testFramework, 'green-check');
    
    if (!greenResult.allPassed) {
      // 修正循环(最多3次)
      for (let retry = 0; retry < 3 && !greenResult.allPassed; retry++) {
        const fixPrompt = buildFixPrompt(greenResult.failures);
        await agentManager.run(implSession, fixPrompt, cwd);
        greenResult = await runTests(cwd, testFramework, `fix-${retry}`);
      }
    }
    
    // ===== Phase 4: 全面验证 =====
    await runVerifyCommands(task.verifyCommands, cwd);
    await runLintCheck(cwd, task.project);
    await runRegressionTests(cwd, task.project, 'affected');
    
    // ===== Phase 5: 报告 =====
    const coverage = await collectCoverage(cwd, testFramework);
    await recordTestResults(task, { greenResult, coverage });
  }
}
```

### 4.4 测试修复反馈循环

```
测试失败
    │
    ▼
┌─────────────────────────────────┐
│ AI 分析失败原因                   │
│ - 解析错误信息                   │
│ - 比对预期 vs 实际               │
│ - 定位问题代码                   │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│ 判断修复方向                     │
│                                 │
│ A. 实现错误 → 修改源代码         │
│ B. 测试过时 → 更新测试预期       │
│ C. 环境问题 → 调整测试配置       │
│ D. 设计缺陷 → 上报需人工决策     │
└─────────────────────────────────┘
    │
    ▼
Agent 执行修复 → 重新运行测试
    │
    ├── 通过 → 继续
    └── 失败 → 循环(最多N次) → 上报人工
```

---

## 5. 测试执行引擎

### 5.1 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Test Execution Engine                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ TestRunner   │    │ ResultParser │    │ CoverageCollector│
│  │ (命令执行)   │    │ (结果解析)   │    │ (覆盖率收集) │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                    │           │
│         ▼                   ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Framework Adapters                       │    │
│  ├──────┬────────┬────────┬────────┬────────┬─────────┤    │
│  │vitest│  jest  │ pytest │ junit  │go test │ generic │    │
│  └──────┴────────┴────────┴────────┴────────┴─────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 框架适配器

```typescript
interface TestFrameworkAdapter {
  id: string;
  
  // 检测项目是否使用此框架
  detect(projectPath: string): boolean;
  
  // 构建运行命令
  buildRunCommand(params: {
    scope?: string;          // 指定文件/目录
    filter?: string;         // 测试名过滤
    coverage?: boolean;      // 是否收集覆盖率
    reporter?: string;       // 输出格式
  }): string;
  
  // 解析结果
  parseResult(output: string, exitCode: number): TestRunResult;
  
  // 解析覆盖率
  parseCoverage(coverageDir: string): CoverageReport;
}

// 示例: Vitest适配器
const vitestAdapter: TestFrameworkAdapter = {
  id: 'vitest',
  detect: (path) => existsSync(join(path, 'vitest.config.ts')),
  buildRunCommand: ({ scope, coverage }) => {
    let cmd = 'npx vitest run --reporter=json';
    if (scope) cmd += ` ${scope}`;
    if (coverage) cmd += ' --coverage --coverage.reporter=json';
    return cmd;
  },
  parseResult: (output, exitCode) => {
    const json = JSON.parse(output);
    return {
      total: json.numTotalTests,
      passed: json.numPassedTests,
      failed: json.numFailedTests,
      skipped: json.numPendingTests,
      duration: json.testResults.reduce((s, t) => s + t.perfStats.runtime, 0),
      failures: json.testResults
        .filter(t => t.status === 'failed')
        .flatMap(t => t.assertionResults.filter(a => a.status === 'failed')),
    };
  },
  parseCoverage: (dir) => { /* 解析coverage-final.json */ },
};
```

### 5.3 通用命令执行 (无框架时)

当项目没有标准测试框架时，使用 `verifyCommands[]` 直接执行:

```typescript
async function runVerifyCommands(
  commands: string[],
  cwd: string
): Promise<VerifyResult> {
  const results: CommandResult[] = [];
  
  for (const cmd of commands) {
    // 安全检查(复用logCommandWhitelist逻辑的变体)
    if (!isVerifyCommandSafe(cmd)) {
      results.push({ cmd, exitCode: -1, error: '命令未通过安全检查' });
      continue;
    }
    
    const { stdout, stderr, exitCode } = await exec(cmd, { cwd, timeout: 60_000 });
    results.push({ cmd, stdout, stderr, exitCode });
  }
  
  return {
    allPassed: results.every(r => r.exitCode === 0),
    results,
  };
}
```

### 5.4 测试结果标准化

```typescript
interface TestRunResult {
  // 统计
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;           // ms
  
  // 详情
  suites: TestSuiteResult[];
  failures: TestFailure[];
  
  // 覆盖率(可选)
  coverage?: CoverageReport;
}

interface TestFailure {
  testName: string;
  suiteName: string;
  message: string;            // 断言错误消息
  expected?: string;
  actual?: string;
  stack?: string;             // 调用栈
  file?: string;              // 测试文件路径
  line?: number;
}

interface CoverageReport {
  lines: { total: number; covered: number; percentage: number };
  branches: { total: number; covered: number; percentage: number };
  functions: { total: number; covered: number; percentage: number };
  uncoveredFiles: Array<{ path: string; linePercentage: number }>;
}
```

---

## 6. 测试结果管理与可视化

### 6.1 测试面板设计

在工作区(ChatWorkspace)中增加测试面板 Tab:

```
┌─────────────────────────────────────────────────────────┐
│  [对话] [变更] [终端] [上下文] [测试]                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  测试进度: ████████████░░ 78% (47/60 通过)              │
│                                                         │
│  ┌─ 单元测试 ─────────────────────────────────────┐    │
│  │ ✓ user.service.test.ts          12/12  230ms   │    │
│  │ ✓ order.controller.test.ts       8/8   156ms   │    │
│  │ ✗ payment.service.test.ts        5/7   89ms    │    │
│  │   └─ ✗ should handle timeout     Expected...   │    │
│  │   └─ ✗ should retry on 503      Received...   │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─ 集成测试 ─────────────────────────────────────┐    │
│  │ ◉ POST /api/orders              running...     │    │
│  │ ○ GET /api/orders/:id           pending         │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
│  覆盖率: Lines 78% | Branches 64% | Functions 82%      │
│                                                         │
│  [运行全部] [运行失败项] [生成报告] [AI修复失败]         │
└─────────────────────────────────────────────────────────┘
```

### 6.2 质量仪表板 (看板视图增强)

在看板顶部增加质量概览:

```
┌────────────────────────────────────────────────────────────┐
│  质量概览                                                    │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │测试通过率 │ │  覆盖率   │ │  缺陷数   │ │ 门禁状态  │      │
│  │  94.2%   │ │  72.1%   │ │  3 open  │ │  2/3 ✓   │      │
│  │  ↑ 2.1%  │ │  ↑ 4.3%  │ │  ↓ 1    │ │          │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└────────────────────────────────────────────────────────────┘
```

### 6.3 测试历史趋势

```typescript
interface TestTrend {
  date: string;
  totalTests: number;
  passRate: number;
  coverageLines: number;
  coverageBranches: number;
  openDefects: number;
  avgFixTime: number;         // 缺陷平均修复时间(小时)
}
```

---

## 7. 与现有模块的集成规范

### 7.1 与 M02 需求分析引擎的集成

| 集成点 | 方向 | 数据流 |
|--------|------|--------|
| 验收标准提取 | M02→M16 | AnalysisOutput.acceptance[] → TestCase(draft) |
| 验证命令生成 | M02→M16 | TaskProposal.verifyCommands[] → VerifyCommand |
| 测试计划草案 | M02→M16 | 选择方案时自动创建TestPlan |

### 7.2 与 M06 子任务调度器的集成

| 集成点 | 方向 | 数据流 |
|--------|------|--------|
| TDD执行模式 | M16→M06 | TaskExecutor增强为TDDTaskExecutor |
| 任务完成验证 | M06→M16 | SubTask.done前调用验证引擎 |
| 测试类型子任务 | M06=M16 | SubTask.type='test'专用于编写测试 |
| 失败→缺陷 | M16→M06 | 测试失败自动创建修复SubTask |

### 7.3 与 M07 版本与发布的集成

| 集成点 | 方向 | 数据流 |
|--------|------|--------|
| 发布前回归 | M07→M16 | release流程启动前触发回归测试 |
| 质量报告 | M16→M07 | 发布文档中包含质量报告 |
| 门禁阻断 | M16→M07 | 回归不通过时阻止发布继续 |

### 7.4 与 M03 契约管理的集成

| 集成点 | 方向 | 数据流 |
|--------|------|--------|
| 契约测试生成 | M03→M16 | ApiContract → 契约测试代码 |
| 一致性验证 | M16→M03 | 契约测试失败 → 标记契约异常 |

### 7.5 与 M01 需求生命周期的集成

| 集成点 | 方向 | 数据流 |
|--------|------|--------|
| 质量门禁 | M16→M01 | 阶段转换前检查 |
| 需求详情增强 | M16→M01 | 需求卡片显示测试进度 |
| 强制UAT | M16→M01 | 有测试失败时不允许跳过UAT |

### 7.6 集成架构图

```
M02(分析) ──acceptance[]──→ M16(测试) ──gate_check──→ M01(需求)
                              │     ↑                    │
M06(子任务) ──verify──→      │     │                    │
    ↑                         │     │                    ▼
    └── create_fix_task ──────┘     │              M07(发布)
                                    │                    │
M03(契约) ──contract──→             │                    │
                                    └── regression ──────┘
```

---

## 8. 数据模型设计

### 8.1 新增数据表

```sql
-- 测试计划表
CREATE TABLE test_plans (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL REFERENCES requirements(id),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',        -- draft|active|completed|archived
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 测试套件表
CREATE TABLE test_suites (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES test_plans(id),
  project TEXT,                        -- 关联项目
  name TEXT NOT NULL,
  type TEXT NOT NULL,                  -- unit|integration|e2e|contract|performance
  framework TEXT,                      -- vitest|jest|pytest|junit|go-test|generic
  run_command TEXT,                    -- 执行命令
  created_at TEXT NOT NULL
);

-- 测试用例表
CREATE TABLE test_cases (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES test_suites(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',         -- draft|ready|passed|failed|skipped|blocked
  priority TEXT DEFAULT 'medium',      -- P0|P1|P2|P3
  
  -- 来源追踪
  source_type TEXT,                    -- acceptance|contract|manual|ai_generated|regression
  source_ref TEXT,                     -- 来源引用(验收标准序号/契约ID等)
  
  -- 测试内容
  test_file TEXT,                      -- 测试文件路径(相对项目根)
  test_function TEXT,                  -- 测试函数名
  steps TEXT DEFAULT '[]',             -- JSON: 测试步骤
  expected TEXT,                       -- 预期结果描述
  
  -- 自动化状态
  automated INTEGER DEFAULT 0,         -- 是否已自动化
  last_run_at TEXT,
  last_run_result TEXT,                -- passed|failed|error
  
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 测试运行记录表
CREATE TABLE test_runs (
  id TEXT PRIMARY KEY,
  req_id TEXT,
  suite_id TEXT REFERENCES test_suites(id),
  project TEXT,
  
  -- 触发信息
  trigger_type TEXT NOT NULL,          -- manual|subtask_verify|gate_check|regression|scheduled
  trigger_ref TEXT,                    -- 触发来源(subtask_id/gate_name等)
  
  -- 执行环境
  cwd TEXT,                            -- 执行目录
  branch TEXT,                         -- 分支
  commit_hash TEXT,                    -- 提交哈希
  
  -- 结果
  status TEXT DEFAULT 'running',       -- running|passed|failed|error|cancelled
  total INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  skipped INTEGER DEFAULT 0,
  duration INTEGER DEFAULT 0,          -- ms
  
  -- 覆盖率
  coverage_lines REAL,
  coverage_branches REAL,
  coverage_functions REAL,
  
  -- 详细结果
  failures TEXT DEFAULT '[]',          -- JSON: TestFailure[]
  raw_output TEXT,                     -- 原始输出(截断)
  
  created_at TEXT NOT NULL,
  completed_at TEXT
);

-- 缺陷表
CREATE TABLE defects (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL REFERENCES requirements(id),
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'P2',          -- P0|P1|P2|P3
  status TEXT DEFAULT 'open',          -- open|assigned|fixing|resolved|verified|closed|wontfix
  
  -- 来源
  source_type TEXT,                    -- test_failure|manual|ai_detected
  test_case_id TEXT,
  test_run_id TEXT,
  
  -- 修复关联
  fix_subtask_id TEXT,
  fix_commit TEXT,
  
  -- 时间线
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  verified_at TEXT
);

-- 质量门禁执行记录
CREATE TABLE gate_checks (
  id TEXT PRIMARY KEY,
  req_id TEXT NOT NULL REFERENCES requirements(id),
  gate_name TEXT NOT NULL,             -- development_to_uat等
  
  -- 结果
  status TEXT DEFAULT 'running',       -- running|passed|failed|skipped
  checks TEXT DEFAULT '[]',            -- JSON: 各检查项结果
  
  -- 操作
  skipped_by TEXT,                     -- 如果被强制跳过,记录原因
  
  created_at TEXT NOT NULL,
  completed_at TEXT
);

-- 性能基线表
CREATE TABLE performance_baselines (
  id TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  branch TEXT NOT NULL,
  metrics TEXT NOT NULL,               -- JSON: PerformanceMetric[]
  captured_at TEXT NOT NULL
);
```

### 8.2 现有表增强

```sql
-- requirements 表增加字段
ALTER TABLE requirements ADD COLUMN test_plan_id TEXT;
ALTER TABLE requirements ADD COLUMN quality_score TEXT;  -- A/B/C/D

-- sub_tasks 表增加字段
ALTER TABLE sub_tasks ADD COLUMN tdd_mode INTEGER DEFAULT 0;      -- 是否启用TDD模式
ALTER TABLE sub_tasks ADD COLUMN test_run_id TEXT;                 -- 最近一次验证运行
ALTER TABLE sub_tasks ADD COLUMN verify_status TEXT;               -- passed|failed|pending

-- 需要在 bootstrap() 中添加的 ALTER TABLE shims
```

---

## 9. API 设计

### 9.1 测试计划API

```
# 测试计划 CRUD
GET    /api/test-plans?reqId=              列表
POST   /api/test-plans                     创建
GET    /api/test-plans/:id                 详情(含suites和cases)
PATCH  /api/test-plans/:id                 更新
DELETE /api/test-plans/:id                 删除

# 测试套件
POST   /api/test-suites                    创建
PATCH  /api/test-suites/:id                更新
DELETE /api/test-suites/:id                删除

# 测试用例
GET    /api/test-cases?suiteId=            列表
POST   /api/test-cases                     创建
PATCH  /api/test-cases/:id                 更新
DELETE /api/test-cases/:id                 删除
POST   /api/test-cases/generate            AI生成测试用例
```

### 9.2 测试执行API

```
# 执行测试
POST   /api/test-runs/execute              执行测试套件(SSE响应)
POST   /api/test-runs/verify-task          执行子任务验证
POST   /api/test-runs/regression           执行回归测试(SSE响应)
GET    /api/test-runs?reqId=&suiteId=      运行历史
GET    /api/test-runs/:id                  运行详情

# 质量门禁
POST   /api/gate-checks/run                执行门禁检查
GET    /api/gate-checks?reqId=             门禁历史
GET    /api/gate-checks/:id                门禁详情
POST   /api/gate-checks/:id/skip           强制跳过(需确认)
```

### 9.3 缺陷管理API

```
GET    /api/defects?reqId=&status=         列表
POST   /api/defects                        创建
PATCH  /api/defects/:id                    更新状态
POST   /api/defects/:id/create-fix-task    创建修复子任务
```

### 9.4 测试报告API

```
GET    /api/test-reports/summary?reqId=    需求测试摘要
GET    /api/test-reports/coverage?project= 项目覆盖率
GET    /api/test-reports/trend?project=    趋势数据
POST   /api/test-reports/release           生成发布质量报告
```

### 9.5 SSE 事件定义

```typescript
// 测试执行SSE事件
type TestStreamEvent =
  | { type: 'run_start'; runId: string; total: number }
  | { type: 'case_start'; caseName: string }
  | { type: 'case_result'; caseName: string; result: 'passed' | 'failed' | 'skipped'; duration: number }
  | { type: 'case_failure'; caseName: string; failure: TestFailure }
  | { type: 'coverage'; coverage: CoverageReport }
  | { type: 'run_complete'; summary: TestRunResult }
  | { type: 'error'; message: string };
```

---

## 10. 技术实现方案

### 10.1 测试执行安全性

```typescript
// 测试命令执行的安全约束
const TEST_EXECUTION_POLICY = {
  // 允许的测试命令前缀
  allowedPrefixes: [
    'npx vitest', 'npx jest', 'npm test', 'npm run test',
    'pytest', 'python -m pytest',
    'go test', 'cargo test',
    'mvn test', 'gradle test',
  ],
  
  // 超时限制
  timeouts: {
    unit: 60_000,           // 60秒
    integration: 300_000,   // 5分钟
    e2e: 600_000,           // 10分钟
    regression: 1_800_000,  // 30分钟
  },
  
  // 输出限制
  maxOutputSize: 5 * 1024 * 1024,  // 5MB
  
  // 并发限制
  maxConcurrentRuns: 3,
};
```

### 10.2 覆盖率收集

```typescript
// 跨框架的覆盖率收集策略
async function collectCoverage(
  cwd: string,
  framework: TestFramework
): Promise<CoverageReport | null> {
  
  const coverageDir = join(cwd, '.devflow', 'coverage');
  
  // 不同框架的覆盖率文件位置
  const coverageFiles = {
    vitest: join(cwd, 'coverage', 'coverage-final.json'),
    jest: join(cwd, 'coverage', 'coverage-final.json'),
    pytest: join(cwd, 'htmlcov', 'coverage.json'),
    jacoco: join(cwd, 'target', 'site', 'jacoco', 'jacoco.xml'),
  };
  
  const file = coverageFiles[framework];
  if (!file || !existsSync(file)) return null;
  
  return parseCoverageFile(file, framework);
}
```

### 10.3 测试结果持久化策略

```typescript
// 测试结果保留策略
const RETENTION_POLICY = {
  // 最近运行: 保留所有详情
  recentRuns: 50,
  
  // 历史运行: 仅保留摘要(不保留raw_output)
  historyRuns: 500,
  
  // 自动清理: 超过90天的失败详情
  failureRetentionDays: 90,
  
  // 覆盖率趋势: 每天一个数据点
  coverageTrendPoints: 365,
};
```

### 10.4 与Agent执行的集成点

```typescript
// 在 SubTask 执行流程中注入测试验证
// 修改 server/src/routes/subtasks.ts 的完成逻辑

async function onSubTaskComplete(task: SubTask): Promise<void> {
  // 原有逻辑: 标记 status = 'done'
  
  // 新增: 测试验证
  if (task.verifyCommands.length > 0 || task.tddMode) {
    const verifyResult = await testExecutor.runVerification(task);
    
    if (!verifyResult.allPassed) {
      // 不标记done,保持running,通知前端
      task.verifyStatus = 'failed';
      task.errorMessage = formatVerificationFailure(verifyResult);
      
      // 记录事件
      recordEvent({
        reqId: task.reqId,
        type: 'subtask_verify_failed',
        payload: { taskId: task.id, failures: verifyResult.failures },
      });
      
      return; // 不完成任务
    }
    
    task.verifyStatus = 'passed';
    task.testRunId = verifyResult.runId;
  }
  
  // 原有逻辑继续: 标记 done, 触发后续任务就绪
  task.status = 'done';
}
```

### 10.5 门禁与阶段转换的集成

```typescript
// 修改 server/src/routes/requirements.ts 的阶段转换逻辑

async function handleStageTransition(
  req: Requirement,
  targetStage: Stage
): Promise<{ allowed: boolean; gateResult?: GateCheckResult }> {
  
  // 查找适用的门禁
  const gate = QUALITY_GATES.find(g => 
    g.triggerOn.from === req.stage && g.triggerOn.to === targetStage
  );
  
  if (!gate) return { allowed: true }; // 无门禁,直接允许
  
  // 执行门禁检查
  const gateResult = await gateChecker.run(req.id, gate);
  
  // 记录门禁执行
  await db.insert(schema.gateChecks).values({
    id: 'gc_' + nanoid(8),
    reqId: req.id,
    gateName: gate.name,
    status: gateResult.allPassed ? 'passed' : 'failed',
    checks: JSON.stringify(gateResult.checks),
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  }).run();
  
  if (gateResult.allPassed) {
    return { allowed: true, gateResult };
  }
  
  if (gate.policy === 'warn') {
    // 警告模式: 返回结果但允许用户确认跳过
    return { allowed: false, gateResult }; // 前端显示警告+跳过按钮
  }
  
  // 严格模式: 阻断
  return { allowed: false, gateResult };
}
```

---

## 11. 任务分解与开发路线

### 11.1 开发里程碑

测试模块作为 **M2.5** 插入到现有路线图中(在Agent编排之后、发布之前):

```
M2 Agent Orchestra → M2.5 Test & Verify → M3 Release Automation
```

### 11.2 任务分解

| 任务ID | 任务 | 依赖 | 类型 | 优先级 |
|--------|------|------|------|--------|
| **T01** | 测试数据模型设计 + DB schema + bootstrap shims | M0-05 | 后端 | P0 |
| **T02** | 测试计划/套件/用例 CRUD 路由 | T01 | 后端 | P0 |
| **T03** | 测试框架适配器(vitest/jest/pytest/generic) | T01 | 后端 | P0 |
| **T04** | 测试执行引擎(命令运行+结果解析+覆盖率) | T03 | 后端 | P0 |
| **T05** | 质量门禁系统(门禁定义+执行+阻断) | T04,M1-01 | 后端 | P0 |
| **T06** | SubTask验证集成(完成时自动验证) | T04,M2-14 | 后端 | P0 |
| **T07** | AI测试生成Prompt构建 + 执行集成 | T02,M2-07 | 后端 | P0 |
| **T08** | TDDTaskExecutor(PIV循环实现) | T07,T04 | 后端 | P1 |
| **T09** | 测试面板UI(结果展示+进度) | T04 | 前端 | P0 |
| **T10** | 质量门禁UI(阻断提示+详情+跳过确认) | T05 | 前端 | P0 |
| **T11** | 缺陷管理CRUD + 自动创建逻辑 | T04 | 后端 | P1 |
| **T12** | 缺陷管理UI(列表+详情+关联) | T11 | 前端 | P1 |
| **T13** | 测试报告生成器(质量报告模板) | T04,T11 | 后端 | P1 |
| **T14** | 质量仪表板UI(覆盖率趋势+统计卡片) | T13 | 前端 | P1 |
| **T15** | 契约测试生成(从ApiContract→测试代码) | T07,M2-16 | 后端 | P2 |
| **T16** | 性能基线管理(采集+对比+告警) | T04 | 后端 | P2 |
| **T17** | 回归测试影响分析(变更→受影响测试) | T04 | 后端 | P2 |
| **T18** | 测试执行SSE流(实时结果推送) | T04 | 全栈 | P1 |
| **T19** | 阶段转换路由增强(门禁检查注入) | T05 | 后端 | P0 |
| **T20** | 发布质量报告集成(发布流程增强) | T13,M3-01 | 后端 | P1 |

### 11.3 任务依赖图

```
T01 → T02 → T07 → T08 (TDD循环完整可用)
 │              │
 └→ T03 → T04 → T05 → T06 (验证流程完整可用)
              │    │
              │    └→ T19 (阶段转换增强)
              │    └→ T10 (门禁UI)
              │
              └→ T09 (测试面板)
              └→ T11 → T12 (缺陷管理)
              └→ T13 → T14 (报告和仪表板)
              └→ T18 (SSE流)
```

### 11.4 关键路径

```
T01 → T03 → T04 → T05 → T19 (阶段转换门禁可用 - 最小可行产品)
```

### 11.5 验收标准

#### P0 功能验收

- [ ] 子任务完成时 verifyCommands 自动执行,失败时阻止标记 done
- [ ] development→uat 转换时门禁检查运行,单元测试未通过时阻断
- [ ] uat→prerelease 转换时门禁检查运行,有P0/P1缺陷时阻断
- [ ] AI 能从 acceptance[] 生成可运行的测试代码
- [ ] 测试运行结果持久化,可查看历史

#### P1 功能验收

- [ ] TDD模式下 Agent 先写测试再实现,形成 RED→GREEN 循环
- [ ] 测试失败自动创建缺陷记录
- [ ] 缺陷修复后回归测试自动验证
- [ ] 质量报告包含覆盖率、通过率、缺陷统计
- [ ] 发布前生成完整的发布质量报告

#### P2 功能验收

- [ ] 契约测试从 ApiContract 自动生成并验证
- [ ] 性能基线建立和退化检测工作正常
- [ ] 影响分析能正确识别受变更影响的测试

---

## 附录

### A. 测试金字塔在 DevFlow 中的映射

```
                /\
               /  \         验收测试 (acceptance[])
              /    \        → UAT阶段执行
             /──────\       → 阶段门禁检查
            /        \
           /          \     集成测试 (API/契约)
          /            \    → 开发完成后执行
         /──────────────\   → 契约一致性验证
        /                \
       /                  \ 单元测试 (verifyCommands + AI生成)
      /                    \→ SubTask完成时即时运行
     /                      \→ TDD循环中持续运行
    /────────────────────────\
```

### B. 与竞品的测试能力对比

| 能力 | DevFlow v2 | Symphony | GitLab CI | Jenkins+Jira |
|------|-----------|----------|-----------|-------------|
| AI测试生成 | 内置(多框架) | 无 | 无 | 无 |
| TDD循环自动化 | Agent驱动 | 无 | 无 | 无 |
| 质量门禁 | 阶段转换集成 | 无 | MR Level | Pipeline Level |
| 缺陷自动创建 | 测试失败→缺陷 | 无 | Issue创建 | 手动 |
| 覆盖率追踪 | 内置持久化 | 无 | 需配置 | 需插件 |
| 契约测试 | 内置 | 无 | 需自建 | 需自建 |
| 本地执行 | Worktree内 | 沙箱 | Runner | Agent |

### C. 术语表

| 术语 | 定义 |
|------|------|
| **TDD** | Test-Driven Development,测试驱动开发 |
| **PIV Loop** | Plan-Implement-Validate,规划-实现-验证循环 |
| **Quality Gate** | 质量门禁,阶段转换前的自动化检查点 |
| **Red-Green-Refactor** | TDD核心循环:写失败测试→写实现通过→重构 |
| **Contract Test** | 契约测试,验证API实现与接口定义一致 |
| **Regression Test** | 回归测试,确认修改未引入新问题 |
| **Coverage** | 代码覆盖率,被测试执行到的代码比例 |
| **Smoke Test** | 冒烟测试,快速验证核心功能是否正常 |
| **Impact Analysis** | 影响分析,确定代码变更影响了哪些测试 |

---

*本文档定义了 DevFlow v2 测试与质量保障模块的完整规格。该模块将测试深度嵌入到开发全生命周期中，确保 AI 代理生成的代码始终经过可靠验证。*
