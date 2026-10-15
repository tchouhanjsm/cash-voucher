# Engineering Handoff

Updated: 15 October 2026  
Repository: tchouhanjsm/cash-voucher  
Last verified main SHA: `dee9f04d8a77c9360c1c6be433928b953f1fd597` (PR #138 merge)  
Current phase: Phase 9 — payee identity parity for approval-threshold aggregation  
Current working branch: `phase-9/payee-identity-approval-integrity-2026-10-15`  
Current open PR: #139 — [Preserve payee-day approval across legacy VendorIDs](https://github.com/tchouhanjsm/cash-voucher/pull/139)

## Verified repository state

- PR #137 merged at `fabf4bba1a964c99c55391c4d4be3f260d787906`.
- PR #138 merged at `dee9f04d8a77c9360c1c6be433928b953f1fd597`; final tested head `eb780e893fb8388ddf4bc1e584a503ba3245df10`.
- PR #138 CI passed: https://github.com/tchouhanjsm/cash-voucher/actions/runs/38710771619.
- PR #138 Browser E2E passed: 351 checks, zero failures: https://github.com/tchouhanjsm/cash-voucher/actions/runs/38710771610.
- PR #138 Full Flight Test passed: https://github.com/tchouhanjsm/cash-voucher/actions/runs/38710771634.
- Post-merge CI passed on the current main merge SHA: https://github.com/tchouhanjsm/cash-voucher/actions/runs/38711146077.
- PR #139 is the active Phase 9 review; merge authority remains with the owner. Exact final-head workflow evidence and review status are maintained in the PR description. Re-run required workflows after every branch-head change.
- PR #138 removed the shared modal-frame `innerHTML` assignment; current inventory is 27 assignments across eight frontend modules. The remaining sinks are not certified safe.
- All listed workflow evidence is GitHub Actions/mock-backed; it does not prove live deployment, Google permissions, backup/restore, device behavior or production readiness.

## Phase 9 — payee identity parity for payment approval (PR #139 open)

Close an identity mismatch in the payee-day approval aggregation. The current function builds a key from VendorID if available, otherwise the display name. A legacy voucher with no VendorID can therefore be missed when a new voucher for the same normalized vendor name has a VendorID.

The intended comparison is explicit: if both records have a non-empty VendorID, the IDs are authoritative and must match; if either record is unlinked/legacy, compare normalized vendor names (trimmed, case-insensitive, whitespace-collapsed). Do not backfill VendorID into historical vouchers.

## Acceptance criteria

- Creation totals include same-name legacy PAYMENT rows without VendorID when the new row has a stable VendorID, including the inclusive INR 10,000 threshold.
- Material edits use the same fallback and re-evaluate approval when a linked voucher crosses the cumulative payee-day threshold.
- Two non-empty, different VendorIDs are never combined solely because their names match.
- Batch creation, stable-ID matching, same-day/date filtering, active-payment filtering, integer-paise arithmetic and exclusion of the voucher being edited remain correct.
- Add backend regressions for legacy-linked creation, edit crossing, and distinct stable identities.
- No automatic historical VendorID backfill, schema migration, approval-policy change, production data mutation or deployment.
- CI, Browser E2E and Full Flight Test must pass on the same exact final PR head. A prior source head passed code quality/backend tests, Browser E2E and Full Flight Test; its CI job failed the PR-description handoff validator because the required Security and failure review section was absent. The PR description has now been corrected, and this handoff update requires fresh exact-head runs.

## Remaining risks and owner-controlled operational gates

- The 27 active HTML assignment sites across eight modules remain under contextual review; sink counts/fingerprints are drift gates, not proof of safety.
- Live Apps Script deployment identity/version, Sheet/Drive permissions, role/receipt authorization, scheduled backup, isolated restore, device/offline/accessibility, and real-service quotas/concurrency remain unverified.
- Investigate the documented audit-write dual-failure observability limit without inventing missing events.
- Reassess the `@google/clasp -> micromatch -> braces` exception by 9 November 2026.
- Owner retains merge and release authority. Do not run `clasp push`, deploy, perform setup/migrations, mutate production data or rewrite Git history without explicit authorization.
- Preserve the protected local untracked `docs/AI-ENGINEERING-PROTOCOL.md`. Do not stage, overwrite, delete or otherwise disturb it.
- `docs/HANDOFF.md` remains the single canonical handoff; do not create per-PR handoff documents.
