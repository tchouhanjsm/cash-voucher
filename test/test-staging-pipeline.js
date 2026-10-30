'use strict';
const assert = require('node:assert/strict');
const { validateStagingConfiguration } = require('../scripts/staging-preflight');
const { cleanupTemporaryDirectories, sanitized } = require('../scripts/deploy-staging');
const fs = require('node:fs');
const path = require('node:path');

const runner = fs.readFileSync(path.resolve(__dirname, '../scripts/run-staging-uat.sh'), 'utf8');
assert.match(runner, /mktemp -d/);
assert.match(runner, /set -o noclobber/);
assert.match(runner, /env -i/);
assert.match(runner, /env -u GITHUB_OUTPUT -u GITHUB_ENV -u GITHUB_PATH -u GITHUB_STEP_SUMMARY/);
assert.doesNotMatch(runner, /\/tmp\/cash-voucher-staging-(?:uat|server)\.log/);
assert.doesNotMatch(runner, /tee "\$\{UAT_LOG_FILE\}"/);
assert.match(runner, /detailed transcript is withheld from workflow logs/);

const fixture = {
  CV_STAGING_SCRIPT_ID: 'staging-script-fixture',
  CV_STAGING_DEPLOYMENT_ID: 'staging-deployment-fixture',
  CV_STAGING_API_URL: 'https://script.google.com/macros/s/staging-deployment-fixture/exec',
  CV_STAGING_SPREADSHEET_ID: 'staging-sheet-fixture',
  CV_STAGING_RECEIPT_FOLDER_ID: 'staging-receipts-fixture',
  CV_STAGING_BACKUP_FOLDER_ID: 'staging-backups-fixture',
  CV_STAGING_UAT_OWNER_EMAIL: 'uat-owner@example.test',
  CV_STAGING_UAT_OWNER_PASSWORD: 'UAT#Owner2026',
  CV_STAGING_UAT_MANAGER_EMAIL: 'uat-manager@example.test',
  CV_STAGING_UAT_MANAGER_PASSWORD: 'UAT#Manager2026',
  CV_STAGING_DEPLOY_CONFIRMATION: 'STAGING-ONLY',
  CLASPRC_JSON: JSON.stringify({ tokens: { default: {
    type: 'authorized_user', refresh_token: 'fixture-refresh-token',
    client_id: 'fixture-client-id', client_secret: 'fixture-client-secret',
  } } }),
};
const validUat = validateStagingConfiguration(fixture, { mode: 'uat' });
assert.equal(validUat.ok, true, validUat.errors.join('; '));
assert.equal(validUat.deploymentScope, 'staging-only');
assert.equal(validUat.checks.targetIdsAreSeparated, true);
assert.equal(validUat.checks.productionResourceReferencesPresent, false);
assert.equal(validUat.checks.stagingApiUrlMatchesConfiguredDeployment, true);
assert.equal(validUat.checks.dedicatedUatAccountsPresent, true);
assert.equal(validateStagingConfiguration(fixture, { mode: 'deploy' }).ok, true);
assert.equal(validateStagingConfiguration(fixture, { mode: 'readiness' }).ok, true);
for (const broken of [
  { CV_STAGING_API_URL: '' },
  { CV_STAGING_DEPLOYMENT_ID: 'different' },
  { CV_STAGING_API_URL: 'https://evil.example/macros/s/staging-deployment-fixture/exec' },
  { CV_STAGING_API_URL: fixture.CV_STAGING_API_URL + '?x=1' },
  { CV_STAGING_BACKUP_FOLDER_ID: fixture.CV_STAGING_RECEIPT_FOLDER_ID },
  { CV_PRODUCTION_SCRIPT_ID: 'unexpected-production-fixture' },
]) assert.equal(validateStagingConfiguration({ ...fixture, ...broken }, { mode: 'uat' }).ok, false);

const artifact = validateStagingConfiguration({
  ...fixture, CV_STAGING_UAT_OWNER_EMAIL: '', CV_STAGING_UAT_OWNER_PASSWORD: '',
  CV_STAGING_UAT_MANAGER_EMAIL: '', CV_STAGING_UAT_MANAGER_PASSWORD: '', CLASPRC_JSON: '',
}, { mode: 'artifact' });
assert.equal(artifact.ok, true, artifact.errors.join('; '));
assert.equal(artifact.checks.dedicatedUatAccountsPresent, null);
const legacyClasp = validateStagingConfiguration({
  ...fixture,
  CLASPRC_JSON: JSON.stringify({ token: { refresh_token: 'legacy' }, oauth2ClientSettings: { clientId: 'legacy-id', clientSecret: 'legacy-secret' } }),
}, { mode: 'deploy' });
assert.equal(legacyClasp.ok, true, legacyClasp.errors.join('; '));
const invalidClasp = validateStagingConfiguration({ ...fixture, CLASPRC_JSON: JSON.stringify({ tokens: { default: { client_id: 'id-only' } } }) }, { mode: 'deploy' });
assert.equal(invalidClasp.ok, false);
assert.ok(invalidClasp.errors.some((message) => message.includes('CLASPRC_JSON')));
assert.equal(validateStagingConfiguration({ ...fixture, CV_STAGING_DEPLOY_CONFIRMATION: '' }, { mode: 'deploy' }).ok, false);
assert.equal(validateStagingConfiguration({ ...fixture, CV_STAGING_UAT_MANAGER_EMAIL: fixture.CV_STAGING_UAT_OWNER_EMAIL }, { mode: 'uat' }).ok, false);
assert.equal(validateStagingConfiguration({ ...fixture, CV_STAGING_UAT_OWNER_PASSWORD: 'short' }, { mode: 'uat' }).ok, false);

const credentialDocument = JSON.stringify({
  token: { access_token: 'ACCESS_TOKEN_SECRET_VALUE', refresh_token: 'REFRESH_TOKEN_SECRET_VALUE', scope: 'OAUTH_SCOPE_SECRET_VALUE' },
  oauth2ClientSettings: { clientId: 'OAUTH_CLIENT_ID_SECRET_VALUE', clientSecret: 'OAUTH_CLIENT_SECRET_VALUE', redirectUri: 'OAUTH_REDIRECT_SECRET_VALUE' },
});
const safe = sanitized(['ACCESS_TOKEN_SECRET_VALUE','REFRESH_TOKEN_SECRET_VALUE','OAUTH_CLIENT_ID_SECRET_VALUE','OAUTH_CLIENT_SECRET_VALUE','OAUTH_REDIRECT_SECRET_VALUE',credentialDocument].join('\n'), { ...fixture, CLASPRC_JSON: credentialDocument });
for (const secret of ['ACCESS_TOKEN_SECRET_VALUE','REFRESH_TOKEN_SECRET_VALUE','OAUTH_SCOPE_SECRET_VALUE','OAUTH_CLIENT_ID_SECRET_VALUE','OAUTH_CLIENT_SECRET_VALUE','OAUTH_REDIRECT_SECRET_VALUE']) assert.equal(safe.includes(secret), false);
assert.ok(safe.includes('[redacted]'));

const remaining = new Set(['/tmp/stage-workspace','/tmp/stage-home']);
assert.equal(cleanupTemporaryDirectories([...remaining], {
  rmSync(directory) { remaining.delete(directory); },
  existsSync(directory) { return remaining.has(directory); },
}), true);
assert.equal(remaining.size, 0);
const attempted = [];
assert.equal(cleanupTemporaryDirectories(['/tmp/one','/tmp/two'], {
  rmSync(directory) { attempted.push(directory); if (directory === '/tmp/one') throw new Error('simulated'); },
  existsSync(directory) { return directory === '/tmp/one'; },
}), false);
assert.deepEqual(attempted, ['/tmp/one','/tmp/two']);
console.log('Staging preflight OK — staging-only scope, pairwise resource distinctness, URL/deployment match, credential shape and fail-closed cases.');
