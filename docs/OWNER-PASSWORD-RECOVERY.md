# Owner password recovery — editor-authorized break-glass

## Purpose and scope

The normal `resetPassword_` action requires an authenticated Owner session. It cannot recover access when the only Owner is locked out. This is an operator-controlled procedure for the existing, active Owner only. It must never create another Owner, reactivate an account, or provide a public password-reset route.

This implementation is scoped to staging. It does not authorize a production recovery procedure.

## IAM trust and target verification

The operator must already possess edit access to the exact Apps Script project. The operation checks two independently configured identities:

1. `ScriptApp.getScriptId()` must equal `OWNER_RECOVERY_EXPECTED_SCRIPT_ID`.
2. `SS_ID` and the spreadsheet opened by ID must both equal `OWNER_RECOVERY_EXPECTED_SS_ID`.

Set these values only after confirming the intended staging project and Sheet from the team's private inventory. Do not place IDs, email addresses or secrets in source code, PR comments, screenshots, terminal history or chat.

The procedure also requires explicit confirmation, unchanged `PEPPER`, exact `Users` and `AuditLog` schemas, readable receipt/backup folders, one matching active Owner, populated existing credential fields, and the normal 8–128 character password policy.

## Private functions and Apps Script editor limitation

- `ownerRecoveryPreflight_()` is read-only. Its result contains individual pass/fail checks and a masked Owner email. It changes no rows, Script Properties, Cache entries, audit events or triggers.
- `recoverExistingOwnerPasswordOnce_()` reads its inputs from temporary Script Properties, is underscore-suffixed and is not registered in `ACTIONS`.
- **Invocation constraint:** Apps Script underscore-suffixed functions are private to client calls, but the project also documents that they do not appear in the editor's Run function list. A public wrapper would appear in that list but may also be invocable through `google.script.run`, even if it is not registered in `ACTIONS`. Do not add such a wrapper. This PR does not claim that a private function is selectable from the standard Run list; the team must resolve the editor invocation mechanism separately before operational use. Do not use `eval`, a browser-callable wrapper or an unreviewed workaround.

## Temporary Script Properties

The operator configures the following five properties only in the independently verified staging project:

| Property                            | Value                                               |
| ----------------------------------- | --------------------------------------------------- |
| `OWNER_RECOVERY_EXPECTED_SCRIPT_ID` | Verified staging Apps Script project ID             |
| `OWNER_RECOVERY_EXPECTED_SS_ID`     | Verified staging spreadsheet ID                     |
| `OWNER_RECOVERY_EMAIL`              | Email of the existing Owner                         |
| `OWNER_RECOVERY_PASSWORD`           | Unique temporary random password (8–128 characters) |
| `OWNER_RECOVERY_CONFIRM`            | `RESET_EXISTING_OWNER_ONLY`                         |

Generate the temporary password with an approved password manager. Never put it in source, shell history, logs, issue comments, or chat. The procedure deletes all five properties on each recovery attempt, including validation and lock failures.

## Read-only preflight sequence

After the code has been synchronized through a separately approved release process, verify the project name and staging inventory. Configure the expected identities and target email. Then use the separately approved private invocation mechanism to execute `ownerRecoveryPreflight_()`.

Review all checks: project identity, SS_ID, spreadsheet read access, PEPPER presence, exact Users schema, exactly one matching active Owner, populated UserID/Salt/PasswordHash, exact AuditLog schema, and readable receipt/backup folders.

A failed check means stop and investigate. Do not call `setup()`, create another Owner, edit the Users sheet or change PEPPER/SS_ID to make preflight pass.

The backup property requirement follows the actual implementation: `SS_ID`, `RECEIPT_FOLDER_ID` and `BACKUP_FOLDER_ID`. A previous `BACKUP_LAST_SUCCESS` is not required because the system supports configured-but-never-run backups. Folder readability is verified; preflight does not create folders or triggers.

## Recovery behavior

When invoked through an approved private mechanism, the function:

1. Acquires the existing Apps Script ScriptLock and rechecks environment, schema and account safeguards inside the lock.
2. Rejects a project/Sheet mismatch, missing PEPPER, malformed schemas, unreadable backup infrastructure, invalid confirmation/password, duplicate target email, non-Owner/inactive account or incomplete existing credentials.
3. Generates a fresh UUID salt and uses the existing HMAC-SHA256 `hashPassword_()` implementation with the existing PEPPER.
4. Updates only `Salt`, `PasswordHash` and `MustChangePassword=true` on the existing Owner row.
5. Reads the row back and verifies the new credentials and preservation of UserID, name, email, role and active status.
6. Removes only `f:<email>` and `pf:<UserID>` counters. Salt rotation invalidates prior sessions through the existing `auth_()` salt comparison; unrelated session cache entries are not deleted.
7. Calls the existing `auditEvent_()` mechanism using a unique operation identifier and reads AuditLog back to prove that the corresponding `PASSWORD_RESET` / `USER_PASSWORD_RESET` event persisted.
8. Deletes the five named temporary recovery properties in a `finally` block.

The code never returns, logs or audits the temporary password, salt or hash. It does not alter Owner identity/status, another user's row, PEPPER, SS_ID, backup markers or unrelated Script Properties.

## Result handling

| Status                                  | Meaning                                                                                                                           |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `RECOVERY_COMPLETED`                    | Credential write verified and matching audit event read back; Owner must immediately change the temporary password.               |
| `RECOVERY_COMPLETED_AUDIT_UNVERIFIED`   | Credential write succeeded, but audit persistence could not be verified. Reconcile AuditLog before closing the security incident. |
| `LOCK_ACQUISITION_FAILED`               | ScriptLock timeout; credential mutation did not run.                                                                              |
| `ENVIRONMENT_VALIDATION_FAILED`         | Project, spreadsheet, PEPPER, schema or backup folder validation failed.                                                          |
| `ACCOUNT_VALIDATION_FAILED`             | Owner not uniquely found, not active/owner, or required existing credentials missing.                                             |
| `VALIDATION_FAILED`                     | Temporary configuration, confirmation or password policy failed.                                                                  |
| `CREDENTIAL_WRITE_VERIFICATION_FAILED`  | Credential write/read-back failed. Inspect the existing row before retrying.                                                      |
| `TEMPORARY_PROPERTY_CLEANUP_INCOMPLETE` | One or more named temporary properties could not be removed; an authorized editor must remove those specific properties manually. |
| `RECOVERY_NOT_PERFORMED`                | Unexpected failure; review sanitized execution evidence and the stored Owner row before retrying.                                 |

A `recovered: true` result means credentials were read-back verified. It does not imply that audit persistence is confirmed or a deployment was performed.

## Post-recovery verification

Once a secure invocation mechanism is approved:
1. Verify the same Owner UserID, name, email, role and active status remain.
2. Verify only Salt, PasswordHash and MustChangePassword changed. Do not display or export credential values.
3. Confirm `MustChangePassword=true`.
4. Confirm the specific structured audit event exists and contains no credential material.
5. Confirm all five temporary properties are gone. PEPPER, SS_ID, receipt/backup IDs and backup markers must remain unchanged.
6. The Owner signs in with the temporary password and immediately uses the existing mandatory password-change flow. Verify the new password works and prior sessions are rejected.
7. Remove the temporary recovery module from the Apps Script project only after recovery is complete and all audit/cleanup issues are resolved. Keep the reviewed source and tests in Git.

## Failure handling and deployment boundary

Never edit the Users sheet manually, create a replacement Owner, reactivate an account, change identity, rotate PEPPER, change SS_ID, run setup(), bypass AuditLog, or clear unrelated cache/session entries. A mismatch is a stop condition for a second authorized reviewer.

Executing the editor-only recovery logic does not require a web-app redeployment. However, the new source must first be synchronized into the intended staging Apps Script project via a separately approved process. This PR does not run Clasp, deploy a web app, modify a live spreadsheet, change staging data or access production resources.
