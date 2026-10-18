# Master template runbook

The master template is a **blank Google Sheet with the backend script bound to it**. Clients receive their own copy through a Google "make a copy" link, so they never install tools and never see this repository. The repository stays the source of truth: the template can always be rebuilt from it.

## Rules

1. Owned by a **dedicated Google account** (for example `cv-template@gmail.com`) with 2-step verification and recovery details. Add a second operator account as Editor so one lost account does not lose the template.
2. **Blank.** Do not run `setup()`, do not add Script Properties, do not deploy. The client's copy runs `setup()` once.
3. Never share it as "anyone with the link": anyone who can copy it receives the backend code. Share to one client's email as **Viewer**, then remove them after they copy.
4. Never use the template as a live Sheet and never put client data in it.
5. Record the template Sheet ID, Script ID and source commit in the private instance register.

## Create it (one time)

1. Create the dedicated Google account. Sign in on a separate browser profile.
2. Google Sheets → blank spreadsheet named `Cash Voucher TEMPLATE v1 (<commit>)`.
3. **Extensions → Apps Script**. Note the Script ID (Project Settings).
4. Load the code. Use one of:
   - **Paste (no tools):** on a computer with Node 20 to 22 run `npm ci && npm run build:template`. Open `dist-template/Code.gs`, copy all of it, and paste it over the editor's single `Code.gs`. In Project Settings tick **Show "appsscript.json" manifest file in editor**, then replace its content with `dist-template/appsscript.json`. Save.
   - **clasp:** switch on the Apps Script API for the account at `script.google.com/home/usersettings`, create a local git-ignored `.clasp.json` with `{ "scriptId": "<id>", "rootDir": "backend", "fileExtension": "gs" }`, then `npx clasp login` and `npx clasp push`.
5. Reload the editor. Confirm the code is present and `appsscript.json` shows `"executeAs": "USER_DEPLOYING"` and `"access": "ANYONE_ANONYMOUS"`.
6. **Prove the copy works** with a spare Gmail: share the template as Viewer, open `https://docs.google.com/spreadsheets/d/<TEMPLATE_ID>/copy` signed in as that Gmail, and confirm the copy contains the script. Note whether Script Properties are left behind (they should be).

## Release a new template version

1. Merge the release to `main` and pass staging UAT.
2. Rebuild and reload the code (paste or `clasp push`), then rename the Sheet to the new version and commit.
3. Keep the previous version as an archived copy in a Drive folder.
4. Existing clients are updated separately (see the Apps Script release runbook); a new template only affects new clients.

## If the template is lost

Repeat "Create it" from the repository at the last released commit.
