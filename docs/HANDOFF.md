# Engineering Handoff

Updated: 18 October 2026  
Repository: `tchouhanjsm/cash-voucher`  
Verified `main` SHA: `9335018b5b9edf1109839f5f9aa2216e4128fbdc`  
Merged change: [PR #173 — Server-backed client onboarding and release gates](https://github.com/tchouhanjsm/cash-voucher/pull/173)  
PR #173 exact tested head: `567b48c54a0e179b9b4775d0aba7ac45f4220749`

## Verified source state

- PR #173 is merged. Its exact tested head passed [CI](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39109913768), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39109913770) and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39109913787).
- Post-merge `main` CI passed on merge commit `9335018b5b9edf1109839f5f9aa2216e4128fbdc`: [run 39111329035](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39111329035).
- PR #173 adds server-backed, per-environment onboarding progress; owner-only ordered confirmations with audit events; environment/resource identity checks; and a central financial-write gate. These are source/mock verification results, not proof of a real deployment.
- No staging Google resources, static host/subdomain, live UAT, backup/restore drill, or customer acceptance has been verified. No Apps Script push, frontend publication, or production mutation was performed.

## Current release boundary

Cash Voucher is a single-property PWA backed by Apps Script, Sheets and Drive. Staging requires its own Script/Web App deployment, Sheet, receipt and backup folders, and a browser origin distinct from production. Do not reuse the unverified root `config.js` endpoint. Publish only the customer-specific `dist/` output—not the repository root.

## P0 — required before staging publication

1. **Choose and provision the host target.** Confirm the staging hostname and hosting provider. The repository does not evidence a configured static host/subdomain or a deployed staging frontend.
2. **Provision isolated Google staging resources.** Create a new staging Sheet and bound Apps Script project, separate receipt/backup folders, and a first versioned Web App deployment. Verify and record the Script, deployment, Sheet and folder identities privately. Run `setup()` only on the owner-verified new/empty staging instance; never on populated data.
3. **Configure the staging backend.** Set `CV_ENVIRONMENT=staging`, `CV_DEPLOYMENT_ID` and matching `CV_STAGING_*` Script Properties. Independently verify the deployment ID and exact `/exec` URL.
4. **Configure the protected GitHub Environment.** Create `staging`, restrict deployments to `main`, add reviewers where supported, and configure the documented staging/production resource variables plus private Clasp and dedicated staging Owner/Manager password secrets. Never put credentials or live target identifiers in source, PR text, chat or public logs.
5. **Build the frontend for staging.** Use the independently verified staging API endpoint and explicitly set `CV_ENVIRONMENT=staging`; run `npm ci && npm run build:web`; publish only `dist/`. Do not use root `config.js` as the staging target. Cloudflare Pages consumes the generated `_headers` file; Apache/cPanel or another host needs equivalent host-level response headers.
6. **Verify the live static site.** Confirm generated configuration has the intended staging API/environment/deployment identity, browser requests reach staging only, response headers are present, and no CSP/console errors remain.
7. **Run owner-authorized staging UAT.** Dispatch `.github/workflows/staging-uat.yml` from `main`, first with `validate-only`; then run guarded `deploy-and-uat` with exact `STAGING-ONLY` confirmation and explicit staging-write consent only after target, secret and reviewer checks. UAT creates and cancels a tagged INR 10,000 test payment in staging; its cancelled row and audit trace remain.
8. **Keep acceptance separate from green automation.** Manually verify role/receipt access, PWA/offline recovery on operating devices, a real backup snapshot, and a restore into a separate recovery Sheet/folder. Record evidence in the private instance register. Do not call staging accepted until these gates pass.

## Do not cross these gates

- No production transaction or synthetic UAT on production.
- Do not rerun `setup()` on populated customer Sheets.
- Do not treat a merge, mock test, generated `dist/`, or successful workflow as proof of live access, response headers or restoreability.
- Keep repository privacy/hosting continuity under review; change visibility only after hosting can read the private repository and service continuity is confirmed.

## P1/P2 queue after staging

- Complete contextual review of the 17 active DOM assignment sites across eight frontend modules; inventory/fingerprint tests are not full XSS certification.
- Measure Apps Script/Sheets latency, quotas and voucher-number contention in authorized staging.
- Complete human keyboard/focus, 200–400% zoom/reflow, screen-reader, print/export and device/offline checks.
- Start the 14-day operating pilot only after release, restore and device gates pass.
- Resolve the durable fallback design for simultaneous audit append/marker-store failure; review the `braces@3.0.3` dependency exception by 9 November 2026; obtain accountant-approved export mapping before claiming destination-specific accounting compatibility; decide whether denomination-level cash counts add value.

See [Staging Release Audit](STAGING-RELEASE-AUDIT.md), [Release Readiness](RELEASE-READINESS.md) and [Apps Script Release Runbook](APPS-SCRIPT-RELEASE-RUNBOOK.md).