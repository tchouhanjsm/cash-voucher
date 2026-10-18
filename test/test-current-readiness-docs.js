'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const project = read('PROJECT.md');
const roadmap = read('docs/PRODUCT-ROADMAP.md');
const release = read('docs/RELEASE-READINESS.md');
const staging = read('docs/STAGING-RELEASE-AUDIT.md');
const appsScriptRunbook = read('docs/APPS-SCRIPT-RELEASE-RUNBOOK.md');
const onboarding = read('docs/CUSTOMER-ONBOARDING-RUNBOOK.md');
const ux = read('docs/FRONTEND-UX-AUDIT.md');
const uiSystem = read('docs/UI-SHELL-AND-DESIGN-SYSTEM.md');
const audit = read('docs/FINAL-REPOSITORY-AUDIT-2026-10-17.md');
const sinkInventory = read('docs/ACTIVE-DOM-SINK-INVENTORY.md');
const securityAudit = read('docs/SECURITY-RENDERING-AUDIT.md');

assert.match(project, /password authentication/i);
assert.match(project, /backend\/\*\.gs/);
assert.doesNotMatch(project, /Repository status:\*\* updated 9 October 2026/i);
assert.doesNotMatch(project, /backend\/Code\.gs \(Apps Script JSON API\)/);
assert.doesNotMatch(project, /after Phase 22 is reviewed and merged/i);
assert.match(project, /not live-staging-verified/i);
assert.doesNotMatch(
  project,
  /temporary PIN is removed|PIN\/session changes rotate|current-PIN attempts|Phase 22 regression batch/i,
);
assert.match(roadmap, /^Last verified main baseline: `df641e06088910281e0940450bb91b5b82e6d6dc`/m);
assert.match(roadmap, /PR #169/);
assert.match(release, /Verified main baseline.*df641e06088910281e0940450bb91b5b82e6d6dc/);
assert.match(release, /Password hash and session protection/);
assert.doesNotMatch(release, /PIN hash and session protection|Verify login, PIN change/);
assert.match(staging, /Verified main baseline.*df641e06088910281e0940450bb91b5b82e6d6dc/);
assert.match(staging, /CV_STAGING_UAT_OWNER_PASSWORD/);
assert.match(appsScriptRunbook, /CV_STAGING_UAT_MANAGER_PASSWORD/);
assert.doesNotMatch(appsScriptRunbook, /their emails and PINs must be distinct/i);
assert.doesNotMatch(onboarding, /non-shared PINs/i);
assert.match(onboarding, /non-shared passwords/i);
assert.match(onboarding, /Repository visibility is now \\*\\*private\\*\\*/i);
assert.match(onboarding, /CV_API_URL/);
assert.match(onboarding, /CV_ENVIRONMENT.*staging/i);
assert.match(ux, /forced-password-change dialog/i);
assert.doesNotMatch(ux, /forced-PIN dialog/i);
assert.match(uiSystem, /PR #169/);
assert.doesNotMatch(uiSystem, /current PR #165 candidate/i);
assert.match(audit, /Operational gates are not marked complete by mock CI/i);
assert.match(sinkInventory, /^\*\*Last merged source baseline:/m);
assert.match(
  sinkInventory,
  /Last merged source baseline:.*8e18b4f3ed8601f70e192b6d32587675ad4cdb7b/,
);
assert.match(
  securityAudit,
  /Latest merged review baseline.*8e18b4f3ed8601f70e192b6d32587675ad4cdb7b/,
);

console.log(
  'Current-readiness documentation: latest merge, password terminology, active architecture and live-release boundaries are aligned.',
);
