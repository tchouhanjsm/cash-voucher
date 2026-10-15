# Active DOM Sink Inventory

**Last merged source baseline:** `8bd1f423700a5a392d0f672bd287e88603755d82` (main after PR #144; active source baseline 22 assignments).  
**Phase 11 Batch 3 candidate count:** 19 assignments across eight frontend modules after retiring two access-denied page templates and the Register totals/status template. CI is the executable gate; re-run it on every implementation candidate.  
**Status:** inventory drift is automatically checked; each use still requires context-specific review. This is not XSS certification.

## Reviewed HTML assignment sites

Merged main after PR #144 has 22 `innerHTML =` assignment sites across eight JavaScript modules. The Phase 11 Batch 3 candidate removes the Reports and Daily Cash Close access-denied page assignments and the Register totals/status assignment, leaving 19 active sites. Each future change requires review of data flow and a focused hostile-data regression before count/fingerprint baselines are updated.

**Current module counts:**

- features/administration.js — 5 sites: vendor, user list, settings, audit and account views; two fixed Users loading/error states now use DOM APIs.
- features/bulk.js — 2 sites on this candidate: initial shell and interactive preview; import-completion status now uses DOM APIs.
- features/cash-close.js — 4 sites on this candidate: close shell, closed report, preview and print; access-denied and loading/error states use DOM APIs.
- features/dashboard.js — 1 site: dashboard shell and financial summaries.
- features/payments.js — 3 sites on this candidate: payment form, row template and outbox banner; offline and online save confirmations now use DOM APIs.
- features/register.js — 2 sites on this candidate: register shell and rows; totals, pagination and empty/status states use DOM APIs.
- features/reports.js — 1 site on this candidate: authorized report shell and report rows/results; the access-denied state uses DOM APIs.
- features/printing.js — 1 site: printable voucher.
- Total — 19 assignment sites across eight modules on the Phase 11 Batch 3 candidate, down from 22 on merged main after PR #144 and 33 before PR #135.

The machine-readable expected counts live in `scripts/dom-sink-baseline.json`. The ordered per-assignment source fingerprints live in `scripts/dom-sink-source-baseline.json`; both baselines were updated independently in PR #135. `npm run check:dom-sinks` fails when a new sink is added, a reviewed sink disappears/changes count, a new module introduces an HTML sink, or one of the disallowed dynamic DOM APIs is used. A deliberate change requires review of its full interpolation/data flow, a focused adversarial test, and a reviewed baseline update.

**Merged in Phase 5 / PR #134:** `scripts/dom-sink-source-baseline.json` stores an ordered FNV-1a drift fingerprint of each reviewed assignment statement. `npm run check:dom-sink-source` detects interpolation, escape-helper or markup changes even when the sink count stays the same. The scanner is calibrated to the current active frontend; it is not a general-purpose JavaScript parser or a security proof.

**Merged in Phase 6 / PR #135:** five low-complexity assignments were replaced by DOM construction and `textContent`. Browser E2E sends SVG markup as a Cash Close API error and verifies it is shown literally, creates no SVG/image node, and does not execute. This is a targeted regression, not complete XSS certification.

**Merged in Phase 7 / PR #136:** preserve the 28-site count and add a hostile-but-valid report-response regression covering report text fields and CSV formula-leading content. This extends evidence for the accountant report boundary; it does not claim a confirmed XSS defect.

**Merged in Phase 8 / PR #138:** the shared modal frame is now built with DOM APIs; heading and submit labels use scalar normalization plus `textContent`. Adversarial Browser E2E supplies hostile labels and verifies inert rendering, caller-provided DOM content, and focus restoration. The independent sink-count/API and source-fingerprint gates no longer list `frontend/core/ui.js`.

## Phase 11 batch 1 — Users loading and request-failure states

The Users view no longer assigns HTML strings for its initial loading state or `listUsers` failure state. `renderUsersLoadState()` builds the heading, refresh button, polite loading message, assertive error panel, message and retry button through `createElement`, `textContent`, and `replaceChildren`. It intentionally does not display arbitrary error text from the API. Browser E2E injects an SVG payload into the API error and checks that the payload is not reflected in `#view`, no SVG/image is created in that region, no script effect fires, and the existing retry path restores the list.

The pre-Batch-1 mainline had 27 sinks; PR #143's Users status-sink retirement reduced it to 25. PR #144 reduced merged main to 22, and this Batch 3 candidate targets 19. Each reduction is incremental and leaves the remaining assignments under contextual review.

## Disallowed dynamic APIs

No active frontend module may introduce the following without an explicit security-design review and separately approved exception: `outerHTML` assignment, `insertAdjacentHTML`, `document.write`, `createContextualFragment`, `eval`, or `new Function`.

## Interpretation limits

- The baseline locks sink count and placement by file, not the safety of every interpolation expression. A changed interpolation within an existing sink still requires ordinary code review and targeted taint/XSS regression.
- Most sinks render templates and many interpolate values. The relevant value must be escaped for its output context or placed via DOM APIs; numeric display formatting is not an HTML sanitizer.
- Existing Browser E2E tests exercise hostile text for specific admin, audit, bulk, register, dashboard, receipt and cash-close surfaces. They do not cover every possible persisted field, API response or browser engine.
- The complete semantic source-to-sink review, live-host headers/CSP, live authorization and adversarial manual review remain release gates.

## Phase 11 Batch 2 — payment and bulk result states

The payment entry flow no longer builds its local/offline confirmation or server-save confirmation through HTML strings. Explicit DOM construction preserves the polite status panel, heading, explanatory message, conditional independent-approval notice, voucher number/vendor/amount summaries, Print actions and New entry action. The existing ambiguous-save recovery still finds the local panel's heading and message and can update them after the same-ID retry.

The bulk-import completion panel now uses DOM construction. It preserves imported counts and operation wording, the pending-approval notice, skipped-row notice, polite status announcement, Open register and Import more actions. Browser E2E sends hostile server-returned voucher number and vendor markup into the save confirmation and verifies that no active image/SVG nodes or script effect appears; bulk E2E verifies the result panel's accessible status and both actions.

The merged-main baseline is 25 sites; this candidate has 22 across eight modules. The two JSON baselines are updated only for these three reviewed assignments. The remaining sites still require contextual review; counts and fingerprints are not XSS certification.


## Phase 11 Batch 3 — access-denied pages and Register totals

The Reports and Daily Cash Close permission-denied states now use a shared `pageNotice()` helper that creates the heading, action container, panel and paragraph via DOM APIs. The helper assigns title/message with `textContent`; the Reports card and Cash Close muted `role=status` message are preserved. Browser E2E directly exercises these otherwise defense-in-depth renderer branches and sends hostile SVG/image strings through the helper to verify inert output.

The Register totals/status region now uses DOM construction instead of one HTML string. It preserves Paid, Received, Net, voucher count, received-total color, approval-exception message, invalid-amount message, malformed-record/field notices and the alert shown for unavailable data or invalid ranges. Existing browser cases assert the range alert, status notices, inert output and disabled CSV export.

Merged main after PR #144 has 22 sites; this candidate has 19 across eight modules. Only the three reviewed assignment fingerprints and counts are removed from the machine-readable baselines. This is not XSS certification or production-operation evidence.
