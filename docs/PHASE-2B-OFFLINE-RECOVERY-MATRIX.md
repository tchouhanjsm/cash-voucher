# Phase 2B — Offline Save and Recovery Matrix

**Base:** `main` at `2651d7870795f582eb7b12794a8946b1488f2acc` (PR #129 merge)
**Working branch:** `phase-2b/offline-recovery-matrix-2026-10-14`
**Status:** acceptance definition; implementation evidence is pending
**Release boundary:** local/mock backend and browser tests unless separately authorized live verification is documented.

## Business outcome

An operator must not be prompted to duplicate a payment or receipt because a network/server response is ambiguous. Queue entries must remain bound to the correct account and recoverable through retries, parallel tabs, lease expiry, stale sessions and partial failures.

## Existing source mechanisms to validate

Stable client IDs and backend idempotency; IndexedDB pending/sending/failed states; owner binding; claim leases; retry/release; export of rejected entries; recovery validation; cross-tab announcements. Their existence is not proof that all failure sequences compose correctly.

## Acceptance matrix

| Scenario | Expected behavior | Required evidence |
|:--|:--|:--|
| Server persists, then response is lost | Retry with same client ID returns same voucher; exactly one voucher exists | Mock fault injection, backend idempotency assertion, Browser E2E |
| Double submission / same item claimed in two tabs | Only the valid lease owner can acknowledge; no duplicate voucher | Queue transaction tests and browser multi-context scenario |
| Acknowledgement fails after server success | Entry remains recoverable; later idempotent retry removes it only after confirmed success | Storage fault injection, voucher count and visible UI state |
| Lease owner disappears | Expired sending lease is reclaimable without data loss | Queue state-transition test |
| Session expires mid-upload | Do not mark as permanent voucher rejection; preserve item for sign-in/retry | API error-contract review and browser session-expiry scenario |
| Account or endpoint changes | No record uploads under a different account binding; other-account records remain untouched | Queue isolation test and browser multi-context scenario |
| Validation/conflict rejection | Entry becomes review-required and is not auto-retried; export before removal | Permanent-rejection plus transient-vs-permanent classification tests |
| Transient network/server error | Release unprocessed records to pending and show actionable recovery state | Injected transient failure after one successful upload |
| Historical missing CashImpact | Preserve record for export/re-entry; never infer a value | Regression test only; no data mutation |
| Retried financial outcome | Voucher identity, approval, CashImpact, report and close treatment remain consistent | Cross-workflow integration test |

## Non-goals

No accounting/tax rules, approval policy, role, schema, new dependency, production deployment, live data mutation or automatic audit-gap repair. Replace the queue architecture only if tests identify a specific defect.

## Role ownership

- Product Owner: operator outcome and terminology.
- Principal Engineer: idempotency/lease tracing.
- CI/CD Engineer: same-head checks.
- Security Reviewer: account binding, session transitions, error classification and recovery import.
- QA Lead: fault injection and regression matrix.
- UI/UX Lead: saved-on-device versus synchronized/retry/review clarity.
