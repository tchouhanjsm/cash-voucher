'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const styles = read('frontend-workspace.css');
const worker = read('sw.js');
const build = read('scripts/build-web.js');
const dashboard = read('frontend/features/dashboard.js');

const uiKitPosition = html.indexOf('frontend-ui-kit.css');
const workspacePosition = html.indexOf('frontend-workspace.css');
assert.ok(
  uiKitPosition >= 0 && workspacePosition > uiKitPosition,
  'workspace layer loads after the base UI kit',
);

assert.match(styles, /--workspace-canvas:\s*#f6f8fc/, 'workspace defines a light canvas');
assert.match(
  styles,
  /--workspace-accent:\s*var\(--accent\)/,
  'the existing user-selected palette remains the source of the workspace accent',
);
assert.match(styles, /:root\[data-theme='dark'\]/, 'workspace defines dark-theme surfaces');
assert.match(styles, /\.app > \.side\s*\{/, 'desktop navigation rail receives the workspace skin');
assert.match(styles, /\.app > \.topbar\s*\{/, 'topbar receives the workspace skin');
assert.match(
  styles,
  /\.dashboard-view \.dashboard-stats--owner/,
  'owner dashboard metrics use a dedicated responsive grid',
);
assert.match(
  styles,
  /\.dashboard-view \.dashboard-stats--staff/,
  'staff dashboard metrics use a dedicated responsive grid',
);
assert.match(
  styles,
  /\.dashboard-view \.dashboard-trend \.chart \.b/,
  'trend chart bars use the workspace accent',
);
assert.match(styles, /min-height:\s*44px/, 'workspace preserves the 44px touch target baseline');
assert.match(styles, /@media \(max-width:\s*800px\)/, 'workspace defines a mobile shell');
assert.match(
  styles,
  /@media \(prefers-reduced-motion:\s*reduce\)/,
  'workspace honors reduced-motion preferences',
);
assert.match(styles, /@media \(forced-colors:\s*active\)/, 'workspace supports forced colors');
assert.match(styles, /@media screen\s*\{/, 'workspace visual overrides are screen-scoped');
assert.doesNotMatch(
  html + styles,
  /fonts\.googleapis\.com|cdn\.tailwindcss\.com|cdn\.jsdelivr\.net|unpkg\.com|iconify\.design/i,
  'workspace adds no remote font, CDN or icon runtime',
);

assert.match(worker, /const C = 'cv2-v43'/, 'visual change advances the app-shell cache');
assert.match(worker, /'frontend-workspace\.css'/, 'new stylesheet is in the offline shell allowlist');
assert.match(build, /'frontend-workspace\.css'/, 'static customer build publishes the stylesheet');

// Dashboard amounts and chart data remain owned by the validated server read model.
assert.match(dashboard, /summary\.bookBalance/, 'book balance remains API-derived');
assert.match(dashboard, /summary\.trend/, 'trend data remains API-derived');
assert.match(dashboard, /summary\.topVendors/, 'vendor breakdown remains API-derived');

console.log(
  'TailAdmin-inspired workspace OK — local design layer, responsive states, data integrity and PWA integration.',
);
