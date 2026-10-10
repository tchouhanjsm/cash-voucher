# Engineering Handoff

**Updated:** 2026-10-10  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified main SHA (PR #71 merge):** `ea99e4e19be0f29e8c1afdc25828bf1b5ecce399`  
**Source of truth:** live GitHub refs and exact-head workflow runs. PR descriptions hold the authoritative current CI/E2E links.

## Product and architecture

Cash Voucher is a single-property cash-voucher PWA backed by Google Apps Script, Google Sheets and Drive. `index.html` loads `frontend/main.js`; `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/Code.gs` is the API source. Root `app.js` is legacy and is not loaded by `index.html`.

Server-side authorization is authoritative. Browser-local offline entries are not centrally backed up until synchronized. Recorded backup status does not prove snapshot completeness or restoreability. Daily cash close remains design-only until the owner approves the decisions in `docs/DAILY-CASH-CLOSE-DESIGN.md`.

## Current PR state

- PR #46 is merged to `main`; backup failure cleanup, lock safety, and removal of the arbitrary commit-count ceiling are in the integration history. Its mock tests do not prove live Drive/restore behavior.
- PR #47 is closed without merge to avoid stacking; its formatting correction was included in #46.
- PR #48 is merged into `main` (merge commit `49142bd92eb3ef45a0dee70610d874612c40523a`); its contrast/financial readability foundation passed CI and 75 Browser E2E checks.
- PR #49 merged on 9 October 2026 (merge commit `dd70819f02c564ad4df433e27342d7a53dd004b6`). Its Browser E2E passed 93 checks; use the live PR description for exact CI evidence.
- PR #50 merged on 9 October 2026 (merge commit `c9ccc829076b9d461372cd6a2959342286cc04a4`); it adds a 19-pair contrast check and dialog Escape/focus-return handling.
- PR #52 merged on 9 October 2026 (merge commit `64655a5b11956d0289b4e6098599df7cd8932860`); it isolates modal background interaction and adds focus-containment browser coverage. Exact-head CI/E2E passed 98 checks, 0 failures.
- PR #53 merged on 9 October 2026 (merge commit `a6bb1ace7547114c9c8072dd7359ca901387980d`); narrow payment-row reflow and reduced-motion browser coverage passed CI and 101 Browser E2E checks.
- PR #54 merged on 9 October 2026 (merge commit `a87c1d90405b1e7cd1097c6328668f91f8cc9af4`); register empty-state clarity and filter recovery passed CI and 103 Browser E2E checks.
- PR #55 merged on 9 October 2026 (merge commit `b73aee24b91a4b5808e05bda2e84537188c5028f`); receipt retry and register refresh recovery are integrated. Exact-head CI and Browser E2E passed on PR head `54b2cae724a6dcb6c9a63e1a996f745e99e38427` (106 checks, 0 failures).
- PR #56 merged on 9 October 2026 (merge commit `9249d753daf361798c457d237ab16d121d13b47e`); exact PR head `9a06246c125594ff7af1201cf1f897000a744857`, CI passed and Browser E2E passed 114 checks / 0 failures.
- PR #58 merged on 10 October 2026 (merge commit `544e0170fdb9333d62f7efa40dc512c84a28c1a6`): owner-only Audit log route, filters, latest-200 disclosure, and filtered CSV export. The export is not full audit history; live Google authorization and accountant compatibility remain unverified.
- PR #63 release: the owner reports uploading the reviewed backend and updating the configured Web App deployment to version 4. Live role smoke tests and backup/restore remain unverified.

## Process decisions

- No hard commit-count ceiling; judge coherence, reviewability, final diff and evidence.
- No history rewrite or force-push. Avoid stacked PRs; fold safe corrections into the active PR.
- Every PR requires `docs/pr-handoffs/PR-<number>.md` and an updated `docs/HANDOFF.md`.
- The owner reviews and merges. Do not merge, deploy Apps Script, or mutate production data on the owner's behalf.
- Local repository synchronization is the owner's post-approval step; do not ask for a local sync while the PR is under review.

## Current verified state — PR #65 merged

- **Main SHA:** `eef7a8d46dd41b86a7ebaab4fadbf64be42e5922`.
- **PR #65:** merged as `eef7a8d46dd41b86a7ebaab4fadbf64be42e5922`. Exact PR head `09eaac429307e4243d7a7d2fce1f16ef3402b029` passed CI and Browser E2E. [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38026680725) · [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38026680745).
- PR #65 adds a manager/owner-only read-only recorded voucher movement report with date/type/status filters, source rows, active/cancelled totals and CSV formula-prefix protection.
- The Apps Script deployment was last reported at version 4 before PRs #64 and #65 merged. Do **not** assume current `main` is deployed. No deployment is authorized by this phase.

## Completed phase — PR #66: backup integrity inspection

- **Branch:** `feature/backup-integrity-report`.
- **Base:** `eef7a8d46dd41b86a7ebaab4fadbf64be42e5922`.
- **Merged:** `3c93ddd6d45052f2e53e04c713060f0da72ccdd6`.
- **Outcome:** add an owner-only, read-only inspection of the ten most recent managed backup snapshots. Check spreadsheet-copy presence/readability, required tabs, header compatibility, receipt folder, manifest format/count and manifest references to copied receipt files.
- **Safety:** no restore, deletion, retention pruning, source mutation, setup, Clasp push or deployment. A pass means structural checks passed only; it does not prove restoreability. Header mismatches are warnings because a backup can predate the current schema.
- **Verification:** exact head `5436bf9e233c8bf68bcb44e3b4ca33f19229f24f` passed CI and Browser E2E (126 checks, 0 failures). [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38028051313) · [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38028051295). Live Drive behavior remains unverified.

## Operational gates still open

- Owner to verify the configured Apps Script project and existing deployment before any upload.
- Live owner/manager/staff authorization and receipt-access smoke tests remain unverified.
- Observe a real scheduled backup; verify Sheet copy, receipt copies and manifest in Drive.
- Perform a witnessed restore into a separate recovery Sheet/folder and validate data/numbering. Do not overwrite production.
- Supported Node is now verified locally: `v20.20.2`. Browser E2E passed 128 checks / 0 failures.
- Three high-severity dependency findings were reported by npm; dependency paths still need triage.
- Real-device PWA update/install, assistive-technology testing and a controlled hotel pilot remain outstanding.

## Process constraints

- One focused PR at a time; every PR updates this handoff, roadmap, PR index and its dedicated `docs/pr-handoffs/PR-<number>.md`.
- Verify live refs and exact-head workflows; distinguish source, CI/mock, deployed and live operational evidence.
- The owner reviews and merges PRs and retains all production deployment authority.
- Never run `setup()` for a routine release, change deployment targets by guess, mutate production records for tests, force-push, or claim backup success proves restoreability.

## Completed phase — PR #67: owner inspection Browser E2E coverage

- **Base SHA:** `3c93ddd6d45052f2e53e04c713060f0da72ccdd6`.
- **Scope:** add browser assertions for the owner Settings data-quality scan and the backup-integrity inspection's user-visible failure/retry behavior in the mock-Google environment.
- **Evidence boundary:** the browser mock cannot prove live Drive access or restoreability. Backup integrity success-path structure remains covered by injected-service backend tests; this E2E addition deliberately verifies that the UI announces a failure and re-enables retry when the mock lacks Drive folder inspection support.
- **Local evidence after PR #67 merge:** `npm run check` passed on Node `v20.20.2`, including 110 backend checks; Browser E2E passed 128 checks / 0 failures using Playwright `1.52.0` and Chromium. `git diff --check` passed. ESLint still reports one unused-function warning for `backupData_`; npm reports three high-severity dependency findings.
- **Unchanged operational P0:** live owner/manager/staff authorization checks, a real scheduled backup, and a witnessed restore to a separate recovery Sheet/folder remain open. No Clasp push, deployment, setup, or production mutation.

## Current phase — P0 Apps Script release target and recovery verification

- **Source baseline:** `628f691fe9e4353cc6b701bd57c95c3e169aa495` on `main`.
- **Read-only Clasp evidence:** local root is `backend`; tracked files are `backend/appsscript.json` and `backend/Code.gs`; four numbered versions exist; the configured URL matches the existing version-4 deployment ID; a separate `@HEAD` deployment exists.
- **Not yet verified:** the owner has not yet confirmed the intended Apps Script project, active deployment settings, Sheet binding and Script Properties in the Apps Script editor. Matching the URL's deployment ID does not prove current `main` is deployed.
- **Next:** owner confirms the project/resources and authorizes any upload; then controlled live role/receipt checks, real scheduled-backup verification, and a witnessed restore into a separate recovery Sheet/folder.
- **Hard boundary:** no `clasp push`, `clasp deploy`, `setup()`, production mutation or merge performed by the assistant. Preserve local untracked `docs/AI-ENGINEERING-PROTOCOL.md`.

## Completed phase — PR #69: DOM-only modal rendering

- **Base SHA:** `9751df49db6ba524376a2e39f79d744e4b36ec11` (PR #68 merge).
- **Branch:** `feature/dom-safe-dialog-content`.
- **Goal:** remove raw HTML strings from the shared modal body's contract. `dialog()` now requires a DOM Node/DocumentFragment and rejects string bodies. Current PIN reset, forced PIN change, voucher edit, cancellation, and receipt dialogs are being migrated to DOM-built controls and text/value properties.
- **Security boundary:** targeted shared-modal hardening only. Other active view renderers still use HTML templates and remain in the complete sink-by-sink audit scope.
- **Validation plan:** run `npm run check`, Browser E2E, `git diff --check`, two-pass review and exact-head CI/E2E. CI status is not inferred from prior SHAs.
- **Operational P0 remains open:** confirm the intended Apps Script project, active deployment and Sheet/Script Properties; verify live role/receipt permissions; observe a real scheduled backup; and witness restore into a separate recovery Sheet/folder. No `clasp push`, deployment, `setup()`, or production mutation is part of PR #69.
- **Local preservation:** never stage or commit the owner's untracked `docs/AI-ENGINEERING-PROTOCOL.md`.

## Completed phase — PR #70: escape persisted voucher numbers

- Merged to `main` as `1e656dee0266dba38d35500150889ce6020d8045`.
- Exact PR head `061d0a5bc8c13f195fe6a929361e0c7f00e8acb3`: CI passed; Browser E2E passed 130 checks / 0 failures.
- Scope: escaped voucher numbers in register/print templates and added hostile persisted-number regression coverage.

## Completed phase — PR #71: executable full flight test

- **Merged main:** ea99e4e19be0f29e8c1afdc25828bf1b5ecce399; merge commit tree matches the PR #71 head tree.
- **Exact PR #71 head:** 57236be70832b57e7d07fe5eed8d2e0b586a6e95.
- **Full flight:** passed on the PR #71 head — dependency advisory policy, complete npm run check, then Browser E2E. Backend suite: 110 checks; Browser E2E: 130 checks / 0 failures.
- **Evidence:** [full flight](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38043779296) · [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38043779316) · [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38043779443).
- **Boundary:** automated/mock-backed checks only; no live Google authorization, Drive backup or restoreability claim.

## Current development phase — PR #72: report workflow flight coverage

- **Base SHA:** ea99e4e19be0f29e8c1afdc25828bf1b5ecce399.
- **Branch:** feature/recorded-report-flight-coverage.
- **Outcome:** exercise the accountant-facing Recorded Movement Report in Browser E2E, including default active-source rows, cancelled-only filtering, receipt-only filtering, cancellation metadata in CSV, and CSV contents matching the selected filters.
- **Why this phase:** backend movement-report validation already has unit coverage, but the real browser-to-mock API-to-render/export path was not asserted by the current E2E suite. This closes a concrete functional verification gap rather than adding documentation alone.
- **Verification:** exact-head full flight, CI and Browser E2E status/URLs are maintained in the PR #72 description. Owner review is blocked until all three pass on the final head. Local checks are not claimed in this environment.
- **Operational P0:** live Apps Script target/authorization, role/receipt access, real scheduled backup and isolated restore remain open. No clasp push, deployment, setup(), or production mutation.
- **Local preservation:** do not stage or commit the owner's untracked docs/AI-ENGINEERING-PROTOCOL.md.
