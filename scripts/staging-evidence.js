'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const OPERATIONS = new Set(['deploy-and-uat', 'uat-only', 'validate-only']);
const OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped', 'in_progress']);
const ROOT = path.resolve(__dirname, '..');

function resolveSafeExternalFile(rawPath, label) {
  const value = String(rawPath || '').trim();
  if (!value) throw new Error('The ' + label + ' path is required.');

  const requested = path.resolve(value);
  const basename = path.basename(requested);
  if (!basename || basename === '.' || basename === path.sep) {
    throw new Error('The ' + label + ' path must name a file.');
  }

  let realParent;
  let realRoot;
  try {
    realParent = fs.realpathSync(path.dirname(requested));
    realRoot = fs.realpathSync(ROOT);
  } catch {
    throw new Error('The ' + label + ' parent directory must already exist.');
  }

  const target = path.join(realParent, basename);
  const relative = path.relative(realRoot, target);
  const isInsideRepository =
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
  if (isInsideRepository) {
    throw new Error('The ' + label + ' must be outside the repository.');
  }

  let stat = null;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw new Error('The ' + label + ' cannot be inspected safely.');
    }
  }
  if (stat && (stat.isSymbolicLink() || !stat.isFile())) {
    throw new Error('The ' + label + ' must be a regular, non-symlink file.');
  }
  return { path: target, exists: Boolean(stat) };
}

function writeNewPrivateEvidenceFile(rawPath, content) {
  const target = resolveSafeExternalFile(rawPath, 'staging evidence output');
  let descriptor;
  let created = false;
  const flags =
    fs.constants.O_WRONLY |
    fs.constants.O_CREAT |
    fs.constants.O_EXCL |
    (fs.constants.O_NOFOLLOW || 0);
  try {
    descriptor = fs.openSync(target.path, flags, 0o600);
    created = true;
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, content, 'utf8');
  } catch {
    if (created) {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch {
          // Preserve the original write failure; cleanup below still attempts unlink.
        }
        descriptor = undefined;
      }
      try {
        fs.unlinkSync(target.path);
      } catch {
        // The caller receives a generic error; avoid exposing low-level paths or errors.
      }
    }
    throw new Error(
      'Staging evidence output could not be created safely; existing files are never overwritten.',
    );
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function appendPrivateStepSummary(rawPath, content) {
  if (!String(rawPath || '').trim()) return;
  const target = resolveSafeExternalFile(rawPath, 'GitHub step summary');
  let descriptor;
  const flags =
    fs.constants.O_WRONLY |
    fs.constants.O_APPEND |
    fs.constants.O_CREAT |
    (fs.constants.O_NOFOLLOW || 0);
  try {
    descriptor = fs.openSync(target.path, flags, 0o600);
    if (!fs.fstatSync(descriptor).isFile()) {
      throw new Error('summary is not a regular file');
    }
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, content, 'utf8');
  } catch {
    throw new Error('The GitHub step summary could not be appended safely.');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function normalizeOutcome(value) {
  const outcome = String(value || '')
    .trim()
    .toLowerCase();
  if (!outcome || outcome === 'not-run') return 'not-run';
  return OUTCOMES.has(outcome) ? outcome : 'unknown';
}

function validateEnvironment(env) {
  const operation = String(env.CV_STAGING_OPERATION || '').trim();
  if (!OPERATIONS.has(operation)) {
    throw new Error('Unsupported staging operation.');
  }
  const commitSha = String(env.GITHUB_SHA || '').trim();
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) {
    throw new Error('A full 40-character source commit SHA is required.');
  }
  if (String(env.GITHUB_REF || '') !== 'refs/heads/client-main') {
    throw new Error('Staging evidence can only be generated from client-main.');
  }
  const runId = String(env.GITHUB_RUN_ID || '').trim();
  if (!/^\d+$/.test(runId)) {
    throw new Error('A valid workflow run ID is required.');
  }
  return { operation, commitSha: commitSha.toLowerCase(), runId };
}

function summarizeReadModelContract(log, stepOutcome, marker) {
  const outcome = normalizeOutcome(stepOutcome);
  if (outcome === 'not-run' || outcome === 'skipped') return 'not-run';
  return log.includes(marker) ? 'passed' : 'not-confirmed';
}

function summarizeUat(log, stepOutcome) {
  const outcome = normalizeOutcome(stepOutcome);
  if (outcome === 'not-run' || outcome === 'skipped') {
    return {
      status: 'not-run',
      checksPassed: null,
      summaryPresent: false,
      cleanupStatus: 'not-run',
      transcriptSha256: null,
    };
  }

  const summary = /STAGING UAT:\s*(\d+)\s+checks passed,\s*0 failures\./.exec(log);
  const checksPassed = summary
    ? Number(summary[1])
    : log.length > 0
      ? (log.match(/^PASS:/gm) || []).length
      : null;
  const manualReviewRequired = /CLEANUP:[^\r\n]*owner review is required/i.test(log);
  const explicitCleanup = /CLEANUP:[^\r\n]*staging voucher cancelled; audit history retained/i.test(
    log,
  );
  const cancellationCheckPassed =
    /PASS:[^\r\n]*UAT payment is cancelled with a retained audit trace/i.test(log);
  const cleanupStatus = manualReviewRequired
    ? 'owner-review-required'
    : explicitCleanup || cancellationCheckPassed
      ? 'cancelled-audit-retained'
      : 'not-confirmed';

  let status = 'unknown';
  if (outcome === 'failure') status = 'failed';
  else if (outcome === 'cancelled') status = 'cancelled';
  else if (outcome === 'success' && !summary) status = 'passed-but-summary-missing';
  else if (
    outcome === 'success' &&
    (!cancellationCheckPassed || cleanupStatus !== 'cancelled-audit-retained')
  ) {
    status = 'passed-but-cleanup-unconfirmed';
  } else if (outcome === 'success') status = 'passed';

  return {
    status,
    checksPassed,
    summaryPresent: Boolean(summary),
    cleanupStatus,
    transcriptSha256: log.length
      ? crypto.createHash('sha256').update(log, 'utf8').digest('hex')
      : null,
  };
}

function buildStagingEvidence(env = process.env, log = '') {
  const validated = validateEnvironment(env);
  const repository = String(env.GITHUB_REPOSITORY || '');
  const safeRepository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    ? repository
    : 'unknown';
  const runAttempt = /^\d+$/.test(String(env.GITHUB_RUN_ATTEMPT || ''))
    ? String(env.GITHUB_RUN_ATTEMPT)
    : '1';
  const serverUrl = String(env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
  const uat = summarizeUat(log, env.CV_EVIDENCE_UAT_OUTCOME);
  const runUrl =
    safeRepository !== 'unknown'
      ? serverUrl + '/' + safeRepository + '/actions/runs/' + validated.runId
      : '';

  return {
    schemaVersion: 2,
    evidenceType: 'cash-voucher-staging-execution',
    generatedAt: new Date().toISOString(),
    operation: validated.operation,
    source: {
      repository: safeRepository,
      ref: 'refs/heads/client-main',
      commitSha: validated.commitSha,
    },
    workflowRun: {
      workflow: String(env.GITHUB_WORKFLOW || 'Staging UAT'),
      runId: validated.runId,
      runAttempt,
      url: runUrl,
    },
    jobOutcome: normalizeOutcome(env.CV_EVIDENCE_JOB_OUTCOME),
    steps: {
      preflight: normalizeOutcome(env.CV_EVIDENCE_PREFLIGHT_OUTCOME),
      deployment: normalizeOutcome(env.CV_EVIDENCE_DEPLOY_OUTCOME),
      targetRecheck: normalizeOutcome(env.CV_EVIDENCE_TARGET_RECHECK_OUTCOME),
      uat: normalizeOutcome(env.CV_EVIDENCE_UAT_OUTCOME),
    },
    uat,
    liveReadModels: {
      dashboardSummary: summarizeReadModelContract(
        log,
        env.CV_EVIDENCE_UAT_OUTCOME,
        'PASS: staging dashboardSummary returns the expected dashboard read model',
      ),
      registerPage: summarizeReadModelContract(
        log,
        env.CV_EVIDENCE_UAT_OUTCOME,
        'PASS: staging registerPage returns a bounded paginated register read model',
      ),
    },
    disclosure: {
      credentialsIncluded: false,
      resourceIdentifiersIncluded: false,
      apiEndpointsIncluded: false,
      rawTranscriptIncluded: false,
    },
  };
}

function readTranscript(env) {
  const logPath = String(env.CV_STAGING_UAT_LOG_FILE || '').trim();
  if (!logPath) return '';

  let target;
  try {
    target = resolveSafeExternalFile(logPath, 'staging UAT transcript');
  } catch {
    throw new Error('The staging UAT transcript path failed safety validation.');
  }
  if (!target.exists) return '';

  let directoryStat;
  try {
    directoryStat = fs.lstatSync(path.dirname(target.path));
  } catch {
    throw new Error('The staging UAT transcript directory is unavailable.');
  }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error('The staging UAT transcript directory must be a real directory.');
  }
  if (
    !/^cash-voucher-staging-uat\.[A-Za-z0-9_-]+$/.test(path.basename(path.dirname(target.path)))
  ) {
    throw new Error('The staging UAT transcript must live in a dedicated per-run directory.');
  }
  if (process.platform !== 'win32' && (directoryStat.mode & 0o077) !== 0) {
    throw new Error('The staging UAT transcript directory permissions are too broad.');
  }

  const maxTranscriptBytes = 2 * 1024 * 1024;
  let descriptor;
  try {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
    descriptor = fs.openSync(target.path, flags);
    const fileStat = fs.fstatSync(descriptor);
    if (!fileStat.isFile() || (process.platform !== 'win32' && (fileStat.mode & 0o077) !== 0)) {
      throw new Error('unsafe transcript file');
    }
    if (fileStat.size > maxTranscriptBytes) {
      throw new Error('transcript exceeds size limit');
    }
    return fs.readFileSync(descriptor, 'utf8');
  } catch {
    throw new Error(
      'The staging UAT transcript could not be read safely; oversized, symlinked or non-private files are rejected.',
    );
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Preserve the primary result; the runner removes the isolated log directory.
      }
    }
  }
}

function writeStagingEvidence(env = process.env, logOverride = null) {
  const outputPath = String(env.CV_EVIDENCE_OUTPUT_PATH || '').trim();
  if (!outputPath) throw new Error('The staging evidence output path is required.');
  const log = logOverride === null ? readTranscript(env) : String(logOverride);
  const evidence = buildStagingEvidence(env, log);
  writeNewPrivateEvidenceFile(outputPath, JSON.stringify(evidence, null, 2) + '\n');

  const summaryPath = String(env.GITHUB_STEP_SUMMARY || '').trim();
  if (summaryPath) {
    const checks = evidence.uat.checksPassed === null ? 'not recorded' : evidence.uat.checksPassed;
    const markdown = [
      '## Sanitized staging execution evidence',
      '',
      '- Operation: ' + evidence.operation,
      '- Source commit: ' + evidence.source.commitSha + ' (client-main)',
      '- Workflow run: ' +
        evidence.workflowRun.runId +
        ' attempt ' +
        evidence.workflowRun.runAttempt,
      '- Overall job: ' + evidence.jobOutcome,
      '- Preflight: ' + evidence.steps.preflight,
      '- Deployment: ' + evidence.steps.deployment,
      '- Target recheck: ' + evidence.steps.targetRecheck,
      '- UAT: ' + evidence.uat.status + '; checks passed: ' + checks,
      '- Test-payment cleanup: ' + evidence.uat.cleanupStatus,
      '- Live dashboardSummary contract: ' + evidence.liveReadModels.dashboardSummary,
      '- Live registerPage contract: ' + evidence.liveReadModels.registerPage,
      '',
      'The JSON artifact excludes credentials, resource identifiers, API endpoint URLs and raw transcript text.',
      '',
    ].join('\n');
    appendPrivateStepSummary(summaryPath, markdown);
  }
  return evidence;
}

function main() {
  try {
    const evidence = writeStagingEvidence();
    console.log(
      'Sanitized staging execution evidence written; sensitive configuration and raw transcript were excluded.',
    );
    if (evidence.steps.uat === 'success' && evidence.uat.status !== 'passed') {
      console.error(
        'Staging UAT reported success without a complete pass and cancellation record.',
      );
      process.exitCode = 1;
    }
    if (
      evidence.steps.uat === 'success' &&
      Object.values(evidence.liveReadModels).some((status) => status !== 'passed')
    ) {
      console.error(
        'Staging UAT reported success without both required live read-model contract checks.',
      );
      process.exitCode = 1;
    }
  } catch {
    console.error('STAGING EVIDENCE FAILED: sanitized release evidence could not be assembled.');
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildStagingEvidence,
  normalizeOutcome,
  readTranscript,
  summarizeUat,
  writeStagingEvidence,
};
