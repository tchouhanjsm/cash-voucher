# Engineering Handoff

Updated: 20 October 2026  
Repository: `tchouhanjsm/cash-voucher`  
Integration branch: `client-main`  
Verified integration head before this follow-up: `9f4fffa43ac27c357b7a06cb49832bfddca1e25b` (PR #195 merge).  
Current work: cohesive payment/receipt fast-entry batch with live batch totals, manager/owner quick-save payee defaults, responsive/keyboard regressions and additive schema-migration tests.  
Environment authority: this source work does not run Apps Script migrations, initialize Google resources, publish static files, update a Web App deployment, mutate live financial data or deploy to production.

## Verified current phase

- PR #195 is merged. On its exact merged integration commit, CI [39469808091](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39469808091), Browser E2E [39469808090](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39469808090), and Full Flight Test [39469808185](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39469808185) passed.
- Payment entry already supports payee/amount/note, payment methods, vendor defaults, recent payee suggestions, duplicate warnings, receipt attachments and offline/idempotent save recovery. The next UX phase should reduce decision friction and repeated taps rather than add controls by default.
- The supplied screenshot is a conceptual five-step release workflow, not a pixel-perfect UI reference. Keep GitHub as source of truth, build static frontend artifacts separately, deploy Apps Script separately, verify configured environment identity, and run staging UAT before owner-approved production release.
- The PaymentMethod and vendor-default migrations are append-only in source. Live staging schema/backend/frontend compatibility remains unverified. Back up and verify the exact target before any authorized migration; release backend before the static frontend; leave historical payment methods blank.
- GitHub currently reports `main` as the default branch, while repository workflow documentation says `client-main` is the only integration branch. The accessible `main` branch response indicated branch protection/status checks disabled; this GitHub connection cannot inspect the full ruleset configuration. Treat default/ruleset configuration as an owner-admin task and do not change it as part of this source PR.

## Next actions

1. Run the migration tests with CI, Browser E2E and Full Flight Test; fix failures before merge.
2. Complete owner-authorized staging identity checks, verified backup, schema migration, backend-first release, staging frontend publication and UAT/print acceptance. Do not run production migrations or deploy production in this PR.
3. Verify private static-host access to this private repository. Build a staging-only client ZIP with the independently verified staging `/exec` URL; publish only after explicit owner authorization.
4. Owner-authorized staging UAT must cover role and receipt permissions, Cash/UPI/Bank treatment, vendor defaults, duplicate warnings, offline replay, A5/PDF alignment, a completed backup and restore into a separate recovery Sheet/folder. Production remains blocked until acceptance evidence is recorded.

## Release boundary

A source merge is not a Clasp upload, Web App deployment, static-host publication, backup or restore proof. Never run `setup()` against populated data, guess resource IDs, disclose credentials or infer historical PaymentMethod from CashImpact.
