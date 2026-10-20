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

console.log(
  'Onboarding startup contract OK — server check runs on entry and action handlers are bound.',
);
