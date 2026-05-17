import { useEffect } from 'react';

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

export function useKeyboardShortcuts(onNavigate: (view: string) => void, onHelp: () => void) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === '?') { onHelp(); return; }
      const view = SHORTCUTS[key];
      if (view && view !== 'help') onNavigate(view);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onNavigate, onHelp]);
}
