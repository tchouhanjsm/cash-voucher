'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const palette = read('style.css');
const components = read('frontend-ui-kit.css');
const theme = read('frontend/core/theme.js');
const dashboard = read('frontend/features/dashboard.js');
const ui = read('frontend/core/ui.js');
const payments = read('frontend/features/payments.js');
const administration = read('frontend/features/administration.js');
const bulk = read('frontend/features/bulk.js');

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

assert.match(
  ui,
  /class="page-eyebrow"/,
  'shared page header renders the supplied section as a visual eyebrow',
);
assert.match(
  ui,
  /scalarText\(options\.section\)/,
  'page section text is normalized before escaping',
);
assert.match(
  components,
  /\.page-eyebrow\s*\{/,
  'shared title eyebrow has a dedicated token-based style',
);
assert.match(
  components,
  /#nf\.entry-form\s*\{/,
  'new payment and receipt forms adopt shared panel geometry',
);
assert.match(
  components,
  /\.settings-layout\s*\{[\s\S]*?display:\s*grid/,
  'settings groups property editing and diagnostics in a consistent grid',
);
assert.match(
  components,
  /\.card\.filters#rf\s*\{[\s\S]*?grid-template-columns/,
  'register filters use a predictable responsive grid',
);
assert.match(
  payments,
  /class="seg entry-type-switch"/,
  'entry type choices have a named shared component',
);
assert.match(
  payments,
  /class="card entry-form"/,
  'payment/receipt fields use the dedicated application form layout',
);
assert.match(
  administration,
  /class="settings-layout"/,
  'owner settings uses the shared workspace structure',
);
assert.match(
  administration,
  /class="settings-diagnostics"/,
  'owner operational panels are grouped separately from editable property settings',
);
assert.match(
  bulk,
  /class="card bulk-import-panel"/,
  'bulk upload has a scoped import panel for consistent layout',
);
assert.match(
  bulk,
  /class="bulk-entry-kind"/,
  'bulk transaction type control does not rely on inline spacing',
);
assert.doesNotMatch(
  payments,
  /class='btn sm' style='margin:0'/,
  'receipt-upload action uses a stylesheet class, not a one-off inline margin',
);

console.log(
  'Design system OK — light-first palette, optional dark mode and shared workflow adoption.',
);
