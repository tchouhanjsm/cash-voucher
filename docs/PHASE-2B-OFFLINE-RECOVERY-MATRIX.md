# Phase 2B — Offline Save and Recovery Matrix

**Base:** `main` at `2651d7870795f582eb7b12794a8946b1488f2acc` (PR #129 merge)
**Working branch:** `phase-2b/offline-recovery-matrix-2026-10-14`
**Status:** acceptance definition; implementation evidence is pending
**Release boundary:** local/mock backend and browser tests only unless separately authorized live verification is documented.

## Business outcome

A cash-voucher operator must never be encouraged to duplicate a payment or receipt because a network/server response is ambiguous. Queue entries must remain attached to the correct account and recoverable through retries, parallel tabs, lease expiry, stale sessions, and partial failures.

## Existing source capabilities to validate before modifying

- Stable client IDs and server idempotency for repeated `createVouchers` calls.
- IndexedDB outbox with pending/sending/failed states and lease ownership.
- Account binding based on the configured endpoint and signed-in email.
- Single-row queue synchronization, retry release on transient failure, and failed-record export/review.
- Cross-tab announcements and recovery import/export validation.

The existence of these mechanisms is not proof the end-to-end failure sequence works.

## Acceptance matrix

| Scenario | Expected behavior | Required evidence |
|---|---|---|
| Server persists then response is lost | Retry preserves client ID and returns the same voucher; one active record exists | Mock fault injection at response boundary; backend idempotency assertion; Browser E2E |
| Double submit / same outbox item in two tabs | Only current lease owner acknowledges the record; no duplicate voucher | IndexedDB lease regression or deterministic transaction test plus browser multi-context journey |
| Acknowledgement fails after server success | Queue item remains recoverable; next retry is idempotent and removes it only after confirmed success | Queue-store fault injection, backend voucher count and browser visible state |
| Lease owner/tab disappears | Expired sending lease becomes claimable by another tab; data remains intact | Queue state transition test and multi-tab/browser retry |
| Session expires mid-upload | Do not treat authorization failure as permanent voucher rejection; preserve item for sign-in/retry | API error contract review and browser session-expiry case |
| User/account/server endpoint changes | No pending item uploads under a different owner binding; account switch preserves other-account data | Storage account-isolation tests, browser multi-context case |
| Validation/conflict rejection | Clearly marked review-required record, excluded from automatic retry, export before removal | Positive permanent-rejection case plus transient-vs-permanent error classification tests |
| Network/server error | Release remaining claimed records back to pending; expose retry/recovery state | Injected transient failure after one success in multi-entry queue |
| Old unclassified CashImpact record | Preserve record for export/re-entry; never silently infer CashImpact | Existing behavior regression; no data mutation |
| Financial outcome after retry | Same voucher identity and approved totals/cash-close treatment | Cross-workflow integration test on the retried record |

## Non-goals

No new accounting/tax behavior, approval rules, role, schema, dependency, production Apps Script deployment, live data mutation, or automatic repair of audit gaps. Do not replace the current queue architecture unless tests identify a specific defect that requires it.

## Review ownership

- Product Owner: confirms operator-facing behavior and terminology.
- Principal Engineer: traces API/idempotency and IndexedDB lease transactions end to end.
- CI/CD Engineer: obtains same-head CI, Browser E2E and Full Flight Test evidence.
- Security Reviewer: reviews account binding, session transitions, permanent error classification and recovery import.
- QA Lead: injects ambiguous, duplicate, transient and interrupted failures.
- UI/UX Lead: verifies staff can distinguish saved-on-device, synchronized, retrying, and needs-review states.
