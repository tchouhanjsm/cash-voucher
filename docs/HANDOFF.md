# Engineering Handoff

**Updated:** 14 October 2026  
**Repository:** `tchouhanjsm/cash-voucher`  
**Verified `main` SHA:** `2651d7870795f582eb7b12794a8946b1488f2acc` (PR #129 merge)  
**Current phase:** Phase 2B — offline and ambiguous-save recovery matrix  
**Working branch:** `phase-2b/offline-recovery-matrix-2026-10-14`  
**Phase 1 audit:** [`docs/PHASE-1-REPOSITORY-AUDIT.md`](PHASE-1-REPOSITORY-AUDIT.md)  
**Phase 2 acceptance:** [`docs/PHASE-2-CROSS-WORKFLOW-INTEGRITY.md`](PHASE-2-CROSS-WORKFLOW-INTEGRITY.md)  
**Phase 2B acceptance:** [`docs/PHASE-2B-OFFLINE-RECOVERY-MATRIX.md`](PHASE-2B-OFFLINE-RECOVERY-MATRIX.md)  
**Rule:** live GitHub PR metadata and exact-head workflow results are authoritative. No merge or production deployment without owner authorization.

## Verified repository state

- PR #129 merged; `main` is `2651d7870795f582eb7b12794a8946b1488f2acc`.
- Open PR count was zero when verified.
- PR #129 tested head `e5734a07066976ab4eb90c0ce89f2b45c2060e0e` passed CI, Browser E2E and Full Flight Test on the same exact PR head: [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38590105983), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38590106118), [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38590106321).
- Post-merge CI passed on exact main SHA `2651d7870795f582eb7b12794a8946b1488f2acc`: [CI run](https://github.com/tchouhanjsm/cash-voucher/actions/runs/38590703128).
- These checks do not prove live Apps Script deployment, production data integrity, scheduled backup/restore, real-device behavior or accessibility.
- `BRAIN.md`, `docs/SECURITY-REVIEW.md` and `docs/QA-STRATEGY.md` are not present at those paths. Current relevant docs include `docs/SECURITY-RENDERING-AUDIT.md`, `docs/DATA-DURABILITY.md`, `docs/UI-UX-REVIEW.md` and `docs/RELEASE-READINESS.md`.

## Phase status

### Phase 1 — source-based audit

Audit document exists, but its baseline predates PRs #127–#129. Its finding register remains useful; do not treat its old SHA/check metadata as current proof.

### Phase 2 — normal-path cross-workflow integrity

PR #128 merged. A mock-backed integration journey traces a high-value payment through independent approval, report totals, cash-close preview/finalization, immutable snapshot and audit attribution. It does not close the failure/recovery matrix.

### Phase 3 — audit-write observability

PR #129 merged. Audit appends remain best-effort; Script Properties stores a degraded marker and the owner audit view displays it if marker persistence succeeds. A marker-write failure can also fail; this is not tamper-evident logging and does not reconstruct missing events. Do not represent the state as repaired without an owner-approved, evidence-backed reconciliation path.

### Phase 2B — next implementation batch

**Outcome:** operators must not be prompted to duplicate a financial entry after an ambiguous response, and outbox records must remain recoverable and bound to the correct account across retries, tabs, leases and session changes.

Existing source already contains stable client IDs, server idempotency, IndexedDB owner binding, status/lease claims, retry/release, failed-record export, recovery validation and BroadcastChannel announcements. Trace these mechanisms end to end before changing code.

Acceptance:
1. Simulated successful server persistence followed by a lost response; retry with same client ID yields one voucher.
2. Lost acknowledgement/interrupted upload keeps the record recoverable; retry remains idempotent.
3. A second tab cannot acknowledge work owned by another lease; an expired lease can be reclaimed safely.
4. Session expiration or account/endpoint switch cannot upload under another account or silently delete queued entries.
5. Permanent validation/conflict errors become review-required; transient, network and session errors are not misclassified as permanent rejection.
6. CashImpact, approval state, report totals and cash-close inclusion remain correct after retry.
7. CI, Browser E2E and Full Flight Test pass on the same exact final PR head SHA.

Scope candidates: `frontend/core/api.js`, `frontend/core/offline-queue.js`, `frontend/features/payments.js`, `test/mock-gas.js`, `test/test-backend.js`, `test/e2e.py`, and the Phase 2B acceptance doc. Do not alter accounting policy, roles, schema, deployment or production data.

## Operational release gates — not verified

1. Owner verifies intended Apps Script project, deployment/version, execution identity, Sheet binding and Script Properties.
2. Only after explicit authorization and verified backup, inspect actual headers/rows and perform required guarded migrations in documented order; never migrate from a feature PR.
3. Verify live owner/manager/staff authorization, receipt access and approval behavior.
4. Witness a real scheduled Drive backup, inspect workbook/receipt copies/manifest, and restore to a separate destination with row-count, numbering and receipt-reference checks.
5. Complete real-device PWA update/offline/recovery checks, manual accessibility review and owner-approved pilot.
6. Continue dynamic HTML/DOM sink and API authorization audits; no complete XSS certification claim.
7. Review `@google/clasp → micromatch → braces` advisory by 9 November 2026 and track the unused `backupData_` warning.

## Engineering boundaries

- One outcome-based PR per coherent batch; do not optimize for PR count.
- Owner retains review/merge authority. Never merge, deploy, run `clasp push`, run `setup()`, migrate schema, force-push, delete branches or mutate production data without explicit authorization.
- Preserve local untracked `docs/AI-ENGINEERING-PROTOCOL.md`; never stage, overwrite or delete it.
- Maintain this as the one canonical handoff. Do not create per-PR handoff files.
