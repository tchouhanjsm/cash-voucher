import { ls } from './storage.js';

const DENSITY_KEY = 'cv.density';
const DENSITIES = new Set(['comfortable', 'compact']);

export function getWorkspaceDensity() {
  const saved = ls.get(DENSITY_KEY);
  return DENSITIES.has(saved) ? saved : 'comfortable';
}

export function setWorkspaceDensity(value) {
  if (!DENSITIES.has(value)) return false;
  const persisted = ls.set(DENSITY_KEY, value);
  document.documentElement.dataset.density = value;
  return persisted;
}

export function applyWorkspacePreferences() {
  document.documentElement.dataset.density = getWorkspaceDensity();
}
