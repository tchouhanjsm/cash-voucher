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
const executionPlan = read('docs/EXECUTION-PLAN-2026-10-21.md');
const p0ReleaseBatch = read('docs/P0-RELEASE-BATCH-B1-B3.md');

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
assert.match(
  roadmap,
  /^Last observed main baseline for this follow-up: `8b14adc72c146589149a33d793ca9e55af5da13a`/m,
);
assert.match(roadmap, /PR #169/);
assert.match(release, /Verified main baseline.*8b14adc72c146589149a33d793ca9e55af5da13a/);
assert.match(release, /Password hash and session protection/);
assert.doesNotMatch(release, /PIN hash and session protection|Verify login, PIN change/);
assert.match(
  staging,
  /Authoritative integration baseline.*client-main.*d5ed3e77387d0f1896c97dbaac793ed23b17eb32/,
);
assert.match(staging, /PR #197/);
assert.match(staging, /CV_STAGING_UAT_OWNER_PASSWORD/);
assert.match(appsScriptRunbook, /CV_STAGING_UAT_MANAGER_PASSWORD/);
assert.match(appsScriptRunbook, /Setup preflight and safe recovery/);
assert.match(staging, /STAGING-ONLY/);
assert.match(onboarding, /If setup fails after writes begin/);
assert.doesNotMatch(appsScriptRunbook, /their emails and PINs must be distinct/i);
assert.doesNotMatch(onboarding, /non-shared PINs/i);
assert.match(onboarding, /non-shared passwords/i);
assert.match(onboarding, /Repository visibility is now.*private/i);
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
assert.match(executionPlan, /aa37d94819e59a72c797ba36839aa8f8ec94008f/);
assert.match(executionPlan, /P0-RELEASE-BATCH-B1-B3\.md/);
assert.match(p0ReleaseBatch, /B1 — staging identity and release proof/);
assert.match(p0ReleaseBatch, /B2 — staging schema, backup and restore/);
assert.match(p0ReleaseBatch, /B3 — security, authorization and real-device acceptance/);
assert.match(
  p0ReleaseBatch,
  /No production migration, deployment, DNS change or customer handover is authorized/,
);

console.log(
  'Current-readiness documentation: latest merge, password terminology, active architecture and live-release boundaries are aligned.',
);
