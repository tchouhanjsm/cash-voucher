# Release Readiness

**Reviewed:** 18 October 2026. **Verified main baseline:** `8b14adc72c146589149a33d793ca9e55af5da13a` (latest main after PR #175 and subsequent merged changes). Latest [main CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39120596949) passed. PR #175's exact tested head `49c672859d86aff4b4c648a0221a57ff3387f8ce` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39118432725), [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39118432728) and [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39118432768). PRs #173 and #174 are also merged. Older PR snapshots below are historical, not a live status feed.

**Status: source is ready to use as a staging input; live staging and first-customer handover are not verified.** PR #165 route-safe asynchronous updates, PR #166 customer static artifact packaging/headers, PR #169 password authentication/staging safeguards, and PR #173 server-backed onboarding/release gates are merged. A merge does not create Google resources, a hosting project or a customer URL. The root `config.js` endpoint has not been independently mapped to its Script/deployment/Sheet/Drive resources. Repository visibility is private; verify host continuity.

Still unverified: dedicated staging Apps Script project/Sheet/Drive folders, deployment identity, protected GitHub staging Environment/secrets, staging static host/subdomain and live response headers, real role/receipt authorization, backup and isolated restore/reconciliation, real-device offline recovery/accessibility, real-service quota/concurrency, and the controlled 14-day pilot. Do not hand over a live link as ready until the relevant gates have evidence in the private instance register.

## Setup preflight follow-up — awaiting exact-head CI and live verification

The branch `fix/staging-setup-preflight-20261018` adds fail-closed setup checks and regression tests for missing/invalid owner credentials, malformed Users headers, orphaned/incomplete rows and repeat setup. The operator's local logs report the listed `npm run check` suites completed and Browser E2E at 951 passed/0 failed. These results are not GitHub CI and not a live Apps Script or hosting test. Do not merge until the exact PR head's required checks pass. No setup, Web App deployment or frontend publication has occurred by this source change.

## Staging pipeline — code implemented, live environment not verified

PR #155 merged the manual `.github/workflows/staging-uat.yml` pipeline. The workflow requires `main`, the exact `STAGING-ONLY` confirmation, explicit staging-write consent, and the protected GitHub `staging` Environment for deploy/UAT jobs. The workflow is not a live deployment record.

Owner provisioning/execution remains outstanding until independently evidenced:

- Dedicated staging Apps Script project, separate Spreadsheet, receipt folder and backup folder.
- A first versioned staging Web App deployment, with its exact Script/deployment/Sheet/Drive identities verified.
- Protected GitHub `staging` Environment, restricted to `main`, with required reviewers where supported.
- The documented environment variables, isolated Clasp OAuth credential secret and distinct staging Owner/Manager account secrets.
- Owner-authorized `workflow_dispatch` execution and review of the live UAT result.

Do not run `setup()` against an existing production property, use the staging workflow to target production, expose secret values, or treat mock checks as live evidence. No provisioning/deployment/UAT is claimed by this source review.

## Current go-live gates — reviewed 18 October 2026

PR #111 is merged to source at `6092152c64adff084abfda5407056dac9401b5e9`; PR #126 is also merged on current main. Daily Cash Close source is **not proof of live deployment**; after a verified backup and owner-authorized release, the guarded schema steps remain `migrateCashImpactField()` if needed, then `migrateDailyCashCloseSchema()`. Verify both new tabs and unchanged voucher row counts before publishing.

The Dashboard already displays **Book balance**. It is a recorded-voucher projection (global Settings opening balance + active receipts − active payments), not a physical drawer count, bank balance, or general ledger. Daily Cash Close is a separate, immutable physical-cash reconciliation.

- **Browser CSP baseline — added in this source batch:** the static release check validates the production-source policy. The mock E2E server adds a test-only `'unsafe-eval'` exception for Playwright polling, so its run is functional regression evidence, not proof of the exact production CSP.
- **Header-level framing protection — artifact implemented, live response not verified:** customer builds generate `_headers` for Cloudflare Pages and `.htaccess` for Apache, including a CSP response header with `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Verify the actual document response after deployment; the HTML meta policy cannot enforce `frame-ancestors`, and Apache must allow `mod_headers` and overrides.
- **Live Apps Script project/version — not verified:** the owner must confirm the intended project, Sheet binding, Script Properties and deployment ID matching `config.js`.
- **Authorization and receipt access — not verified live:** perform owner/manager/staff smoke tests against the actual deployed endpoint.
- **Real scheduled backup and isolated restore — not verified:** inspect a completed Drive snapshot and witness restore into a separate recovery Sheet/folder; validate row counts and voucher numbering.
- **PWA, offline recovery and accessibility — not verified on devices:** test actual operating phones/tablets, queued/rejected entries, receipt photos, service-worker update, keyboard and assistive technology.
- **14-day hotel pilot — not started:** start only after release, restore and device gates pass; maintain daily evidence below.

The meta CSP allowlist covers same-origin PWA assets, data/blob receipt previews and the Apps Script ContentService origins. Script execution is restricted to same-origin external files; inline event handlers, object plugins, `unsafe-eval` and child frames are disallowed. Inline styles remain allowed because the dashboard renders variable chart-bar widths through style attributes. The customer build generates `_headers` for Cloudflare Pages and `.htaccess` for Apache to configure CSP, anti-framing, MIME-sniffing, referrer and permissions policies. **No live host response has been checked yet**: CI proves the generated files, not that a configured host applies them.

## 14-day controlled pilot — NOT STARTED

Do not begin the pilot until the owner confirms the release target, required migrations are verified, an isolated restore has succeeded, and the app has been tested on the operating devices. Record no-activity days explicitly. Check local outbox/recovery queues on every operating device; a single browser's empty queue is not a system-wide guarantee.

- [ ] **Day 1:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 2:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 3:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 4:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 5:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 6:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 7:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 8:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 9:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 10:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 11:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 12:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 13:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.
- [ ] **Day 14:** Date `___`; operator `___`; server voucher check `___`; all-device queue check `___`; Book balance / physical count / close `___`; variance or incident `___`; fallback `___`; owner/manager sign-off `___`.

**Pause criteria:** authorization failure, missing/duplicated voucher, unresolved active `UNCLASSIFIED` voucher, missing receipt, unexplained cash variance, failed backup, or unrecoverable offline entry. Preserve evidence and queued data; switch to the previously approved fallback process and get owner approval before resuming. At day 14, record unresolved incidents and obtain an explicit go/no-go decision. No pilot is claimed by this source PR.

## Evidence-based baseline

- **Current source verification — passed:** PR #173 exact tested head passed CI, Browser E2E and Full Flight Test; post-merge main CI also passed. These are source/mock results, not verification of the live staging customer's Google resources.
- **Password hash and session protection — implemented in source:** HMAC-SHA256 with per-user salt and a Script Properties pepper; password-change/reset salt rotation invalidates existing sessions. Verify live behavior against the staging instance; source tests do not establish production performance or readiness.
- **Support reporting — implemented in source (PR #175):** authenticated Account → Report a problem submits to per-instance `SUPPORT_EMAIL`, applies best-effort cache rate limits, adds a reference and records subject-only audit evidence. Live MailApp delivery and quotas remain unverified.
- **Server-backed onboarding — implemented in source:** environment-specific state, owner-only ordered confirmations, resource identity checks and centralized financial-write gates. Owner evidence remains an attestation, not automatic proof of successful device UAT or restore.
- **Static client packaging — implemented in source:** build requires `CV_API_URL` and explicit `CV_ENVIRONMENT=staging|production`; it emits the minimal static client, generated environment/deployment config and a Cloudflare Pages `_headers` file. It does not provision a host or prove headers are served. The builder also emits `.htaccess` for Apache; verify live response headers and configure the host if required.
- **Backend validation/role enforcement, password protection, audit recording, daily-backup mechanism, cash close and PWA/outbox recovery — implemented with mock-backed regression coverage.** Live Apps Script behavior, backup completeness and restoreability remain unverified.
- **Accessibility/design — not verified as conformance.** Automated responsive and accessibility heuristics do not replace manual assistive-technology and real-device review.
- **Production Apps Script deployment — unconfirmed.** Current live project/version, permissions and recovery evidence are not recorded.
- **Controlled pilot — not started.** Requires staging, restore and device gates to pass first.

The owner-only Settings panel reports recorded backup metadata, but does not verify live Drive access, snapshot completeness or restoreability.

## Post-PR #65 / PR #66 status

PR #65 merged at `eef7a8d46dd41b86a7ebaab4fadbf64be42e5922`; exact-head CI and Browser E2E passed. PR #66 is merged at `3c93ddd6d45052f2e53e04c713060f0da72ccdd6` and adds read-only structural inspection of the ten latest managed backups. Even if that scan passes, a witnessed restore into a separate destination is still mandatory. Do not treat the version-4 deployment report as evidence that PRs #64/#65 are live.

## Gate 1 — source and CI

- [ ] Owner-reviewed PR is merged to `main`.
- [ ] CI `npm run check` passes on the exact merged commit.
- [ ] Browser E2E passes for any affected user journey.
- [ ] Diff reviewed for permission boundaries, XSS/HTML insertion, lock scope and changed contracts.
- [ ] No unreviewed source changes or unintended branches involved.

## Gate 2 — Web/PWA on real devices

- [ ] Confirm current Pages URL serves the intended source version.
- [ ] Verify a clean install/start and update after service-worker cache version changes.
- [ ] Test a narrow phone viewport and desktop/tablet layouts.
- [ ] Test screen-reader/status announcements, keyboard focus and contrast on key screens.
- [ ] Verify password login/change/logout, payment, cash receipt, receipt photo, register, bulk upload, audit view, printing, offline queue and recovery.

## Gate 3 — live Apps Script and data

Before upload, follow [`Apps Script Release Runbook`](APPS-SCRIPT-RELEASE-RUNBOOK.md). Confirm the local `.clasp.json` target and match the current deployment ID to `config.js`; do not guess a script ID or rerun `setup()` for a routine code update.

- [ ] Keep production Sheet and Drive folders private; verify staff have no direct spreadsheet edit access.
- [ ] Confirm deployment executes as the intended owner/deployer and points at the intended Sheet.
- [ ] Verify Script Properties and the owner account; rotate affected deployed credentials if a reported legacy setup value was ever used.
- [ ] Deploy reviewed backend source intentionally, creating a new Web App version while preserving the intended URL.
- [ ] Verify lockout, password change, session invalidation, role restrictions, voucher numbering/idempotency and receipt access against the actual deployment.
- [ ] Observe at least one scheduled backup run; compare status-panel timestamps with Drive; open its Sheet copy and verify copied receipts/manifest.
- [ ] Perform restore into a separate Sheet/folder and validate record counts and voucher numbering.

## Gate 4 — controlled hotel pilot

- [ ] Owner, manager and staff accounts tested by the intended people.
- [ ] Real payment and receipt capture verified; cash-received record verified.
- [ ] Manager edit/cancel and cancellation reason confirmed.
- [ ] Physical cash count compared with book balance at day end.
- [ ] Offline entry/reconnect/recovery tested on actual devices and spotty connectivity.
- [ ] Printing/export accepted by the person who processes accounts.
- [ ] Operators understand when an entry is device-local versus server-synchronized.
- [ ] Current process retained as a fallback until the owner signs off.

## Release rule

Passing CI is necessary, not sufficient. Do not declare production readiness until Gates 1–4 are complete and an owner-approved recovery drill succeeds. Backend source commits do not deploy Apps Script automatically; no live deployment or cutover is included by this checklist.

## PR #67 — inspection browser regression coverage

PR #67 adds browser assertions for the data-quality report's user-facing scope disclaimer and the backup-integrity scan's announced failure/retry behavior in the mock environment. These checks strengthen UI regression coverage only. They do not close Gate 3 live authorization, real backup observation, or isolated restore. Production readiness remains **not verified** until the owner completes the operational gates above.

## PR #67 merged — updated local evidence (10 October 2026)

- Node `v20.20.2` satisfies the repository's declared Node 20–22 range.
- Owner-provided `npm run check` passed, including 110 backend checks and the backup, integrity, CSV, dependency-audit and PR-quality suites. One existing ESLint warning remains for unused `backupData_` in `backend/*.gs`.
- Owner-provided Browser E2E passed **128 checks, 0 failures** with Playwright `1.52.0` and Chromium.
- `git diff --check` passed. Preserve the untracked `docs/AI-ENGINEERING-PROTOCOL.md`; do not commit it.
- Clasp reports four numbered versions. The configured URL matches version 4's deployment ID; a separate `@HEAD` deployment exists. This is not evidence that the latest `main` source is deployed.
- Still open: owner confirmation of project identity, deployment settings, Sheet binding and Script Properties in the Apps Script editor; live owner/manager/staff and receipt authorization; a real scheduled backup; witnessed restore to a separate recovery Sheet/folder; dependency vulnerability triage.

## PR #73 merged — rendering regression evidence

- Merge SHA: `71033675cc9f52ad391f8b2d06a362551a224be6`.
- Exact tested head: `4cc407932c86e583a43d50286e5ac3178165cb31`.
- Full Flight Test, CI and Browser E2E passed. Browser E2E reported 141 checks,
  zero failures. This is mock-backed evidence only.

## PR #74 merged — save-confirmation rendering security

PR #74 merged at `970475dc440a3dc84b788087e60a73836d3d8814`. Its exact tested head passed Full Flight Test, normal CI and Browser E2E (142 browser checks, zero failures). It does not deploy Apps Script or close live operational gates.

## PR #75 merged — bulk import completion feedback

Merged at `0d9a6a4ae904862d213144e7a823ca1ec5d547f9`. Its exact tested PR head passed CI, Browser E2E (145 checks / 0 failures) and Full Flight Test (110 backend checks; 145 browser checks / 0 failures). This frontend change does not alter the status of live authorization, scheduled backup or isolated restore gates.
