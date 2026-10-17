# Engineering Handoff

Updated: 17 October 2026  
Repository: `tchouhanjsm/cash-voucher`  
Verified `main` SHA: `9e89fc80c88b40f287fd7f42f3d3395ad66f0fef` (PR #167 merge; post-merge CI verified)  
Current work branch: `feature/password-login-staging-20261017`  
Current pull request: [#169 — Implement password login UI and authentication audit trail](https://github.com/tchouhanjsm/cash-voucher/pull/169)  
Current work: integrate the supplied two-panel login design, replace PIN-based authentication with passwords, audit successful/failed authentication attempts, and align staging UAT credentials and tests.  
Owner authority: repository owner retains approval to merge, provision Google resources, configure protected GitHub environments, run manual staging UAT, perform schema migrations and deploy production. This branch has not done those things.

## Verified source state

- [PR #165](https://github.com/tchouhanjsm/cash-voucher/pull/165), Phases 37–39, merged at `4b729f33d9caff13e01ed56acbc231375c5beec0`. Exact tested head `26a92a70513a088cddc994d1a398d63d908ec8e0` passed CI/quality, Browser E2E and Full Flight Test.
- [PR #166](https://github.com/tchouhanjsm/cash-voucher/pull/166), customer static build, response-header artifact and onboarding/handover documents, merged at `4a759b7513a925aee796949d8f6e79085f096314`. Exact tested head `13f12d314687ec88d9044ccae7e8fb3c202743fb` passed CI, Browser E2E (947 checks) and Full Flight Test (285 backend + 947 browser checks). [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39002776051) · [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39002776133) · [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39002776075).
- [Post-merge main CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39003040102) passed on the current main SHA.
- PR #169 is open; current head and CI results are authoritative on the live PR page. The branch is unmerged and undeployed.

## Product and release boundary

Cash Voucher remains a single-property static PWA backed by Google Apps Script, Sheets and Drive. Each staging/customer instance needs its own Script/Web App deployment, Sheet, receipt/backup folders and distinct static origin. The customer build command is `npm run build:web`; set the verified instance URL through `CV_API_URL` and publish only `dist/`.

PR #166 prepares packaging and instructions; it did **not** provision a staging/customer Google project, GitHub staging Environment, Cloudflare Pages project, real URL, account or credentials. The repository is still public. Live target identity, roles/receipt access, real scheduled backup, isolated restore, real-device/offline recovery, human accessibility checks, service capacity and the controlled pilot remain unverified.

## Current priority order

1. **P0 — finish PR #169:** review exact-head CI/Browser E2E, fix any regressions, and merge only after the owner approves. Then provision separate staging Google resources and first versioned deployment; configure protected GitHub `staging` Environment variables/secrets using the password-based UAT names; run the guarded `deploy-and-uat` workflow from `main` with exact `STAGING-ONLY` confirmation and staging-write consent; review the exact result.
2. **P0 — privacy and first-customer isolation:** move the source repository to private only after the static host can access it and continuity is verified; provision a new customer instance and unique Cloudflare Pages origin; never reuse the staging Sheet or current unverified root `config.js` endpoint.
3. **P0 — operational trust:** verify live owner/manager/staff permissions and receipt access, inspect a real backup, restore into a separate recovery destination, reconcile row counts and voucher numbers, and test the actual customer link.
4. **P1 — real-device verification and 14-day pilot:** PWA installation/update, offline queue/recovery across every operating device, keyboard/focus, zoom/reflow, screen reader, print/export, end-of-day book-vs-physical-cash reconciliation and daily incident/fallback evidence.
5. **P1 — authorized real-service measurements and contextual review of the 17 active DOM assignment sites.**
6. **P2 — resolve the owner-approved design for dual audit append/marker-store failure; review the `braces@3.0.3` dependency exception by 9 November 2026; obtain accountant-approved destination/mapping before claiming target-specific exports; decide whether denomination-level counts add operational value.**

See [Staging Release Audit](STAGING-RELEASE-AUDIT.md) for the evidence, detailed setup sequence and queue. See [Release Readiness](RELEASE-READINESS.md) for the acceptance gates. Do not treat a green mock suite, a merged PR or generated `dist/` as live deployment/restore proof.
