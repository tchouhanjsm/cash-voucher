# Phase 2B — Offline Save and Recovery Matrix

**Base:** `main` at `86c8e2bae740e5e5f09dabd18e6b0d035d700bf6` (PR #130 merge)
**Working branch:** `phase-2b/online-ambiguous-save-recovery-2026-10-14`
**Status:** In implementation; this PR closes the direct online-save ambiguity gap, not the entire recovery phase.
**Release boundary:** Mock backend and browser tests unless separately authorized live verification is documented.

## Business outcome

An operator must not be prompted to duplicate a payment or receipt because a network/server response is ambiguous. Queue entries must remain bound to the correct account and recoverable through retries, parallel tabs, lease expiry, stale sessions and partial failures.

## Source assessment

The existing system already has stable client IDs, backend idempotency, an IndexedDB outbox with pending/sending/failed states, owner binding, claim leases, retry/release, recovery export/import, BroadcastChannel announcements, and browser tests for outbox response loss, multi-tab sync, expired leases, account binding and permanent validation rejection.

The uncovered direct-entry seam was different: when an online `createVouchers` request received `NET`, it saved the original entry to the outbox but did not immediately retry while the browser still reported online. An unreadable response (`BAD`) was treated as a generic error rather than an ambiguous result. This made user-visible recovery inconsistent between direct save and background synchronization.

## Current runtime slice — direct online save ambiguity

Acceptance criteria:

1. A test server commits a voucher and then drops the direct online response. The same entry is durably queued and retried using the original client ID.
2. A test server commits a voucher and returns malformed JSON. The frontend treats the result as ambiguous, queues the unchanged entry, and safely retries the same client ID.
3. A successful retry removes the queued record only after the server responds, shows an explicit saved-and-synchronized result, and produces exactly one Register row.
4. If online retry cannot confirm all entries, the app keeps them in the account-bound queue and states that the result is pending or needs review. It must tell the operator not to enter the uncertain item again.
5. Known validation/conflict errors are not converted into ambiguous-success recovery; permanent rejections retain the existing review/export flow.
6. CI, Browser E2E and Full Flight Test pass on the same exact final PR head SHA.

## Remaining recovery matrix

| Scenario | Required behavior | Evidence still needed |
|---|---|---|
| Acknowledgement/storage transaction fails after server success | Preserve the queue item; retry is idempotent and lease recovery does not duplicate the voucher | Dedicated acknowledgement fault injection and queue-state assertions |
| Lease owner disappears | Expired sending lease is reclaimable without data loss | Existing stale-lease E2E plus acknowledgement-failure recovery |
| Session expires mid-upload | Do not mark as permanent rejection; preserve item for sign-in/retry | Explicit session-expiry fault injection |
| Account or endpoint changes | No record uploads under another account binding; other-account records remain untouched | Existing account-binding E2E plus endpoint-switch regression |
| Validation/conflict rejection | Entry becomes review-required, stops auto-retry, and can be exported before removal | Existing poison-entry and healthy-neighbor E2E |
| Transient server/network error | Release unprocessed entries to pending; expose recovery state | Fault-injected multi-entry partial failure |
| Historical missing CashImpact | Preserve for export/re-entry; never infer a value | Existing regression; no data mutation |
| Retried financial outcome | Voucher identity, approval, CashImpact, report and close treatment remain consistent | Existing cross-workflow test plus recovered-entry assertion |

## Non-goals

No accounting/tax rules, approval policy, roles, schema, new dependencies, production deployment, live data mutation, automatic audit-gap repair or release authorization. Do not replace the queue architecture without evidence that a specific defect requires it.

## Review ownership

- Product Owner: operator outcome and terminology.
- Principal Engineer: client-ID idempotency, direct-save/outbox composition and lease behavior.
- CI/CD Engineer: exact-head checks.
- Security Reviewer: account binding, session transitions, error classification and recovery import.
- QA Lead: fault injection and regression matrix.
- UI/UX Lead: saved-on-device versus synchronized/retry/review clarity.
