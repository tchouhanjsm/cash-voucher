# Engineering Handoff

Updated: 18 October 2026  
Repository: `tchouhanjsm/cash-voucher`  
Verified `main` SHA: `df641e06088910281e0940450bb91b5b82e6d6dc`  
Current work branch: `docs/final-release-handoff-20261018`  
Current work: final release handoff after PR #175; live staging provisioning and customer acceptance remain pending.  
Owner authority: the repository owner retains approval to merge, provision Google resources, perform manual UAT and restore drills, and deploy. PR #173 is merged; no Apps Script or website deployment or production mutation was performed.

## Verified source state

- [PR #165](https://github.com/tchouhanjsm/cash-voucher/pull/165), Phases 37–39, merged at `4b729f33d9caff13e01ed56acbc231375c5beec0`. Exact tested head `26a92a70513a088cddc994d1a398d63d908ec8e0` passed CI/quality, Browser E2E and Full Flight Test.
- [PR #166](https://github.com/tchouhanjsm/cash-voucher/pull/166), customer static build, response-header artifact and onboarding/handover documents, merged at `4a759b7513a925aee796949d8f6e79085f096314`. Exact tested head `13f12d314687ec88d9044ccae7e8fb3c202743fb` passed CI, Browser E2E (947 checks) and Full Flight Test (285 backend + 947 browser checks). [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39002776051) · [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39002776133) · [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39002776075).
- PR #174 (staging artifact and release-doc preparation) is merged at `db3e2b76ef028fe6f20a2664bce454a82be57916`; its exact tested head passed CI, Browser E2E and Full Flight Test.
- PR #175 ([Account → Report a problem](https://github.com/tchouhanjsm/cash-voucher/pull/175)) is merged at `449f47d994be3a918f883abc2ab7023043e4cc1b`. Its exact tested head `49c672859d86aff4b4c648a0221a57ff3387f8ce` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39118432725), [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39118432728), and [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39118432768). The inbox is configured through each client’s Apps Script `SUPPORT_EMAIL` Script Property; actual MailApp delivery still needs one controlled staging test.
- Repository visibility is now **private**. Verify host access after the visibility change before relying on host-triggered builds.
- PR #173 adds server-backed per-environment onboarding state, ordered owner confirmations with audit events, environment/resource identity checks and central financial-write gates. Its exact tested head `567b48c54a0e179b9b4775d0aba7ac45f4220749` passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39109913768), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39109913770) and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39109913787). PR #173 merged at `9335018b5b9edf1109839f5f9aa2216e4128fbdc`; post-merge [main CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39111329035) passed. This is source/mock evidence, not live staging proof.

## Product and release boundary

Cash Voucher remains a single-property static PWA backed by Google Apps Script, Sheets and Drive. Each staging/customer instance needs its own Script/Web App deployment, Sheet, receipt/backup folders and distinct static origin. The customer build command is `npm run build:web`; set the verified instance URL through `CV_API_URL` and explicitly set `CV_ENVIRONMENT=staging` or `production`. Publish only `dist/`, which emits `_headers` for Cloudflare Pages and `.htaccess` for Apache; verify the live HTTP response headers.

PR #166 prepares packaging; PR #174 adds the Apache security-header artifact and handoff corrections; PR #175 adds support reporting. These merges did **not** provision staging/customer Google resources, a protected GitHub staging Environment, hosting projects, real URLs, accounts or credentials. The repository is now private; confirm hosting integration remains authorized. Live target identity, roles/receipt access, real scheduled backup, isolated restore, real support delivery, real-device/offline recovery, human accessibility checks, service capacity and the controlled pilot remain unverified.

## Support request email

PR #175 adds an authenticated Account → Report a problem form. It calls Apps Script action `reportIssue` and emails the server-configured `SUPPORT_EMAIL`; the client cannot choose the recipient. The message includes a reference, workspace/reporter/role, environment and Script context. Audit entries record the subject, not the message body. Cache-based rate limits are best-effort (5 per user/hour, 20 per workspace/6 hours). Configure `SUPPORT_EMAIL` in every client project and test one real email in staging. Login-failure support uses the operator-supplied external contact, not an anonymous email-submit endpoint.

## Current priority order

1. **P0 — verify private-host continuity:** confirm the static host can access the now-private repository, build successfully, and publishes only `dist/`. Do not change DNS or remove an existing host until continuity is proven.
2. **P0 — provision staging:** create isolated Google resources and a first versioned Web App deployment; verify all target IDs; protect the GitHub `staging` Environment and secrets; build the static client with the verified staging URL and `CV_ENVIRONMENT=staging`; publish only `dist/`; run owner-authorized UAT.
3. **P0 — private-host continuity and first-customer isolation:** the source repository is private; prove the host integration still has access before DNS changes. Provision a new customer instance and unique Cloudflare Pages origin; never reuse the staging Sheet or current unverified root `config.js` endpoint.
4. **P0 — operational trust:** verify live owner/manager/staff permissions and receipt access, inspect a real backup, restore into a separate recovery destination, reconcile row counts and voucher numbers, and test the actual customer link.
5. **P1 — real-device verification and 14-day pilot:** PWA installation/update, offline queue/recovery across every operating device, keyboard/focus, zoom/reflow, screen reader, print/export, end-of-day book-vs-physical-cash reconciliation and daily incident/fallback evidence.
6. **P1 — authorized real-service measurements and contextual review of the 17 active DOM assignment sites.**
7. **P2 — resolve the owner-approved design for dual audit append/marker-store failure; review the `braces@3.0.3` dependency exception by 9 November 2026; obtain accountant-approved destination/mapping before claiming target-specific exports; decide whether denomination-level counts add operational value.**

See [Staging Release Audit](STAGING-RELEASE-AUDIT.md) for the evidence, detailed setup sequence and queue. See [Release Readiness](RELEASE-READINESS.md) for the acceptance gates. Do not treat a green mock suite, a merged PR or generated `dist/` as live deployment/restore proof.
