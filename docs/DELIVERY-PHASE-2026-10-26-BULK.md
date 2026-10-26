# Delivery Phase — 26 October 2026

**Integration baseline:** 75561d19e5f72f885c813152de122e7444801d70
**Source PR:** #224 — bulk Dashboard contract and staging artifact hardening
**Scope:** source-level page review, automated regressions and release-package readiness. No production changes, Clasp push, live UAT, cPanel publication or device certification are claimed here.

## Page-by-page review

| Page / flow | Source review and disposition |
| --- | --- |
| Login, authentication and account | Existing password/session rules, explicit error announcements, theme selection and sign-out paths are retained. Test actual owner/manager accounts in isolated staging; source checks are not live identity proof. |
| App shell and navigation | Role-based routes, offline allowlist, active-page semantics, focusable headings, theme tokens and responsive navigation are present. Confirm actual layouts on intended phones/tablets. |
| Dashboard | **Fixed in this batch:** malformed/missing financial summary values previously defaulted to zero and invalid trend/group structures could be consumed. Now validates date-window metadata, amounts, counters, time-series rows and grouping rows before rendering KPIs/charts; malformed payloads fail closed. Browser tests inject invalid paid and trend fields and prove recovery. |
| New Entry — payments and receipts | Reviewed validation, payment-method/cash-impact controls, payee defaults, receipt preview cleanup, unsaved-work guard and offline outbox flows. Test real receipt uploads and reconnect behavior only against isolated staging. |
| Register | Read-model pagination, role-scoped filters/actions, malformed-row disclosure, total availability, CSV restrictions and retryable receipt loading are present. Verify large live Sheets responses and permissions in staging. |
| Reports | Separate loading/error/empty states and summary validation exist; CSV generation is guarded by valid results. Verify output against accountant-approved totals and a known test ledger. |
| Daily Cash Close | PR #223 rejects inconsistent persisted close metadata, amount cells, voucher snapshot sums, expected cash and variance. This is data-integrity validation, not a migration or live close rehearsal. |
| Bulk Upload | Preview-first import, required cash-impact classification, duplicate checks, per-row issues and completion announcements are present. Exercise representative customer CSV/TSV files without production imports. |
| Vendors and Users | Reviewed malformed-envelope handling, real empty states, permission-gated actions, refresh paths and safe text rendering. Verify real roles and server denials in staging. |
| Settings, Audit and Backup status | Reviewed filters/export, visible failure states and retry controls. Real backup success, audit-store durability and authorization require a separate staging run. |
| Onboarding | Server-backed ordered gates and retry states prevent local assumptions of completion. Do not bypass the gate; verify against isolated resources. |
| PWA/offline, print and accessibility | Source/mock-browser coverage includes cache policy, queue recovery, print CSS, keyboard behavior and responsive widths. No physical-printer, all-device offline, manual screen-reader or WCAG certification is claimed. |

## Git to local — reverse sync from the authoritative branch

Run from the existing repository clone. Keep local work; do not reset a dirty working tree.

```bash
git status --short
# If local changes exist, preserve them before syncing:
git stash push -u -m "pre-sync backup 2026-10-26"
git fetch origin --prune
git switch client-main
git pull --ff-only origin client-main
git status --short
npm ci
npm run check
```

If the clone does not yet have client-main, fetch first and use git switch --track -c client-main origin/client-main. To start the next task, create a branch from the refreshed integration branch:

```bash
git switch -c client/my-next-bulk-phase
```

Do **not** merge, rebase, reset or force-push legacy main. Review saved work and re-apply it deliberately with git stash list / git stash pop; never overwrite local work automatically.

## Build and publish the staging website ZIP

This is separate from Clasp. After PR #224 is merged to client-main and the owner has privately verified the protected GitHub staging Environment:

1. Confirm CV_STAGING_API_URL is the dedicated staging Web App's exact HTTPS /exec URL and CV_STAGING_DEPLOYMENT_ID matches that URL and the intended Script deployment. Do not reuse the unknown root config.js endpoint or commit/paste staging IDs.
2. Open **Actions → Client staging dist zip → Run workflow** and choose client-main. Enter the client code; the endpoint comes from the protected Environment, not a form. The workflow rejects other refs, stale branch tips, missing variables and deployment-ID mismatches.
3. Download both cv-<client>-staging-<full-sha>.zip and the matching .zip.sha256 sidecar. Verify the SHA-256 value before extraction. Inside the archive, inspect release-manifest.json and run sha256sum -c SHA256SUMS.txt from the extracted directory.
4. Preserve the current staging site as a rollback copy. Extract the ZIP and publish **only its root contents** (generated config.js, assets, .htaccess, robots.txt and integrity manifests) to the verified staging cPanel document root. Never publish to production or upload the entire source repository.
5. Verify hostname, browser console, served response headers, CV_CONFIG.ENVIRONMENT, target deployment, login, role access and basic payment/receipt journeys. Source CI and a ZIP do not prove the host or live Apps Script works.

The action artifact has 14-day retention. Download the verified package to the operator's approved release archive before expiry. The workflow does not deploy to cPanel, push Clasp or mutate Google resources.

## Apps Script / Clasp — controlled staging push

Never run Clasp until the operator has independently verified that the Script ID, Sheet ID, receipt folder and backup folder are dedicated to staging and distinct from production.

**Preferred guarded route** from a clean, updated integration checkout:

```bash
npm ci
npm run check
# Securely populate staging-only environment values and CLASPRC_JSON.
# Never commit .clasp.json / .clasprc.json or print credentials.
npm run staging:preflight -- --mode=deploy
CV_STAGING_DEPLOY_CONFIRMATION=STAGING-ONLY npm run staging:deploy
```

The guarded script creates an isolated temporary Clasp workspace, uses the configured staging project, verifies the existing deployment ID, then runs clasp push --force and updates that deployment. Stop if preflight rejects any value; do not remove guards or retry unchanged credentials/resources.

For a manual local Clasp project, inspect the private .clasp.json target, then run npx clasp status and npx clasp deployments. Only after confirming those outputs target the dedicated staging Script may the operator run npx clasp push. A source push is not the same as updating a Web App deployment or verifying it live.

**Transactional UAT is separate.** The existing deploy-and-uat / uat-only workflow creates and cancels a tagged INR 10,000 test payment. It requires the exact STAGING-ONLY input and explicit confirm_staging_writes=true. Do not dispatch this path without explicit consent that writes are confined to the isolated staging instance; use validate-only while identity/configuration remains unverified.

## PR and CI/CD gates

- PR #224 targets client-main from client/bulk-dashboard-staging-release-20261026; it remains open until reviewed and merged by the owner.
- Require CI / Quality, Browser E2E and Full Flight Test to pass on the **same final PR SHA**. Green checks from a previous commit are not evidence for the final head.
- This batch has not changed branch rules, auto-merged a PR, run a Clasp push, run migrations, executed transactional UAT, or published a staging/production site.
- The last recorded client-main branch API state reported protected=false; owner/admin must configure and verify the effective ruleset and approvals.
