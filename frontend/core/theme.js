import { ls } from './storage.js';

const STORAGE_KEY = 'cv.theme';
const THEME_COLORS = {
  light: '#f7f5f0',
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
  // The app opens in the light workspace unless the user has explicitly saved a theme choice.
  updateTheme(storedTheme() || 'light');

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    ls.set(STORAGE_KEY, next);
    updateTheme(next);
  });
}
