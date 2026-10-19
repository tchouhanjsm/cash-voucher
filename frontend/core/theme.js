import { ls } from './storage.js';

const STORAGE_KEY = 'cv.theme';
const PALETTE_STORAGE_KEY = 'cv.palette';
const PALETTES = new Set(['sky', 'blush', 'mint']);
const THEME_COLORS = {
  light: '#edf1f6',
  dark: '#111820',
};

function storedTheme() {
  const value = ls.get(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

function storedPalette() {
  const value = ls.get(PALETTE_STORAGE_KEY);
  return PALETTES.has(value) ? value : null;
}

function syncPalette(palette) {
  const selected = PALETTES.has(palette) ? palette : 'sky';
  document.documentElement.dataset.palette = selected;

  const login = document.getElementById('login');
  if (login) login.dataset.theme = selected;

  document.querySelectorAll('[data-login-theme]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.loginTheme === selected));
  });
}

export function setPalette(palette) {
  const selected = PALETTES.has(palette) ? palette : 'sky';
  ls.set(PALETTE_STORAGE_KEY, selected);
  syncPalette(selected);
  return selected;
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
  // Sign-in and the authenticated workspace share the same saved palette.
  syncPalette(storedPalette() || 'sky');

  // The app opens in light mode unless the user has explicitly saved a dark preference.
  updateTheme(storedTheme() || 'light');

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    ls.set(STORAGE_KEY, next);
    updateTheme(next);
  });
}
