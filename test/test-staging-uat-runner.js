'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const runnerPath = path.join(repositoryRoot, 'scripts/run-staging-uat.sh');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-uat-runner-'));
const binRoot = path.join(tempRoot, 'bin');
const childEnvironmentPath = path.join(tempRoot, 'isolated-child-environment.txt');

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o700 });
  fs.chmodSync(filePath, 0o700);
}

try {
  fs.mkdirSync(binRoot);

  writeExecutable(
    path.join(binRoot, 'node'),
    [
      '#!/bin/sh',
      'set -eu',
      'case "${1:-}" in',
      '  scripts/staging-preflight.js) exit 0 ;;',
      '  scripts/staging-web-server.js) env > "' + childEnvironmentPath + '"; exec sleep 30 ;;',
      '  *) echo "Unexpected Node command in UAT runner harness." >&2; exit 91 ;;',
      'esac',
      '',
    ].join('\n'),
  );

  writeExecutable(
    path.join(binRoot, 'python3'),
    [
      '#!/bin/sh',
      'set -eu',
      'case "${1:-}" in',
      '  -c) exit 0 ;;',
      '  test/uat_staging.py) exit 0 ;;',
      '  *) echo "Unexpected Python command in UAT runner harness." >&2; exit 92 ;;',
      'esac',
      '',
    ].join('\n'),
  );

  writeExecutable(path.join(binRoot, 'curl'), '#!/bin/sh\nexit 0\n');

  const environment = {
    PATH: binRoot + path.delimiter + (process.env.PATH || ''),
    HOME: tempRoot,
    TMPDIR: tempRoot,
    RUNNER_TEMP: tempRoot,
    PYTHON_BIN: 'python3',
    STAGING_WEB_PORT: '9876',
    CV_STAGING_SCRIPT_ID: 'staging-script-id',
    CV_STAGING_DEPLOYMENT_ID: 'staging-deployment-id',
    CV_STAGING_API_URL: 'https://script.google.com/macros/s/staging-deployment-id/exec',
    CV_STAGING_SPREADSHEET_ID: 'staging-spreadsheet-id',
    CV_STAGING_RECEIPT_FOLDER_ID: 'staging-receipt-folder-id',
    CV_STAGING_BACKUP_FOLDER_ID: 'staging-backup-folder-id',
    CV_STAGING_ONLY_MODE: 'true',
    CV_STAGING_RESOURCE_ISOLATION_ATTESTATION: 'OWNER-VERIFIED-STAGING-ONLY',
    CV_TEST_PARENT_ONLY: 'must-not-cross-env-i',
  };

  const result = spawnSync('bash', [runnerPath], {
    cwd: repositoryRoot,
    env: environment,
    encoding: 'utf8',
    timeout: 15000,
  });

  assert.equal(
    result.status,
    0,
    [
      'Staging UAT runner must start in an owner-attested staging-only environment',
      'with all production reference variables absent.',
      result.stdout,
      result.stderr,
    ].join('\n'),
  );
  assert.equal(result.error, undefined, 'UAT runner harness must complete without spawn errors');
  assert.equal(fs.existsSync(childEnvironmentPath), true, 'isolated server process must start');

  const childEnvironment = Object.fromEntries(
    fs
      .readFileSync(childEnvironmentPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=');
        return [entry.slice(0, separator), entry.slice(separator + 1)];
      }),
  );

  assert.equal(childEnvironment.CV_STAGING_ONLY_MODE, 'true');
  assert.equal(
    childEnvironment.CV_STAGING_RESOURCE_ISOLATION_ATTESTATION,
    'OWNER-VERIFIED-STAGING-ONLY',
  );
  for (const key of [
    'CV_STAGING_SCRIPT_ID',
    'CV_STAGING_DEPLOYMENT_ID',
    'CV_STAGING_API_URL',
    'CV_STAGING_SPREADSHEET_ID',
    'CV_STAGING_RECEIPT_FOLDER_ID',
    'CV_STAGING_BACKUP_FOLDER_ID',
  ]) {
    assert.ok(childEnvironment[key], `isolated server must receive ${key}`);
  }

  for (const key of [
    'CV_PRODUCTION_SCRIPT_ID',
    'CV_PRODUCTION_SPREADSHEET_ID',
    'CV_PRODUCTION_RECEIPT_FOLDER_ID',
    'CV_PRODUCTION_BACKUP_FOLDER_ID',
    'CV_TEST_PARENT_ONLY',
  ]) {
    assert.equal(childEnvironment[key], undefined, `isolated server must not receive ${key}`);
  }

  console.log(
    'Staging UAT runner isolation passed: production references can be absent, staging attestation is forwarded, and unrelated parent variables stay isolated.',
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
