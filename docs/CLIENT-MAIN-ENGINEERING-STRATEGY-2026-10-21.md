# Client-main — Engineering and Release Strategy

**Effective:** 21 October 2026  
**Current baseline:** d5ed3e77387d0f1896c97dbaac793ed23b17eb32, after PR #197.

## Branch policy

- client-main is the only active integration branch.
- main is legacy/read-only; product-development PRs must not target main.
- Use short-lived client/* branches and target client-main.
- The branches diverged in the 21 October comparison: client-main was 13 commits ahead and 2 behind main. Do not synchronize them blindly or force-push.
- Local hooks and repository docs do not prove GitHub policy enforcement. Owner/admin must verify active rulesets and default-branch settings.
- PR merge, Apps Script upload, Web App deployment, static publishing, migration and production approval are different stages.

## Delivery standards

Prefer cohesive outcome-oriented changes that bundle compatible source, focused tests, safety controls, and necessary handoff updates. Avoid tiny PRs limited to one cosmetic change or documentation-only maintenance; update strategy/runbook docs when necessary to close an operational contradiction introduced or discovered in the implementation.

Every PR must receive:

1. Product, security, financial-invariant, permissions, migration, offline/idempotency and rollback review.
2. Local npm run check and Browser E2E when available; disclose any unrun tests.
3. CI, Browser E2E and Full Flight Test passing on the exact final PR head.
4. Focused regression tests for the defect or operational failure.
5. A fresh review after any pushed fix; checks from an older SHA do not satisfy the new head.
6. A clear release boundary and no merge while required checks are missing, stale or failing.

## Release stages

- **Source PR merged:** reviewed source is on client-main; this does not prove Apps Script or the static site changed.
- **Clasp push:** backend source reached the selected Apps Script project; this does not prove a Web App version is live.
- **Web App deployment updated:** a selected version is on the intended deployment; this does not prove UI, roles, records, receipts or backup work end-to-end.
- **Static ZIP built:** a staging-configured artifact passed packaging checks; this does not prove the host published it or returned secure headers.
- **Staging UAT passed:** tested cases on the deployed staging path passed; this does not prove backup/restore or customer acceptance.
- **Restore drill passed:** the checked data can be reconstructed into a separate target; this does not prove every offline device has synced.
- **Customer acceptance:** that instance's documented launch gates were accepted; this does not justify a rollout to other customers.

## Staging safeguards

Deploy/UAT remains manual and must run from refs/heads/client-main. For deploy-and-uat or uat-only, require exact STAGING-ONLY confirmation and explicit staging-write consent. The protected staging Environment must have expected configuration, and preflight must prove Script, deployment, Spreadsheet, receipt folder and backup folder are different from configured production resources. Update only a verified existing deployment. Validation-only must not receive staging secrets. Do not log credentials or use production records as test data.

## Product and data invariants

- Only physical cash impacts the drawer; UPI/bank values stay distinct.
- Payment at or above ₹10,000 requires independent approval; a creator cannot self-approve.
- Use schema-checked additive migrations and preserve historic blanks.
- Daily close is a snapshot with controlled corrections.
- A local offline queue is not central save/backup; use idempotent replay and explicit recovery.
- Verify the actual backup and receipt manifest, then restore to a separate target.
- Backend authorization remains authoritative; hiding UI controls is not access control.
- Do not claim full XSS, CSP headers, accessibility or audit durability unless specific live evidence supports the claim.

## Current queue

**P0 — release readiness:** align strategy, handoff and staging audit to PR #197; assert that the workflow, branch policy and documents agree; owner/admin verifies branch rulesets and host private-repo access; run authorized staging UAT; prove real backup/restore; test actual device, roles, receipts, print and offline recovery; obtain acceptance.

**P1 — pilot-driven improvement:** after observation, consider Today → Close → Owner card as one vertical slice, reusing existing payment, receipt, approval, exception, close and recovery data paths.

**P2 — research:** design durable audit-failure handling; validate accountant software/version and import fixture; review the time-bounded braces@3.0.3 exception by 9 November 2026; measure Apps Script/Sheets service limits before a database decision. Do not blindly downgrade Clasp or rewrite to multi-tenant.

## Merge and release discipline

Merge only the exact reviewed, green head. If checks fail, diagnose and fix root cause rather than bypassing checks. Keep main unchanged while owner/admin resolves repository controls. No production deployment, migration, DNS change or customer-data mutation is included in this strategy PR.

## Required owner actions outside the PR

1. Verify active rulesets for client-main and main and record the real Settings state.
2. Confirm default branch and private-host build permission.
3. Verify the protected staging Environment, resource identifiers and credentials.
4. Authorize a specific staging workflow run only after reviewing its target IDs and synthetic writes.

This is the active engineering strategy for client-main. Update it in the same meaningful batch that changes the release boundary.
