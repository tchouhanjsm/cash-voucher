# Phase 2 — Cross-Workflow Integrity

**Cross-phase follow-up — 15 October 2026:** the normal-path journey remains mock-backed and does not prove live financial operations. PR #132 complements it with offline-recovery failure handling, audit-marker dual-failure evidence, route-registry/authentication guardrails and seeded mock report completeness checks. None substitutes for live role authorization, actual Sheet/Drive data, real backup/restore, or production performance/concurrency testing.

**Base:** `main` at `ff5a8ebde96698f15edb976c4fcd745d50085d10` (PR #127 merge)  
**Scope:** regression evidence across voucher entry, independent approval, reporting, Daily Cash Close and audit.  
**Release boundary:** automated tests use the in-memory Google services mock; this does not prove live Apps Script deployment or production Sheet behavior.

## Business outcome

A single high-value payment must retain consistent identity and financial treatment as it moves through the product. Pending approval must remain visible but excluded from approved totals and must block final cash close. After an authorized independent approval, the same voucher must appear in report totals, contribute to cash-close arithmetic, be present in the immutable close snapshot, and have attributable approval/close audit events.

## Integration path now covered

1. **Create a ₹10,000 PAYMENT — manager.** The new high-value payment must be PENDING and retain a stable voucher ID and client ID.

2. **Read movement report — owner.** The voucher is visible as pending but excluded from active payment totals.

3. **Approve payment — owner (not creator).** Status and approval actor persist; the audit event records the decision.

4. **Read movement report — accountant.** The approved voucher appears exactly once in the report total; pending count is zero.

5. **Preview cash close — manager.** The approved payment contributes to CASH_OUT; no approval blocker remains.

6. **Finalize cash close — manager.** Expected cash is correct, fixture variance is zero, and the snapshot count is exact.

7. **Read saved close and audit — owner.** The snapshot retains voucher ID, number, amount and cash impact; approval and close events are attributable.

## Existing policies preserved

- New PAYMENT vouchers at or above ₹10,000 require an independent owner/manager approval.
- A creator cannot approve or reject their own voucher; rejection requires a reason.
- Pending, rejected or malformed approval-state payments remain excluded from approved totals and block final cash close until resolved.
- Historical blank approval values are not backfilled.
- CashImpact is explicit, and saved Daily Cash Close snapshots remain immutable.
- No production data, Apps Script deployment, schema or accounting rule is changed by this phase.

## Cross-workflow recovery coverage now present

The current source test suite covers the following regressions across Browser E2E, backend and authorization tests:

- Lost or malformed direct-save responses are treated as ambiguous and retried with the original client ID; the Register contains exactly one voucher.
- IndexedDB acknowledgement failure after server commit preserves the same pending client ID and safely retries without a duplicate.
- Multi-tab queue synchronization and expired claim leases are exercised; the same queued transaction results in one create request and one Register row.
- Stale session during sync preserves the account-bound pending record, signs the operator back in and retries without permanent rejection.
- A poison/rejected queue item is isolated from a healthy neighboring record; rejected data remains reviewable/exportable and is removed only after explicit confirmation.
- Role/action checks cover the staff, manager, owner and accountant boundaries. The integrated high-value payment path checks pending/approved report treatment, cash-close arithmetic/snapshot and attributable audit events.

Phase 12 / PR #148 adds the missing explicit runtime assertion for a record whose stored endpoint binding differs while the account email matches. The assertion is candidate-only until all required workflows pass on one final PR head.

## Residual cross-workflow risks

- Simultaneous audit append and Script Properties marker failure remains a durability/observability limitation; automated tests document it but do not repair a missing audit event.
- Test runs use mocks and do not establish live Sheet/Drive behavior, actual authorization, Apps Script deployment identity/version, production latency/concurrency, scheduled backup/restore, or physical-device offline durability.
- Permission-denial, financial-state and recovery-path tests cover selected combinations, not an exhaustive penetration test of every role/action/state tuple.

## Acceptance and evidence

- The integrated journey asserts the same voucher ID across creation, approval, report, snapshot and audit.
- A pending record cannot enter approved totals or pass close finalization.
- The approved record enters the close snapshot exactly once with the expected cash impact.
- CI, Browser E2E and Full Flight Test must pass on the exact same final PR head.
- No PR merge is treated as production deployment or live operational sign-off.
