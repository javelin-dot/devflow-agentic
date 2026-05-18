import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const SHORTCUTS: Record<string, string> = {
  b: 'board',      // B = 看板
  p: 'projects',   // P = 项目
  t: 'testing',    // T = 测试
  f: 'defects',    // F = 缺陷
  r: 'release',    // R = 发布
  l: 'logs',       // L = 日志
  d: 'dashboard',  // D = 仪表板
  '?': 'help',     // ? = 帮助
};

const PATH_MAP: Record<string, string> = {
  board: '/board',
  projects: '/projects',
  testing: '/testing',
  defects: '/defects',
  release: '/release',
  logs: '/logs',
  dashboard: '/dashboard',
};

export function useKeyboardShortcuts(onHelp: () => void) {
  const navigate = useNavigate();
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === '?') { onHelp(); return; }
      const view = SHORTCUTS[key];
      if (view && view !== 'help') {
        const path = PATH_MAP[view];
        if (path) navigate(path);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigate, onHelp]);
}
