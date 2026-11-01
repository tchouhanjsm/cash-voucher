# Password Recovery Tool — operator runbook

## Purpose

Use the dedicated `passwordRecoveryTool()` Apps Script editor entrypoint when the normal application Owner cannot sign in. Do not use `setup()`, reinitialize the application, create a replacement Owner, or edit the Users sheet manually.

This is a break-glass operation for one existing, active Owner account. It is source-only until the code is synchronized to the intended staging Apps Script project through the approved release process. No production recovery is authorized by this runbook.

## Execution and authorization model

The current web app manifest is configured with `executeAs: USER_DEPLOYING` and `access: ANYONE_ANONYMOUS`. A public top-level Apps Script function is callable through `google.script.run`; absence from the application's `ACTIONS` table is not a security boundary.

For that reason the editor entrypoints are protected by a server-side Google identity check:

- `Session.getActiveUser().getEmail()` must be non-empty.
- `Session.getEffectiveUser().getEmail()` must be non-empty.
- Both values must exactly match the persistent `OWNER_RECOVERY_OPERATOR_EMAIL` Script Property.
- The identity check is repeated after acquiring the existing ScriptLock.
- Missing, unavailable or mismatched identities are denied. There is no fallback to an email supplied by the browser, a request parameter, the Owner account being recovered, or the effective user alone.

An anonymous or otherwise unresolved web-app caller therefore fails closed. A caller whose active and effective Google identities both equal the configured operator is acting as that explicitly authorized Google account; protect that account and its editor access accordingly.

The two public entrypoints are deliberately not registered in `ACTIONS` or `WRITES` and are not exposed in application navigation:

- `passwordRecoveryPreflight()` — read-only preflight.
- `passwordRecoveryTool()` — performs the one-time password reset.

The credential mutation remains in the private `recoverExistingOwnerPasswordOnce_()` worker. Do not add a route, UI control, alternate wrapper, `eval` invocation or unauthenticated recovery endpoint.

## Persistent operator configuration

In the intended staging Apps Script project, configure this persistent Script Property once:

| Property | Value |
|---|---|
| `OWNER_RECOVERY_OPERATOR_EMAIL` | Exact Google account email of the authorized Apps Script operator |

Use the same Google account that has editor access and will execute the function from the Apps Script editor. Keep this property in place between recovery events. Change it only through an authorized project editor and a reviewed operator-identity change.

The tool requires both the active and effective user email to equal this property. If Apps Script cannot resolve either identity in the editor, stop: do not weaken the check or substitute a browser-supplied email.

## Per-recovery temporary Script Properties

Before each recovery, configure these five temporary Script Properties in the same staging project:

| Property | Value |
|---|---|
| `OWNER_RECOVERY_EXPECTED_SCRIPT_ID` | Independently verified staging Apps Script project ID |
| `OWNER_RECOVERY_EXPECTED_SS_ID` | Independently verified staging spreadsheet ID |
| `OWNER_RECOVERY_EMAIL` | Email of the existing Owner account to recover |
| `OWNER_RECOVERY_PASSWORD` | Unique temporary random password (8–128 characters) |
| `OWNER_RECOVERY_CONFIRM` | Exact text `RESET_EXISTING_OWNER_ONLY` |

Generate the temporary password in an approved password manager. Do not put it in source code, shell history, logs, issue comments, PR descriptions or chat. Do not add the password to the persistent operator property.

The five temporary properties are deleted by the private worker on every authorized recovery attempt, including validation and lock failures. Calls from an unauthorized identity do not clear or consume them. The persistent `OWNER_RECOVERY_OPERATOR_EMAIL` is never removed by recovery.

## Operator procedure

1. Open the exact staging Apps Script project in the browser and verify its project name and script ID against the private staging inventory.
2. Confirm that the signed-in Google account is the configured `OWNER_RECOVERY_OPERATOR_EMAIL` and has editor access.
3. Set the five temporary recovery Script Properties above. Do not change `PEPPER`, `SS_ID`, receipt/backup folder IDs or any other application property.
4. In the Apps Script editor function selector, choose **`passwordRecoveryPreflight`** and click **Run**.
5. Review the Execution log. The preflight must report `PREFLIGHT_READY`, with every check passed. It reads project identity, spreadsheet identity/access, PEPPER presence, exact Users/AuditLog schemas, the unique active Owner record and readable receipt/backup folders. It does not write application data, clear cache, append audit events, create folders or install triggers.
6. If any preflight check fails, stop. Do not run `setup()`, edit Users manually, create a new Owner or change trusted IDs to force a pass.
7. After a clean preflight, choose **`passwordRecoveryTool`** in the Apps Script editor function selector and click **Run** once.
8. Review the sanitized Execution log result. `RECOVERY_COMPLETED` means the credential row and matching audit event were verified. `RECOVERY_COMPLETED_AUDIT_UNVERIFIED` means credential recovery succeeded but audit persistence needs reconciliation before the incident is closed.
9. Verify all five temporary properties are gone. The persistent operator email, PEPPER, SS_ID, folder properties and backup markers must remain unchanged.
10. The Owner signs in using the temporary password and immediately completes the existing mandatory password-change flow. Verify the new password works and all pre-recovery sessions are rejected.

Do not rerun the recovery tool merely because the audit result is unverified or a later check failed. Inspect the Owner row and AuditLog first.

## What the recovery worker changes

Under the existing Apps Script ScriptLock, it revalidates operator identity, project ID, spreadsheet ID, PEPPER, Users/AuditLog schemas, folder readability, target email uniqueness, Owner role/status, existing identity fields, confirmation and password policy.

It then:
1. Generates a fresh UUID salt and uses the existing HMAC-SHA256 `hashPassword_()` implementation with the unchanged PEPPER.
2. Patches only `Salt`, `PasswordHash` and `MustChangePassword=true` on the existing Owner row.
3. Reads back the row and verifies the credential values and preservation of UserID, name, email, role and active status.
4. Clears only the target Owner's failed-login and failed-password-change counters. Salt rotation invalidates old sessions through the existing authentication salt check.
5. Writes a structured `PASSWORD_RESET` / `USER_PASSWORD_RESET` event under the actual authorized Google operator identity, then reads it back to verify the unique recovery marker.
6. Deletes the five temporary recovery properties in a `finally` block.

The temporary password, new salt and hash are never returned, logged or written to the audit event. Other users, Owner identity/status, PEPPER, SS_ID and unrelated cache/property values are not intended to change.

## Result handling

| Status | Meaning |
|---|---|
| `PREFLIGHT_READY` | Read-only validation passed; no data was changed. |
| `PREFLIGHT_BLOCKED` | One or more environment/account checks failed; do not run recovery. |
| `OPERATOR_NOT_AUTHORIZED` | Active/effective Google identities are missing or do not exactly match the persistent operator allowlist. No recovery properties are consumed. |
| `RECOVERY_COMPLETED` | Credential write and matching audit-event read-back verified. |
| `RECOVERY_COMPLETED_AUDIT_UNVERIFIED` | Credential write verified; audit persistence could not be verified. Reconcile AuditLog before closing the incident. |
| `LOCK_ACQUISITION_FAILED` | ScriptLock timeout; credential mutation did not run. |
| `ENVIRONMENT_VALIDATION_FAILED` | Project, spreadsheet, PEPPER, schema or backup infrastructure validation failed. |
| `ACCOUNT_VALIDATION_FAILED` | No unique active Owner or incomplete existing Owner record. |
| `VALIDATION_FAILED` | Temporary configuration, confirmation or password policy failed. |
| `CREDENTIAL_WRITE_VERIFICATION_FAILED` | Credential write/read-back failed. Inspect the row before retrying. |
| `TEMPORARY_PROPERTY_CLEANUP_INCOMPLETE` | One or more temporary properties could not be removed; an authorized editor must remove only the named temporary properties. |
| `RECOVERY_NOT_PERFORMED` | Unexpected failure; inspect sanitized execution evidence and the stored Owner row before retrying. |

## Failure handling and release boundary

Never bypass the operator identity check, weaken it to accept a browser parameter, edit Users manually, create a replacement Owner, reactivate an account, rotate PEPPER, change SS_ID, run `setup()`, bypass AuditLog or clear unrelated cache/session entries.

The recovery worker does not require a web-app deployment to run from the Apps Script editor. This PR does not synchronize code to Apps Script, execute a staging recovery, change a live spreadsheet, deploy a web app, access production data or merge the PR.
