# Phase 2B — Offline Save and Recovery Matrix

**Base:** `main` at `2651d7870795f582eb7b12794a8946b1488f2acc` (PR #129 merge)
**Working branch:** `phase-2b/offline-recovery-matrix-2026-10-14`
**Status:** Acceptance definition; implementation evidence is pending
**Release boundary:** Local/mock backend and browser tests unless separately authorized live verification is documented.

## Business outcome

An operator must not be prompted to duplicate a payment or receipt because a network/server response is ambiguous. Queue entries must remain bound to the correct account and recoverable through retries, parallel tabs, lease expiry, stale sessions, and partial failures.

## Existing source mechanisms to validate

Stable client IDs and backend idempotency; IndexedDB pending/sending/failed states; owner binding; claim leases; retry/release; export of rejected entries; recovery validation; cross-tab announcements. Their existence is not proof that all failure sequences compose correctly.

## Acceptance criteria

### Ambiguous response and idempotent retry

Simulate successful server persistence followed by a lost response. Retrying with the same client ID must return the same voucher and leave exactly one voucher.

Required evidence: mock fault injection, backend idempotency assertion, and Browser E2E.

### Concurrent tabs and leases

A second tab must not acknowledge work owned by another lease. After a tab disappears, an expired sending lease must be reclaimable without losing the entry.

Required evidence: queue transaction tests and a browser multi-context scenario.

### Acknowledgement failure after server success

If local acknowledgement fails after server persistence, keep the entry recoverable. A later idempotent retry may remove it only after confirmed success.

Required evidence: storage fault injection, voucher count assertion, and visible UI state.

### Session expiry and account changes

Session expiry must not be classified as a permanent voucher rejection. An account or endpoint change must not allow a record to upload under a different account binding, and records belonging to another account must remain untouched.

Required evidence: API error-contract review, queue isolation tests, and browser session-expiry/multi-context scenarios.

### Permanent versus transient failures

Validation/conflict rejection must become review-required and stop automatic retries, with export before removal. Transient network/server failures must release unprocessed records to pending and show actionable recovery feedback.

Required evidence: permanent-rejection tests and an injected transient failure after one successful upload.

### Financial invariants after recovery

Historical entries missing CashImpact must remain available for export/re-entry; never infer a value. A retried voucher must preserve identity, approval status, CashImpact, report inclusion, and cash-close treatment.

Required evidence: regression test plus the existing cross-workflow integration test.

## Non-goals

No accounting/tax rules, approval policy, roles, schema, new dependencies, production deployment, live data mutation, or automatic audit-gap repair. Replace the queue architecture only if tests identify a specific defect.

## Role ownership

- Product Owner: operator outcome and terminology.
- Principal Engineer: idempotency and lease tracing.
- CI/CD Engineer: same-head checks.
- Security Reviewer: account binding, session transitions, error classification, and recovery import.
- QA Lead: fault injection and regression matrix.
- UI/UX Lead: saved-on-device versus synchronized/retry/review clarity.
