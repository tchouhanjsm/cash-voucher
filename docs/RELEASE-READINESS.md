# Release Readiness

**Status: not verified as production-ready. Current `main` is `628f691fe9e4353cc6b701bd57c95c3e169aa495` (PR #67 merge). The configured URL matches the existing version-4 deployment ID, but the current backend is not confirmed deployed. Local quality checks and Browser E2E pass; live behavior and recovery remain unverified.** The static app, mock backend checks and browser workflow have been developed, but real Google-account, recovery and hotel-operation gates remain open.

## Evidence-based baseline

| Area                                                        | Current status        | Evidence / limitation                                                                                    |
| ----------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| Backend validation, schema checks and number reconciliation | Implemented           | Current `backend/Code.gs` and mock backend suite; not a live Google-account test                         |
| PIN hash and session protection                             | Implemented           | HMAC-SHA256 with per-user salt + script property pepper; salt rotation invalidates old session tokens    |
| Login/PIN-change attempt throttling                         | Implemented in source | PR #32 is merged and post-merge CI passed; not deployed to Apps Script                                   |
| Server-side role enforcement                                | Implemented           | `PERMS` and `need_`/`can_` in backend; UI visibility is not the security boundary                        |
| Active frontend architecture                                | PASS on current main  | `index.html` loads `frontend/main.js`; source graph is modular                                           |
| PWA/outbox recovery                                         | Implemented in source | PRs #18–21 and browser E2E; device/storage durability is not a server backup                             |
| CI quality gate                                             | PASS on current main  | Post-merge CI passed on `4d80152`; each later PR must still be checked at its exact head                 |
| Browser E2E                                                 | PASS on PR #32 head   | 47 checks passed; mock-only coverage does not verify live Google services or device accessibility        |
| Daily backup mechanism                                      | Implemented in source | Live trigger success, backup contents and restore drill remain unverified                                |
| Accessibility / design audit                                | NOT VERIFIED          | HTML contains semantic labels/skip link/status landmarks; no completed contrast/usability audit evidence |
| Production Apps Script deployment                           | Unconfirmed           | Owner reported version 4 before PRs #64/#65; current merged backend deployment is unconfirmed            |
| Hotel operational pilot / cash reconciliation               | NOT STARTED           | Requires real operators/devices and an owner-approved trial                                              |

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
- [ ] Verify login, PIN change, payment, cash receipt, receipt photo, register, bulk upload, audit view, printing, offline queue and recovery.

## Gate 3 — live Apps Script and data

Before upload, follow [`Apps Script Release Runbook`](APPS-SCRIPT-RELEASE-RUNBOOK.md). Confirm the local `.clasp.json` target and match the current deployment ID to `config.js`; do not guess a script ID or rerun `setup()` for a routine code update.

- [ ] Keep production Sheet and Drive folders private; verify staff have no direct spreadsheet edit access.
- [ ] Confirm deployment executes as the intended owner/deployer and points at the intended Sheet.
- [ ] Verify Script Properties and the owner account; rotate the owner PIN if a reported legacy setup value was ever used.
- [ ] Deploy reviewed backend source intentionally, creating a new Web App version while preserving the intended URL.
- [ ] Verify lockout, PIN change, session invalidation, role restrictions, voucher numbering/idempotency and receipt access against the actual deployment.
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
- Owner-provided `npm run check` passed, including 110 backend checks and the backup, integrity, CSV, dependency-audit and PR-quality suites. One existing ESLint warning remains for unused `backupData_` in `backend/Code.gs`.
- Owner-provided Browser E2E passed **128 checks, 0 failures** with Playwright `1.52.0` and Chromium.
- `git diff --check` passed. Preserve the untracked `docs/AI-ENGINEERING-PROTOCOL.md`; do not commit it.
- Clasp reports four numbered versions. The configured URL matches version 4's deployment ID; a separate `@HEAD` deployment exists. This is not evidence that the latest `main` source is deployed.
- Still open: owner confirmation of project identity, deployment settings, Sheet binding and Script Properties in the Apps Script editor; live owner/manager/staff and receipt authorization; a real scheduled backup; witnessed restore to a separate recovery Sheet/folder; dependency vulnerability triage.
