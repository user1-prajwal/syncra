import { useCallback, useState } from 'react';

const KEY = 'syncra:theme';

function initialTheme() {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage unavailable */ }
  // Until the user chooses, follow the operating system.
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * The theme is applied through a `data-theme` attribute on the editor's root element (see EditorPage),
 * so switching only changes CSS variables: nothing remounts and the editing session is untouched.
 */
export function useTheme() {
  const [theme, setThemeState] = useState(initialTheme);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try { window.localStorage.setItem(KEY, next); } catch { /* ignore */ }
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
