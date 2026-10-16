'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const palette = read('style.css');
const components = read('frontend-ui-kit.css');
const theme = read('frontend/core/theme.js');
const dashboard = read('frontend/features/dashboard.js');

assert.match(palette, /--bg:\s*#f7f5f0;/, 'main canvas stays warm and light');
assert.match(palette, /--card:\s*#fffefc;/, 'cards stay close to warm white');
assert.match(palette, /--brand:\s*#875521;/, 'primary action keeps restrained gold-brown accent');
assert.match(palette, /--nav-bg:\s*#fcf9f4;/, 'sidebar uses a light neutral surface');
assert.match(
  palette,
  /--nav-active-ink:\s*#6a3f16;/,
  'active light navigation has dedicated text color',
);
assert.match(palette, /:root\[data-theme='dark'\]/, 'explicit dark preference remains supported');
assert.match(
  components,
  /\.app > \.side\s*\{[\s\S]*?background:\s*var\(--nav-bg\)/,
  'running app shell uses the light navigation surface',
);
assert.match(
  components,
  /\.dashboard-view \.stat\s*\{[\s\S]*?grid-template-columns:\s*42px minmax\(0, 1fr\)/,
  'dashboard KPIs use compact horizontal composition',
);
assert.match(
  components,
  /\.dashboard-view \.dashboard-trend/,
  'dashboard trend has a dedicated chart treatment',
);
assert.match(
  theme,
  /updateTheme\(storedTheme\(\)\s*\|\|\s*'light'\)/,
  'new sessions open in light theme unless the user saved a preference',
);
assert.doesNotMatch(
  theme,
  /prefers-color-scheme/,
  'OS dark mode does not silently override the requested light-first product',
);
assert.match(
  dashboard,
  /class="dashboard-view"/,
  'dashboard-specific visual system has an explicit scope',
);
assert.match(
  dashboard,
  /dashboard-breakdowns/,
  'vendor and category analysis stay in shared dashboard layout',
);

console.log(
  'Design system OK — light-first palette, optional dark mode, shared shell and dashboard composition.',
);
