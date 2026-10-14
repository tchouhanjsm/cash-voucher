# Backlog

One line per item: `date | priority | area | outcome / finding | evidence / dependency`.

2026-10-14 | P0 | Phase 2B reliability | Fault-inject ambiguous save, same-client-ID retry, outbox claim/ack/lease, multi-tab sync, stale session/account switch and partial failure; preserve voucher identity and queued data | `docs/PHASE-2B-OFFLINE-RECOVERY-MATRIX.md`; no accounting policy changes
2026-10-14 | P0 | Operational release proof | Verify intended Apps Script deployment/execution identity, Sheet binding, live roles and receipt authorization; witness scheduled backup and isolated restore only after owner authorization | `docs/RELEASE-READINESS.md`, `docs/DATA-DURABILITY.md`
2026-10-14 | P1 | Audit trust | Investigate audit marker persistence failure and define owner-approved reconciliation before any clear/reset | PR #129; no tamper-evidence claim
2026-10-14 | P1 | UX/adoption | Observe staff/manager/owner tasks on real devices; test keyboard/focus/zoom/screen reader; bundle related cross-screen fixes | `docs/UI-UX-REVIEW.md`
2026-10-14 | P1 | Security/data integrity | Finish active DOM sink inventory and API authorization review; classify findings; run a non-destructive current/history secret scan | `docs/SECURITY-RENDERING-AUDIT.md`; no history rewrite
2026-10-14 | P1 | Repository hygiene | Reconcile current-status text across handoff, roadmap, requirements and release-readiness docs while preserving historical notes | relevant docs
2026-10-14 | P2 | Performance | Create repeatable seeded baselines for bootstrap, Sheet scans, report latency and concurrent numbering before optimizing | `docs/PHASE-1-REPOSITORY-AUDIT.md`
2026-10-14 | P2 | Dependency exception | Reassess `@google/clasp → micromatch → braces` advisory by 9 November 2026 | `docs/DEPENDENCY-SECURITY-EXCEPTIONS.md`
