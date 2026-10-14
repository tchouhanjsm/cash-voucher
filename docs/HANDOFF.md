# Engineering Handoff

**Updated:** 14 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `86c8e2bae740e5e5f09dabd18e6b0d035d700bf6` (PR #130 merge)  
**Current phase:** Phase 2B — online ambiguous-save recovery  
**Working branch:** `phase-2b/online-ambiguous-save-recovery-2026-10-14`  
**Phase 1 audit:** [`docs/PHASE-1-REPOSITORY-AUDIT.md`](PHASE-1-REPOSITORY-AUDIT.md)  
**Phase 2 acceptance:** [`docs/PHASE-2-CROSS-WORKFLOW-INTEGRITY.md`](PHASE-2-CROSS-WORKFLOW-INTEGRITY.md)  
**Phase 2B acceptance:** [`docs/PHASE-2B-OFFLINE-RECOVERY-MATRIX.md`](PHASE-2B-OFFLINE-RECOVERY-MATRIX.md)  
**Rule:** live GitHub PR metadata and exact-head workflow results are authoritative. No merge or production deployment without owner authorization.

## Verified repository state

- PR #130 merged at `86c8e2bae740e5e5f09dabd18e6b0d035d700bf6`; `main` was verified at that SHA before this implementation branch was created.
- PR #130's CI, Browser E2E and Full Flight Test passed on tested head `668fc0fd42d87b93aba19eba6c58c2c03a65ea88`: [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38594396851), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38594396860), [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38594396877).
- Post-merge CI passed on exact main SHA `86c8e2bae740e5e5f09dabd18e6b0d035d700bf6`: [CI run](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38596490075).
- These checks do not prove live Apps Script deployment, production data integrity, scheduled backup/restore, real-device behavior or accessibility.
- `BRAIN.md`, `docs/SECURITY-REVIEW.md` and `docs/QA-STRATEGY.md` are not present at those paths. Current relevant documents include `docs/SECURITY-RENDERING-AUDIT.md`, `docs/DATA-DURABILITY.md`, `docs/UI-UX-REVIEW.md` and `docs/RELEASE-READINESS.md`.

## Phase status

### Phase 1 — source-based audit

The audit and prioritized findings exist, but their source baseline predates PRs #127–#130. Use them as a findings register, not as current SHA/check evidence.

### Phase 2 — normal-path cross-workflow integrity

PR #128 merged. Mock-backed regression traces a high-value payment through independent approval, reporting, cash-close preview/finalization, immutable snapshot and audit attribution. Failure-path coverage remains a separate requirement.

### Phase 3 — audit-write observability

PR #129 merged. Audit appends remain best-effort; the Script Properties degraded marker and owner-visible warning work only when marker persistence succeeds. This is not tamper-evident logging and does not reconstruct missing events. Do not represent the state as repaired without owner-approved, evidence-backed reconciliation.

### Phase 2B — current runtime batch

**Outcome:** when an online voucher request commits on the server but the browser receives a lost connection or malformed response, preserve the original client IDs locally and retry them through the outbox. Never encourage the operator to enter the voucher a second time.

Source-based gap found: the outbox regression already covers a dropped response during queue synchronization, multiple tabs, expired leases, account binding and permanent validation rejection. The direct online-entry catch handled `NET` by queueing but did not immediately retry when the browser still appeared online; malformed JSON (`BAD`) was shown as a generic error instead of being preserved as an ambiguous result.

This batch addresses the direct-entry/network-response seam and adds E2E fault injection for both a lost response and a malformed response after server persistence. The final PR must record same-head CI, Browser E2E and Full Flight Test results; the tests do not prove live Apps Script behavior.

### Remaining Phase 2B risks after this slice

- An IndexedDB acknowledgement transaction that fails after the server commits, followed by lease-based recovery.
- Explicit stale-session recovery while synchronization is in flight.
- The remaining storage-failure and interrupted-recovery matrix; do not claim the full phase complete just because the new direct-save scenarios pass.

## Operational release gates — not verified

1. Owner verifies intended Apps Script project, deployment/version, execution identity, Sheet binding and Script Properties.
2. Only after explicit release authorization and a verified backup, inspect actual headers/rows and perform required guarded migrations in documented order. Never migrate from a feature PR.
3. Verify live owner/manager/staff authorization, receipt access and payment-approval behavior.
4. Witness a real scheduled Drive backup, inspect workbook/receipt copies/manifest, and restore into a separate destination with row-count, numbering and receipt-reference checks.
5. Complete physical-device PWA install/update/offline/recovery checks, manual accessibility review and an owner-approved controlled pilot.
6. Continue dynamic HTML/DOM sink and API authorization audits; no complete XSS certification claim.
7. Review the `@google/clasp → micromatch → braces` advisory by 9 November 2026 and track the unused `backupData_` warning.

## Engineering boundaries

- One coherent, outcome-based PR per batch; do not optimize for PR count.
- Owner retains review and merge authority. Never merge, deploy, run `clasp push`, run `setup()`, migrate schema, force-push, delete branches or mutate production data without explicit authorization.
- Preserve local untracked `docs/AI-ENGINEERING-PROTOCOL.md`; never stage, overwrite or delete it.
- Maintain this as the single canonical handoff. Do not create per-PR handoff files.
