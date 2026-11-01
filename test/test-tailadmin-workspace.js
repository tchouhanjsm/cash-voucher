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
const payments = read('frontend/features/payments.js');
const register = read('frontend/features/register.js');
const reports = read('frontend/features/reports.js');
const administration = read('frontend/features/administration.js');
const cashClose = read('frontend/features/cash-close.js');
const bulk = read('frontend/features/bulk.js');
const onboarding = read('frontend/features/onboarding.js');

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
assert.match(
  styles,
  /--workspace-muted:\s*var\(--muted\)/,
  'workspace secondary text retains the audited contrast token',
);
assert.match(
  styles,
  /background:\s*var\(--nav-bg\)/,
  'navigation surfaces preserve the saved login palette',
);
assert.match(
  styles,
  /background:\s*var\(--nav-active\)/,
  'selected navigation state preserves the saved login palette',
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
  /\.dashboard-view \.dashboard-trend__line/,
  'dashboard trend line uses the workspace accent',
);
assert.match(
  styles,
  /\.dashboard-view \.dashboard-trend__area/,
  'dashboard trend surface has a token-driven area fill',
);
assert.match(
  styles,
  /\.dashboard-view \.dashboard-period-comparison/,
  'period comparisons use neutral semantics instead of green/red financial judgement',
);
assert.match(styles, /min-height:\s*44px/, 'workspace preserves the 44px touch target baseline');
assert.match(styles, /@media \(max-width:\s*800px\)/, 'workspace defines a mobile shell');
assert.match(
  styles,
  /dashboard-stats--owner[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/,
  'owner dashboard uses two KPI columns below the tablet breakpoint',
);
assert.match(
  styles,
  /dashboard-stats--staff[\s\S]*?repeat\(5, minmax\(0, 1fr\)\)/,
  'staff dashboard uses five KPI columns on wide desktop',
);
assert.match(
  styles,
  /@media screen and \(max-width: 440px\)[\s\S]*?dashboard-stats--owner > \.stat[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
  'small-screen KPI cards use a full-width content row inside the two-column grid',
);
assert.match(
  styles,
  /@media screen and \(max-width: 440px\)[\s\S]*?dashboard-stats--staff > \.stat > b[\s\S]*?overflow-wrap: anywhere/,
  'long staff INR values can wrap without widening the viewport',
);
assert.match(
  styles,
  /#accountReportForm \.account-report-controls[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/,
  'support report form retains a specific single-column phone layout',
);
assert.match(
  styles,
  /#accountReportForm \.account-report-controls > button\[type='submit'\][\s\S]*?width: 100%/,
  'support report submit action fills its mobile control column',
);
assert.match(
  styles,
  /#accountReportForm \.account-report-controls[\s\S]*?padding: 0;[\s\S]*?border: 0;/,
  'support form does not add nested filter padding around its full-width phone action',
);
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

assert.match(
  worker,
  /const C = 'cv2-v46'/,
  'phase two screen implementation advances the app-shell cache',
);
assert.match(
  worker,
  /'frontend-workspace\.css'/,
  'new stylesheet is in the offline shell allowlist',
);
assert.match(build, /'frontend-workspace\.css'/, 'static customer build publishes the stylesheet');

assert.match(
  dashboard,
  /dashboard-analysis-grid/,
  'dashboard analytics use a deliberate primary/secondary analysis layout',
);
assert.match(
  payments,
  /entry-form-workspace/,
  'new voucher uses a real multi-column entry workspace',
);
assert.match(
  payments,
  /entry-guidance/,
  'new voucher presents cash-impact controls beside the live batch summary',
);
assert.match(
  register,
  /register-filter-grid/,
  'register separates search from structured server-side refinements',
);
assert.match(
  register,
  /register-results-summary/,
  'register gives server totals and results a dedicated hierarchy',
);
assert.match(reports, /data-report-range/, 'reports expose quick date presets');
assert.match(
  reports,
  /report-movement-trend/,
  'reports render an actual movement trend from selected rows',
);
assert.match(
  reports,
  /isBusinessDate\(row.date\)/,
  'report chart groups only validated business dates',
);
assert.match(payments, /batchProgress/, 'new voucher exposes batch completion progress');
assert.match(payments, /batchReadiness/, 'new voucher explains incomplete entry rows');
const rowRendererStart = payments.indexOf('function createEntryRow()');
const rowRendererEnd = payments.indexOf('function labelRows()', rowRendererStart);
assert.ok(rowRendererStart >= 0 && rowRendererEnd > rowRendererStart);
const rowRenderer = payments.slice(rowRendererStart, rowRendererEnd);
assert.doesNotMatch(rowRenderer, /innerHTML|insertAdjacentHTML|outerHTML/);
assert.match(rowRenderer, /textContent\s*=/);
assert.match(rowRenderer, /catOptionsNode\('Other', NT\)/);
assert.match(rowRenderer, /option\.textContent = PAYMENT_METHOD_LABELS\[method\]/);
assert.match(administration, /<label for="vn">Vendor name/);
assert.match(administration, /<label for="vdcat">Default category/);
assert.match(administration, /<label for="un">Name/);
assert.match(administration, /<label for="ue">Email address/);
assert.match(administration, /<label for="ur">User role/);
assert.match(administration, /<label for="up">Temporary password/);
assert.match(
  register,
  /registerPageMeta/,
  'register exposes loaded versus server-matched page totals',
);
assert.match(
  reports,
  /report-method-bar/,
  'reports visualize server-derived payment-method totals',
);
for (const [source, pattern, description] of [
  [administration, /settings-layout/, 'settings use an organized workspace layout'],
  [administration, /audit-panel/, 'audit uses a records workspace'],
  [bulk, /bulk-review-panel/, 'bulk import has a distinct review workspace'],
  [cashClose, /cc-metrics/, 'cash close retains reconciliation metrics'],
  [onboarding, /onboarding-summary/, 'onboarding exposes readiness summaries'],
])
  assert.match(source, pattern, description);
for (const selector of [
  '.settings-layout',
  '.settings-diagnostics',
  '.audit-panel',
  '.audit-filters',
  '.bulk-import-panel',
  '.bulk-review-panel',
  '.cc-preview',
  '.cc-metrics',
  '.cc-method-grid',
  '.onboarding-page',
  '.onboarding-summary',
  '.onboarding-steps',
])
  assert.ok(styles.includes(selector), 'workspace styling covers ' + selector);

// Dashboard amounts and chart data remain owned by the validated server read model.
assert.match(dashboard, /summary\.bookBalance/, 'book balance remains API-derived');
assert.match(dashboard, /summary\.trend/, 'trend data remains API-derived');
assert.match(dashboard, /summary\.topVendors/, 'vendor breakdown remains API-derived');
assert.match(
  dashboard,
  /dashboard-trend__gridline/,
  'dashboard trend exposes horizontal value guides',
);
assert.match(dashboard, /dashboard-trend__point/, 'dashboard trend exposes exact-value SVG points');
assert.match(
  dashboard,
  /aria-labelledby="dashboardTrendChartTitle dashboardTrendChartDescription"/,
  'dashboard chart has a title and descriptive accessible name',
);
assert.match(
  dashboard,
  /dashboard-trend__scroll/,
  'dashboard chart remains legible in a keyboard-scrollable region',
);
assert.match(
  dashboard,
  /percentage change unavailable/,
  'zero previous-period totals do not claim no historical data',
);
assert.match(
  dashboard,
  /No change vs previous/,
  'flat period comparisons are not presented as downward movement',
);

console.log(
  'TailAdmin-inspired workspace OK — local design layer, responsive states, data integrity and PWA integration.',
);
