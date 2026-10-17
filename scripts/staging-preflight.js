'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ID_KEYS = [
  'CV_STAGING_SCRIPT_ID',
  'CV_PRODUCTION_SCRIPT_ID',
  'CV_STAGING_DEPLOYMENT_ID',
  'CV_STAGING_SPREADSHEET_ID',
  'CV_PRODUCTION_SPREADSHEET_ID',
  'CV_STAGING_RECEIPT_FOLDER_ID',
  'CV_PRODUCTION_RECEIPT_FOLDER_ID',
  'CV_STAGING_BACKUP_FOLDER_ID',
  'CV_PRODUCTION_BACKUP_FOLDER_ID',
];

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
  let productionApiUrl = '';
  let productionDeploymentId = '';

  if (!['uat', 'deploy'].includes(mode)) {
    errors.push('Unsupported preflight mode.');
  }

  for (const key of ID_KEYS) {
    if (isPlaceholder(String(env[key] || '').trim())) {
      errors.push('Missing or placeholder environment value: ' + key + '.');
    }
  }

  try {
    productionApiUrl = readProductionApiUrl(root);
    const productionUrl = new URL(productionApiUrl);
    const match = productionUrl.pathname.match(/^\/macros\/s\/([^/]+)\/exec\/?$/);
    if (!match) throw new Error('Configured production URL shape is invalid.');
    productionDeploymentId = match[1];
  } catch {
    errors.push('Could not identify one valid production Apps Script Web App URL from config.js.');
  }

  let stagingUrl;
  const stagingApiUrl = String(env.CV_STAGING_API_URL || '').trim();
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
      if (
        stagingUrl.pathname !==
        '/macros/s/' + String(env.CV_STAGING_DEPLOYMENT_ID || '').trim() + '/exec'
      ) {
        errors.push(
          'The staging API URL path must be the exact configured /exec endpoint without a trailing slash.',
        );
      }
      if (!match || match[1] !== String(env.CV_STAGING_DEPLOYMENT_ID || '').trim()) {
        errors.push('The staging API URL does not match CV_STAGING_DEPLOYMENT_ID.');
      }
      if (productionApiUrl && normalizeUrl(stagingApiUrl) === normalizeUrl(productionApiUrl)) {
        errors.push(
          'The staging API URL resolves to the production endpoint; refusing to continue.',
        );
      }
      if (match && productionDeploymentId && match[1] === productionDeploymentId) {
        errors.push('The staging deployment ID matches the production URL deployment ID.');
      }
    } catch {
      errors.push('The staging API URL is not a valid URL.');
    }
  }

  const stageValues = [
    String(env.CV_STAGING_SCRIPT_ID || '').trim(),
    String(env.CV_STAGING_DEPLOYMENT_ID || '').trim(),
    String(env.CV_STAGING_SPREADSHEET_ID || '').trim(),
    String(env.CV_STAGING_RECEIPT_FOLDER_ID || '').trim(),
    String(env.CV_STAGING_BACKUP_FOLDER_ID || '').trim(),
  ];
  const productionValues = [
    String(env.CV_PRODUCTION_SCRIPT_ID || '').trim(),
    productionDeploymentId,
    String(env.CV_PRODUCTION_SPREADSHEET_ID || '').trim(),
    String(env.CV_PRODUCTION_RECEIPT_FOLDER_ID || '').trim(),
    String(env.CV_PRODUCTION_BACKUP_FOLDER_ID || '').trim(),
  ];

  if (stageValues.every(Boolean) && new Set(stageValues).size !== stageValues.length) {
    errors.push(
      'Staging Script, deployment, Sheet, receipt folder and backup folder must be five distinct resources.',
    );
  }
  if (
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

  const ownerEmail = String(env.CV_STAGING_UAT_OWNER_EMAIL || '')
    .trim()
    .toLowerCase();
  const managerEmail = String(env.CV_STAGING_UAT_MANAGER_EMAIL || '')
    .trim()
    .toLowerCase();
  const ownerPassword = String(env.CV_STAGING_UAT_OWNER_PASSWORD || '');
  const managerPassword = String(env.CV_STAGING_UAT_MANAGER_PASSWORD || '');

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
    errors.push('Use different PINs for the staging owner and manager UAT accounts.');
  }

  if (mode === 'deploy') {
    if (String(env.CV_STAGING_DEPLOY_CONFIRMATION || '') !== 'STAGING-ONLY') {
      errors.push('Deployment requires the explicit STAGING-ONLY confirmation.');
    }
    let claspConfig;
    try {
      claspConfig = JSON.parse(String(env.CLASPRC_JSON || ''));
    } catch {
      claspConfig = null;
    }
    if (
      !claspConfig ||
      typeof claspConfig !== 'object' ||
      Array.isArray(claspConfig) ||
      !claspConfig.token ||
      !claspConfig.oauth2ClientSettings
    ) {
      errors.push('CLASPRC_JSON is missing or is not a valid Clasp OAuth credentials document.');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    productionApiUrl,
    checks: {
      targetIdsAreSeparated:
        stageValues.every(Boolean) &&
        productionValues.every(Boolean) &&
        stageValues.every((value) => !productionSet.has(value)) &&
        new Set(stageValues).size === stageValues.length,
      stagingApiUrlMatchesConfiguredDeployment:
        Boolean(stagingUrl) &&
        stagingUrl.hostname === 'script.google.com' &&
        stagingUrl.pathname ===
          '/macros/s/' + String(env.CV_STAGING_DEPLOYMENT_ID || '').trim() + '/exec',
      dedicatedUatAccountsPresent: Boolean(ownerEmail && managerEmail && ownerPassword && managerPassword),
    },
  };
}

function main() {
  const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='));
  const mode = modeArgument ? modeArgument.slice('--mode='.length) : 'uat';
  const result = validateStagingConfiguration(process.env, { mode });

  if (!result.ok) {
    console.error('STAGING PREFLIGHT FAILED:');
    result.errors.forEach((message) => console.error('- ' + message));
    process.exitCode = 1;
    return;
  }

  console.log(
    'Staging preflight passed: Script, deployment, Sheet and Drive targets are separated from production.',
  );
  console.log('Staging URL shape and dedicated owner/manager UAT credentials are valid.');
  if (mode === 'deploy') {
    console.log('Clasp OAuth configuration is present; credential values are not printed.');
  }
}

if (require.main === module) main();

module.exports = { isStrongPassword, normalizeUrl, readProductionApiUrl, validateStagingConfiguration };
