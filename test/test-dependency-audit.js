'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const auditScript = path.join(__dirname, '..', 'scripts', 'dependency-audit.js');
const allowedUrl = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const allowedAdvisory = {
  title: 'braces stack-exhaustion denial of service',
  url: allowedUrl,
  severity: 'high',
  range: '<=3.0.3',
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
        total: 3,
        critical: 0,
        high: 3,
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
        via: ['micromatch'],
      },
      braces: {
        severity: 'high',
        isDirect: false,
        range: '*',
        nodes: ['node_modules/braces'],
        fixAvailable,
        via: [{ ...allowedAdvisory }],
      },
      micromatch: {
        severity: 'high',
        isDirect: false,
        range: '>=0.2.0',
        nodes: ['node_modules/micromatch'],
        fixAvailable,
        via: ['braces'],
      },
    },
  };
}

function runAudit(report, exitCode = 1) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cash-voucher-audit-'));
  const fixturePath = path.join(directory, 'audit.json');
  const npmPath = path.join(directory, 'npm');
  const fakeNpm = [
    `#!${process.execPath}`,
    "const fs = require('node:fs');",
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
      },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('permits only the documented unpatched braces advisory chain', () => {
  const result = runAudit(baselineReport());

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /REVIEWED EXCEPTION: GHSA-vfj7-8cjw-p6xm/);
  assert.match(result.stdout, /Dependency security gate passed/);
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

test('does not blanket-allow a second advisory on an exempted package', () => {
  const report = baselineReport();
  report.vulnerabilities.braces.via.push({
    title: 'second braces advisory',
    url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
    severity: 'high',
    range: '<=3.0.3',
  });

  const result = runAudit(report);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Dependency security gate failed/);
  assert.doesNotMatch(result.stdout, /REVIEWED EXCEPTION/);
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
