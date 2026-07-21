import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
const listeners = new Set<() => void>();

function current(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Switches the theme and remembers the choice.
 *
 * The attribute on <html> is the single source of truth — the inline script in index.html sets it
 * before first paint so a dark-mode user never sees a light flash, and this keeps it in step.
 */
export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // A browser with storage disabled still themes correctly for this session.
  }
  for (const listener of listeners) listener();
}

/** Reads the active theme, re-rendering when it changes. */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => 'light');
  const toggle = useCallback(() => {
    setTheme(current() === 'dark' ? 'light' : 'dark');
  }, []);
  return { theme, toggle };
}
