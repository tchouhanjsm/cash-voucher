# Backlog

One line per item: date | priority | area | outcome / finding | evidence / dependency.

2026-10-15 | P0 | Phase 4 authorization assurance | Completed: authenticated role/action guards and role-specific data visibility are regression-tested | PR #133 merged; docs/PHASE-4-AUTHORIZATION-RENDERING.md
2026-10-15 | P0 | Rendering sink count/API guard | Completed: reviewed sink counts and selected high-risk DOM APIs fail closed on unexpected drift | PR #133 merged; docs/ACTIVE-DOM-SINK-INVENTORY.md
2026-10-15 | P1 | HTML sink statement fingerprints | Completed: fingerprint all 33 known assignment statements so interpolation/markup changes trigger review | PR #134 merged; scripts/check-dom-sink-source.js
2026-10-15 | P1 | Avoidable text-only HTML sinks | Replace text/status/error-only uses with DOM nodes; add a hostile server-error regression; maintain count and fingerprint baselines | PR #135 open; proposed 33 → 28 sites
2026-10-15 | P0 | Operational release proof | Verify Apps Script deployment identity, Sheet binding, live role/receipt permissions, scheduled backup and isolated restore only with owner authorization | docs/RELEASE-READINESS.md, docs/DATA-DURABILITY.md
2026-10-15 | P1 | Full semantic XSS review | Trace source, transformation and output context for all remaining dynamic HTML assignments; fingerprint matching is not contextual-safety proof | docs/SECURITY-RENDERING-AUDIT.md
2026-10-15 | P1 | Physical-device quality | Test PWA install/update/offline recovery, zoom, focus, keyboard and screen readers on representative devices | docs/UI-UX-REVIEW.md
2026-10-15 | P1 | Real-service capacity | Measure Google Sheets scan/bootstrap/report performance, quotas and numbering contention before creating production SLOs | owner-authorized test environment
2026-10-15 | P2 | Audit observability | Dual audit-append/marker-store failure has no durable owner marker. Investigate an owner-approved durable fallback without fabricating historical events | PR #132 regression; unresolved
2026-10-15 | P2 | Dependency exception | Reassess clasp → micromatch → braces advisory by 9 November 2026 | docs/DEPENDENCY-SECURITY-EXCEPTIONS.md
