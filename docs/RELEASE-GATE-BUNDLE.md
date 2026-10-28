# Release Gate Evidence Bundle

**Purpose:** combine the source-check, staging configuration, recovery-drill and live operational evidence into one internally consistent release record. This is a validation contract, not a release approval or a live-system probe.

## When to use it

Run only after the intended `client-main` integration revision has its own passing CI / Quality, Browser E2E, Full Flight Test and development-monitor runs, and an owner has authorized the staging and recovery activities. Do not reuse PR-head checks or pre-merge artifacts as evidence for a later integration SHA.

Keep the combined JSON in a private operator-controlled location. Do not commit it, upload it to a public artifact, or paste it into chat. The bundle contains the sanitized staging-preflight report and recovery evidence, plus the references for witnessed operational checks.

## Validation command

```sh
npm run validate:release-bundle -- /private/path/release-gate-bundle.json --report=/private/path/release-gate-validation.json
```

The command reads a JSON file up to 5 MiB and exits nonzero on missing, failed, mismatched or unexpected evidence. With `--report=...`, it writes a sanitized validation report containing the outcome, source SHA and error codes only. Reports are mode `0600`; newly created output directories use mode `0700`. Both the input bundle and report must be outside the repository, existing report files are never overwritten, the report may not overwrite the input, and symlink output paths/aliases are rejected. The report is not the bundle and contains no resource fingerprints, run URLs, raw evidence or error messages. Run `npm run validate:recovery-evidence -- /private/path/recovery-evidence.json` separately when preparing the recovery evidence source.

## Required contract

- **Source:** repository `tchouhanjsm/cash-voucher`, ref `refs/heads/client-main`, full integration commit SHA.
- **Four exact-head checks:** `ciQuality`, `browserE2e`, `fullFlight` and `autonomousMonitor`; each must conclude `success`, carry a distinct numeric workflow run ID, and use the same SHA as the bundle.
- **Staging configuration preflight:** include the complete sanitized `cash-voucher-staging-configuration-preflight` report. Its commit/repository/ref must match the bundle, all five categories must pass, the blocker list must be empty, and all declared non-live boundaries must remain false.
- **Recovery drill:** include the complete `cash-voucher-recovery-drill` evidence object. It must pass `validate-recovery-evidence.js` and name the same integration SHA.
- **Operational acceptance:** include `status: pass`, a non-sensitive evidence reference and a canonical UTC `verifiedAt` timestamp for each gate. All application-level gates must include `testedClientMainSha` matching the release bundle SHA; branch-protection verification is the only gate that does not require an application SHA.
- **Freshness windows:** the bundle itself must be validated within 24 hours of creation and may not be dated more than five minutes into the future. Staging configuration preflight must be no older than 24 hours; recovery-drill evidence no older than 7 days; live staging UAT, security headers, role/receipt authorization and customer acceptance no older than 7 days; branch protection, offline/reconnect, printing/PDF and accessibility no older than 30 days. All evidence timestamps must be at or before the bundle timestamp.

## Important limitations

A passing bundle means the fields are complete and internally consistent. It does not independently query GitHub, Google Apps Script, Sheets, Drive or the hosting provider; authenticate a human witness; prove a supplied assertion is truthful; or execute UAT/restore. Evidence references must point to separately retained, owner-reviewed records. A fixture-based test pass is not live release evidence.

If any configuration, recovery or operational gate is not ready, do not manufacture a passing report. Fix the blocker and retain an honest blocked record outside the repository. Keep legacy `main` read-only, and do not merge, deploy or change production as a side effect of evidence validation.
