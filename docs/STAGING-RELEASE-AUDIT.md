# Staging Release Audit and Pending Queue

**Audit date:** 21 October 2026  
**Authoritative integration baseline:** client-main `d5ed3e77387d0f1896c97dbaac793ed23b17eb32`, following PR #197.  
**Legacy baseline:** main b4fa94405c0e6a7393c36f43e168f8b54c99c408.  
**Observed relationship:** client-main is 13 commits ahead and 2 behind main; merge base
`acebc6b63010a92e136200321fc77c03dac9a3be`. Do not merge/rebase branches blindly.  
**Scope:** source and release-workflow audit, not live deployment, restore or customer acceptance.

## Executive status

PR #197 (“streamline fast entry and add live batch totals”) and PR #198 (release-readiness
strategy/guardrails) are merged to client-main. PR #198's merged head is
`acc93eb68cec21b1c0510c31fc5f4c82c5481e1d`; its merged-head CI/Quality, Browser E2E and
Full Flight Test all passed. PR #197 contains source changes and mock-backed migration tests;
it does not execute a Google Sheet migration, deploy an Apps Script Web App, publish the
static frontend, verify live response headers or demonstrate backup/restore.

The branch policy names client-main as the only integration branch and main as legacy/read-only.
Repository metadata still listed main as the default branch. Accessible branch-protection data
did not prove active required-check/ruleset enforcement. Owner/admin must verify actual rulesets
and default settings; this source PR must not change repository settings or reconcile divergent
long-lived branches.

Dedicated staging resources, protected staging Environment, a real deployed staging frontend,
successful live UAT, support-email delivery, real backup/restore, physical-device acceptance and
customer acceptance are not evidenced as complete. Verify that the private-repository host
integration still has access. The product remains single-property, not multi-tenant.

## Active release sequence

Follow the six-step pipeline in [the execution plan](EXECUTION-PLAN-2026-10-21.md). Source PRs #197 and #198 are merged; staging and customer acceptance remain unverified.

**Current operational evidence required:** isolated staging identity and host access; inspected
pre-migration backup; schema validation and only required staging migrations; backend-first
deploy and staging-configured frontend; exact-run guarded UAT; live role/receipt/payment-method,
offline and print checks; and an isolated restore. The 14-day hotel pilot remains blocked until
these gates pass. Production is excluded.


## Branch and staging workflow — authoritative correction

The active integration branch is **client-main**. The staging Environment must restrict
deployments to **client-main**, because the deploy/UAT guard accepts only refs/heads/client-main.
Dispatch deploy-and-uat or uat-only from client-main with exact STAGING-ONLY confirmation and
explicit staging-write consent. Starting the staging workflow from main is not supported.

- validate-only runs source checks and mock Browser E2E without staging credentials.
- deploy-and-uat is owner-authorized and updates an already verified staging deployment; it must not create or guess a target deployment.
- uat-only tests a known deployed staging version without uploading source.
- This audit does not authorize production deployment, production migration or a DNS change.

Owner/admin must verify that the GitHub Environment is named staging, deployment restrictions
allow client-main, reviewer protection is configured where supported, and only expected
variables/secrets exist. Never copy secret values to Git, chat, PR text or logs.

## Priority 0 — execution evidence still required

The six-step pipeline above is the canonical sequence. This section records the release gates to prove; it is not a second sequence and does not certify completion.

### A. Staging identity and configuration

1. Verify the dedicated staging Apps Script project, Spreadsheet, receipt folder, backup
   folder, existing Web App deployment and distinct browser origin. Record IDs privately and
   confirm they do not overlap production.
2. Verify the protected GitHub Environment `staging`, its restriction to `client-main`, any
   required reviewer gates, variables and secrets. Never copy secret values into Git, chat or
   logs.
3. Verify private-repository static-host access and that the generated staging ZIP will use
   the independently confirmed staging `/exec` URL and `CV_ENVIRONMENT=staging`.
4. Run `validate-only` first. A deploy/UAT run must be owner-authorized, dispatched from
   `client-main`, include exact `STAGING-ONLY` confirmation and explicit staging-write
   consent, and use the verified existing deployment.

### B. Backup and required schema migrations

1. Back up the confirmed staging Sheet and receipt files; inspect the snapshot and receipt manifest before writing.
2. Inspect actual Vouchers and Vendors headers and row counts. Run
   `migrateVoucherPaymentMethodField()` and/or `migrateVendorDefaultsSchema()` only where
   schema inspection proves they are required, after explicit owner approval.
3. Preserve historical `PaymentMethod` blanks. Stop on unexpected headers or occupied target columns; never overwrite an unknown schema.
4. Verify Vouchers W, Vendors H:I, unchanged row counts and historical values after any migration.

### C. Deploy, UAT and recovery evidence

- Deploy backend first and verify the Apps Script project/deployment/URL; then publish the
  static staging frontend with the verified API URL and staging environment.
- Verify Owner/Manager/Staff authorization, payment/receipt operations, Cash versus UPI/Bank,
  saved-payee defaults, duplicate warnings, approval/cash-close controls and offline recovery
  on all intended devices.
- Verify print/PDF/A5, keyboard focus, zoom/reflow and assistive technology.
- Back up the migrated staging instance and restore to a **separate recovery Sheet/folder**.
  Reconcile headers, row counts, voucher numbering, settings/users and receipt mapping.

**Production boundary:** none of these staging steps authorizes a production migration,
deployment, DNS change or customer-data write.

### D. Customer handover evidence

For first-customer handover, verify a separate customer Script, Sheet, receipt/backup folders,
Web App deployment and frontend origin; inspect actual host response headers; test backend role
and receipt boundaries; prove a customer-specific backup/restore; complete device/offline/print/
accessibility checks; and record quick-start, fallback and written acceptance. Staging success
does not by itself authorize production.


## Priority 1 — controlled pilot

Start a 14-day pilot only after Priority 0 passes. Record daily voucher reconciliation, book
balance versus physical count, Cash versus UPI/Bank treatment, unresolved exceptions, every-
device offline state, backup evidence, incidents and owner/manager sign-off. Stop on missing/
duplicate vouchers, unexplained variance, missing receipts, unauthorized access, failed backup,
target mismatch or unrecoverable offline entries.

Include physical-device/accessibility review, including 200–400% zoom/reflow, focus order,
screen-reader/status behavior and print/export. Measure Apps Script/Sheets latency, quotas and
lock contention in authorized staging before publishing service-level promises.

## Priority 2 — decisions and later work

- **Audit durability:** simultaneous AuditLog append and Script Properties marker-write failure has no durable fallback. Define failure, access, retention and recovery semantics before implementation; never invent historical audit events.
- **Dependency exception:** braces@3.0.3 remains a time-bounded Clasp toolchain exception. Review compatibility by 9 November 2026; CI is expected to reject it from 10 November unless renewed explicitly with tests. Do not blindly downgrade Clasp.
- **Accountant export:** generic recorded-movement CSV exists, but no destination-specific compatibility, tax calculation or ledger claim is approved. The receiving accountant must select software/version and validate an anonymized fixture; qualified Indian CA review is required for tax treatment.
- **Daily close:** denomination rows remain optional until owner/pilot evidence demonstrates value.
- **Scale:** collect pilot evidence before numeric SLO promises, chain support or multi-tenant architecture.

## Release decision

**Source PR #197:** merged and checked. **Release-governance PR #198:** merged and checked.
**Next required action:** verify staging identity, backup, inspect and run only the two required
staging migrations, deploy backend first, publish frontend, run staging UAT and restore into an
isolated target. **Source packaging:** available as a staging input. **Live staging:** not
verified. **First-customer handover:** blocked until Priority 0 gates pass. **Production:**
untouched and not authorized by this audit.

This audit's branch instructions supersede historical snippets elsewhere that tell operators to dispatch from or restrict staging deployment to main. Update this audit and its regression tests in the same meaningful release-governance change whenever the workflow guard changes.
