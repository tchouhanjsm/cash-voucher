# Active DOM Sink Inventory

**Last merged source baseline:** `db3c2cfd08ddbd1a80d37bdc67557b719446caaf` (main after PR #143; active source baseline 25 assignments).  
**Phase 11 Batch 2 candidate count:** 22 assignments across eight frontend modules after retiring two payment-save confirmation templates and one bulk-import completion template. CI is the executable gate; re-run it on every implementation candidate.  
**Status:** inventory drift is automatically checked; each use still requires context-specific review. This is not XSS certification.

## Reviewed HTML assignment sites

Merged main after PR #143 has 25 `innerHTML =` assignment sites across eight JavaScript modules. The Phase 11 Batch 2 candidate removes two payment-save result assignments and one bulk-import completion assignment, leaving 22 active sites. Each future change requires review of data flow and a focused hostile-data regression before count/fingerprint baselines are updated.

**Current module counts:**

- features/administration.js — 5 sites: vendor, user list, settings, audit and account views; two fixed Users loading/error states now use DOM APIs.
- features/bulk.js — 2 sites on this candidate: initial shell and interactive preview; import-completion status now uses DOM APIs.
- features/cash-close.js — 5 sites: shell, close details, preview and print; loading/error states use DOM APIs.
- features/dashboard.js — 1 site: dashboard shell and financial summaries.
- features/payments.js — 3 sites on this candidate: payment form, row template and outbox banner; offline and online save confirmations now use DOM APIs.
- features/register.js — 3 sites: register shell, totals and rows; pagination uses DOM APIs.
- features/reports.js — 2 sites: report shell and report rows/results.
- features/printing.js — 1 site: printable voucher.
- Total — 22 assignment sites across eight modules on the Phase 11 Batch 2 candidate, down from 25 on merged main after PR #143 and 33 before PR #135.

The machine-readable expected counts live in `scripts/dom-sink-baseline.json`. The ordered per-assignment source fingerprints live in `scripts/dom-sink-source-baseline.json`; both baselines were updated independently in PR #135. `npm run check:dom-sinks` fails when a new sink is added, a reviewed sink disappears/changes count, a new module introduces an HTML sink, or one of the disallowed dynamic DOM APIs is used. A deliberate change requires review of its full interpolation/data flow, a focused adversarial test, and a reviewed baseline update.

**Merged in Phase 5 / PR #134:** `scripts/dom-sink-source-baseline.json` stores an ordered FNV-1a drift fingerprint of each reviewed assignment statement. `npm run check:dom-sink-source` detects interpolation, escape-helper or markup changes even when the sink count stays the same. The scanner is calibrated to the current active frontend; it is not a general-purpose JavaScript parser or a security proof.

**Merged in Phase 6 / PR #135:** five low-complexity assignments were replaced by DOM construction and `textContent`. Browser E2E sends SVG markup as a Cash Close API error and verifies it is shown literally, creates no SVG/image node, and does not execute. This is a targeted regression, not complete XSS certification.

**Merged in Phase 7 / PR #136:** preserve the 28-site count and add a hostile-but-valid report-response regression covering report text fields and CSV formula-leading content. This extends evidence for the accountant report boundary; it does not claim a confirmed XSS defect.

**Merged in Phase 8 / PR #138:** the shared modal frame is now built with DOM APIs; heading and submit labels use scalar normalization plus `textContent`. Adversarial Browser E2E supplies hostile labels and verifies inert rendering, caller-provided DOM content, and focus restoration. The independent sink-count/API and source-fingerprint gates no longer list `frontend/core/ui.js`.

## Phase 11 batch 1 — Users loading and request-failure states

The Users view no longer assigns HTML strings for its initial loading state or `listUsers` failure state. `renderUsersLoadState()` builds the heading, refresh button, polite loading message, assertive error panel, message and retry button through `createElement`, `textContent`, and `replaceChildren`. It intentionally does not display arbitrary error text from the API. Browser E2E injects an SVG payload into the API error and checks that the payload is not reflected in `#view`, no SVG/image is created in that region, no script effect fires, and the existing retry path restores the list.

The mainline baseline was 27 sinks; this candidate has 25. The change removes two avoidable HTML parsing assignments without changing financial or authorization behavior. The 25 remaining assignments still require context-specific review.

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
