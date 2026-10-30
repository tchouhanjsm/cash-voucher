'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
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
const RESOURCE_ISOLATION_ATTESTATION = 'OWNER-VERIFIED-STAGING-ONLY';

function readProductionApiUrl(root = ROOT) {
  const configPath = path.join(root, 'config.js');
  const source = fs.readFileSync(configPath, 'utf8');
  const matches = [...source.matchAll(/https:\/\/script\.google\.com\/macros\/s\/[^'"\s]+\/exec/g)];
  const urls = [...new Set(matches.map((match) => match[0]))];

  if (urls.length !== 1) {
    throw new Error(
      'The production API URL must be a single explicit Apps Script /exec URL in config.js.',
    );
  }

  return urls[0];
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

function validateStagingConfiguration(env = process.env, options = {}) {
  const mode = options.mode || 'uat';
  const root = options.root || ROOT;
  const errors = [];
  const stagingOnlyMode = String(env.CV_STAGING_ONLY_MODE || '').trim() === 'true';
  const isolationAttestation = String(env.CV_STAGING_RESOURCE_ISOLATION_ATTESTATION || '').trim();
  let productionApiUrl = '';
  let productionDeploymentId = '';

  if (!['uat', 'deploy', 'artifact', 'readiness'].includes(mode))
    errors.push('Unsupported preflight mode.');
  for (const key of STAGING_ID_KEYS) {
    if (isPlaceholder(String(env[key] || '').trim()))
      errors.push('Missing or placeholder environment value: ' + key + '.');
  }

  if (stagingOnlyMode) {
    if (isolationAttestation !== RESOURCE_ISOLATION_ATTESTATION) {
      errors.push(
        'Staging-only mode requires CV_STAGING_RESOURCE_ISOLATION_ATTESTATION=OWNER-VERIFIED-STAGING-ONLY after the owner independently verifies all five staging resources.',
      );
    }
    if (PRODUCTION_REFERENCE_KEYS.some((key) => String(env[key] || '').trim())) {
      errors.push(
        'Staging-only mode must not receive production resource reference IDs; remove production references until a production environment exists.',
      );
    }
  } else {
    try {
      productionApiUrl = readProductionApiUrl(root);
      const productionUrl = new URL(productionApiUrl);
      const match = productionUrl.pathname.match(/^\/macros\/s\/([^/]+)\/exec\/?$/);
      if (!match) throw new Error('Configured production URL shape is invalid.');
      productionDeploymentId = match[1];
    } catch {
      errors.push(
        'Could not identify one valid production Apps Script Web App URL from config.js.',
      );
    }
  }

  let stagingUrl;
  const stagingApiUrl = String(env.CV_STAGING_API_URL || '').trim();
  const stagingDeploymentId = String(env.CV_STAGING_DEPLOYMENT_ID || '').trim();
  if (!stagingApiUrl || isPlaceholder(stagingApiUrl)) {
    errors.push('Missing or placeholder environment value: CV_STAGING_API_URL.');
  } else {
    try {
      stagingUrl = new URL(stagingApiUrl);
      if (
        stagingUrl.protocol !== 'https:' ||
        stagingUrl.hostname !== 'script.google.com' ||
        stagingUrl.username ||
        stagingUrl.password ||
        stagingUrl.search ||
        stagingUrl.hash
      ) {
        errors.push(
          'The staging API URL must be a plain HTTPS Apps Script URL without query or fragment.',
        );
      }
      const match = stagingUrl.pathname.match(/^\/macros\/s\/([^/]+)\/exec\/?$/);
      if (stagingUrl.pathname !== '/macros/s/' + stagingDeploymentId + '/exec') {
        errors.push(
          'The staging API URL path must be the exact configured /exec endpoint without a trailing slash.',
        );
      }
      if (!match || match[1] !== stagingDeploymentId)
        errors.push('The staging API URL does not match CV_STAGING_DEPLOYMENT_ID.');
      if (
        !stagingOnlyMode &&
        productionApiUrl &&
        normalizeUrl(stagingApiUrl) === normalizeUrl(productionApiUrl)
      ) {
        errors.push(
          'The staging API URL resolves to the production endpoint; refusing to continue.',
        );
      }
      if (
        !stagingOnlyMode &&
        match &&
        productionDeploymentId &&
        match[1] === productionDeploymentId
      ) {
        errors.push('The staging deployment ID matches the production URL deployment ID.');
      }
    } catch {
      errors.push('The staging API URL is not a valid URL.');
    }
  }

  const stageValues = STAGING_ID_KEYS.map((key) => String(env[key] || '').trim());
  const productionReferenceValues = Object.fromEntries(
    PRODUCTION_REFERENCE_KEYS.map((key) => [key, String(env[key] || '').trim()]),
  );
  const hasAnyProductionReferenceValue = Object.values(productionReferenceValues).some(
    (value) => value.length > 0,
  );
  const hasAllProductionReferenceValues = Object.values(productionReferenceValues).every(
    (value) => !isPlaceholder(value),
  );
  const productionValues = [
    productionReferenceValues.CV_PRODUCTION_SCRIPT_ID,
    productionDeploymentId,
    productionReferenceValues.CV_PRODUCTION_SPREADSHEET_ID,
    productionReferenceValues.CV_PRODUCTION_RECEIPT_FOLDER_ID,
    productionReferenceValues.CV_PRODUCTION_BACKUP_FOLDER_ID,
  ];
  const productionSet = new Set(productionValues.filter(Boolean));
  const productionReferenceInventoryValid =
    !stagingOnlyMode &&
    hasAllProductionReferenceValues &&
    productionValues.every(Boolean) &&
    new Set(productionValues).size === productionValues.length;

  if (mode === 'artifact') {
    if (!stagingOnlyMode && hasAnyProductionReferenceValue && !hasAllProductionReferenceValues) {
      errors.push(
        'Artifact preflight requires all four production resource reference IDs together when any production reference is provided.',
      );
    } else if (
      !stagingOnlyMode &&
      !hasAnyProductionReferenceValue &&
      isolationAttestation !== RESOURCE_ISOLATION_ATTESTATION
    ) {
      errors.push(
        'For artifact-only builds without production resource reference IDs, CV_STAGING_RESOURCE_ISOLATION_ATTESTATION must equal OWNER-VERIFIED-STAGING-ONLY after independently verifying staging resources outside this workflow.',
      );
    }
  } else if (!stagingOnlyMode && !productionReferenceInventoryValid) {
    errors.push(
      'Write-capable staging operations require all four production resource reference IDs unless explicit staging-only mode is enabled and owner-attested.',
    );
  }

  if (stageValues.every(Boolean) && new Set(stageValues).size !== stageValues.length) {
    errors.push(
      'Staging Script, deployment, Sheet, receipt folder and backup folder must be five distinct resources.',
    );
  }
  if (
    productionReferenceInventoryValid &&
    productionValues.every(Boolean) &&
    new Set(productionValues).size !== productionValues.length
  ) {
    errors.push(
      'Production Script, deployment, Sheet, receipt folder and backup folder must be distinct resources.',
    );
  }
  if (stageValues.some((value) => value && productionSet.has(value))) {
    errors.push(
      'At least one staging resource identifier is also configured as a production resource.',
    );
  }

  const ownerAttestedIsolation = stagingOnlyMode
    ? isolationAttestation === RESOURCE_ISOLATION_ATTESTATION
    : mode === 'artifact' &&
      !hasAnyProductionReferenceValue &&
      isolationAttestation === RESOURCE_ISOLATION_ATTESTATION;

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
    if (!/^\S+@\S+\.\S+$/.test(ownerEmail))
      errors.push('A valid dedicated staging owner email is required.');
    if (!/^\S+@\S+\.\S+$/.test(managerEmail))
      errors.push('A valid dedicated staging manager email is required.');
    if (ownerEmail && managerEmail && ownerEmail === managerEmail)
      errors.push('The staging owner and manager UAT accounts must be different accounts.');
    if (!isStrongPassword(ownerPassword))
      errors.push('The staging owner UAT password must be 8–128 characters.');
    if (!isStrongPassword(managerPassword))
      errors.push('The staging manager UAT password must be 8–128 characters.');
    if (ownerPassword && managerPassword && ownerPassword === managerPassword)
      errors.push('Use different passwords for the staging owner and manager UAT accounts.');
  }

  let claspCredentialShapeValid = null;
  if (mode === 'deploy' || mode === 'readiness') {
    if (mode === 'deploy' && String(env.CV_STAGING_DEPLOY_CONFIRMATION || '') !== 'STAGING-ONLY') {
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
    if (!claspCredentialShapeValid)
      errors.push(
        'CLASPRC_JSON must be valid Clasp credentials in either legacy token/oauth2ClientSettings format or Clasp 3.x tokens.default format.',
      );
  }

  return {
    ok: errors.length === 0,
    errors,
    productionApiUrl,
    checks: {
      claspCredentialShapeValid,
      stagingOnlyMode,
      targetIdsAreSeparated:
        stageValues.every(Boolean) &&
        new Set(stageValues).size === stageValues.length &&
        (stagingOnlyMode
          ? ownerAttestedIsolation
          : stageValues.every((value) => !productionSet.has(value)) &&
            (productionReferenceInventoryValid || ownerAttestedIsolation)),
      productionResourceReferencesPresent: productionReferenceInventoryValid,
      ownerAttestedIsolationUsed: ownerAttestedIsolation,
      stagingApiUrlMatchesConfiguredDeployment:
        Boolean(stagingUrl) &&
        stagingUrl.hostname === 'script.google.com' &&
        stagingUrl.pathname === '/macros/s/' + stagingDeploymentId + '/exec',
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
      productionResourceInventory: checks.stagingOnlyMode
        ? 'not-required'
        : status(checks.productionResourceReferencesPresent),
      stagingOnlyMode: checks.stagingOnlyMode
        ? checks.ownerAttestedIsolationUsed && checks.targetIdsAreSeparated
          ? 'pass'
          : 'blocked'
        : 'not-required',
      stagingEndpoint: status(checks.stagingApiUrlMatchesConfiguredDeployment),
      dedicatedUatAccounts: status(checks.dedicatedUatAccountsPresent),
      claspCredentialShape: status(checks.claspCredentialShapeValid),
    },
    blockers: result.errors.map((message) => String(message)),
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
    'Staging preflight passed: staging target identity and API URL/deployment consistency are valid.',
  );
  if (result.checks.productionResourceReferencesPresent) {
    console.log(
      'Staging resource IDs were compared with the configured production resource inventory.',
    );
  } else {
    console.log(
      'Staging-only mode is owner-attested; production resources are not part of this deployment stage.',
    );
  }
  if (mode === 'artifact') {
    console.log(
      'Artifact target URL and resource-isolation preflight passed; no UAT accounts or remote writes were tested.',
    );
  } else if (mode === 'readiness') {
    console.log(
      'Configuration-only readiness passed. No Google API calls, deployments, UAT writes or restore verification were performed.',
    );
    console.log('Sanitized category evidence was written when an output path was supplied.');
  } else {
    console.log('Staging URL shape and dedicated owner/manager UAT credentials are valid.');
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
