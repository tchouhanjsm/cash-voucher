# Phase 12 — Cross-Workflow Integrity and Recovery

**Baseline:** `main` at `61e46989032985fba54ceb48d768ab57430aa48a` (PR #147 merge).  
**Current candidate:** PR #148 — [Phase 12: harden endpoint-bound offline queue recovery](https://github.com/tchouhanjsm/cash-voucher/pull/148), branch `phase-12/endpoint-bound-recovery-2026-10-16`.  
**Status:** candidate in review; do not mark Phase 12 complete until the required exact-head checks pass and the owner accepts the PR.  
**Evidence boundary:** source, mock backend and browser evidence only. No live Apps Script release, real Sheet verification or production recovery claim is implied.

## Outcome

A voucher should retain the same business identity and financial treatment from entry or offline queue through retry, approval, reporting, Daily Cash Close and audit. A queued entry must never cross account or API-endpoint boundaries, and uncertain outcomes must recover through the original client ID rather than prompting a duplicate transaction.

## Cross-workflow test matrix

| Boundary | Existing source evidence | Phase 12 disposition |
| --- | --- | --- |
| High-value payment approval journey | `test/test-backend.js` exercises independent approval, approval-state totals, movement reporting, cash-close preview/finalization, immutable snapshot and audit attribution. `docs/PHASE-2-CROSS-WORKFLOW-INTEGRITY.md` defines the shared-voucher invariant. | Preserve unchanged; avoid duplicating covered normal-path tests. |
| Role and resource boundaries | `test/test-authorization-matrix.js` covers staff, manager, owner and accountant authorization and receipt/report boundaries. | Bounded mock role/action evidence; not a live authorization proof or exhaustive penetration test. |
| Lost or malformed direct-save response | `test/e2e.py` exercises both response faults, retries the same client ID and asserts exactly one Register row. | Existing regression retained. |
| Server commit followed by IndexedDB acknowledgement failure | `test/e2e.py` aborts the local acknowledgement transaction after server commit, verifies the same pending client ID, then retries without duplicating the voucher. | Existing regression retained. |
| Parallel tabs, lease expiry and stale session | `test/e2e.py` verifies single-request multi-tab synchronization, expired lease recovery, account-bound queue retention after SESSION, and same-account reauthentication. | Existing regressions retained. |
| Per-entry partial failure | `test/e2e.py` injects a validation rejection for a poison queue record while a healthy neighbor uploads; the rejected item remains reviewable/exportable and is not retried endlessly. | Existing regression retained; don't duplicate without a distinct failure mode. |
| Account binding | `test/e2e.py` changes the stored queue owner's email and verifies the foreign-account entry stays pending and is neither surfaced nor uploaded. | Existing regression retained. |
| API-endpoint binding | PR #148 adds a same-email/different-endpoint stored owner-key case using a reserved `.invalid` host in tampered IndexedDB metadata. It dispatches a queue-change notification and online event, then asserts the foreign-bound record remains pending and hidden. | Candidate-only until exact-head workflows pass; the reserved endpoint is metadata and must never be contacted. |
| Idempotency and payload conflict | `test/test-backend.js` verifies matching same-user client-ID retries are idempotent and changed payloads with that ID are rejected as conflicts; recovery-validation rejects duplicate IDs. | Existing regressions retained. |
| Audit write observability | The source suite records the dual audit-append/Script Properties marker-failure limit. | Known residual limitation. Do not fabricate a successful audit event or claim automatic repair. |

## Financial and lifecycle invariants

- New PAYMENT vouchers at or above **₹10,000** require independent owner/manager approval; the creator cannot approve their own voucher.
- Pending, rejected or malformed approval-state payments stay excluded from approved totals and block final cash close until resolved.
- Material edits that require reapproval must not leave approval status silently valid; category/notes changes retain their defined reason/audit requirements.
- Historical blank `CashImpact` or approval values must not be inferred or backfilled.
- Client-ID idempotency, account-bound queue records, explicit cash-impact classification, closed-period controls, immutable close snapshots and audit attribution must remain intact.
- No live deployment, production-data mutation, schema migration, setup reset or merge is included in this phase PR.

## Acceptance gates

1. The endpoint-binding case passes without reaching the foreign endpoint and leaves the record pending.
2. Existing same-account recovery, foreign-account isolation, ambiguous-save, acknowledgement-failure, multi-tab, stale-session, partial-failure and cross-workflow financial checks remain green.
3. CI/quality, Browser E2E and Full Flight Test pass on the **same exact final PR head**. Runs from prior/intermediate commits do not count as final acceptance evidence.
4. The PR body records the exact final head and run URLs; the owner reviews and merges.
5. Live Apps Script identity/version, Sheet/Drive permissions, scheduled backup, isolated restore, physical-device behavior, production quotas/concurrency and accessibility remain separate owner-controlled release gates.
