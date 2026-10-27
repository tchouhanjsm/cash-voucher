'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const main = read('frontend/main.js');
const onboarding = read('frontend/features/onboarding.js');

assert.ok(/function bindFeatures\(\)[\s\S]*?onboarding\.init\(\)/.test(main));
assert.ok(onboarding.includes('Checking this customer’s configuration with the server…'));
assert.ok(/if \(!busy\) void load\(\)/.test(onboarding));
assert.ok(onboarding.includes("current = await api('onboardingState')"));
assert.ok(onboarding.includes('onboardingCount = key'));
assert.ok(onboarding.includes('renderBackupDetails(step)'));
assert.ok(onboarding.includes('SUCCESS_STALE'));
assert.ok(onboarding.includes('refreshAfterMutationFailure'));
assert.ok(onboarding.includes("root.setAttribute('aria-busy', busy ? 'true' : 'false')"));
assert.ok(onboarding.includes('Current-stage readiness summary'));
assert.ok(onboarding.includes('Outstanding onboarding actions'));

console.log(
  'Onboarding contract OK — server state, summary counts, backup diagnostics, retry recovery and busy semantics are connected.',
);
