/* ============================================================================
 * Operator-authorized Owner password recovery (break-glass).
 *
 * Public editor entrypoints perform server-side active/effective Google
 * identity checks. The credential mutation remains in a private worker.
 * ========================================================================== */

const OWNER_RECOVERY_PROPERTY_KEYS_ = [
  'OWNER_RECOVERY_EXPECTED_SCRIPT_ID',
  'OWNER_RECOVERY_EXPECTED_SS_ID',
  'OWNER_RECOVERY_EMAIL',
  'OWNER_RECOVERY_PASSWORD',
  'OWNER_RECOVERY_CONFIRM',
];
const OWNER_RECOVERY_CONFIRMATION_ = 'RESET_EXISTING_OWNER_ONLY';

function ownerRecoveryCheck_(checks, key, passed, message) {
  checks.push({ key: String(key), passed: Boolean(passed), message: String(message) });
}
function ownerRecoveryEmail_(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .toLowerCase();
}
function ownerRecoveryMaskEmail_(email) {
  const parts = String(email || '').split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return '';
  const local = parts[0];
  return (local.length < 3 ? local.charAt(0) : local.slice(0, 2)) + '***@' + parts[1];
}
function ownerRecoverySheetSchema_(spreadsheet, name) {
  const expected = CFG.H[name];
  if (!expected) return false;
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 1) return false;
  const actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  if (
    !expected.every(function (header, index) {
      return actual[index] === header;
    })
  )
    return false;
  if (typeof sheet.getLastColumn === 'function' && sheet.getLastColumn() !== expected.length) {
    return false;
  }
  return true;
}
function ownerRecoveryActive_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE';
}
function ownerRecoveryFolderReadable_(folderId) {
  if (!folderId) return false;
  try {
    const folder = DriveApp.getFolderById(folderId);
    return Boolean(folder && folder.getId() === folderId && folder.getName());
  } catch (_) {
    return false;
  }
}

/** Read-only target preflight; no application data or properties are written. */
function ownerRecoveryPreflight_() {
  const checks = [];
  const p = props_();
  const expectedScriptId = String(p.getProperty('OWNER_RECOVERY_EXPECTED_SCRIPT_ID') || '').trim();
  const expectedSpreadsheetId = String(p.getProperty('OWNER_RECOVERY_EXPECTED_SS_ID') || '').trim();
  const configuredSpreadsheetId = String(p.getProperty('SS_ID') || '').trim();
  const requestedEmail = ownerRecoveryEmail_(p.getProperty('OWNER_RECOVERY_EMAIL'));
  const actualScriptId =
    typeof ScriptApp !== 'undefined' && typeof ScriptApp.getScriptId === 'function'
      ? String(ScriptApp.getScriptId() || '')
      : '';
  const scriptMatches = Boolean(
    expectedScriptId && actualScriptId && expectedScriptId === actualScriptId,
  );
  ownerRecoveryCheck_(
    checks,
    'script_identity',
    scriptMatches,
    scriptMatches
      ? 'The current Apps Script project matches the expected project.'
      : 'The expected and current Apps Script project identities do not match or are missing.',
  );

  const spreadsheetPropertyMatches = Boolean(
    expectedSpreadsheetId && configuredSpreadsheetId === expectedSpreadsheetId,
  );
  ownerRecoveryCheck_(
    checks,
    'spreadsheet_property',
    spreadsheetPropertyMatches,
    spreadsheetPropertyMatches
      ? 'SS_ID matches the expected staging spreadsheet.'
      : 'SS_ID does not match the expected staging spreadsheet or is missing.',
  );

  let spreadsheet = null;
  try {
    if (spreadsheetPropertyMatches) spreadsheet = SpreadsheetApp.openById(expectedSpreadsheetId);
  } catch (_) {
    spreadsheet = null;
  }
  let spreadsheetReadable = false;
  try {
    spreadsheetReadable = Boolean(
      spreadsheet &&
      typeof spreadsheet.getId === 'function' &&
      spreadsheet.getId() === expectedSpreadsheetId,
    );
  } catch (_) {
    spreadsheetReadable = false;
  }
  ownerRecoveryCheck_(
    checks,
    'spreadsheet_readable',
    spreadsheetReadable,
    spreadsheetReadable
      ? 'The expected spreadsheet is readable and confirms its identity.'
      : 'The expected spreadsheet could not be opened and identity-verified.',
  );

  const pepperPresent = Boolean(p.getProperty('PEPPER'));
  ownerRecoveryCheck_(
    checks,
    'password_pepper',
    pepperPresent,
    pepperPresent
      ? 'The existing password PEPPER is present and will not be changed.'
      : 'The existing password PEPPER is missing.',
  );

  const usersSchemaValid = Boolean(spreadsheet && ownerRecoverySheetSchema_(spreadsheet, 'Users'));
  ownerRecoveryCheck_(
    checks,
    'users_schema',
    usersSchemaValid,
    usersSchemaValid
      ? 'Users has the exact application schema.'
      : 'Users is missing or its header schema does not match the application contract.',
  );

  let matches = [];
  if (usersSchemaValid && requestedEmail) {
    try {
      matches = readAll_('Users').filter(function (user) {
        return ownerRecoveryEmail_(user.Email) === requestedEmail;
      });
    } catch (_) {
      matches = [];
    }
  }
  const uniqueOwner =
    matches.length === 1 && String(matches[0].Role || '').toLowerCase() === 'owner';
  ownerRecoveryCheck_(
    checks,
    'owner_unique',
    uniqueOwner,
    matches.length > 1
      ? 'More than one account matches the configured recovery email; recovery is blocked.'
      : matches.length === 0
        ? 'No existing account matches the configured recovery email.'
        : uniqueOwner
          ? 'Exactly one existing Owner account matches the configured recovery email.'
          : 'The matching account is not an Owner; recovery is blocked.',
  );

  const ownerActive = uniqueOwner && ownerRecoveryActive_(matches[0].Active);
  ownerRecoveryCheck_(
    checks,
    'owner_active',
    ownerActive,
    ownerActive
      ? 'The matching Owner account is active.'
      : 'The matching Owner account is inactive; recovery will not reactivate it.',
  );
  const ownerCredentialsPresent = Boolean(
    uniqueOwner &&
    String(matches[0].UserID || '').trim() &&
    String(matches[0].Salt || '').trim() &&
    String(matches[0].PasswordHash || '').trim(),
  );
  ownerRecoveryCheck_(
    checks,
    'owner_credentials',
    ownerCredentialsPresent,
    ownerCredentialsPresent
      ? 'The existing Owner identity and credential fields are populated.'
      : 'The existing Owner UserID, Salt or PasswordHash is missing.',
  );

  const auditSchemaValid = Boolean(
    spreadsheet && ownerRecoverySheetSchema_(spreadsheet, 'AuditLog'),
  );
  ownerRecoveryCheck_(
    checks,
    'audit_schema',
    auditSchemaValid,
    auditSchemaValid
      ? 'AuditLog has the exact application schema.'
      : 'AuditLog is missing or its header schema does not match the application contract.',
  );

  const receiptFolderId = String(p.getProperty('RECEIPT_FOLDER_ID') || '').trim();
  const backupFolderId = String(p.getProperty('BACKUP_FOLDER_ID') || '').trim();
  const receiptFolderReadable = ownerRecoveryFolderReadable_(receiptFolderId);
  const backupFolderReadable = ownerRecoveryFolderReadable_(backupFolderId);
  ownerRecoveryCheck_(
    checks,
    'receipt_backup_infrastructure',
    receiptFolderReadable && backupFolderReadable,
    receiptFolderReadable && backupFolderReadable
      ? 'The configured receipt and backup folders are readable.'
      : 'The receipt or backup folder property is missing or its Drive folder is not readable.',
  );

  const ready = checks.every(function (check) {
    return check.passed;
  });
  return {
    ready: ready,
    readOnly: true,
    checks: checks,
    owner: { email: ownerRecoveryMaskEmail_(requestedEmail) },
    message: ready
      ? 'Preflight passed. No application data or properties were changed.'
      : 'Preflight failed. No application data or properties were changed. Correct failed checks before recovery.',
  };
}
function ownerRecoveryResult_(status, message) {
  return {
    status: status,
    recovered: false,
    auditVerified: false,
    cacheCountersCleared: false,
    cleanupComplete: false,
    message: message,
  };
}

function ownerRecoveryOperatorContext_() {
  const expectedOperator = ownerRecoveryEmail_(
    props_().getProperty('OWNER_RECOVERY_OPERATOR_EMAIL'),
  );
  let activeEmail = '';
  let effectiveEmail = '';
  try {
    activeEmail = ownerRecoveryEmail_(Session.getActiveUser().getEmail());
    effectiveEmail = ownerRecoveryEmail_(Session.getEffectiveUser().getEmail());
  } catch (_) {
    activeEmail = '';
    effectiveEmail = '';
  }
  const operatorParts = expectedOperator.split('@');
  const expectedOperatorValid = Boolean(
    operatorParts.length === 2 &&
    operatorParts[0] &&
    operatorParts[1] &&
    operatorParts[1].indexOf('.') > 0,
  );
  const authorized = Boolean(
    expectedOperatorValid &&
    activeEmail &&
    effectiveEmail &&
    activeEmail === expectedOperator &&
    effectiveEmail === expectedOperator,
  );
  return { authorized: authorized, email: authorized ? expectedOperator : '' };
}

/**
 * Public Apps Script editor entrypoint for read-only validation.
 * It is also technically callable through google.script.run, so the server-side
 * identity check—not its absence from ACTIONS—is the authorization boundary.
 */
function passwordRecoveryPreflight() {
  const operator = ownerRecoveryOperatorContext_();
  if (!operator.authorized) {
    const denied = {
      ready: false,
      readOnly: true,
      status: 'OPERATOR_NOT_AUTHORIZED',
      checks: [
        {
          key: 'operator_identity',
          passed: false,
          message:
            'The active and effective Google identities could not be verified against the configured recovery operator.',
        },
      ],
      message:
        'Recovery operator identity was not verified. No application data or recovery properties were changed.',
    };
    console.log('Password recovery preflight: ' + JSON.stringify(denied));
    return denied;
  }

  const result = ownerRecoveryPreflight_();
  result.checks.unshift({
    key: 'operator_identity',
    passed: true,
    message: 'The active and effective Google identities match the configured recovery operator.',
  });
  result.status = result.ready ? 'PREFLIGHT_READY' : 'PREFLIGHT_BLOCKED';
  console.log(
    'Password recovery preflight: ' +
      JSON.stringify({
        status: result.status,
        ready: result.ready,
        owner: result.owner,
        checks: result.checks,
        message: result.message,
      }),
  );
  return result;
}

/**
 * Public Apps Script editor entrypoint for one-time recovery.
 * Unauthorized calls do not consume or clear configured recovery properties.
 */
function passwordRecoveryTool() {
  const operator = ownerRecoveryOperatorContext_();
  if (!operator.authorized) {
    const denied = ownerRecoveryResult_(
      'OPERATOR_NOT_AUTHORIZED',
      'Recovery operator identity was not verified. No credential changes or property cleanup were performed.',
    );
    console.log('Password recovery tool: ' + JSON.stringify(denied));
    return denied;
  }

  const result = recoverExistingOwnerPasswordOnce_(operator.email);
  console.log(
    'Password recovery tool: ' +
      JSON.stringify({
        status: result.status,
        recovered: result.recovered,
        auditVerified: result.auditVerified,
        cacheCountersCleared: result.cacheCountersCleared,
        cleanupComplete: result.cleanupComplete,
        owner: result.owner || null,
        message: result.message,
      }),
  );
  return result;
}
function ownerRecoveryAuditVerified_(rowCountBefore, ownerEmail, ownerId, operationId) {
  try {
    const rows = readAll_('AuditLog');
    return rows.slice(rowCountBefore).some(function (row) {
      if (row.Action !== 'PASSWORD_RESET' || ownerRecoveryEmail_(row.Target) !== ownerEmail) {
        return false;
      }
      try {
        const details = JSON.parse(String(row.Details || ''));
        return Boolean(
          details &&
          details.version === 1 &&
          details.eventType === 'USER_PASSWORD_RESET' &&
          details.entityType === 'user' &&
          details.entityId === ownerId &&
          details.reason === 'OPERATOR_PASSWORD_RECOVERY|' + operationId &&
          details.summary ===
            'Google-account-authorized operator password recovery; mandatory password change required.',
        );
      } catch (_) {
        return false;
      }
    });
  } catch (_) {
    return false;
  }
}

/**
 * One-time private operation. Inputs come only from temporary Script Properties.
 * Temporary properties are deleted on all paths, including validation failures.
 */
function recoverExistingOwnerPasswordOnce_(authorizedOperatorEmail) {
  const initialOperator = ownerRecoveryOperatorContext_();
  const operatorEmail = ownerRecoveryEmail_(authorizedOperatorEmail);
  if (!initialOperator.authorized || !operatorEmail || initialOperator.email !== operatorEmail) {
    return ownerRecoveryResult_(
      'OPERATOR_NOT_AUTHORIZED',
      'Recovery operator identity was not verified. No credential changes or property cleanup were performed.',
    );
  }

  let result = ownerRecoveryResult_('RECOVERY_NOT_PERFORMED', 'Owner recovery was not performed.');
  const p = props_();
  let ownerEmail = '';
  let temporaryPassword = '';
  let credentialWriteVerified = false;
  let credentialOwner = null;
  let operationId = '';
  let operatorAuthorizationRevoked = false;

  try {
    const expectedScriptId = String(
      p.getProperty('OWNER_RECOVERY_EXPECTED_SCRIPT_ID') || '',
    ).trim();
    const expectedSpreadsheetId = String(
      p.getProperty('OWNER_RECOVERY_EXPECTED_SS_ID') || '',
    ).trim();
    ownerEmail = ownerRecoveryEmail_(p.getProperty('OWNER_RECOVERY_EMAIL'));
    temporaryPassword = String(p.getProperty('OWNER_RECOVERY_PASSWORD') || '');
    const confirmation = String(p.getProperty('OWNER_RECOVERY_CONFIRM') || '');

    if (
      confirmation !== OWNER_RECOVERY_CONFIRMATION_ ||
      !expectedScriptId ||
      !expectedSpreadsheetId ||
      !/^\S+@\S+\.\S+$/.test(ownerEmail) ||
      !passwordOk_(temporaryPassword)
    ) {
      result = ownerRecoveryResult_(
        'VALIDATION_FAILED',
        'Required recovery properties, explicit confirmation or password policy validation failed. No credential changes were made.',
      );
    } else {
      try {
        result = withScriptLock_(function () {
          const lockedOperator = ownerRecoveryOperatorContext_();
          if (!lockedOperator.authorized || lockedOperator.email !== operatorEmail) {
            operatorAuthorizationRevoked = true;
            return ownerRecoveryResult_(
              'OPERATOR_NOT_AUTHORIZED',
              'Recovery operator identity changed or could not be verified under the lock. No credential changes or property cleanup were performed.',
            );
          }

          const actualScriptId =
            typeof ScriptApp !== 'undefined' && typeof ScriptApp.getScriptId === 'function'
              ? String(ScriptApp.getScriptId() || '')
              : '';
          if (!actualScriptId || actualScriptId !== expectedScriptId) {
            return ownerRecoveryResult_(
              'ENVIRONMENT_VALIDATION_FAILED',
              'The current Apps Script project does not match the expected project. No credential changes were made.',
            );
          }

          const configuredSpreadsheetId = String(p.getProperty('SS_ID') || '').trim();
          if (!configuredSpreadsheetId || configuredSpreadsheetId !== expectedSpreadsheetId) {
            return ownerRecoveryResult_(
              'ENVIRONMENT_VALIDATION_FAILED',
              'SS_ID does not match the expected staging spreadsheet. No credential changes were made.',
            );
          }
          let spreadsheet = null;
          try {
            spreadsheet = SpreadsheetApp.openById(expectedSpreadsheetId);
          } catch (_) {
            spreadsheet = null;
          }
          if (
            !spreadsheet ||
            typeof spreadsheet.getId !== 'function' ||
            spreadsheet.getId() !== expectedSpreadsheetId
          ) {
            return ownerRecoveryResult_(
              'ENVIRONMENT_VALIDATION_FAILED',
              'The expected spreadsheet could not be identity-verified. No credential changes were made.',
            );
          }
          if (!p.getProperty('PEPPER')) {
            return ownerRecoveryResult_(
              'ENVIRONMENT_VALIDATION_FAILED',
              'The existing PEPPER property is missing. No credential changes were made.',
            );
          }
          if (
            !ownerRecoverySheetSchema_(spreadsheet, 'Users') ||
            !ownerRecoverySheetSchema_(spreadsheet, 'AuditLog')
          ) {
            return ownerRecoveryResult_(
              'ENVIRONMENT_VALIDATION_FAILED',
              'Users or AuditLog schema validation failed. No credential changes were made.',
            );
          }

          const receiptFolderId = String(p.getProperty('RECEIPT_FOLDER_ID') || '').trim();
          const backupFolderId = String(p.getProperty('BACKUP_FOLDER_ID') || '').trim();
          if (
            !ownerRecoveryFolderReadable_(receiptFolderId) ||
            !ownerRecoveryFolderReadable_(backupFolderId)
          ) {
            return ownerRecoveryResult_(
              'ENVIRONMENT_VALIDATION_FAILED',
              'Receipt or backup infrastructure could not be verified. No credential changes were made.',
            );
          }
          if (!passwordOk_(temporaryPassword)) {
            return ownerRecoveryResult_(
              'VALIDATION_FAILED',
              'The temporary password does not meet the existing password policy. No credential changes were made.',
            );
          }

          const matches = readAll_('Users').filter(function (user) {
            return ownerRecoveryEmail_(user.Email) === ownerEmail;
          });
          if (matches.length !== 1) {
            return ownerRecoveryResult_(
              'ACCOUNT_VALIDATION_FAILED',
              matches.length > 1
                ? 'Multiple accounts match the recovery email. No credential changes were made.'
                : 'No existing account matches the recovery email. No credential changes were made.',
            );
          }
          const owner = matches[0];
          if (String(owner.Role || '').toLowerCase() !== 'owner') {
            return ownerRecoveryResult_(
              'ACCOUNT_VALIDATION_FAILED',
              'The matching account is not an Owner. No credential changes were made.',
            );
          }
          if (!ownerRecoveryActive_(owner.Active)) {
            return ownerRecoveryResult_(
              'ACCOUNT_VALIDATION_FAILED',
              'The matching Owner account is inactive. No credential changes were made.',
            );
          }
          if (
            !String(owner.UserID || '').trim() ||
            !String(owner.Salt || '').trim() ||
            !String(owner.PasswordHash || '').trim()
          ) {
            return ownerRecoveryResult_(
              'ACCOUNT_VALIDATION_FAILED',
              'The matching Owner credential record is incomplete. No credential changes were made.',
            );
          }

          const userId = String(owner.UserID);
          operationId = Utilities.getUuid();
          const newSalt = Utilities.getUuid();
          let newHash;
          try {
            newHash = hashPassword_(newSalt, temporaryPassword);
          } catch (_) {
            return ownerRecoveryResult_(
              'RECOVERY_NOT_PERFORMED',
              'The existing password hashing operation failed. No credential changes were made.',
            );
          }
          if (!newSalt || !newHash) {
            return ownerRecoveryResult_(
              'RECOVERY_NOT_PERFORMED',
              'A replacement credential could not be prepared. No credential changes were made.',
            );
          }

          const mustChangeBefore =
            owner.MustChangePassword === true || owner.MustChangePassword === 'TRUE';
          try {
            updateRow_('Users', owner._row, {
              Salt: newSalt,
              PasswordHash: newHash,
              MustChangePassword: true,
            });
          } catch (_) {
            return ownerRecoveryResult_(
              'CREDENTIAL_WRITE_VERIFICATION_FAILED',
              'The Owner credential write could not be confirmed. Inspect the existing Owner row before retrying.',
            );
          }

          let savedOwner = null;
          try {
            const savedMatches = readAll_('Users').filter(function (user) {
              return user.UserID === owner.UserID && ownerRecoveryEmail_(user.Email) === ownerEmail;
            });
            savedOwner = savedMatches.length === 1 ? savedMatches[0] : null;
          } catch (_) {
            savedOwner = null;
          }
          credentialWriteVerified = Boolean(
            savedOwner &&
            savedOwner.Salt === newSalt &&
            savedOwner.PasswordHash === newHash &&
            savedOwner.MustChangePassword === true &&
            ownerRecoveryActive_(savedOwner.Active) &&
            String(savedOwner.Role || '').toLowerCase() === 'owner' &&
            savedOwner.Name === owner.Name &&
            savedOwner.Email === owner.Email &&
            savedOwner.UserID === owner.UserID,
          );
          if (!credentialWriteVerified) {
            return ownerRecoveryResult_(
              'CREDENTIAL_WRITE_VERIFICATION_FAILED',
              'The Owner credential update did not pass read-back verification. Do not retry until the stored row is inspected.',
            );
          }
          credentialOwner = {
            email: ownerRecoveryMaskEmail_(ownerEmail),
            userId: userId,
          };

          let cacheCountersCleared = false;
          try {
            const cache = CacheService.getScriptCache();
            cache.remove('f:' + ownerEmail);
            cache.remove('pf:' + userId);
            cacheCountersCleared = true;
          } catch (_) {
            cacheCountersCleared = false;
          }

          let auditRowsBefore = null;
          try {
            auditRowsBefore = readAll_('AuditLog').length;
          } catch (_) {
            auditRowsBefore = null;
          }
          try {
            auditEvent_(
              { email: operatorEmail },
              'PASSWORD_RESET',
              ownerEmail,
              'USER_PASSWORD_RESET',
              'user',
              userId,
              'OPERATOR_PASSWORD_RECOVERY|' + operationId,
              [{ field: 'mustChangePassword', before: mustChangeBefore, after: true }],
              'Google-account-authorized operator password recovery; mandatory password change required.',
            );
          } catch (_) {
            // auditEvent_ is deliberately best-effort in this application.
          }
          const auditVerified =
            auditRowsBefore !== null &&
            ownerRecoveryAuditVerified_(auditRowsBefore, ownerEmail, userId, operationId);

          const completed = ownerRecoveryResult_(
            auditVerified ? 'RECOVERY_COMPLETED' : 'RECOVERY_COMPLETED_AUDIT_UNVERIFIED',
            auditVerified
              ? 'The existing Owner password was reset. The Owner must change it after signing in.'
              : 'The Owner credential reset succeeded, but the security audit event could not be verified. Reconcile AuditLog before considering the incident closed.',
          );
          completed.recovered = true;
          completed.auditVerified = auditVerified;
          completed.cacheCountersCleared = cacheCountersCleared;
          completed.owner = credentialOwner;
          completed.operator = { email: ownerRecoveryMaskEmail_(operatorEmail) };
          completed.userId = userId;
          return completed;
        }, 'The recovery lock could not be acquired. No credential changes were made.');
      } catch (error) {
        result =
          error && error.code === 'BUSY'
            ? ownerRecoveryResult_(
                'LOCK_ACQUISITION_FAILED',
                'The recovery lock could not be acquired. No credential changes were made.',
              )
            : ownerRecoveryResult_(
                'RECOVERY_NOT_PERFORMED',
                'Recovery stopped unexpectedly. Review sanitized execution evidence and the Owner row before retrying.',
              );
      }
    }
  } catch (_) {
    result = ownerRecoveryResult_(
      'RECOVERY_NOT_PERFORMED',
      'Recovery stopped unexpectedly. No credential changes were confirmed.',
    );
  } finally {
    if (operatorAuthorizationRevoked) {
      // A failed under-lock identity recheck is a denial, not an authorized attempt.
      result.cleanupComplete = false;
    } else {
      let cleanupComplete = true;
      OWNER_RECOVERY_PROPERTY_KEYS_.forEach(function (key) {
        try {
          p.deleteProperty(key);
        } catch (_) {
          cleanupComplete = false;
        }
      });
      result.cleanupComplete = cleanupComplete;
      if (!cleanupComplete) {
        result.status = 'TEMPORARY_PROPERTY_CLEANUP_INCOMPLETE';
        result.message +=
          ' At least one temporary recovery property could not be removed; an authorized editor must remove only the named recovery properties.';
      }
    }
  }

  if (credentialWriteVerified && !result.recovered) {
    result.status = 'RECOVERY_COMPLETED_AUDIT_UNVERIFIED';
    result.recovered = true;
    result.auditVerified = false;
    result.owner = credentialOwner;
    result.userId = credentialOwner ? credentialOwner.userId : '';
    result.message =
      'The Owner credential reset was read-back verified, but the operation ended before audit persistence could be confirmed. Reconcile AuditLog before closing the incident.';
  }
  temporaryPassword = '';
  ownerEmail = '';
  return result;
}
