'use strict';

const assert = require('node:assert/strict');
const {
  readProductionApiUrl,
  validateStagingConfiguration,
} = require('../scripts/staging-preflight');
const { sanitized } = require('../scripts/deploy-staging');

const productionApiUrl = readProductionApiUrl();
const productionDeploymentId = new URL(productionApiUrl).pathname.split('/')[3];
const fixture = {
  CV_STAGING_SCRIPT_ID: 'staging-script-fixture',
  CV_PRODUCTION_SCRIPT_ID: 'production-script-fixture',
  CV_STAGING_DEPLOYMENT_ID: 'staging-deployment-fixture',
  CV_STAGING_API_URL: 'https://script.google.com/macros/s/staging-deployment-fixture/exec',
  CV_STAGING_SPREADSHEET_ID: 'staging-sheet-fixture',
  CV_PRODUCTION_SPREADSHEET_ID: 'production-sheet-fixture',
  CV_STAGING_RECEIPT_FOLDER_ID: 'staging-receipts-fixture',
  CV_PRODUCTION_RECEIPT_FOLDER_ID: 'production-receipts-fixture',
  CV_STAGING_BACKUP_FOLDER_ID: 'staging-backups-fixture',
  CV_PRODUCTION_BACKUP_FOLDER_ID: 'production-backups-fixture',
  CV_STAGING_UAT_OWNER_EMAIL: 'uat-owner@example.test',
  CV_STAGING_UAT_OWNER_PASSWORD: 'UAT#Owner2026',
  CV_STAGING_UAT_MANAGER_EMAIL: 'uat-manager@example.test',
  CV_STAGING_UAT_MANAGER_PASSWORD: 'UAT#Manager2026',
  CV_STAGING_DEPLOY_CONFIRMATION: 'STAGING-ONLY',
  CLASPRC_JSON: JSON.stringify({
    tokens: {
      default: {
        type: 'authorized_user',
        refresh_token: 'fixture-refresh-token',
        client_id: 'fixture-client-id',
        client_secret: 'fixture-client-secret',
      },
    },
  }),
};

assert.ok(productionApiUrl.startsWith('https://script.google.com/macros/s/'));
assert.ok(
  productionDeploymentId,
  'production deployment ID is extracted from the configured /exec URL',
);

const validUat = validateStagingConfiguration(fixture, { mode: 'uat' });
assert.equal(validUat.ok, true, validUat.errors.join('; '));
assert.equal(validUat.checks.targetIdsAreSeparated, true);
assert.equal(validUat.checks.stagingApiUrlMatchesConfiguredDeployment, true);
assert.equal(validUat.checks.dedicatedUatAccountsPresent, true);

const validDeploy = validateStagingConfiguration(fixture, { mode: 'deploy' });
assert.equal(validDeploy.ok, true, validDeploy.errors.join('; '));

const artifactTarget = {
  ...fixture,
  CV_STAGING_UAT_OWNER_EMAIL: '',
  CV_STAGING_UAT_OWNER_PASSWORD: '',
  CV_STAGING_UAT_MANAGER_EMAIL: '',
  CV_STAGING_UAT_MANAGER_PASSWORD: '',
  CLASPRC_JSON: '',
};
const validArtifact = validateStagingConfiguration(artifactTarget, { mode: 'artifact' });
assert.equal(validArtifact.ok, true, validArtifact.errors.join('; '));
assert.equal(validArtifact.checks.targetIdsAreSeparated, true);
assert.equal(validArtifact.checks.dedicatedUatAccountsPresent, null);

const validLegacyClasp = validateStagingConfiguration(
  {
    ...fixture,
    CLASPRC_JSON: JSON.stringify({
      token: { refresh_token: 'legacy-refresh-token' },
      oauth2ClientSettings: {
        clientId: 'legacy-client-id',
        clientSecret: 'legacy-client-secret',
      },
    }),
  },
  { mode: 'deploy' },
);
assert.equal(validLegacyClasp.ok, true, validLegacyClasp.errors.join('; '));

const incompleteModernClasp = validateStagingConfiguration(
  {
    ...fixture,
    CLASPRC_JSON: JSON.stringify({
      tokens: { default: { client_id: 'client-id-only', client_secret: 'client-secret-only' } },
    }),
  },
  { mode: 'deploy' },
);
assert.equal(incompleteModernClasp.ok, false);
assert.ok(incompleteModernClasp.errors.some((message) => message.includes('CLASPRC_JSON')));

const withoutProductionReferenceIds = {
  ...fixture,
  CV_PRODUCTION_SCRIPT_ID: '',
  CV_PRODUCTION_SPREADSHEET_ID: '',
  CV_PRODUCTION_RECEIPT_FOLDER_ID: '',
  CV_PRODUCTION_BACKUP_FOLDER_ID: '',
  CV_STAGING_RESOURCE_ISOLATION_ATTESTATION: 'OWNER-VERIFIED-STAGING-ONLY',
};
const attestedStagingOnly = validateStagingConfiguration(withoutProductionReferenceIds, {
  mode: 'deploy',
});
assert.equal(attestedStagingOnly.ok, true, attestedStagingOnly.errors.join('; '));
assert.equal(attestedStagingOnly.checks.productionResourceReferencesPresent, false);
assert.equal(attestedStagingOnly.checks.ownerAttestedIsolationUsed, true);
assert.equal(attestedStagingOnly.checks.targetIdsAreSeparated, true);

const missingIsolationAttestation = validateStagingConfiguration(
  {
    ...withoutProductionReferenceIds,
    CV_STAGING_RESOURCE_ISOLATION_ATTESTATION: '',
  },
  { mode: 'deploy' },
);
assert.equal(missingIsolationAttestation.ok, false);
assert.ok(
  missingIsolationAttestation.errors.some((message) =>
    message.includes('CV_STAGING_RESOURCE_ISOLATION_ATTESTATION'),
  ),
);

const partialProductionReferenceIds = validateStagingConfiguration(
  {
    ...withoutProductionReferenceIds,
    CV_PRODUCTION_SCRIPT_ID: 'production-script-fixture',
  },
  { mode: 'deploy' },
);
assert.equal(partialProductionReferenceIds.ok, false);
assert.ok(
  partialProductionReferenceIds.errors.some((message) =>
    message.includes('all four production resource reference IDs'),
  ),
);

// Clasp may echo individual OAuth fields rather than the complete JSON document.
// Every string stored under token/oauth settings must therefore be redacted too.
const oauthCredentials = JSON.stringify({
  token: {
    access_token: 'ACCESS_TOKEN_SECRET_VALUE',
    refresh_token: 'REFRESH_TOKEN_SECRET_VALUE',
    id_token: 'ID_TOKEN_SECRET_VALUE',
    scope: 'OAUTH_SCOPE_SECRET_VALUE',
  },
  oauth2ClientSettings: {
    clientId: 'OAUTH_CLIENT_ID_SECRET_VALUE',
    clientSecret: 'OAUTH_CLIENT_SECRET_VALUE',
    redirectUri: 'OAUTH_REDIRECT_SECRET_VALUE',
  },
});
const rawClaspDiagnostic = [
  'access token ACCESS_TOKEN_SECRET_VALUE',
  'refresh token REFRESH_TOKEN_SECRET_VALUE',
  'identity token ID_TOKEN_SECRET_VALUE',
  'client ID OAUTH_CLIENT_ID_SECRET_VALUE',
  'client secret OAUTH_CLIENT_SECRET_VALUE',
  'redirect OAUTH_REDIRECT_SECRET_VALUE',
  oauthCredentials,
].join('\\n');
const safeClaspDiagnostic = sanitized(rawClaspDiagnostic, {
  ...fixture,
  CLASPRC_JSON: oauthCredentials,
});
for (const secret of [
  'ACCESS_TOKEN_SECRET_VALUE',
  'REFRESH_TOKEN_SECRET_VALUE',
  'ID_TOKEN_SECRET_VALUE',
  'OAUTH_SCOPE_SECRET_VALUE',
  'OAUTH_CLIENT_ID_SECRET_VALUE',
  'OAUTH_CLIENT_SECRET_VALUE',
  'OAUTH_REDIRECT_SECRET_VALUE',
]) {
  assert.equal(
    safeClaspDiagnostic.includes(secret),
    false,
    'Clasp diagnostics must redact nested credential value: ' + secret,
  );
}
assert.ok(safeClaspDiagnostic.includes('[redacted]'));

const sameScript = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_SCRIPT_ID: fixture.CV_PRODUCTION_SCRIPT_ID,
});
assert.equal(sameScript.ok, false);
assert.ok(sameScript.errors.some((message) => message.includes('production resource')));

const sameSheet = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_SPREADSHEET_ID: fixture.CV_PRODUCTION_SPREADSHEET_ID,
});
assert.equal(sameSheet.ok, false);
assert.ok(sameSheet.errors.some((message) => message.includes('production resource')));

const sameReceiptFolder = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_RECEIPT_FOLDER_ID: fixture.CV_PRODUCTION_RECEIPT_FOLDER_ID,
});
assert.equal(sameReceiptFolder.ok, false);
assert.ok(sameReceiptFolder.errors.some((message) => message.includes('production resource')));

const sameBackupFolder = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_BACKUP_FOLDER_ID: fixture.CV_PRODUCTION_BACKUP_FOLDER_ID,
});
assert.equal(sameBackupFolder.ok, false);
assert.ok(sameBackupFolder.errors.some((message) => message.includes('production resource')));

const productionDeployment = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_DEPLOYMENT_ID: productionDeploymentId,
  CV_STAGING_API_URL: productionApiUrl,
});
assert.equal(productionDeployment.ok, false);
assert.ok(productionDeployment.errors.some((message) => message.includes('production endpoint')));
assert.ok(
  productionDeployment.errors.some((message) => message.includes('production URL deployment ID')),
);

const productionDeploymentArtifact = validateStagingConfiguration(
  {
    ...artifactTarget,
    CV_STAGING_DEPLOYMENT_ID: productionDeploymentId,
    CV_STAGING_API_URL: productionApiUrl,
  },
  { mode: 'artifact' },
);
assert.equal(productionDeploymentArtifact.ok, false);
assert.ok(
  productionDeploymentArtifact.errors.some((message) => message.includes('production endpoint')),
);

const urlMismatch = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_API_URL: 'https://script.google.com/macros/s/some-other-deployment/exec',
});
assert.equal(urlMismatch.ok, false);
assert.ok(urlMismatch.errors.some((message) => message.includes('does not match')));

const malformedUrl = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_API_URL: 'https://staging.invalid/not-an-apps-script-url',
});
assert.equal(malformedUrl.ok, false);
assert.ok(malformedUrl.errors.some((message) => message.includes('Apps Script URL')));

const missingClasp = validateStagingConfiguration(
  {
    ...fixture,
    CLASPRC_JSON: '',
  },
  { mode: 'deploy' },
);
assert.equal(missingClasp.ok, false);
assert.ok(missingClasp.errors.some((message) => message.includes('CLASPRC_JSON')));

const missingConfirmation = validateStagingConfiguration(
  {
    ...fixture,
    CV_STAGING_DEPLOY_CONFIRMATION: '',
  },
  { mode: 'deploy' },
);
assert.equal(missingConfirmation.ok, false);
assert.ok(missingConfirmation.errors.some((message) => message.includes('STAGING-ONLY')));

const sharedAccount = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_UAT_MANAGER_EMAIL: fixture.CV_STAGING_UAT_OWNER_EMAIL,
});
assert.equal(sharedAccount.ok, false);
assert.ok(sharedAccount.errors.some((message) => message.includes('different accounts')));

const weakPassword = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_UAT_OWNER_PASSWORD: 'short',
});
assert.equal(weakPassword.ok, false);
assert.ok(weakPassword.errors.some((message) => message.includes('8–128 characters')));

const failures = validateStagingConfiguration({
  ...fixture,
  CV_STAGING_SCRIPT_ID: fixture.CV_PRODUCTION_SCRIPT_ID,
  CV_STAGING_API_URL: productionApiUrl,
});
assert.equal(
  JSON.stringify(failures.errors).includes(fixture.CV_STAGING_UAT_OWNER_PASSWORD),
  false,
  'preflight diagnostics never echo a UAT password',
);
assert.equal(
  JSON.stringify(failures.errors).includes(fixture.CLASPRC_JSON),
  false,
  'preflight diagnostics never echo Clasp credential content',
);

console.log(
  'Staging preflight OK — isolated target, URL/deployment matching, credential validation and fail-closed cases.',
);
