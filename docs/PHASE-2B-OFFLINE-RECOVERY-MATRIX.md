# Phase 2B — Offline Save and Recovery Matrix

**Base:** main at 69f861f86d08a19da8fe1223b3bc6c4840478895 (PR #131 merge)  
**Working branch:** phase-2b/recovery-matrix-closure-2026-10-14  
**Status:** historical recovery design; the current Phase 12 candidate extends runtime coverage for endpoint-bound queue isolation. Exact final-head checks decide acceptance.  
**Release boundary:** mock backend and browser tests unless separately authorized live verification is documented.

## Batch additions for PR #132

- Adds post-commit IndexedDB acknowledgment-failure feedback and queue retention for same-client-ID retry.
- Adds a stale-session E2E path that checks account ownership before retry and reauthenticates the queue's actual manager identity; account isolation remains a requirement.
- Adds a backend fault test for simultaneous audit append and Script Properties marker failure. A diagnostic is expected, but owner-visible health can read NO_KNOWN_FAILURE; this is a documented residual limitation, not a repaired audit event.
- Adds full-history high-confidence credential-pattern scanning, an unauthenticated API route guard and seeded mock bootstrap/report checks at 100/500/1,000 vouchers. Those are supporting evidence, not production verification.
- All CI, Browser E2E and Full Flight Test checks must pass on the same final SHA. Earlier/intermediate-head results are not acceptance evidence.

## Business outcome

An operator must not be prompted to duplicate a payment or receipt because a network/server response is ambiguous. Queue entries must remain bound to the correct account and recoverable through retries, parallel tabs, lease expiry, stale sessions and partial failures.

## Source assessment

The existing system already has stable client IDs, backend idempotency, an IndexedDB outbox with pending/sending/failed states, owner binding, claim leases, retry/release, recovery export/import, BroadcastChannel announcements, and browser tests for outbox response loss, multi-tab sync, expired leases, account binding and permanent validation rejection.

The uncovered direct-entry seam was different: when an online `createVouchers` request received `NET`, it saved the original entry to the outbox but did not immediately retry while the browser still reported online. An unreadable response (`BAD`) was treated as a generic error rather than an ambiguous result. This made user-visible recovery inconsistent between direct save and background synchronization.

## Current runtime slice — direct online save ambiguity

### Lost response after server persistence

A test server commits a voucher and then drops the direct online response. The same entry must be durably queued and retried using the original client ID.

Required evidence: browser E2E, server request counters, exactly one Register row, and no remaining outbox record after confirmation.

### Malformed response after server persistence

A test server commits a voucher and returns malformed JSON. The frontend must treat the result as ambiguous, queue the unchanged entry, and safely retry the same client ID.

Required evidence: browser E2E, response-fault counter, exactly one Register row, and no remaining outbox record after confirmation.

### Operator-visible outcome

A successful retry removes the queued record only after the server responds, shows an explicit saved-and-synchronized result, and produces exactly one Register row. If the retry cannot confirm every entry, the app keeps the account-bound queue and states that the result is pending or needs review. It must tell the operator not to enter an uncertain item again.

Known validation/conflict errors must retain the existing rejection/review workflow. They must not be silently reclassified as ambiguous-success recovery.

CI, Browser E2E and Full Flight Test must pass on the same exact final PR head SHA.

### Acknowledgement/storage transaction failure

The mock E2E arms a one-shot IndexedDB transaction abort only after the server successfully returns the committed voucher. The application must state that server acceptance is known but local cleanup is unconfirmed, preserve the original client ID, and stop the current flush rather than claiming success. Retrying must use the same client ID and produce exactly one Register row.

Required evidence: IndexedDB transaction abort, queue record/client-ID/status after failure, request count, one Register row before retry, and an empty queue/one Register row after retry.

### Stale session during synchronization

The mock server returns `SESSION` once for a selected queued entry before executing the write. The app must sign out, retain the pending record and its owner binding, and allow the same record to synchronize after reauthentication. A session error must never become a permanent validation rejection.

Required evidence: exact same client ID before/after sign-out, pending status, a single injected session expiry, successful retry after reauthentication and exactly one Register row.

## Additional recovery matrix

### Account or endpoint changes

No record uploads under another account or API-endpoint binding. The queue owner key combines endpoint identity and normalized email; a mismatched record stays pending and is not eligible for the current session's upload.

- Existing Browser E2E changes the email part of a stored owner key and verifies a foreign-account record remains pending and untouched.
- Phase 12 / PR #148 adds a same-email, different-endpoint owner key using a reserved `.invalid` URL in IndexedDB metadata, then triggers queue refresh and the online event. The record must remain pending, stay hidden from the current account's queue, and never be uploaded to the current endpoint.
- Offline-auth and recovery-validation unit tests already reject a verifier/record bound to another endpoint or user.

PR #148's endpoint assertion is candidate-only until CI/quality, Browser E2E and Full Flight Test pass on one exact final head. These mock tests do not prove a real device's behavior during a live endpoint reconfiguration.

### Permanent and transient failures

Validation/conflict rejection must become review-required, stop automatic retry and retain the export-before-removal flow. Transient server/network errors must release unprocessed entries to pending and expose recovery state.

Required evidence: existing poison-entry/healthy-neighbor E2E covers the per-record failure case: the rejected record is retained for review, the healthy neighbor synchronizes once, automatic retry is stopped for the rejected record, and the draft remains editable. Do not add a duplicate test unless a new failure mode is identified.

### Historical CashImpact and financial outcome

Historical entries missing CashImpact remain available for export/re-entry; never infer a value. Retried vouchers preserve identity, approval, CashImpact, report and close treatment.

Required evidence: existing regressions and the cross-workflow test tied to the recovered voucher.

## Non-goals

No accounting/tax rules, approval policy, roles, schema, new dependencies, production deployment, live data mutation, automatic audit-gap repair or release authorization. Do not replace the queue architecture without evidence that a specific defect requires it.

## Review ownership

- Product Owner: operator outcome and terminology.
- Principal Engineer: client-ID idempotency, direct-save/outbox composition and lease behavior.
- CI/CD Engineer: exact-head checks.
- Security Reviewer: account binding, session transitions, error classification and recovery import.
- QA Lead: fault injection and regression matrix.
- UI/UX Lead: saved-on-device versus synchronized/retry/review clarity.
