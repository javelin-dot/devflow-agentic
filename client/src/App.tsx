import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavSidebar } from './components/NavSidebar';
import { BoardView } from './views/BoardView';
import { RequirementDetailPage } from './views/RequirementDetailPage';
import { ProjectsView } from './views/ProjectsView';
import { ActivityView } from './views/ActivityView';
import { ChatWorkspace } from './views/ChatWorkspace';
import { ReleaseView } from './views/ReleaseView';
import { QuickPublishPanel } from './views/QuickPublishPanel';
import { LogsView } from './views/LogsView';
import { TestDashboard } from './views/TestDashboard';
import { DashboardView } from './views/DashboardView';
import { ArchiveView } from './views/ArchiveView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { TerminalPanel } from './views/TerminalPanel';
import { AiAssistantView } from './views/AiAssistantView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ui';
import { OnboardingWizard } from './components/OnboardingWizard';
import { ShortcutsHelpPanel } from './components/ShortcutsHelpPanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import { useRequirement } from './api/hooks';
import { apiFetch } from './api/client';
import type { Requirement } from '@devflow/shared';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, refetchOnWindowFocus: false, retry: 1 } },
});

function WorkspacePage() {
  const { reqId } = useParams<{ reqId: string }>();
  const navigate = useNavigate();
  const { data: req, isLoading } = useRequirement(reqId || '');

  if (!reqId) return <Navigate to="/board" replace />;
  if (isLoading) return <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>加载中...</div>;
  if (!req) return <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>需求不存在</div>;

  return <ChatWorkspace req={req} onClose={() => navigate('/board')} />;
}

function AppLayout() {
  useTheme();
  const [aiPanel, setAiPanel] = useState<{ open: boolean; req: Requirement | null }>({ open: false, req: null });
  const [aiDragOver, setAiDragOver] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('devflow_token'));
  const navigate = useNavigate();

  useKeyboardShortcuts(() => setShowShortcutsHelp(true));

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowShortcutsHelp(false);
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    apiFetch<Record<string, string>>('/settings')
      .then(settings => {
        if (settings.onboardingDone !== 'true') setShowOnboarding(true);
      })
      .catch(() => setShowOnboarding(true));
  }, [isLoggedIn]);

  useEffect(() => {
    const onUnauthorized = () => {
      setIsLoggedIn(false);
      navigate('/login', { replace: true });
    };
    window.addEventListener('devflow:unauthorized', onUnauthorized);
    return () => window.removeEventListener('devflow:unauthorized', onUnauthorized);
  }, [navigate]);

  if (!isLoggedIn) {
    return (
      <Routes>
        <Route path="/login" element={<LoginView onLogin={() => setIsLoggedIn(true)} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <NavSidebar />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/board" replace />} />
          <Route path="/board" element={<ErrorBoundary viewName="需求管理"><BoardView onOpenReq={(req) => setAiPanel({ open: true, req })} /></ErrorBoundary>} />
          <Route path="/requirements/:reqId" element={<ErrorBoundary viewName="需求详情"><RequirementDetailPage /></ErrorBoundary>} />
          <Route path="/workspace/:reqId" element={<ErrorBoundary viewName="工作区"><WorkspacePage /></ErrorBoundary>} />
          <Route path="/activity" element={<ErrorBoundary viewName="动态"><ActivityView /></ErrorBoundary>} />
          <Route path="/projects" element={<ErrorBoundary viewName="项目"><ProjectsView /></ErrorBoundary>} />
          <Route path="/archive" element={<ErrorBoundary viewName="归档"><ArchiveView /></ErrorBoundary>} />
          <Route path="/release" element={<ErrorBoundary viewName="发布"><ReleaseView /></ErrorBoundary>} />
          <Route path="/quickpublish" element={<ErrorBoundary viewName="Jenkins"><QuickPublishPanel /></ErrorBoundary>} />
          <Route path="/logs" element={<ErrorBoundary viewName="日志"><LogsView /></ErrorBoundary>} />
          <Route path="/testing" element={<ErrorBoundary viewName="测试与缺陷"><TestDashboard /></ErrorBoundary>} />
          <Route path="/defects" element={<Navigate to="/testing" replace />} />
          <Route path="/dashboard" element={<ErrorBoundary viewName="仪表板"><DashboardView /></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary viewName="设置"><SettingsView onRerunOnboarding={() => setShowOnboarding(true)} /></ErrorBoundary>} />
          <Route path="/terminal" element={<ErrorBoundary viewName="终端"><TerminalPanel /></ErrorBoundary>} />
          <Route path="/assistant" element={<ErrorBoundary viewName="AI 助手"><AiAssistantView /></ErrorBoundary>} />
          <Route path="/login" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {aiPanel.open && (
        <div
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setAiDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAiDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setAiDragOver(false);
            try {
              const data = JSON.parse(e.dataTransfer.getData('application/json')) as { req?: Requirement };
              if (data.req) setAiPanel({ open: true, req: data.req });
            } catch { /* ignore */ }
          }}
          style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: 460, zIndex: 500,
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
            borderLeft: aiDragOver ? '2px solid #00a8a8' : '1px solid #EAECF0',
            background: aiDragOver ? 'rgba(0,168,168,0.04)' : 'var(--bg-primary)',
            display: 'flex', flexDirection: 'column',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          {aiPanel.req ? (
            <ChatWorkspace
              req={aiPanel.req}
              onClose={() => setAiPanel({ open: false, req: null })}
              panelMode
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{
                height: 44, flexShrink: 0, borderBottom: '1px solid var(--border-default)',
                background: 'var(--bg-secondary)',
                display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8,
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>AI 助手</span>
                <button
                  onClick={() => setAiPanel({ open: false, req: null })}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 4 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 }}>
                {aiDragOver ? (
                  <div style={{
                    width: '100%', maxWidth: 320,
                    border: '2px dashed #00a8a8', borderRadius: 12,
                    padding: '32px 24px', textAlign: 'center',
                    background: 'rgba(0,168,168,0.06)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{ fontSize: 28 }}>📥</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#00a8a8' }}>松开以加载需求</div>
                  </div>
                ) : (
                  <>
                    <div style={{
                      width: '100%', maxWidth: 320,
                      border: '1.5px dashed #D0D5DD', borderRadius: 12,
                      padding: '24px 20px', textAlign: 'center',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{ fontSize: 24 }}>↙</div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#6B7280' }}>将需求卡片拖拽到此处</div>
                      <div style={{ fontSize: 11, color: '#98A2B3' }}>或右键卡片 → AI 助手</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showOnboarding && (
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      )}
      {showShortcutsHelp && (
        <ShortcutsHelpPanel onClose={() => setShowShortcutsHelp(false)} />
      )}
      <ToastContainer />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AppLayout />
      </QueryClientProvider>
    </BrowserRouter>
  );
}
