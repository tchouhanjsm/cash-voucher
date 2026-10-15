# Backlog

One line per item: date | priority | area | outcome / finding | evidence / dependency.

2026-10-15 | P1 | Approval identity integrity | Ensure payee-day totals include legacy name-only vouchers when new payments gain VendorID; preserve distinct stable IDs and retest edits | Phase 9, backend/52-approvals.gs and backend/50-vouchers.gs
2026-10-15 | P0 | Operational release proof | Verify Apps Script project/version, execution identity, Sheet binding, live role/receipt permissions, scheduled backup and isolated restore only with owner authorization | docs/RELEASE-READINESS.md; not verified
2026-10-15 | P1 | Contextual rendering security | Review remaining 27 active HTML sinks by output context; replace reusable/text-only HTML construction where behavior is preserved and risk materially decreases | docs/ACTIVE-DOM-SINK-INVENTORY.md, docs/SECURITY-RENDERING-AUDIT.md
2026-10-15 | P1 | Physical-device quality | Test PWA install/update/offline recovery, zoom, focus, keyboard and screen readers on representative devices | docs/UI-UX-REVIEW.md; owner-operated devices
2026-10-15 | P1 | Real-service capacity | Measure Google Sheets scan/bootstrap/report latency, quotas and voucher-numbering contention before creating production SLOs | owner-authorized test environment
2026-10-15 | P2 | Audit observability | Dual audit-append/marker-store failure has no durable owner marker. Investigate an owner-approved durable fallback without fabricating historical events | PR #132 regression; unresolved
2026-10-15 | P2 | Dependency exception | Reassess clasp → micromatch → braces advisory by 9 November 2026 | docs/DEPENDENCY-SECURITY-EXCEPTIONS.md
