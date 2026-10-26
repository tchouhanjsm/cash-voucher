'use strict';

const MAX_RUN_ATTEMPTS = 3;
const MAX_RECOVERIES_PER_RUN = 3;
const MAX_HISTORY_ENTRIES = 30;
const STALL_GRACE_MINUTES = 5;
const CHECKPOINT_ISSUE_TITLE = 'Autonomous Development Monitor — Persistent Checkpoint';
const WORKFLOW_POLICIES = [
  {
    id: 'ci.yml',
    name: 'CI / Quality',
    timeoutMinutes: 15,
    required: true,
    retryTimeout: true,
    category: 'source',
  },
  {
    id: 'e2e.yml',
    name: 'Browser E2E',
    timeoutMinutes: 20,
    required: true,
    retryTimeout: true,
    category: 'source',
  },
  {
    id: 'flight-test.yml',
    name: 'Full Flight Test',
    timeoutMinutes: 15,
    required: true,
    retryTimeout: true,
    category: 'source',
  },
  {
    id: 'staging-uat.yml',
    name: 'Staging UAT',
    timeoutMinutes: 45,
    required: false,
    retryTimeout: false,
    category: 'operational',
  },
  {
    id: 'client-dist.yml',
    name: 'Client staging ZIP',
    timeoutMinutes: 15,
    required: false,
    retryTimeout: false,
    category: 'operational',
  },
];
const SOURCE_IDS = new Set(
  WORKFLOW_POLICIES.filter((item) => item.required).map((item) => item.id),
);

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function ageMinutes(value, now = new Date()) {
  const start = asDate(value);
  const end = asDate(now) || new Date();
  return start ? Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000)) : null;
}
function classifyRun(run, policy, now = new Date()) {
  if (!run)
    return {
      code: 'NOT_RUN',
      label: 'Not run',
      terminal: false,
      blocker: true,
      reason: 'No exact-head workflow run was found.',
    };
  const status = String(run.status || '').toLowerCase();
  const conclusion = String(run.conclusion || '').toLowerCase();
  const attempt = Number(run.runAttempt) || 1;
  const age = ageMinutes(run.startedAt || run.createdAt, now);
  if (status !== 'completed') {
    if (
      status === 'in_progress' &&
      age !== null &&
      age > policy.timeoutMinutes + STALL_GRACE_MINUTES
    ) {
      return {
        code: 'STALLED',
        label: 'Stalled',
        terminal: false,
        blocker: true,
        ageMinutes: age,
        reason: 'Still in progress beyond expected timeout plus five-minute grace period.',
      };
    }
    return {
      code: status === 'in_progress' ? 'RUNNING' : 'PENDING',
      label: status === 'in_progress' ? 'Running' : 'Pending',
      terminal: false,
      blocker: false,
      ageMinutes: age,
      reason: 'The workflow has not reached a terminal result.',
    };
  }
  if (conclusion === 'success')
    return {
      code: 'PASS',
      label: 'Passed',
      terminal: true,
      blocker: false,
      reason: 'The workflow completed successfully.',
    };
  if (conclusion === 'timed_out') {
    const retryable = policy.retryTimeout && attempt < MAX_RUN_ATTEMPTS;
    return {
      code: retryable ? 'TIMEOUT_RETRY_ELIGIBLE' : 'TIMEOUT_ESCALATE',
      label: retryable ? 'Timed out — retry eligible' : 'Timed out — escalate',
      terminal: true,
      blocker: true,
      retryable,
      attempt,
      reason: retryable
        ? 'A source-validation workflow timed out; a bounded retry is safe.'
        : 'Automatic retry is not allowed or the workflow reached its attempt limit.',
    };
  }
  if (conclusion === 'failure')
    return {
      code: 'FAIL',
      label: 'Failed',
      terminal: true,
      blocker: true,
      reason: 'Inspect the exact failed job/step and logs; do not blindly retry a code failure.',
    };
  if (conclusion === 'cancelled')
    return {
      code: 'CANCELLED',
      label: 'Cancelled',
      terminal: true,
      blocker: false,
      reason: 'Cancellation is not a pass; check whether a newer run superseded it.',
    };
  if (conclusion === 'skipped' || conclusion === 'neutral')
    return {
      code: 'SKIPPED',
      label: 'Skipped',
      terminal: true,
      blocker: false,
      reason: 'The workflow or job was skipped for this event.',
    };
  return {
    code: 'UNKNOWN',
    label: 'Unknown result',
    terminal: status === 'completed',
    blocker: true,
    reason: 'Unrecognized workflow conclusion.',
  };
}
function latestRun(runs, workflowId, scope, headSha, prNumber = null) {
  const candidates = (runs || []).filter(
    (run) =>
      run.workflowId === workflowId &&
      run.scope === scope &&
      (!headSha || run.headSha === headSha) &&
      (prNumber === null || run.prNumber === prNumber),
  );
  candidates.sort((a, b) => {
    const aRunNumber = Number(a.runNumber);
    const bRunNumber = Number(b.runNumber);
    if (
      Number.isSafeInteger(aRunNumber) &&
      aRunNumber > 0 &&
      Number.isSafeInteger(bRunNumber) &&
      bRunNumber > 0 &&
      aRunNumber !== bRunNumber
    ) {
      return bRunNumber - aRunNumber;
    }
    const aCreated = asDate(a.createdAt);
    const bCreated = asDate(b.createdAt);
    const byCreation = (bCreated ? bCreated.getTime() : 0) - (aCreated ? aCreated.getTime() : 0);
    if (byCreation) return byCreation;
    const aUpdated = asDate(a.updatedAt || a.createdAt);
    const bUpdated = asDate(b.updatedAt || b.createdAt);
    const byUpdate = (bUpdated ? bUpdated.getTime() : 0) - (aUpdated ? aUpdated.getTime() : 0);
    if (byUpdate) return byUpdate;
    return (Number(b.runAttempt) || 1) - (Number(a.runAttempt) || 1);
  });
  return candidates[0] || null;
}
function refreshExactHeadSourceRuns(snapshot, runsByWorkflow = {}) {
  const clientMainSha = snapshot.clientMain && snapshot.clientMain.sha;
  if (!clientMainSha) return snapshot;
  const refreshed = [];
  for (const policy of WORKFLOW_POLICIES.filter((item) => item.required)) {
    const candidates = (Array.isArray(runsByWorkflow[policy.id]) ? runsByWorkflow[policy.id] : [])
      .filter(
        (run) =>
          run &&
          run.head_sha === clientMainSha &&
          run.head_branch === 'client-main' &&
          run.event === 'push',
      )
      .sort((a, b) => {
        const runNumberDifference = (Number(b.run_number) || 0) - (Number(a.run_number) || 0);
        if (runNumberDifference) return runNumberDifference;
        const createdDifference =
          (asDate(b.created_at)?.getTime() || 0) - (asDate(a.created_at)?.getTime() || 0);
        if (createdDifference) return createdDifference;
        return (Number(b.run_attempt) || 1) - (Number(a.run_attempt) || 1);
      });
    const run = candidates[0];
    if (!run) continue;
    refreshed.push({
      workflowId: policy.id,
      workflowName: policy.name,
      scope: 'client-main',
      prNumber: null,
      headSha: run.head_sha,
      expectedCurrentHeadSha: clientMainSha,
      headBranch: run.head_branch,
      headRepoFullName: snapshot.repository?.fullName || '',
      event: run.event,
      status: run.status,
      conclusion: run.conclusion,
      runAttempt: Number(run.run_attempt) || 1,
      runId: run.id,
      runNumber: run.run_number,
      createdAt: run.created_at,
      startedAt: run.run_started_at,
      updatedAt: run.updated_at,
      htmlUrl: run.html_url || '',
      failedJobs: Array.isArray(run.failedJobs) ? run.failedJobs : [],
    });
  }
  const refreshedIds = new Set(refreshed.map((run) => String(run.runId)));
  const existingRuns = (Array.isArray(snapshot.runs) ? snapshot.runs : []).filter(
    (run) => !refreshedIds.has(String(run.runId)),
  );
  return { ...snapshot, runs: [...existingRuns, ...refreshed] };
}

function checkView(policy, run, now) {
  const result = classifyRun(run, policy, now);
  return {
    workflowId: policy.id,
    name: policy.name,
    runId: run ? run.runId : null,
    runNumber: run ? run.runNumber : null,
    runAttempt: run ? run.runAttempt : null,
    sha: run ? run.headSha : null,
    url: run ? run.htmlUrl : null,
    ageMinutes: result.ageMinutes === undefined ? null : result.ageMinutes,
    code: result.code,
    label: result.label,
    blocker: result.blocker,
    reason: result.reason,
    failedJobs: run && Array.isArray(run.failedJobs) ? run.failedJobs : [],
  };
}
function deriveReviewState(reviews, headSha) {
  const latestByUser = new Map();
  for (const review of reviews || []) {
    const state = String(review.state || '').toUpperCase();
    if (
      !review.user ||
      !review.user.login ||
      !review.submitted_at ||
      !['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(state)
    ) {
      continue;
    }
    const prior = latestByUser.get(review.user.login);
    if (!prior || String(review.submitted_at) > String(prior.submitted_at)) {
      latestByUser.set(review.user.login, review);
    }
  }
  const latest = Array.from(latestByUser.values()).filter(
    (review) => String(review.state || '').toUpperCase() !== 'DISMISSED',
  );
  if (latest.some((review) => String(review.state || '').toUpperCase() === 'CHANGES_REQUESTED')) {
    return 'CHANGES_REQUESTED';
  }
  if (
    latest.some(
      (review) =>
        String(review.state || '').toUpperCase() === 'APPROVED' && review.commit_id === headSha,
    )
  ) {
    return 'APPROVED';
  }
  return 'REVIEW_REQUIRED';
}
function extractPhase(text) {
  const match = String(text || '').match(/^\*\*Current phase:\*\*\s*(.+)$/im);
  return match ? match[1].trim().slice(0, 300) : 'Not recorded in docs/HANDOFF.md';
}
function extractDocumentedBaseline(text) {
  const match = String(text || '').match(
    /^\*\*Verified integration baseline:\*\*\s*(?:\x60)?([a-f0-9]{7,40})/im,
  );
  return match ? match[1] : null;
}
function parseReleaseGates(text) {
  const source = String(text || '');
  const items = [];
  for (const heading of ['Release gates that remain open', 'Immediate actions', 'Release gates']) {
    const at = source.toLowerCase().indexOf('## ' + heading.toLowerCase());
    if (at < 0) continue;
    const start = source.indexOf('\n', at);
    const next = source.indexOf('\n## ', start + 1);
    const body = source.slice(start + 1, next < 0 ? source.length : next);
    for (const line of body.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:\d+\.|-)\s+(.+)$/);
      if (match && match[1].trim() && !items.includes(match[1].trim())) items.push(match[1].trim());
    }
    if (items.length) break;
  }
  return {
    documentedItems: items.slice(0, 12),
    stagingUnverified: /live staging remains unverified|staging.*remain(?:s)? unverified/i.test(
      source,
    ),
    restoreUnverified:
      /backup\/restore.*remain(?:s)? unverified|restore.*remain(?:s)? unverified/i.test(source),
    deviceAcceptanceUnverified:
      /device acceptance.*remain(?:s)? unverified|device\/offline\/accessibility.*remain(?:s)? unverified/i.test(
        source,
      ),
  };
}
function collectRecoveryCandidates(runs, _openPullRequests, now) {
  const candidates = [];
  const retryablePolicies = WORKFLOW_POLICIES.filter(
    (policy) => policy.retryTimeout && SOURCE_IDS.has(policy.id),
  );
  for (const policy of retryablePolicies) {
    const exactHeadRuns = (runs || []).filter(
      (run) =>
        run.workflowId === policy.id &&
        run.scope === 'client-main' &&
        run.expectedCurrentHeadSha &&
        run.headSha === run.expectedCurrentHeadSha,
    );
    if (!exactHeadRuns.length) continue;
    const run = latestRun(exactHeadRuns, policy.id, 'client-main', exactHeadRuns[0].headSha);
    if (!run || classifyRun(run, policy, now).code !== 'TIMEOUT_RETRY_ELIGIBLE') continue;
    if (!Number.isSafeInteger(Number(run.runId)) || Number(run.runId) <= 0) continue;
    candidates.push({
      workflowId: run.workflowId,
      workflowName: policy.name,
      runId: Number(run.runId),
      runNumber: Number(run.runNumber) || null,
      runAttempt: Number(run.runAttempt) || 1,
      status: run.status,
      conclusion: run.conclusion,
      headSha: run.headSha,
      scope: run.scope,
      htmlUrl: run.htmlUrl || '',
      reason: 'Latest exact-head source-validation run timed out; only failed jobs may be rerun.',
    });
  }
  return candidates.slice(0, MAX_RECOVERIES_PER_RUN);
}
function pullRequestGateState(pr, checks) {
  const failed = checks.some((item) =>
    ['FAIL', 'STALLED', 'TIMEOUT_ESCALATE', 'UNKNOWN'].includes(item.code),
  );
  if (failed) return 'BLOCKED';
  if (pr.reviewState === 'CHANGES_REQUESTED') return 'CHANGES_REQUESTED';
  const pending = checks.some((item) =>
    ['NOT_RUN', 'PENDING', 'RUNNING', 'CANCELLED', 'SKIPPED', 'TIMEOUT_RETRY_ELIGIBLE'].includes(
      item.code,
    ),
  );
  if (pending) return 'WAITING_FOR_CHECKS';
  return checks.every((item) => item.code === 'PASS')
    ? 'CHECKS_GREEN_REVIEW_REQUIRED'
    : 'NEEDS_REVIEW';
}
function buildMonitorReport(snapshot, now = new Date()) {
  const capturedAt = (asDate(now) || new Date()).toISOString();
  const handoff = snapshot.handoffText || '';
  const clientMainSha =
    snapshot.clientMain && snapshot.clientMain.sha ? snapshot.clientMain.sha : '';
  const documentedBaseline = extractDocumentedBaseline(handoff);
  const runs = Array.isArray(snapshot.runs) ? snapshot.runs : [];
  const prs = Array.isArray(snapshot.openPullRequests) ? snapshot.openPullRequests : [];
  const sourceChecks = WORKFLOW_POLICIES.filter((item) => item.required).map((policy) =>
    checkView(policy, latestRun(runs, policy.id, 'client-main', clientMainSha), now),
  );
  const openPullRequests = prs.slice(0, 15).map((pr) => {
    const checks = WORKFLOW_POLICIES.filter((item) => item.required).map((policy) =>
      checkView(policy, latestRun(runs, policy.id, 'pull_request', pr.headSha, pr.number), now),
    );
    return {
      number: pr.number,
      title: String(pr.title || '')
        .replace(/[\\r\\n|]+/g, ' ')
        .slice(0, 180),
      url: pr.htmlUrl || '',
      draft: Boolean(pr.draft),
      baseRef: pr.baseRef || '',
      headRef: pr.headRef || '',
      headSha: pr.headSha || '',
      headRepoFullName: pr.headRepoFullName || '',
      baseRepoFullName: pr.baseRepoFullName || '',
      mergeable: pr.mergeable,
      reviewState: pr.reviewState || 'NOT_INSPECTED',
      requestedReviewers: Array.isArray(pr.requestedReviewers)
        ? pr.requestedReviewers.slice(0, 8)
        : [],
      checks,
      state: pullRequestGateState(pr, checks),
    };
  });
  const operationalRuns = WORKFLOW_POLICIES.filter((item) => item.category === 'operational').map(
    (policy) => {
      const run = latestRun(runs, policy.id, 'client-main', null);
      const view = checkView(policy, run, now);
      if (run && run.headSha !== clientMainSha) {
        return {
          ...view,
          code: 'STALE_HEAD',
          label: 'Stale source SHA (' + view.label + ')',
          blocker: true,
          originalCode: view.code,
          reason:
            'The latest operational run used ' +
            (run.headSha || 'an unknown SHA') +
            ', not current client-main ' +
            (clientMainSha || 'SHA unknown') +
            '. Original result: ' +
            view.label +
            '.',
          category: policy.category,
        };
      }
      return { ...view, category: policy.category };
    },
  );
  const failedSource = sourceChecks.filter((item) =>
    ['FAIL', 'STALLED', 'TIMEOUT_ESCALATE', 'UNKNOWN'].includes(item.code),
  );
  const incompleteSource = sourceChecks.filter((item) =>
    ['NOT_RUN', 'PENDING', 'RUNNING', 'CANCELLED', 'SKIPPED', 'TIMEOUT_RETRY_ELIGIBLE'].includes(
      item.code,
    ),
  );
  const blockedPrs = openPullRequests.filter(
    (item) => item.state === 'BLOCKED' || item.state === 'CHANGES_REQUESTED',
  );
  const waitingPrs = openPullRequests.filter((item) => item.state === 'WAITING_FOR_CHECKS');
  const failedOperational = operationalRuns.filter((item) =>
    ['FAIL', 'STALLED', 'TIMEOUT_ESCALATE', 'UNKNOWN', 'STALE_HEAD'].includes(item.code),
  );
  const incompleteOperational = operationalRuns.filter((item) =>
    ['NOT_RUN', 'PENDING', 'RUNNING', 'CANCELLED', 'SKIPPED', 'TIMEOUT_RETRY_ELIGIBLE'].includes(
      item.code,
    ),
  );
  const gates = parseReleaseGates(handoff);
  const baselineDrift = Boolean(
    documentedBaseline && clientMainSha && documentedBaseline !== clientMainSha,
  );
  const warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
  const governance = snapshot.repositoryGovernance || {
    status: 'NOT_VERIFIED',
    note: 'Repository protection policy was not checked.',
  };
  const blockers = [];
  for (const check of failedSource)
    blockers.push(
      check.name + ': ' + check.label + ' on client-main (' + (check.sha || 'SHA unknown') + ').',
    );
  for (const pr of blockedPrs) {
    if (pr.reviewState === 'CHANGES_REQUESTED') {
      blockers.push(
        'PR #' + pr.number + ' has changes requested; address review feedback before merge.',
      );
    }
    if (pr.state === 'BLOCKED') {
      blockers.push('PR #' + pr.number + ' has a failed or stalled required source check.');
    }
  }
  for (const run of failedOperational)
    blockers.push(run.name + ': last recorded staging/package run is ' + run.label + '.');
  for (const run of incompleteOperational)
    blockers.push(run.name + ': ' + run.label + ' — current operational evidence is incomplete.');
  if (baselineDrift)
    blockers.push(
      'docs/HANDOFF.md baseline (' +
        documentedBaseline +
        ') differs from client-main (' +
        clientMainSha +
        ').',
    );
  if (gates.stagingUnverified)
    blockers.push(
      'Live staging is documented as unverified; operational release gates remain open.',
    );
  if (gates.restoreUnverified)
    blockers.push('Backup/restore is documented as unverified; recovery acceptance remains open.');
  if (gates.deviceAcceptanceUnverified)
    blockers.push('Real-device/offline/accessibility acceptance is documented as unverified.');
  for (const warning of warnings)
    blockers.push('Monitor data warning: ' + String(warning).slice(0, 220));
  const allSourceChecksPassed =
    sourceChecks.length > 0 && sourceChecks.every((item) => item.code === 'PASS');
  let state = 'HEALTHY';
  if (failedSource.length || blockedPrs.length || failedOperational.length || warnings.length)
    state = 'BLOCKED';
  else if (incompleteSource.length || waitingPrs.length || incompleteOperational.length)
    state = 'WAITING_FOR_VALIDATION';
  else if (
    gates.stagingUnverified ||
    gates.restoreUnverified ||
    gates.deviceAcceptanceUnverified ||
    baselineDrift ||
    governance.status !== 'CLASSIC_PROTECTION_ENABLED'
  )
    state = 'SOURCE_GREEN_OPERATIONAL_GATES_OPEN';
  const recoveryCandidates = collectRecoveryCandidates(runs, prs, now);
  const nextActions = [];
  const changeRequestPrs = openPullRequests.filter(
    (item) => item.reviewState === 'CHANGES_REQUESTED',
  );
  if (changeRequestPrs.length) {
    nextActions.push(
      'Resolve requested changes on PR(s) ' +
        changeRequestPrs.map((item) => '#' + item.number).join(', ') +
        ' before considering merge readiness.',
    );
  }
  if (
    failedSource.length ||
    blockedPrs.some((item) => item.state === 'BLOCKED') ||
    failedOperational.length
  )
    nextActions.push(
      'Inspect exact failed job/step and logs; distinguish code defects from infrastructure/timeouts before retrying.',
    );
  if (recoveryCandidates.length)
    nextActions.push(
      'Retry eligible timed-out source-validation runs only; maximum three total attempts per workflow run.',
    );
  if (incompleteOperational.length)
    nextActions.push(
      'Obtain completed current-SHA operational evidence for ' +
        incompleteOperational.map((item) => item.name + ' (' + item.label + ')').join(', ') +
        '. Missing, running, cancelled and skipped operational runs are not release evidence.',
    );
  if (baselineDrift)
    nextActions.push(
      'Synchronize docs/HANDOFF.md and execution plan to the exact client-main SHA.',
    );
  if (gates.stagingUnverified || gates.restoreUnverified || gates.deviceAcceptanceUnverified)
    nextActions.push(
      'Prioritize staging identity, backend/frontend staging release, guarded UAT, isolated restore and intended-device acceptance before new product features.',
    );
  if (waitingPrs.length || incompleteSource.length)
    nextActions.push(
      'Wait for or investigate missing exact-head checks; skipped, cancelled, pending and missing checks are never passes.',
    );
  if (warnings.length)
    nextActions.push(
      'Resolve monitor API/data errors before treating this observation as a complete delivery signal.',
    );
  if (governance.status !== 'CLASSIC_PROTECTION_ENABLED')
    nextActions.push(
      'Owner/admin must verify rulesets and branch protection actually apply to client-main; the monitor never assumes a ruleset protects the integration branch.',
    );
  if (!nextActions.length)
    nextActions.push(
      'Review current phase exit criteria and select the next measured implementation batch.',
    );
  const runContext = snapshot.githubRun || {};
  const fullName =
    snapshot.repository && snapshot.repository.fullName
      ? snapshot.repository.fullName
      : 'unknown/unknown';
  return {
    schemaVersion: 1,
    capturedAt,
    repository: fullName,
    defaultBranch:
      snapshot.repository && snapshot.repository.defaultBranch
        ? snapshot.repository.defaultBranch
        : 'unknown',
    integrationBranch: 'client-main',
    clientMainSha,
    clientMainUrl: clientMainSha
      ? 'https://github.com/' + fullName + '/commit/' + clientMainSha
      : '',
    documentedBaseline,
    baselineDrift,
    phase: extractPhase(handoff),
    state,
    allSourceChecksPassed,
    sourceChecks,
    openPullRequests,
    operationalRuns,
    blockers,
    nextActions,
    recoveryCandidates,
    recoveryActions: Array.isArray(snapshot.recoveryActions) ? snapshot.recoveryActions : [],
    handoffReleaseGates: gates.documentedItems,
    releaseGates: {
      stagingUnverified: gates.stagingUnverified,
      restoreUnverified: gates.restoreUnverified,
      deviceAcceptanceUnverified: gates.deviceAcceptanceUnverified,
    },
    warnings,
    repositoryGovernance: governance,
    githubRun: {
      id: runContext.id || null,
      runNumber: runContext.runNumber || null,
      runAttempt: runContext.runAttempt || 1,
      eventName: runContext.eventName || 'unknown',
      ref: runContext.ref || 'unknown',
      url: runContext.url || '',
    },
    scheduleNote:
      snapshot.repository && snapshot.repository.defaultBranch !== 'client-main'
        ? 'GitHub scheduled workflows and workflow_dispatch require the workflow file on the default branch (' +
          snapshot.repository.defaultBranch +
          '). This monitor is event-driven only while main remains frozen; manual dispatch is not configured. ChatGPT supplies the configured hourly monitor.'
        : 'Repository event-driven monitor; manual dispatch is not configured. ChatGPT supplies the configured hourly review.',
    sourceRunCount: runs.length,
  };
}
function shouldRetryTimedOutRun(candidate) {
  if (!candidate || !SOURCE_IDS.has(candidate.workflowId)) return false;
  if (
    String(candidate.status || '').toLowerCase() !== 'completed' ||
    String(candidate.conclusion || '').toLowerCase() !== 'timed_out'
  )
    return false;
  const policy = WORKFLOW_POLICIES.find((item) => item.id === candidate.workflowId);
  return Boolean(
    policy &&
    policy.retryTimeout &&
    (Number(candidate.runAttempt) || 1) < MAX_RUN_ATTEMPTS &&
    Number(candidate.runId) > 0,
  );
}
function historyEntry(report) {
  const run = report.githubRun || {};
  const key = String(run.id || 'no-run') + ':' + String(run.runAttempt || 1);
  const checks = (report.sourceChecks || []).map((item) => item.name + '=' + item.code).join(', ');
  const recoveries = (report.recoveryActions || [])
    .map((item) => item.status + ':' + item.workflowName)
    .join(', ');
  return (
    '<!-- run-key:' +
    key +
    ' --> - ' +
    report.capturedAt +
    ' — run ' +
    (run.runNumber || '?') +
    ' attempt ' +
    (run.runAttempt || 1) +
    ' — ' +
    report.state +
    ' — SHA ' +
    (report.clientMainSha || 'unknown') +
    ' — checks [' +
    checks +
    ']' +
    (recoveries ? ' — recovery [' + recoveries + ']' : '')
  );
}
function appendHistory(previousBody, report, maxEntries = MAX_HISTORY_ENTRIES) {
  const match = String(previousBody || '').match(
    /<!-- AUTO-DEV-HISTORY-BEGIN -->([\s\S]*?)<!-- AUTO-DEV-HISTORY-END -->/,
  );
  let entries = match
    ? match[1]
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('<!-- run-key:'))
    : [];
  const entry = historyEntry(report);
  const key = (entry.match(/<!-- run-key:([^ ]+) -->/) || [])[1] || entry;
  if (!entries.some((line) => line.includes('<!-- run-key:' + key + ' -->')))
    entries.unshift(entry);
  const seen = new Set();
  const unique = [];
  for (const line of entries) {
    const lineKey = (line.match(/<!-- run-key:([^ ]+) -->/) || [])[1] || line;
    if (seen.has(lineKey)) continue;
    seen.add(lineKey);
    unique.push(line);
  }
  return unique.slice(0, Math.max(1, maxEntries));
}
function parseRecoveryLedger(previousBody) {
  const match = String(previousBody || '').match(
    /<!-- AUTO-DEV-RECOVERY-BEGIN -->([\s\S]*?)<!-- AUTO-DEV-RECOVERY-END -->/,
  );
  if (!match) return [];
  return match[1]
    .split(/\r?\n/)
    .map((line) => {
      const found = line.match(/<!-- recovery-key:([0-9]+:[0-9]+) status:([A-Z_]+) -->\s*(.*)$/);
      return found ? { key: found[1], status: found[2], summary: found[3] } : null;
    })
    .filter(Boolean);
}
function mergeRecoveryLedger(previousBody, actions) {
  const map = new Map();
  for (const item of parseRecoveryLedger(previousBody)) map.set(item.key, item);
  for (const item of actions || []) {
    if (!item.key || !item.status) continue;
    map.set(item.key, {
      key: item.key,
      status: item.status,
      summary: String(item.summary || item.workflowName || '')
        .replace(/[\r\n]+/g, ' ')
        .slice(0, 260),
    });
  }
  return Array.from(map.values()).slice(-50);
}
function buildCheckpointIssueBody(report, previousBody = '') {
  const history = appendHistory(previousBody, report);
  const ledger = mergeRecoveryLedger(previousBody, report.recoveryActions || []);
  const sourceRows = (report.sourceChecks || [])
    .map(
      (item) =>
        '| ' +
        item.name +
        ' | ' +
        item.label +
        ' | ' +
        (item.sha || '—') +
        ' | ' +
        (item.url || '—') +
        ' |',
    )
    .join('\n');
  const prRows = (report.openPullRequests || [])
    .map((pr) => {
      const checks = (pr.checks || []).map((item) => item.name + ': ' + item.label).join('; ');
      return (
        '| [#' +
        pr.number +
        '](' +
        pr.url +
        ') | ' +
        pr.title +
        ' | ' +
        pr.state +
        ' | ' +
        checks +
        ' | ' +
        pr.reviewState +
        ' |'
      );
    })
    .join('\n');
  const opsRows = (report.operationalRuns || [])
    .map(
      (item) =>
        '| ' +
        item.name +
        ' | ' +
        item.label +
        ' | ' +
        (item.sha || '—') +
        ' | ' +
        (item.url || '—') +
        ' |',
    )
    .join('\n');
  const blockers = report.blockers.length
    ? report.blockers.map((item) => '- ' + item).join('\n')
    : '- No failed or stalled source checks were detected in this observation.';
  const actions = report.nextActions.map((item) => '- ' + item).join('\n');
  const gates = report.handoffReleaseGates.length
    ? report.handoffReleaseGates.map((item) => '- ' + item).join('\n')
    : '- Consult docs/HANDOFF.md for release gates.';
  const recoveryRows = ledger
    .map(
      (item) => '<!-- recovery-key:' + item.key + ' status:' + item.status + ' --> ' + item.summary,
    )
    .join('\n');
  const run = report.githubRun || {};
  return [
    '# Autonomous Delivery Checkpoint',
    '',
    '> Persistent status record maintained by the Autonomous Development Monitor. Git source and docs/HANDOFF.md are authoritative; this issue is a checkpoint, not deployment approval.',
    '',
    '- **Updated:** ' + report.capturedAt,
    '- **State:** ' + report.state,
    '- **Current phase:** ' + report.phase,
    '- **Integration branch:** client-main',
    '- **Current SHA:** [' +
      (report.clientMainSha || 'unknown') +
      '](' +
      (report.clientMainUrl || '') +
      ')',
    '- **Documented baseline:** ' +
      (report.documentedBaseline || 'not recorded') +
      (report.baselineDrift ? ' — DRIFT' : ''),
    '- **Monitor run:** [' +
      (run.runNumber || '?') +
      ' attempt ' +
      (run.runAttempt || 1) +
      '](' +
      (run.url || '') +
      ')',
    '- **Schedule:** ' + report.scheduleNote,
    '- **Repository governance:** ' +
      report.repositoryGovernance.status +
      ' — ' +
      report.repositoryGovernance.note,
    '',
    '## Exact-head source checks',
    '',
    '| Workflow | State | SHA | Run |',
    '|---|---|---|---|',
    sourceRows || '| (not found) | Not run | — | — |',
    '',
    '## Open pull requests',
    '',
    '| PR | Title | Gate | Required source checks | Review state |',
    '|---|---|---|---|---|',
    prRows || '| — | No open PRs targeting client-main | — | — | — |',
    '',
    '## Latest staging/package workflow runs',
    '',
    '| Workflow | State | SHA | Run |',
    '|---|---|---|---|',
    opsRows || '| — | No workflow runs found | — | — |',
    '',
    '## Blockers and failure analysis',
    '',
    blockers,
    '',
    '## Next actions',
    '',
    actions || '- Review docs/HANDOFF.md and the execution plan.',
    '',
    '## Outstanding release gates',
    '',
    gates,
    '',
    '## Timeout recovery ledger',
    '',
    '<!-- AUTO-DEV-RECOVERY-BEGIN -->',
    recoveryRows || '<!-- no-recovery-actions-recorded -->',
    '<!-- AUTO-DEV-RECOVERY-END -->',
    '',
    '## Recent monitor run history',
    '',
    '<!-- AUTO-DEV-HISTORY-BEGIN -->',
    history.join('\n'),
    '<!-- AUTO-DEV-HISTORY-END -->',
    '',
    '## Mandatory safety boundary',
    '',
    '- The monitor never merges PRs, pushes Clasp source, deploys Apps Script, mutates Google Sheets/Drive, runs write-capable staging UAT, performs migrations, publishes cPanel artifacts, or changes production.',
    '- Automatic retries are restricted to timed-out CI / Browser E2E / Full Flight source validation; at most three total attempts per workflow run.',
    '- Code/test failures require root-cause triage and a reviewed fix. Required checks, reviews, branch protection and owner release gates must never be bypassed.',
    '',
  ].join('\n');
}
function formatSummary(report) {
  const sourceRows = (report.sourceChecks || [])
    .map((item) => '| ' + item.name + ' | ' + item.label + ' | ' + (item.sha || '—') + ' |')
    .join('\n');
  const prRows = (report.openPullRequests || [])
    .map((pr) => '| #' + pr.number + ' | ' + pr.title + ' | ' + pr.state + ' |')
    .join('\n');
  const recovery = report.recoveryCandidates.length
    ? report.recoveryCandidates
        .map(
          (item) =>
            '- ' +
            item.workflowName +
            ' run ' +
            item.runNumber +
            ' attempt ' +
            item.runAttempt +
            ' is eligible for bounded retry.',
        )
        .join('\n')
    : '- No timed-out source-validation run is eligible for automatic recovery in this observation.';
  return [
    '# Autonomous Development Monitor',
    '',
    '- **State:** ' + report.state,
    '- **Phase:** ' + report.phase,
    '- **client-main:** ' + (report.clientMainSha || 'unknown'),
    '- **Default branch:** ' + report.defaultBranch,
    '- **Observation:** ' + report.capturedAt,
    '',
    '## Exact-head client-main source checks',
    '',
    '| Workflow | Status | SHA |',
    '|---|---|---|',
    sourceRows,
    '',
    '## Open PRs targeting client-main',
    '',
    '| PR | Title | Gate |',
    '|---|---|---|',
    prRows || '| — | No open PRs | — |',
    '',
    '## Blockers',
    '',
    report.blockers.length
      ? report.blockers.map((item) => '- ' + item).join('\n')
      : '- No failed or stalled workflow identified.',
    '',
    '## Timeout recovery',
    '',
    recovery,
    '',
    '## Operational release state',
    '',
    '- Staging unverified: ' + report.releaseGates.stagingUnverified,
    '- Backup/restore unverified: ' + report.releaseGates.restoreUnverified,
    '- Device acceptance unverified: ' + report.releaseGates.deviceAcceptanceUnverified,
    '- The monitor does not deploy, migrate, publish production artifacts, or merge a PR.',
    '',
    '## Next actions',
    '',
    report.nextActions.map((item) => '- ' + item).join('\n'),
    '',
    '## Schedule / branch policy',
    '',
    report.scheduleNote,
    '',
  ].join('\n');
}
module.exports = {
  CHECKPOINT_ISSUE_TITLE,
  MAX_RECOVERIES_PER_RUN,
  MAX_HISTORY_ENTRIES,
  MAX_RUN_ATTEMPTS,
  SOURCE_IDS,
  WORKFLOW_POLICIES,
  ageMinutes,
  appendHistory,
  buildCheckpointIssueBody,
  refreshExactHeadSourceRuns,
  buildMonitorReport,
  classifyRun,
  collectRecoveryCandidates,
  deriveReviewState,
  formatSummary,
  parseRecoveryLedger,
  shouldRetryTimedOutRun,
};
if (require.main === module) {
  const fs = require('node:fs');
  const args = process.argv.slice(2);
  function option(name) {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  }
  const inputPath = option('--input');
  const outputPath = option('--output');
  const summaryPath = option('--summary');
  if (!inputPath || !outputPath) {
    console.error(
      'Usage: node scripts/autonomous-dev-monitor.js --input <snapshot.json> --output <report.json> [--summary <markdown-path>]',
    );
    process.exit(2);
  }
  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  } catch (error) {
    console.error('Could not read monitor snapshot JSON: ' + error.message);
    process.exit(2);
  }
  try {
    const report = buildMonitorReport(snapshot);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
    if (summaryPath) fs.writeFileSync(summaryPath, formatSummary(report));
    process.stdout.write(formatSummary(report));
    if (!report.clientMainSha) {
      console.error('Could not establish client-main SHA from the monitor snapshot.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Autonomous monitor failed safely: ' + error.message);
    process.exit(2);
  }
}
