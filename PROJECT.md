# Cash Payment Vouchers v2 — Project Guide

**Repository status:** audited 17 October 2026 against main `8e18b4f3ed8601f70e192b6d32587675ad4cdb7b` (PR #169 merged). Source CI passed on the merge commit; CI, Browser E2E and Full Flight Test also passed on PR #169's exact pre-merge head. The product is source-ready for owner-provisioned staging, but it is **not live-staging-verified or first-customer-ready** until the operational gates in `docs/STAGING-RELEASE-AUDIT.md` pass.

## 1. Product scope and current feature set

### Implemented in the current source

- Email + password authentication, first-login password change, short legacy-credential compatibility guarded by the explicit migration marker, session invalidation on credential change, rate limits and server-side role checks.
- Staff-owned entry visibility; manager/owner all-entry view; voucher edit/cancellation with reasons and attributed audit history.
- Cash payments and receipts with separate number series, receipt access checks, bulk import and searchable/register/report flows.
- Independent approval for new PAYMENT vouchers of INR 10,000 or more; creator cannot self-approve. Unapproved/rejected/malformed approval states are excluded from approved totals and block final cash close.
- Daily Cash Close MVP with recorded cash totals, physical count, variance reason, immutable close snapshot and attributed correction notes.
- Accountant report-only role and generic Recorded Movement CSV export. This is not destination-certified accounting software integration or tax advice.
- IndexedDB offline outbox, stable client IDs, idempotent retry, endpoint/account binding, cross-tab updates, non-destructive export and guarded recovery import.
- Daily Sheet/receipt backup code, manifests, retention policy, integrity diagnostics and owner-facing monitoring exports.
- Shared UI kit and static FrontUI Studio; responsive workflow composition; login and form accessibility/error-state checks.
- Customer-specific static build to `dist/`, URL validation, Cloudflare Pages security-header artifact, isolated staging/UAT workflow and onboarding/release runbooks.

### Not implemented or not verified

- **Live staging and first-customer operation:** no independently verified isolated Apps Script project, Sheet, Drive folders, static hosting origin, protected GitHub Environment or credentialed staging UAT is evidenced by this repository audit.
- **Recovery proof:** live scheduled-backup success, restore into a separate recovery destination, row-count/voucher-number reconciliation and receipt restoration have not been witnessed.
- **Live access/security verification:** deployed Script/version, execution identity, real Owner/Manager/Staff/Accountant authorization, receipt privacy, host response headers, OAuth/environment protection and service quotas/concurrency remain unverified.
- **Human QA:** actual phone/tablet PWA install/update and offline recovery, 200–400% zoom/reflow, manual keyboard traversal, screen-reader output, print/export behavior and the 14-day controlled pilot remain outstanding.
- **Remaining application hardening:** 17 active `innerHTML` assignment sites across eight frontend modules still require contextual, sink-by-sink review. Existing inventory/fingerprint and hostile-input tests are regression controls, not XSS certification.
- **Audit durability:** audit append and its Script Properties failure marker can fail together; this is not a tamper-evident ledger and there is no durable fallback for that double-failure case.
- **Security trade-offs still to review:** current password hashing uses salted HMAC-SHA256 plus a Script Properties pepper, not a memory-hard KDF; per-email temporary lockout can also be abused to deny a known account access. Review these before production without weakening brute-force controls by accident.
- **Product decisions still deferred:** any destination-specific accounting import/tax logic needs accountant-approved mapping; denomination-level cash counts and performance/usability targets remain subject to pilot evidence.

Do not treat roadmap proposals as agreed requirements. The prioritized source and operational gaps are in `docs/PRODUCT-ROADMAP.md` and `docs/FINAL-REPOSITORY-AUDIT-2026-10-17.md`.

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
                              backend/*.gs (numbered Apps Script files; backend/30-entry.gs owns doGet/doPost/route_)
                                  ├── Google Sheet tabs
                                  └── private Drive receipt/backup folders
```

`app.js` remains in the repository but is not an active runtime import. The source tree is modular; do not restart the old one-module-per-PR extraction plan.

## 3. Data model

| Sheet      | Purpose                                                                                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Users`    | User ID, name, email, role, active flag, per-user salt/hash, mandatory password change, timestamps                                    |
| `Vouchers` | Payments/receipts, separate type and number series, notes, status, actor/timestamps, receipts, cancellation reason, client ID |
| `Vendors`  | Vendor identity/contact and active status                                                                                     |
| `Settings` | Property details, categories, numbering counters, opening balance                                                             |
| `AuditLog` | Timestamp, user, action, target and details                                                                                   |

Dates are normalized by the API. Monetary inputs are validated and rounded to two decimal places in the current backend. A future ledger redesign should use integer minor units and explicit currency at the domain boundary; do not change the current API or persisted schema as an incidental refactor.

## 4. Security and data boundaries

- `backend/appsscript.json` sets `executeAs: USER_DEPLOYING` with anonymous Web App access for the static frontend. Access is anonymous at the HTTP deployment layer only; all non-login actions require a valid app session and server-side permission checks.
- Keep the Sheet, receipt folder and backup folder private. Staff must not receive direct Sheet/Drive edit access.
- Passwords are hashed using HMAC-SHA256 with per-user salt and a Script Properties pepper; this is the current algorithm, not a memory-hard password KDF. The temporary PIN is removed after initial owner setup.
- Server writes use Apps Script ScriptLock; idempotency keys prevent duplicate vouchers after retry.
- PIN/session changes rotate the user's salt so cached sessions tied to the old salt are rejected.
- Audit records are appended best-effort by `audit_`; this is not yet a tamper-evident/append-only financial ledger.
- Current v2 tree does not contain the old review's cited `src/01_Config.js` or `03_Auth.js` files. This does not prove that reported values never existed elsewhere; if those reported credentials were ever used, rotate the deployed owner PIN. No Git history rewrite has been performed.

Authentication controls already present in source serialize login failure counting under ScriptLock, throttle incorrect current-PIN attempts for 15 minutes, clear login/PIN-change counters on owner PIN reset, and authenticate write sessions after lock acquisition. This mock suite does not simulate real concurrent Apps Script requests; the current Phase 22 regression batch injects session invalidation at that boundary to verify fail-closed behavior without writing a voucher.

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

- The application is modular at runtime: `index.html` loads `frontend/main.js`; numbered `backend/*.gs` files are the active Apps Script source. Root `app.js` is a legacy artifact and is intentionally not loaded by the active shell; do not delete it without a separate, reviewed compatibility/removal change.
- Functional, resilience, rendering, UI kit, reporting, responsive-screen and release-packaging source phases through Phase 39 are merged. PR #169 (merged at `8e18b4f3ed8601f70e192b6d32587675ad4cdb7b`) changes authentication from PIN to password and consolidates password-based staging/UAT guidance.
- The main-merge CI run `39049788835` passed. Before merge, PR #169's exact source head passed CI, Browser E2E and Full Flight Test. Neither result proves live Apps Script/Sheets/Drive behavior.
- The next step is **not another speculative feature phase**: provision isolated staging resources with the owner, run guarded staging UAT, verify role/access boundaries and a witnessed backup/restore, then complete device/accessibility checks and a controlled 14-day pilot.
- Optional denomination-level physical cash counts remain an owner decision after observing the current Daily Cash Close workflow. Do not add schema fields or make these mandatory without an explicit product decision.
