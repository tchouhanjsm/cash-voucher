# Cash Voucher autonomous engineering checkpoint

- Repository: `tchouhanjsm/cash-voucher`
- Active branch: `client/new-entry-novice-first-phase1`
- Base branch: `client-main`
- Active PR: [#265 — novice-first New Entry](https://github.com/tchouhanjsm/cash-voucher/pull/265)
- Verified base SHA: `74340d387feb17450ca975543a82d179834ac2c5`
- Parent source head before this checkpoint batch: `4b3907465f62c3369fe866834398b50cba37b377`
- Working tree: no local worktree is available; branch updates use expected-SHA compare-and-swap.
- Scheduler: `Cash Voucher Delivery Monitor` automation id `6add06002f9c819190548c09132f70b2` is disabled and read-only. The available automation schema exposes no single-run lock; leave it disabled instead of converting it to a concurrent branch-mutating runner.

## Current phase — New Entry Payment and Cash received

- The ordinary path starts with one entry. Multi-entry summary and totals remain hidden until another row is added.
- Physical cash movement is required and unselected: `CASH_IN`, `CASH_OUT`, `NO_CASH`. Payment method and category are separate.
- Payment method labels are contextual: `Paid via` and `Received via`.
- The ₹10,000+ independent owner/manager approval rule is explained before save; the server rule and no-self-approval remain authoritative.
- Add-another validates each preceding row's payee, amount and explicit movement. Recovery import is a secondary path.
- Existing receipt images, note, category, vendor linking, duplicate confirmation, stable client IDs, server acknowledgement, device-local queue, recovery and audit contracts remain in place.
- Browser test fixtures now pass explicit movement enums for both New Entry and bulk-import preview; no test helper infers movement from transaction type.
- Multi-entry source regression ensures the summary queries all rows. Route heading focus has a deferred recovery if focus remains outside the new view.
- The Payments template HTML assignment was reviewed; type is enum-allowlisted, shared heading/datalist values are escaped, user values are DOM-built, and the reviewed source fingerprint is `2f7c18e5`.

## Verification

- Exact-head run on `3e7fc9ee1e43ea96ea4a342c58d9e650bcbf42a9` failed the multi-row summary source assertion, DOM sink fingerprint and Browser E2E route focus.
- The follow-up on `4b3907465f62c3369fe866834398b50cba37b377` includes fixes and a test helper correction. Its exact-head push workflows were started; check the run logs before treating any gate as passed.
- The previous failed-head results and first-paint smoke are not substitutes for final exact-head CI, Browser E2E and Full Flight.
- Before screenshots are retained from the baseline head. The current responsive matrix must complete before generating the after comparison.
- Real-user observation, physical Android/PWA testing, manual keyboard/screen-reader review and 200–400% zoom/reflow remain open.

## Next three priorities

1. Finish source/test helper correction, run exact-head CI/Browser E2E/Full Flight and fix evidence-backed failures on this same branch.
2. Inspect new visual-matrix screenshots at 390px and 1280px, plus mobile/tablet breakpoints and light/dark states.
3. Complete two-pass review for Payment/Receipt save, approval, movement/method independence, duplicate confirmation and offline recovery. Keep human usability evidence open.

Continue on this branch and PR. Do not create another PR, force-push, merge, deploy, mutate production data or change financial authority.
