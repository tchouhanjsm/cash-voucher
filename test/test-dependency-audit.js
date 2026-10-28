'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const auditScript = path.join(__dirname, '..', 'scripts', 'dependency-audit.js');
const allowedZodUrl = 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5';
const allowedZodAdvisory = {
  title: 'Zod uncontrolled resource consumption via container validation',
  url: allowedZodUrl,
  severity: 'high',
  range: '<4.6.6',
};

function baselineReport() {
  const fixAvailable = {
    name: '@google/clasp',
    version: '2.5.0',
    isSemVerMajor: true,
  };

  return {
    metadata: {
      vulnerabilities: {
        total: 2,
        critical: 0,
        high: 2,
        moderate: 0,
        low: 0,
        info: 0,
      },
    },
    vulnerabilities: {
      '@google/clasp': {
        severity: 'high',
        isDirect: true,
        range: '>=3.0.0-alpha1',
        nodes: ['node_modules/@google/clasp'],
        fixAvailable,
        via: ['zod'],
      },
      zod: {
        severity: 'high',
        isDirect: false,
        range: '<4.6.6',
        nodes: ['node_modules/zod'],
        fixAvailable,
        via: [{ ...allowedZodAdvisory }],
      },
    },
  };
}

function runAudit(report, exitCode = 1, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-audit-'));
  const fixturePath = path.join(directory, 'audit.json');
  const npmPath = path.join(directory, 'npm');
  const callCountPath = path.join(directory, 'npm-audit-call-count.txt');
  const fakeNpm = [
    `#!${process.execPath}`,
    "const fs = require('node:fs');",
    "const count = (Number(fs.existsSync(process.env.NPM_AUDIT_CALL_COUNT) ? fs.readFileSync(process.env.NPM_AUDIT_CALL_COUNT, 'utf8') : '0') || 0) + 1;",
    'fs.writeFileSync(process.env.NPM_AUDIT_CALL_COUNT, String(count));',
    "if (process.env.NPM_AUDIT_FAIL_ONCE === 'true' && count === 1) { process.stdout.write(JSON.stringify({ error: {} })); process.exit(1); }",
    "process.stdout.write(fs.readFileSync(process.env.NPM_AUDIT_FIXTURE, 'utf8'));",
    'process.exit(Number(process.env.NPM_AUDIT_EXIT_CODE || 1));',
    '',
  ].join('\n');

  fs.writeFileSync(fixturePath, JSON.stringify(report));
  fs.writeFileSync(npmPath, fakeNpm);
  fs.chmodSync(npmPath, 0o755);

  try {
    return spawnSync(process.execPath, [auditScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: directory + path.delimiter + process.env.PATH,
        NPM_AUDIT_FIXTURE: fixturePath,
        NPM_AUDIT_EXIT_CODE: String(exitCode),
        NPM_AUDIT_CALL_COUNT: callCountPath,
        NPM_AUDIT_FAIL_ONCE: options.failOnce ? 'true' : 'false',
      },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('permits only the documented temporary Zod advisory chain', () => {
  const result = runAudit(baselineReport());

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /REVIEWED EXCEPTION: GHSA-vfj7-8cjw-p6xm/);
  assert.match(result.stdout, /REVIEWED EXCEPTION: GHSA-mrhx-c7xc-m3w5/);
  assert.match(result.stdout, /Dependency security gate passed/);
});

test('retries a transient npm audit service error and then enforces the returned report', () => {
  const result = runAudit(baselineReport(), 1, { failOnce: true });

  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout + result.stderr;
  assert.match(output, /received a transient audit-service error; retrying once/);
  assert.match(output, /Dependency security gate passed/);
});

test('fails closed after repeated empty npm audit service errors', () => {
  const result = runAudit({ error: {} }, 1);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /npm audit failed: unknown error/);
  assert.match(result.stderr, /npm audit error details: \{\}/);
  assert.match(result.stderr, /received a transient audit-service error; retrying once/);
});

test('pins body-parser to its patched release in manifest and lockfile', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
  );
  const packageLock = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'),
  );
  const bodyParser = packageLock.packages?.['node_modules/body-parser'];
  const nestedContentType =
    packageLock.packages?.['node_modules/body-parser/node_modules/content-type'];

  assert.equal(packageJson.overrides?.['body-parser'], '2.4.0');
  assert.equal(bodyParser?.version, '2.4.0');
  assert.equal(
    bodyParser?.resolved,
    'https://registry.npmjs.org/body-parser/-/body-parser-2.4.0.tgz',
  );
  assert.equal(
    bodyParser?.integrity,
    'sha512-Ifk1KcLrxaGt1occQagQNFNNOqRt1LFuehEnHHzB8Z6cRgIxRU1TBaiIsUiCdA+gy5PL7Y1IX31DNKkRmxtXjQ==',
  );
  assert.equal(nestedContentType?.version, '2.1.0');
  assert.equal(packageLock.packages?.['node_modules/qs']?.version, '6.16.1');
});

test('does not blanket-allow a second Zod advisory', () => {
  const report = baselineReport();
  report.vulnerabilities.zod.via.push({
    title: 'unrelated second Zod advisory',
    url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
    severity: 'high',
    range: '*',
  });

  const result = runAudit(report);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Dependency security gate failed/);
  assert.doesNotMatch(result.stdout, /REVIEWED EXCEPTION: GHSA-mrhx-c7xc-m3w5/);
});

test('blocks an unrelated high-severity advisory', () => {
  const report = baselineReport();
  report.metadata.vulnerabilities.total += 1;
  report.metadata.vulnerabilities.high += 1;
  report.vulnerabilities['new-package'] = {
    severity: 'high',
    isDirect: false,
    range: '*',
    nodes: ['node_modules/new-package'],
    via: [
      {
        title: 'unrelated high severity advisory',
        url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
        severity: 'high',
        range: '*',
      },
    ],
  };

  const result = runAudit(report);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Dependency security gate failed/);
  assert.match(result.stderr, /new-package/);
});

test('does not allow a stale audit result to revive the withdrawn braces advisory', () => {
  const report = baselineReport();
  report.metadata.vulnerabilities.total += 2;
  report.metadata.vulnerabilities.high += 2;
  report.vulnerabilities['@google/clasp'].via = ['micromatch', 'zod'];
  report.vulnerabilities.micromatch = {
    severity: 'high',
    isDirect: false,
    range: '>=0.2.0',
    nodes: ['node_modules/micromatch'],
    fixAvailable: {
      name: '@google/clasp',
      version: '2.5.0',
      isSemVerMajor: true,
    },
    via: ['braces'],
  };
  report.vulnerabilities.braces = {
    severity: 'high',
    isDirect: false,
    range: '*',
    nodes: ['node_modules/braces'],
    fixAvailable: {
      name: '@google/clasp',
      version: '2.5.0',
      isSemVerMajor: true,
    },
    via: [
      {
        title: 'withdrawn braces stack-exhaustion advisory',
        url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
        severity: 'high',
        range: '<=3.0.3',
      },
    ],
  };

  const result = runAudit(report);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Dependency security gate failed/);
  assert.doesNotMatch(result.stdout, /REVIEWED EXCEPTION: GHSA-vfj7-8cjw-p6xm/);
  assert.match(result.stdout, /braces: severity=high/);
});

test('reports but does not block moderate-only findings', () => {
  const report = {
    metadata: {
      vulnerabilities: {
        total: 1,
        critical: 0,
        high: 0,
        moderate: 1,
        low: 0,
        info: 0,
      },
    },
    vulnerabilities: {
      'moderate-package': {
        severity: 'moderate',
        isDirect: false,
        range: '*',
        nodes: ['node_modules/moderate-package'],
        via: [
          {
            title: 'moderate issue',
            url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
            severity: 'moderate',
            range: '*',
          },
        ],
      },
    },
  };

  const result = runAudit(report);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /severity=moderate/);
  assert.match(result.stdout, /Dependency security gate passed/);
});
