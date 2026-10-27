# Recovery Drill Evidence Contract

**Purpose:** standardize the evidence required to accept a backup restore into a separate recovery destination. This is a source-side evidence validator, not a restore implementation.

**Current baseline at selection:** `client-main` at `2b8120789811f27410f0542c29c7436fcc5f190c` (PR #232 merged; exact-head CI, Browser E2E, Full Flight Test and monitor passed). The repository had no open PR when this batch was selected.

## Hard safety boundary

- Do not run this validator against mock evidence and present it as a live recovery drill.
- Do not run Clasp, deploy Apps Script, mutate Google Sheets/Drive, execute migrations, or perform a write-capable UAT as part of this source batch.
- The actual restore must be explicitly authorized by the owner and target a separate recovery Script, deployment, Spreadsheet, receipt folder and backup folder. Never overwrite the only production copy.
- Keep the evidence JSON in a private local location. Do not commit it, upload it as a public artifact, or include raw resource IDs, credentials, emails, API URLs, raw logs, voucher IDs, customer data or receipt contents.
- The validator rejects unknown field names and sensitive-looking keys. It cannot authenticate the operator, independently inspect Google resources, or prove that a supplied assertion is truthful. A passing contract is not release approval.

## Controlled operator procedure

1. Obtain owner approval and schedule a controlled recovery window. Record only a non-sensitive ticket/change reference.
2. Select a snapshot whose existing backup-integrity report is fully `pass`. A warning or failed report is not eligible for this contract.
3. Independently verify production and recovery resource identity. Compute SHA-256 fingerprints of each raw resource identifier locally; record only the fingerprints. Do not print the original identifiers to logs or chat.
4. Restore into the separate recovery project and destination. Record the deployed `client-main` commit SHA, Apps Script version label, and canonical UTC start/completion times.
5. For each required tab (`Users`, `Vouchers`, `Vendors`, `Settings`, `AuditLog`, `CashCloses`, `CashCloseCorrections`), compare non-empty data-row counts and SHA-256 digests of the exact ordered header row. The source and recovery values must match.
6. Compare the sorted voucher-ID-set digest and the deterministic voucher-ID/number-sequence digest. Record zero duplicate, missing and unexpected voucher IDs.
7. Reconcile manifest records to recovered receipt files. Require zero missing copies, name mismatches and failed read-backs; if the manifest is non-empty, record at least one successful receipt read-back.
8. Compute the same canonical, non-sensitive production-state inventory digest immediately before and after the drill. They must match. Do not hash raw customer rows or place them in evidence.
9. Save the evidence JSON privately, then run `npm run validate:recovery-evidence -- /private/path/recovery-evidence.json`. The validator prints only validation codes and a sanitized summary, not evidence values.

## Contract requirements

The JSON root must use `schemaVersion: 1` and `evidenceType: cash-voucher-recovery-drill`.

- Source metadata: full 40-character integration SHA, snapshot fingerprint, snapshot creation timestamp, manifest SHA-256 and a passing integrity-report state.
- Resource separation: SHA-256 fingerprints for production and recovery Script, deployment, Spreadsheet, receipt folder and backup folder. Every fingerprint must be distinct from every other resource fingerprint and from the selected snapshot fingerprint.
- Restore metadata: success result, ordered UTC timestamps, deployed version label and deployed source SHA.
- Owner approval: explicit approval, UTC timestamp and a non-sensitive change reference. The operator role is limited to `owner` or `qa`; personal identifiers are not accepted.
- Sheet reconciliation: exact header digests and equal row counts for all seven required tabs.
- Voucher reconciliation: equal source/recovery voucher-ID and voucher-number-sequence digests, with zero duplicates, missing IDs and unexpected IDs.
- Receipt reconciliation: manifest/file counts equal, zero missing copies or name mismatches, and successful sample read-back.
- Production unchanged: before/after production-state digests equal, with every required gate attestation explicitly true.

## Acceptance interpretation

A contract pass means only that the submitted evidence is complete and internally consistent. It does not authenticate the operator, is not a cryptographic signature or live resource query, does not prove actual restore success, and is not a substitute for owner/QA witness review. Live staging identity, a real isolated restore, actual HTTP security headers, live authorization, offline/reconnect on intended devices, printing, accessibility and customer acceptance remain separate release gates.
