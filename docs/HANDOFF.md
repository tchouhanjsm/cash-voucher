# Engineering Handoff

**Updated:** 11 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `df6f3354c4ef30321941c0bf1d9b9b15a399a066` (PR #79 merge)  
**Purpose:** this is the one live handoff for the next ChatGPT engineering session. Verify live GitHub refs before relying on any SHA or PR state recorded here.

## Current phase

**PR #80 — [Isolate offline outbox failures and bind queued payments to users](https://github.com/tchouhanjsm/cash-voucher/pull/80)**  
Branch: `fix/offline-outbox-account-isolation`  
Base: `df6f3354c4ef30321941c0bf1d9b9b15a399a066`

Scope: persist an origin server/account binding on each new offline queue record, isolate row-specific server rejections from unrelated entries, keep failed records for explicit review/recovery, scope export/discard/sync to the signed-in account, preserve older unbound records until an explicit recovery confirmation, and protect the New Entry draft during a background refresh. This is mock-backed code work only; no production deployment or live operational verification.

Adopt three distinct sources of information:

- This file is the current state, blockers and next actions.
- Each GitHub PR description is the permanent record of that change, acceptance criteria, exact-head verification and review decisions.
- Domain documents change only when their substance changes.

From PR #76 onward, do not create `docs/pr-handoffs/PR-<number>.md` files. Existing per-PR handoff files remain historical artifacts. `docs/PR-HANDOFFS.md` is frozen through PR #75. Do not create a separate post-merge PR just to update handoff metadata.

## Product and architecture

Cash Voucher is a single-property cash-voucher PWA backed by Google Apps Script, Google Sheets and Drive.

- `index.html` loads `frontend/main.js`; the root `app.js` is legacy and is not the active entry point.
- `frontend/core/` owns shared infrastructure; `frontend/features/` owns feature behavior; `backend/Code.gs` is the Apps Script API source.
- Backend role enforcement is the security boundary; UI visibility does not authorize requests.
- Browser-local outbox entries are not centrally backed up until synchronized.
- Dashboard cash-in-hand and movement reporting are recorded-voucher views, not proof of physical cash, accounting, tax, or general-ledger reconciliation.
- Daily cash close remains design-only until owner/accountant decisions in `docs/DAILY-CASH-CLOSE-DESIGN.md` are approved.
- Preserve the owner's local untracked `docs/AI-ENGINEERING-PROTOCOL.md`; do not stage or overwrite it.

## Durable engineering rules

- One coherent, focused PR at a time; avoid stacked/overlapping PRs. No arbitrary commit-count ceiling.
- Verify live PR/main refs, exact head SHA, changed files, and final workflow results. Never infer a merge or test result from prior chat.
- Run the two-pass functional/product and security/recovery review in `docs/DEVELOPMENT-WORKFLOW.md`.
- The PR description must have the required outcome, acceptance criteria, verification evidence, security/failure review, release boundary, and residual-risk sections.
- The PR's exact final head must pass CI, Browser E2E and Full Flight Test. Do not report earlier-SHA checks as current evidence.
- The owner reviews and merges. Never merge, force-push, delete branches, run Apps Script `setup()`, use `clasp push`, deploy, or mutate production data without explicit authorization.
- A merged Apps Script source change is not a deployed Web App; live access, backup and restore require operational evidence.

## Open production and quality gates

These remain open regardless of green mock-backed CI:

1. Owner verifies the intended Apps Script project, active deployment/execution settings, Sheet binding, and Script Properties in the Apps Script editor.
2. Verify real owner/manager/staff authorization, including receipt access and staff restrictions, against the live deployment.
3. Observe a scheduled backup in Drive, inspect copied Sheet/receipt/manifest contents, and witness a restore into a separate recovery Sheet/folder; validate counts and voucher numbering.
4. Complete physical-device PWA install/update/offline checks, assistive-technology testing, and a controlled hotel pilot.
5. Continue the incremental stored-XSS/rendering sink audit. It is not a full security certification.
6. The current lint warning for unused `backupData_` and the documented time-limited `@google/clasp → micromatch → braces` dependency-advisory exception remain visible. The documented review-by date is 9 November 2026.

## Recent completed milestones

- **PR #73 — Report date-range escaping:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/73); 141 browser checks passed.
- **PR #74 — Save-confirmation voucher-number escaping:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/74); Full Flight, CI and Browser E2E passed, with 142 browser checks.
- **PR #75 — Bulk import completion feedback:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/75) at `0d9a6a4ae904862d213144e7a823ca1ec5d547f9`; CI passed, Browser E2E passed 145 checks / 0 failures, and Full Flight Test passed 110 backend checks plus 145 browser checks.
- **PR #76 — Consolidate engineering handoff documentation:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/76) at `b1f2a3234577301e4e9536dd424695976f1d8fca`; three exact-head workflows passed. No application behavior or deployment changed.
- **PR #77 — Escape settings numeric input attributes:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/77) at `539d5d8afd101136f0f1a3922068fc9624d12890`; CI, Browser E2E and Full Flight Test passed at its exact tested head with 146 browser checks.
- **PR #78 — Harden backend action and role allowlists:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/78) at `3ac0c387d52fc2631f26b48f6169a5b6c03a995d`; exact tested head passed CI (112 backend/unit checks), Browser E2E (146 checks) and Full Flight Test.
- **PR #79 — Disable vulnerable runtime Excel parser:** [merged](https://github.com/tchouhanjsm/cash-voucher/pull/79) at `df6f3354c4ef30321941c0bf1d9b9b15a399a066`; exact tested head passed CI (112 backend/unit checks), Browser E2E (152 checks) and Full Flight Test. Excel workbook import remains intentionally disabled; CSV/TSV/TXT and paste remain available.

For full acceptance criteria, diffs, review discussions and CI evidence, use those GitHub PR records. Do not copy their full histories into this handoff.

## Resume procedure for a new ChatGPT thread

1. Read this file first.
2. Verify the live `main` SHA, the current open PR(s), branch and PR head. Live GitHub state wins if this file is stale.
3. Read `docs/DEVELOPMENT-WORKFLOW.md` and follow its source-of-truth, two-pass review and exact-head verification gates.
4. Read `docs/PRODUCT-ROADMAP.md` to choose the next product/engineering priority. Read `docs/SECURITY-RENDERING-AUDIT.md`, `docs/RELEASE-READINESS.md`, or a requirements/design document only when needed for the chosen scope.
5. PR #79 is merged at the verified `main` SHA above. It disables the runtime-loaded vulnerable Excel parser; workbook import remains unavailable pending a separately reviewed self-hosted parser.
6. PR #80 is the current phase: isolate row-specific offline upload rejections, bind queued items to the origin server/account, prevent cross-account sync/export/discard, and preserve the New Entry draft during background refresh. Run CI, Browser E2E and Full Flight Test against one exact final PR head; the owner reviews and merges.
7. Keep live Apps Script target/permissions, real scheduled backup and isolated restore, physical-device PWA tests and the controlled pilot as separate unverified operational gates. Daily cash close remains behind the existing owner/accountant decisions.
