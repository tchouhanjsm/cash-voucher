# Cash Payment Vouchers v2 — Project Guide

**Repository status:** updated 9 October 2026. The current application is a single-property PWA backed by a Google Apps Script JSON API, Google Sheets, and Google Drive. Production pilot readiness remains unverified.

## 1. Product scope and current feature set

### Implemented in the current source

- Email/PIN authentication, temporary PIN change, cached sessions, account lockout and server-enforced role permissions.
- Staff-owned entries, manager/owner all-entry view, voucher editing/cancellation with reason.
- Payment and cash-received records in independent numbering series.
- Receipt image capture/upload to private Drive storage.
- Dashboard cash summary and category/vendor trends.
- Register filters, print, CSV export, and bulk import with row validation.
- IndexedDB offline outbox, stable client IDs, idempotent retry, cross-tab update broadcasts, non-destructive export and guarded recovery import.
- Daily backup code for Sheet snapshots and receipt copies, manifest creation and retention pruning.
- Owner-only audit API and audit table rendered within Settings.

### Not yet implemented or not verified

- Daily physical cash count, signed close, mismatch resolution, or day-lock.
- Threshold-based approval workflows, accountant read-only role, GST/TDS fields, accounting-system-specific exports, budgets, and recurring entries.
- Dedicated audit-log navigation with search/filter/export; the current owner audit table is inside Settings and returns at most 200 recent events.
- Multi-property tenancy, vendor/price network, OCR, digital payouts, anomaly-learning models or hosted SaaS operations.
- Real Google-account security review, real-device usability/accessibility audit, production backup/restore drill, and hotel pilot/cash reconciliation.

Do not treat strategic ideas in the review document as agreed requirements. The prioritized gap register is in `docs/PRODUCT-ROADMAP.md`.

## 2. Runtime architecture

```text
index.html ──loads──> frontend/main.js
                         │
                         ├── frontend/core/
                         │    actions.js · api.js · dom.js · form-options.js
                         │    offline-queue.js · state.js · storage.js · ui.js · utils.js
                         │
                         └── frontend/features/
                              auth.js · payments.js · dashboard.js · register.js
                              bulk.js · administration.js · navigation.js · printing.js
                                      │
                                      ▼
                              backend/Code.gs (Apps Script JSON API)
                                  ├── Google Sheet tabs
                                  └── private Drive receipt/backup folders
```

`app.js` remains in the repository but is not an active runtime import. The source tree is modular; do not restart the old one-module-per-PR extraction plan.

## 3. Data model

| Sheet      | Purpose                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Users`    | User ID, name, email, role, active flag, per-user salt/hash, forced PIN change, timestamps                                    |
| `Vouchers` | Payments/receipts, separate type and number series, notes, status, actor/timestamps, receipts, cancellation reason, client ID |
| `Vendors`  | Vendor identity/contact and active status                                                                                     |
| `Settings` | Property details, categories, numbering counters, opening balance                                                             |
| `AuditLog` | Timestamp, user, action, target and details                                                                                   |

Dates are normalized by the API. Monetary inputs are validated and rounded to two decimal places in the current backend. A future ledger redesign should use integer minor units and explicit currency at the domain boundary; do not change the current API or persisted schema as an incidental refactor.

## 4. Security and data boundaries

- `backend/appsscript.json` sets `executeAs: USER_DEPLOYING` with anonymous Web App access for the static frontend. Access is anonymous at the HTTP deployment layer only; all non-login actions require a valid app session and server-side permission checks.
- Keep the Sheet, receipt folder and backup folder private. Staff must not receive direct Sheet/Drive edit access.
- PINs are hashed using HMAC-SHA256 with per-user salt and a script-property pepper. The temporary PIN is removed after initial owner setup.
- Server writes use Apps Script ScriptLock; idempotency keys prevent duplicate vouchers after retry.
- PIN/session changes rotate the user's salt so cached sessions tied to the old salt are rejected.
- Audit records are appended best-effort by `audit_`; this is not yet a tamper-evident/append-only financial ledger.
- Current v2 tree does not contain the old review's cited `src/01_Config.js` or `03_Auth.js` files. This does not prove that reported values never existed elsewhere; if those reported credentials were ever used, rotate the deployed owner PIN. No Git history rewrite has been performed.

Phase 22 serializes login failure counting and throttles repeated current-PIN failures. The mock tests check that the lock path is called and lockout behavior is enforced; the mock does not simulate real concurrent requests.

## 5. Develop, test, release

```bash
npm ci
npm run check
npm run test:e2e
```

`npm run check` includes lint, Prettier, JSON/syntax checks, frontend release integrity and the mock backend tests. Browser E2E uses the local mock API. Neither is a production Google-account test.

Only `backend/` belongs in Apps Script via clasp. Inspect `clasp status` first. A backend source merge does not deploy it; deployment requires a separate, deliberate release step. See `docs/DEVELOPMENT-WORKFLOW.md` and `docs/RELEASE-READINESS.md`.

## 6. Durability

The offline outbox only protects pending work on the same browser/device, while a Sheet/Drive backup protects already-synced work. Automated daily backup infrastructure is present in code, but the live trigger's successful execution and a full restore drill have not been verified here. See `docs/DATA-DURABILITY.md`.

## 7. Phase history and next decision

- PRs #12–14 hardened backend validation, schema/number reconciliation and retry idempotency.
- PRs #15–16 improved PWA shell/release-integrity checks and browser E2E.
- PR #17 added backend backup infrastructure.
- PRs #18–21 added durable offline queue, pending export/recovery import, and cross-tab/migration reliability.
- Phase 22 addresses authentication lockout concurrency and updates stale documentation based on the supplied review.

Next proposed slice, **after Phase 22 is reviewed and merged**, is a product-design pass for daily cash close: opening/book balance, physical denomination count, variance reason, day seal and post-close correction audit. No Phase 23 work begins until the current PR has been reviewed and merged by the owner.
