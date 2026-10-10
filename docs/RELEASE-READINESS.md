# Release Readiness

**Status: engineering candidate; not yet verified as production-ready. PR #63 is merged and the owner reports deployment version 4; live behavior and recovery remain unverified.** The static app, mock backend checks and browser workflow have been developed, but real Google-account, recovery and hotel-operation gates remain open.

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
| Production Apps Script deployment                           | Version 4 deployed    | Owner reports successful `clasp push` and update of the configured deployment; live smoke tests remain open |
| Hotel operational pilot / cash reconciliation               | NOT STARTED           | Requires real operators/devices and an owner-approved trial                                              |

The owner-only Settings panel reports recorded backup metadata, but does not verify live Drive access, snapshot completeness or restoreability.

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
