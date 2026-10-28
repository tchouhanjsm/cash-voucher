'use strict';

const REPOSITORY = 'tchouhanjsm/cash-voucher';
const INTEGRATION_BRANCH = 'client-main';
const LEGACY_BRANCH = 'main';
const REQUIRED_CHECK_GROUPS = Object.freeze([
  { label: 'CI / Quality', aliases: ['ciquality', 'quality'] },
  { label: 'Browser E2E', aliases: ['browsere2e', 'browser'] },
  { label: 'Full Flight Test', aliases: ['fullflighttest', 'flight'] },
  {
    label: 'Autonomous Development Monitor',
    aliases: ['autonomousdevelopmentmonitor', 'inspectexactheaddeliverystate'],
  },
]);
const API_BASE = 'https://api.github.com';
const API_TIMEOUT_MS = 10000;
const MAX_RULESET_PAGES = 10;
const PAGE_SIZE = 100;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeContext(value) {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
}

function hasRequiredContexts(contexts) {
  const normalized = Array.isArray(contexts) ? contexts.map(normalizeContext) : [];
  return REQUIRED_CHECK_GROUPS.filter(
    (group) =>
      !group.aliases.some((alias) => {
        const expected = normalizeContext(alias);
        return normalized.some((actual) => actual === expected || actual.startsWith(expected));
      }),
  ).map((group) => group.label);
}

function patternMatches(pattern, branch, defaultBranch) {
  if (typeof pattern !== 'string' || !pattern) return false;
  if (pattern === '~ALL') return true;
  if (pattern === '~DEFAULT_BRANCH') return branch === defaultBranch;
  const normalized = pattern.replace(/^refs\/heads\//, '');
  if (normalized === branch) return true;
  const pieces = normalized.split('*');
  if (pieces.length !== 2) return false;
  const prefix = pieces[0];
  const suffix = pieces[1];
  if (
    !branch.startsWith(prefix) ||
    !branch.endsWith(suffix) ||
    branch.length < prefix.length + suffix.length
  ) {
    return false;
  }
  // GitHub ruleset fnmatch uses FNM_PATHNAME: a single star cannot cross '/'.
  const wildcardValue = branch.slice(prefix.length, branch.length - suffix.length);
  return !wildcardValue.includes('/');
}

function matchingActiveBranchRulesets(rulesets, branch, defaultBranch) {
  if (!Array.isArray(rulesets)) return [];
  return rulesets.filter((ruleset) => {
    if (!isRecord(ruleset) || ruleset.target !== 'branch' || ruleset.enforcement !== 'active') {
      return false;
    }
    const refNames = ruleset.conditions && ruleset.conditions.ref_name;
    if (!isRecord(refNames) || !Array.isArray(refNames.include) || refNames.include.length === 0) {
      return false;
    }
    const included = refNames.include.some((pattern) =>
      patternMatches(pattern, branch, defaultBranch),
    );
    const excluded =
      Array.isArray(refNames.exclude) &&
      refNames.exclude.some((pattern) => patternMatches(pattern, branch, defaultBranch));
    return included && !excluded;
  });
}

function addError(errors, code, message) {
  errors.push({ code, message });
}

function classicIntegrationPolicy(protection) {
  const errors = [];
  if (!isRecord(protection)) {
    addError(
      errors,
      'CLIENT_MAIN_CLASSIC_PROTECTION_MISSING',
      'Classic branch protection is not configured.',
    );
    return { ok: false, errors };
  }
  const statusPolicy = protection.required_status_checks;
  if (!isRecord(statusPolicy)) {
    addError(
      errors,
      'CLIENT_MAIN_CLASSIC_STATUS_POLICY_MISSING',
      'Required status checks are not configured.',
    );
  } else {
    const contexts = [
      ...(Array.isArray(statusPolicy.contexts) ? statusPolicy.contexts : []),
      ...(Array.isArray(statusPolicy.checks)
        ? statusPolicy.checks.map((check) => (isRecord(check) ? check.context : ''))
        : []),
    ];
    if (statusPolicy.strict !== true) {
      addError(
        errors,
        'CLIENT_MAIN_CLASSIC_STATUS_CHECKS_NOT_STRICT',
        'Integration status checks must require the branch to be up to date.',
      );
    }
    const missing = hasRequiredContexts(contexts);
    if (missing.length) {
      addError(
        errors,
        'CLIENT_MAIN_CLASSIC_REQUIRED_CHECKS_MISSING',
        'Classic protection is missing required checks: ' + missing.join(', ') + '.',
      );
    }
  }
  const reviews = protection.required_pull_request_reviews;
  if (
    !isRecord(reviews) ||
    !Number.isInteger(reviews.required_approving_review_count) ||
    reviews.required_approving_review_count < 1
  ) {
    addError(
      errors,
      'CLIENT_MAIN_CLASSIC_REVIEW_POLICY_MISSING',
      'Integration pull requests must require at least one approval.',
    );
  }
  if (!isRecord(reviews) || reviews.dismiss_stale_reviews !== true) {
    addError(
      errors,
      'CLIENT_MAIN_CLASSIC_STALE_REVIEWS_NOT_DISMISSED',
      'Stale approvals must be dismissed after a new push.',
    );
  }
  if (!isRecord(protection.enforce_admins) || protection.enforce_admins.enabled !== true) {
    addError(
      errors,
      'CLIENT_MAIN_CLASSIC_ADMIN_ENFORCEMENT_MISSING',
      'Classic required checks must also apply to administrators.',
    );
  }
  if (!isRecord(protection.allow_force_pushes) || protection.allow_force_pushes.enabled !== false) {
    addError(
      errors,
      'CLIENT_MAIN_CLASSIC_FORCE_PUSH_ENABLED',
      'Force pushes must be explicitly disabled on client-main.',
    );
  }
  if (!isRecord(protection.allow_deletions) || protection.allow_deletions.enabled !== false) {
    addError(
      errors,
      'CLIENT_MAIN_CLASSIC_DELETION_ENABLED',
      'Deletion must be explicitly disabled on client-main.',
    );
  }
  return { ok: errors.length === 0, errors };
}

function integrationRulesetPolicy(rulesets, defaultBranch) {
  const matching = matchingActiveBranchRulesets(rulesets, INTEGRATION_BRANCH, defaultBranch);
  const errors = [];
  if (matching.length === 0) {
    addError(
      errors,
      'CLIENT_MAIN_RULESET_NOT_APPLICABLE',
      'No active repository ruleset applies to client-main.',
    );
    return { ok: false, errors, matching };
  }
  matching.forEach((ruleset) => {
    if (!Array.isArray(ruleset.bypass_actors)) {
      addError(
        errors,
        'CLIENT_MAIN_RULESET_BYPASS_UNKNOWN',
        'Ruleset bypass configuration could not be verified.',
      );
    } else if (ruleset.bypass_actors.length > 0) {
      addError(
        errors,
        'CLIENT_MAIN_RULESET_BYPASS_PRESENT',
        'Integration rulesets must not contain bypass actors.',
      );
    }
  });
  const rules = matching.flatMap((ruleset) => (Array.isArray(ruleset.rules) ? ruleset.rules : []));
  const statusRules = rules.filter(
    (rule) => isRecord(rule) && rule.type === 'required_status_checks',
  );
  const strictStatusRules = statusRules.filter(
    (rule) =>
      isRecord(rule.parameters) && rule.parameters.strict_required_status_checks_policy === true,
  );
  if (strictStatusRules.length === 0) {
    addError(
      errors,
      'CLIENT_MAIN_RULESET_STATUS_CHECKS_NOT_STRICT',
      'An integration ruleset must require up-to-date status checks.',
    );
  }
  const contexts = strictStatusRules.flatMap((rule) =>
    Array.isArray(rule.parameters.required_status_checks)
      ? rule.parameters.required_status_checks.map((check) =>
          isRecord(check) ? check.context : '',
        )
      : [],
  );
  const missing = hasRequiredContexts(contexts);
  if (missing.length) {
    addError(
      errors,
      'CLIENT_MAIN_RULESET_REQUIRED_CHECKS_MISSING',
      'Integration rulesets are missing required checks: ' + missing.join(', ') + '.',
    );
  }
  const pullRequestRules = rules.filter((rule) => isRecord(rule) && rule.type === 'pull_request');
  const reviewReady = pullRequestRules.some((rule) => {
    const parameters = rule.parameters;
    return (
      isRecord(parameters) &&
      Number.isInteger(parameters.required_approving_review_count) &&
      parameters.required_approving_review_count >= 1 &&
      parameters.dismiss_stale_reviews_on_push === true &&
      parameters.required_review_thread_resolution === true
    );
  });
  if (!reviewReady) {
    addError(
      errors,
      'CLIENT_MAIN_RULESET_REVIEW_POLICY_MISSING',
      'Integration rulesets must require an approval, dismiss stale reviews and resolve review threads.',
    );
  }
  if (!rules.some((rule) => isRecord(rule) && rule.type === 'deletion')) {
    addError(
      errors,
      'CLIENT_MAIN_RULESET_DELETION_MISSING',
      'Integration rulesets must prevent branch deletion.',
    );
  }
  if (!rules.some((rule) => isRecord(rule) && rule.type === 'non_fast_forward')) {
    addError(
      errors,
      'CLIENT_MAIN_RULESET_NON_FAST_FORWARD_MISSING',
      'Integration rulesets must prevent force pushes.',
    );
  }
  return { ok: errors.length === 0, errors, matching };
}

function legacyMainFreezePolicy(rulesets, defaultBranch) {
  const matching = matchingActiveBranchRulesets(
    rulesets,
    LEGACY_BRANCH,
    defaultBranch,
  ).filter((ruleset) => {
    const refNames = ruleset.conditions && ruleset.conditions.ref_name;
    return (
      isRecord(refNames) &&
      Array.isArray(refNames.include) &&
      refNames.include.some(
        (pattern) =>
          pattern === LEGACY_BRANCH || pattern === 'refs/heads/' + LEGACY_BRANCH,
      )
    );
  });
  const errors = [];
  const freeze = matching.filter((ruleset) => {
    const rules = Array.isArray(ruleset.rules) ? ruleset.rules : [];
    return (
      rules.some((rule) => isRecord(rule) && rule.type === 'update') &&
      rules.some((rule) => isRecord(rule) && rule.type === 'deletion')
    );
  });
  if (freeze.length === 0) {
    addError(
      errors,
      'MAIN_FREEZE_RULESET_MISSING',
      'An active main-specific ruleset must restrict updates and deletion.',
    );
    return { ok: false, errors, matching };
  }
  freeze.forEach((ruleset) => {
    if (!Array.isArray(ruleset.bypass_actors)) {
      addError(
        errors,
        'MAIN_FREEZE_BYPASS_UNKNOWN',
        'Legacy main bypass configuration could not be verified.',
      );
    } else if (ruleset.bypass_actors.length > 0) {
      addError(
        errors,
        'MAIN_FREEZE_BYPASS_PRESENT',
        'The frozen main ruleset must not contain bypass actors.',
      );
    }
  });
  return { ok: errors.length === 0, errors, matching: freeze };
}

function evaluateRepositoryGovernance(snapshot) {
  const errors = [];
  const repository = snapshot && snapshot.repository;
  const integrationBranch = snapshot && snapshot.integrationBranch;
  const legacyBranch = snapshot && snapshot.legacyBranch;
  const rulesets = snapshot && snapshot.rulesets;
  const defaultBranch = isRecord(repository) ? repository.default_branch : '';
  if (!isRecord(repository) || repository.full_name !== REPOSITORY) {
    addError(
      errors,
      'REPOSITORY_IDENTITY_MISMATCH',
      'GitHub returned an unexpected repository identity.',
    );
  }
  if (defaultBranch !== INTEGRATION_BRANCH) {
    addError(
      errors,
      'DEFAULT_BRANCH_NOT_CLIENT_MAIN',
      'The repository default branch must be client-main; main is legacy and read-only.',
    );
  }
  if (!isRecord(integrationBranch) || integrationBranch.name !== INTEGRATION_BRANCH) {
    addError(
      errors,
      'CLIENT_MAIN_BRANCH_UNAVAILABLE',
      'The client-main branch could not be verified.',
    );
  }
  if (!isRecord(legacyBranch) || legacyBranch.name !== LEGACY_BRANCH) {
    addError(errors, 'MAIN_BRANCH_UNAVAILABLE', 'The legacy main branch could not be verified.');
  }

  const classic = classicIntegrationPolicy(snapshot && snapshot.integrationProtection);
  const integrationRulesets = integrationRulesetPolicy(rulesets, defaultBranch);
  if (!classic.ok && !integrationRulesets.ok)
    errors.push(...classic.errors, ...integrationRulesets.errors);
  if (isRecord(integrationBranch) && integrationBranch.protected !== true) {
    addError(
      errors,
      'CLIENT_MAIN_BRANCH_UNPROTECTED',
      'GitHub reports client-main as unprotected.',
    );
  }
  const mainFreeze = legacyMainFreezePolicy(rulesets, defaultBranch);
  if (!mainFreeze.ok) errors.push(...mainFreeze.errors);
  if (isRecord(legacyBranch) && legacyBranch.protected !== true) {
    addError(
      errors,
      'MAIN_BRANCH_UNPROTECTED',
      'GitHub reports the legacy main branch as unprotected.',
    );
  }

  const unique = [];
  const seen = new Set();
  errors.forEach((error) => {
    if (!seen.has(error.code)) {
      seen.add(error.code);
      unique.push(error);
    }
  });
  return {
    ok: unique.length === 0,
    errors: unique,
    observedDefaultBranch: defaultBranch || 'unknown',
    integrationPolicy: classic.ok
      ? 'classic-branch-protection'
      : integrationRulesets.ok
        ? 'active-ruleset'
        : 'none',
    integrationRulesetIds: integrationRulesets.matching
      .map((ruleset) => ruleset.id)
      .filter(Number.isInteger),
    legacyFreezeRulesetIds: mainFreeze.matching
      .map((ruleset) => ruleset.id)
      .filter(Number.isInteger),
  };
}

async function requestGitHubJson(endpoint, token, fetchImpl = fetch) {
  const repositoryPrefix = '/repos/' + REPOSITORY;
  if (
    typeof endpoint !== 'string' ||
    (endpoint !== repositoryPrefix && !endpoint.startsWith(repositoryPrefix + '/')) ||
    endpoint.includes('..')
  ) {
    throw new Error('INVALID_API_ENDPOINT');
  }
  let response;
  try {
    response = await fetchImpl(API_BASE + endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    throw new Error('GITHUB_API_UNAVAILABLE');
  }
  if (!response || !response.ok) {
    const error = new Error('GITHUB_API_RESPONSE');
    error.status = response && response.status;
    throw error;
  }
  try {
    return await response.json();
  } catch {
    throw new Error('GITHUB_API_INVALID_JSON');
  }
}

async function readBranchProtection(token) {
  try {
    return await requestGitHubJson(
      '/repos/' + REPOSITORY + '/branches/' + INTEGRATION_BRANCH + '/protection',
      token,
    );
  } catch (error) {
    if (error && error.status === 404) return null;
    throw error;
  }
}

async function readActiveBranchRulesets(token) {
  const entries = [];
  let finished = false;
  for (let page = 1; page <= MAX_RULESET_PAGES; page += 1) {
    const result = await requestGitHubJson(
      '/repos/' + REPOSITORY + '/rulesets?per_page=' + PAGE_SIZE + '&page=' + page,
      token,
    );
    if (!Array.isArray(result)) throw new Error('GITHUB_RULESET_RESPONSE_INVALID');
    entries.push(...result);
    if (result.length < PAGE_SIZE) {
      finished = true;
      break;
    }
  }
  if (!finished) throw new Error('GITHUB_RULESET_LIMIT_REACHED');
  const activeBranchRulesets = entries.filter(
    (entry) =>
      isRecord(entry) &&
      entry.target === 'branch' &&
      entry.enforcement === 'active' &&
      Number.isInteger(entry.id) &&
      entry.id > 0,
  );
  const details = await Promise.all(
    activeBranchRulesets.map((entry) =>
      requestGitHubJson('/repos/' + REPOSITORY + '/rulesets/' + entry.id, token),
    ),
  );
  if (details.some((detail) => !isRecord(detail)))
    throw new Error('GITHUB_RULESET_RESPONSE_INVALID');
  return details;
}

async function main() {
  if (process.argv.slice(2).length) {
    console.error('Usage: npm run verify:client-main-governance');
    process.exitCode = 2;
    return;
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!token) {
    console.error(
      'GOVERNANCE VERIFICATION BLOCKED [TOKEN_REQUIRED]: set GITHUB_TOKEN or GH_TOKEN with repository Administration read-only access.',
    );
    process.exitCode = 2;
    return;
  }
  try {
    const repository = await requestGitHubJson('/repos/' + REPOSITORY, token);
    const integrationBranch = await requestGitHubJson(
      '/repos/' + REPOSITORY + '/branches/' + INTEGRATION_BRANCH,
      token,
    );
    const legacyBranch = await requestGitHubJson(
      '/repos/' + REPOSITORY + '/branches/' + LEGACY_BRANCH,
      token,
    );
    const integrationProtection = await readBranchProtection(token);
    const rulesets = await readActiveBranchRulesets(token);
    const result = evaluateRepositoryGovernance({
      repository,
      integrationBranch,
      legacyBranch,
      integrationProtection,
      rulesets,
    });
    console.log('Repository governance verification: ' + (result.ok ? 'PASS' : 'BLOCKED'));
    console.log('Default branch observed: ' + result.observedDefaultBranch);
    console.log('Integration policy source: ' + result.integrationPolicy);
    console.log(
      'Matching client-main rulesets: ' + (result.integrationRulesetIds.join(', ') || 'none'),
    );
    console.log(
      'Matching legacy-main freeze rulesets: ' +
        (result.legacyFreezeRulesetIds.join(', ') || 'none'),
    );
    if (!result.ok) {
      result.errors.forEach((error) => console.error('- [' + error.code + '] ' + error.message));
      console.error(
        'Read-only diagnosis only. Correct settings through an authorized repository owner/admin, then run this check again.',
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      'client-main requires reviewed, up-to-date checks; main has an active no-bypass update/deletion freeze.',
    );
    console.log('The checker issues GET requests only and does not change GitHub settings.');
  } catch (error) {
    const status = error && error.status;
    const code =
      status === 403
        ? 'GITHUB_API_FORBIDDEN'
        : status === 404
          ? 'GITHUB_RESOURCE_NOT_FOUND'
          : error &&
              typeof error.message === 'string' &&
              /^GITHUB_|^INVALID_API_|^GITHUB_RULESET_/.test(error.message)
            ? error.message
            : 'GITHUB_API_UNAVAILABLE';
    console.error('GOVERNANCE VERIFICATION BLOCKED [' + code + '].');
    console.error(
      'The GitHub governance API could not be verified safely; response bodies and credentials are not logged.',
    );
    if (status === 403) {
      console.error(
        'Use a token with repository Administration read-only permission; do not grant write permission.',
      );
    }
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  REQUIRED_CHECK_GROUPS,
  matchingActiveBranchRulesets,
  patternMatches,
  evaluateRepositoryGovernance,
  requestGitHubJson,
};
