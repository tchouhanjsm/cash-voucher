# Backlog

One line per item: date | priority | area | outcome / finding | evidence / dependency.

2026-10-15 | P0 | Phase 4 authorization assurance | Exercise actual authenticated role/action guards and bootstrap data visibility for staff, manager, owner and accountant; fail CI for incorrect access | PR #133; docs/PHASE-4-AUTHORIZATION-RENDERING.md
2026-10-15 | P0 | Rendering sink governance | Lock the 33 known innerHTML assignment sites and prohibit newly introduced high-risk DOM APIs unless reviewed; keep targeted hostile-input E2E coverage | PR #133; docs/ACTIVE-DOM-SINK-INVENTORY.md
2026-10-15 | P0 | Operational release proof | Verify the deployed Apps Script version, execution identity, Sheet binding and live role/receipt permissions only with owner authorization; witness scheduled backup and isolated restore | docs/RELEASE-READINESS.md, docs/DATA-DURABILITY.md
2026-10-15 | P1 | Full semantic XSS review | Trace sources, transformations and context for each dynamic HTML template interpolation. Sink count drift is a review trigger, not a proof of safety | docs/SECURITY-RENDERING-AUDIT.md
2026-10-15 | P1 | Physical-device quality | Test PWA install/update/offline recovery, zoom, focus, keyboard and screen readers on representative devices | docs/UI-UX-REVIEW.md
2026-10-15 | P1 | Real-service capacity | Measure Google Sheets scan/bootstrap/report performance, quotas and numbering contention before creating production SLOs | owner-authorized test environment
2026-10-15 | P2 | Audit observability | Dual audit-append/marker-store failure has no durable owner marker. Investigate an owner-approved durable fallback without fabricating historical events | PR #132 regression; unresolved
2026-10-15 | P2 | Dependency exception | Reassess clasp → micromatch → braces advisory by 9 November 2026 | docs/DEPENDENCY-SECURITY-EXCEPTIONS.md
