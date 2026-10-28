'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  REQUIRED_CHECK_GROUPS,
  buildGovernanceEvidence,
  evaluateRepositoryGovernance,
  patternMatches,
  requestGitHubJson,
} = require('../scripts/verify-client-main-governance');

const repositoryName = 'tchouhanjsm/cash-voucher';
const requiredContexts = [
  'quality',
  'Browser E2E / browser',
  'Full Flight Test / flight',
  'Autonomous Development Monitor / Inspect exact-head delivery state',
];

function classicProtection() {
  return {
    required_status_checks: { strict: true, contexts: requiredContexts, checks: [] },
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
    },
    required_conversation_resolution: { enabled: true },
    enforce_admins: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
}

function ruleSet(name, include, rules, bypassActors = []) {
  return {
    id: name === 'integration' ? 101 : name === 'legacy-freeze' ? 102 : 103,
    name,
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include, exclude: [] } },
    rules,
    bypass_actors: bypassActors,
  };
}

function integrationRuleSet(include = ['client-main']) {
  return ruleSet('integration', include, [
    {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: requiredContexts.map((context) => ({
          context,
          integration_id: 15368,
        })),
      },
    },
    {
      type: 'pull_request',
      parameters: {
        required_approving_review_count: 1,
        dismiss_stale_reviews_on_push: true,
        required_review_thread_resolution: true,
      },
    },
    { type: 'deletion' },
    { type: 'non_fast_forward' },
  ]);
}

function legacyFreezeRuleSet(include = ['main'], bypassActors = []) {
  return ruleSet(
    'legacy-freeze',
    include,
    [{ type: 'update' }, { type: 'deletion' }],
    bypassActors,
  );
}

function goodSnapshot() {
  return {
    repository: { full_name: repositoryName, default_branch: 'client-main' },
    integrationBranch: { name: 'client-main', protected: true },
    legacyBranch: { name: 'main', protected: true },
    integrationProtection: classicProtection(),
    rulesets: [legacyFreezeRuleSet()],
  };
}

function errorCodes(snapshot) {
  return evaluateRepositoryGovernance(snapshot).errors.map((error) => error.code);
}

async function main() {
  assert.equal(REQUIRED_CHECK_GROUPS.length, 4);
  assert.equal(patternMatches('client-main', 'client-main', 'main'), true);
  assert.equal(patternMatches('refs/heads/client-main', 'client-main', 'main'), true);
  assert.equal(patternMatches('~DEFAULT_BRANCH', 'main', 'main'), true);
  assert.equal(patternMatches('~DEFAULT_BRANCH', 'client-main', 'main'), false);
  assert.equal(patternMatches('client/*', 'client/fix', 'main'), true);
  assert.equal(patternMatches('client/*', 'client/deep/fix', 'main'), false);

  const jobNamedChecks = goodSnapshot();
  jobNamedChecks.integrationProtection.required_status_checks.contexts = [
    'quality',
    'browser',
    'flight',
    'Inspect exact-head delivery state',
  ];
  const validJobNames = evaluateRepositoryGovernance(jobNamedChecks);
  assert.equal(validJobNames.ok, true, JSON.stringify(validJobNames.errors));

  const passingEvidence = buildGovernanceEvidence(
    evaluateRepositoryGovernance(goodSnapshot()),
    '2026-10-28T09:30:00.000Z',
  );
  assert.equal(passingEvidence.evidenceType, 'cash-voucher-client-main-governance');
  assert.equal(passingEvidence.repository, repositoryName);
  assert.equal(passingEvidence.observedAt, '2026-10-28T09:30:00.000Z');
  assert.equal(passingEvidence.ok, true);
  assert.equal(passingEvidence.defaultBranch, 'client-main');
  assert.equal(passingEvidence.readOnly, true);
  assert.equal(passingEvidence.errors.length, 0);

  const blockedEvidence = buildGovernanceEvidence({
    ok: false,
    observedDefaultBranch: 'main',
    integrationPolicy: 'none',
    integrationRulesetIds: [],
    legacyFreezeRulesetIds: [],
    errors: [{ code: 'DEFAULT_BRANCH_NOT_CLIENT_MAIN', message: 'expected test blocker' }],
  });
  assert.equal(blockedEvidence.ok, false);
  assert.equal(blockedEvidence.errors[0].code, 'DEFAULT_BRANCH_NOT_CLIENT_MAIN');
  assert.equal(JSON.stringify(blockedEvidence).includes('test-token'), false);

  const noTokenJson = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'scripts', 'verify-client-main-governance.js'), '--json'],
    {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '' },
    },
  );
  assert.equal(noTokenJson.status, 2);
  assert.equal(noTokenJson.stderr, '');
  const noTokenEvidence = JSON.parse(noTokenJson.stdout);
  assert.equal(noTokenEvidence.evidenceType, 'cash-voucher-client-main-governance');
  assert.equal(noTokenEvidence.ok, false);
  assert.equal(noTokenEvidence.errors[0].code, 'TOKEN_REQUIRED');

  const validClassic = evaluateRepositoryGovernance(goodSnapshot());
  assert.equal(validClassic.ok, true, JSON.stringify(validClassic.errors));
  assert.equal(validClassic.integrationPolicy, 'classic-branch-protection');
  assert.deepEqual(validClassic.legacyFreezeRulesetIds, [102]);

  const rulesetOnly = goodSnapshot();
  rulesetOnly.integrationProtection = null;
  rulesetOnly.integrationBranch.protected = false;
  rulesetOnly.legacyBranch.protected = false;
  rulesetOnly.rulesets.push(integrationRuleSet());
  const validRuleset = evaluateRepositoryGovernance(rulesetOnly);
  assert.equal(validRuleset.ok, true, JSON.stringify(validRuleset.errors));
  assert.equal(validRuleset.integrationPolicy, 'active-ruleset');
  assert.deepEqual(validRuleset.integrationRulesetIds, [101]);

  const clientMainUpdateRestricted = goodSnapshot();
  clientMainUpdateRestricted.integrationProtection = null;
  const restrictedRuleset = integrationRuleSet();
  restrictedRuleset.rules.push({ type: 'update' });
  clientMainUpdateRestricted.rulesets.push(restrictedRuleset);
  assert.ok(
    errorCodes(clientMainUpdateRestricted).includes('CLIENT_MAIN_RULESET_UPDATES_RESTRICTED'),
  );

  const wrongDefault = goodSnapshot();
  wrongDefault.repository.default_branch = 'main';
  assert.ok(errorCodes(wrongDefault).includes('DEFAULT_BRANCH_NOT_CLIENT_MAIN'));

  const unprotected = goodSnapshot();
  unprotected.integrationBranch.protected = false;
  unprotected.integrationProtection = null;
  unprotected.rulesets = [legacyFreezeRuleSet()];
  assert.ok(errorCodes(unprotected).includes('CLIENT_MAIN_RULESET_NOT_APPLICABLE'));

  const missingReview = goodSnapshot();
  missingReview.integrationProtection.required_pull_request_reviews.required_approving_review_count = 0;
  missingReview.rulesets = [legacyFreezeRuleSet()];
  assert.ok(errorCodes(missingReview).includes('CLIENT_MAIN_CLASSIC_REVIEW_POLICY_MISSING'));

  const missingThreadResolution = goodSnapshot();
  delete missingThreadResolution.integrationProtection.required_conversation_resolution;
  missingThreadResolution.rulesets = [legacyFreezeRuleSet()];
  assert.ok(
    errorCodes(missingThreadResolution).includes('CLIENT_MAIN_CLASSIC_THREAD_RESOLUTION_MISSING'),
  );

  const missingCheck = goodSnapshot();
  missingCheck.integrationProtection.required_status_checks.contexts = ['quality'];
  missingCheck.rulesets = [legacyFreezeRuleSet()];
  assert.ok(errorCodes(missingCheck).includes('CLIENT_MAIN_CLASSIC_REQUIRED_CHECKS_MISSING'));

  const nonStrict = goodSnapshot();
  nonStrict.integrationProtection.required_status_checks.strict = false;
  nonStrict.rulesets = [legacyFreezeRuleSet()];
  assert.ok(errorCodes(nonStrict).includes('CLIENT_MAIN_CLASSIC_STATUS_CHECKS_NOT_STRICT'));

  const adminBypass = goodSnapshot();
  adminBypass.integrationProtection.enforce_admins.enabled = false;
  adminBypass.rulesets = [legacyFreezeRuleSet()];
  assert.ok(errorCodes(adminBypass).includes('CLIENT_MAIN_CLASSIC_ADMIN_ENFORCEMENT_MISSING'));

  const forcePush = goodSnapshot();
  forcePush.integrationProtection.allow_force_pushes.enabled = true;
  forcePush.rulesets = [legacyFreezeRuleSet()];
  assert.ok(errorCodes(forcePush).includes('CLIENT_MAIN_CLASSIC_FORCE_PUSH_ENABLED'));

  const mainNotFrozen = goodSnapshot();
  mainNotFrozen.repository.default_branch = 'main';
  mainNotFrozen.rulesets = [
    ruleSet(
      'legacy-default-only',
      ['~DEFAULT_BRANCH'],
      [
        { type: 'deletion' },
        { type: 'non_fast_forward' },
        { type: 'pull_request', parameters: { required_approving_review_count: 0 } },
        {
          type: 'required_status_checks',
          parameters: {
            strict_required_status_checks_policy: true,
            required_status_checks: [{ context: 'quality' }],
          },
        },
      ],
    ),
  ];
  assert.ok(
    errorCodes(mainNotFrozen).includes('MAIN_FREEZE_RULESET_MISSING'),
    'default-branch-only rule set does not protect client-main',
  );

  const sharedMainFreeze = goodSnapshot();
  sharedMainFreeze.rulesets = [legacyFreezeRuleSet(['main', 'client-main'])];
  assert.ok(errorCodes(sharedMainFreeze).includes('MAIN_FREEZE_RULESET_MISSING'));

  const bypassedMain = goodSnapshot();
  bypassedMain.rulesets = [legacyFreezeRuleSet(['main'], [{ actor_id: 1, bypass_mode: 'always' }])];
  assert.ok(errorCodes(bypassedMain).includes('MAIN_FREEZE_BYPASS_PRESENT'));

  const onlyDefaultRuleset = goodSnapshot();
  onlyDefaultRuleset.repository.default_branch = 'main';
  onlyDefaultRuleset.integrationProtection = null;
  onlyDefaultRuleset.rulesets = [legacyFreezeRuleSet(['~DEFAULT_BRANCH'])];
  const onlyDefaultCodes = errorCodes(onlyDefaultRuleset);
  assert.ok(onlyDefaultCodes.includes('CLIENT_MAIN_RULESET_NOT_APPLICABLE'));
  assert.ok(onlyDefaultCodes.includes('MAIN_FREEZE_RULESET_MISSING'));

  const request = await requestGitHubJson(
    '/repos/' + repositoryName,
    'test-token',
    async (url, options) => {
      assert.equal(url, 'https://api.github.com/repos/' + repositoryName);
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(options.headers.Accept, 'application/vnd.github+json');
      assert.equal(options.method, 'GET');
      return { ok: true, json: async () => ({ full_name: repositoryName }) };
    },
  );
  assert.equal(request.full_name, repositoryName);
  await assert.rejects(
    requestGitHubJson(
      '/repos/' + repositoryName + '-evil/branches/main',
      'test-token',
      async () => ({
        ok: true,
        json: async () => ({}),
      }),
    ),
    /INVALID_API_ENDPOINT/,
  );
  await assert.rejects(
    requestGitHubJson('/repos/other/repo', 'test-token', async () => ({
      ok: true,
      json: async () => ({}),
    })),
    /INVALID_API_ENDPOINT/,
  );
  await assert.rejects(
    requestGitHubJson('/repos/' + repositoryName, 'test-token', async () => ({
      ok: false,
      status: 403,
    })),
    (error) =>
      error.status === 403 &&
      error.message === 'GITHUB_API_RESPONSE' &&
      !error.message.includes('test-token'),
  );

  console.log(
    'Client-main governance verification contract OK — integration checks, approval policy and legacy-main freeze fail closed.',
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
