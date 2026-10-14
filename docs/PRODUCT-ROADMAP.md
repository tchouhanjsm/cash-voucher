# Product Gap Register and Roadmap

**As of:** 14 October 2026  
**Current verified main SHA:** `2651d7870795f582eb7b12794a8946b1488f2acc` (PR #129 merge)

## Founder plan — outcome-based work, not PR-count optimization

The repository is a single-property cash-voucher PWA. Prioritize integrity of money movement, operator recovery and release proof before speculative features.

### Current phase status

- **Phase 1 — source-based audit:** `docs/PHASE-1-REPOSITORY-AUDIT.md` captures the audit and prioritized backlog, but its baseline predates PRs #127–#129. Use findings, not its old SHA/check metadata, as current truth.
- **Phase 2 — normal-path cross-workflow integrity:** PR #128 merged. A mock-backed journey covers entry, independent approval, reports, cash-close calculation/snapshot and linked audit events. Failure-path coverage remains incomplete.
- **Phase 3 — audit-write observability:** PR #129 merged. A degraded status is surfaced if the audit append fails and its Script Properties marker succeeds. This remains best-effort, not tamper-evident storage, event reconstruction or evidence of deployment.
- **Next batch — Phase 2B: offline save and recovery matrix.** Verify ambiguous create responses, same-client-ID retries, parallel-tab leases, lost acknowledgement, stale session/account switch, partial queue failure and operator feedback in one coherent PR.
- **Release gate — not verified:** live Apps Script identity/permissions, scheduled backup, isolated restore, physical-device recovery and manual accessibility review remain owner-authorized operational work.

## Prioritized work packages

1. Phase 2B — fault-injected recovery across API, IndexedDB outbox, backend idempotency and operator-facing states.
2. Operational release proof — owner-authorized deployment/role verification, scheduled backup and isolated restore.
3. Grouped UX completion — review all major flows on actual devices and bundle cross-screen improvements.
4. Security/data integrity — complete the DOM sink and API authorization reviews; run non-destructive secret-history scan.
5. Evidence-led reliability/performance — seeded Sheet-size, bootstrap/report latency and concurrency baselines.
6. Repository hygiene — reconcile stale status claims and review dependency exceptions by their documented dates.

## Invariants and boundaries

- New PAYMENT vouchers at or above INR 10,000 require independent owner/manager approval; no self-approval.
- Material edits to amount, vendor/identity, date or CashImpact trigger reapproval under UAT-048; category/notes corrections retain approval but require a reason and audit history.
- Historical blank CashImpact/approval values are not silently backfilled; unresolved states cannot enter approved totals or pass final cash close.
- Preserve immutable close snapshots, idempotent client IDs, account-bound offline queue entries, closed-period controls and audit attribution.
- No deployment, migration, production-data change, history rewrite or merge without explicit authorization.
- Passing CI is necessary, not sufficient for production readiness.

Historical PR notes below are retained as history and are not a live status feed.
