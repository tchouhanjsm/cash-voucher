'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const reportOnly = process.argv.includes('--report-only');
const maxAttempts = 2;
const timeoutMs = 60_000;

function isTransientAuditFailure(result, report) {
  const details = [
    result && result.error && result.error.message,
    result && result.error && result.error.code,
    result && result.stderr,
    report && report.error && JSON.stringify(report.error),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    result &&
    result.error &&
    ['etimedout', 'eai_again', 'enotfound', 'econnreset', 'econnrefused', 'ehostunreach'].includes(
      String(result.error.code || '').toLowerCase(),
    )
  ) {
    return true;
  }

  // npm sometimes returns an empty { "error": {} } when the audit endpoint fails.
  // Retry that response once, but fail closed if the service remains unavailable.
  return Boolean(
    report &&
    report.error &&
    (Object.keys(report.error).length === 0 ||
      /temporarily unavailable|eai_again|enotfound|econnreset|econnrefused|ehostunreach|etimedout|socket hang up|fetch failed|network error|\b5\d\d\b/.test(
        details,
      )),
  );
}

function sleepBriefly() {
  // Keep CI resilient to a transient registry hiccup without introducing a dependency.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}

function runAudit() {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = spawnSync('npm', ['audit', '--json'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: timeoutMs,
    });

    if (result.error) {
      const transient =
        result.error.code === 'ETIMEDOUT' ||
        ['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH'].includes(
          result.error.code,
        );

      if (transient && attempt < maxAttempts) {
        console.warn(
          'npm audit encountered a transient process/network error; retrying once (' +
            attempt +
            ' of ' +
            maxAttempts +
            ').',
        );
        sleepBriefly();
        continue;
      }

      console.error(
        'npm audit process failed: ' +
          result.error.message +
          (result.error.code ? ' (' + result.error.code + ')' : ''),
      );
      if (result.status !== null) console.error('npm audit exit status: ' + result.status);
      if (result.signal) console.error('npm audit termination signal: ' + result.signal);
      if (result.stderr) console.error(result.stderr.trim());
      process.exit(2);
    }

    let report;
    try {
      report = JSON.parse(result.stdout || '');
    } catch {
      console.error('npm audit did not return valid JSON.');
      if (result.stderr) console.error(result.stderr.trim());
      process.exit(2);
    }

    if (report.error && isTransientAuditFailure(result, report) && attempt < maxAttempts) {
      console.warn(
        'npm audit received a transient audit-service error; retrying once (' +
          attempt +
          ' of ' +
          maxAttempts +
          ').',
      );
      sleepBriefly();
      continue;
    }

    if (report.error) {
      console.error(
        'npm audit failed: ' + (report.error.summary || report.error.message || 'unknown error'),
      );
      console.error('npm audit error details: ' + JSON.stringify(report.error));
      if (result.status !== null) console.error('npm audit exit status: ' + result.status);
      if (result.signal) console.error('npm audit termination signal: ' + result.signal);
      if (result.stderr) console.error(result.stderr.trim());
      process.exit(2);
    }

    return { report, result };
  }

  console.error('npm audit failed after all bounded attempts.');
  process.exit(2);
}

const { report, result } = runAudit();

const exceptions = {
  'GHSA-vfj7-8cjw-p6xm': {
    packageName: 'braces',
    reviewBy: '2026-11-09',
    rationale:
      'No patched release is listed by the upstream GitHub advisory as of 2026-10-16. ' +
      'This is a dev-tool dependency path: @google/clasp -> micromatch -> braces.',
  },
  'GHSA-mrhx-c7xc-m3w5': {
    packageName: 'zod',
    reviewBy: '2026-11-09',
    rationale:
      'The current upstream @google/clasp 3.4.1 release declares zod ^3.25.76. ' +
      'The advisory fix begins at zod 4.6.6, a major-version change outside that ' +
      'declared range. This exact advisory is temporarily excepted for the local/CI ' +
      'developer-tool chain only while compatibility is verified; zod is not shipped ' +
      'in the static client artifact. Reassess Clasp/upstream compatibility by 2026-11-09.',
  },
};

let dependencyContextCache;

function readDependencyContext() {
  if (dependencyContextCache !== undefined) return dependencyContextCache;
  try {
    dependencyContextCache = {
      manifest: JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
      ),
      lock: JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'),
      ),
    };
  } catch {
    dependencyContextCache = null;
  }
  return dependencyContextCache;
}

function hasRuntimeDependency(manifest, name) {
  return ['dependencies', 'optionalDependencies', 'peerDependencies'].some((section) =>
    Object.prototype.hasOwnProperty.call(manifest[section] || {}, name),
  );
}

function exceptionScopeSatisfied(id, packageName, item) {
  const context = readDependencyContext();
  if (!context || item.isDirect !== false) return false;
  const { manifest, lock } = context;
  const rootLock = lock.packages && lock.packages[''];
  const clasp = lock.packages && lock.packages['node_modules/@google/clasp'];
  const noRuntimeClasp = !hasRuntimeDependency(manifest, '@google/clasp');
  const claspIsDevDependency = Boolean(
    manifest.devDependencies && manifest.devDependencies['@google/clasp'] &&
    rootLock && rootLock.devDependencies && rootLock.devDependencies['@google/clasp'],
  );
  if (!rootLock || !clasp || !noRuntimeClasp || !claspIsDevDependency) return false;

  const expectedNode = 'node_modules/' + packageName;
  if (
    !Array.isArray(item.nodes) ||
    !item.nodes.length ||
    !item.nodes.every((node) => node === expectedNode)
  ) {
    return false;
  }

  if (id === 'GHSA-mrhx-c7xc-m3w5' && packageName === 'zod') {
    const zod = lock.packages['node_modules/zod'];
    const sdk = lock.packages['node_modules/@modelcontextprotocol/sdk'];
    return Boolean(
      !hasRuntimeDependency(manifest, 'zod') &&
      !(rootLock.dependencies && rootLock.dependencies.zod) &&
      clasp.version === '3.4.1' &&
      clasp.dependencies && clasp.dependencies.zod === '^3.25.76' &&
      sdk && sdk.dependencies && sdk.dependencies.zod === '^3.25 || ^4.0' &&
      zod && zod.version === '3.25.76' &&
      item.range === '<4.6.6'
    );
  }

  if (id === 'GHSA-vfj7-8cjw-p6xm' && packageName === 'braces') {
    const micromatch = lock.packages['node_modules/micromatch'];
    const braces = lock.packages['node_modules/braces'];
    return Boolean(
      !hasRuntimeDependency(manifest, 'braces') &&
      !(rootLock.dependencies && rootLock.dependencies.braces) &&
      clasp.version === '3.4.1' &&
      clasp.dependencies && clasp.dependencies.micromatch === '^4.0.8' &&
      micromatch && micromatch.version === '4.0.8' &&
      micromatch.dependencies && micromatch.dependencies.braces === '^3.0.3' &&
      braces && braces.version === '3.0.3' &&
      item.range === '<=3.0.3'
    );
  }

  return false;
}

function advisoryId(advisory) {
  const text = [advisory.url, advisory.title, advisory.name].filter(Boolean).join(' ');
  return text.match(/GHSA-[a-z0-9-]+/i)?.[0] || null;
}

function coveredByReviewedException(packageName, ancestors = []) {
  if (ancestors.includes(packageName)) return null;

  const item = report.vulnerabilities?.[packageName];
  if (!item || !Array.isArray(item.via) || item.via.length === 0) return null;

  const nextAncestors = [...ancestors, packageName];
  const covered = [];

  for (const entry of item.via) {
    if (typeof entry === 'string') {
      const nested = coveredByReviewedException(entry, nextAncestors);
      if (!nested) return null;
      covered.push(...nested);
      continue;
    }

    const id = advisoryId(entry);
    const exception = id && exceptions[id];
    const expired = exception && new Date().toISOString().slice(0, 10) > exception.reviewBy;

    if (
      !exception ||
      exception.packageName !== packageName ||
      expired ||
      !exceptionScopeSatisfied(id, packageName, item)
    ) {
      return null;
    }
    covered.push(id);
  }

  return [...new Set(covered)];
}

const metadata = report.metadata?.vulnerabilities || {};
const vulnerabilities = Object.entries(report.vulnerabilities || {}).sort((a, b) => {
  const rank = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
  return (rank[a[1].severity] ?? 5) - (rank[b[1].severity] ?? 5) || a[0].localeCompare(b[0]);
});

const totals = {
  total: metadata.total ?? vulnerabilities.length,
  critical: metadata.critical ?? 0,
  high: metadata.high ?? 0,
  moderate: metadata.moderate ?? 0,
  low: metadata.low ?? 0,
  info: metadata.info ?? 0,
};
console.log(
  'npm audit summary: ' +
    Object.entries(totals)
      .map(([name, value]) => `${name}=${value}`)
      .join(', '),
);

for (const [name, item] of vulnerabilities) {
  const fix = item.fixAvailable === undefined ? 'unknown' : JSON.stringify(item.fixAvailable);
  const details = {
    severity: item.severity,
    direct: item.isDirect,
    range: item.range,
    installedPaths: (item.nodes || []).join(', ') || 'not reported',
    fixAvailable: fix,
  };
  const detailText = Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
  console.log(`- ${name}: ${detailText}`);

  for (const advisory of item.via || []) {
    if (typeof advisory === 'string') {
      console.log(`  dependency advisory: ${advisory}`);
      continue;
    }

    const id = advisoryId(advisory) || advisory.source || 'unknown-id';
    const title = advisory.title || advisory.name || 'untitled';
    const url = advisory.url || 'not provided';
    console.log(`  advisory: ${id}; ${title}`);
    console.log(`    url: ${url}`);
  }
}

const blocking = [];
const allowedIds = new Set();

for (const [name, item] of vulnerabilities) {
  if (!['high', 'critical'].includes(String(item.severity).toLowerCase())) continue;

  const covered = coveredByReviewedException(name);
  if (!covered || reportOnly) {
    if (!reportOnly) blocking.push(name);
    continue;
  }

  covered.forEach((id) => allowedIds.add(id));
}

for (const id of allowedIds) {
  const exception = exceptions[id];
  console.log(
    `REVIEWED EXCEPTION: ${id}; package=${exception.packageName}; reviewBy=${exception.reviewBy}`,
  );
  console.log(`  rationale: ${exception.rationale}`);
}

if (reportOnly) {
  console.log('Report-only mode: no advisories were enforced by this diagnostic run.');
} else if (blocking.length) {
  const message = [
    'Dependency security gate failed:',
    `${blocking.length} high/critical findings are not covered by a current documented exception:`,
    [...new Set(blocking)].join(', '),
  ].join(' ');
  console.error(message);
  process.exit(1);
} else {
  console.log('Dependency security gate passed: no unexcepted high or critical advisories remain.');
}

if (result.status !== 0 && !vulnerabilities.length) {
  console.error('npm audit exited unsuccessfully without listing vulnerabilities.');
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(result.status || 2);
}
