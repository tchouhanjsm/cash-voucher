'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  MAX_RECOVERIES_PER_RUN,
  MAX_HISTORY_ENTRIES,
  MAX_RUN_ATTEMPTS,
  buildCheckpointIssueBody,
  buildMonitorReport,
  classifyRun,
  collectRecoveryCandidates,
  parseRecoveryLedger,
  shouldRetryTimedOutRun,
  WORKFLOW_POLICIES,
} = require('../scripts/autonomous-dev-monitor');
const NOW = new Date('2026-10-25T00:00:00.000Z');
const MAIN_SHA = 'a'.repeat(40);
const PR_SHA = 'b'.repeat(40);
function makeRun(workflowId, scope, sha, overrides = {}) {
  const policy = WORKFLOW_POLICIES.find((item) => item.id === workflowId);
  return {
    workflowId,
    workflowName: policy.name,
    scope,
    prNumber: scope === 'pull_request' ? 209 : null,
    headSha: sha,
    headBranch: scope === 'client-main' ? 'client-main' : 'client/feature',
    headRepoFullName: 'tchouhanjsm/cash-voucher',
    event: scope === 'pull_request' ? 'pull_request' : 'push',
    status: 'completed',
    conclusion: 'success',
    runAttempt: 1,
    runId: 1000 + WORKFLOW_POLICIES.findIndex((item) => item.id === workflowId),
    runNumber: 100,
    createdAt: '2026-10-24T23:50:00.000Z',
    startedAt: '2026-10-24T23:50:00.000Z',
    updatedAt: '2026-10-24T23:51:00.000Z',
    htmlUrl: 'https://github.com/tchouhanjsm/cash-voucher/actions/runs/1000',
    ...overrides,
  };
}
function baseSnapshot() {
  return {
    repository: { fullName: 'tchouhanjsm/cash-voucher', defaultBranch: 'main' },
    clientMain: {
      sha: MAIN_SHA,
      htmlUrl: 'https://github.com/tchouhanjsm/cash-voucher/commit/' + MAIN_SHA,
    },
    githubRun: {
      id: 800,
      runNumber: 800,
      runAttempt: 1,
      eventName: 'push',
      ref: 'refs/heads/client-main',
      url: 'https://github.com/actions/runs/800',
    },
    handoffText: [
      '**Verified integration baseline:** \x60' + MAIN_SHA + '\x60 (PR #208 merged).',
      '**Current phase:** P0 B6 — audit-health fallback and release gates.',
      'Live staging remains unverified; backup/restore remain unverified.',
      '## Release gates that remain open',
      '1. Verify staging identity and deployment URL.',
      '2. Demonstrate backup restore into a separate recovery target.',
      '3. Complete real-device offline and accessibility acceptance.',
    ].join('\n'),
    openPullRequests: [],
    runs: [
      makeRun('ci.yml', 'client-main', MAIN_SHA),
      makeRun('e2e.yml', 'client-main', MAIN_SHA),
      makeRun('flight-test.yml', 'client-main', MAIN_SHA),
    ],
  };
}
assert.equal(classifyRun(null, WORKFLOW_POLICIES[0], NOW).code, 'NOT_RUN');
const timeout = makeRun('ci.yml', 'client-main', MAIN_SHA, {
  conclusion: 'timed_out',
  runAttempt: 1,
});
assert.equal(classifyRun(timeout, WORKFLOW_POLICIES[0], NOW).code, 'TIMEOUT_RETRY_ELIGIBLE');
assert.equal(shouldRetryTimedOutRun({ ...timeout, runId: 1 }), true);
assert.equal(
  shouldRetryTimedOutRun({ ...timeout, workflowId: 'staging-uat.yml', runId: 1 }),
  false,
);
assert.equal(
  shouldRetryTimedOutRun({ ...timeout, workflowId: 'client-dist.yml', runId: 1 }),
  false,
);
assert.equal(
  classifyRun({ ...timeout, runAttempt: MAX_RUN_ATTEMPTS }, WORKFLOW_POLICIES[0], NOW).code,
  'TIMEOUT_ESCALATE',
);
assert.equal(shouldRetryTimedOutRun({ ...timeout, runAttempt: MAX_RUN_ATTEMPTS, runId: 1 }), false);
assert.equal(shouldRetryTimedOutRun({ ...timeout, conclusion: 'failure', runId: 1 }), false);
const stale = makeRun('e2e.yml', 'client-main', MAIN_SHA, {
  status: 'in_progress',
  conclusion: null,
  startedAt: '2026-10-24T22:00:00.000Z',
});
assert.equal(classifyRun(stale, WORKFLOW_POLICIES[1], NOW).code, 'STALLED');
assert.equal(
  classifyRun({ ...timeout, conclusion: 'cancelled' }, WORKFLOW_POLICIES[0], NOW).code,
  'CANCELLED',
);
const prRun = makeRun('ci.yml', 'pull_request', PR_SHA, {
  prNumber: 209,
  conclusion: 'timed_out',
  runAttempt: 1,
  runId: 5001,
});
assert.equal(
  collectRecoveryCandidates(
    [prRun],
    [
      {
        number: 209,
        baseRef: 'client-main',
        headSha: PR_SHA,
        headRepoFullName: 'tchouhanjsm/cash-voucher',
        baseRepoFullName: 'tchouhanjsm/cash-voucher',
      },
    ],
    NOW,
  ).length,
  0,
);
const currentTimeout = makeRun('ci.yml', 'client-main', MAIN_SHA, {
  conclusion: 'timed_out',
  runAttempt: 1,
  runId: 5002,
  expectedCurrentHeadSha: MAIN_SHA,
});
const stageTimeout = makeRun('staging-uat.yml', 'client-main', MAIN_SHA, {
  conclusion: 'timed_out',
  runAttempt: 1,
  runId: 5003,
});
const zipTimeout = makeRun('client-dist.yml', 'client-main', MAIN_SHA, {
  conclusion: 'timed_out',
  runAttempt: 1,
  runId: 5004,
});
const candidates = collectRecoveryCandidates([currentTimeout, stageTimeout, zipTimeout], [], NOW);
assert.deepEqual(
  candidates.map((item) => item.runId),
  [5002],
);
assert.ok(candidates.length <= MAX_RECOVERIES_PER_RUN);

const newerSuccessAfterTimeout = makeRun('ci.yml', 'client-main', MAIN_SHA, {
  conclusion: 'success',
  runAttempt: 1,
  runId: 5005,
  runNumber: 101,
  createdAt: '2026-10-24T23:55:00.000Z',
  updatedAt: '2026-10-24T23:59:00.000Z',
  expectedCurrentHeadSha: MAIN_SHA,
});
assert.deepEqual(
  collectRecoveryCandidates([currentTimeout, newerSuccessAfterTimeout], [], NOW),
  [],
  'do not retry an older timed-out run when a newer exact-head run already succeeded',
);

const snapshot = baseSnapshot();
snapshot.runs[1] = makeRun('e2e.yml', 'client-main', MAIN_SHA, {
  conclusion: 'failure',
  runId: 2002,
});
snapshot.runs.push(
  makeRun('staging-uat.yml', 'client-main', MAIN_SHA, { conclusion: 'failure', runId: 3001 }),
);
snapshot.runs.push(
  makeRun('ci.yml', 'pull_request', PR_SHA, { prNumber: 209, runId: 4001 }),
  makeRun('e2e.yml', 'pull_request', PR_SHA, { prNumber: 209, runId: 4002 }),
  makeRun('flight-test.yml', 'pull_request', PR_SHA, { prNumber: 209, runId: 4003 }),
);
snapshot.openPullRequests = [
  {
    number: 209,
    title: 'Fix a feature',
    htmlUrl: 'https://github.com/tchouhanjsm/cash-voucher/pull/209',
    draft: false,
    baseRef: 'client-main',
    headRef: 'client/feature',
    headSha: PR_SHA,
    headRepoFullName: 'tchouhanjsm/cash-voucher',
    baseRepoFullName: 'tchouhanjsm/cash-voucher',
    mergeable: true,
    reviewState: 'APPROVED',
    requestedReviewers: [],
  },
];
const report = buildMonitorReport(snapshot, NOW);
assert.equal(report.state, 'BLOCKED');

const latestAttemptSnapshot = baseSnapshot();
latestAttemptSnapshot.runs[0] = makeRun('ci.yml', 'client-main', MAIN_SHA, {
  conclusion: 'failure',
  runAttempt: 2,
  runId: 6001,
  runNumber: 100,
  createdAt: '2026-10-24T23:40:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
});
latestAttemptSnapshot.runs.push(
  makeRun('ci.yml', 'client-main', MAIN_SHA, {
    conclusion: 'success',
    runAttempt: 1,
    runId: 6002,
    runNumber: 101,
    createdAt: '2026-10-24T23:55:00.000Z',
    updatedAt: '2026-10-24T23:56:00.000Z',
  }),
);
const latestAttemptReport = buildMonitorReport(latestAttemptSnapshot, NOW);
assert.equal(latestAttemptReport.sourceChecks[0].runId, 6002);
assert.equal(
  latestAttemptReport.sourceChecks[0].code,
  'PASS',
  'a newer-created workflow run must outrank an older run rerun after it',
);

const cancelledSnapshot = baseSnapshot();
cancelledSnapshot.runs[1] = makeRun('e2e.yml', 'client-main', MAIN_SHA, {
  conclusion: 'cancelled',
  runId: 6101,
});
const cancelledReport = buildMonitorReport(cancelledSnapshot, NOW);
assert.equal(cancelledReport.sourceChecks[1].code, 'CANCELLED');
assert.equal(cancelledReport.allSourceChecksPassed, false);
assert.equal(
  cancelledReport.state,
  'WAITING_FOR_VALIDATION',
  'a cancelled required check must never produce a source-green state',
);

const skippedSnapshot = baseSnapshot();
skippedSnapshot.runs[1] = makeRun('e2e.yml', 'client-main', MAIN_SHA, {
  conclusion: 'skipped',
  runId: 6102,
});
const skippedReport = buildMonitorReport(skippedSnapshot, NOW);
assert.equal(skippedReport.sourceChecks[1].code, 'SKIPPED');
assert.equal(skippedReport.state, 'WAITING_FOR_VALIDATION');
assert.equal(report.phase, 'P0 B6 — audit-health fallback and release gates.');
assert.equal(report.sourceChecks[0].code, 'PASS');
assert.equal(report.sourceChecks[1].code, 'FAIL');
assert.equal(report.sourceChecks[2].code, 'PASS');
assert.equal(report.openPullRequests[0].state, 'CHECKS_GREEN_REVIEW_REQUIRED');
assert.equal(
  report.operationalRuns.find((item) => item.workflowId === 'staging-uat.yml').code,
  'FAIL',
);
assert.equal(report.releaseGates.stagingUnverified, true);
assert.equal(report.releaseGates.restoreUnverified, true);
assert.equal(report.baselineDrift, false);
assert.match(report.scheduleNote, /default branch \(main\)/);
assert.ok(report.blockers.some((item) => item.includes('Browser E2E: Failed')));
assert.ok(report.blockers.some((item) => item.includes('Staging UAT')));
const drift = baseSnapshot();
drift.handoffText = drift.handoffText.replace(MAIN_SHA, 'c'.repeat(40));
assert.equal(buildMonitorReport(drift, NOW).baselineDrift, true);
const body = buildCheckpointIssueBody(report, '');
assert.match(body, /Recent monitor run history/);
assert.match(body, /AUTO-DEV-HISTORY-BEGIN/);
assert.match(body, /Staging UAT/);
assert.match(body, /Mandatory safety boundary/);
const duplicateBody = buildCheckpointIssueBody(report, body);
assert.equal((duplicateBody.match(/<!-- run-key:800:1 -->/g) || []).length, 1);
const intent = [
  { key: '5002:1', status: 'INTENT', workflowName: 'CI / Quality', summary: 'run 5002 attempt 1' },
];
const intentBody = buildCheckpointIssueBody({ ...report, recoveryActions: intent }, body);
assert.equal(parseRecoveryLedger(intentBody)[0].status, 'INTENT');
const confirmed = buildCheckpointIssueBody(
  { ...report, recoveryActions: [{ ...intent[0], status: 'REQUESTED' }] },
  intentBody,
);
assert.equal(parseRecoveryLedger(confirmed)[0].status, 'REQUESTED');
let longHistory = '';
for (let i = 0; i < MAX_HISTORY_ENTRIES + 8; i++) {
  longHistory = buildCheckpointIssueBody(
    {
      ...report,
      capturedAt: new Date(NOW.getTime() - i * 60000).toISOString(),
      githubRun: { ...report.githubRun, id: 10000 + i, runNumber: i, runAttempt: 1 },
    },
    longHistory,
  );
}
assert.equal((longHistory.match(/<!-- run-key:/g) || []).length, MAX_HISTORY_ENTRIES);
assert.doesNotMatch(body, /CLASPRC_JSON|CV_STAGING_UAT_OWNER_PASSWORD|CV_STAGING_SCRIPT_ID/i);
const workflow = fs.readFileSync('.github/workflows/autonomous-development-monitor.yml', 'utf8');
const monitorSource = fs.readFileSync('scripts/autonomous-dev-monitor.js', 'utf8');
assert.doesNotMatch(workflow, /^\s*schedule:/m, 'do not schedule from the frozen default branch');
assert.match(workflow, /github\.event_name != 'pull_request'/);
assert.match(workflow, /reRunWorkflowFailedJobs/);
assert.match(monitorSource, /recovery-key/);
console.log(
  'Autonomous monitor tests passed — exact-SHA gates, bounded timeout-only recovery, read-only PR events, operational gates and idempotent checkpoint ledger.',
);
