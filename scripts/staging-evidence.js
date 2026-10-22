'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const OPERATIONS = new Set(['deploy-and-uat', 'uat-only', 'validate-only']);
const OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped', 'in_progress']);

function normalizeOutcome(value) {
  const outcome = String(value || '').trim().toLowerCase();
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
  const explicitCleanup =
    /CLEANUP:[^\r\n]*staging voucher cancelled; audit history retained/i.test(log);
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
    schemaVersion: 1,
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
  try {
    return fs.readFileSync(logPath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return '';
    throw new Error('Unable to read the staging UAT transcript.');
  }
}

function writeStagingEvidence(env = process.env, logOverride = null) {
  const outputPath = String(env.CV_EVIDENCE_OUTPUT_PATH || '').trim();
  if (!outputPath) throw new Error('The staging evidence output path is required.');
  const log = logOverride === null ? readTranscript(env) : String(logOverride);
  const evidence = buildStagingEvidence(env, log);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(outputPath, 0o600);

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
      '',
      'The JSON artifact excludes credentials, resource identifiers, API endpoint URLs and raw transcript text.',
      '',
    ].join('\n');
    fs.appendFileSync(summaryPath, markdown, { mode: 0o600 });
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
  } catch {
    console.error('STAGING EVIDENCE FAILED: sanitized release evidence could not be assembled.');
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildStagingEvidence,
  normalizeOutcome,
  summarizeUat,
  writeStagingEvidence,
};
