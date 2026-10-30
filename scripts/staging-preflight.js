'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STAGING_ID_KEYS = [
  'CV_STAGING_SCRIPT_ID',
  'CV_STAGING_DEPLOYMENT_ID',
  'CV_STAGING_SPREADSHEET_ID',
  'CV_STAGING_RECEIPT_FOLDER_ID',
  'CV_STAGING_BACKUP_FOLDER_ID',
];
const PRODUCTION_REFERENCE_KEYS = [
  'CV_PRODUCTION_SCRIPT_ID',
  'CV_PRODUCTION_SPREADSHEET_ID',
  'CV_PRODUCTION_RECEIPT_FOLDER_ID',
  'CV_PRODUCTION_BACKUP_FOLDER_ID',
];

function readProductionApiUrl(env = process.env) {
  return String(env.CV_PRODUCTION_API_URL || '').trim();
}

function normalizeUrl(value) {
  const url = new URL(value);
  return url.origin + url.pathname.replace(/\/$/, '') + url.search + url.hash;
}

function isPlaceholder(value) {
  return !value || /<|>|PASTE|REPLACE|YOUR_|EXAMPLE|PLACEHOLDER/i.test(value);
}

function isStrongPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function parseAppsScriptDeploymentUrl(value, label, errors) {
  if (!value || isPlaceholder(value)) return null;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/macros\/s\/([^/]+)\/exec$/);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'script.google.com' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !match
    ) {
      errors.push(
        label + ' must be a plain HTTPS Apps Script /macros/s/<deployment-id>/exec URL.',
      );
      return null;
    }
    return { url, deploymentId: match[1] };
  } catch {
    errors.push(label + ' is not a valid URL.');
    return null;
  }
}

function validateStagingConfiguration(env = process.env, options = {}) {
  const mode = options.mode || 'uat';
  const errors = [];
  let productionApiUrl = '';
  let productionDeploymentId = '';
  let stagingUrl = null;

  if (!['uat', 'deploy', 'artifact', 'readiness'].includes(mode)) {
    errors.push('Unsupported preflight mode.');
  }

  const stagingOnlyMode = String(env.CV_STAGING_ONLY_MODE || '').trim() === 'true';
  if (!['true', 'false'].includes(String(env.CV_STAGING_ONLY_MODE || '').trim())) {
    errors.push(
      'CV_STAGING_ONLY_MODE must be explicitly set to true for the staging-only lifecycle or false when a production inventory is configured.',
    );
  }

  for (const key of STAGING_ID_KEYS) {
    if (isPlaceholder(String(env[key] || '').trim())) {
      errors.push('Missing or placeholder environment value: ' + key + '.');
    }
  }

  const stagingApiUrl = String(env.CV_STAGING_API_URL || '').trim();
  const parsedStaging = parseAppsScriptDeploymentUrl(
    stagingApiUrl,
    'The staging API URL',
    errors,
  );
  if (parsedStaging) {
    stagingUrl = parsedStaging.url;
    const expectedDeploymentId = String(env.CV_STAGING_DEPLOYMENT_ID || '').trim();
    if (parsedStaging.deploymentId !== expectedDeploymentId) {
      errors.push('The staging API URL does not match CV_STAGING_DEPLOYMENT_ID.');
    }
  }

  const stageValues = STAGING_ID_KEYS.map((key) => String(env[key] || '').trim());
  const stagingIdsComplete = stageValues.every((value) => !isPlaceholder(value));
  const stagingIdsUnique =
    stagingIdsComplete && new Set(stageValues).size === stageValues.length;
  if (stagingIdsComplete && !stagingIdsUnique) {
    errors.push(
      'Staging Script, deployment, Sheet, receipt folder and backup folder must be five distinct resources.',
    );
  }

  const productionReferenceValues = Object.fromEntries(
    PRODUCTION_REFERENCE_KEYS.map((key) => [key, String(env[key] || '').trim()]),
  );
  const hasAnyProductionReferenceValue = Object.values(productionReferenceValues).some(
    (value) => value.length > 0,
  );
  const hasAllProductionReferenceValues = Object.values(productionReferenceValues).every(
    (value) => !isPlaceholder(value),
  );
  productionApiUrl = readProductionApiUrl(env);
  const hasProductionApiUrl = !isPlaceholder(productionApiUrl);
  const hasAnyProductionConfiguration =
    hasAnyProductionReferenceValue || hasProductionApiUrl;
  const hasCompleteProductionConfiguration =
    hasAllProductionReferenceValues && hasProductionApiUrl;

  if (hasAnyProductionConfiguration && !hasCompleteProductionConfiguration) {
    errors.push(
      'Production comparison is optional for staging-only operation; when any production reference is configured, all four CV_PRODUCTION_* resource IDs and CV_PRODUCTION_API_URL must be supplied together.',
    );
  }
  if (!hasAnyProductionConfiguration && !stagingOnlyMode) {
    errors.push(
      'Production resource comparison is unavailable. Set CV_STAGING_ONLY_MODE=true for the current staging-only lifecycle; do not create placeholder production IDs.',
    );
  }

  let parsedProduction = null;
  if (hasProductionApiUrl) {
    parsedProduction = parseAppsScriptDeploymentUrl(
      productionApiUrl,
      'CV_PRODUCTION_API_URL',
      errors,
    );
    if (parsedProduction) productionDeploymentId = parsedProduction.deploymentId;
  }

  if (parsedStaging && parsedProduction) {
    if (normalizeUrl(stagingApiUrl) === normalizeUrl(productionApiUrl)) {
      errors.push(
        'The staging API URL resolves to the configured production endpoint; refusing to continue.',
      );
    }
    if (parsedStaging.deploymentId === productionDeploymentId) {
      errors.push('The staging deployment ID matches the production deployment ID.');
    }
  }

  const productionValues = [
    productionReferenceValues.CV_PRODUCTION_SCRIPT_ID,
    productionDeploymentId,
    productionReferenceValues.CV_PRODUCTION_SPREADSHEET_ID,
    productionReferenceValues.CV_PRODUCTION_RECEIPT_FOLDER_ID,
    productionReferenceValues.CV_PRODUCTION_BACKUP_FOLDER_ID,
  ];
  const productionReferenceInventoryValid =
    hasCompleteProductionConfiguration &&
    productionValues.every(Boolean) &&
    new Set(productionValues).size === productionValues.length;
  const productionInventoryIncomplete =
    hasAnyProductionConfiguration && !productionReferenceInventoryValid;

  if (
    hasCompleteProductionConfiguration &&
    productionValues.every(Boolean) &&
    new Set(productionValues).size !== productionValues.length
  ) {
    errors.push(
      'Production Script, deployment, Sheet, receipt folder and backup folder must be distinct resources.',
    );
  }

  const productionSet = new Set(productionValues.filter(Boolean));
  if (stageValues.some((value) => value && productionSet.has(value))) {
    errors.push(
      'At least one staging resource identifier is also configured as a production resource.',
    );
  }

  let ownerEmail = '';
  let managerEmail = '';
  let ownerPassword = '';
  let managerPassword = '';
  if (mode !== 'artifact') {
    ownerEmail = String(env.CV_STAGING_UAT_OWNER_EMAIL || '')
      .trim()
      .toLowerCase();
    managerEmail = String(env.CV_STAGING_UAT_MANAGER_EMAIL || '')
      .trim()
      .toLowerCase();
    ownerPassword = String(env.CV_STAGING_UAT_OWNER_PASSWORD || '');
    managerPassword = String(env.CV_STAGING_UAT_MANAGER_PASSWORD || '');

    if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) {
      errors.push('A valid dedicated staging owner email is required.');
    }
    if (!/^\S+@\S+\.\S+$/.test(managerEmail)) {
      errors.push('A valid dedicated staging manager email is required.');
    }
    if (ownerEmail && managerEmail && ownerEmail === managerEmail) {
      errors.push('The staging owner and manager UAT accounts must be different accounts.');
    }
    if (!isStrongPassword(ownerPassword))
      errors.push('The staging owner UAT password must be 8–128 characters.');
    if (!isStrongPassword(managerPassword))
      errors.push('The staging manager UAT password must be 8–128 characters.');
    if (ownerPassword && managerPassword && ownerPassword === managerPassword) {
      errors.push('Use different passwords for the staging owner and manager UAT accounts.');
    }
  }

  let claspCredentialShapeValid = null;
  if (mode === 'deploy' || mode === 'readiness') {
    if (
      mode === 'deploy' &&
      String(env.CV_STAGING_DEPLOY_CONFIRMATION || '') !== 'STAGING-ONLY'
    ) {
      errors.push('Deployment requires the exact STAGING-ONLY confirmation.');
    }
    let claspConfig;
    try {
      claspConfig = JSON.parse(String(env.CLASPRC_JSON || ''));
    } catch {
      claspConfig = null;
    }
    const isObject = (value) =>
      value !== null && typeof value === 'object' && !Array.isArray(value);
    const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
    const legacyFormatValid =
      isObject(claspConfig) &&
      isObject(claspConfig.token) &&
      isObject(claspConfig.oauth2ClientSettings) &&
      hasText(claspConfig.token.refresh_token) &&
      hasText(claspConfig.oauth2ClientSettings.clientId) &&
      hasText(claspConfig.oauth2ClientSettings.clientSecret);
    const modernDefaultCredential = claspConfig?.tokens?.default;
    const modernFormatValid =
      isObject(claspConfig) &&
      isObject(claspConfig.tokens) &&
      isObject(modernDefaultCredential) &&
      hasText(modernDefaultCredential.refresh_token) &&
      hasText(modernDefaultCredential.client_id) &&
      hasText(modernDefaultCredential.client_secret);

    claspCredentialShapeValid = legacyFormatValid || modernFormatValid;
    if (!claspCredentialShapeValid) {
      errors.push(
        'CLASPRC_JSON must be valid Clasp credentials in either legacy token/oauth2ClientSettings format or Clasp 3.x tokens.default format.',
      );
    }
  }

  const targetIdsAreSeparated =
    stagingIdsUnique &&
    !productionInventoryIncomplete &&
    (stagingOnlyMode || productionReferenceInventoryValid) &&
    !stageValues.some((value) => value && productionSet.has(value));

  return {
    ok: errors.length === 0,
    errors,
    productionApiUrl,
    checks: {
      claspCredentialShapeValid,
      stagingOnlyMode,
      targetIdsAreSeparated,
      productionResourceReferencesPresent: productionReferenceInventoryValid,
      productionInventoryIncomplete,
      productionCrossCheckPerformed: productionReferenceInventoryValid,
      ownerAttestedIsolationUsed: false,
      stagingApiUrlMatchesConfiguredDeployment:
        Boolean(stagingUrl) &&
        stagingUrl.hostname === 'script.google.com' &&
        stagingUrl.pathname ===
          '/macros/s/' + String(env.CV_STAGING_DEPLOYMENT_ID || '').trim() + '/exec',
      dedicatedUatAccountsPresent:
        mode === 'artifact'
          ? null
          : Boolean(ownerEmail && managerEmail && ownerPassword && managerPassword),
    },
  };
}

function buildStagingPreflightEvidence(result, env = process.env) {
  const repo = String(env.GITHUB_REPOSITORY || '');
  const safeRepo = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : 'unknown';
  const runId = /^\d+$/.test(String(env.GITHUB_RUN_ID || '')) ? String(env.GITHUB_RUN_ID) : '';
  const sha = /^[a-f0-9]{40}$/i.test(String(env.GITHUB_SHA || ''))
    ? String(env.GITHUB_SHA).toLowerCase()
    : null;
  const checks = result.checks || {};
  const status = (value) => {
    if (value === null || value === undefined) return 'not-required';
    return value ? 'pass' : 'blocked';
  };
  return {
    schemaVersion: 1,
    evidenceType: 'cash-voucher-staging-configuration-preflight',
    generatedAt: new Date().toISOString(),
    source: {
      repository: safeRepo,
      ref:
        String(env.GITHUB_REF || '') === 'refs/heads/client-main'
          ? 'refs/heads/client-main'
          : 'unverified-ref',
      commitSha: sha,
    },
    workflowRun: {
      runId,
      url:
        runId && safeRepo !== 'unknown'
          ? 'https://github.com/' + safeRepo + '/actions/runs/' + runId
          : '',
    },
    outcome: result.ok ? 'configuration-pass' : 'blocked',
    categories: {
      stagingResourceSeparation: status(checks.targetIdsAreSeparated),
      productionResourceInventory: checks.productionResourceReferencesPresent
        ? 'pass'
        : checks.productionInventoryIncomplete
          ? 'blocked'
          : checks.stagingOnlyMode
            ? 'not-configured-staging-only'
            : 'blocked',
      stagingEndpoint: status(checks.stagingApiUrlMatchesConfiguredDeployment),
      dedicatedUatAccounts: status(checks.dedicatedUatAccountsPresent),
      claspCredentialShape: status(checks.claspCredentialShapeValid),
      stagingOnlyMode: checks.stagingOnlyMode
        ? 'pass'
        : checks.productionResourceReferencesPresent
          ? 'not-applicable-production-inventory'
          : 'blocked',
    },
    blockers: result.errors.map((message) => String(message)),
    boundaries: {
      credentialValuesIncluded: false,
      resourceIdentifiersIncluded: false,
      endpointIncluded: false,
      remoteConnectivityTested: false,
      ownershipIndependentlyVerified: false,
      productionResourceCrossCheckPerformed: Boolean(checks.productionCrossCheckPerformed),
      productionEnvironmentConfigured: Boolean(checks.productionResourceReferencesPresent),
      deploymentChanged: false,
      backupRestoreVerified: false,
    },
  };
}

function writeStagingPreflightEvidence(result, env = process.env) {
  const outputPath = String(env.CV_STAGING_PREFLIGHT_EVIDENCE_PATH || '').trim();
  if (!outputPath) return null;
  const report = buildStagingPreflightEvidence(result, env);
  const fullPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(fullPath, 0o600);
  const summaryPath = String(env.GITHUB_STEP_SUMMARY || '').trim();
  if (summaryPath) {
    const lines = [
      '## Staging configuration preflight (read-only)',
      '',
      '- Outcome: ' + report.outcome,
      '- Commit: ' + (report.source.commitSha || 'not recorded'),
      '- Run: ' + (report.workflowRun.url || 'not recorded'),
      ...Object.entries(report.categories).map(([key, value]) => '- ' + key + ': ' + value),
      ...report.blockers.map((message) => '- Blocker: ' + message),
      '',
      'Configuration values only; no remote connectivity, resource ownership, deployment, UAT transaction or restore was verified.',
      '',
    ];
    fs.appendFileSync(summaryPath, lines.join('\n'), { mode: 0o600 });
  }
  return report;
}

function main() {
  const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='));
  const mode = modeArgument ? modeArgument.slice('--mode='.length) : 'uat';
  const result = validateStagingConfiguration(process.env, { mode });
  if (mode === 'readiness') writeStagingPreflightEvidence(result, process.env);

  if (!result.ok) {
    console.error('STAGING PREFLIGHT FAILED:');
    result.errors.forEach((message) => console.error('- ' + message));
    process.exitCode = 1;
    return;
  }

  if (result.checks.productionCrossCheckPerformed) {
    console.log(
      'Staging preflight passed: the staging endpoint and all configured staging resources were compared with the complete production inventory.',
    );
  } else {
    console.log(
      'Staging-only preflight passed: all five staging resource identifiers are present and distinct, and the staging API URL matches its deployment ID. No production environment/inventory is configured or assumed.',
    );
  }
  if (mode === 'artifact') {
    console.log(
      'Artifact target configuration passed; no UAT accounts, remote connectivity or remote writes were tested.',
    );
  } else if (mode === 'readiness') {
    console.log(
      'Configuration-only readiness passed. No Google API calls, deployments, UAT writes or restore verification were performed.',
    );
    console.log('Sanitized category evidence was written when an output path was supplied.');
  } else {
    console.log('Dedicated staging owner/manager UAT account configuration is valid.');
  }
  if (mode === 'deploy') {
    console.log('Clasp OAuth configuration is present; credential values are not printed.');
  }
}

if (require.main === module) main();

module.exports = {
  isStrongPassword,
  normalizeUrl,
  readProductionApiUrl,
  buildStagingPreflightEvidence,
  validateStagingConfiguration,
  writeStagingPreflightEvidence,
};
