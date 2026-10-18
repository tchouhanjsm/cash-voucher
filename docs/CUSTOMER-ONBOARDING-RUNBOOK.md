# Customer Instance Onboarding and Production Handover

**Purpose:** provision one managed Cash Voucher subscription for one customer while retaining product ownership and release control.

**Commercial model:** the current customer arrangement is ₹500 per month under the separately signed contract. The customer operates the application; the product owner provisions, hosts, maintains, backs up and releases it.

**Status:** this is an operational runbook, not evidence that a customer instance has already been provisioned. PR #173 (server-backed onboarding and financial-write release gates) is merged at `9335018b5b9edf1109839f5f9aa2216e4128fbdc`; its exact tested head passed CI, Browser E2E and Full Flight Test, and post-merge main CI passed. Live staging/customer provisioning, static hosting, backup/restore and acceptance remain unverified. Do not mark a gate complete until live evidence is in the private instance register.

## Current verified starting point

- The mainline contains the Cash Voucher PWA and split Google Apps Script backend source.
- GitHub repository: `tchouhanjsm/cash-voucher`; default branch `main`.
- Repository visibility was verified as **public** on 17 October 2026. Plan a move to a private source repository after the frontend is hosted independently; do not blindly switch visibility first if it would break a currently used website.
- The root `config.js` already contains an Apps Script URL, but the project, Sheet, deployment version, data owner and live backup status behind that URL have not been independently verified. **Do not reuse that URL for a new customer.**
- Mock tests and source code do not prove that a real customer's Google resources, authentication, backup, restore, hosting or customer link work.
- The customer business name, customer-owner email and new Google/hosting resource identities still need to be entered in the private operator register.

## Non-negotiable isolation rules

Every customer gets all of the following:

1. A dedicated bound Google Sheet.
2. A dedicated Google Apps Script project bound to that Sheet, with its own Script Properties and versioned Web App deployment.
3. A separate private Drive receipt folder and backup root created by setup.
4. A separate production static-site project and **distinct browser origin/hostname**.
5. Its own API endpoint configured only in that site's deployment build environment.
6. Its own customer-owner login and individual user accounts.

Do not treat a different URL path or query parameter on the same origin as tenant isolation. The browser's IndexedDB outbox currently uses the database name `cash-voucher`, and local storage keys are also origin-wide; users could otherwise mix unsynchronized records or local login state across customer instances on the same origin. Do not onboard a second customer to the same frontend origin until storage isolation has been implemented and tested.

Do not share a customer's Sheet, receipt folder or backup folder with another customer. Do not give customer staff direct access to the underlying Sheet, Apps Script editor, repository, GitHub Actions, Clasp credentials or owner Google account.

## A. Protect the source and operator account

- [ ] Use a business-managed Google account that will remain under the product owner's control for Apps Script execution, Sheets, Drive, receipts and backups. Enable two-step verification and verify recovery access.
- [ ] Keep Clasp authentication and `.clasp.json` local or in a protected deployment environment. Never commit `.clasprc.json`, OAuth tokens, passwords/temporary credentials or live Script/Sheet/Drive identifiers.
- [ ] Move static hosting to a provider that can build from the source repository and publish only the generated `dist/` artifact. Ensure that provider has read access to the repository before changing GitHub visibility.
- [ ] Once the new host is verified and no service depends on root-level GitHub Pages, change the repository to private through GitHub Settings if the plan and deployment integration support it. This manual account-administration step cannot be performed by this repository-only workflow. Public repository copies already made by others cannot be recalled.

## B. Create the customer's Google resources

Use a new empty customer instance only. Never run `setup()` against an existing customer/property as a generic repair step.

1. Create a new Google Sheet named for the customer, owned by the product operator account.
2. Open **Extensions → Apps Script** from that new Sheet so the script is bound to the correct spreadsheet.
3. From a clean checkout of the approved source commit, prepare the local ignored `.clasp.json` using the real script ID shown in Apps Script. For this repository the shape is:

   ```json
   {
     "scriptId": "<confirmed customer Apps Script project ID>",
     "rootDir": "backend",
     "fileExtension": "gs"
   }
   ```

4. Confirm the local Node version is within the repository's supported range (`>=20 <23`), install dependencies, and run `npm run check` plus `npm run test:e2e`.
5. Run `npx clasp status` and `npx clasp deployments`. Verify the bound project identity before writing. On the newly created empty project only, intentionally run `npx clasp push` to upload the **whole split backend source** from `backend/*.gs` plus `appsscript.json`. Do not manually copy only a hypothetical `Code.gs`; the production source is split across numbered files.
6. In Apps Script **Project Settings → Script properties**, set:
   - `OWNER_EMAIL`: the customer's nominated owner/admin login email.
   - `OWNER_PASSWORD`: a temporary password of at least 8 characters that satisfies the code's password policy. Generate it privately; do not put it in this repository or this chat.
   - `OWNER_NAME`: optional display name.
7. From the editor, select and run `setup()` once. Review and approve the requested Google permissions. On a new instance it creates the application tabs, internal receipt/backup folders, defaults and the daily backup trigger. After initial owner creation the temporary `OWNER_PASSWORD` property is removed; the customer owner must change their password on first sign-in.
8. Inspect **Project Settings → Script properties** and the Sheet tabs. Verify the active spreadsheet identity, expected headers/tabs, private folder permissions and backup trigger before proceeding. If anything points at another customer's resources, stop.
9. In **Deploy → New deployment → Web app**, execute as the deploying/product-owner account and allow anonymous HTTP access because the static client cannot rely on the customer's Google login. The API must still authenticate and authorize every application request. Record the exact deployed `/exec` URL and deployment identity in the private register. Do not grant direct data-folder or Sheet access to the customer unless a separate, explicitly agreed data-export requirement needs it.

The deployment endpoint is an address, not an authentication credential; app-level login and server-side authorization must remain mandatory. Do not treat obscurity of the URL as access control.

## C. Build and publish the customer frontend

The root website must not be deployed as-is for a new customer. It contains development/backend material and a `config.js` that is already wired to an unverified endpoint. The builder emits `_headers` for Cloudflare Pages and `.htaccess` for Apache. On Apache, `mod_headers` and overrides must be enabled; verify live response headers and configure the host directly if needed.

1. **Recommended default: Cloudflare Pages, one project per customer.** From the product owner's Cloudflare account, create a new Pages project linked to the private `cash-voucher` repository. Use the repository's current source branch and set the build command to `npm ci && npm run build:web`, the output directory to `dist`, and Node to the supported major version specified by `.nvmrc`. Official guide: https://developers.cloudflare.com/pages/get-started/git-integration/ . A separate project should receive its own generated `*.pages.dev` hostname; verify that the exact hostnames are distinct before onboarding another customer. Confirm current plan limits in the Cloudflare dashboard before scaling.
2. In that project's build settings, set `CV_API_URL` to the exact URL for this instance's **new** Apps Script Web App and set `CV_ENVIRONMENT` explicitly. Use `staging` for the isolated staging site and `production` only for a separate, owner-approved production build. Do not commit the URL into shared `main/config.js`. The URL is a target identifier, not a password; server-side authentication must still protect every action.
3. Use the build command `npm ci && npm run build:web` and publish directory `dist`. The build validates that `CV_API_URL` is an HTTPS Apps Script `/macros/s/<deployment-id>/exec` URL and that `CV_ENVIRONMENT` is explicitly `staging` or `production`; it fails closed when either is missing or malformed.
4. Confirm that the static host can clone/build the repository after the repository is made private. Do not grant the customer GitHub, Cloudflare or Google administrator access. If you switch repository visibility, first ensure the host's private-repository integration is authorized and the existing site is not the only functioning deployment.
5. Verify the published artifact contains the static application assets, generated `config.js`, manifest, service worker, frontend modules and icons—but not `backend/`, `docs/`, `scripts/`, `test/` or development metadata.
6. Record the final HTTPS application URL. Open it in a clean browser/device and confirm that the generated configuration targets this customer's new deployment, not the existing root endpoint.
7. Confirm the host publishes only `dist/`; do not publish the repository root. The customer build emits `_headers` for Cloudflare Pages and `.htaccess` for Apache with the restrictive CSP (including `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, referrer and permissions policies. Apache must allow `mod_headers` and overrides. After deployment, inspect the actual document response in DevTools; generated files do not prove the host applied the headers.

## D. Live acceptance and data recovery proof

Do not issue the customer link as “ready” until each gate is complete against the actual Google instance.

- [ ] Verify initial owner login, mandatory password change and sign-out/re-login.
- [ ] Create individual Manager/Staff accounts using distinct emails and non-shared passwords; verify server-side roles by testing allowed and denied operations.
- [ ] Create a clearly marked synthetic test voucher and receipt, confirm server persistence, receipt preview/access, register/report totals and audit entry, then cancel/clean up only according to the application's supported workflow. No real customer money or sensitive personal data belongs in this test.
- [ ] Confirm the Dashboard/Settings reports the correct customer data source and backup configuration. Manually run `backupData_()` in this new instance to create a first backup now instead of waiting for the daily trigger. Authorize any required email notification scope if requested.
- [ ] Open the backup root in Drive and verify a timestamped snapshot exists, its spreadsheet copy opens, its `receipts/` folder and `receipt-manifest.csv` are present, and the snapshot belongs to this instance.
- [ ] Demonstrate a restore into a **separate recovery Sheet and folder**. Validate expected tabs and headers, row counts, voucher-number counters, users/settings and receipt-ID mapping. Never restore over the only current copy. Record the result/date in the private register.
- [ ] Verify the daily trigger exists and check the next scheduled run and recorded last-success state. A status field alone is not proof of a complete or restorable snapshot.
- [ ] On each intended phone/tablet, test install/PWA update, online save confirmation, receipt capture, brief offline operation, queue visibility, sync after reconnection, and recovery export/import. Keep the device/browser alive until pending records sync; local IndexedDB entries are not included in server backups until synchronized.
- [ ] Test the customer-hosted link on a clean browser. Check browser console/Network for failed requests and CSP violations. Verify the real API endpoint and no access to other customers' resources.
- [ ] Record a customer acceptance date and the operator names in the private register.

If the backup is incomplete, a restore cannot be demonstrated, any role test is incorrect, the endpoint target is uncertain, or an offline entry is unaccounted for, stop handover and resolve it first.

## E. Customer handover

1. Confirm the signed contract and first month's payment status according to the contract. Do not change contract terms in this technical runbook.
2. Give the customer the URL from the verified host—not the repository URL or Apps Script editor URL.
3. Share the initial owner email and temporary password through separate channels. Do not send reusable credentials in a public README, GitHub issue, pull request or source commit.
4. Ask the customer owner to sign in, change the temporary password, confirm access, and create individual operator accounts. Never share a common staff password.
5. Give them `docs/CUSTOMER-QUICK-START-TEMPLATE.md` populated with their actual link and support contact.
6. Explain that the app is a voucher record system, that unsynchronized offline items exist only on the originating device until uploaded, and that they should not clear browser storage or switch devices while pending entries remain.
7. Record the live link, deployed version/source SHA, account-owner email, billing start, backup evidence, restore evidence and customer acceptance in the private register.

## F. Monthly operations and termination

**Each month:** confirm subscription/payment status; check the last successful backup and any error alert; review storage/receipt health; confirm support incidents and whether product updates require a release. Do not deploy automatically when a source PR merges.

**For any backend release:** follow `docs/APPS-SCRIPT-RELEASE-RUNBOOK.md`. Identify the target Script and existing deployment ID, back up first, push the reviewed backend source, perform only approved schema migrations, update the verified existing deployment, and execute live smoke tests. Frontend source release and Apps Script version release are separate operations.

**On cancellation/termination:** follow the signed agreement. Disable user accounts/revoke access as appropriate; provide a customer data export using a verified process; agree on the retention/deletion date; preserve legally or contractually required records; then remove customer site credentials and hosting only after the export/retention obligations are complete. Do not delete the Sheet or Drive backups as the first termination step.

## Completion record

The private instance register must include the customer code, customer/admin email, new Script/project/deployment identity, Sheet and folder identities, unique host origin and URL, source SHA, build/release date, test evidence, backup/restore evidence, support channel, subscription start, next renewal and acceptance status.

**Never store** PINs, OAuth credential JSON, access/refresh tokens, `.clasprc.json` content or any reusable credential in the register or this repository. Store the register in a private operator-controlled location outside the public repository.

### Password authentication and audit logging

Use a temporary password of 8–128 characters for first setup and temporary user credentials. Each user must choose their own password before normal app access. Never share a permanent password between users and never put a password in the instance register. The owner-only Audit Log records successful sign-ins, failed attempts (including unknown email addresses), temporary lockout events, password changes/resets and sign-outs when recorded; it never intentionally stores password values. Treat audit-write health warnings as an unresolved release issue, not as a guarantee that every event was persisted.
