# Cash Payment Vouchers v2 — GitHub Pages + Google Sheet

Installable web app (works on phone, tablet, desktop). Your **Google Sheet is the database**, receipt photos go to **Google Drive**, the site is hosted free on **GitHub Pages**.

```
index.html style.css app.js sw.js config.js manifest.webmanifest icons/   ← the website (repo root)
backend/Code.gs  backend/appsscript.json                                   ← paste into Apps Script
test/                                                                      ← optional automated tests
```

## One-time setup (≈10 minutes)

### 1) Backend (Google Sheet + Apps Script)

1. Create a new empty Google Sheet (e.g. "Cash Vouchers DB").
2. **Extensions → Apps Script**. Delete the sample code, paste all of `backend/Code.gs`.
   (Optional: Project Settings → tick "Show appsscript.json" and paste `backend/appsscript.json`.)
3. **Project Settings → Script properties → Add**:
   - `OWNER_EMAIL` = your email · `OWNER_PIN` = a temporary 6-digit PIN · `OWNER_NAME` = your name (optional)
4. Select function **`setup`** → **Run** → approve the permissions (Sheets + Drive). It creates the tabs, a Drive folder for receipts, your owner login, and **deletes OWNER_PIN** afterwards.
5. **Deploy → New deployment → Web app** → Execute as: **Me** · Who has access: **Anyone** → Deploy → copy the **Web app URL**.
   _When you change Code.gs later: Deploy → Manage deployments → ✏️ → Version: New version._

### 2) Website (GitHub Pages)

1. New GitHub repo → upload the contents of this folder (web files at the repo root).
2. Edit `config.js` and paste the Web app URL into `API_URL` (or skip and type it once on the login screen).
3. Repo **Settings → Pages → Deploy from a branch → main / (root)**. Your site: `https://<user>.github.io/<repo>/`.

### 3) First sign-in

Open the site → sign in with OWNER_EMAIL + temporary PIN → you're forced to choose your own PIN.
Then **Users** → add managers/staff with temporary PINs (they must change it at first login).

## Cash received (new)

New Payment page → toggle **Cash received**. Receipts get their own series (R-1, R-2…), their own categories, can carry a photo, print as _Cash Receipt Voucher_, and can be bulk-uploaded (toggle on the Bulk page). Dashboard shows **Cash in hand = opening balance + received − paid**; owners set the opening balance, categories and next numbers in Settings.

## Put it on GitHub (pick one)

**A. Browser only (easiest):** github.com → **+ → New repository** (name e.g. `cash-voucher-web`, Public) → **uploading an existing file** → unzip this package on your computer, drag **everything inside the folder** (index.html, app.js, … icons, backend, test) into the page → **Commit changes**. Then Settings → Pages → _Deploy from a branch_ → `main` / `(root)`.
**B. Command line:**

```
cd cash-voucher-v2
git init -b main
git add .
git commit -m "Cash vouchers v2"
git remote add origin https://github.com/<you>/cash-voucher-web.git
git push -u origin main
```

To update later: change files → `git add . && git commit -m "update" && git push` (or edit/upload on github.com). Pages refreshes in ~1 minute; reload the app twice on phones to pick up the new version.
If you already deployed an older version: paste the new `Code.gs`, run `setup` once more, then **Deploy → Manage deployments → ✏️ → New version**.

## Install on phones

- **Android/Chrome:** menu → _Install app_. **iPhone/Safari:** Share → _Add to Home Screen_.

## Roles

|                                                                    | Staff    | Manager | Owner |
| ------------------------------------------------------------------ | -------- | ------- | ----- |
| Add payments + attach receipts                                     | ✔        | ✔       | ✔     |
| See entries                                                        | own only | all     | all   |
| Edit / cancel vouchers, bulk upload, vendors, dashboard (all data) | –        | ✔       | ✔     |
| Users, settings, categories, audit log                             | –        | –       | ✔     |

Permissions are enforced **on the server** (Apps Script), not just hidden in the page.

## Good to know

- Receipts are compressed on the phone (~200–400 KB), stored in Drive folder _Cash Voucher Receipts_, and shown only to people allowed to see that voucher.
- Offline: payments entered without internet are saved on the device and uploaded automatically when back online (duplicates are prevented).
- Apps Script is ~1–3 s per request and has daily quotas — plenty for one property.
- Don't edit the Vouchers/Users sheets by hand unless you know the columns; use the app. Reading/filtering/charting the Sheet yourself is always fine.
- Back up: File → Make a copy of the Sheet occasionally (and the Receipts folder in Drive).

## Tests (optional)

`node test/test-backend.js` — runs Code.gs against a mock of Google services (71 checks).
`test/run-e2e.sh` — headless-browser run of the whole app (needs Python Playwright).

## Developing with clasp (local → Apps Script)

```
npm i -g @google/clasp && clasp login          # enable the Apps Script API once: script.google.com/home/usersettings
cp .clasp.json.example .clasp.json              # put your Script ID inside (keeps "rootDir":"backend","fileExtension":"gs")
clasp status                                    # must list only Code.gs + appsscript.json
clasp pull                                      # first time only, if the script already contains code
npm test && clasp push                          # test, then upload   (clasp push --watch to auto-upload)
clasp deployments                               # copy the AKfy… id once
clasp deploy -i AKfy… -d "message"              # release; keeps the same URL
```

See PROJECT.md → "Avoiding GAS / clasp conflicts".
