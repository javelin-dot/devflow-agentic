export type Stage = 'backlog' | 'analyzing' | 'development' | 'uat' | 'prerelease' | 'released';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type RequirementKind = 'standard' | 'no_code';

export const STAGE_TRANSITIONS: Record<Stage, Stage[]> = {
  backlog: ['analyzing', 'development'],
  analyzing: ['development', 'backlog'],
  development: ['uat', 'prerelease', 'backlog'],
  uat: ['prerelease', 'development'],
  prerelease: ['released', 'uat'],
  released: [],
};

export const SPEC_EDIT_STAGES: Stage[] = ['backlog', 'analyzing'];

export function canTransition(from: Stage, to: Stage): boolean {
  return STAGE_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface RequirementProjectLink {
  project: string;
  devBranch: string | null;
  uatBranch: string | null;
  isPrimary: boolean;
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  kind: RequirementKind;
  stage: Stage;
  priority: Priority;
  workspace: string | null;
  tags: string[];
  plannedReleaseDate: string | null;
  releasedAt: string | null;
  archivedAt: string | null;
  analysisChosenId: string | null;
  profileId: string | null;
  notes: string | null;
  projects: RequirementProjectLink[];
  apiDoc: unknown | null;
  releaseDoc: unknown | null;
  attachments: string[];
  createdAt: string;
}

export const STAGE_LABELS: Record<Stage, string> = {
  backlog: 'Backlog',
  analyzing: 'Analyzing',
  development: 'Development',
  uat: 'UAT',
  prerelease: 'Pre-release',
  released: 'Released',
};

// ===== M1 新增类型 =====

export interface Project {
  name: string;
  path: string;
  lang: string | null;
  branch: string;           // defaultBranch
  branchPrefix: string | null;
  mergeStrategy: 'merge' | 'squash' | 'rebase';
  autoPush: boolean;
  services: string[];
  jenkinsTemplateId: string | null;
  dataSourceId: string | null;
  logDirTemplate: string | null;
  logGlobTemplate: string | null;
  rootDir: string | null;
  sortOrder: number;
}

export interface ChatSession {
  id: string;
  reqId: string;
  title: string;
  status: 'active' | 'archived';
  agent: string;
  agentLocked: boolean;
  stageSnapshot: Stage | null;
  profileId: string | null;
  cwd: string | null;
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  entryType: string | null;
  action: unknown | null;    // ActionType JSON
  status: 'pending' | 'running' | 'success' | 'error' | null;
  createdAt: string;
}

export type NormalizedEntryType =
  | 'user_message'
  | 'assistant_message'
  | 'thinking'
  | 'tool_use'
  | 'system'
  | 'error'
  | 'todo_update'
  | 'plan'
  | 'token_usage';

export interface NormalizedEntry {
  id: string;
  sessionId: string;
  type: NormalizedEntryType;
  content: string;
  action: {
    type: string;
    command?: string;
    path?: string;
    status?: string;
    [key: string]: unknown;
  } | null;
  status: 'pending' | 'running' | 'success' | 'error' | null;
  createdAt: string;
}

export type AgentStreamEvent =
  | { type: 'entry'; entry: NormalizedEntry }
  | { type: 'patch'; entryId: string; patch: Partial<NormalizedEntry> }
  | { type: 'session'; agentSessionId: string }
  | { type: 'exit'; code: number | null }
  | { type: 'error'; message: string };

// M2 types
export interface ProposedTask {
  title: string;
  prompt: string;
  project: string | null;
  type: string;
  wave: number;
  taskDependsOn: string[];
  acceptance: string[];
  verifyCommands: string[];
  risk: string | null;
}

export interface AnalysisOutput {
  summary: string;
  proposedTasks: ProposedTask[];
}

export interface RequirementAnalysis {
  id: string;
  reqId: string;
  agent: string;
  status: 'running' | 'awaiting' | 'done' | 'error' | 'cancelled';
  prompt: string;
  output: AnalysisOutput | null;
  errorMessage: string | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  reqId: string;
  name: string;
  description: string;
  schemaType: 'json' | 'openapi' | 'grpc';
  schemaContent: string;
  status: 'draft' | 'stable' | 'deprecated';
  declaredByTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubTask {
  id: string;
  reqId: string;
  analysisId: string | null;
  title: string;
  prompt: string;
  project: string | null;
  type: string;
  wave: number;
  taskDependsOn: string[];
  acceptance: string[];
  verifyCommands: string[];
  risk: string | null;
  status: 'pending' | 'ready' | 'running' | 'done' | 'error' | 'cancelled';
  sessionId: string | null;
  agent: string | null;
  errorMessage: string | null;
  notes: string | null;
  ordering: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// ===== M3 types =====

export type ReleaseMode = 'mergePublish' | 'release' | 'quickPublish';

export type ReleaseState =
  | 'idle' | 'preparing' | 'merging' | 'paused-conflict'
  | 'pushing' | 'waiting_pr_review' | 'triggering' | 'production_verifying'
  | 'merged_back' | 'done' | 'error' | 'cancelled';

export interface ProjectReleaseStatus {
  project: string;
  state: ReleaseState;
  conflictFiles?: ConflictFile[];
}

export interface ConflictBlock {
  index: number;
  oursLines: string[];
  theirsLines: string[];
  startLine: number;
}

export interface ConflictFile {
  path: string;
  blocks: ConflictBlock[];
}

export interface ReleaseRun {
  id: string;
  reqId: string | null;
  mode: ReleaseMode;
  state: ReleaseState;
  projects: ProjectReleaseStatus[];
  log: string;
  verdict: 'accepted' | null;
  jenkinsBuildUrl: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  prUrl: string | null;
  prStatus: string | null;
  releaseBranch: string | null;
  productionVerifyResult: string | null;
}

export type ReleaseEventType =
  | 'state_change' | 'log' | 'conflict' | 'progress' | 'done' | 'error';

export interface ReleaseEvent {
  type: ReleaseEventType;
  runId: string;
  state?: ReleaseState;
  message?: string;
  conflictFiles?: ConflictFile[];
  project?: string;
}

export interface JenkinsTemplate {
  id: string;
  name: string;
  job: string;
  params: Record<string, string>;
  jenkinsUrl: string;
  createdAt: string;
}

// ===== M4 types =====

export interface LogTarget {
  id: string;
  name: string;
  project: string | null;
  service: string;
  environment: string;
  hosts: string[];
  connectMode: 'direct' | 'jump_global';
  sshUser: string | null;
  sshPort: number;
  sshKeyPath: string | null;
  sshPassword: string | null;
  jumpHost: string | null;
  jumpUser: string | null;
  jumpPort: number;
  logDir: string | null;
  logGlob: string;
  createdAt: string;
}

export type LogStreamEventType = 'thinking' | 'command' | 'result' | 'answer' | 'error' | 'done';

export interface LogStreamEvent {
  type: LogStreamEventType;
  sessionId: string;
  content: string;
  targetId?: string;
  command?: string;
  exitCode?: number;
}

export interface DiagnosisStep {
  type: 'thinking' | 'command' | 'result' | 'answer';
  content: string;
  targetId?: string;
  command?: string;
  exitCode?: number;
  createdAt: string;
}

export interface LogChatSession {
  id: string;
  title: string;
  scopedTargetIds: string[];
  messages: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }>;
  steps: DiagnosisStep[];
  tab: 'trace' | 'conversation' | 'summary' | 'raw' | 'report';
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===== M2.5 types =====

export type TestType = 'smoke' | 'functional' | 'performance' | 'stress' | 'penetration';
export type TestStatus = 'draft' | 'ready' | 'running' | 'passed' | 'failed' | 'skipped';
export type DefectSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type DefectStatus = 'pending_confirm' | 'to_fix' | 'to_regress' | 'closed' | 'wont_fix';
export type WontFixReason = 'data_issue' | 'product_decision' | 'duplicate' | 'cannot_reproduce' | 'other';
export type GateCheckResult = 'pending' | 'passed' | 'failed' | 'skipped';

export interface TestPlan {
  id: string;
  reqId: string;
  title: string;
  description: string;
  status: 'active' | 'archived';
  createdAt: string;
}

export interface TestCase {
  id: string;
  planId: string;
  reqId: string;
  title: string;
  description: string;
  testType: TestType;
  legacyType: string | null;
  command: string;
  expectedExitCode: number;
  status: TestStatus;
  cwd: string | null;
  createdAt: string;
}

export interface TestRun {
  id: string;
  planId: string | null;
  reqId: string | null;
  runType: 'manual' | 'gate' | 'regression' | 'acceptance';
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number | null;
  log: string;
  coverageJson: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface GateCheck {
  id: string;
  reqId: string;
  fromStage: string;
  toStage: string;
  checkType: string;
  result: GateCheckResult;
  detail: string;
  createdAt: string;
}

export interface Defect {
  id: string;
  reqId: string;
  subTaskId: string | null;
  testRunId: string | null;
  title: string;
  description: string;
  severity: DefectSeverity;
  status: DefectStatus;
  resolution: string | null;
  wontFixReason: WontFixReason | null;
  createdAt: string;
  updatedAt: string;
}

export interface DefectStatusHistory {
  id: string;
  defectId: string;
  actor: string;
  fromStatus: DefectStatus | null;
  toStatus: DefectStatus;
  note: string | null;
  createdAt: string;
}

export type TestRunEventType = 'start' | 'case_result' | 'log' | 'done' | 'error';

export interface TestRunEvent {
  type: TestRunEventType;
  runId: string;
  message?: string;
  passed?: number;
  failed?: number;
  total?: number;
  status?: TestRun['status'];
}

export type GateCheckEventType = 'check_start' | 'check_result' | 'done' | 'error';

export interface GateCheckEvent {
  type: GateCheckEventType;
  checkType?: string;
  result?: GateCheckResult;
  detail?: string;
  allPassed?: boolean;
  message?: string;
}

// ===== AI Provider types =====

export interface AIProvider {
  id: string;
  name: string;
  type: 'claude-code' | 'openai-compatible';
  // claude-code only
  cliPath?: string;
  // openai-compatible only
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  isDefault: boolean;
}

// ===== M5 types =====

export interface HealthStatus {
  status: string;
  uptimeSeconds: number;
  dbSizeKb: number;
  tableRowCounts: Record<string, number>;
  agentCount: number;
  version: string;
  nodeVersion: string;
  platform: string;
}

export interface SystemStats {
  byStage: Record<string, number>;
  totalRequirements: number;
  openDefects: number;
  weeklyThroughput: number;
  avgCycleDays: number;
}

// ===== M6 types =====

export type DocumentType = 'requirement_spec' | 'design_spec' | 'test_case' | 'test_report' | 'release_doc';
export type DocumentStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'archived';

export interface Document {
  id: string;
  reqId: string | null;
  type: DocumentType;
  title: string;
  content: string;
  status: DocumentStatus;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DocumentVersion {
  id: string;
  docId: string;
  version: number;
  content: string;
  summary: string | null;
  authorId: string | null;
  authorAgent: string | null;
  createdAt: string;
}

export type DocumentLinkRelation = 'derives_from' | 'tests' | 'implements';

export interface DocumentLink {
  fromDocId: string;
  toDocId: string;
  relation: DocumentLinkRelation;
  createdAt: string;
}

export interface Attachment {
  id: string;
  reqId: string;
  filename: string;
  mime: string | null;
  size: number;
  sha256: string | null;
  uploadedBy: string | null;
  storagePath: string;
  createdAt: string;
}

export type NotificationChannel = 'inapp' | 'webhook' | 'email';
export type NotificationDeliveryStatus = 'pending' | 'delivered' | 'failed';

export interface Notification {
  id: string;
  userId: string | null;
  type: string;
  payload: Record<string, unknown>;
  channel: NotificationChannel;
  readAt: string | null;
  createdAt: string;
  deliveryStatus: NotificationDeliveryStatus;
}

export interface NotificationSubscription {
  id: string;
  userId: string;
  eventType: string;
  channel: NotificationChannel;
  target: string | null;
  createdAt: string;
}

// ===== M8 types =====

export type Role = 'admin' | 'dev' | 'qa' | 'pm' | 'viewer';

export interface User {
  id: string;
  username: string;
  displayName: string | null;
  role: Role;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}
