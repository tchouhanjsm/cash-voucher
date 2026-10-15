# Active DOM Sink Inventory

**Last merged source baseline:** `42ff7708535d04c15510caf90c5f93738109669e` (main after PR #141).  
**Current expected count:** 27 assignments across eight frontend modules. Dashboard statement fingerprint: `2977910e`, reflected in `scripts/dom-sink-source-baseline.json`. CI is the executable gate; re-run it on every implementation candidate.  
**Status:** inventory drift is automatically checked; each use still requires context-specific review. This is not XSS certification.

## Reviewed HTML assignment sites

The current main baseline has 27 `innerHTML =` assignment sites across eight JavaScript modules. Phase 10 changes the Dashboard assignment fingerprint to `2977910e`. Each future change requires review of data flow and a focused hostile-data regression before count/fingerprint baselines are updated.

**Current module counts:**

- features/administration.js — 7 sites: vendor, user, settings, audit, account and administration views.
- features/bulk.js — 3 sites: bulk shell, preview rows and import results.
- features/cash-close.js — 5 sites: shell, close details, preview and print; loading/error states use DOM APIs.
- features/dashboard.js — 1 site: dashboard shell and financial summaries.
- features/payments.js — 5 sites: payment form/rows and complex save/queue feedback; text-only validation/storage errors use DOM APIs.
- features/register.js — 3 sites: register shell, totals and rows; pagination uses DOM APIs.
- features/reports.js — 2 sites: report shell and report rows/results.
- features/printing.js — 1 site: printable voucher.
- Total — 27 assignment sites across eight modules, down from 33 before PR #135.

The machine-readable expected counts live in `scripts/dom-sink-baseline.json`. The ordered per-assignment source fingerprints live in `scripts/dom-sink-source-baseline.json`; both baselines were updated independently in PR #135. `npm run check:dom-sinks` fails when a new sink is added, a reviewed sink disappears/changes count, a new module introduces an HTML sink, or one of the disallowed dynamic DOM APIs is used. A deliberate change requires review of its full interpolation/data flow, a focused adversarial test, and a reviewed baseline update.

**Merged in Phase 5 / PR #134:** `scripts/dom-sink-source-baseline.json` stores an ordered FNV-1a drift fingerprint of each reviewed assignment statement. `npm run check:dom-sink-source` detects interpolation, escape-helper or markup changes even when the sink count stays the same. The scanner is calibrated to the current active frontend; it is not a general-purpose JavaScript parser or a security proof.

**Merged in Phase 6 / PR #135:** five low-complexity assignments were replaced by DOM construction and `textContent`. Browser E2E sends SVG markup as a Cash Close API error and verifies it is shown literally, creates no SVG/image node, and does not execute. This is a targeted regression, not complete XSS certification.

**Merged in Phase 7 / PR #136:** preserve the 28-site count and add a hostile-but-valid report-response regression covering report text fields and CSV formula-leading content. This extends evidence for the accountant report boundary; it does not claim a confirmed XSS defect.

**Merged in Phase 8 / PR #138:** the shared modal frame is now built with DOM APIs; heading and submit labels use scalar normalization plus `textContent`. Adversarial Browser E2E supplies hostile labels and verifies inert rendering, caller-provided DOM content, and focus restoration. The independent sink-count/API and source-fingerprint gates no longer list `frontend/core/ui.js`.

## Disallowed dynamic APIs

No active frontend module may introduce the following without an explicit security-design review and separately approved exception: `outerHTML` assignment, `insertAdjacentHTML`, `document.write`, `createContextualFragment`, `eval`, or `new Function`.

## Interpretation limits

- The baseline locks sink count and placement by file, not the safety of every interpolation expression. A changed interpolation within an existing sink still requires ordinary code review and targeted taint/XSS regression.
- Most sinks render templates and many interpolate values. The relevant value must be escaped for its output context or placed via DOM APIs; numeric display formatting is not an HTML sanitizer.
- Existing Browser E2E tests exercise hostile text for specific admin, audit, bulk, register, dashboard, receipt and cash-close surfaces. They do not cover every possible persisted field, API response or browser engine.
- The complete semantic source-to-sink review, live-host headers/CSP, live authorization and adversarial manual review remain release gates.
