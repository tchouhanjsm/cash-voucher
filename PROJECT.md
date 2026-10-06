# Cash Payment Vouchers v2 — Project Guide

Status as of 6 Oct 2026. A free, installable web app for recording cash paid out and cash received, with receipts, roles, bulk upload and a dashboard. Website on **GitHub Pages**, data in **Google Sheets**, receipt photos in **Google Drive**, logic in a small **Google Apps Script (GAS) API**.

---

## 1. What we did and achieved

| Step                                                       | Outcome                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Reviewed the original GAS app (`tchouhanjsm/cash-voucher`) | PIN login, same-day multi-entry, register, edit/cancel, vendors, print voucher, users, Sheets storage                   |
| v1 (static, browser-only)                                  | Same features hosted on GitHub Pages, data in browser storage + JSON backup. Safe to try, but data was per-device       |
| Product review                                             | Found gaps: no shared data across devices, no real roles, no receipts, not installable, multi-tab overwrite risk        |
| v2 (this project)                                          | Google Sheet as database, server-enforced roles, receipt photos, bulk upload, dashboard, installable app, offline queue |
| Cash received                                              | Receipts in their own series (R-1, R-2…), own categories, opening balance, **cash in hand** on the dashboard            |
| Dev workflow                                               | clasp for local development → Apps Script; git for the website → GitHub Pages                                           |
| Testing                                                    | 54 backend checks (Code.gs run against a mock of Google services) + 26 headless-browser end-to-end checks               |

### Feature list

- **Login:** email + 6-digit PIN, forced PIN change on first login, 5 wrong tries = 15-minute lock, 6-hour sessions, auto sign-out after 30 minutes idle.
- **Roles (enforced on the server):**
  - _Staff_ — add payments/receipts + photos, see own entries only.
  - _Manager_ — also see all, edit, cancel (with reason), bulk upload, vendors, full dashboard.
  - _Owner_ — also users, settings (categories, opening balance, numbering), audit log.
- **Cash paid / cash received** with separate numbering and categories; printable A5 voucher with amount in Indian words (Lakh/Crore).
- **Receipt photos:** camera or gallery on mobile, compressed on the phone (about 200–400 KB), up to 3 per voucher, stored privately in Drive.
- **Bulk upload:** CSV, Excel (.xlsx) or pasted rows → preview with per-row errors and duplicate detection → import in batches of 100.
- **Dashboard:** paid, received, net, cash in hand, trend chart, top payees, categories, sources of cash, by team member; presets + custom range.
- **Register:** search, filters (type, vendor, category, user, dates, status), CSV export, print.
- **Offline:** entries made without internet are stored on the device and uploaded automatically when back online; duplicates are prevented.
- **Installable:** works as a home-screen app on Android and iPhone.
- **Audit log** of logins, changes, cancellations, permission denials.

---

## 2. Architecture

```
 Phone / desktop browser (installed PWA)
   index.html · app.js · style.css · sw.js · manifest        ← GitHub Pages (static, free)
        │  HTTPS POST  (JSON body, no custom headers)
        ▼
 Google Apps Script Web App  =  backend/Code.gs               ← the "API"
   • authenticates (token in Script Cache)
   • checks role permissions
   • validates + sanitises input
   • takes a lock for every write
        │                         │
        ▼                         ▼
 Google Sheet (database)     Google Drive folder (receipt images)
  Users · Vouchers · Vendors · Settings · AuditLog
```

**Why this shape**

- GitHub Pages can only serve static files, so it can't hold secrets or enforce roles. Roles must live where users can't tamper with them, so the Apps Script API does the checks.
- The Sheet is the database: you can open, filter, chart or back it up yourself.
- The script runs as the owner ("Execute as: Me"), so staff never need access to the Sheet or Drive.
- Requests are sent as plain text with no custom headers. That avoids a CORS preflight request, which Apps Script can't answer.

### Repository layout

```
index.html  app.js  style.css  sw.js  config.js  manifest.webmanifest  icons/   → website (repo root, served by Pages)
backend/Code.gs  backend/appsscript.json                                         → pushed to Apps Script with clasp
test/                                                                            → mock Google services + tests
README.md  PROJECT.md                                                            → docs
.clasp.json.example  → copy to .clasp.json (git-ignored): {"scriptId":"…","rootDir":"backend","fileExtension":"gs"}
.gitignore  .nojekyll  package.json  .github/workflows/test.yml                  → repo hygiene + CI (runs the tests on every push)
```

### Data model (Google Sheet tabs)

| Tab      | Columns                                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users    | UserID, Name, Email, Role, Active, Salt, PinHash, MustChangePin, CreatedAt, LastLogin                                                                                                          |
| Vouchers | VoucherID, VoucherNo, Date, Vendor, Amount, Category, Notes, Status, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt, Receipts (Drive file IDs), CancelReason, ClientID, Type (`PAYMENT`/`RECEIPT`) |
| Vendors  | VendorID, Name, Company, Mobile, Active, CreatedBy, CreatedAt                                                                                                                                  |
| Settings | Key/Value: property name, address, categories, receipt categories, next voucher no, next receipt no, opening balance                                                                           |
| AuditLog | Time, User, Action, Target, Details                                                                                                                                                            |

Dates are stored as text `yyyy-mm-dd` (the Date column is formatted as plain text) so Sheets never reinterprets them.

---

## 3. Setup

### A. Backend (Sheet + Apps Script)

1. Create an empty Google Sheet.
2. **Extensions → Apps Script**; paste `backend/Code.gs` (or use clasp, section C).
3. **Project Settings → Script properties:** add `OWNER_EMAIL`, `OWNER_PIN` (temporary 6 digits) and optionally `OWNER_NAME`.
4. Run function **`setup`**, approve permissions. It creates the tabs, the Drive folder, the owner user, and **deletes `OWNER_PIN`**.
5. **Deploy → New deployment → Web app:** Execute as **Me**, access **Anyone**. Copy the URL.

### B. Website (GitHub Pages)

1. Push the repo to GitHub (`git init -b main; git add .; git commit; git remote add origin …; git push -u origin main`).
2. **Settings → Pages → Deploy from a branch → main / (root).**
3. Put the Web app URL in `config.js` (`API_URL`) and push, or paste it once on the login screen.
4. Open the site, sign in as the owner, set your own PIN, then **Users** → add managers and staff.
5. On phones: Android → Install app; iPhone → Share → Add to Home Screen.

### C. Local development with clasp

```
npm i -g @google/clasp         # one time
clasp login                    # one time; enable the Apps Script API at script.google.com/home/usersettings
cp .clasp.json.example .clasp.json   # then put your script ID in it (fileExtension "gs" keeps Code.gs from becoming Code.js)
clasp pull                     # first time only, if the script already has code; or: clasp create --type sheets --rootDir backend
clasp push --watch             # upload backend/ on save
clasp deployments              # copy the deployment ID (AKfy…)
clasp deploy -i <ID> -d "msg"  # release a new version, same URL
```

- Only `backend/` is pushed, so only `.gs`, `.html` and `appsscript.json` ever reach Apps Script.
- Don't edit in the web editor after adopting clasp (or `clasp pull` first).
- Script properties are not pushed by clasp; set them once in the editor.

### D. Everyday workflow

```
node test/test-backend.js         # backend tests (no Google account needed)
clasp push                        # backend → Apps Script
clasp deploy -i <ID> -d "msg"     # release the backend
git add . && git commit -m "msg" && git push   # website goes live in ~1 minute
```

Upgrading an older Sheet: paste the new `Code.gs`, run `setup` again (it adds any new columns), then deploy a new version.

---

## 4. How `Code.gs` works

### Request flow

1. `doPost(e)` parses the JSON body `{action, token, …}` and calls `route_`.
2. `route_`:
   - `login` is the only action allowed without a token.
   - Every other action goes through `auth_(token)`: the token must exist in the Script Cache, the user must still be active, and the user's salt must match the session (so a PIN change or reset ends old sessions).
   - If the account must change its PIN, only `changePin`/`logout` are allowed.
   - Actions in `WRITES` run under `LockService` so two phones can't hand out the same voucher number.
3. The action function (listed in `ACTIONS`) runs and the result is returned as `{ok:true,data}` or `{ok:false,error,code}`. Unexpected errors are logged and shown to users only as a generic message.

### Main pieces

| Piece                                                                               | What it does                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CFG`, `PERMS`                                                                      | Limits (bulk 500, 25 per normal save, 3 receipts, amount cap, lockout) and the role → permission table                                                                                                             |
| `setup()`                                                                           | Idempotent installer: tabs/headers, pepper secret, Drive folder, default settings, owner account; removes the temporary PIN                                                                                        |
| `readAll_/appendRows_/updateRow_`                                                   | Tiny data-access layer: rows as objects keyed by header names; new rows are written in a single `setValues` call                                                                                                   |
| `login_`, `auth_`                                                                   | PIN check, failed-attempt counter (cache), session token (cache, 6 h)                                                                                                                                              |
| `hashPin_`                                                                          | HMAC-SHA256 of `salt:pin` with a secret **pepper** kept in Script Properties, so a leaked Sheet can't be brute-forced offline (6-digit PINs are otherwise weak)                                                    |
| `can_/need_`                                                                        | Permission checks; denied attempts are written to the audit log                                                                                                                                                    |
| `bootstrap_`                                                                        | One call that returns the user, settings, vendors and the vouchers that user may see (staff: their own only)                                                                                                       |
| `createVouchers_`                                                                   | Validates every row first; skips rows whose `clientId` already exists (safe retries / offline sync); numbers payments and receipts from separate counters; saves receipt images to Drive; appends all rows at once |
| `updateVoucher_`, `cancelVoucher_`                                                  | Edit / cancel (a reason is required; cancelled vouchers keep their row and number)                                                                                                                                 |
| `addReceipt_`, `getReceipt_`                                                        | Add a photo (max 3) or fetch one as a data URL, only if the caller may see that voucher                                                                                                                            |
| `saveVendor_`, `saveUser_`, `resetPin_`, `changePin_`, `saveSettings_`, `auditLog_` | Master data and admin; the last active owner can't be demoted or disabled                                                                                                                                          |
| `clean_`                                                                            | Strips control characters and neutralises leading `= + - @` so text can't become a spreadsheet formula                                                                                                             |

### Security notes

- No secrets in the code; the pepper and Drive folder ID live in Script Properties.
- All validation is repeated on the server; the page is never trusted.
- Receipts are never public; they are streamed through the API after a permission check.
- The web app URL is public by design (access: Anyone); every action except `login` needs a valid session.
- The audit log records who did what and when.

---

### Avoiding GAS / clasp conflicts (checklist)

- `.clasp.json` must contain `"rootDir": "backend"` **and** `"fileExtension": "gs"`; otherwise `clasp pull` creates `Code.js` beside `Code.gs` and the two copies fight.
- Keep only `Code.gs` + `appsscript.json` in `backend/`; run `clasp status` before every push.
- The script must be **bound to the Sheet** (Extensions → Apps Script, or `clasp create --type sheets`). For a standalone script add Script property `SS_ID`.
- `clasp push` updates the _editor copy_ only; the live web app changes after `clasp deploy -i <ID>` (never deploy without `-i`, it creates a new URL).
- Script properties (`OWNER_EMAIL`, `OWNER_PIN`) are never pushed by clasp; set them once in the editor.
- Text columns are forced to plain text by `setup()` so Sheets can't convert notes/phones/timestamps; re-run `setup` after upgrading.
- Don't edit `Code.gs` in the web editor while using clasp (or run `clasp pull` first).
- Pages publishes the whole repo, including `backend/` and `test/`; they contain no secrets. Never commit `.clasprc.json` (git-ignored).

## 5. Limits and known trade-offs

- Apps Script adds about 1–3 seconds per request and has daily quotas, plenty for one property, not for a chain.
- No live updates between devices; screens refresh on open or when you tap Refresh.
- The whole Vouchers list is loaded into the browser. This is fine for several thousand rows; very large histories need paging or archiving.
- Receipt images pass through the script as base64 (kept small by compressing on the phone).
- The Excel reader loads from a CDN, so .xlsx upload needs internet (CSV works offline).
- Free-tier limits of Google services can change; check them occasionally.

---

## 6. Future of the project

**Near term (small, high value)**

- Daily **cash closing**: count the drawer, record the difference, lock the day.
- **Approval** for large payments (above a limit, a manager approves).
- Monthly **PDF / Excel report** and a weekly automatic backup email.
- Voucher **sequence per year / branch** and a configurable print layout and logo.
- **Void and reissue** flow, vendor-wise statements, recurring payments.

**Medium term**

- **Multi-property** support (one Sheet per property with a property switcher).
- **Budgets and alerts** per category ("fuel is at 90% of this month's budget").
- **Reconciliation** with bank / UPI statements via CSV import.
- OCR of receipt photos to pre-fill amount and vendor.
- Notifications (WhatsApp / email) for approvals and daily summary.

**If it outgrows Apps Script**

- Move the API to **Supabase** (Postgres + row-level security + storage + realtime) or a small Node service, keeping the same front end and the same action names. Data can be exported from the Sheet as CSV and imported once. Benefits: faster responses, live sync, proper per-user logins, no daily script quotas.
- Keep the Google Sheet as a read-only nightly mirror for easy reporting.
- Add proper per-user accounts (email links or Google sign-in) instead of PINs, and 2-step approval for owners.

**Engineering hygiene**

- Add a GitHub Action that runs `node test/test-backend.js` on every push.
- Version the API (`apiVersion` in bootstrap) so old installed apps are told to refresh.
- Split `app.js` into modules once it grows past a few thousand lines.
