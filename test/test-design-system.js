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
const reports = read('frontend/features/reports.js');
const register = read('frontend/features/register.js');
const authHtml = read('index.html');
const cashClose = read('frontend/features/cash-close.js');

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
  ui,
  /esc\(section\)/,
  'shared page header escapes its section label before rendering HTML',
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

assert.match(
  reports,
  /class="filters report-filters"/,
  'movement report filters use the shared responsive grid',
);
assert.match(
  components,
  /\.report-filters\s*\{[\s\S]*?display:\s*grid/,
  'report filters have a designed grid instead of ad hoc row wrapping',
);
assert.match(
  reports,
  /class="card report-results-card"/,
  'report source data is contained in a dedicated results surface',
);
assert.match(
  register,
  /class="card register-results-card"/,
  'register results use a scoped card layout',
);
assert.match(
  register,
  /class="register-totals"/,
  'register totals have a dedicated non-inline layout hook',
);
assert.match(
  administration,
  /className: 'filters vendor-form-fields'/,
  'vendor details use a responsive, named form layout',
);
assert.match(
  administration,
  /className: 'filters user-form-fields'/,
  'user administration uses a responsive, named form layout',
);
assert.match(
  administration,
  /class="card audit-panel"/,
  'audit filters and events are organized inside the dedicated review panel',
);
assert.match(
  administration,
  /className = 'card account-pin-form'/,
  'account PIN form uses the shared workflow styling',
);
assert.match(
  components,
  /\.audit-panel > \.audit-filters\s*\{[\s\S]*?display:\s*grid/,
  'audit filters reflow through a responsive grid',
);
assert.match(
  components,
  /\.vendor-form-fields\s*\{[\s\S]*?display:\s*grid/,
  'vendor fields use a deliberate desktop grid',
);
assert.match(
  components,
  /#login \.lock-card input:not\(\.hidden\)/,
  'sign-in controls use consistent full-width touch-friendly dimensions',
);
assert.doesNotMatch(
  administration,
  /style="min-height:34px;padding:4px"/,
  'role selector no longer relies on one-off inline sizing',
);
assert.match(
  authHtml,
  /class="card lock-card"/,
  'the refined sign-in composition is wired into the real application page',
);

assert.match(
  dashboard,
  /class="cash-received-value"/,
  'cash-received KPI uses a named semantic color hook rather than inline styling',
);
assert.match(
  register,
  /cash-impact-in/,
  'inflow amounts use a named semantic class instead of inline color',
);
assert.doesNotMatch(
  register,
  /style="color:var\(--ok\)"/,
  'register rows contain no one-off inline cash-impact color',
);
assert.match(
  bulk,
  /class="card bulk-review-panel"/,
  'bulk preview adopts the Studio review surface',
);
assert.match(
  bulk,
  /class="table-wrap bulk-review-table" role="region"[^>]*tabindex="0"/,
  'bulk preview is a named keyboard-scrollable table region',
);
assert.match(
  bulk,
  /class="bulk-duplicate-option"/,
  'duplicate confirmation uses a designed inline checkbox control',
);
assert.match(
  bulk,
  /class="bulk-file-input"/,
  'bulk file chooser remains keyboard reachable through a visually-hidden control',
);
assert.doesNotMatch(
  bulk,
  /style=/,
  'bulk workflow no longer relies on inline presentation styles',
);
assert.match(
  components,
  /\.bulk-review-table\s*\{[\s\S]*?overflow:\s*auto/,
  'bulk import table scrolls inside its own region instead of widening the page',
);
assert.match(
  components,
  /\.cc-controls\s*>\s*\.filters\s*\{[\s\S]*?display:\s*grid/,
  'cash-close setup controls use the shared responsive grid',
);
assert.match(
  cashClose,
  /class="card cc-controls"/,
  'cash-close setup markup exposes the responsive control surface',
);
assert.match(
  cashClose,
  /class="card cc-preview"/,
  'cash-close preview markup exposes the shared report surface',
);
assert.match(
  components,
  /\.cc-blockers\[role='alert'\]/,
  'cash-close blockers preserve their explicit alert state in the visual system',
);
assert.match(
  components,
  /\.cc-report-heading\s*\{[\s\S]*?flex-wrap:\s*wrap/,
  'cash-close report headings can reflow without clipping',
);
assert.match(
  components,
  /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition-duration:\s*0\.01ms/,
  'app and studio honor reduced-motion preferences beyond navigation alone',
);
assert.match(
  components,
  /@media \(forced-colors:\s*active\)[\s\S]*?outline:\s*3px solid Highlight/,
  'keyboard focus and controls remain discernible in forced-colors mode',
);
assert.match(
  components,
  /\.app \.table-wrap:focus-visible/,
  'scrollable work tables share a visible keyboard focus treatment',
);

console.log(
  'Design system OK — light-first palette, optional dark mode and shared workflow adoption.',
);
