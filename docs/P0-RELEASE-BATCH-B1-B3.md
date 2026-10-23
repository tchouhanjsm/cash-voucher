# P0 Release Batch — B1, B2 and B3

**Integration target:** `client-main`  
**Source baseline for this batch:** PR #204 merge `aa37d94819e59a72c797ba36839aa8f8ec94008f`  
**Purpose:** complete one coherent release-readiness batch spanning staging identity, schema/recovery safety, and security/device acceptance. This document is a plan and evidence checklist; it does not attest that an external operation has already run.

## Scope

### B1 — staging identity and release proof

- Reverse-sync the approved `client-main` branch to the operator workstation using a clean, fast-forward-only Git pull.
- Validate the supported Node version, locked dependencies, source checks, browser E2E, dependency policy and exact source SHA.
- Verify the local `.clasp.json` identifies the dedicated staging Script project and `rootDir: "backend"`; verify the Script's bound Sheet, Script Properties, receipt folder, backup folder, deployment ID and `/exec` URL in the Apps Script editor.
- Upload backend source only after target confirmation and owner authorization. Update the already verified deployment; do not create a parallel deployment or change the URL silently.
- Run the manual Client staging dist ZIP workflow on `client-main` with client code `cash-voucher` and the verified staging `/exec` URL.
- Inspect the downloaded artifact's root entries, `config.js`, `release-manifest.json` commit and ZIP integrity. Upload only to the verified staging document root after taking a backup.
- Run the guarded staging UAT workflow only after staging and production resource identity is independently verified.

**Exit evidence:** local source SHA; CI/check evidence; verified target/deployment identity stored privately; artifact run ID and manifest commit; live staging URL and UAT run evidence. Do not store credentials or sensitive resource IDs in this repository.

### B2 — staging schema, backup and restore

- Before any migration, verify the staging Sheet and inspect actual `Vouchers` and `Vendors` header rows, occupied columns and row counts.
- Take a staging backup and inspect the Sheet snapshot, receipt copies and manifest before modifying schema.
- With explicit owner approval, run only migrations required by the actual schema: `migrateVoucherPaymentMethodField()` and/or `migrateVendorDefaultsSchema()`.
- Preserve historical `PaymentMethod` blanks. Never infer historical values, overwrite occupied columns, migrate production, or use `setup()` as an upgrade mechanism.
- Verify `Vouchers` W and `Vendors` H:I where those migrations are required; compare headers, row counts and historic values before/after.
- Run a second backup after migration, then restore to a separate recovery Sheet/folder. Reconcile headers, row counts, voucher numbering, users/settings and receipt references.

**Exit evidence:** pre-migration backup inspection, before/after schema and row-count comparison, migration execution evidence, and witnessed isolated restore/reconciliation. If the live schema differs from the documented prior schema, stop and investigate; do not force the migration.

### B3 — security, authorization and real-device acceptance

- Validate generated `_headers` and `.htaccess` security policy at build time and in the ZIP workflow. Required controls include CSP directives, `frame-ancestors 'none'`, anti-framing, MIME-sniffing, referrer and permissions policies. Reject unsafe or external script sources.
- After static publication, inspect the actual HTTP response headers. Generated files alone do not prove the hosting server applies them; Apache must support `mod_headers` and the required overrides.
- Test Owner/Manager/Staff authorization, denied API actions, receipts, approval, payments, Cash vs UPI/Bank, duplicate warnings, cash close, and support-report behavior against live staging.
- On each intended device, test install/update, save confirmation, receipt capture, offline queue, reconnect/idempotent replay, queue export/recovery, print/PDF/A5, responsive layout, keyboard focus, zoom/reflow and assistive technology.
- Confirm pending device-local entries are not represented as server-saved vouchers.

**Exit evidence:** saved response-header evidence; role/access test matrix; device/browser matrix; no unresolved critical defects; explicit owner/manager acceptance.

## Engineering changes in this batch

- The static web builder validates generated Cloudflare Pages and Apache security policy before reporting a successful build.
- The policy validator requires the core CSP directives and security headers, rejects wildcard/external script sources and `unsafe-eval`, and requires `frame-ancestors 'none'`.
- The manual staging ZIP workflow independently checks the generated Apache policy markers and rejects unsafe/external script-source patterns.
- Regression tests exercise the policy validator and ensure the staging ZIP workflow retains its security checks.

These checks are source/build gates. They do not certify live response headers, real Google authorization, schema state, backups, restoration or physical-device behavior.

## Release controls

- `client-main` is the integration branch for this work; do not merge/rebase/force-push long-lived branches blindly.
- Keep `.clasp.json`, `.clasprc.json`, account credentials and private instance IDs out of Git and logs.
- Run staging workflows only from `client-main`. `deploy-and-uat` and `uat-only` require exact `STAGING-ONLY` confirmation and explicit staging-write consent.
- The staging UAT writes and cancels one tagged INR 10,000 test voucher; its cancelled row and audit trail remain in staging.
- No production migration, deployment, DNS change or customer handover is authorized by this batch.
- If any identity, schema, backup, header or recovery gate fails, stop and preserve evidence rather than bypassing the guard.

## Recommended execution order

1. Merge this reviewed source batch only after exact-head CI, Browser E2E and Full Flight Test pass.
2. Sync the merged source to the operator's local checkout and run the documented local checks.
3. Verify staging resources and pre-migration backup; perform only approved schema migrations.
4. Push and deploy backend to the verified existing staging deployment.
5. Generate and publish the staging ZIP from the reviewed commit.
6. Run guarded staging UAT, live security/role/device checks, and the isolated restore drill.
7. Record evidence and owner/manager sign-off before beginning the controlled pilot.
