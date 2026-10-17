# Product Gap Register and Roadmap

Last verified main baseline: `8e18b4f3ed8601f70e192b6d32587675ad4cdb7b` (PR #169 merge); post-merge main CI run [39049788835](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39049788835) passed. PR #169's exact pre-merge head also passed CI/quality, Browser E2E and Full Flight Test.  
Current source phases: Phases 37–39 and customer delivery packaging/handover foundation (PR #166) are merged; PR #169's password-authentication/staging-readiness consolidation is also merged.  
Current release state: source is prepared for owner-provisioned staging; live staging, customer resources, backup/restore and first-customer acceptance are not verified. See `docs/STAGING-RELEASE-AUDIT.md` and `docs/FINAL-REPOSITORY-AUDIT-2026-10-17.md`.

## Founder plan — outcome-based work, not PR-count optimization

This is a single-property cash-voucher PWA. Prioritize accuracy of money movement, authorization, operator recovery, audit traceability and release proof before speculative features. Deliver connected code-addressable work in a single outcome-based PR; do not mistake source-level tests for production operations.

## Phase status

- Phase 1 — repository source audit, selected credential-pattern guard and seeded mock performance baseline are present. These remain bounded source/mock evidence, not live-service measurements.
- Phase 2 — payment → independent approval → reporting → cash-close snapshot → audit journey is covered by mock-backed tests. Real Sheet behavior and live permissions remain unverified.
- Phase 2B — PR #131 and PR #132 add ambiguous-save, IndexedDB acknowledgement-failure and stale-session queue recovery with idempotent client IDs/account binding.
- Phase 3 — audit append failure records an owner-visible marker when Script Properties remains available. Dual append/marker failure remains a durability limitation.
- Phases 4–7 — authorization/rendering matrix, sink count/fingerprint gates, text-only sink reductions and adversarial accountant report/CSV coverage are merged; checks are bounded, not full security certification.
- Phase 8 — PR #137 strengthened payee-day split-payment approval and entry UX. PR #138 removed the shared modal-frame `innerHTML` assignment; sink inventory fell from 28 to 27 assignments across eight modules.
- Phase 9 — PR #139 merged at `965f16b8849fa757e46449d5fd1e80a3881100a4`. It adds normalized-name fallback only when one payment lacks VendorID, preserves distinct non-empty stable IDs and does not backfill historical data. Post-merge CI passed on main.
- Phase 10 — PR #141 merged at `42ff7708535d04c15510caf90c5f93738109669e`; tested head `d2b354474fb6b4ad67ad055bd33ff75925bee7d8`. CI, Browser E2E (353 checks) and Full Flight Test passed on that exact head; PR #141 reports post-merge main CI passed. Phase 10 updates the inline SVG icon sprite, allowlisted icons/actions, Dashboard attention states, page headings and shell cache `cv2-v16`. Dashboard statement fingerprint is `2977910e`; expected inventory remains 27 assignments in eight modules. These controls are not XSS certification.
- Phase 11 Batch 1 — PR #143 merged at `db3c2cfd08ddbd1a80d37bdc67557b719446caaf`. It replaces the Users view's two fixed loading/error `innerHTML` templates with DOM construction and `textContent`; Browser E2E injects hostile API error text and verifies inert rendering plus retry recovery. The merged-main sink count is 25 across eight modules. PR #143's CI/quality, Browser E2E (353 checks) and Full Flight Test passed on exact tested head `d3bc6b5381d9dbd98ebddfedce81e32a5c49abca`.
- Phase 11 Batch 2 — PR #144 merged at `8bd1f423700a5a392d0f672bd287e88603755d82`. It replaces the local/offline and server payment-save confirmation templates and bulk-import completion template with DOM APIs; hostile server-returned number/vendor markup stays inert and confirmation/retry actions are preserved. Merged inventory: 22 sites across eight modules. CI/quality, Browser E2E (353 checks) and Full Flight Test passed on exact tested head `e7f199a5d109f49034f349aab0dc63d040b32a1f`.
- Phase 11 Batch 3 — PR #145 merged at `797cb6b08187c6cb77dfb7b198c7dd5840e67c29`. It retires the Reports/Cash Close permission-denied templates and Register totals/status template. CI/quality, Browser E2E (356 checks) and Full Flight Test (281 backend checks plus 356 browser checks) passed on exact tested head `b044edf5e36f41cc327ef57a89f0665c40acf79e`.
- Phase 11 Batch 4 — PR #146 merged at `f2afdb08bece0a7f529a64a84164685269805641`, replacing My Account profile/PIN and offline outbox banner/review templates with DOM APIs; hostile profile/property strings and locally tampered queue payee values are covered. Inventory: 17 assignments across eight modules. CI passed, but Browser E2E and Full Flight Test on exact tested PR head `c1c56053cee6f1daaa028ee3acc3a5696c15821c` each had one failed assertion concerning the Change PIN submit control.
- Phase 11 Batch 4 follow-up — PR #147 merged into main at `61e46989032985fba54ceb48d768ab57430aa48a`. It explicitly sets the Change PIN button to `type="submit"`, changing no sink count, API, financial logic or data. Exact-head CI/quality, Browser E2E (358 checks, 0 failures) and Full Flight Test (281 backend plus 358 browser checks, 0 failures) passed on `bfdbbb401c397730b12480fec5ac9fd1e57072d9`.
- Phase 12 — PR #148 merged at `87a39f8e58594abc3eba7f5900c0be45f0cf8341`. Exact final PR head `9d5dea25eeddfa98d9c81995a7a140d0af709bdc` passed CI/quality, Browser E2E (359 checks) and Full Flight Test (281 backend plus 359 browser checks), all with zero failures. Same-email queue records bound to a different API endpoint remain pending, hidden and not uploaded.
- PR #149 UI refresh mainline integration — merged at `a478c52c68c520b8eddbf80692d101dc20210c58`. It improves Dashboard attention hierarchy, iconography and spacing without changing financial or authorization policy. CI/quality, Browser E2E and Full Flight Test passed on exact PR head `2c1a25c144fe27ed959cd7aae6793b9c3c75bddf`; post-merge CI/quality passed on main. Inventory remains 17 sinks across eight frontend modules.
- Phase 13 operational release proof is still P0 and owner-controlled; no source-only test can verify live Apps Script identity, production permissions, scheduled backup or isolated restore.
- Phase 14 Batch 1 — PR #150 merged at `ad1eb78847a9263c95870b043465b83dd48998be`. It makes the Register table keyboard reachable and adds Reports focus/viewport assertions at seven widths. Exact final head `32c0b31916e1e48eda58bf115aaf17f97f8485a7` passed CI/quality, Browser E2E (371 checks) and Full Flight Test (281 backend plus 371 browser checks, zero failures); post-merge CI passed. Manual device, zoom, keyboard traversal and screen-reader checks remain open.
- Phase 15 — FrontUI Studio + shared component kit is complete in PR #151, merged at `91b8b46f4a09b868db0157d6f89dcebd0d14eae0`. Exact PR head `b7632abcff44cf10969b731da2eef5e9b679bd60` passed CI/quality, Browser E2E (382 checks) and Full Flight Test (281 backend plus 382 browser checks), all with zero failures. The static gallery and shared stylesheet are integrated; manual device/assistive-technology validation remains open.
- Phase 16 — evidence-led performance and repository hygiene is complete in PR #152, merged at `a0d6529da2534977b69426e1affc1b182fa3bf56`. Repeated seeded mock timings are retained as a machine-readable CI artifact; the dependency exception remains scoped and time-boxed, with no unverified downgrade. Mock timings are not production SLOs.
- Phase 17 — truthful audit health and owner-exportable monitoring snapshot is complete in PR #153. It adds an owner-facing JSON snapshot download and clearer wording for degraded/unavailable/invalid monitoring states; the separate durable-fallback design decision remains unresolved.
- Phase 18 — actionable diagnostic exports is complete in PR #154, merged before the current main baseline. It adds scoped JSON exports for validated data-quality and backup-integrity reports, stale-export prevention after failed refreshes, privacy/scope notices and browser download/malformed-response coverage.
- Phase 19 — isolated staging deployment and owner/manager UAT pipeline is merged in PR #155 at main SHA `4b15ce7e05d3a524b727f40edbc06e19295beef4`. Its exact PR head passed CI/quality, Browser E2E (402 checks) and Full Flight Test (281 backend plus 402 browser checks), with zero failures reported. These checks are source/mock evidence only; live staging is not verified.
- Phase 20 — staging credential-diagnostic redaction is complete in merged PR #156. The deployer redacts scalar values nested inside `CLASPRC_JSON` as well as the complete credential document; exact-head CI/quality, Browser E2E (402 checks) and Full Flight Test (281 backend + 402 browser checks) passed.
- Phase 21 — premium light frontend redesign is complete in merged PR #157 at `ec5f76c215b8d8986d7dd38e265cc4d1b50e36ee`. The exact tested PR head `f38feeafdf7fd682d4e07e134026627c0bfc2413` passed CI/quality, Browser E2E (402 checks) and Full Flight Test (281 backend + 402 browser checks); a post-merge run on the merge commit was not established during this review.
- Operational readiness — live Apps Script deployment/identity, live role/receipt checks, scheduled backup plus isolated restore, physical-device PWA recovery and manual accessibility remain owner-controlled release gates.

- Phase 22 — authentication race regression and project-record reconciliation is complete in merged PR #158 at `6fba1dd4fcd41aa635311e0c64ff445d46f0fe91`. Its exact tested head passed CI/quality (285 backend checks), Browser E2E (402 checks), and Full Flight Test (285 backend + 402 browser checks). The direct post-lock stale-session regression proves the mocked write route fails closed without creating a voucher; it does not simulate true concurrent Apps Script calls.
- Phase 23 — FrontUI production-screen adoption is complete in merged PR #159 at main SHA `dabd39b2b70d516d714e08ac0cf6ed57fa806eee`. It adds a shared section eyebrow, standardized New Entry layout, responsive Register filters, Settings diagnostic composition, Bulk Upload and Cash Close presentation, and bumps the PWA shell cache to `cv2-v18`. Exact head `41b25f42c39a033585128ddf8c7e89f247e1fc61` passed CI/quality (285 backend checks), Browser E2E (409 checks) and Full Flight Test (285 backend + 409 browser checks); post-merge CI passed on main. Manual device/zoom/screen-reader verification and live operational release gates remain open.
- Phase 24 — responsive reporting and administration UI adoption is complete in merged PR #160 at main SHA `0d900235f9230ab05db940bb57881a171737ae0c`. The exact tested head passed CI/quality (285 backend checks), Browser E2E (418 checks) and Full Flight Test (285 backend + 418 browser checks); post-merge main CI passed. Source and mock checks do not certify real-device layout, live roles, backup/restore or production deployment.
- Phases 25–27 — Fresh Design Studio workflow completion is complete in merged PR #161 at main SHA `525f8d0a8af73194ca73c83d05b02d38c02d1b8c`. The tested head `27ceda070f38fe2a445e4e165fbbde20ee6377c9` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38943524970), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38943525175) and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38943524910). It styles Bulk Upload and Cash Close, improves keyboard-reachable/scrollable controls, adds reduced-motion and forced-colors handling and advances the shell cache. Manual device, zoom and assistive-technology review remain release gates.

## Phase 4 batch outcomes

1. Test authenticated calls for the documented staff, manager, owner and accountant role boundaries across ordinary voucher creation, bulk creation, edit/cancel, approval, vendor actions, user administration, property settings, audit, backup/quality diagnostics, reports and cash close.
2. Test own/foreign voucher and receipt boundaries with multiple staff identities; test report-only accountant visibility and opening-balance/name redaction.
3. Lock the current 33 innerHTML assignment sites across nine frontend modules in a reviewed inventory. Fail CI if an assignment count or module location changes without an explicit inventory update.
4. Fail CI on the introduction of outerHTML assignment, insertAdjacentHTML, document.write, createContextualFragment, eval or new Function in frontend JavaScript.
5. Reconcile the current handoff, roadmap, backlog and security/release documents to the post-PR #132 main baseline.

These checks catch drift and validate tested paths. They do not claim that every HTML interpolation is safe, every role/action combination has been penetration-tested, or production has been verified.

## Latest source milestone — PR #169

PR #169 consolidated password authentication, credential-free authentication audit events, the supplied login redesign, migration safeguards and password-based staging/UAT guidance. It merged at `8e18b4f3ed8601f70e192b6d32587675ad4cdb7b` on 17 October 2026. Its exact tested pre-merge head `b82b8f38b891f01b7cba2a1c421a920ceabd14fc` passed CI/quality, Browser E2E and Full Flight Test; post-merge main CI run [39049788835](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39049788835) passed. This remains source/mock evidence only; no live staging deployment or UAT is claimed.

## Active priorities after Phase 39, PR #166 and PR #169 (updated 17 October 2026)

1. **P0 — staging/UAT provisioning:** create separate staging Apps Script/Sheet/receipt/backup resources; verify the first versioned Web App deployment; configure a protected GitHub `staging` Environment, its variables and secrets; then run the guarded workflow from `main` with exact `STAGING-ONLY` confirmation and explicit staging-write consent. No IDs or credentials may be guessed.
2. **P0 — first-customer instance and source privacy:** the repository is still public. Protect source access only after verifying the static host can use the private repository without interrupting service. Create a separate customer Script/Sheet/Drive set and distinct static-site origin; never reuse the staging or unverified root `config.js` endpoint.
3. **P0 — live recovery and access proof:** verify actual owner/manager/staff/receipt authorization, inspect a real backup and manifest, restore to a separate recovery destination, reconcile row counts/voucher numbers, and record a working customer URL and acceptance. Source CI is not this evidence.
4. **P1 — device/accessibility and controlled pilot:** test install/update, cross-device offline queue recovery, keyboard/focus, zoom/reflow, screen reader, printing/export and then complete the 14-day controlled pilot with daily reconciliation and fallback evidence.
5. **P1 — real-service capacity and remaining rendering review:** measure Apps Script/Sheets latency, quotas and voucher-numbering contention in authorized staging; review the 17 active `innerHTML` assignment sites contextually. Inventory/fingerprint checks are drift guards, not full XSS certification.
6. **P2 — audit durability:** decide and test a durable fallback for simultaneous AuditLog append and marker-store failure; do not fabricate missing historical events.
7. **P2 — dependency exception:** reassess the `braces@3.0.3` Clasp/micromatch chain by 9 November 2026; CI is expected to reject the exception from 10 November unless an explicit reviewed renewal is made.
8. **P2 — product decisions after pilot:** obtain accountant-approved destination/mapping before claiming target-specific export compatibility; decide whether optional denomination rows have operational value; set performance/usability targets only from measured pilot evidence.

Phases 37–39, PR #166's static customer packaging and PR #169's password authentication/staging consolidation are source-complete. PR #169 passed exact-head CI, Browser E2E and Full Flight Test; post-merge CI passed on `8e18b4f3ed8601f70e192b6d32587675ad4cdb7b`. The remaining P0 items are owner/account operations and witnessed evidence, not unmerged feature phases. Use `docs/STAGING-RELEASE-AUDIT.md` as the detailed queue and `docs/RELEASE-READINESS.md` for acceptance gates.

## Financial integrity invariants

- New PAYMENT vouchers at or above INR 10,000 require independent owner/manager approval; no self-approval.
- Material edits to amount, vendor/identity, date or CashImpact require reapproval under UAT-048. Category/notes edits retain approval but require a reason and audit history.
- Historical blank CashImpact/approval values are not silently backfilled. Unresolved records remain excluded from approved totals and block final cash close.
- Preserve immutable close snapshots, client-ID idempotency, account-bound offline queue records, closed-period controls and audit attribution.
- No production deployment, schema migration, history rewrite or merge without explicit authorization.

The detailed historical review register follows. Its PR-by-PR notes are retained as history, not a live status feed.

## 1. Code-review findings reconciled against current v2

| Finding from the supplied review                                                           | Current evidence                                                                                                                                                                                                                                   | Disposition                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner PIN/email committed in old `src/01_Config.js` / `03_Auth.js` paths                   | Those files are absent from the current main tree; current `backend/*.gs` expects setup values in Script Properties and removes `OWNER_PIN` after owner creation. Checked path history for the cited files returned no commits in this repository. | **Not corroborated in current repository.** This does not prove the values were never used elsewhere. If the reported values were ever used, rotate the deployed owner PIN. No history rewrite was performed; rewriting public history would be a separate destructive operation requiring explicit authorization. |
| Plain SHA-256 PIN hashing                                                                  | Current `hashPassword_` uses HMAC-SHA256 with per-user salt and a Script Properties pepper; the KDF choice remains a production security review item.                                                                                                                                                             | Resolved in current v2 source. Real properties/pepper and deployment still require operational verification.                                                                                                                                                                                                       |
| Web App executes as accessing user and staff can edit the Sheet                            | Current manifest says `USER_DEPLOYING` with anonymous web access; backend checks session/role on each protected action.                                                                                                                            | Source configuration is corrected. Verify actual deployment setting and keep Sheet/Drive private; source manifest alone cannot prove live settings.                                                                                                                                                                |
| Voucher numbers collide/reset                                                              | Writes are guarded by ScriptLock; `nextNumber_` reconciles counters with existing active data and rejects invalid persisted numbers.                                                                                                               | Addressed in current v2 source/tests. Real concurrent load has not been stress-tested.                                                                                                                                                                                                                             |
| Staff can edit/cancel any voucher                                                          | Current `PERMS` allows staff create/view-own; edit/cancel/view-all are manager/owner capabilities.                                                                                                                                                 | Resolved in current v2 source.                                                                                                                                                                                                                                                                                     |
| PIN change leaves other sessions valid                                                     | PIN change rotates the user's salt; `auth_` checks the stored salt, invalidating old cached session tokens on use.                                                                                                                                 | Behavior is already implemented. Phase 22 adds a failed-current-PIN throttle.                                                                                                                                                                                                                                      |
| Login failures race during read-modify-write                                               | Current login counter was read and written without a lock.                                                                                                                                                                                         | **Phase 22 fix:** serialize login attempts with the ScriptLock; add a regression check for lock usage and lockout. Mock tests cannot simulate true simultaneous Apps Script calls.                                                                                                                                 |
| PIN change has no failed-attempt throttle                                                  | Current change-PIN endpoint lacked a counter.                                                                                                                                                                                                      | **Phase 22 fix:** five incorrect current-PIN attempts trigger a 15-minute cache lockout; owner PIN reset clears both related counters.                                                                                                                                                                             |
| Duplicate global functions / broken legacy user creation / active-spreadsheet lookups      | Current runtime uses one backend source file and header-mapped sheet helpers; the named old files/functions are not present in the current active layout.                                                                                          | Old-code findings not reproduced in current v2. Keep future Apps Script changes in the source-managed backend and test them.                                                                                                                                                                                       |
| Full-sheet scans may become slow                                                           | Authentication looks up the current user from the Users sheet; bootstrap loads the voucher set required by the present UI.                                                                                                                         | **Open scale risk.** Measure real row counts/latency first; consider bounded caching with explicit invalidation only when measured.                                                                                                                                                                                |
| Cancel status enum drift                                                                   | Current v2 uses explicit status values in write/read paths and tests cancellation. The old enum names from the memo were not found in this active implementation.                                                                                  | Legacy finding not reproduced as written; add centralized status constants only with a targeted tested change.                                                                                                                                                                                                     |
| Stored-XSS / dynamic `innerHTML` risk                                                      | Feature renderers use HTML templates and escaping helpers in multiple locations; no complete sink-by-sink audit has been completed.                                                                                                                | **Open security review item.** Audit every user-controlled string in text and attribute contexts; add regressions for vendor, note, user, error and audit-log content.                                                                                                                                             |
| Hardcoded spreadsheet ID                                                                   | Current setup resolves the sheet into Script Properties (`SS_ID`); requests use that property.                                                                                                                                                     | Resolved in current v2 source. Keep real IDs/config values out of source where practical.                                                                                                                                                                                                                          |
| No real tests / empty README                                                               | Current repository has backend service mocks, Playwright E2E, CI, README and project/docs guides.                                                                                                                                                  | Resolved; documentation drift is addressed in Phase 22.                                                                                                                                                                                                                                                            |
| No cash-received entries, receipt evidence, dashboard/export, offline support or audit log | All exist in current source: payment/receipt type, Drive receipt images, dashboard/register CSV, IndexedDB outbox/recovery, owner audit API/table.                                                                                                 | Already implemented. Gaps remain in richer reconciliation, reporting/export formats and discoverability.                                                                                                                                                                                                           |
| Audit traceability and discoverability                                                     | Owner-only Audit log view has filters and CSV export; transaction updates already carry field deltas. This slice adds structured creation/cancellation/receipt/cash-close events and cursor-based older-page loading.                              | **Improved in Slice 3 audit PR.** Structured event IDs, actor/time/action/target, old/new values where meaningful, and reason are available; CSV exports loaded pages. Audit writes remain best-effort; retention and tamper-evidence are not guaranteed.                                                          |
| No approvals, day close, physical cash count, budget controls or accountant role           | Payment approval, CashImpact classification, Daily Cash Close and a report-only accountant role with generic CSV/VendorID export are implemented in source through merged PRs #110, #111 and #114.                                                 | **Implemented in source; live migrations/deployment/reconciliation remain unverified.** Denomination rows are optional and require an owner decision; budget controls and additional scoring/automation remain future product decisions.                                                                           |
| Multi-property, vendor price network, digital payouts, OCR/AI                              | Not present; would require material tenancy, finance, compliance and operations decisions.                                                                                                                                                         | Strategic options only. Do not build before buyer/problem validation.                                                                                                                                                                                                                                              |

### Security follow-up note

`docs/SECURITY-RENDERING-AUDIT.md` records the incremental rendering audit and targeted regressions. The complete dynamic-HTML sink review remains open.

**PR #92 — Shared vendor-suggestion integrity:** the existing `vendorNames()` used a plain object for user-controlled vendor labels, so the special `__proto__` key could be lost. The next increment switches to `Map` and hardens API/cache collection shapes at the shared datalist boundary. Browser coverage verifies the actual New Entry suggestions and malformed vendor metadata. This is a scoped data-integrity/rendering resilience improvement, not a full XSS certification.

**PR #91 — Register/report malformed-data resilience:** target the concrete client failure modes where malformed bootstrap rows or non-string vendor/note fields can break register search, bootstrap's local vendor-cache projection can abort refresh, receipt metadata can break receipt access, or an invalid report `items` envelope can crash rendering. The implementation keeps these as client-boundary safeguards with visible recovery feedback; mock-backed tests do not prove live API/Sheet data integrity or close the complete sink audit. No schema, authorization, cash-close or deployment change is approved by this work.

The repository is public. This review did not perform a general Git object/secret scan and cannot certify that all past commits are clean. The cited old paths returned no path-history records in this repository. A history purge could disrupt consumers and requires a deliberate owner-approved migration; no force push or history rewrite is part of Phase 22.

## 2. What the owner can rely on—and what still needs proof

### Current capability

- Payment and cash-received vouchers with separate numbering.
- Role-based server authorization, user activation, PIN reset/change and audit events.
- Receipt images in Drive, dashboard/register/CSV/print, bulk import.
- Offline queue and recovery export/import designed to prevent duplicate sync.
- Daily backup mechanism present in source.
- Modular ES-module frontend and CI/browser test workflows.

### Not yet a guarantee

- No tamper-evident ledger: edits/cancellations are represented in ordinary Sheets records plus audit events, not a hash-chained immutable ledger.
- No verified live backup restore or real-device/PWA upgrade drill. The owner-only status panel exposes recorded backup metadata, but live Drive access and restoreability remain unverified.
- Browser-local queue is not central backup until synchronized.
- Daily Cash Close source workflow exists, but live deployment, real backup/restore, cross-device outbox checks, and a controlled hotel pilot are not verified. Physical denomination breakdown is not implemented.
- No real latency/load benchmark, formal contrast audit, assisted-technology test, external pen test or full dynamic-HTML sink audit.
- No multi-property tenant separation, digital movement of funds, GST/TDS compliance rules or accountant-specific exports.

## 3. Historical prioritized owner-value roadmap — superseded for current execution

This older risk-priority plan is retained for traceability. Phase 22 and the feature increments described below have progressed through later merged PRs; do not use their historical “current PR” or “next batch” wording as the current queue. The current execution order is the active-priorities section at the top of this file and `docs/STAGING-RELEASE-AUDIT.md`.

### Historical P0 — Phase 22: authentication race evidence and trustworthy project records

**Verified in current source:** login failure counter updates run under ScriptLock; incorrect current-PIN attempts are throttled for 15 minutes; owner PIN reset clears login and PIN-change counters; write routes acquire the lock and authenticate the session inside the lock before invoking a write handler. These controls are already implemented; do not duplicate them.

**Current PR scope:** add a direct regression for a session invalidated after the write lock is acquired but before route authentication. It must assert `SESSION`, no voucher row mutation, and lock release. Reconcile the canonical handoff, product roadmap, backlog, project guide and release-readiness state to the verified PR #157 merge. The deterministic mock hook is source-test evidence only; it does not simulate real concurrent Apps Script requests.

**Exit gate:** CI/quality, Browser E2E and Full Flight Test pass on the exact same final PR head; no production deploy. Owner review and merge remain required before the next implementation phase.

### Historical P1 — Daily cash close and physical reconciliation

**Status:** implementation merged in PRs #110 and #111; operational release gates remain open. PR #110 added the explicit voucher-level `CashImpact` field and preserved historical blanks as `UNCLASSIFIED`. PR #111 added the one-property / MAIN drawer / Asia-Kolkata calendar-day close, carry-forward/manual opening rules, immutable close snapshots, correction notes, chronological finalization, and closed-period mutation guards.

Expected physical cash uses explicit `CASH_IN` and `CASH_OUT` values only; `NO_CASH` has no drawer movement. Active unclassified/invalid vouchers block closing. Pending or rejected high-value payments must also be resolved before final close. This code status does not prove a live deployment or real-world reconciliation.

**Operational exit gates remain:** verify the intended Apps Script project and permissions, take a verified backup, run the reviewed additive migrations in order only when explicitly authorized, inspect real Sheet/Drive state, witness restore to a separate destination, verify local queues on every operating device, and complete the controlled hotel pilot. Do not run `setup()` as a migration shortcut.

### Historical P2 — Approval and exception controls

**Owner-approved policy (13 October 2026):** new `PAYMENT` vouchers at or above **₹10,000** require approval. Receipts are outside this rule. Only existing owner/manager roles may approve, and the creator cannot approve their own voucher. Rejection requires a reason and is audited. No configurable threshold or new role is introduced.

Pending, rejected, or malformed approval-state payments stay visible but are excluded from approved payment totals. They block a final cash close until they are approved or cancelled/resolved; they must not be silently omitted from a purported reconciliation. Editing a voucher already governed by approval sends it back for independent review. Blank approval fields on historical records mean `NOT_REQUIRED`; the migration adds fields without backfilling old vouchers.

PR #114 merged the payment-approval/reporting increment into source, including backend authorization, approval/rejection audit events, Register actions/filters, Dashboard/Reports disclosures and totals, cash-close blockers, additive schema guidance and end-to-end regression coverage. This merged source state is not evidence that migrations or the live Apps Script deployment were performed; those remain owner-controlled release gates.

Other rule-based exception flags—duplicates, unusual first payments, off-hours entries and possible split payments—remain candidates for separate validation. Each must explain why it fired, link to source records, and have a review/override owner before implementation. Do not add speculative fraud scores.

### Historical P3 — Finance and accountant workflow

**Status corrected against live PR history:** PR #114 is merged at `95cd5e0e733d07354e1a2e0b9291a65dee19d126`. It adds a least-privilege `accountant` role with server-authorized read-only access to the generic Recorded Movement Report and CSV, and VendorID storage/export with exact, unambiguous name fallback for legacy blank IDs. Historical rows are not backfilled; unresolved rows remain disclosed. This is an operational source-voucher export, not a destination-certified Tally/Zoho import or tax report; do not add fuzzy matching, backfill, tax rules, or destination-specific accounting semantics without approval.

This is an operational source-voucher export, **not** a destination-certified Tally/Zoho import, general ledger, tax report, or reconciliation certificate. The actual accounting product/version, import mapping, required tax fields, and accountant-approved sample remain unresolved. Do not add GSTIN/GST, HSN/SAC or TDS behavior until the owner and qualified accountant define those requirements.

### Historical P4 — Product UI/UX quality pass

**PR #49 implementation:** broaden responsive overflow coverage across Dashboard and Register at 320–1280px, assert mobile navigation touch-target height, and verify visible keyboard focus. This improves regression detection but does not complete the formal accessibility or usability review.

**PR #50 implementation:** measured 19 source-token contrast pairs, darkened warning/chart colors where thresholds were missed, and added Escape-close/focus-restoration regression coverage for dialogs. This remains a scoped audit, not a formal WCAG conformance claim.

**PR #52 implementation:** prevent background application interaction while a modal is open, with explicit browser assertions for modal semantics, Tab/Shift+Tab cycling, disabled-submit Escape behavior, and focus restoration. Automated checks are guardrails; manual screen-reader and zoom/reflow testing remain outstanding.

**Incremental progress:** the October 2026 UI foundation batch darkens the shared muted-text token, aligns financial figures with tabular numerals, and adds Browser E2E assertions for mobile page overflow and these styles. This does not close the full UI/UX phase or establish WCAG conformance. See `docs/UI-UX-REVIEW.md`; real-device and assisted-technology review remain outstanding.

- Establish/verify design tokens for type, color, spacing, radius, elevation, and focus/selected/error states.
- Improve one-thumb mobile tasks, density/scanability, filter discoverability, empty states, loading/success/error/offline feedback.
- Formal contrast, keyboard/focus, screen-reader, zoom and motion checks; usability observation with at least one real user from each role is a starting point, not statistical validation.
- Keep glass/translucency subtle and scoped to overlays; never compromise legibility of forms, registers or receipts.
- Consider making audit logs a discoverable route with date/action/user filters and safe CSV export.

The static review is recorded in `docs/UI-UX-REVIEW.md`. This PR does not redesign the screens, so the security and documentation changes can be reviewed independently.

### Historical P5 — Operational automation

- Complete a live backup/restore drill and verify Drive permissions and snapshot integrity. The owner-only recorded-status panel is implemented; it is not a substitute for a restore drill.
- Owner daily close summary after close workflow semantics are agreed.
- Recurring vouchers, petty-cash floats and vendor ledger only after observing actual repetitive tasks.
- User-facing version/help/report-problem affordance, support/runbook and volume thresholds.

### Historical P6 — Scale/business bets (validate before building)

Multi-property tenancy, relational database migration, shared vendor/price benchmarks, OCR, language/voice entry, UPI/digital payouts and hosted SaaS operations are not current requirements. First validate buyer segment, willingness to pay, data separation, legal/compliance responsibility, payment-rail partner and support economics. Keep current Google Sheet self-hosting path viable until there is evidence to change it.

## 4. Phase governance and historical implementation log

Each phase has one focused PR, actual test evidence, a two-pass review (product/workflow then security/failure/recovery), and explicit residual risks. The owner reviews and merges the PR. Do not merge or proceed to the next phase on behalf of the owner. No branch deletion, forced update, history rewrite or live deployment without explicit permission.

**PR #53 — mobile reflow and reduced-motion guardrails:** The existing reduced-motion stylesheet is now covered by browser assertions. Payment-entry rows gain a narrow-width layout that gives vendor and amount fields usable space, keeps the amount/removal controls on a consistent visual row, stacks category/note fields, and gives the remove-row action a 44px target. Browser E2E checks the 320 CSS-pixel payment-entry layout and reduced-motion media preference. This is a targeted usability improvement, not a full 400% browser-zoom or real-device certification.

**PR #53 merged:** narrow payment-entry reflow and reduced-motion browser coverage is integrated in merge commit `a6bb1ace7547114c9c8072dd7359ca901387980d`. Next focused batch (PR #54) distinguishes register filters with no matches from an empty/unavailable register and provides an accessible clear-filters action.

**PR #54 merged:** register empty-state messaging and filter recovery are integrated in merge commit `a87c1d90405b1e7cd1097c6328668f91f8cc9af4`; CI and 103 Browser E2E checks passed. **PR #55 merged:** visible refresh progress/error recovery and retryable receipt loading failures are integrated in merge commit `b73aee24b91a4b5808e05bda2e84537188c5028f`; CI passed and Browser E2E passed 106 checks / 0 failures. **PR #56 merged:** staff mobile entry now matches labels and save feedback to payment/cash-receipt mode. Exact-head CI passed and Browser E2E passed 114 checks / 0 failures. **Next batch (PR #57):** improve manager register mobile review and correction without changing backend or accounting semantics.

## Role-based usability continuation — October 2026

**PR #56 merged:** staff payment/cash-receipt entry now uses task-specific save/status wording and preserves the selected mode for the next entry. The exact PR head `9a06246c125594ff7af1201cf1f897000a744857` passed CI and Browser E2E (114 checks, 0 failures); these mock-browser results do not verify Google-account behavior or physical-device ergonomics.

**PR #57 merged:** manager register mobile review improved at-a-glance payment/receipt identity, grouped actions and narrow-screen register layout without changing backend or accounting semantics.

**Historical batch (completed by PR #58): owner audit discoverability.** Give the owner a dedicated Audit log route, local filters across the server-returned latest 200 events, and CSV export for the filtered loaded set. Preserve the existing server authorization and audit API; do not imply this export covers the full history. No new backend query, schema, role, or production behavior is introduced.

## Historical phase status — PR #62 and PR #63

**PR #62 merged:** offline sync/idempotency assurance is integrated at merge commit `49f2a3db297f84093d46b247a54c93c9372f3684`. Its reviewed PR head passed CI and Browser E2E (126 checks, 0 failures), but mock tests do not establish live Google behavior.

**PR #63 — Apps Script release readiness and controlled deployment:** merged. The owner reports uploading the reviewed backend source and updating the configured existing Web App deployment to version 4. The local static/unit checks passed, but Browser E2E did not run because Playwright was missing. Node v24 is outside the repository's Node 20–22 range; npm reported three high-severity dependency findings that require triage. Live role checks and restore remain unverified.

Do not rerun `setup()` during a normal release. Do not push a new backend version until the intended project and existing deployment have been re-verified and required checks pass.

**Operational P0 after deployment:** observe a real backup and perform a restore into a separate recovery Sheet/folder. Until then, the project is not recovery-verified or production-ready.

**Next product phase after deployment/recovery evidence:** source-traceable data-quality exception reports and daily/monthly recorded-voucher movement reports. Keep GST/TDS, general-ledger claims, daily cash close and destination-specific accountant export behind existing owner/accountant/CA decision gates.

## Historical implementation status — PR #65

PR #65 merged at `eef7a8d46dd41b86a7ebaab4fadbf64be42e5922`. Its exact PR head `09eaac429307e4243d7a7d2fce1f16ef3402b029` passed CI and Browser E2E. The feature adds manager/owner-only recorded voucher movement reporting with source rows, validated filters, active/cancelled totals and CSV safety. It does not classify physical cash, calculate tax, or establish profit/bank balance.

## Completed phase — PR #66: backup integrity inspection

Prioritize operational assurance before expanding financial reporting. Add an owner-only read-only inspection for the ten latest managed backup snapshots:

- Verify a spreadsheet copy exists and can be opened.
- Verify required tabs and report header-schema differences as compatibility warnings.
- Verify the receipts folder and manifest exist, manifest columns are valid, manifest count matches copied receipt count, and each listed copy is present.
- Show per-snapshot pass/warning/fail results and sheet row counts without exposing Drive IDs.
- Fail closed when a snapshot cannot be inspected.

PR #66 is merged at `3c93ddd6d45052f2e53e04c713060f0da72ccdd6`. This is structural inspection only. It does not run a restore, mutate production, prune backups, or prove a restored workbook behaves correctly. The operational P0 remains a witnessed restore into a separate recovery Sheet/folder, with record counts and voucher numbering validated.

## Release and product boundaries

- The existing deployment was last reported at version 4 before PRs #64 and #65 merged. Current `main` must not be assumed deployed.
- No Clasp push, Web App deployment, `setup()`, or production-data operation is part of PR #66.
- Daily cash close, physical cash classification, GST/TDS, general-ledger claims and accountant-specific exports remain behind explicit owner/accountant/CA decisions.
- Live authorization, scheduled backup execution, Drive permissions, restoreability, real-device PWA update/install, accessibility and hotel pilot remain unverified.
- Node v24 is outside the declared Node 20–22 range; npm previously reported three high-severity dependency findings that still need triage.

## Historical engineering phase — PR #67

Before adding another product feature, extend browser regression coverage around the existing owner-only data-quality and backup-integrity inspection surfaces. Verify the data-quality results and its explicit accounting/tax limitation; verify backup-integrity failure messaging and retry restoration in the browser mock. This is UI failure-path coverage only, not live Drive or recovery evidence.

**Operational P0 remains independent of this PR:** verify the intended Apps Script deployment and live role boundaries, observe a real scheduled backup, and complete a witnessed restore into a separate recovery Sheet/folder. Do not declare production readiness or claim restoreability from mock tests.

## Persistent operational blocker — live Apps Script deployment and recovery

PR #67 and its local Clasp observations are historical evidence only. Source has since advanced through PR #166. The earlier report that the configured URL matched deployment version 4 must not be treated as current: independently map the root `config.js` `/exec` URL to the actual Apps Script project, active deployment ID, bound Sheet and Drive folders before touching any live resource.

Before handover, the owner must provision the separate staging resources and protected GitHub `staging` Environment, then run the guarded staging/UAT workflow. For the actual customer instance, confirm its own project, deployment, Sheet binding, Script Properties and private Drive folders. Complete live role/receipt authorization checks, observe a real backup and witness restore into a separate recovery Sheet/folder. The current queue and exact required steps are recorded in `docs/STAGING-RELEASE-AUDIT.md` and `docs/RELEASE-READINESS.md`. No upload, migration, deployment, `setup()` or production mutation is authorized by this documentation phase.

## Completed phase — PR #69: DOM-only modal rendering

The next implementation batch narrows the shared modal's attack surface. `frontend/core/ui.js` must accept only a DOM Node/DocumentFragment for dialog body content; existing modal callers should create form controls, option values and user-derived text with DOM APIs. Retain the hostile persisted-vendor regression coverage for voucher edit and cancellation dialogs.

**Exit gate:** every current `dialog()` caller is migrated, the shared API rejects string bodies, CI and Browser E2E pass on the exact PR head, and the PR handoff/audit are updated. This does not certify the remaining view-level `innerHTML` sinks; continue the sink-by-sink audit in a later focused phase.

**Operational P0 remains a production-readiness blocker:** current `main` is not proven deployed, live role/receipt authorization has not been evidenced, and real backup/isolated restore have not been witnessed. No deployment or production mutation is authorized by this code phase.

## Completed phase — PR #70: escape persisted voucher numbers

PR #70 is merged at `1e656dee0266dba38d35500150889ce6020d8045`. Its exact PR head passed CI and Browser E2E (130 checks, 0 failures), including hostile persisted voucher-number coverage in register and print views.

## Completed phase — PR #71: executable full flight test

PR #71 merged at ea99e4e19be0f29e8c1afdc25828bf1b5ecce399. Its exact PR head passed the full flight workflow: dependency advisory policy, complete quality/backend gate (110 backend checks), and Browser E2E (130 checks, 0 failures). The merge commit and tested PR head share the same source tree. [Full flight run](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38043779296).

## Completed phase — PR #72: Recorded Movement Report browser journey

PR #72 merged at `13a1fd84a013d85952d04c512313e8fcf9e36475`. Its exact PR head `d7f9e928f542a831d4588935d1c05dd96ed28979` passed the full flight test, CI and Browser E2E; the browser suite passed 140 checks / 0 failures. Coverage exercises report disclosure/totals, active/cancelled and type filters, and CSV row parity with the filtered table. This remains evidence for recorded voucher movement, not physical cash, general-ledger, profit/loss or tax calculations.

## Completed phase — PR #73: report date-range rendering

PR #73 merged at `71033675cc9f52ad391f8b2d06a362551a224be6`. Its tested head passed Full Flight Test, normal CI and Browser E2E; 110 backend checks and 141 browser checks passed with zero failures. The change escapes the report date labels and tests malformed state. It is one sink-level fix, not a full XSS certification.

## Completed phase — PR #74: payment success voucher-number rendering

PR #74 merged to `main` as `970475dc440a3dc84b788087e60a73836d3d8814`. Its exact tested head `96fcc2b62e126c92318b97b3d8678302ef6dec11` passed Full Flight Test, normal CI and Browser E2E (110 backend checks; 142 browser checks, zero failures). It escaped the server-returned voucher number in the success panel and added hostile-response browser coverage. This remains a targeted fix, not complete XSS certification.

## Historical engineering phase — PR #75: bulk import completion feedback

Improve the bulk-import completion panel so assistive technology receives a polite status announcement and the copy accurately distinguishes cash receipts from payments. Keep the change limited to the existing completion panel, focused Browser E2E coverage and synchronized handoff docs; no import contract, data semantics, or backend behavior changes.

**Exit gate:** Full Flight Test, normal CI and Browser E2E pass on the exact same final PR head. No deployment or production mutation.

## Historical priorities from the October 2026 deep-dive review

**Historical status note (17 October 2026):** the priority record below is retained for decision/history context. Its early “current phase” and candidate-PR references predate later merges through PR #166 and are not the current work queue. For current execution order, use the active priorities near the top and `docs/STAGING-RELEASE-AUDIT.md`. Performance projections remain hypotheses until measured; product policy and accounting semantics remain behind owner/accountant decisions.

1. **P0 — Operational assurance:** owner confirms the live Apps Script target/settings, verifies live role and receipt permissions, observes a real scheduled backup and witnesses restore into a separate recovery destination. Code/CI does not replace these operations.
2. **P0 — Stabilise runtime integrity before expanding financial workflows:**
   - **Completed in PR #78:** hardened action and role allowlists with own-property checks and regression coverage.
   - **PR #79 — Excel parser containment (merged):** the active code previously loaded `xlsx@0.18.5` from jsDelivr at runtime. [GitHub Advisory GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) identifies npm releases through 0.19.2 as affected by prototype pollution; PR #79 disables workbook parsing and retains CSV/TSV/TXT and paste until a vetted build is self-hosted and adversarial-file tests are added. Merged to `main` at `df6f3354c4ef30321941c0bf1d9b9b15a399a066`.
   - **PR #80 — Offline outbox failure isolation and account binding (completed):** queue records are scoped by API endpoint and creating user's email; foreign-account records must not sync, export or discard under the current session. Row-specific rejections are retained for review while independent valid entries continue. Legacy unbound records are preserved for deliberate recovery, and background refresh preserves New Entry drafts. Merged at `cb98b8ae9e329d34ebb9c068de38a78c3f6902ac`; exact tested head passed CI (112 backend/unit checks), Browser E2E (165 checks) and Full Flight Test (112 backend + 165 browser checks).
   - **PR #81 — Authentication lockout serialization and contention handling (completed):** a shared ScriptLock helper serializes login, PIN changes, PIN reset and counter clearing. Lock wait timeout returns retryable `BUSY` without incrementing attempt counters or releasing a lock that was never acquired. Merged at `7fc05bb27e4ec6bfca6bc56e35cd31965cea5bcc`; exact tested head `46410471c025b3f2476807db39ee73f5cc1fcb6e` passed CI (120 backend/unit checks), Browser E2E (165 checks) and Full Flight Test.
   - **PR #82 — Voucher correction history and required edit reasons (completed):** each actual voucher edit requires an attributable 3–200 character reason; the audit records changed editable fields with before/after values, and the owner audit UI renders them readably. The existing AuditLog remains an operational audit, not a tamper-proof ledger. Merged at `4082503cf96bf08a2aa6408bde14fbd0bef14d2c`; exact tested head `8b894512bc6903c824c8a69fd4a8bdadc70ad4d6` passed CI (127 backend checks), Browser E2E (171 checks) and Full Flight Test (127 backend + 171 browser checks).

   - **PR #83 — Backup workload observability and failure alerts (completed):** capture successful backup duration, copied receipt count and receipt payload bytes; expose these in the owner-only status panel without treating them as restore proof. Send one owner email per continuous failure incident using Apps Script MailApp; preserve the original backup error if mail delivery fails, and show notification-delivery errors separately. Exact tested head `60b60f25fe7fe0d0d07922930e6215f98a6a7cbc` passed CI, Browser E2E and Full Flight Test. The seeded benchmark is mock-only and does not set a cloud SLO.
   - **Completed — PR #84 dashboard grouping integrity:** the grouping dictionary uses `Map`; E2E covers `constructor`, `__proto__`, `toString` and `hasOwnProperty` without mutating built-in properties.
   - **Completed — PR #86 dashboard numeric rendering integrity:** the dashboard ignores non-finite trend amounts, uses `Map` for date buckets, and bounds bar/SVG geometry. Exact-head CI, Browser E2E and Full Flight Test passed; see the PR #86 record.
   - **Completed — PR #87 report summary output encoding:** API-derived summary count fields are encoded at each report HTML text sink; hostile-response Browser E2E verifies the values remain literal text. See the PR record.
   - **Completed — PR #88 receipt preview lifecycle:** release generated object URLs on clear, row removal, successful online/offline save, form replacement and SPA navigation; revoke URLs created by asynchronous compression after their row has been detached or its receipt set cleared. Exact tested head passed CI, Browser E2E (187 checks) and Full Flight Test (129 backend + 187 browser checks).
   - **Completed — PR #89 finite monetary rendering:** share a finite-number boundary across money formatting and dashboard/register aggregates; malformed amounts do not poison key totals or render as `NaN`/`Infinity`, and the UI discloses excluded invalid active records.
   - **Current phase — PR #90 printed amount-in-words safety:** reject missing/blank/boolean/non-finite values at the shared amount boundary and make print output fail closed for malformed amounts; normalize rounding via integer paise and add hostile-bootstrap regression coverage.
   - **Independent operational gate:** authorize and verify the MailApp scope in the intended Apps Script project, observe a scheduled backup under the owner account, inspect actual sheet/receipt/manifest copies, and witness restoration into a separate recovery Sheet/folder. Do not perform live restore or deploy without explicit owner authorization.

3. **P1 — Continue the rendering-security audit.** PR #100 closes the invalid/offline voucher-data ambiguity across Dashboard and Register. PR #101 validates owner-only data-quality and backup-integrity report envelopes and nested rows before rendering. PR #102 consolidates scalar-only conversion at the shared HTML and CSV output boundaries with hostile coercion regression tests. Continue the full sink-by-sink review; do not claim full XSS certification until the active sink inventory has been reviewed.
4. **P2 — Improve trust and staff speed:** PR #98 established shared bootstrap voucher diagnostics across Dashboard/Register; PR #99 consolidated operator-workflow reliability; PR #100 closes the unavailable-data view; PR #101 hardens owner diagnostic contracts. After PR #102 is verified, consolidate the next user-facing workflow improvements into one coherent PR with actual UI behavior and regression tests. Preserve separate release/operational gates and do not alter accounting semantics.
5. **P3 — Daily cash close and reconciliation:** PR #110 introduced mandatory `CASH_IN` / `CASH_OUT` / `NO_CASH` classification without historical backfill; PR #111 merged the owner-approved Daily Cash Close MVP with immutable voucher snapshots, chronological finalization, closed-period mutation guards and attributed correction notes. Missing historical values remain `UNCLASSIFIED`, and active unresolved vouchers block finalization. The code is not proof of production deployment: a verified backup, guarded schema migrations, live authorization checks, real-device queue checks and an isolated restore remain release gates. Corrections are notes, not ledger adjustments. Do not infer approvals, GST/TDS fields or accountant workflows.

**Sequencing gate:** stabilisation and live operational assurance precede reliance on the ledger or expansion into approvals/accounting features. The deep-dive's proposed scale triggers must be tested with seeded workloads before they become architecture thresholds.

**Production boundary:** live target/authorization, real backup and isolated restore remain unverified. No deployment or production mutation is authorized by this code phase.

## Combined workflow reliability batch — PR #99

The scope is a single reviewable delivery across related daily-operator workflows: (1) show payment versus cash-receipt counts accurately in the device-local queue and provide explicit, export-first removal for one rejected entry; (2) prevent invalid bootstrap voucher data from looking like an empty Register; (3) reject reversed Register date ranges with visible feedback, no misleading totals, and disabled CSV export until corrected; (4) announce bulk-import review/progress and report loading accessibly, with accurate receipt labels; (5) clear stale report rows when a new report begins or fails, and show CSV-export failure feedback. Existing parser restrictions, account binding, per-row rejection isolation, voucher CSV escaping, idempotency, and server authorization remain intact.

The one PR must pass CI, Browser E2E, and Full Flight Test on the same final commit. Its mock-backed checks do not close live authorization, real backup/restore, real-device/offline, or assistive-technology validation.

## Dashboard unavailable-state guardrail — PR #100

**Confirmed gap:** the Dashboard built KPI cards and charts from empty collections when the bootstrap voucher envelope was invalid. A second path existed in offline startup: identity/settings were recovered from local cache but vouchers were deliberately not cached, while diagnostics marked the empty in-memory voucher list as valid. Both states could make unavailable financial data look like zero activity.

**Target behavior:** distinguish whether voucher data is available from whether an individual response envelope is valid. When no voucher data is available, Dashboard and Register withhold totals, rows, charts, and CSV export. Copy identifies whether the app is offline or the server response was invalid. The refresh path remains available, and valid bootstrap data restores normal views. A valid empty array remains distinct and can still render genuine empty-state results.

**Verification:** Browser E2E tampers with the bootstrap voucher envelope and simulates offline restart with an existing identity cache; it asserts that no KPI/chart/row/export is shown, then confirms online recovery. This is a UI integrity control; it does not validate or repair authoritative Sheet data and does not close live authorization, backup/restore, accessibility, or device-pilot gates.

## Completed phase — PR #106: device-local offline unlock

PR #106 merged at `e980f634242fdd549411f5c6067d0b267a3c5f22`. The exact tested PR head `98324ec3084c252f458f6334cb1805d675e2dd1e` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38287916562), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38287916549) (254 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38287916551) (129 backend + 254 browser checks). A device with a recent successful online sign-in can unlock a clearly labelled local-only workspace for up to seven days. This does not establish an active server session, restore a token, or make server voucher history available offline.

## Completed phase — PR #107: offline-unlock to queued-entry workflow

PR #107 merged at `db1c3cfee6b3f3e1fb127d61c4ea58a8bf7fa592`. Exact tested head `639fb982e00e3139a9d969128bf960c2c32007e4` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38291708608), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38291708626) (260 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38291708773) (129 backend + 260 browser checks). New entries in a local-only workspace are saved directly to the account-bound IndexedDB outbox; network recovery alone does not authenticate or upload them. Online login, bootstrap and voucher upload are verified in order. This does not complete physical-device validation or central backup of unsynchronized entries.

## Completed phase — PR #108: inspect device-local queued entries

**Founder priority — trust and staff speed:** the pending queue banner has an aggregate count but no per-entry view for items waiting to upload. The next batch adds a compact, expandable queue review for the current account/endpoint. It shows up to five owned pending/sending entries with type, vendor, amount, date, queue status and receipt-image count, plus a count of additional entries and guidance to export the full queue. Pending entries remain non-destructive; the existing export-before-removal guard for rejected entries is preserved.

**Security boundary:** values read from IndexedDB are still untrusted. Bound displayed text length and escape the vendor, amount/date labels at the insertion point. Do not display foreign-account queue records or unbound legacy records as though they belong to the current account. Do not claim a pending queue row is a saved server voucher.

**Exit gate:** CI, Browser E2E and Full Flight Test pass on the exact same final PR head. Browser coverage verifies the status/detail fields and that tampered local HTML remains inert. No API/Sheet schema, accounting rules, auth policy, deployment or production data changes.

**Independent P0 gates remain open:** verify the intended Apps Script project and live role/receipt boundaries; observe the scheduled backup and inspect actual Drive copies/manifests; witness a restore to a separate destination and validate counts/numbering; complete real-device PWA/offline and assistive-technology checks; conduct the controlled hotel pilot. Mock CI does not close these gates. The full dynamic-rendering sink audit remains incremental.

## Daily Cash Close MVP — owner-approved implementation batch (13 October 2026)

PR #110 approved mandatory voucher-level CashImpact; this phase adds the first physical cash close. The owner approved one property / MAIN drawer / calendar day in Asia/Kolkata; exact previous-day count carry-forward; explicit manual opening amount plus reason when starting or resolving a date gap; counted-minus-expected variance with mandatory reason when non-zero; and owner/manager-only finalization enforced on the backend.

The close is rejected if any active date-scoped voucher is unclassified or has an invalid amount. It records the original totals and included voucher snapshot, actor, time zone, timestamp and request ID together. The same request can be retried without duplicating a close; concurrent/date duplicates cannot overwrite the record. Voucher creation, edits and cancellation affecting a closed date are blocked. A correction note is a separately attributed append-only record and does not alter the original close or voucher data.

The release requires reviewed source plus guarded one-time schema operations in the verified Apps Script project after backup. No migration, Clasp upload, deployment or production-data operation is performed by a feature PR. Live concurrency, backup/restore, device/PWA and hotel-pilot gates remain open. PR #111 merged at `6092152c64adff084abfda5407056dac9401b5e9`; PR #112 added CSP and source/browser release-integrity checks; PR #113 added structured audit events and paginated audit history. The Dashboard already displays “Book balance”; do not create a duplicate label-only PR. The next implementation batch is the owner-approved high-value payment approval workflow: threshold INR 10,000 inclusive, new PAYMENT vouchers only, owner/manager approval with no self-approval, and exclusion from approved totals/cash close until resolved. Operational go-live gates remain independent and require explicit owner-authorized evidence. CI is not live evidence.

## Completed phase — PR #122: administration state and retry reliability (14 October 2026)

PR #122 completed UI shell phases 7–8. Users, Vendors, Audit log and Backup status now distinguish request failure/invalid data from a genuine empty state; Users, Audit and Backup status provide direct recovery paths. The Backup status retry does not reset unsaved Settings fields. CI, Browser E2E (313 checks) and Full Flight Test (245 backend checks, 38 selected contrast-pair checks across both themes, 313 browser checks) passed on tested head `4fe0085c3fcebcfe04667dade6c46ebf8ef0afbb`. These are mock-backed/source checks, not live Apps Script availability or production release evidence.

## Completed phase — PR #123: Daily Cash Close snapshot integrity (14 October 2026)

**Finding:** `cashCloseOut_` previously filtered malformed members from the saved `IncludedVouchers` snapshot and filtered non-string values from `IncludedVoucherIds`, which could make displayed voucher detail incomplete while preserving the original close totals.

**Outcome:** validate every snapshot member, the one-to-one ordered/unique voucher ID list, and the stored included-voucher count before returning the saved close. Inconsistent snapshots fail closed with `CASH_CLOSE_DATA`; the stored record is not silently filtered or rewritten. Backend regressions cover malformed rows, invalid or mismatched IDs, duplicate IDs and count drift. Browser E2E covers hostile text in the Cash Close report and correction history. PR #123 merged at `7e604c603e12942db26a9fc49a1d46bcaa2376ea`; tested head `c2cd661b7da34788d1f99317f7439945ce965ad3` passed CI, Browser E2E (314 checks) and Full Flight Test (251 backend checks, 38 contrast-pair checks and 314 browser checks).

**Non-goals:** no historic record rewrite/repair, schema migration, financial calculation change, accounting semantics, approval-policy change, Apps Script deployment or production-data operation. Pre-existing malformed close records require separately authorized owner inspection/recovery.

## Completed phase — PR #124: printed-voucher date-shape resilience (14 October 2026)

PR #124 merged at `eb23c2dd5b7620de9c09329c0088f4fbff36f89d`. Its tested head `f241fe2d449a16fcf33a5734e75f190a22158172` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38540541081), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38540540922) (316 checks), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38540540948). The print renderer now displays a constant `Date unavailable` fallback for malformed date shapes while preserving valid DD/MM/YYYY output. There is no API/schema or production-data change.

## Completed phase — PR #125: Recorded Movement Report summary counts (14 October 2026)

PR #125 merged at `6dd53d3b927f184ceda8fb14916367c63199ae2d`. Exact tested head `4e79f8bf1cc8a2c4672aebf7cc87215debb35314` passed CI, Browser E2E (320 checks) and Full Flight Test (251 backend, 38 contrast and 320 browser checks). Malformed exception counters are rejected with a retryable error instead of crashing the report or silently hiding a warning.

## Completed engineering batch — PR #126 Daily Cash Close preview response contract (14 October 2026)

**Finding:** the active `frontend/features/cash-close.js` renderer consumed `cashClosePreview` data without validating the response envelope or nested arrays. Null issue/history rows can throw inside renderers, object-valued count fields can throw during string conversion, and the refresh error handler kept previous `data` assigned.

**Outcome:** validate open/closed response variants, dates, flags, finite amounts, safe counts, issue-row fields, close snapshots, ID/count alignment and correction/history records before rendering. Clear prior preview state when refresh begins. Invalid data shows a retryable error and prevents Save until a valid preview returns. Browser E2E covers null issue rows, an object-valued count and a null recent-history row, plus normal-response recovery.

**Boundaries:** frontend response integrity only; no server calculation, accounting rule, backend/API contract, schema, saved data, authorization or deployment changes. Independent live release and device/accessibility gates remain open.

## Phase 1 audit correction — 14 October 2026

The live audit supersedes stale “current sprint” and “active PR” wording where it conflicts with current GitHub state. PR #126 is merged. Its tested PR head passed CI, Browser E2E (325 checks) and Full Flight Test; post-merge CI passed on main SHA `255d78ccb6a21b204d432221489114ccf514d333`. These results do not close live deployment, backup/restore, device, accessibility or pilot gates. See [Phase 1 Repository Audit](PHASE-1-REPOSITORY-AUDIT.md).

## Phases 25–27 — Fresh Design Studio workflow completion (merged PR #161)

PR #161 merged at main SHA `525f8d0a8af73194ca73c83d05b02d38c02d1b8c`; exact tested head `27ceda070f38fe2a445e4e165fbbde20ee6377c9` passed CI, Browser E2E and Full Flight Test. The implementation completes Bulk Upload/Cash Close responsive surfaces, keyboard-reachable file selection and internal preview scrolling, semantic workflow styling, reduced-motion/forced-colors handling and shell cache refresh. There was no Apps Script deployment or production-data operation.

## Phases 28–30 — cross-workflow visual regression and accessibility states (merged PR #162)

PR #162 merged at main SHA `754df59cf62ab228ec0d66f9d3f90dfae5eea3d1`; tested head `6f103e863cd0e7fe5c2f2ae12196e594134faec0`. [CI/quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38986213796), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38986213795) and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38986213808) all passed. Browser E2E passed 898 checks; Full Flight Test passed 285 backend plus 898 browser checks. The runs publish 390px and 1280px screenshots for all 11 owner-visible screens in light/dark themes. Screenshots are repeatable review artifacts, not pixel-diff tests or human visual sign-off.

## Phases 31–33 — navigation focus and accessible interaction contract (merged PR #163)

PR #163 merged at main SHA `ae8eb594a33f7e33338009d75c52d0b010cea678`; exact tested head `a6b1eff7593bb7a58f4e6063fb31befd2a646773` passed [CI/quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38993477109), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38993477094) (936 checks) and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38993477080) (285 backend + 936 browser checks). It adds opt-in destination-heading focus for user navigation, an accessible-name regression heuristic over 11 workflows, account-menu dismissal/focus-return checks, visible heading focus and cache revision `cv2-v21`. These checks are not a full WCAG or screen-reader certification.

## Phases 34–36 — validation guidance and asynchronous state consistency (merged PR #164)

PR #164 merged at `dd901910531da2c060539baad44949fe2cb54b30`; tested head `b3adad0a8c089c0c42614ea2fffd6724664d9106`. CI/quality, Browser E2E (943 checks) and Full Flight Test (285 backend + 943 browser checks) passed on that head. Post-merge main CI: [run 38998817186](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38998817186).

- **Phase 34 — persistent form help:** associate each New Entry cash-impact selector with its settlement explanation. When validation adds an error, keep both the long-lived help and current error in `aria-describedby`; clearing the error removes only the error reference.
- **Phase 35 — recoverable report validation:** expose invalid date-range state on both report date fields, connect each to the same assertive alert, and clear those attributes when a valid report request begins. Place report loading/results under one stable `aria-busy` region without changing response validation or accounting semantics.
- **Phase 36 — proof and design parity:** add source-level design-system assertions, Browser E2E coverage for field/help/error relationships and busy/settled reports, visible styling for invalid report date inputs, bump the app-shell cache to `cv2-v22`, and update this roadmap and handoff together.
- **Acceptance boundary:** tests verify DOM state and announcements primitives, not assistive-technology output. Manual keyboard/screen-reader review, zoom/reflow, operator usability and live Apps Script release proof remain separate gates. No approval policy, cash calculations, API, permissions, schema or production data may change.

## Phases 37–39 — route-safe asynchronous workflow updates (merged PR #165)

**Finding:** an in-flight Recorded Movement Report read could rerender over a route selected after the request began; overlapping report requests and asynchronous Users/Vendor/Settings operations also lacked sufficient stale-response/route-ownership protection.

- **Phase 37:** sequence Reports requests, bind the result to its submitted filters, ignore stale completions and only rerender while Reports remains active.
- **Phase 38:** sequence Users reads and guard asynchronous administration callbacks against stale data or a different active route.
- **Phase 39:** add held-request browser regressions for Reports/Users navigation and Vendor save; source checks protect the route ownership contract and the shell cache advances to `cv2-v23`.
- **Merge/evidence:** PR #165 merged at `4b729f33d9caff13e01ed56acbc231375c5beec0`. Exact PR head `26a92a70513a088cddc994d1a398d63d908ec8e0` passed CI/quality, Browser E2E and Full Flight Test. No accounting, approval, permission, API/schema, dependency or production-data change.

## Customer delivery packaging and handover foundation — merged PR #166

PR #166 adds a guarded per-customer static-site builder requiring the verified Apps Script Web App `CV_API_URL`, emits only the static runtime into `dist/`, generates the Cloudflare Pages response-header file and adds onboarding, quick-start and private instance-register documents. Its exact tested head `13f12d314687ec88d9044ccae7e8fb3c202743fb` passed CI, Browser E2E (947 checks) and Full Flight Test (285 backend + 947 browser checks). Post-merge CI also passed on current main.

This is source/build/documentation readiness only: it did not provision staging/customer Google resources or a static host, run the live staging workflow, prove a real restore, or issue a customer URL. The active release queue is now the owner-controlled operational work in `docs/STAGING-RELEASE-AUDIT.md` and `docs/RELEASE-READINESS.md`.
