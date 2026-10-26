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
const handoff = read('docs/HANDOFF.md');
assert.match(handoff, /^\*\*Updated:\*\* 26 October 2026/m);
assert.match(handoff, /Verified integration baseline.*75561d19e5f72f885c813152de122e7444801d70/);
assert.match(handoff, /exact-merge CI, Browser E2E and Full Flight Test all passed/);
assert.match(handoff, /Current source batch.*fail-closed Dashboard summary/);
assert.match(handoff, /PR #224 is open and unmerged/);
assert.match(handoff, /client-main.*protected=false/);
assert.match(handoff, /## Historical handoff snapshot — 25 October 2026/);
const p0ReleaseBatch = read('docs/P0-RELEASE-BATCH-B1-B3.md');
const autonomousMonitor = read('docs/AUTONOMOUS-DEVELOPMENT-WORKFLOW.md');

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
  /Authoritative integration baseline.*client-main.*e97c4e080b3f6903e16ef77f571822f9844faeed/,
);
assert.match(staging, /PR #208/);
assert.match(staging, /PR #214 is the sole open PR targeting/);
assert.doesNotMatch(staging, /1304a6555ccdd777f447a63eb648df84a257f6ec/);
assert.doesNotMatch(staging, /PR #210 remains open and diverged\/dirty/);
assert.match(handoff, /Verified integration baseline.*e97c4e080b3f6903e16ef77f571822f9844faeed/);
assert.match(handoff, /PR #208/);
assert.match(
  handoff,
  /PR #211 merged this source fix at `3ad2c8f955b36de00b208ee4283682a1a34805eb`/,
);
assert.match(handoff, /client\/p0-audit-monitoring-integrity-20261025/);
assert.match(handoff, /Checkpoint finalization defect/);
assert.match(handoff, /PR #214 is the sole active follow-up for monitor checkpoint finalization/);
assert.match(handoff, /GITHUB_EVENT_PATH/);
assert.match(handoff, /PRs #209–#213 are merged/);
assert.match(handoff, /PR #213 merged at this commit/);
assert.doesNotMatch(handoff, /1304a6555ccdd777f447a63eb648df84a257f6ec/);
assert.doesNotMatch(
  handoff,
  /it is still unmerged; the issue remains present in the current `client-main` baseline/,
);
assert.match(handoff, /allow_auto_merge=true/);
assert.match(handoff, /df9d2a01adae93e305c530eae1635079137adcd6/);
assert.match(handoff, /CI \/ Quality #40217235001/);
assert.match(staging, /P0 B5/);
assert.match(staging, /P0 B6/);
assert.match(staging, /Settings-sheet fallback/);
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
assert.match(executionPlan, /e97c4e080b3f6903e16ef77f571822f9844faeed/);
assert.match(executionPlan, /PR #211/);
assert.match(executionPlan, /PRs #209–#213 are merged/);
assert.match(executionPlan, /PR #214 is the only open PR targeting/);
assert.doesNotMatch(executionPlan, /1304a6555ccdd777f447a63eb648df84a257f6ec/);
assert.doesNotMatch(executionPlan, /PR #210 still requires base reconciliation/);
assert.match(executionPlan, /P0-RELEASE-BATCH-B1-B3\.md/);
assert.match(p0ReleaseBatch, /B1 — staging identity and release proof/);
assert.match(p0ReleaseBatch, /B2 — staging schema, backup and restore/);
assert.match(p0ReleaseBatch, /B3 — security, authorization and real-device acceptance/);
assert.match(
  p0ReleaseBatch,
  /No production migration, deployment, DNS change or customer handover is authorized/,
);

console.log(
  'Current-readiness documentation: integration baseline, serial PR queue, password terminology, active architecture and live-release boundaries are aligned.',
);

assert.match(autonomousMonitor, /e97c4e080b3f6903e16ef77f571822f9844faeed/);
assert.match(autonomousMonitor, /45-minute.*not supported/i);
assert.match(autonomousMonitor, /never merges/i);
assert.match(autonomousMonitor, /bounded retry/i);
assert.match(autonomousMonitor, /Persistent Checkpoint/i);
assert.match(autonomousMonitor, /allow_auto_merge=true/);
assert.match(autonomousMonitor, /PR #214/);
assert.match(
  autonomousMonitor,
  /Do not open another PR while any prior PR remains open\/unmerged/i,
);
