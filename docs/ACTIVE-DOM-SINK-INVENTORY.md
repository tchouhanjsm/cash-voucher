# Active DOM Sink Inventory

**Last merged source baseline:** `61e46989032985fba54ceb48d768ab57430aa48a` (main after PR #147; active source baseline 17 assignments).  
**Phase 11 Batch 4 follow-up:** PR #147 is merged; 17 assignments remain across eight frontend modules and the explicit Change PIN submit type changes no sink or fingerprint count. CI is the executable gate; re-run it on every implementation candidate.  
**Status:** inventory drift is automatically checked; each use still requires context-specific review. This is not XSS certification.

## Reviewed HTML assignment sites

Merged main after PR #147 has 17 `innerHTML =` assignment sites across eight JavaScript modules. PR #146 retired the My Account profile/PIN page and outbox banner/review-list assignment. The Phase 11 Batch 4 follow-up PR #147 adds explicit submit semantics for the PIN form without changing the sink count. Future sink changes still require contextual review and focused hostile-data regression before baseline updates.

**Current module counts:**

- features/administration.js — 4 sites on this candidate: vendor, user list, settings and audit views; Users status states and My Account now use DOM APIs.
- features/bulk.js — 2 sites on this candidate: initial shell and interactive preview; import-completion status now uses DOM APIs.
- features/cash-close.js — 4 sites on this candidate: close shell, closed report, preview and print; access-denied and loading/error states use DOM APIs.
- features/dashboard.js — 1 site: dashboard shell and financial summaries.
- features/payments.js — 2 sites on this candidate: payment form and row template; save confirmations and the outbox banner use DOM APIs.
- features/register.js — 2 sites on this candidate: register shell and rows; totals, pagination and empty/status states use DOM APIs.
- features/reports.js — 1 site on this candidate: authorized report shell and report rows/results; the access-denied state uses DOM APIs.
- features/printing.js — 1 site: printable voucher.
- Total — 17 assignment sites across eight modules on the Phase 11 Batch 4 candidate, down from 19 on merged main after PR #145 and 33 before PR #135.

The machine-readable expected counts live in `scripts/dom-sink-baseline.json`. The ordered per-assignment source fingerprints live in `scripts/dom-sink-source-baseline.json`; both baselines were updated independently in PR #135. `npm run check:dom-sinks` fails when a new sink is added, a reviewed sink disappears/changes count, a new module introduces an HTML sink, or one of the disallowed dynamic DOM APIs is used. A deliberate change requires review of its full interpolation/data flow, a focused adversarial test, and a reviewed baseline update.

**Merged in Phase 5 / PR #134:** `scripts/dom-sink-source-baseline.json` stores an ordered FNV-1a drift fingerprint of each reviewed assignment statement. `npm run check:dom-sink-source` detects interpolation, escape-helper or markup changes even when the sink count stays the same. The scanner is calibrated to the current active frontend; it is not a general-purpose JavaScript parser or a security proof.

**Merged in Phase 6 / PR #135:** five low-complexity assignments were replaced by DOM construction and `textContent`. Browser E2E sends SVG markup as a Cash Close API error and verifies it is shown literally, creates no SVG/image node, and does not execute. This is a targeted regression, not complete XSS certification.

**Merged in Phase 7 / PR #136:** preserve the 28-site count and add a hostile-but-valid report-response regression covering report text fields and CSV formula-leading content. This extends evidence for the accountant report boundary; it does not claim a confirmed XSS defect.

**Merged in Phase 8 / PR #138:** the shared modal frame is now built with DOM APIs; heading and submit labels use scalar normalization plus `textContent`. Adversarial Browser E2E supplies hostile labels and verifies inert rendering, caller-provided DOM content, and focus restoration. The independent sink-count/API and source-fingerprint gates no longer list `frontend/core/ui.js`.

## Phase 11 batch 1 — Users loading and request-failure states

The Users view no longer assigns HTML strings for its initial loading state or `listUsers` failure state. `renderUsersLoadState()` builds the heading, refresh button, polite loading message, assertive error panel, message and retry button through `createElement`, `textContent`, and `replaceChildren`. It intentionally does not display arbitrary error text from the API. Browser E2E injects an SVG payload into the API error and checks that the payload is not reflected in `#view`, no SVG/image is created in that region, no script effect fires, and the existing retry path restores the list.

The pre-Batch-1 mainline had 27 sinks; PR #143 reduced it to 25, PR #144 to 22, PR #145 to 19, and PR #146 to 17. PR #147 fixed the Change PIN submit semantics without changing the inventory. Main after PR #147 retains 17 assignments across eight modules; each remaining assignment still requires contextual review.

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

Merged main after PR #147 has 17 sites across eight modules. PR #147 does not change counts or fingerprints; it fixes the explicit submit-type regression discovered by Browser E2E. The remaining templates still require contextual review; this is not XSS certification or production-operation evidence.

## Phase 11 Batch 4 — My Account and offline queue status

My Account no longer assembles account identity, property label, profile actions and Change PIN form with an HTML template. The renderer scalar-normalizes profile values and writes all identity text through `textContent`; existing `#pf`, `#po`, `#pn`, install/sign-out action keys and delegated submit semantics remain.

The outbox banner and queued/rejected entry details now use DOM nodes. Queue messages, pending/rejected vendor/amount/date/failure values and overflow notices are text, while Retry, Export, Import, Sign in to sync, Export & remove and Clear my queued entries retain their `data-act` keys. E2E tampering of locally stored payee text must remain inert in both the banner and expanded review list.

Merged main after PR #147 has 17 sites across eight modules. PR #147 fixes Change PIN submit semantics without changing the sink count; the local queue still requires real-device durability/recovery checks.

## Phase 11 Batch 4 follow-up — Change PIN submit semantics

PR #146's Browser E2E on exact head `c1c56053cee6f1daaa028ee3acc3a5696c15821c` reported 357 passed and one failed check because the new DOM-built Change PIN button omitted an explicit `type="submit"` attribute. PR #147 sets `submit.type = 'submit'`; the sink inventory remains 17 assignments across eight modules. The fix passed exact-head CI/quality, Browser E2E (358 checks, 0 failures) and Full Flight Test (281 backend checks plus 358 browser checks, 0 failures) on `eb473402dca0cbdc085af1f961ca00e9b70705d8`.
