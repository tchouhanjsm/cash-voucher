'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const palette = read('style.css');
const components = read('frontend-ui-kit.css');
const theme = read('frontend/core/theme.js');
const auth = read('frontend/features/auth.js');
const dashboard = read('frontend/features/dashboard.js');
const ui = read('frontend/core/ui.js');
const payments = read('frontend/features/payments.js');
const printing = read('frontend/features/printing.js');
const administration = read('frontend/features/administration.js');
const bulk = read('frontend/features/bulk.js');
const reports = read('frontend/features/reports.js');
const register = read('frontend/features/register.js');
const authHtml = read('index.html');
const cashClose = read('frontend/features/cash-close.js');
const navigation = read('frontend/features/navigation.js');
const shell = read('frontend/features/shell.js');
const serviceWorker = read('sw.js');
const pwa = read('frontend/core/pwa.js');
const unsavedWork = read('frontend/core/unsaved-work.js');

assert.match(palette, /--bg:\s*#edf1f6;/, 'main canvas matches the sign-in canvas');
assert.match(palette, /--card:\s*#ffffff;/, 'workspace cards match the white sign-in panel');
assert.match(palette, /--brand:\s*#1f2a44;/, 'primary actions match the sign-in navy');
assert.match(palette, /--nav-bg:\s*#f7f9fc;/, 'sidebar uses the sign-in neutral palette');
assert.match(
  palette,
  /--nav-active-ink:\s*#224f81;/,
  'active light navigation has dedicated text color',
);
assert.match(palette, /:root\[data-theme='dark'\]/, 'explicit dark preference remains supported');
assert.match(
  palette,
  /:root:not\(\[data-theme='dark'\]\)\[data-palette='blush'\]/,
  'blush login theme has matching authenticated-workspace tokens',
);
assert.match(
  palette,
  /:root:not\(\[data-theme='dark'\]\)\[data-palette='mint'\]/,
  'mint login theme has matching authenticated-workspace tokens',
);
assert.match(
  theme,
  /const PALETTE_STORAGE_KEY = 'cv\.palette'/,
  'selected login palette is persisted separately from light/dark preference',
);
assert.match(
  theme,
  /document\.documentElement\.dataset\.palette = selected/,
  'the selected palette is applied to the authenticated application root',
);
assert.match(
  auth,
  /setPalette\(theme\)/,
  'login swatch selection updates the shared application palette',
);
assert.match(
  components,
  /--ui-focus-shadow: 0 0 0 3px color-mix\(in srgb, var\(--focus\)/,
  'keyboard focus halo follows the selected login accent',
);
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
  /\.dashboard-view \.stat > \.stat-ic\s*\{/,
  'dashboard KPI icons have a dedicated positioning hook',
);
assert.match(
  components,
  /\.dashboard-view \.stat > \.stat-ic\s*\{[^}]*position:\s*static;[^}]*align-self:\s*start/,
  'dashboard KPI icons stay in grid flow and cannot overlap labels or values',
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
  /No dashboard issues need your attention right now\./,
  'the clear dashboard state uses concise operator-facing copy',
);
assert.doesNotMatch(
  dashboard,
  /This does not verify backups, the full recovery queue, or release readiness/,
  'developer-only release caveats do not leak into the normal dashboard',
);
assert.match(
  components,
  /\.dashboard-view \.dashboard-stats--owner\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  'six owner KPIs have a balanced three-column desktop grid',
);
assert.match(
  components,
  /\.dashboard-view \.dashboard-stats--staff\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/,
  'five staff KPIs retain a balanced single-row desktop grid',
);
assert.match(
  dashboard,
  /dashboard-breakdowns/,
  'vendor and category analysis stay in shared dashboard layout',
);
assert.match(
  dashboard,
  /periodIsEmpty/,
  'dashboard detects an empty date-scoped summary only from validated counts',
);
assert.match(
  dashboard,
  /No approved payments or recorded receipts are included in the selected period/,
  'empty-period copy is precise about approved totals and the selected dates',
);
assert.match(
  dashboard,
  /data-k="RECEIPT"/,
  'empty-period actions can begin a receipt as well as a payment',
);
assert.match(
  components,
  /\.dashboard-view \.dashboard-empty-state\s*\{[\s\S]*?grid-template-columns:/,
  'the empty-period experience has a dedicated responsive two-column surface',
);
assert.match(
  components,
  /\.dashboard-empty-state__steps li\s*\{[\s\S]*?grid-template-columns:/,
  'empty-period guidance uses an aligned step layout',
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
  /\.page-header h1\s*\{[^}]*width:\s*fit-content;[^}]*max-width:\s*100%;/,
  'focused page heading keeps its visible focus ring around the title rather than the full row',
);
assert.match(
  components,
  /#nf\.entry-form\s*\{/,
  'new payment and receipt forms adopt shared panel geometry',
);
assert.match(
  components,
  /#nf\.entry-form \.erow \.top\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.4fr\)\s*minmax\(120px,\s*180px\)\s*minmax\(150px,\s*1fr\)\s*44px;/,
  'desktop payment row gives payee, amount, note and remove separate grid tracks',
);
assert.match(
  components,
  /@media \(max-width: 800px\)[\s\S]*?#nf\.entry-form \.erow \.entry-note-field\s*\{\s*grid-column:\s*1 \/ -1;\s*grid-row:\s*2;/,
  'tablet payment row moves the optional note to a full-width second line',
);
assert.match(
  components,
  /@media \(max-width: 440px\)[\s\S]*?#nf\.entry-form \.erow \.entry-note-field\s*\{\s*grid-column:\s*1 \/ -1;\s*grid-row:\s*3;/,
  'phone payment row places the optional note below payee, amount and remove action',
);
assert.match(
  payments,
  /entry-payee-field'><span>[\s\S]*?entry-amount-field'><span>Amount \(₹\)<\/span>/,
  'New Entry includes persistent visible payee and amount labels',
);
assert.match(
  payments,
  /entry-note-field'><span>Note<\/span>/,
  'New Entry includes a visible note label instead of relying on its placeholder',
);
assert.match(
  register,
  /register-empty-state__title[\s\S]*?Create first entry/,
  'Register has a deliberate first-use state and a primary creation action',
);
assert.match(
  components,
  /\.register-results-card\.is-empty \.table-wrap\s*\{\s*display:\s*none;/,
  'Register hides empty table headers when there are no rows to show',
);
assert.match(
  authHtml,
  /id="themeToggleLabel"/,
  'account theme control has a stable label separate from its icon',
);
assert.match(
  authHtml,
  /<use href="#i-key"><\/use>/,
  'account menu uses local SVG assets instead of emoji icons',
);
assert.match(
  theme,
  /themeToggleIcon[\s\S]*?#i-sun/,
  'theme switching updates the local SVG icon and visible label together',
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
  /className = 'card account-password-form'/,
  'account password form uses the shared workflow styling',
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
  palette,
  /\.auth-login \.auth-login__control input\s*\{[^}]*min-height:\s*48px/,
  'new sign-in controls use consistent full-width touch-friendly dimensions',
);
assert.doesNotMatch(
  administration,
  /style="min-height:34px;padding:4px"/,
  'role selector no longer relies on one-off inline sizing',
);
assert.match(
  authHtml,
  /class="auth-login__shell"/,
  'the refined sign-in shell is wired into the real application page',
);
assert.match(
  authHtml,
  /class="auth-login__story"/,
  'the sign-in story panel is wired into the real application page',
);
assert.match(
  authHtml,
  /class="auth-login__panel"/,
  'the sign-in form panel is wired into the real application page',
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
assert.doesNotMatch(bulk, /style=/, 'bulk workflow no longer relies on inline presentation styles');
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
assert.match(
  components,
  /@media \(prefers-contrast:\s*more\)/,
  'high-contrast preference receives an explicit component treatment',
);
assert.match(
  components,
  /\.app #view > \*\s*\{[\s\S]*?min-width:\s*0/,
  'all top-level workflow panels can shrink inside narrow app viewports',
);
assert.match(
  components,
  /\.app #view \.table-wrap\s*\{[\s\S]*?overflow-x:\s*auto/,
  'all workflow tables remain in horizontally scrollable local regions',
);
assert.match(
  components,
  /\.app #view \.page-header-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/,
  'page-header actions wrap instead of widening narrow screens',
);
assert.match(
  navigation,
  /function focusPageHeading\(\)[\s\S]*?heading\.focus\(\{ preventScroll: true \}\)/,
  'the navigation module focuses a real destination heading without another scroll',
);
assert.match(
  navigation,
  /if \(focusHeading\) \{[\s\S]*?focusPageHeading\(\)/,
  'heading focus is opt-in so background refresh does not deliberately refocus the page',
);
assert.match(
  navigation,
  /Promise\.resolve\(renderResult\)[\s\S]*?renderId !== activeViewRenderId[\s\S]*?active === document\.body/,
  'asynchronous screen rendering restores lost focus only for the current route render',
);
assert.match(
  navigation,
  /go\(button\.dataset\.v, \{ focusHeading: true \}\)/,
  'primary navigation requests destination-heading focus',
);
assert.match(
  navigation,
  /go\(view, \{ focusHeading: true \}\)/,
  'the More sheet requests destination-heading focus',
);
assert.match(
  shell,
  /go\(item\.dataset\.go, \{ focusHeading: true \}\)/,
  'user-menu page navigation requests destination-heading focus',
);
assert.match(
  components,
  /\.app #view \.page-header h1:focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--focus\)/,
  'keyboard focus on a page heading is visibly identified',
);
assert.match(
  serviceWorker,
  /const C = 'cv2-v32'/,
  'PWA cache revision advances with empty-period dashboard guidance and existing update safeguards',
);
assert.match(serviceWorker, /frontend\/core\/unsaved-work\.js/);
assert.match(unsavedWork, /This voucher draft has unsaved changes/);
assert.match(unsavedWork, /beforeunload/);
assert.match(palette, /\.unsaved-draft-notice\s*\{/);
assert.match(pwa, /confirmDiscardUnsavedWork/);
assert.match(
  authHtml,
  /id="appUpdateNotice"[\s\S]*id="appUpdateApply"[\s\S]*id="appUpdateLater"/,
  'the application includes an accessible update notice with apply and dismiss controls',
);
assert.match(
  pwa,
  /postMessage\(\{ type: 'SKIP_WAITING' \}\)/,
  'service-worker activation follows the user-controlled update action',
);
assert.match(
  pwa,
  /installingWorker\.state === 'installed'/,
  'the update notice appears after the new worker finishes installation',
);
assert.match(
  payments,
  /function paymentMethodOptions\(selected = 'CASH'\)/,
  'staff payment entry defaults to Cash',
);
assert.match(
  payments,
  /NT === 'RECEIPT' \? 'Received via' : 'Paid via'/,
  'payment method label reflects receipt vs payment direction',
);
assert.match(
  printing,
  /isIn\(voucher\) \? 'Received via' : 'Paid via'/,
  'printed voucher labels the payment rail by direction',
);
assert.doesNotMatch(
  printing,
  /voucher\.cashImpact/,
  'printed voucher never exposes internal cash-impact enum values',
);
assert.match(
  payments,
  /PAYMENT_METHODS\.includes\(paymentMethod\)/,
  'payment entries only accept Cash, UPI or Bank transfer',
);
assert.match(
  payments,
  /Enter who was paid before adding another payment/,
  'new rows require the previous row to be complete',
);
assert.match(
  payments,
  /function categoryForPayee\(name\)/,
  'saved payee defaults can resolve expense category',
);
assert.match(
  payments,
  /function methodForPayee\(name\)/,
  'saved payee defaults can resolve payment method',
);
assert.match(
  reports,
  /dateRangeInvalid:\s*false/,
  'report date-range validation has an explicit state separate from API errors',
);
assert.match(
  reports,
  /aria-describedby="report-date-range-error"/,
  'invalid report date fields reference the shared date-range alert',
);
assert.match(
  reports,
  /id="report-output" class="report-output" aria-busy="\$\{R\.loading \? 'true' : 'false'\}"/,
  'report results expose the asynchronous busy state on a persistent wrapper',
);
assert.match(
  components,
  /\.report-filters \[aria-invalid='true'\]/,
  'invalid date filters have a visible design-system treatment',
);

assert.match(
  reports,
  /let activeReportRequestId = 0;/,
  'report loads have a monotonically increasing request identity',
);
assert.match(
  reports,
  /requestId !== activeReportRequestId/,
  'out-of-order report responses cannot replace a newer result or error',
);
assert.match(
  reports,
  /if \(S\.view === 'reports'\) render\(\);/,
  'report completion only renders into the active Reports route',
);
assert.match(
  administration,
  /if \(S\.view !== 'users'\) return;/,
  'a Users request begins only for the active Users route',
);
assert.match(
  administration,
  /requestId !== usersRequestId \|\| S\.view !== 'users'/,
  'stale Users responses cannot replace another route or a newer Users result',
);
assert.match(
  administration,
  /if \(S\.view === 'vend'\) vendors\(\);/,
  'vendor mutations refresh only the still-active Vendors route',
);
assert.match(
  administration,
  /if \(S\.view === 'set'\) settings\(\);/,
  'saving Settings does not redraw over a route opened while the save was pending',
);

console.log(
  'Design system OK — light-first palette, optional dark mode and shared workflow adoption.',
);
