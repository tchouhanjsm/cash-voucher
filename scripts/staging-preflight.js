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
const DEPLOYMENT_SCOPE = 'staging-only';

function isPlaceholder(value) {
  return !value || /<|>|PASTE|REPLACE|YOUR_|EXAMPLE|PLACEHOLDER/i.test(value);
}

function isStrongPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function validateStagingConfiguration(env = process.env, options = {}) {
  const mode = options.mode || 'uat';
  const errors = [];

  if (!['uat', 'deploy', 'artifact', 'readiness'].includes(mode)) {
    errors.push('Unsupported preflight mode.');
  }

  for (const key of STAGING_ID_KEYS) {
    if (isPlaceholder(String(env[key] || '').trim())) {
      errors.push('Missing or placeholder environment value: ' + key + '.');
    }
  }

  const stageValues = STAGING_ID_KEYS.map((key) => String(env[key] || '').trim());
  const stagePresent = stageValues.every((value) => !isPlaceholder(value));
  const stageDistinct = stagePresent && new Set(stageValues).size === stageValues.length;

  if (stagePresent && !stageDistinct) {
    errors.push(
      'The five configured staging resources (Script, deployment, Sheet, receipt folder and backup folder) must have distinct identifiers.',
    );
  }

  if (PRODUCTION_REFERENCE_KEYS.some((key) => String(env[key] || '').trim())) {
    errors.push(
      'Staging-only preflight must not receive production resource IDs; production provisioning requires a separate reviewed release mode.',
    );
  }

  let stagingUrl;
  const apiUrl = String(env.CV_STAGING_API_URL || '').trim();
  const deploymentId = String(env.CV_STAGING_DEPLOYMENT_ID || '').trim();

  if (!apiUrl || isPlaceholder(apiUrl)) {
    errors.push('Missing or placeholder environment value: CV_STAGING_API_URL.');
  } else {
    try {
      stagingUrl = new URL(apiUrl);
      const match = stagingUrl.pathname.match(/^\/macros\/s\/([^/]+)\/exec$/);

      if (
        stagingUrl.protocol !== 'https:' ||
        stagingUrl.hostname !== 'script.google.com' ||
        stagingUrl.username ||
        stagingUrl.password ||
        stagingUrl.search ||
        stagingUrl.hash ||
        !match
      ) {
        errors.push(
          'The staging API URL must be a plain HTTPS Apps Script /exec URL without credentials, query or fragment.',
        );
      } else if (!deploymentId || match[1] !== deploymentId) {
        errors.push('The staging API URL does not match CV_STAGING_DEPLOYMENT_ID.');
      }
    } catch {
      errors.push('The staging API URL is not a valid URL.');
    }
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
    if (!isStrongPassword(ownerPassword)) {
      errors.push('The staging owner UAT password must be 8–128 characters.');
    }
    if (!isStrongPassword(managerPassword)) {
      errors.push('The staging manager UAT password must be 8–128 characters.');
    }
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
      errors.push('Deployment requires the explicit STAGING-ONLY confirmation.');
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

    const legacy =
      isObject(claspConfig) &&
      isObject(claspConfig.token) &&
      isObject(claspConfig.oauth2ClientSettings) &&
      hasText(claspConfig.token.refresh_token) &&
      hasText(claspConfig.oauth2ClientSettings.clientId) &&
      hasText(claspConfig.oauth2ClientSettings.clientSecret);

    const modernCredential = claspConfig && claspConfig.tokens && claspConfig.tokens.default;
    const modern =
      isObject(claspConfig) &&
      isObject(claspConfig.tokens) &&
      isObject(modernCredential) &&
      hasText(modernCredential.refresh_token) &&
      hasText(modernCredential.client_id) &&
      hasText(modernCredential.client_secret);

    claspCredentialShapeValid = legacy || modern;

    if (!claspCredentialShapeValid) {
      errors.push(
        'CLASPRC_JSON must be valid Clasp credentials in either legacy token/oauth2ClientSettings format or Clasp 3.x tokens.default format.',
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    deploymentScope: DEPLOYMENT_SCOPE,
    checks: {
      claspCredentialShapeValid,
      targetIdsAreSeparated: stageDistinct,
      productionResourceReferencesPresent: false,
      ownerAttestedIsolationUsed: false,
      stagingApiUrlMatchesConfiguredDeployment:
        Boolean(stagingUrl) &&
        stagingUrl.hostname === 'script.google.com' &&
        stagingUrl.pathname === '/macros/s/' + deploymentId + '/exec',
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
  const status = (value) =>
    value === null || value === undefined ? 'not-required' : value ? 'pass' : 'blocked';

  return {
    schemaVersion: 1,
    evidenceType: 'cash-voucher-staging-configuration-preflight',
    generatedAt: new Date().toISOString(),
    deploymentScope: DEPLOYMENT_SCOPE,
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
      productionResourceInventory: 'not-applicable',
      stagingEndpoint: status(checks.stagingApiUrlMatchesConfiguredDeployment),
      dedicatedUatAccounts: status(checks.dedicatedUatAccountsPresent),
      claspCredentialShape: status(checks.claspCredentialShapeValid),
    },
    blockers: result.errors.map(String),
    boundaries: {
      credentialValuesIncluded: false,
      resourceIdentifiersIncluded: false,
      endpointIncluded: false,
      remoteConnectivityTested: false,
      ownershipIndependentlyVerified: false,
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
      '- Scope: ' + report.deploymentScope,
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

  console.log(
    'Staging-only preflight passed: five staging resources are present and distinct, and the API URL matches the staging deployment.',
  );
  console.log(
    'No production endpoint or production resource inventory is configured or required in this release scope.',
  );

  if (mode === 'artifact') {
    console.log('Artifact target configuration passed; no UAT accounts or remote writes were tested.');
  } else if (mode === 'readiness') {
    console.log(
      'Configuration-only readiness passed. No Google API calls, deployments, UAT writes or restore verification were performed.',
    );
  }

  if (mode === 'deploy') {
    console.log('Clasp OAuth configuration is present; credential values are not printed.');
  }
}

if (require.main === module) main();

module.exports = {
  isStrongPassword,
  buildStagingPreflightEvidence,
  validateStagingConfiguration,
  writeStagingPreflightEvidence,
};
