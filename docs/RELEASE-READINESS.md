# Release Readiness

Status: **Pilot candidate after release-readiness gates pass**

## Current baseline

| Gate                                         | Status          | Evidence                                                                 |
| -------------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| Backend validation and persistence hardening | ✅ PASS         | Waves 1–2 merged                                                         |
| Idempotency / retry safety                   | ✅ PASS         | PR #14 merged; 71 backend checks locally                                 |
| Frontend modular architecture                | ✅ PASS         | frontend/main.js is the active composition root                          |
| CI quality gate                              | ✅ PASS         | GitHub Actions runs npm run check on main and PRs                        |
| PWA shell integrity                          | 🟡 PR #15        | Service-worker shell is aligned with the active module graph; CI pending |
| Browser E2E                                  | 🟡 HARDENING    | Local API isolation and deterministic runner are implemented in PR #16  |
| Production backend deployment                | ⬜ NOT RELEASED | Must deploy the reviewed Code.gs version intentionally                   |
| Hotel operational pilot                      | ⬜ NOT STARTED  | Requires real hotel users/device workflow verification                   |
| Production cutover                           | ⬜ NOT STARTED  | Requires pilot sign-off and backup/recovery confirmation                 |

## Release gates

### Gate 1 — Engineering

- [ ] npm run check passes on the release candidate
- [ ] git diff --check is clean
- [ ] frontend release integrity check passes
- [ ] no unintended open PRs
- [ ] release candidate is merged to main
- [ ] package version and release tag agree

### Gate 2 — Browser / PWA

- [ ] run the complete browser E2E suite
- [ ] verify owner, manager and staff workflows
- [ ] verify payment, cash received and receipt workflows
- [ ] verify bulk upload, dashboard, register and printing
- [ ] verify offline queue and reconnect
- [ ] verify install/update behavior on at least one Android device and one desktop browser
- [ ] verify a fresh PWA launch works with the current app-shell cache

### Gate 3 — Hotel backend

- [ ] make a backup/copy of the production Google Sheet
- [ ] verify the production Apps Script project points to the intended Sheet
- [ ] review Script Properties and permissions
- [ ] deploy the reviewed backend version without changing the web-app URL
- [ ] verify login, PIN change, RBAC, voucher creation and receipts against the real backend

### Gate 4 — Hotel pilot

Use a controlled pilot before replacing the current process.

- [ ] owner account validated
- [ ] one manager account validated
- [ ] one staff account validated
- [ ] real devices used by the actual operators
- [ ] at least one payment with receipt
- [ ] at least one cash-received entry
- [ ] edit/cancel tested by manager
- [ ] bulk import tested with a small real operational file
- [ ] dashboard/register/printing verified
- [ ] offline queue tested on a real mobile connection
- [ ] end-of-day reconciliation matches the physical cash drawer
- [ ] backup/recovery procedure demonstrated

### Gate 5 — Production release

Release only when all previous gates are green.

1. Freeze the release candidate.
2. Run the complete quality gate.
3. Deploy the reviewed backend version.
4. Publish the GitHub Pages frontend.
5. Verify the live URL from a clean browser/device.
6. Record the release version and deployment date.
7. Keep the previous hotel process available as a fallback during the initial cutover.

## Release decision

The application should be considered **pilot-ready**, not broadly production-ready, once Gates 1–3 pass and the real hotel workflow has been verified.

The final production decision belongs to the hotel operator after Gate 4 confirms that the system records cash correctly and can recover from network/device problems.

## Browser E2E command

Run `npm run test:e2e`. The runner starts the local mock backend, forces the browser to use that local API, checks the owner/manager/staff workflows, and cleans up the server process on exit.
