'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validateRecoveryEvidence } = require('./validate-recovery-evidence');

const SHA1 = /^[a-f0-9]{40}$/i;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const REPOSITORY = 'tchouhanjsm/cash-voucher';
const SOURCE_REF = 'refs/heads/client-main';
const REQUIRED_SOURCE_CHECKS = ['ciQuality', 'browserE2e', 'fullFlight', 'autonomousMonitor'];
const REQUIRED_PREFLIGHT_CATEGORIES = [
  'stagingResourceSeparation',
  'productionResourceInventory',
  'stagingEndpoint',
  'dedicatedUatAccounts',
  'claspCredentialShape',
];
const REQUIRED_FALSE_BOUNDARIES = [
  'credentialValuesIncluded',
  'resourceIdentifiersIncluded',
  'endpointIncluded',
  'remoteConnectivityTested',
  'ownershipIndependentlyVerified',
  'deploymentChanged',
  'backupRestoreVerified',
];
const REQUIRED_OPERATIONAL_GATES = [
  'ownerBranchProtectionVerified',
  'liveStagingUatPassed',
  'liveSecurityHeadersVerified',
  'liveRoleAuthorizationVerified',
  'offlineReconnectVerified',
  'printPdfVerified',
  'accessibilityVerified',
  'customerAcceptanceApproved',
];
const SAFE_EVIDENCE_REFERENCE = /^[A-Z][A-Z0-9]{1,11}-[A-Z0-9][A-Z0-9._/-]{1,70}$/;
const MAX_STAGING_PREFLIGHT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_RECOVERY_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_OPERATIONAL_EVIDENCE_AGE_MS = {
  ownerBranchProtectionVerified: 30 * 24 * 60 * 60 * 1000,
  liveStagingUatPassed: 7 * 24 * 60 * 60 * 1000,
  liveSecurityHeadersVerified: 7 * 24 * 60 * 60 * 1000,
  liveRoleAuthorizationVerified: 7 * 24 * 60 * 60 * 1000,
  offlineReconnectVerified: 30 * 24 * 60 * 60 * 1000,
  printPdfVerified: 30 * 24 * 60 * 60 * 1000,
  accessibilityVerified: 30 * 24 * 60 * 60 * 1000,
  customerAcceptanceApproved: 7 * 24 * 60 * 60 * 1000,
};
const OPERATIONAL_GATES_REQUIRE_CLIENT_SHA = REQUIRED_OPERATIONAL_GATES.filter(
  (name) => name !== 'ownerBranchProtectionVerified',
);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validTimestamp(value) {
  if (typeof value !== 'string' || !UTC_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function add(errors, code, message) {
  errors.push({ code, message });
}

function isEvidenceWithinAge(referenceTimestamp, observedTimestamp, maximumAgeMs) {
  if (!validTimestamp(referenceTimestamp) || !validTimestamp(observedTimestamp)) return false;
  const ageMs = Date.parse(referenceTimestamp) - Date.parse(observedTimestamp);
  return ageMs >= 0 && ageMs <= maximumAgeMs;
}

function exactKeys(value, keys, path, errors) {
  if (!isRecord(value)) {
    add(errors, 'OBJECT_REQUIRED', path + ' must be a JSON object.');
    return;
  }
  Object.keys(value).forEach((key) => {
    if (!keys.includes(key)) add(errors, 'UNKNOWN_FIELD', path + ' contains an unsupported field.');
  });
  keys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      add(errors, 'MISSING_FIELD', path + ' is missing a required field.');
    }
  });
}

function validateSourceChecks(sourceChecks, commitSha, errors) {
  exactKeys(sourceChecks, REQUIRED_SOURCE_CHECKS, 'sourceChecks', errors);
  if (!isRecord(sourceChecks)) return;

  const runIds = [];
  REQUIRED_SOURCE_CHECKS.forEach((name) => {
    const check = sourceChecks[name];
    exactKeys(check, ['conclusion', 'headSha', 'runId'], 'sourceChecks.' + name, errors);
    if (!isRecord(check)) return;
    if (check.conclusion !== 'success') {
      add(errors, 'SOURCE_CHECK_FAILED', 'Every required source check must conclude success.');
    }
    if (typeof check.headSha !== 'string' || !SHA1.test(check.headSha)) {
      add(errors, 'SOURCE_CHECK_SHA', 'Every source check must include a full commit SHA.');
    } else if (check.headSha.toLowerCase() !== String(commitSha || '').toLowerCase()) {
      add(
        errors,
        'SOURCE_CHECK_SHA_MISMATCH',
        'All required source checks must match the release SHA.',
      );
    }
    if (typeof check.runId !== 'string' || !/^\d{1,20}$/.test(check.runId)) {
      add(
        errors,
        'SOURCE_CHECK_RUN_ID',
        'Every source check must include a numeric workflow run ID.',
      );
    } else {
      runIds.push(check.runId);
    }
  });
  if (new Set(runIds).size !== runIds.length) {
    add(
      errors,
      'SOURCE_CHECK_RUN_ID_DUPLICATE',
      'Required source checks must reference distinct workflow runs.',
    );
  }
}

function validateStagingPreflight(preflight, source, sourceChecks, errors) {
  exactKeys(
    preflight,
    [
      'schemaVersion',
      'evidenceType',
      'generatedAt',
      'source',
      'workflowRun',
      'outcome',
      'categories',
      'blockers',
      'boundaries',
    ],
    'stagingPreflight',
    errors,
  );
  if (!isRecord(preflight)) return;

  if (preflight.schemaVersion !== 1) {
    add(errors, 'PREFLIGHT_VERSION', 'Unsupported staging preflight version.');
  }
  if (preflight.evidenceType !== 'cash-voucher-staging-configuration-preflight') {
    add(errors, 'PREFLIGHT_TYPE', 'Unexpected staging preflight evidence type.');
  }
  if (!validTimestamp(preflight.generatedAt)) {
    add(errors, 'PREFLIGHT_TIMESTAMP', 'Staging preflight timestamp is not canonical UTC.');
  }

  exactKeys(
    preflight.source,
    ['repository', 'ref', 'commitSha'],
    'stagingPreflight.source',
    errors,
  );
  if (isRecord(preflight.source)) {
    if (preflight.source.repository !== REPOSITORY || source.repository !== REPOSITORY) {
      add(
        errors,
        'PREFLIGHT_REPOSITORY',
        'Staging preflight and release bundle must identify the expected repository.',
      );
    }
    if (preflight.source.ref !== SOURCE_REF || source.ref !== SOURCE_REF) {
      add(errors, 'PREFLIGHT_REF', 'Staging preflight must be scoped to client-main.');
    }
    if (
      typeof preflight.source.commitSha !== 'string' ||
      preflight.source.commitSha.toLowerCase() !== String(source.commitSha || '').toLowerCase()
    ) {
      add(errors, 'PREFLIGHT_SHA_MISMATCH', 'Staging preflight must match the release commit SHA.');
    }
  }

  exactKeys(preflight.workflowRun, ['runId', 'url'], 'stagingPreflight.workflowRun', errors);
  if (isRecord(preflight.workflowRun)) {
    if (
      typeof preflight.workflowRun.runId !== 'string' ||
      !/^\d{1,20}$/.test(preflight.workflowRun.runId)
    ) {
      add(errors, 'PREFLIGHT_RUN_ID', 'Staging preflight must include a numeric workflow run ID.');
    } else if (
      preflight.workflowRun.url !==
      'https://github.com/' + REPOSITORY + '/actions/runs/' + preflight.workflowRun.runId
    ) {
      add(
        errors,
        'PREFLIGHT_RUN_URL',
        'Staging preflight run URL must match its repository and run ID.',
      );
    }
  }

  if (isRecord(preflight.workflowRun) && typeof preflight.workflowRun.runId === 'string') {
    const sourceRunIds = isRecord(sourceChecks)
      ? Object.values(sourceChecks)
          .filter((check) => isRecord(check) && typeof check.runId === 'string')
          .map((check) => check.runId)
      : [];
    if (sourceRunIds.includes(preflight.workflowRun.runId)) {
      add(
        errors,
        'PREFLIGHT_RUN_ID_DUPLICATE',
        'Staging preflight must reference a distinct workflow run.',
      );
    }
  }

  if (preflight.outcome !== 'configuration-pass') {
    add(errors, 'PREFLIGHT_BLOCKED', 'Staging configuration preflight did not pass.');
  }
  exactKeys(
    preflight.categories,
    REQUIRED_PREFLIGHT_CATEGORIES,
    'stagingPreflight.categories',
    errors,
  );
  if (isRecord(preflight.categories)) {
    REQUIRED_PREFLIGHT_CATEGORIES.forEach((category) => {
      if (preflight.categories[category] !== 'pass') {
        add(
          errors,
          'PREFLIGHT_CATEGORY',
          'Every required staging configuration category must pass.',
        );
      }
    });
  }
  if (!Array.isArray(preflight.blockers) || preflight.blockers.length !== 0) {
    add(
      errors,
      'PREFLIGHT_BLOCKERS',
      'Passing staging preflight must contain an empty blocker list.',
    );
  }

  exactKeys(preflight.boundaries, REQUIRED_FALSE_BOUNDARIES, 'stagingPreflight.boundaries', errors);
  if (isRecord(preflight.boundaries)) {
    REQUIRED_FALSE_BOUNDARIES.forEach((boundary) => {
      if (preflight.boundaries[boundary] !== false) {
        add(
          errors,
          'PREFLIGHT_BOUNDARY',
          'Preflight evidence must not claim live connectivity, ownership, deployment or restore.',
        );
      }
    });
  }
}

function validateOperationalGates(gates, generatedAt, commitSha, errors) {
  exactKeys(gates, REQUIRED_OPERATIONAL_GATES, 'operationalGates', errors);
  if (!isRecord(gates)) return;

  REQUIRED_OPERATIONAL_GATES.forEach((name) => {
    const requiresClientSha = OPERATIONAL_GATES_REQUIRE_CLIENT_SHA.includes(name);
    const allowedKeys = requiresClientSha
      ? ['status', 'evidenceRef', 'verifiedAt', 'testedClientMainSha']
      : ['status', 'evidenceRef', 'verifiedAt'];
    const gate = gates[name];
    exactKeys(gate, allowedKeys, 'operationalGates.' + name, errors);
    if (!isRecord(gate)) return;

    if (gate.status !== 'pass') {
      add(
        errors,
        'OPERATIONAL_GATE_BLOCKED',
        'Every live operational release gate must be explicitly passed.',
      );
    }
    if (typeof gate.evidenceRef !== 'string' || !SAFE_EVIDENCE_REFERENCE.test(gate.evidenceRef)) {
      add(
        errors,
        'OPERATIONAL_EVIDENCE_REFERENCE',
        'Each live operational gate requires a non-sensitive ticket/change reference.',
      );
    }

    if (!validTimestamp(gate.verifiedAt)) {
      add(
        errors,
        'OPERATIONAL_VERIFIED_AT',
        'Every live operational gate must include a canonical UTC verification timestamp.',
      );
    } else if (
      validTimestamp(generatedAt) &&
      Date.parse(gate.verifiedAt) > Date.parse(generatedAt)
    ) {
      add(
        errors,
        'OPERATIONAL_EVIDENCE_AFTER_BUNDLE',
        'Bundle generation cannot precede an operational gate verification.',
      );
    } else if (
      !isEvidenceWithinAge(generatedAt, gate.verifiedAt, MAX_OPERATIONAL_EVIDENCE_AGE_MS[name])
    ) {
      add(
        errors,
        'OPERATIONAL_EVIDENCE_STALE',
        'Operational gate evidence is older than the allowed freshness window.',
      );
    }

    if (requiresClientSha) {
      if (typeof gate.testedClientMainSha !== 'string' || !SHA1.test(gate.testedClientMainSha)) {
        add(
          errors,
          'OPERATIONAL_TEST_SHA',
          'Product acceptance evidence must include a full tested client-main SHA.',
        );
      } else if (gate.testedClientMainSha.toLowerCase() !== String(commitSha || '').toLowerCase()) {
        add(
          errors,
          'OPERATIONAL_TEST_SHA_MISMATCH',
          'Product acceptance evidence must reference the release bundle SHA.',
        );
      }
    }
  });
}

function validateReleaseGateBundle(bundle) {
  const errors = [];
  if (!isRecord(bundle)) {
    return {
      ok: false,
      errors: [{ code: 'ROOT', message: 'Release gate bundle must be a JSON object.' }],
    };
  }

  exactKeys(
    bundle,
    [
      'schemaVersion',
      'evidenceType',
      'generatedAt',
      'source',
      'sourceChecks',
      'stagingPreflight',
      'recoveryEvidence',
      'operationalGates',
    ],
    '$',
    errors,
  );
  if (bundle.schemaVersion !== 1) add(errors, 'SCHEMA_VERSION', 'schemaVersion must equal 1.');
  if (bundle.evidenceType !== 'cash-voucher-release-gate-bundle') {
    add(errors, 'EVIDENCE_TYPE', 'Unexpected release gate bundle evidence type.');
  }
  if (!validTimestamp(bundle.generatedAt)) {
    add(errors, 'RECORDED_AT', 'Bundle timestamp must be canonical UTC.');
  }

  exactKeys(bundle.source, ['repository', 'ref', 'commitSha'], 'source', errors);
  if (isRecord(bundle.source)) {
    if (bundle.source.repository !== REPOSITORY) {
      add(errors, 'SOURCE_REPOSITORY', 'Release bundle repository is not the expected repository.');
    }
    if (bundle.source.ref !== SOURCE_REF) {
      add(errors, 'SOURCE_REF', 'Release bundle must target client-main.');
    }
    if (typeof bundle.source.commitSha !== 'string' || !SHA1.test(bundle.source.commitSha)) {
      add(errors, 'SOURCE_SHA', 'Release source must contain a full commit SHA.');
    }
  }

  const commitSha = isRecord(bundle.source) ? bundle.source.commitSha : '';
  validateSourceChecks(bundle.sourceChecks, commitSha, errors);
  validateStagingPreflight(
    bundle.stagingPreflight,
    isRecord(bundle.source) ? bundle.source : {},
    bundle.sourceChecks,
    errors,
  );

  const recovery = validateRecoveryEvidence(bundle.recoveryEvidence);
  if (!recovery.ok) {
    recovery.errors.forEach((item) => {
      add(
        errors,
        'RECOVERY_' + item.code,
        'Recovery drill evidence failed its independent contract check.',
      );
    });
  } else if (
    isRecord(bundle.recoveryEvidence.source) &&
    typeof commitSha === 'string' &&
    bundle.recoveryEvidence.source.clientMainSha.toLowerCase() !== commitSha.toLowerCase()
  ) {
    add(
      errors,
      'RECOVERY_SHA_MISMATCH',
      'Recovery drill evidence must reference the release commit SHA.',
    );
  }

  if (
    validTimestamp(bundle.generatedAt) &&
    isRecord(bundle.stagingPreflight) &&
    validTimestamp(bundle.stagingPreflight.generatedAt) &&
    Date.parse(bundle.stagingPreflight.generatedAt) > Date.parse(bundle.generatedAt)
  ) {
    add(
      errors,
      'PREFLIGHT_AFTER_BUNDLE',
      'Bundle generation cannot precede its staging preflight.',
    );
  }
  if (
    validTimestamp(bundle.generatedAt) &&
    isRecord(bundle.stagingPreflight) &&
    validTimestamp(bundle.stagingPreflight.generatedAt) &&
    Date.parse(bundle.stagingPreflight.generatedAt) <= Date.parse(bundle.generatedAt) &&
    !isEvidenceWithinAge(
      bundle.generatedAt,
      bundle.stagingPreflight.generatedAt,
      MAX_STAGING_PREFLIGHT_AGE_MS,
    )
  ) {
    add(
      errors,
      'PREFLIGHT_STALE',
      'Staging configuration preflight must be no older than 24 hours.',
    );
  }
  if (
    validTimestamp(bundle.generatedAt) &&
    isRecord(bundle.recoveryEvidence) &&
    validTimestamp(bundle.recoveryEvidence.recordedAt) &&
    Date.parse(bundle.recoveryEvidence.recordedAt) > Date.parse(bundle.generatedAt)
  ) {
    add(errors, 'RECOVERY_AFTER_BUNDLE', 'Bundle generation cannot precede its recovery evidence.');
  }
  if (
    validTimestamp(bundle.generatedAt) &&
    isRecord(bundle.recoveryEvidence) &&
    validTimestamp(bundle.recoveryEvidence.recordedAt) &&
    Date.parse(bundle.recoveryEvidence.recordedAt) <= Date.parse(bundle.generatedAt) &&
    !isEvidenceWithinAge(
      bundle.generatedAt,
      bundle.recoveryEvidence.recordedAt,
      MAX_RECOVERY_EVIDENCE_AGE_MS,
    )
  ) {
    add(errors, 'RECOVERY_STALE', 'Recovery drill evidence must be no older than seven days.');
  }

  validateOperationalGates(bundle.operationalGates, bundle.generatedAt, commitSha, errors);

  return {
    ok: errors.length === 0,
    errors,
    summary:
      errors.length === 0
        ? {
            sourceSha: commitSha,
            requiredSourceChecks: REQUIRED_SOURCE_CHECKS.length,
            stagingConfigurationPass: true,
            recoveryEvidenceContractPass: true,
            operationalGatesPassed: REQUIRED_OPERATIONAL_GATES.length,
            releaseApproval: 'human-review-required',
          }
        : undefined,
  };
}

function buildSanitizedValidationReport(result, bundle, generatedAt = new Date().toISOString()) {
  const rawSha = isRecord(bundle) && isRecord(bundle.source) ? bundle.source.commitSha : null;
  const sourceSha = typeof rawSha === 'string' && SHA1.test(rawSha) ? rawSha.toLowerCase() : null;
  const errorCodes = Array.isArray(result.errors)
    ? [
        ...new Set(
          result.errors.map((error) => error.code).filter((code) => /^[A-Z0-9_]{1,80}$/.test(code)),
        ),
      ].sort()
    : [];

  return {
    schemaVersion: 1,
    evidenceType: 'cash-voucher-release-gate-validation',
    generatedAt: validTimestamp(generatedAt) ? generatedAt : new Date().toISOString(),
    outcome: result.ok ? 'contract-pass' : 'blocked',
    sourceSha,
    errorCodes,
    summary: result.ok
      ? {
          requiredSourceChecks: result.summary.requiredSourceChecks,
          stagingConfigurationPass: result.summary.stagingConfigurationPass,
          recoveryEvidenceContractPass: result.summary.recoveryEvidenceContractPass,
          operationalGatesPassed: result.summary.operationalGatesPassed,
          releaseApproval: 'human-review-required',
        }
      : {
          releaseApproval: 'human-review-required',
        },
  };
}

function resolvePathForSafety(candidatePath) {
  let cursor = path.resolve(candidatePath);
  const suffix = [];

  while (true) {
    let stats;
    try {
      stats = fs.lstatSync(cursor);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      suffix.unshift(path.basename(cursor));
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      cursor = parent;
      continue;
    }

    let resolved;
    try {
      resolved = fs.realpathSync(cursor);
    } catch (error) {
      if (stats.isSymbolicLink() && error.code === 'ENOENT') {
        return path.join(path.resolve(cursor), ...suffix);
      }
      throw error;
    }
    return path.join(resolved, ...suffix);
  }
}

function isInsideRepository(candidatePath) {
  const repositoryRoot = fs.realpathSync(path.resolve(__dirname, '..'));
  const resolvedCandidate = resolvePathForSafety(candidatePath);
  const relative = path.relative(repositoryRoot, resolvedCandidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
  );
}

function writeSanitizedValidationReport(reportPath, result, bundle) {
  if (!reportPath) return null;
  const resolvedReport = path.resolve(reportPath);
  if (isInsideRepository(resolvedReport)) {
    throw new Error('REPORT_PATH_INSIDE_REPOSITORY');
  }
  try {
    const existing = fs.lstatSync(resolvedReport);
    if (existing.isSymbolicLink()) throw new Error('REPORT_PATH_SYMLINK');
    throw new Error('REPORT_PATH_EXISTS');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  fs.mkdirSync(path.dirname(resolvedReport), { recursive: true, mode: 0o700 });
  const report = buildSanitizedValidationReport(result, bundle);
  fs.writeFileSync(resolvedReport, JSON.stringify(report, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  fs.chmodSync(resolvedReport, 0o600);
  return report;
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = String(args.find((arg) => !arg.startsWith('--')) || '').trim();
  const reportArgument = args.find((arg) => arg.startsWith('--report='));
  const reportPath = reportArgument ? reportArgument.slice('--report='.length).trim() : '';

  if (!inputPath || args.some((arg) => arg.startsWith('--') && !arg.startsWith('--report='))) {
    console.error(
      'Usage: npm run validate:release-bundle -- /private/path/release-gate-bundle.json',
    );
    console.error('Optional private report: --report=/private/path/validation-report.json');
    process.exitCode = 2;
    return;
  }
  if (reportArgument && !reportPath) {
    console.error('RELEASE GATE BUNDLE FAILED: report output path is empty.');
    process.exitCode = 2;
    return;
  }
  if (path.resolve(inputPath) === path.resolve(__filename)) {
    console.error(
      'RELEASE GATE BUNDLE FAILED: validator source cannot be used as an evidence bundle.',
    );
    process.exitCode = 2;
    return;
  }
  if (isInsideRepository(inputPath)) {
    console.error(
      'RELEASE GATE BUNDLE FAILED: input bundle must be stored outside the repository.',
    );
    process.exitCode = 2;
    return;
  }
  if (reportPath && isInsideRepository(reportPath)) {
    console.error(
      'RELEASE GATE BUNDLE FAILED: validation report must be stored outside the repository.',
    );
    process.exitCode = 2;
    return;
  }
  if (reportPath && path.resolve(reportPath) === path.resolve(inputPath)) {
    console.error('RELEASE GATE BUNDLE FAILED: report output must not overwrite the input bundle.');
    process.exitCode = 2;
    return;
  }

  let bundle;
  try {
    const linkStats = fs.lstatSync(inputPath);
    if (linkStats.isSymbolicLink()) {
      console.error('RELEASE GATE BUNDLE FAILED: input bundle must not be a symbolic link.');
      process.exitCode = 2;
      return;
    }
    const stats = fs.statSync(inputPath);
    if (!stats.isFile() || stats.size > 5 * 1024 * 1024) {
      console.error(
        'RELEASE GATE BUNDLE FAILED: input must be a regular JSON file no larger than 5 MiB.',
      );
      process.exitCode = 1;
      return;
    }
    bundle = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch {
    console.error('RELEASE GATE BUNDLE FAILED: input is unreadable or is not valid JSON.');
    process.exitCode = 1;
    return;
  }

  const result = validateReleaseGateBundle(bundle);
  if (reportPath && fs.existsSync(reportPath)) {
    try {
      const existingReport = fs.lstatSync(reportPath);
      const inputResolved = fs.statSync(inputPath);
      if (existingReport.isSymbolicLink()) {
        throw new Error('REPORT_PATH_SYMLINK');
      }
      if (existingReport.dev === inputResolved.dev && existingReport.ino === inputResolved.ino) {
        throw new Error('REPORT_OVERWRITES_INPUT');
      }
    } catch {
      console.error('RELEASE GATE BUNDLE FAILED: report output path is unsafe.');
      process.exitCode = 2;
      return;
    }
  }
  if (reportPath) {
    try {
      writeSanitizedValidationReport(reportPath, result, bundle);
    } catch {
      console.error(
        'RELEASE GATE BUNDLE FAILED: sanitized validation report could not be written.',
      );
      process.exitCode = 1;
      return;
    }
  }

  if (!result.ok) {
    console.error('RELEASE GATE BUNDLE FAILED: ' + result.errors.length + ' validation issue(s).');
    result.errors.forEach((error) => console.error('- [' + error.code + '] ' + error.message));
    process.exitCode = 1;
    return;
  }

  console.log(
    'Release gate evidence contract passed for source ' +
      result.summary.sourceSha +
      '; ' +
      result.summary.requiredSourceChecks +
      ' source checks, staging configuration, recovery evidence and ' +
      result.summary.operationalGatesPassed +
      ' live operational gate references were internally consistent.',
  );
  console.log(
    'Structure/consistency only: evidence is not authenticated and live checks are not executed.',
  );
  console.log('Human review and owner/QA approval are still required.');
}

if (require.main === module) main();

module.exports = {
  REQUIRED_OPERATIONAL_GATES,
  REQUIRED_SOURCE_CHECKS,
  buildSanitizedValidationReport,
  isInsideRepository,
  validateReleaseGateBundle,
  writeSanitizedValidationReport,
};
