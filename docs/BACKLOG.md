# Backlog

One line per item: date | priority | area | outcome / finding | evidence / dependency.

2026-10-15 | DONE | UI branch integration + dashboard trust | Phase 10 integrated truthful attention copy, allowlisted icon/action inputs, local SVG sprite, shell cache v16, dashboard source fingerprint and focused Browser E2E | PR #141 merged at 42ff7708535d04c15510caf90c5f93738109669e; exact-head CI/E2E/Flight Test passed; PR reports post-merge CI passed
2026-10-15 | P0 | Operational release proof | Verify Apps Script project/version, execution identity, Sheet binding, live role/receipt permissions, scheduled backup and isolated restore only with owner authorization | docs/RELEASE-READINESS.md; not verified
2026-10-15 | P1 | Phase 11 batch 1 — Users status sinks | Replace two fixed Users loading/error HTML assignments with DOM construction; hostile API error remains inert; preserve refresh and retry recovery; candidate inventory 25 sinks | Branch `phase-11/retire-admin-status-html-sinks-2026-10-15`; same-head CI, Browser E2E and Full Flight Test required
2026-10-15 | P1 | Physical-device quality | Test PWA install/update/offline recovery, zoom, focus, keyboard and screen readers on representative devices | docs/UI-UX-REVIEW.md; owner-operated devices
2026-10-15 | P1 | Real-service capacity | Measure Google Sheets scan/bootstrap/report latency, quotas and voucher-numbering contention before creating production SLOs | owner-authorized test environment
2026-10-15 | P2 | Audit observability | Dual audit-append/marker-store failure has no durable owner marker. Investigate an owner-approved durable fallback without fabricating historical events | PR #132 regression; unresolved
2026-10-15 | P2 | Dependency exception | Reassess clasp → micromatch → braces advisory by 9 November 2026 | docs/DEPENDENCY-SECURITY-EXCEPTIONS.md
