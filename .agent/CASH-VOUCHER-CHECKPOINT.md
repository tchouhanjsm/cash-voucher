# Cash Voucher autonomous engineering checkpoint

- Repository: `tchouhanjsm/cash-voucher`
- Active branch: `client/new-entry-novice-first-phase1`
- Base branch: `client-main`
- Active PR: [#265 — novice-first New Entry and Register](https://github.com/tchouhanjsm/cash-voucher/pull/265)
- Code-under-test commit: `c30c6a336c23cd80370e9047fc97dff45f229fb7`
- Verified base SHA: `74340d387feb17450ca975543a82d179834ac2c5`
- Working tree: no local worktree is available; branch updates use expected-SHA compare-and-swap. Never assume a write succeeded without verifying the PR head.
- Scheduler: `Cash Voucher Delivery Monitor` remains disabled/read-only. Do not convert it to a concurrent branch-mutating runner.
- Release state: PR remains open/unmerged; no deployment, production cutover, endpoint switch, destructive migration, Clasp push or hosting publication.

## Current milestone — New Entry and Register completion pass

### New Entry

- One Payment or Cash received row is the default.
- Explicit, required, unselected physical-cash choice maps only to `CASH_IN`, `CASH_OUT`, `NO_CASH`. Method/category remain independent.
- Payment method copy is contextual: `Paid via` / `Received via`.
- Payee defaults apply once per payee name; manual category/method survive revisiting the same payee.
- Payment/Cash received switch exposes selected state with `aria-pressed`.
- Receipt input is keyboard-focusable, with visible label focus indication.
- Approval helper is hidden below ₹10,000, visible from exactly ₹10,000 for Payment, and hidden for Cash received. Server approval and no-self-approval policy are unchanged.
- Required validation, duplicate confirmation, receipt, audit, stable IDs/idempotency, IndexedDB queue, server acknowledgement and recovery remain in existing contracts.

### Register

- Common search, quick periods, type, status and approval stay visible.
- Vendor/category/user/custom date/payment method are under native `More filters`; active advanced filters/drill-down reopen it.
- Full-width filter card CSS specificity is fixed; server paging, totals, actions and authorization remain unchanged.

## Exact-head verification — code commit `c30c6a3`

- CI / Quality [42029220927](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42029220927): passed.
- Browser E2E [42029219425](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42029219425): passed, **1,651 checks / 0 failures**.
- Paired Full Flight [42029219220](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42029219220): passed; manual Full Flight sub-job skipped.
- Read-only monitor [42029219257](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42029219257): passed.
- Responsive screenshot artifact [13416005553](https://github.com/tchouhanjsm/cash-voucher/actions/runs/42029219425): 390px and 1280px light/dark captures generated; desktop light/dark New Entry captures inspected after the threshold-helper fix.
- No human usability result is claimed. E2E runs against browser mocks and does not prove live Apps Script or real-device behavior.

## Open validation / risks

- Arrange representative staff for uncoached Payment and Cash received tasks on staging/sandbox. Observe without coaching; measure task completion, hesitation, wrong turns, correction and status comprehension. Do not report 9/10 or SUS without actual results.
- Test on real Android/PWA devices: install/open, camera/file picker, TalkBack, keyboard/focus, offline save, reconnection, same-ID idempotent retry, browser storage constraints.
- Manually assess 200–400% zoom/reflow and tablet/mobile device behavior. Current automated checks cover 320px overflow, 640px reflow and 44px+ touch targets; these do not replace browser zoom or assistive-technology testing.
- Confirm actual Apps Script staging behavior only through approved non-production credentials/environment. No production write or cutover.

## Next delivery order

1. Complete the human New Entry validation above; fix any observed blockers in PR #265.
2. Then implement targeted Home/Dashboard queue and exception visibility using the current read models and IndexedDB outbox—no new queue/state store or dashboard rewrite.
3. Follow with Daily Cash Close clarity, then shared UI/accessibility consistency across the rest of the application.

## Engineering safeguards

- English-only, India-first, INR.
- Preserve ₹10,000 approval, no-self-approval, explicit movement mapping, audit, receipts, role authorization, stable client IDs/idempotency, outbox/recovery and server-authoritative acknowledgement.
- Apps Script + Sheets + Drive remain the authoritative financial writer.
- No endpoint/API/schema/financial rule changes without separate review and authorization; no deployment or merge without the required approval.
## PR #265 follow-up — Staff Home and Full Flight policy (5 November 2026)

- Staff workspace: entry-first My day with Payment and Cash received actions, actionable approval/data-quality attention and server-returned recent entries. The latest 30-day range is visible and carried into Register via Open register.
- Manager/Owner dashboards remain role-specific. Manager retains five financial KPI cards; Owner retains the owner cash position/close/analysis workspace.
- The global outbox banner remains the only queue/recovery authority. No second queue or server-confirmed label for local-only data.
- Full Flight is manual only. CI / Quality and Browser E2E remain automatic PR gates. The full release chain remains callable with `npm run test:flight`.
- No backend/API/schema/Apps Script, approval, cash-impact, balance or Daily Cash Close rule changed. No deployment, merge or production operation.
- Responsive coverage is now six representative cases (390/768/1280px in light/dark) plus targeted action, approval and recent-entry routing checks, replacing repeated Staff KPI assertions across 11 widths.
- Initial head `5d10e9972fb8f8423b61a079a4d04258ee3d8500` had red CI/E2E due to stale static expectations/formatting and a missing async-render wait. Corrective tests and formatting are included in this follow-up. Verify the new exact-head Actions results before merge; do not rely on earlier `c30c6a3` results.