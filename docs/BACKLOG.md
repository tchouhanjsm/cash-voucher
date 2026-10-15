# Backlog

One line per item: date | priority | area | outcome / finding | evidence / dependency.

2026-10-15 | P0 | Consolidated recovery batch | Close the post-commit acknowledgement and stale-session sync scenarios; preserve client ID and account binding; require same-head CI/E2E/Flight green | PR #132; docs/PHASE-2B-OFFLINE-RECOVERY-MATRIX.md
2026-10-15 | P0 | Operational release proof | Verify intended Apps Script deployment/execution identity, Sheet binding and live role/receipt permissions; witness scheduled backup and isolated restore only after owner authorization | docs/RELEASE-READINESS.md, docs/DATA-DURABILITY.md
2026-10-15 | P1 | Audit trust | Audit append and marker-store dual failure has a console diagnostic but no durable owner status; define owner-approved audit-gap investigation and reconciliation without reconstructing events | PR #129 and PR #132 regression; not tamper-evident
2026-10-15 | P1 | Security review | Finish complete dynamic DOM sink inventory and action-by-role authorization review; triage any findings; do not treat route registry or pattern scan as certification | docs/SECURITY-RENDERING-AUDIT.md
2026-10-15 | P1 | Credential exposure | Run the new current-tree/reachable-history high-confidence pattern scan on exact PR SHA; review any findings privately and rotate any real exposed credential; never rewrite history without authorization | npm run audit:secrets; CI must use full history
2026-10-15 | P1 | Product/device UX | Observe real staff/manager/owner workflows on phone/tablet; test install/update/offline recovery, focus, zoom and screen-reader status; bundle related cross-screen issues | docs/UI-UX-REVIEW.md
2026-10-15 | P2 | Mock performance evidence | Capture seeded bootstrap/report completeness and timing at 100, 500 and 1,000 rows; use as diagnostic regression only | test/test-performance-baseline.js
2026-10-15 | P2 | Production performance | Measure real Sheets reads, bootstrap/report latency, quotas and concurrent numbering before establishing service-level targets | owner-authorized test environment
2026-10-15 | P2 | Dependency exception | Reassess @google/clasp → micromatch → braces advisory by 9 November 2026 | docs/DEPENDENCY-SECURITY-EXCEPTIONS.md
