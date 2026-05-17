import { useState, useEffect, useCallback } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavSidebar } from './components/NavSidebar';
import { BoardView } from './views/BoardView';
import { ProjectsView } from './views/ProjectsView';
import { ActivityView } from './views/ActivityView';
import { ChatWorkspace } from './views/ChatWorkspace';
import { ReleaseView } from './views/ReleaseView';
import { QuickPublishPanel } from './views/QuickPublishPanel';
import { LogsView } from './views/LogsView';
import { TestDashboard } from './views/TestDashboard';
import { DefectListPanel } from './views/DefectListPanel';
import { DashboardView } from './views/DashboardView';
import { ArchiveView } from './views/ArchiveView';
import { SettingsView } from './views/SettingsView';
import { LoginView } from './views/LoginView';
import { TerminalPanel } from './views/TerminalPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ui';
import { OnboardingWizard } from './components/OnboardingWizard';
import { ShortcutsHelpPanel } from './components/ShortcutsHelpPanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme } from './hooks/useTheme';
import { apiFetch } from './api/client';
import type { Requirement } from '@devflow/shared';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, refetchOnWindowFocus: false, retry: 1 } },
});

export type View = 'board' | 'workspace' | 'activity' | 'projects' | 'archive' | 'release' | 'quickpublish' | 'logs' | 'testing' | 'defects' | 'dashboard' | 'settings' | 'terminal';

function AppInner() {
  useTheme();
  const [view, setView] = useState<View>('board');
  const [selectedReq, setSelectedReq] = useState<Requirement | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('devflow_token'));

  // Check onboarding status on mount
  useEffect(() => {
    if (!isLoggedIn) return;
    apiFetch<Record<string, string>>('/settings')
      .then(settings => {
        if (settings.onboardingDone !== 'true') {
          setShowOnboarding(true);
        }
      })
      .catch(() => {
        // If we can't reach settings, show onboarding
        setShowOnboarding(true);
      });
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return <LoginView onLogin={() => setIsLoggedIn(true)} />;
  }

  const handleNavigate = useCallback((v: string) => {
    setView(v as View);
    if (v !== 'workspace') setSelectedReq(null);
  }, []);

  const handleHelp = useCallback(() => {
    setShowShortcutsHelp(true);
  }, []);

  useKeyboardShortcuts(handleNavigate, handleHelp);

  // Close shortcuts help on Escape
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowShortcutsHelp(false);
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <NavSidebar view={view} onViewChange={(v) => { setView(v as View); if (v !== 'workspace') setSelectedReq(null); }} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'board' && (
          <ErrorBoundary viewName="看板">
            <BoardView
              onOpenReq={(req) => { setSelectedReq(req); setView('workspace'); }}
            />
          </ErrorBoundary>
        )}
        {view === 'workspace' && selectedReq && (
          <ErrorBoundary viewName="工作区">
            <ChatWorkspace req={selectedReq} onClose={() => { setView('board'); setSelectedReq(null); }} />
          </ErrorBoundary>
        )}
        {view === 'workspace' && !selectedReq && (
          <div style={{ padding: 24, color: 'var(--text-tertiary)' }}>请先从看板选择一个需求</div>
        )}
        {view === 'activity' && (
          <ErrorBoundary viewName="动态">
            <ActivityView reqId={selectedReq?.id} />
          </ErrorBoundary>
        )}
        {view === 'projects' && (
          <ErrorBoundary viewName="项目">
            <ProjectsView />
          </ErrorBoundary>
        )}
        {view === 'archive' && (
          <ErrorBoundary viewName="归档">
            <ArchiveView />
          </ErrorBoundary>
        )}
        {view === 'release' && (
          <ErrorBoundary viewName="发布">
            <ReleaseView />
          </ErrorBoundary>
        )}
        {view === 'quickpublish' && (
          <ErrorBoundary viewName="Jenkins">
            <QuickPublishPanel />
          </ErrorBoundary>
        )}
        {view === 'logs' && (
          <ErrorBoundary viewName="日志">
            <LogsView />
          </ErrorBoundary>
        )}
        {view === 'testing' && (
          <ErrorBoundary viewName="测试">
            <TestDashboard reqId={selectedReq?.id} />
          </ErrorBoundary>
        )}
        {view === 'defects' && (
          <ErrorBoundary viewName="缺陷">
            <DefectListPanel reqId={selectedReq?.id} />
          </ErrorBoundary>
        )}
        {view === 'dashboard' && (
          <ErrorBoundary viewName="仪表板">
            <DashboardView />
          </ErrorBoundary>
        )}
        {view === 'settings' && (
          <ErrorBoundary viewName="设置">
            <SettingsView onRerunOnboarding={() => setShowOnboarding(true)} />
          </ErrorBoundary>
        )}
        {view === 'terminal' && (
          <ErrorBoundary viewName="终端">
            <TerminalPanel />
          </ErrorBoundary>
        )}
      </main>

      {/* Modals */}
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
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}
