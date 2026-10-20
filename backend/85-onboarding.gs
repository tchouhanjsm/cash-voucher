/* ============ server-backed customer onboarding ============ */
const ONBOARDING_SCHEMA_VERSION = 1;
const ONBOARDING_STEPS = {
  preflight: [
    'environmentMatch',
    'propertyConfigured',
    'accountsReady',
    'sheetSchemaReady',
    'foldersAccessible',
    'backupTriggerReady',
    'recentBackup',
  ],
  stagingUat: [
    'loginAndRoles',
    'voucherAndReceipt',
    'highValueApproval',
    'cashClose',
    'offlineSync',
    'restoreDrill',
    'ownerUatSignoff',
  ],
  productionAcceptance: [
    'productionTargetMatch',
    'serverReadiness',
    'restoreDrill',
    'offlineLimitations',
    'ownerAcceptance',
  ],
};
const ONBOARDING_MANUAL_STEPS = new Set([
  'loginAndRoles',
  'voucherAndReceipt',
  'highValueApproval',
  'cashClose',
  'offlineSync',
  'restoreDrill',
  'ownerUatSignoff',
  'offlineLimitations',
  'ownerAcceptance',
]);
const ONBOARDING_FINANCIAL_WRITES = new Set([
  'createVouchers',
  'updateVoucher',
  'cancelVoucher',
  'approveVoucher',
  'rejectVoucher',
  'addReceipt',
  'createCashClose',
  'recordCashCloseCorrection',
]);

function onboardingEnvironment_() {
  const value = String(props_().getProperty('CV_ENVIRONMENT') || '')
    .trim()
    .toLowerCase();
  return { name: value, valid: value === 'staging' || value === 'production' };
}

function onboardingStateKey_(environment) {
  return 'ONBOARDING_STATE_V1_' + environment.toUpperCase();
}

function onboardingReadState_(environment) {
  const raw = props_().getProperty(onboardingStateKey_(environment));
  if (!raw) {
    return {
      schemaVersion: ONBOARDING_SCHEMA_VERSION,
      stage: 'preflight',
      confirmations: {},
      initializedAt: '',
      updatedAt: '',
    };
  }

  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    throw err_(
      'Onboarding state is unreadable. Contact the operator; no changes were made.',
      'ONBOARDING_STATE',
    );
  }

  const allowed =
    environment === 'staging'
      ? ['preflight', 'stagingUat', 'complete']
      : ['preflight', 'productionAcceptance', 'complete'];
  if (
    !state ||
    state.schemaVersion !== ONBOARDING_SCHEMA_VERSION ||
    allowed.indexOf(state.stage) < 0 ||
    !state.confirmations ||
    typeof state.confirmations !== 'object' ||
    Array.isArray(state.confirmations)
  ) {
    throw err_(
      'Onboarding state is invalid. Contact the operator; no changes were made.',
      'ONBOARDING_STATE',
    );
  }

  return state;
}

function onboardingIdentityValue_(value) {
  return String(value === undefined || value === null ? '' : value).trim();
}

function onboardingTargetIdentity_(environment) {
  const p = props_();
  const prefix = 'CV_' + environment.toUpperCase() + '_';
  return {
    environment: environment,
    scriptId: String(ScriptApp.getScriptId() || ''),
    expectedScriptId: String(p.getProperty(prefix + 'SCRIPT_ID') || ''),
    spreadsheetId: String(p.getProperty('SS_ID') || ''),
    expectedSpreadsheetId: String(p.getProperty(prefix + 'SPREADSHEET_ID') || ''),
    deploymentId: String(p.getProperty('CV_DEPLOYMENT_ID') || ''),
    expectedDeploymentId: String(p.getProperty(prefix + 'DEPLOYMENT_ID') || ''),
    receiptFolderId: String(p.getProperty('RECEIPT_FOLDER_ID') || ''),
    expectedReceiptFolderId: String(p.getProperty(prefix + 'RECEIPT_FOLDER_ID') || ''),
    backupFolderId: String(p.getProperty('BACKUP_FOLDER_ID') || ''),
    expectedBackupFolderId: String(p.getProperty(prefix + 'BACKUP_FOLDER_ID') || ''),
  };
}
// Keep one comparison implementation for request-time enforcement and the onboarding
// diagnostic. The request-only deployment comparison is deliberately omitted when
// no browser-supplied deployment ID is available.
function onboardingIdentityChecks_(target, suppliedDeploymentId) {
  const checks = {
    script: Boolean(target.expectedScriptId && target.scriptId === target.expectedScriptId),
    spreadsheet: Boolean(
      target.expectedSpreadsheetId && target.spreadsheetId === target.expectedSpreadsheetId,
    ),
    serverDeployment: Boolean(
      target.expectedDeploymentId && target.deploymentId === target.expectedDeploymentId,
    ),
    receiptFolder: Boolean(
      target.expectedReceiptFolderId &&
      target.receiptFolderId === target.expectedReceiptFolderId,
    ),
    backupFolder: Boolean(
      target.expectedBackupFolderId && target.backupFolderId === target.expectedBackupFolderId,
    ),
  };

  if (suppliedDeploymentId !== undefined && suppliedDeploymentId !== null) {
    const supplied = onboardingIdentityValue_(suppliedDeploymentId);
    checks.clientDeployment = Boolean(
      target.deploymentId && supplied && target.deploymentId === supplied,
    );
  }

  return checks;
}

function onboardingRequestIdentity_(req) {
  const env = onboardingEnvironment_();
  if (
    !env.valid ||
    !req ||
    onboardingIdentityValue_(req.environment).toLowerCase() !== env.name
  ) {
    throw err_(
      'Configured server environment does not match the client environment. Verify the customer build configuration.',
      'ENVIRONMENT_MISMATCH',
    );
  }

  const target = onboardingTargetIdentity_(env.name);
  const checks = onboardingIdentityChecks_(target, req.deploymentId);
  const failedChecks = Object.keys(checks).filter(function (key) {
    return !checks[key];
  });

  if (failedChecks.length) {
    // Report only failed field names. Never disclose Script, Sheet, deployment or
    // Drive identifiers in an API error message or browser console.
    throw err_(
      'Customer resource identity is not verified. Failed checks: ' +
        failedChecks.join(', ') +
        '. Financial changes remain blocked until the operator resolves the mismatch.',
      'ENVIRONMENT_MISMATCH',
    );
  }

  return target;
}

function onboardingAccountCheck_() {
  const active = readAll_('Users').filter(function (user) {
    return user.Active === true || user.Active === 'TRUE';
  });
  const ready = function (role) {
    return active.some(function (user) {
      return (
        String(user.Role || '').toLowerCase() === role &&
        !(user.MustChangePassword === true || user.MustChangePassword === 'TRUE')
      );
    });
  };

  return {
    ownerReady: ready('owner'),
    managerReady: ready('manager'),
    staffReady: ready('staff'),
    activeCount: active.length,
  };
}

function onboardingBackupCheck_() {
  const p = props_();
  const lastSuccess = String(p.getProperty('BACKUP_LAST_SUCCESS') || '');
  const lastAttempt = String(p.getProperty('BACKUP_LAST_ATTEMPT') || '');
  const lastError = String(p.getProperty('BACKUP_LAST_ERROR') || '');
  const successMs = Date.parse(lastSuccess);
  const attemptMs = Date.parse(lastAttempt);
  const recent =
    Number.isFinite(successMs) &&
    Date.now() >= successMs &&
    Date.now() - successMs <= 36 * 60 * 60 * 1000;
  const noLaterAttempt = !lastAttempt || (Number.isFinite(attemptMs) && attemptMs <= successMs);

  return {
    lastSuccess: lastSuccess,
    lastAttempt: lastAttempt,
    hasRecordedFailure: Boolean(lastError),
    recent: recent,
    noLaterAttempt: noLaterAttempt,
    ready: recent && !lastError && noLaterAttempt,
  };
}

function onboardingTechnicalChecks_(user, environment) {
  need_(user, 'settings');
  const env = environment || onboardingEnvironment_().name;
  const identity = onboardingTargetIdentity_(env);
  const identityChecks = onboardingIdentityChecks_(identity);
  const identityMatched = Object.keys(identityChecks).every(function (key) {
    return identityChecks[key];
  });

  const readiness = deploymentReadiness_(user);
  const currentSettings = settings_();
  const accounts = onboardingAccountCheck_();
  const backup = onboardingBackupCheck_();
  const schemaReady =
    readiness.checks.spreadsheetReadable &&
    readiness.checks.missingSheets.length === 0 &&
    readiness.checks.invalidHeaders.length === 0;
  const foldersReady =
    readiness.checks.receiptFolderReadable && readiness.checks.backupFolderReadable;
  const triggerReady = readiness.checks.backupTriggerInstalled;
  const propertyReady =
    Boolean(String(currentSettings.propertyName || '').trim()) &&
    String(currentSettings.propertyName || '').trim() !== 'My Property' &&
    categories_().length > 0;
  const accountsReady = accounts.ownerReady && accounts.managerReady && accounts.staffReady;

  return {
    environmentMatch: {
      status: identityMatched ? 'pass' : 'blocked',
      message: identityMatched
        ? 'Environment, deployment and customer resource identity match.'
        : 'Environment or resource identity is missing/mismatched. Stop and verify the instance register.',
      details: {
        environment: env,
        scriptMatched: identityChecks.script,
        sheetMatched: identityChecks.spreadsheet,
        deploymentMatched: identityChecks.serverDeployment,
        receiptFolderMatched: identityChecks.receiptFolder,
        backupFolderMatched: identityChecks.backupFolder,
        // The request-only client deployment comparison is validated before this
        // screen is loaded and is not inferred from a server-side self-comparison.
      },
    },
    propertyConfigured: {
      status: propertyReady ? 'pass' : 'blocked',
      message: propertyReady
        ? 'Property name and categories are configured.'
        : 'Set the real property name and categories; placeholder defaults do not satisfy preflight.',
    },
    accountsReady: {
      status: accountsReady ? 'pass' : 'blocked',
      message: accountsReady
        ? 'Active Owner, Manager and Staff accounts have changed temporary passwords.'
        : 'Create active Manager and Staff accounts and require each user to change the temporary password.',
      details: accounts,
    },
    sheetSchemaReady: {
      status: schemaReady ? 'pass' : 'blocked',
      message: schemaReady
        ? 'Required tabs and headers are readable.'
        : 'Required tabs or headers are missing/invalid. Never run setup() to repair a populated customer Sheet.',
      details: {
        missingSheets: readiness.checks.missingSheets,
        invalidHeaders: readiness.checks.invalidHeaders,
      },
    },
    foldersAccessible: {
      status: foldersReady ? 'pass' : 'blocked',
      message: foldersReady
        ? 'Receipt and backup folders are readable.'
        : 'Receipt or backup folder is inaccessible; verify folder identity and permissions.',
    },
    backupTriggerReady: {
      status: triggerReady ? 'pass' : 'blocked',
      message: triggerReady
        ? 'A scheduled backup trigger exists.'
        : 'The scheduled trigger is missing. Arrange a reviewed repair; do not rerun setup() on populated data.',
    },
    recentBackup: {
      status: backup.ready ? 'pass' : 'blocked',
      message: backup.ready
        ? 'A recent successful backup is recorded with no later attempt or recorded failure.'
        : 'A recent successful backup with no later attempt or recorded failure is required. A timestamp is not restore proof.',
      details: backup,
    },
    productionTargetMatch: {
      status: env === 'production' && identityMatched ? 'pass' : 'blocked',
      message:
        env === 'production' && identityMatched
          ? 'Production resource identity matches.'
          : 'Production target identity must be verified in the production instance.',
    },
    serverReadiness: {
      status:
        env === 'production' &&
        schemaReady &&
        foldersReady &&
        triggerReady &&
        backup.ready &&
        propertyReady &&
        accountsReady
          ? 'pass'
          : 'blocked',
      message:
        env === 'production' &&
        schemaReady &&
        foldersReady &&
        triggerReady &&
        backup.ready &&
        propertyReady &&
        accountsReady
          ? 'Production server readiness checks passed.'
          : 'Production readiness is incomplete or this is not production.',
    },
  };
}

function onboardingVisibleState_(user, environment) {
  need_(user, 'settings');
  const env = onboardingEnvironment_();
  if (!env.valid || env.name !== environment) {
    throw err_(
      'Configured server environment does not match the requested onboarding environment.',
      'ENVIRONMENT_MISMATCH',
    );
  }

  const state = onboardingReadState_(environment);
  const checks = onboardingTechnicalChecks_(user, environment);
  const ids = ONBOARDING_STEPS[state.stage] || [];
  const steps = ids.map(function (id) {
    const automatic = !ONBOARDING_MANUAL_STEPS.has(id);
    const record = state.confirmations[id] || null;
    const check = checks[id];
    let status;
    let message;
    if (automatic) {
      status = check ? check.status : 'blocked';
      message = check ? check.message : 'No reliable automated check is available.';
    } else if (record && record.status === 'pass') {
      status = 'pass';
      message =
        'Owner confirmation is saved. This is not automated proof of a device test or successful restore.';
    } else if (record && record.status === 'fail') {
      status = 'fail';
      message = 'Owner marked this test failed. Resolve it and record fresh evidence.';
    } else {
      status = 'pending';
      message = 'Run this test, then record an evidence note (12–500 characters).';
    }

    return {
      id: id,
      automatic: automatic,
      status: status,
      message: message,
      evidence: record ? record.evidence : '',
      actorEmail: record ? record.actorEmail : '',
      completedAt: record ? record.completedAt : '',
    };
  });

  const allPassed = ids.every(function (id) {
    if (ONBOARDING_MANUAL_STEPS.has(id)) {
      const record = state.confirmations[id];
      return Boolean(
        record &&
        record.status === 'pass' &&
        record.actorEmail &&
        String(record.evidence || '').trim().length >= 12,
      );
    }
    return Boolean(checks[id] && checks[id].status === 'pass');
  });
  const productionEvidence =
    environment !== 'production' ||
    ['restoreDrill', 'offlineLimitations', 'ownerAcceptance'].every(function (id) {
      const record = state.confirmations[id];
      return Boolean(
        record &&
        record.status === 'pass' &&
        record.actorEmail &&
        record.actorRole === 'owner' &&
        String(record.evidence || '').trim().length >= 12 &&
        record.completedAt,
      );
    });
  const liveProductionChecks =
    environment !== 'production' ||
    (checks.environmentMatch.status === 'pass' &&
      checks.productionTargetMatch.status === 'pass' &&
      checks.serverReadiness.status === 'pass');
  const releaseAllowed =
    environment === 'production' &&
    state.stage === 'complete' &&
    allPassed &&
    productionEvidence &&
    liveProductionChecks;

  return {
    environment: environment,
    environmentConfigured: true,
    stage: state.stage,
    steps: steps,
    stageReady: allPassed,
    canAdvance: state.stage !== 'complete' && allPassed,
    releaseAllowed: releaseAllowed,
    writePolicy:
      environment === 'staging'
        ? state.stage === 'stagingUat'
          ? 'staging-uat-only'
          : 'blocked'
        : releaseAllowed
          ? 'accepted'
          : 'blocked',
    note:
      environment === 'staging'
        ? 'Test writes are permitted only on the isolated staging instance.'
        : 'Synthetic UAT transactions are prohibited on production.',
  };
}

function onboardingState_(user, req) {
  need_(user, 'settings');
  onboardingRequestIdentity_(req);
  return onboardingVisibleState_(user, String(req.environment).trim().toLowerCase());
}

function onboardingConfirm_(user, req) {
  need_(user, 'settings');
  if (user.role !== 'owner') {
    throw err_('Only the property owner can record onboarding confirmations.', 'FORBIDDEN');
  }

  const identity = onboardingRequestIdentity_(req);
  const environment = identity.environment;
  const stepId = String(req.stepId || '');
  const state = onboardingReadState_(environment);
  const ids = ONBOARDING_STEPS[state.stage] || [];
  if (ids.indexOf(stepId) < 0 || !ONBOARDING_MANUAL_STEPS.has(stepId)) {
    throw err_('That manual step is not available in the current stage.', 'ONBOARDING_ORDER');
  }

  const evidence = clean_(req.evidence, 500).trim();
  const status = req.status === 'pass' ? 'pass' : req.status === 'fail' ? 'fail' : '';
  if (evidence.length < 12) {
    throw err_('Evidence note must contain at least 12 characters.', 'VALIDATION');
  }
  if (!status) throw err_('Choose Pass or Fail.', 'VALIDATION');

  const latest = onboardingReadState_(environment);
  if (latest.stage !== state.stage) {
    throw err_('Onboarding stage changed. Refresh and try again.', 'ONBOARDING_STALE');
  }
  const checks = onboardingTechnicalChecks_(user, environment);
  const index = ids.indexOf(stepId);
  for (let i = 0; i < index; i++) {
    const priorId = ids[i];
    if (ONBOARDING_MANUAL_STEPS.has(priorId)) {
      const prior = latest.confirmations[priorId];
      if (!prior || prior.status !== 'pass') {
        throw err_('Complete the previous onboarding step first.', 'ONBOARDING_ORDER');
      }
    } else if (!checks[priorId] || checks[priorId].status !== 'pass') {
      throw err_('Resolve the earlier automatic prerequisite first.', 'ONBOARDING_ORDER');
    }
  }

  const now = nowIso_();
  latest.confirmations[stepId] = {
    status: status,
    evidence: evidence,
    actorEmail: user.email,
    actorRole: user.role,
    completedAt: now,
  };
  for (let i = index + 1; i < ids.length; i++) {
    delete latest.confirmations[ids[i]];
  }
  latest.updatedAt = now;
  if (!latest.initializedAt) latest.initializedAt = now;
  props_().setProperty(onboardingStateKey_(environment), JSON.stringify(latest));
  audit_(
    { email: user.email },
    'ONBOARDING_CONFIRM',
    stepId,
    status + ': ' + evidence.slice(0, 240),
  );
  return onboardingVisibleState_(user, environment);
}

function onboardingAdvance_(user, req) {
  need_(user, 'settings');
  if (user.role !== 'owner') {
    throw err_('Only the property owner can advance onboarding.', 'FORBIDDEN');
  }

  const identity = onboardingRequestIdentity_(req);
  const environment = identity.environment;
  const state = onboardingReadState_(environment);
  const visible = onboardingVisibleState_(user, environment);
  if (!visible.stageReady) {
    throw err_(
      'This stage still has blockers. Complete every requirement before advancing.',
      'ONBOARDING_BLOCKED',
    );
  }

  if (state.stage === 'preflight') {
    state.stage = environment === 'staging' ? 'stagingUat' : 'productionAcceptance';
  } else if (state.stage === 'stagingUat' || state.stage === 'productionAcceptance') {
    state.stage = 'complete';
  } else {
    throw err_('Onboarding is already complete.', 'ONBOARDING_COMPLETE');
  }

  state.updatedAt = nowIso_();
  props_().setProperty(onboardingStateKey_(environment), JSON.stringify(state));
  audit_(
    { email: user.email },
    'ONBOARDING_ADVANCE',
    environment,
    'Stage advanced to ' + state.stage,
  );
  return onboardingVisibleState_(user, environment);
}

function enforceOnboardingFinancialGate_(user, action, req) {
  if (!ONBOARDING_FINANCIAL_WRITES.has(action)) return;

  const identity = onboardingRequestIdentity_(req);
  const state = onboardingReadState_(identity.environment);
  if (identity.environment === 'staging') {
    if (state.stage !== 'stagingUat') {
      throw err_(
        'Staging financial writes are blocked until preflight is passed and the owner advances onboarding.',
        'ONBOARDING_GATE',
      );
    }
    return;
  }

  if (state.stage !== 'complete') {
    throw err_(
      'Production financial writes remain blocked until final owner production acceptance.',
      'ONBOARDING_GATE',
    );
  }

  const visible = onboardingVisibleState_(user, 'production');
  if (!visible.releaseAllowed) {
    throw err_(
      'Production acceptance prerequisites no longer pass; financial writes are blocked.',
      'ONBOARDING_GATE',
    );
  }
}
