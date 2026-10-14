import { ls } from './storage.js';

const STORAGE_KEY = 'cv.theme';
const THEME_COLORS = {
  light: '#1f3a4d',
  dark: '#111820',
};

function storedTheme() {
  const value = ls.get(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

function updateTheme(theme) {
  const selected = theme === 'dark' ? 'dark' : 'light';
  const next = selected === 'dark' ? 'light' : 'dark';

  document.documentElement.dataset.theme = selected;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[selected]);

  const control = document.getElementById('themeToggle');
  if (control) {
    control.textContent = next === 'dark' ? '🌙 Use dark theme' : '☀️ Use light theme';
    control.setAttribute('aria-label', `Switch to ${next} theme`);
    control.setAttribute('aria-pressed', String(selected === 'dark'));
  }
}

export function initTheme() {
  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;
  updateTheme(storedTheme() || (media?.matches ? 'dark' : 'light'));

  media?.addEventListener?.('change', (event) => {
    if (storedTheme()) return;
    updateTheme(event.matches ? 'dark' : 'light');
  });

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    ls.set(STORAGE_KEY, next);
    updateTheme(next);
  });
}
