'use client';

/**
 * Theme provider.
 *
 * Statement supports three theme states: 'system' (default — respects
 * prefers-color-scheme), 'light', or 'dark'. Manual override persists in
 * localStorage under the key `pp.theme`.
 *
 * The data-theme attribute on <html> is the runtime source of truth — every
 * CSS variable token in globals.css reads from it via the [data-theme="dark"]
 * selector. Components don't have to use `dark:` variants because the
 * variables flip automatically.
 *
 * To prevent a flash of wrong theme on first paint, the inline script in
 * <head> (see layout.tsx) sets data-theme synchronously before React mounts.
 * This provider's effect then re-syncs on hydration and listens for system
 * preference changes.
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'pp.theme';

type ThemeContextValue = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  // Also expose for native form widgets (datalist popups, scrollbars).
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR-safe initial: stay on 'system' / 'light' until effects can read the DOM.
  // The inline pre-paint script (see layout.tsx) has already applied the right
  // theme to <html>, so the first hydrated render won't visibly mismatch.
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // First-mount sync: read stored mode, resolve to concrete theme, apply.
  useEffect(() => {
    const stored = readStoredMode();
    const concrete: ResolvedTheme = stored === 'system' ? readSystemTheme() : stored;
    setModeState(stored);
    setResolved(concrete);
    applyResolvedTheme(concrete);
  }, []);

  // Re-resolve when system preference changes (only relevant in 'system' mode).
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next: ResolvedTheme = mq.matches ? 'dark' : 'light';
      setResolved(next);
      applyResolvedTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    const concrete: ResolvedTheme = next === 'system' ? readSystemTheme() : next;
    setResolved(concrete);
    applyResolvedTheme(concrete);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage disabled — accept the loss */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Permissive fallback so components mounted outside the provider (e.g. in
    // isolation tests) don't crash. They just won't react to theme changes.
    return {
      mode: 'system',
      resolved: 'light',
      setMode: () => {
        /* no-op */
      },
    };
  }
  return ctx;
}

/**
 * Inline script string. Embed in <head> via dangerouslySetInnerHTML so the
 * theme attribute is set on <html> before any styles paint, preventing a
 * flash of wrong theme.
 *
 * Keeps the script tiny — no imports, no shared types, just enough to read
 * localStorage + matchMedia and set the attribute.
 */
export const themePrePaintScript = `
(function() {
  try {
    var stored = localStorage.getItem('pp.theme');
    var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var theme = (stored === 'dark' || stored === 'light') ? stored : sys;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;
