# Cash Payment Vouchers v2

A lightweight, installable PWA for recording cash paid out and cash received at a single property. The web client is hosted as static files; Google Apps Script enforces authentication and permissions; Google Sheets stores records; Google Drive stores receipt images and daily backups.

## Current architecture

```text
index.html
  └── frontend/main.js                 composition root
       ├── frontend/core/               API, state, storage, UI, actions, offline queue
       └── frontend/features/            auth, payments, dashboard, register, bulk,
                                         administration, navigation, printing
style.css · frontend-ui-kit.css · config.js · sw.js · manifest.webmanifest · icons/
backend/*.gs · backend/appsscript.json (split Apps Script source)
test/ · scripts/ · docs/
```

`app.js` is retained in the repository as a legacy artifact but is **not loaded by `index.html`**. The active browser entry point is `frontend/main.js`.

## What exists today

- Email + password login, first-login password change, lockout, six-hour session TTL, and server-side role checks.
- Staff can create entries and see their own; managers can view all entries, edit/cancel, bulk import, and manage vendors; owners can manage users/settings and view the audit log.
- Cash payments and cash receipts with separate number series and categories.
- Receipt images stored in Drive, with access checked by the API.
- Dashboard, searchable/filterable register, CSV export, printing, and CSV/TSV/TXT/pasted-row bulk import with validation.
- Installable PWA and a durable IndexedDB offline outbox. Open tabs broadcast queue changes; stable client IDs support idempotent retries; pending records can be exported and safely re-imported.
- Automated daily Sheet/receipt backup infrastructure, including a manifest and 90-day retention policy in code.

The existence of code and green mock/browser tests does not prove the real property's deployment, scheduled backups, restore drill, phone install/update path, or cash reconciliation have been verified. See `docs/RELEASE-READINESS.md`.

## Frontend design studio

[FrontUI Studio](ui-studio.html) is a static component gallery for the shared palette, spacing/type/radius tokens, buttons, form fields, status treatments, KPI cards and data tables. It loads local CSS only and uses safe sample data; it is a design reference, not an authenticated application route or production data source.

## Customer instance provisioning

Cash Voucher is a single-property application, not a shared multi-tenant database. Every paying customer must receive a distinct Apps Script project/Web App deployment, a dedicated Sheet, private receipt/backup folders, and a static site on its own origin. Do not share one instance or rely on different paths/query strings on the same site to isolate customers: the offline IndexedDB outbox and local storage are origin-wide.

Use the full [Customer Onboarding Runbook](docs/CUSTOMER-ONBOARDING-RUNBOOK.md), [Customer Quick Start Template](docs/CUSTOMER-QUICK-START-TEMPLATE.md), and [Customer Instance Register Template](docs/CUSTOMER-INSTANCE-REGISTER-TEMPLATE.md). The completed register must remain private and outside this repository.

### Provision a new customer backend

1. Create a new dedicated Google Sheet and open **Extensions → Apps Script** from that Sheet so the script is bound to the correct spreadsheet.
2. In a clean checkout, create a local ignored `.clasp.json` using the actual customer Script ID and `rootDir: "backend"`. Keep `.clasp.json` and `.clasprc.json` out of Git.
3. Confirm the target with `npx clasp status` and `npx clasp deployments`. Run `npx clasp push` only after confirming that the target is the new empty customer project. The current backend is split across numbered `backend/*.gs` files; do not copy only an old/single `Code.gs` file.
4. In Apps Script **Project Settings → Script properties**, set `OWNER_EMAIL` to the customer's nominated app-owner email, `OWNER_PASSWORD` to a private temporary non-trivial password of at least 8 characters, and optionally `OWNER_NAME`.
5. Run `setup()` once on that new empty instance and approve required permissions. It creates the expected tabs, receipt/backup folders and daily backup trigger. The temporary `OWNER_PASSWORD` property is removed after the initial owner is created.
6. Deploy the Web App as the product/operator account with the access setting required for the static app (anonymous HTTP access). App-level login and server-side authorization must remain mandatory; never share the raw Sheet or Drive folders with staff.

Do not run `setup()` as a routine upgrade or against an existing populated instance. Follow `docs/APPS-SCRIPT-RELEASE-RUNBOOK.md` for subsequent backend releases and approved migrations.

### Build the static client

The root `config.js` contains the endpoint of an existing instance and is **not a customer template**. Do not point a new customer at that endpoint without independent verification.

Set the customer's exact Apps Script Web App URL as the build environment variable, then run:

```bash
export CV_API_URL='https://script.google.com/macros/s/<verified-staging-deployment-id>/exec'
export CV_ENVIRONMENT='staging'
npm run build:web
```

For an owner-approved production build, use that customer's independently verified endpoint and set `CV_ENVIRONMENT='production'` in a separate build. The build requires both variables, validates the Apps Script `/exec` URL and emits the corresponding environment/deployment identity in generated `dist/config.js`.

The command creates `dist/` containing only the static app shell, styles, frontend modules, icons, manifest, service worker, generated per-instance `config.js`, Cloudflare Pages `_headers` and Apache `.htaccess` security-header files. It excludes the Apps Script backend, source docs, scripts and tests. The endpoint is not a password; the backend must authenticate every action.

Publish **only `dist/`** from the static host. Configure the build command as `npm ci && npm run build:web`, output directory as `dist`, and set both `CV_API_URL` and `CV_ENVIRONMENT` separately for each instance. Use a staging origin distinct from production so browser offline queues and local login state are not shared. Do not publish the repository root or reuse the existing root GitHub Pages origin as an isolation boundary. Cloudflare Pages consumes `_headers`; Apache can use generated `.htaccess` when `mod_headers` and overrides are enabled. Verify actual response headers and configure equivalent host-level settings if needed.

Before creating a customer login or using real financial data, complete the live authentication/role checks, run a real backup, inspect its Sheet/receipt manifest, restore it to a separate recovery destination, and test the actual customer link and offline path. Source tests and GitHub Actions do not replace those live release gates; see `docs/RELEASE-READINESS.md`.

## Development and checks

Install dependencies with Node 20:

```bash
npm ci
npm run check
npm run test:e2e
npm run measure:performance-baseline
```

- `npm run check` runs lint, formatting, JSON validation, JS syntax checks, the frontend release-integrity check, both DOM-sink count/API and source-fingerprint gates, and the mock Apps Script backend suite. `npm test` includes the focused fingerprint-scanner unit test and authenticated authorization matrix.
- `npm run test:e2e` runs the browser suite against the local mock server; it must not use the production API. See `docs/DEVELOPMENT-WORKFLOW.md`.
- `npm run measure:performance-baseline` captures a warm-up plus five samples for bootstrap and recorded-movement reporting at 100, 500 and 1,000 deterministic mock vouchers. Set `CV_PERFORMANCE_BASELINE_OUT=/path/to/baseline.json` to write a machine-readable result; CI uploads this result as an artifact. It is diagnostic mock evidence, not a production SLO.
- CI also runs `npm run audit:secrets` against the current tracked text and reachable Git history for selected credential patterns. It is a bounded detector, not complete security certification.
- The mock Apps Script layer does not replace tests against a real Google account or load/concurrency testing against the live service.

The source inventory is documented in `docs/ACTIVE-DOM-SINK-INVENTORY.md`. The count/API and source-fingerprint gates detect changes that warrant review; neither proves every HTML interpolation is safe. PRs #135–#138 reduced avoidable HTML sinks and added hostile-data regressions; PR #139 fixed legacy-aware approval aggregation without historical VendorID backfill. PR #149's dashboard/navigation refresh was integrated into main, and PR #151 added FrontUI Studio plus the shared CSS kit without changing the active DOM-sink inventory. The mainline remains at 17 assignment sites across eight frontend modules; see `docs/ACTIVE-DOM-SINK-INVENTORY.md` and `docs/SECURITY-RENDERING-AUDIT.md` for the contextual review and limitations.

For local Apps Script development, follow `docs/DEVELOPMENT-WORKFLOW.md` and inspect `clasp status` before every push. Never run `clasp push` or `clasp deploy` without a deliberate backend release decision.

## Offline data and recovery

- Pending transactions live in IndexedDB on that browser/device until they synchronize with Apps Script.
- Export pending transactions if browser storage is unstable or a device must be replaced. Import validates the recovery file and preserves original IDs; matching records are skipped and conflicting IDs with different content are rejected.
- Browser-local records are not part of Google Sheet/Drive backups until synchronized. IndexedDB is not a cross-device backup.
- Backend code installs a scheduled backup trigger. A real successful backup and restore drill still need operational verification.

See `docs/DATA-DURABILITY.md`.

## Product direction

The app is a single-property cash-voucher tool, not a shared multi-tenant platform. PR #165 (route-safe workflows) and PR #166 (customer-specific static packaging and handover foundation) are merged. PR #169 (password authentication and staging-readiness consolidation) is now merged at `8e18b4f3ed8601f70e192b6d32587675ad4cdb7b`; main CI run `39049788835` passed. The source is prepared for an owner-provisioned staging release, but the live staging resources, protected GitHub Environment, customer host, deployment target, backup/restore, real-device acceptance and first customer URL remain unverified. See `docs/STAGING-RELEASE-AUDIT.md` and `docs/RELEASE-READINESS.md`. Pending/rejected or malformed approval-state payments stay out of approved totals and block final cash close until resolved under the approved policy. The accountant export is generic and destination-neutral, not tax-ready. Do not start multi-property, digital-payout or AI/network work before first-customer controls, recovery and economics are validated.

- Product gap register: `docs/PRODUCT-ROADMAP.md`
- UI/UX source review and next design criteria: `docs/UI-UX-REVIEW.md`
- Engineering method: `docs/ENGINEERING-METHOD.md`
- Release checklist: `docs/RELEASE-READINESS.md`
