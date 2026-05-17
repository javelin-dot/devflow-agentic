import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'devflow-theme';

function getInitialTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return null;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme) {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const resolved = prev ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = resolved === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const effectiveTheme: Theme = theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  return { theme, effectiveTheme, toggle };
}
