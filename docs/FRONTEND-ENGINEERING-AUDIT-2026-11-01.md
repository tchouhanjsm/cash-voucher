# Cash Voucher — Frontend Engineering Audit

**Audit date:** 1 November 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** client-main  
**Audited integration SHA:** 05402ba9e8b811ea4f479f37617ab6f3b0fdb4ac  
**Primary implementation PR:** [#256 — harden startup, vendor identity and duplicate payments](https://github.com/tchouhanjsm/cash-voucher/pull/256) — merged 31 October 2026.

## Executive assessment

The critical vendor-identity, startup/session, duplicate-confirmation, offline queue and Register paging issues in the supplied engineering brief were already addressed by PR #256. This audit rechecked the current integration source rather than assuming the original observations were still true.

Two current defects were confirmed and are addressed by the accompanying follow-up:
1. Recent verified-payee chips inherited the compact-button 32px minimum height, short of the specified 44px target.
2. One Browser E2E assertion used a vendor-name selector that matched multiple Register rows, causing a Playwright strict-mode failure. The regression now scopes the edited row by its unique displayed voucher number.

No financial/accounting rule, historical voucher, spreadsheet, Apps Script deployment, or production record was changed.

## Finding disposition

| Area | Current source finding | Disposition |
|---|---|---|
| Malformed historical Mukesh suggestion | Recent suggestions no longer take arbitrary free-text voucher names. They require a vendorId, active voucher of the current entry type, and a unique active vendor-master record. | Root cause addressed in PR #256. No historical spelling correction or data mutation was attempted. |
| Verified and one-time payees | Frontend differentiates an active, uniquely matched vendor from a one-time payee. The backend validates registered vendor identity and supports explicit one-time records. Existing historical rows remain unclassified rather than being silently backfilled. | Addressed in PR #256; real sheet migration remains a deployment gate. |
| New Entry labels and selector | Row fields have persistent labels; the vendor input uses a native datalist populated from active vendors, with explicit registered/one-time status. Recent chips are real buttons with full-name title and accessible label. | Existing experience retained; follow-up raises chip hit area to 44px and adds a browser assertion. Native datalist behavior still warrants assistive-technology/device testing. |
| Startup and expired session | frontend/main.js awaits session restoration/navigation startup and restores login on unsuccessful resume or initialization failure. Navigation distinguishes session errors, network/offline recovery and other failures. | Source-level fix present in PR #256. Live authenticated, expired-token and offline profiles were not exercised in this audit. |
| Duplicate payment safeguards | Client confirmation fingerprint includes type, date, vendor ID/type, normalized payee and paise amount. Server preflight returns current candidate details and a short-lived confirmation token; create path rechecks under the write lock. Same-client-ID idempotency remains separate. | Source-level fix present in PR #256. Multi-user concurrency against the live Apps Script ledger remains unverified. |
| Service worker | Current worker uses an explicit shell-asset allowlist, navigation-only HTML fallback, pass-through for private/cross-origin APIs and non-GET requests, explicit precache failure propagation, and versioned cache cleanup. | Existing policy and regression tests retained; no new worker defect confirmed. |
| Register scale and financial totals | Register uses server-side page/read-model contracts. The seeded test confirms bootstrap is bounded at 200 rows while the complete movement report returns all matching rows and the complete total. | Existing design retained; no cosmetic truncation introduced. Live Sheets-scale latency and complete export behavior were not measured here. |
| Accessibility and responsive design | Persistent labels, dialog semantics/focus handling, keyboard checks, 44px navigation/register action targets and responsive reflow are covered in selected E2E flows. Recent vendor chips were the confirmed 32px exception fixed by this follow-up. | Targeted improvement; **not** a WCAG 2.2 AA certification. Full screen-reader, browser and device coverage remains outstanding. |
| Dynamic HTML / injection | Current source contains 17 innerHTML assignments across eight feature modules. The repository maintains sink-count and source-fingerprint drift gates and prohibits several higher-risk dynamic APIs. Sampled renderers use contextual escaping or DOM/text APIs. | No new exploitable sink was confirmed in the sampled paths. Static fingerprints are not a taint analysis or XSS proof; exhaustive review of all interpolations remains outstanding. |
| Build and asset performance | build:web copies the modular source rather than producing a minified bundle. The current tree contains 29 frontend JS modules (432,912 source bytes) and two CSS files (124,216 source bytes). | No framework/build migration was introduced without comparable browser metrics. A measured production-bundle opportunity remains. |
| Lighthouse / first paint | The supplied 31 October report returned NO_FCP; its downstream Error! diagnostics cannot all be treated as source defects. One fresh anonymous staging browser session rendered the login landing page in about three seconds without reported browser errors. | The old failure was not reproduced in that single anonymous session, but no Lighthouse run or FCP/LCP measurement was collected. Authenticated and offline startup remain unverified. |
| Security headers | Build output includes CSP and several baseline browser security headers. HSTS and deployed response-header behavior were not independently verified against hosting configuration. | No speculative HSTS or host-level header change was made. Verify on the actual staging host and its subdomain policy first. |

## Current source and regression details

### Recent payee touch target

The recent payee chips are rendered as button.btn.sm.vchip. The generic .btn.sm rule sets min-height: 32px; the prior .vchip rule controlled only width and text overflow. The follow-up adds a more specific .btn.sm.vchip rule with min-height: 44px, preserving single-line ellipsis and full-name access via the existing title and accessible label.

Browser E2E now measures every rendered recent payee chip and asserts each target is at least 44px high.

### Register edit E2E selector

A previous exact-head run failed at the post-edit assertion because a locator filtered by Ram Traders matched two rows, then queried .voucher-amount in strict mode. The test now captures the voucher number from the chosen row and uses that number to locate exactly the edited record after refresh. The check asserts one row, one amount element and the expected corrected amount. This fixes test ambiguity; it does not weaken the financial correction assertion.

## Verification evidence on the integration baseline

The following evidence is for the pre-follow-up integration SHA 05402ba9e8b811ea4f479f37617ab6f3b0fdb4ac, not yet for the follow-up head:

- **CI / Quality:** passed — [run 41258914789](https://github.com/tchouhanjsm/cash-voucher/actions/runs/41258914789). The run included lint, formatting, JSON/syntax/layout checks, contrast and release-safety checks, DOM-sink checks, unit/regression tests and dependency policy.
- **Browser E2E:** passed — [run 41258914744](https://github.com/tchouhanjsm/cash-voucher/actions/runs/41258914744), **1,557 checks passed, 0 failed**.
- An earlier Browser E2E run on the same integration SHA failed on the ambiguous “Ram Traders” locator. The later successful run passed on the same SHA, which motivated the deterministic selector fix above.
- The latest Full Flight job was skipped; an earlier Full Flight attempt failed because it observed the earlier Browser E2E failure. Do not report Full Flight as passed unless the rerun is successful.
- A diagnostic mock performance run was captured with Node v22.23.4 on Linux x64. Each operation had one warmup and five measured samples. Median bootstrap / report times:

| Seeded vouchers | Bootstrap response rows | Bootstrap median | Report response rows | Full report median |
|---:|---:|---:|---:|---:|
| 100 | 100 | 0.717 ms | 100 | 0.989 ms |
| 500 | 200 | 1.718 ms | 500 | 4.042 ms |
| 1,000 | 200 | 2.963 ms | 1,000 | 7.163 ms |

These timings use the in-memory Google-services mock. They are not live Apps Script/Sheets measurements, production SLOs, concurrent-user tests or before/after optimization results.

## Live staging observation

The anonymous page at https://cashvoucher-staging.hotelgarhjaisal.com/ rendered product branding and the login form, including email/password labels, theme choices and password visibility control. The browser session settled after approximately three seconds and reported no console errors, warnings or broken images. No credentials were entered, no authenticated workspace was opened and no data was submitted.

This does not identify the deployed source SHA, reproduce the Lighthouse device/network profile, or prove authenticated/offline rendering.

## Governance and working policy

The repository's current written policy designates client-main as the integration branch and requires short-lived client/* branches with PRs targeting client-main. This follow-up uses that flow and does not write to main.

The repository default branch remains main; the active ruleset 24624368 targets ~DEFAULT_BRANCH, requires the quality check and is configured for zero approvals. That does not provide the documented client-main protection/approval model. The branch-protection endpoint was not accessible to this audit connection, so no broader protection claim is made. No repository administration settings were changed.

## Remaining work and release boundaries

1. Run exact-head Quality, Browser E2E and Full Flight on the follow-up PR; retain the visual review artifact.
2. Complete contextual review and adversarial tests for all 17 HTML assignment sites, or continue replacing low-risk views with DOM/text construction as a reviewed batch.
3. Run fresh Lighthouse for clean profile, returning authenticated user, expired auth, slow 4G and offline states; retain HTML/JSON artifacts and record the deployed/build SHA.
4. Complete WCAG 2.2 AA review across every screen with keyboard and screen-reader testing, zoom, contrast and real mobile devices.
5. Verify response headers and cache behavior on the actual staging host.
6. Before staging release, back up and verify the Google Sheet, validate A:W headers, run the guarded VendorType migration in column X once, deploy matching backend/frontend source, and execute tagged staging UAT. No production project/resources were present in this review, so production changes are out of scope.

**Release decision:** this audit and its follow-up PR are source-level work only. No merge, production deployment, spreadsheet migration, historic correction, or financial record write is authorized or performed by this work.
