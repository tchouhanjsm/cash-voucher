# Backlog

One line per item: `date | area | finding | source`. Phase 2 currently implements cross-workflow integrity; remaining items stay queued behind that outcome.

2026-10-14 | Phase 2 / cross-workflow integrity | Extend the approved-payment lifecycle regression across entry→approval→report→cash-close snapshot→audit; follow with ambiguous retry, concurrent tabs, stale session and offline recovery matrix | docs/PHASE-2-CROSS-WORKFLOW-INTEGRITY.md; docs/PHASE-1-REPOSITORY-AUDIT.md
2026-10-14 | Operations / release proof | Verify intended Apps Script project/deployment, live roles and receipt access; witness backup and isolated restore only after owner authorization | docs/PHASE-1-REPOSITORY-AUDIT.md; docs/RELEASE-READINESS.md
2026-10-14 | UI/UX / adoption | Conduct role-based real-device workflow observations and manual keyboard/screen-reader/zoom checks; consolidate cross-screen fixes | docs/PHASE-1-REPOSITORY-AUDIT.md; docs/UI-UX-REVIEW.md
2026-10-14 | Security / data integrity | Complete active HTML/DOM sink inventory and server API authorization review; classify each finding as fixed, accepted or not verified | docs/PHASE-1-REPOSITORY-AUDIT.md; docs/SECURITY-RENDERING-AUDIT.md
2026-10-14 | Repository hygiene | Run non-destructive current-file and Git-history secret scan; if exposure is found, rotate affected credentials; no history rewrite without approval | docs/PHASE-1-REPOSITORY-AUDIT.md
2026-10-14 | Performance | Establish repeatable seeded workload baseline for bootstrap, Sheet scans, report latency and concurrent numbering before optimization | docs/PHASE-1-REPOSITORY-AUDIT.md; docs/PRODUCT-ROADMAP.md
2026-10-14 | Dependency risk | Review documented @google/clasp → micromatch → braces advisory exception by its 9 November 2026 review date | docs/DEPENDENCY-SECURITY-EXCEPTIONS.md
