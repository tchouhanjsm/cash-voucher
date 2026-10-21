# Engineering Handoff — Cash Voucher

**Updated:** 21 October 2026  
**Repository:** tchouhanjsm/cash-voucher  
**Integration branch:** client-main  
**Verified integration head before this PR:** d5ed3e77387d0f1896c97dbaac793ed23b17eb32 (post-PR #197).  
**Legacy branch:** main (read-only; divergent).  
**Current phase:** six-step staging release pipeline. PRs #197 and #198 are merged; no live staging run, migration, deployment or customer pilot is claimed.

## Verified source state

- PR #197 (“streamline fast entry and add live batch totals”) is merged to client-main. The exact source-head checks reported as passed: [CI / Quality](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39541110608), [Browser E2E](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39541110591), and [Full Flight Test](https://github.com/tchouhanjsm/cash-voucher/actions/runs/39541110605). Recheck the exact head for this follow-up; older checks do not apply to new commits.
- PR #197 adds fast entry/live batch totals, payment-method batch summaries, quick-save payee defaults, keyboard progression and regression coverage. Its migration tests are mock-backed; it did not run live Google migrations.
- The observed branch comparison has client-main 13 commits ahead and 2 behind main, merge base acebc6b63010a92e136200321fc77c03dac9a3be. Do not merge/rebase branches blindly. Repository metadata still listed main as default; an owner/admin must verify actual ruleset state.
- A source merge is not Apps Script upload, Web App deployment, static-host publication, schema migration, real backup/restore or customer acceptance.

## Immediate actions

1. PR #198 is merged at `acc93eb68cec21b1c0510c31fc5f4c82c5481e1d`; CI/Quality, Browser E2E and Full Flight Test passed on that head. Proceed to staging, not another source feature.
2. Owner/admin verifies active branch rulesets, default branch and private-host permissions. Keep client-main as integration and main read-only; this PR does not alter settings or reconcile branches.
3. Verify staging resource identity and host access. Back up the confirmed staging Sheet and receipts; inspect actual headers; after owner approval, run only required `migrateVoucherPaymentMethodField()` / `migrateVendorDefaultsSchema()` and verify headers/row counts. Deploy backend first, publish the static frontend with the verified staging API URL and `CV_ENVIRONMENT=staging`, then run manual guarded UAT from `client-main` with exact STAGING-ONLY confirmation and explicit write consent.
4. Perform live role/receipt tests; verify a real backup and receipt manifest and restore to a separate recovery Sheet/folder; complete device/offline/print/accessibility checks.
5. Record written customer acceptance and begin the 14-day controlled pilot only when all launch gates pass.

## Release boundary and safeguards

- PaymentMethod/vendor-default migrations must be reviewed against the real schema and run only on a verified, backed-up staging target under owner authorization. Preserve historical blanks; never infer historical PaymentMethod from CashImpact.
- Cash impacts the physical drawer; UPI/Bank does not. A payment at or above ₹10,000 requires independent approval; the creator cannot self-approve.
- Do not run setup against a populated or production target. Do not guess IDs, expose credentials, overwrite the only backup or deploy to production from this PR.
- Current staging audit instructions must agree with the workflow: the supported integration branch and staging Environment restriction are client-main, not main.

## Canonical decision documents

- docs/CEO-BOARD-STRATEGY.md — product thesis, commercial direction and deferred work.
- docs/EXECUTION-PLAN-2026-10-21.md — release gates, staging/UAT, backup/restore, pilot and priority queue.
- docs/CLIENT-MAIN-ENGINEERING-STRATEGY-2026-10-21.md — branch, quality, staging and merge controls.
- docs/STAGING-RELEASE-AUDIT.md — operational proof required before staging and customer launch.

No production configuration or live Google resource is changed by this handoff.
