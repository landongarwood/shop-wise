/**
 * Light and dark.
 *
 * Follows Windows until the user picks a side, then remembers the choice. The
 * stored preference is a convenience, so every access tolerates storage being
 * unavailable rather than failing to start.
 */

const KEY = 'shopwise:theme';

const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

const write = (theme) => {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* preference is optional */
  }
};

const systemPrefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

export function initTheme() {
  applyTheme(read() ?? (systemPrefersDark() ? 'dark' : 'light'));

  // Keep following the system until an explicit choice has been made.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
    if (!read()) applyTheme(event.matches ? 'dark' : 'light');
  });
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  write(next);
  return next;
}
