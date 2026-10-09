# Cash Payment Vouchers v2

A lightweight, installable PWA for recording cash paid out and cash received at a single property. The web client is hosted as static files; Google Apps Script enforces authentication and permissions; Google Sheets stores records; Google Drive stores receipt images and daily backups.

## Current architecture

```text
index.html
  └── frontend/main.js                 composition root
       ├── frontend/core/               API, state, storage, UI, actions, offline queue
       └── frontend/features/            auth, payments, dashboard, register, bulk,
                                         administration, navigation, printing
style.css · config.js · sw.js · manifest.webmanifest · icons/
backend/Code.gs · backend/appsscript.json
test/ · scripts/ · docs/
```

`app.js` is retained in the repository as a legacy artifact but is **not loaded by `index.html`**. The active browser entry point is `frontend/main.js`.

## What exists today

- Email + PIN login, first-login PIN change, lockout, six-hour session TTL, and server-side role checks.
- Staff can create entries and see their own; managers can view all entries, edit/cancel, bulk import, and manage vendors; owners can manage users/settings and view the audit log.
- Cash payments and cash receipts with separate number series and categories.
- Receipt images stored in Drive, with access checked by the API.
- Dashboard, searchable/filterable register, CSV export, printing, and CSV/Excel/pasted bulk import with validation.
- Installable PWA and a durable IndexedDB offline outbox. Open tabs broadcast queue changes; stable client IDs support idempotent retries; pending records can be exported and safely re-imported.
- Automated daily Sheet/receipt backup infrastructure, including a manifest and 90-day retention policy in code.

The existence of code and green mock/browser tests does not prove the real property's deployment, scheduled backups, restore drill, phone install/update path, or cash reconciliation have been verified. See `docs/RELEASE-READINESS.md`.

## One-time backend setup

1. Create a dedicated Google Sheet and open **Extensions → Apps Script**.
2. Add the backend source from `backend/Code.gs` and set the manifest from `backend/appsscript.json` if needed.
3. In **Project Settings → Script properties**, set `OWNER_EMAIL` and a temporary, non-trivial six-digit `OWNER_PIN`; optionally set `OWNER_NAME`.
4. Run `setup` and approve the required Sheets/Drive permissions. Setup creates the data tabs, receipt/backup folders, backup trigger and initial owner. On successful owner creation, the temporary `OWNER_PIN` property is removed; the user must change the PIN at first sign-in.
5. Deploy a Web App that executes as the deploying account. Anonymous HTTP access is needed for the static GitHub Pages client, but the app must authenticate each action itself. **Keep the underlying Sheet and Drive folders private; do not grant staff direct access.**
6. Record the Web App URL for the frontend.

When a backend change is merged, it is still only source code: production changes require an intentional `clasp push` and new Apps Script deployment version. Do not deploy automatically just because a frontend PR merged.

## Website setup

1. Push this repository to GitHub.
2. In repository **Settings → Pages**, publish from `main` / repository root.
3. Set the Apps Script Web App URL in `config.js` (`API_URL`), commit, and wait for Pages to publish.
4. Open the Pages URL, sign in as owner, change the temporary PIN, and add individual manager/staff accounts.
5. Verify the deployed version using a clean browser before using real financial records.

## Development and checks

Install dependencies with Node 20:

```bash
npm ci
npm run check
npm run test:e2e
```

- `npm run check` runs lint, formatting, JSON validation, JS syntax checks, the frontend release-integrity check, and the mock Apps Script backend suite.
- `npm run test:e2e` runs the browser suite against the local mock server; it must not use the production API. See `docs/DEVELOPMENT-WORKFLOW.md`.
- The mock Apps Script layer does not replace tests against a real Google account or load/concurrency testing against the live service.

For local Apps Script development, follow `docs/DEVELOPMENT-WORKFLOW.md` and inspect `clasp status` before every push. Never run `clasp push` or `clasp deploy` without a deliberate backend release decision.

## Offline data and recovery

- Pending transactions live in IndexedDB on that browser/device until they synchronize with Apps Script.
- Export pending transactions if browser storage is unstable or a device must be replaced. Import validates the recovery file and preserves original IDs; matching records are skipped and conflicting IDs with different content are rejected.
- Browser-local records are not part of Google Sheet/Drive backups until synchronized. IndexedDB is not a cross-device backup.
- Backend code installs a scheduled backup trigger. A real successful backup and restore drill still need operational verification.

See `docs/DATA-DURABILITY.md`.

## Product direction

The app is currently a single-property cash-voucher tool, not a hosted multi-tenant fintech platform. The next owner-value priorities are a controlled daily cash close/reconciliation workflow, better exception/approval controls, accountant-friendly exports, and a measured accessibility/UI review. Do not start a multi-property, digital-payout, or AI/network build before users, controls, regulatory requirements, and economics are validated.

- Product gap register: `docs/PRODUCT-ROADMAP.md`
- UI/UX source review and next design criteria: `docs/UI-UX-REVIEW.md`
- Engineering method: `docs/ENGINEERING-METHOD.md`
- Release checklist: `docs/RELEASE-READINESS.md`
