import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { Requirement, Project, ChatSession, ChatMessage, RequirementAnalysis, SubTask, ReleaseRun, JenkinsTemplate } from '@devflow/shared';

export interface RequirementFilters {
  stage?: string;
  priority?: string;
  archived?: '0' | '1';
}

function buildQuery(filters?: RequirementFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.stage) params.set('stage', filters.stage);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.archived) params.set('archived', filters.archived);
  const q = params.toString();
  return q ? `?${q}` : '';
}

export function useRequirements(filters?: RequirementFilters) {
  return useQuery<Requirement[]>({
    queryKey: ['requirements', filters],
    queryFn: () => apiFetch<Requirement[]>(`/requirements${buildQuery(filters)}`),
  });
}

export function useCreateRequirement() {
  const qc = useQueryClient();
  return useMutation<Requirement, Error, Partial<Requirement> & { title: string }>({
    mutationFn: (body) =>
      apiFetch<Requirement>('/requirements', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requirements'] }),
  });
}

export function usePatchRequirement() {
  const qc = useQueryClient();
  return useMutation<Requirement, Error, { id: string; patch: Partial<Requirement> }>({
    mutationFn: ({ id, patch }) =>
      apiFetch<Requirement>(`/requirements/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requirements'] }),
  });
}

// ===== M1 新增 hooks =====

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch<Project[]>('/projects'),
  });
}

export function useScanProjects() {
  const qc = useQueryClient();
  return useMutation<{ scanned: number; projects: Project[] }, Error, { root: string | string[] }>({
    mutationFn: (body) => apiFetch('/projects/scan', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function usePatchProject() {
  const qc = useQueryClient();
  return useMutation<Project, Error, { name: string; patch: Partial<Project> }>({
    mutationFn: ({ name, patch }) => apiFetch(`/projects/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useSessions(reqId: string) {
  return useQuery<ChatSession[]>({
    queryKey: ['sessions', reqId],
    queryFn: () => apiFetch<ChatSession[]>(`/sessions/by-req/${reqId}`),
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation<ChatSession, Error, { reqId: string; title?: string; agent?: string; cwd?: string }>({
    mutationFn: (body) => apiFetch('/sessions', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (s) => qc.invalidateQueries({ queryKey: ['sessions', s.reqId] }),
  });
}

export function usePatchSession() {
  const qc = useQueryClient();
  return useMutation<ChatSession, Error, { id: string; reqId: string; patch: { title?: string } }>({
    mutationFn: ({ id, patch }) => apiFetch(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['sessions', vars.reqId] }),
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; reqId: string }>({
    mutationFn: ({ id }) => apiFetch(`/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['sessions', vars.reqId] }),
  });
}

export function useMessages(sessionId: string) {
  return useQuery<ChatMessage[]>({
    queryKey: ['messages', sessionId],
    queryFn: () => apiFetch<ChatMessage[]>(`/sessions/${sessionId}/messages`),
    enabled: !!sessionId,
  });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { sessionId: string; messageId: string }>({
    mutationFn: ({ sessionId, messageId }) =>
      apiFetch(`/sessions/${sessionId}/messages/${messageId}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['messages', vars.sessionId] });
    },
  });
}

export function useDeleteMessages() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; deleted: number }, Error, { sessionId: string; ids: string[] }>({
    mutationFn: ({ sessionId, ids }) =>
      apiFetch(`/sessions/${sessionId}/messages`, { method: 'DELETE', body: JSON.stringify({ ids }) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['messages', vars.sessionId] });
    },
  });
}

export function useAgentAvailability() {
  return useQuery<{ agents: Record<string, { present: boolean; path?: string }> }>({
    queryKey: ['agent-availability'],
    queryFn: () => apiFetch('/agent/availability'),
    staleTime: 30_000,
  });
}

export function useEvents(reqId?: string) {
  return useQuery({
    queryKey: ['events', reqId],
    queryFn: () => reqId
      ? apiFetch(`/events/by-req/${reqId}?limit=100`)
      : apiFetch('/events?limit=100'),
    refetchInterval: 5000,
  });
}

// ===== M2 hooks =====

export function useAnalyses(reqId: string) {
  return useQuery<RequirementAnalysis[]>({
    queryKey: ['analyses', reqId],
    queryFn: () => apiFetch<RequirementAnalysis[]>(`/analysis/by-req/${reqId}`),
    enabled: !!reqId,
    refetchInterval: 3000,
  });
}

export function useStartAnalysis() {
  const qc = useQueryClient();
  return useMutation<{ analyses: RequirementAnalysis[] }, Error, { reqId: string; agents: string[]; prompt?: string }>({
    mutationFn: (body) => apiFetch('/analysis/start', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['analyses', vars.reqId] }),
  });
}

export function useChooseAnalysis() {
  const qc = useQueryClient();
  return useMutation<{ subTasks: SubTask[]; reqId: string }, Error, { id: string }>({
    mutationFn: ({ id }) => apiFetch(`/analysis/${id}/choose`, { method: 'POST' }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['analyses', data.reqId] });
      qc.invalidateQueries({ queryKey: ['subtasks', data.reqId] });
      qc.invalidateQueries({ queryKey: ['requirements'] });
    },
  });
}

export function useCancelAnalysis() {
  const qc = useQueryClient();
  return useMutation<RequirementAnalysis, Error, { id: string; reqId: string }>({
    mutationFn: ({ id }) => apiFetch(`/analysis/${id}/cancel`, { method: 'POST' }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['analyses', vars.reqId] }),
  });
}

export function useSubTasks(reqId: string) {
  return useQuery<SubTask[]>({
    queryKey: ['subtasks', reqId],
    queryFn: () => apiFetch<SubTask[]>(`/subtasks/by-req/${reqId}`),
    enabled: !!reqId,
    refetchInterval: 3000,
  });
}

export function useCreateSubTask() {
  const qc = useQueryClient();
  return useMutation<SubTask, Error, Partial<SubTask> & { title: string; reqId: string }>({
    mutationFn: (body) => apiFetch('/subtasks', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (s) => qc.invalidateQueries({ queryKey: ['subtasks', s.reqId] }),
  });
}

export function usePatchSubTask() {
  const qc = useQueryClient();
  return useMutation<SubTask, Error, { id: string; reqId: string; patch: Partial<SubTask> }>({
    mutationFn: ({ id, patch }) => apiFetch(`/subtasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['subtasks', vars.reqId] }),
  });
}

// ===== M3 hooks =====

export function useReleaseRuns(reqId?: string) {
  return useQuery<ReleaseRun[]>({
    queryKey: ['release-runs', reqId],
    queryFn: () => reqId
      ? apiFetch<ReleaseRun[]>(`/release/by-req/${reqId}`)
      : apiFetch<ReleaseRun[]>('/release/list'),
    refetchInterval: 3000,
    enabled: true,
  });
}

export function useCancelRelease() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { id: string }>({
    mutationFn: ({ id }) => apiFetch(`/release/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['release-runs'] }),
  });
}

export function useResumeRelease() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { id: string }>({
    mutationFn: ({ id }) => apiFetch(`/release/${id}/resume`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['release-runs'] }),
  });
}

export function useJenkinsTemplates() {
  return useQuery<JenkinsTemplate[]>({
    queryKey: ['jenkins-templates'],
    queryFn: () => apiFetch<JenkinsTemplate[]>('/jenkins-templates'),
    staleTime: 30_000,
  });
}

export function useCreateJenkinsTemplate() {
  const qc = useQueryClient();
  return useMutation<JenkinsTemplate, Error, { name: string; job: string; params?: Record<string, string>; jenkinsUrl?: string }>({
    mutationFn: (body) => apiFetch('/jenkins-templates', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jenkins-templates'] }),
  });
}

export function usePatchJenkinsTemplate() {
  const qc = useQueryClient();
  return useMutation<JenkinsTemplate, Error, { id: string; patch: Partial<JenkinsTemplate> }>({
    mutationFn: ({ id, patch }) => apiFetch(`/jenkins-templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jenkins-templates'] }),
  });
}

export function useDeleteJenkinsTemplate() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { id: string }>({
    mutationFn: ({ id }) => apiFetch(`/jenkins-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jenkins-templates'] }),
  });
}

export function useTriggerJenkins() {
  return useMutation<{ status: string; buildUrl?: string; message?: string }, Error, { id: string; vars?: Record<string, string> }>({
    mutationFn: ({ id, vars }) => apiFetch(`/jenkins-templates/${id}/trigger`, { method: 'POST', body: JSON.stringify({ vars }) }),
  });
}

// ===== M4 hooks =====
import type { LogTarget, LogChatSession, TestCase } from '@devflow/shared';

export function useLogTargets() {
  return useQuery<LogTarget[]>({
    queryKey: ['log-targets'],
    queryFn: () => apiFetch<LogTarget[]>('/logs/targets'),
    staleTime: 10_000,
  });
}
export function useCreateLogTarget() {
  const qc = useQueryClient();
  return useMutation<LogTarget, Error, Partial<LogTarget> & { name: string; service: string }>({
    mutationFn: (body) => apiFetch('/logs/targets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['log-targets'] }),
  });
}
export function usePatchLogTarget() {
  const qc = useQueryClient();
  return useMutation<LogTarget, Error, { id: string; patch: Partial<LogTarget> }>({
    mutationFn: ({ id, patch }) => apiFetch(`/logs/targets/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['log-targets'] }),
  });
}
export function useDeleteLogTarget() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiFetch(`/logs/targets/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['log-targets'] }),
  });
}
export function useLogSessions() {
  return useQuery<LogChatSession[]>({
    queryKey: ['log-sessions'],
    queryFn: () => apiFetch<LogChatSession[]>('/logs/sessions'),
    refetchInterval: 5_000,
  });
}
export function useCreateLogSession() {
  const qc = useQueryClient();
  return useMutation<LogChatSession, Error, { title?: string; scopedTargetIds: string[] }>({
    mutationFn: (body) => apiFetch('/logs/sessions', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['log-sessions'] }),
  });
}
export function useDeleteLogSession() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiFetch(`/logs/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['log-sessions'] }),
  });
}

// ===== M2.5 hooks =====
import type { TestPlan, TestRun, GateCheck, Defect } from '@devflow/shared';

export function useTestPlans(reqId: string) {
  return useQuery<(TestPlan & { caseCount: number })[]>({
    queryKey: ['test-plans', reqId],
    queryFn: () => apiFetch<(TestPlan & { caseCount: number })[]>(`/test-plans/by-req/${reqId}`),
    enabled: !!reqId,
  });
}

export function useCreateTestPlan() {
  const qc = useQueryClient();
  return useMutation<TestPlan, Error, { reqId: string; title: string; description?: string }>({
    mutationFn: (b) => apiFetch('/test-plans', { method: 'POST', body: JSON.stringify(b) }),
    onSuccess: (p) => qc.invalidateQueries({ queryKey: ['test-plans', p.reqId] }),
  });
}

export function useTestRuns(reqId?: string) {
  return useQuery<TestRun[]>({
    queryKey: ['test-runs', reqId],
    queryFn: () => apiFetch<TestRun[]>(`/test-runs${reqId ? `?reqId=${reqId}` : ''}`),
    refetchInterval: 5000,
  });
}

export function useGateChecks(reqId: string) {
  return useQuery<GateCheck[]>({
    queryKey: ['gate-checks', reqId],
    queryFn: () => apiFetch<GateCheck[]>(`/gate-checks?reqId=${reqId}`),
    enabled: !!reqId,
  });
}

export function useTestCases(reqId: string) {
  return useQuery<TestCase[]>({
    queryKey: ['test-cases', reqId],
    queryFn: () => apiFetch<TestCase[]>(`/test-cases?reqId=${reqId}`),
    enabled: !!reqId,
  });
}

export function useDefects(reqId?: string) {
  return useQuery<Defect[]>({
    queryKey: ['defects', reqId],
    queryFn: () => apiFetch<Defect[]>(`/defects${reqId ? `?reqId=${reqId}` : ''}`),
    refetchInterval: 10_000,
  });
}

export function useCreateDefect() {
  const qc = useQueryClient();
  return useMutation<Defect, Error, { reqId: string; title: string; severity?: string; description?: string; subTaskId?: string; testRunId?: string }>({
    mutationFn: (b) => apiFetch('/defects', { method: 'POST', body: JSON.stringify(b) }),
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['defects', d.reqId] }),
  });
}

export function usePatchDefect() {
  const qc = useQueryClient();
  return useMutation<Defect, Error, { id: string; reqId: string; patch: Partial<Defect> }>({
    mutationFn: ({ id, patch }) => apiFetch(`/defects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['defects', d.reqId] }),
  });
}

export function useDefectStatusHistory(defectId: string) {
  return useQuery<Array<{ id: string; defectId: string; actor: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>>({
    queryKey: ['defect-history', defectId],
    queryFn: () => apiFetch(`/defects/${defectId}/history`),
    enabled: !!defectId,
  });
}

export function useAssignAgentFix() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean; status: string; reason?: string; log: string }, Error, { id: string; reqId: string }>({
    mutationFn: ({ id }) => apiFetch(`/defects/${id}/assign-agent`, { method: 'POST', body: JSON.stringify({ agent: 'claude-api' }) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['defects', vars.reqId] });
      qc.invalidateQueries({ queryKey: ['defect-history', vars.id] });
    },
  });
}

// ===== M5 hooks =====
import type { HealthStatus, SystemStats } from '@devflow/shared';

export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthStatus>('/health'),
    refetchInterval: 30_000,
  });
}

export function useStats() {
  return useQuery<SystemStats>({
    queryKey: ['stats'],
    queryFn: () => apiFetch<SystemStats>('/stats'),
    refetchInterval: 60_000,
  });
}

export function useArchivedRequirements() {
  return useQuery<Requirement[]>({
    queryKey: ['requirements', { archived: '1' }],
    queryFn: () => apiFetch<Requirement[]>('/requirements?archived=1'),
  });
}

// ===== Settings hooks =====
export function useSettings() {
  return useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => apiFetch<Record<string, string>>('/settings'),
    staleTime: 10_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation<Record<string, string>, Error, Record<string, string>>({
    mutationFn: (patch) => apiFetch<Record<string, string>>('/settings', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useTestConnection() {
  return useMutation<{ ok: boolean; latencyMs: number; message?: string; error?: string }, Error, { type: string; baseUrl?: string; apiKey?: string; model?: string }>({
    mutationFn: (body) => apiFetch('/test-connection', { method: 'POST', body: JSON.stringify(body) }),
  });
}

// ===== Attachment hooks =====

export function useAttachments(reqId: string) {
  return useQuery<{ files: Array<{ name: string; size: number }> }>({
    queryKey: ['attachments', reqId],
    queryFn: () => apiFetch(`/requirements/${reqId}/attachments`),
    enabled: !!reqId,
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; uploaded: string[] }, Error, { reqId: string; files: FileList }>({
    mutationFn: async ({ reqId, files }) => {
      const form = new FormData();
      for (let i = 0; i < files.length; i++) {
        form.append('file', files[i]);
      }
      return apiFetch(`/requirements/${reqId}/attachments`, { method: 'POST', body: form });
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['attachments', vars.reqId] }),
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation<void, Error, { reqId: string; filename: string }>({
    mutationFn: ({ reqId, filename }) =>
      apiFetch(`/requirements/${reqId}/attachments/${filename}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['attachments', vars.reqId] }),
  });
}

// ===== M6 hooks: Documents =====

import type { Document, DocumentVersion, Attachment, Notification } from '@devflow/shared';

export function useDocuments(filters?: { reqId?: string; type?: string; status?: string }) {
  const params = new URLSearchParams();
  if (filters?.reqId) params.set('reqId', filters.reqId);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return useQuery<Document[]>({
    queryKey: ['documents', filters],
    queryFn: () => apiFetch<Document[]>(`/documents${qs ? `?${qs}` : ''}`),
  });
}

export function useDocument(id: string) {
  return useQuery<Document>({
    queryKey: ['document', id],
    queryFn: () => apiFetch<Document>(`/documents/${id}`),
    enabled: !!id,
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation<Document, Error, { reqId?: string | null; type: Document['type']; title: string; content?: string }>({
    mutationFn: (body) => apiFetch<Document>('/documents', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (d) => qc.invalidateQueries({ queryKey: ['documents', { reqId: d.reqId ?? undefined }] }),
  });
}

export function usePatchDocument() {
  const qc = useQueryClient();
  return useMutation<Document, Error, { id: string; reqId?: string; patch: Partial<Document> }>({
    mutationFn: ({ id, patch }) => apiFetch<Document>(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['document', d.id] });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useDocumentVersions(docId: string) {
  return useQuery<DocumentVersion[]>({
    queryKey: ['document-versions', docId],
    queryFn: () => apiFetch<DocumentVersion[]>(`/documents/${docId}/versions`),
    enabled: !!docId,
  });
}

export function useApproveDocument() {
  const qc = useQueryClient();
  return useMutation<Document, Error, { id: string }>({
    mutationFn: ({ id }) => apiFetch<Document>(`/documents/${id}/approve`, { method: 'POST' }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['document', d.id] });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useRejectDocument() {
  const qc = useQueryClient();
  return useMutation<Document, Error, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => apiFetch<Document>(`/documents/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['document', d.id] });
      qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

// ===== M6 hooks: Attachments (new table-based) =====

export function useAttachmentsV2(reqId: string) {
  return useQuery<Attachment[]>({
    queryKey: ['attachments-v2', reqId],
    queryFn: () => apiFetch<Attachment[]>(`/attachments?reqId=${reqId}`),
    enabled: !!reqId,
  });
}

export function useUploadAttachmentV2() {
  const qc = useQueryClient();
  return useMutation<{ uploaded: Attachment[]; errors: string[]; count: number }, Error, { reqId: string; files: FileList }>({
    mutationFn: async ({ reqId, files }) => {
      const form = new FormData();
      for (let i = 0; i < files.length; i++) form.append('file', files[i]);
      return apiFetch(`/attachments?reqId=${reqId}`, { method: 'POST', body: form });
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['attachments-v2', vars.reqId] }),
  });
}

export function useDeleteAttachmentV2() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { id: string; reqId: string }>({
    mutationFn: ({ id }) => apiFetch<{ ok: boolean }>(`/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['attachments-v2', vars.reqId] }),
  });
}

// ===== M6 hooks: Notifications =====

export function useNotifications() {
  return useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch('/notifications'),
    refetchInterval: 5000,
  });
}

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ['notifications-unread'],
    queryFn: () => apiFetch('/notifications/unread-count'),
    refetchInterval: 5000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (id) => apiFetch(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: () => apiFetch('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });
}

// ===== M8 Auth hooks =====

export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  token: string;
  user: { id: string; username: string; displayName: string | null; role: string; createdAt: string; updatedAt: string };
}

export function useLogin() {
  return useMutation<LoginResult, Error, LoginInput>({
    mutationFn: (body) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      localStorage.setItem('devflow_token', data.token);
    },
  });
}

export function useLogout() {
  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: () => apiFetch('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      localStorage.removeItem('devflow_token');
      window.location.href = '/login';
    },
  });
}

export function useMe() {
  return useQuery<LoginResult['user']>({
    queryKey: ['me'],
    queryFn: () => apiFetch('/auth/me'),
    retry: false,
    refetchInterval: 60_000,
  });
}

export function useUsers() {
  return useQuery<LoginResult['user'][]>({
    queryKey: ['users'],
    queryFn: () => apiFetch('/auth/users'),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation<LoginResult['user'], Error, { username: string; password: string; displayName?: string | null; role?: string }>({
    mutationFn: (body) => apiFetch('/auth/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation<LoginResult['user'], Error, { id: string; patch: Partial<{ displayName: string | null; role: string; password: string }> }>({
    mutationFn: ({ id, patch }) => apiFetch(`/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (id) => apiFetch(`/auth/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUnarchiveRequirement() {
  const qc = useQueryClient();
  return useMutation<Requirement, Error, string>({
    mutationFn: (id) => apiFetch(`/requirements/${id}/unarchive`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requirements'] });
      qc.invalidateQueries({ queryKey: ['archived-requirements'] });
    },
  });
}

export function useVerifyProduction() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { id: string; verdict: 'accepted' | 'rejected' }>({
    mutationFn: ({ id, verdict }) => apiFetch(`/release/${id}/verify`, { method: 'POST', body: JSON.stringify({ verdict }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['release-runs'] }),
  });
}

