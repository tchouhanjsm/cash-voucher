# Founder Mode: working rules

Read this first every session. It overrides habit. Current state lives in `docs/HANDOFF.md`; product direction in `docs/PRODUCT-ROADMAP.md`.

## Principle

Ship a user-visible outcome every PR. Hardening is only in scope when the current slice needs it.

## Rules

1. **One PR = one outcome** a hotel user can see or an owner can rely on. Several commits and tests inside one PR are fine; separate "tweak" PRs are not.
2. **Slice order** (reorder only with owner approval):
   1. Slice 1: cash-impact field, then daily cash close, then rename "Cash in hand" to "Book balance".
   2. Slice 2: go-live gates (CSP, live deployment check, restore drill, device PWA check, 14-day pilot).
   3. Slice 3: audit event log with old/new values and reason, then approval threshold.
   4. Slice 4: accountant role and export, then vendor IDs.
3. **Freeze** offline and security hardening except what the active slice needs. Other findings go to `docs/BACKLOG.md` (one line each), not into a PR.
4. **Blocked on owner?** Stop and list the decisions with a recommended answer for each. Do not build around an open decision.
5. **Run locally before every push:** `npm run fix`. The pre-commit hook formats staged files. No "diagnose formatter" or "restore gate" commits.
6. **Do the whole slice:** code, tests, domain doc update, PR body. Do not hand back half a slice.
7. **No per-PR handoff files.** Update `docs/HANDOFF.md` only when a slice merges, and keep it short.
8. **Never without explicit owner approval:** deploy, `clasp push`, `setup()`, force-push, delete branches, touch production data. Keep the owner's untracked `docs/AI-ENGINEERING-PROTOCOL.md`.
9. **Be honest:** say what was run and what was not. Cite commands and results, not impressions.
10. **Talk less:** status in at most 5 lines. Tables over prose. No recaps.

## PR checklist (matches `check-pr-quality`)

Outcome, Acceptance criteria, Verification evidence, Security and failure review, Release boundary, Residual risks / not verified.

## Done means

CI, Browser E2E and Full Flight Test pass on the final head, and the outcome works on a phone.
