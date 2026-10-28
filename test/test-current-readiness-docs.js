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
const recoveryEvidence = read('docs/RECOVERY-DRILL-EVIDENCE.md');
const recoveryValidator = read('scripts/validate-recovery-evidence.js');
const recoveryEvidenceTest = read('test/test-recovery-evidence.js');
const releaseGateBundleDocs = read('docs/RELEASE-GATE-BUNDLE.md');
const releaseGateBundleValidator = read('scripts/validate-release-gate-bundle.js');
const releaseGateBundleTest = read('test/test-release-gate-bundle.js');
const ciWorkflow = read('.github/workflows/ci.yml');
const stagingWorkflow = read('.github/workflows/staging-uat.yml');
const stagingWorkflowTest = read('test/test-staging-workflow.js');
const stagingEvidenceWriter = read('scripts/staging-evidence.js');
const stagingEvidenceTests = read('test/test-staging-evidence.js');
const stagingDeployScript = read('scripts/deploy-staging.js');
const stagingPipelineTests = read('test/test-staging-pipeline.js');
const stagingUatRunner = read('scripts/run-staging-uat.sh');
const stagingWebServer = read('scripts/staging-web-server.js');
const formatDiffScript = read('scripts/show-format-diff.js');
const flightWorkflowContract = read('test/test-flight-workflow.js');
const recoveryEvidenceFixture = read('test/fixtures/recovery-evidence.js');
const packageJson = JSON.parse(read('package.json'));
const dashboard = read('frontend/features/dashboard.js');
const auditHelpers = read('backend/25-helpers.gs');
const backupHelpers = read('backend/20-backup.gs');
const onboardingFrontend = read('frontend/features/onboarding.js');
const administrationFrontend = read('frontend/features/administration.js');
const backendTests = read('test/test-backend.js');
const browserE2e = read('test/e2e.py');
const deliveryPhase = read('docs/DELIVERY-PHASE-2026-10-26-BULK.md');
assert.match(handoff, /^\*\*Updated:\*\* 28 October 2026/m);
const currentIntegrationSha = '68263f48138d782e66428f6c5c19b3dd5b203bc5';
assert.ok(handoff.includes(currentIntegrationSha));
assert.match(
  handoff,
  /^\*\*Current integration baseline:\*\* `68263f48138d782e66428f6c5c19b3dd5b203bc5`/m,
);
assert.ok(handoff.includes('Staging secret-scope sprint batch — 28 October 2026'));
assert.ok(staging.includes('Staging secret-scope sprint batch — 28 October 2026'));
assert.ok(executionPlan.includes('Staging secret-scope sprint batch — 28 October 2026'));
assert.ok(appsScriptRunbook.includes('Staging workflow secret isolation — 28 October 2026'));
assert.ok(stagingWorkflow.includes('name: Update the existing staging deployment only'));
assert.ok(stagingWorkflowTest.includes('job header must not expose secrets to every step'));
assert.ok(stagingWorkflowTest.includes('UAT-only must never receive the Clasp OAuth credential'));
assert.ok(staging.includes('Staging evidence output and cleanup hardening — 28 October 2026'));
assert.ok(
  executionPlan.includes(
    'Evidence artifact and temporary credential cleanup sprint — 28 October 2026',
  ),
);
assert.ok(
  appsScriptRunbook.includes(
    'Staging evidence files and temporary credential cleanup — 28 October 2026',
  ),
);
assert.ok(stagingEvidenceWriter.includes('fs.constants.O_EXCL'));
assert.ok(stagingEvidenceWriter.includes('fs.constants.O_NOFOLLOW'));
assert.ok(stagingUatRunner.includes('umask 077'));
assert.ok(stagingUatRunner.includes('detailed transcript is withheld from workflow logs'));
assert.ok(stagingUatRunner.includes('env -i'));
assert.ok(stagingWebServer.includes("{ mode: 'artifact', root }"));
assert.doesNotMatch(stagingWebServer, /mode: 'uat'/);
assert.ok(stagingWorkflow.includes('steps.staging_uat.outputs.uat_log_file'));
assert.ok(stagingWorkflow.includes('steps.staging_uat.outputs.uat_log_dir'));
assert.ok(stagingWorkflow.includes('dir_mode="$(stat -c'));
assert.ok(stagingWorkflow.includes('server_mode="$(stat -c'));
assert.ok(stagingWorkflow.includes('UAT log directory or files failed privacy checks'));
assert.ok(stagingUatRunner.includes('cash-voucher-staging-uat.XXXXXX'));
assert.ok(stagingUatRunner.includes('chmod 700 "${UAT_LOG_DIR}"'));
assert.ok(
  stagingEvidenceWriter.includes('staging UAT transcript directory permissions are too broad'),
);

assert.ok(stagingEvidenceWriter.includes('must be outside the repository'));
assert.ok(stagingEvidenceWriter.includes('function readTranscript(env)'));
assert.ok(stagingEvidenceWriter.includes('dedicated per-run directory'));
assert.ok(stagingEvidenceWriter.includes('maxTranscriptBytes = 2 * 1024 * 1024'));
assert.ok(stagingEvidenceWriter.includes('O_NOFOLLOW'));
assert.ok(stagingEvidenceTests.includes('oversizedTranscript'));
assert.ok(stagingEvidenceTests.includes('transcriptLink'));
assert.ok(staging.includes('UAT transcript isolation'));
assert.ok(executionPlan.includes('UAT transcripts private in unique per-run directories'));
assert.ok(
  appsScriptRunbook.includes('transcript reader enforces its dedicated-directory contract'),
);
assert.ok(stagingWorkflowTest.includes('private generated transcript'));

assert.ok(
  stagingEvidenceTests.includes('a rerun must not overwrite an existing evidence artifact'),
);
assert.ok(stagingEvidenceTests.includes('summaryLink'));
assert.ok(stagingDeployScript.includes('cleanupTemporaryDirectories([workspace, tempHome])'));
assert.ok(
  stagingDeployScript.includes('temporary workspace/credential cleanup could not be verified'),
);
assert.ok(
  stagingPipelineTests.includes(
    'cleanup must attempt credential-home removal even if workspace removal fails',
  ),
);

assert.ok(handoff.includes('Current release-session checkpoint — 28 October 2026'));
assert.ok(
  handoff.includes(
    'merged PR #242 added release-bundle freshness, exact deployed-SHA binding, private evidence digest verification and safe report handling',
  ),
);
assert.ok(staging.includes('Current release-gate bundle phase — 28 October 2026'));
assert.ok(executionPlan.includes('Current release-gate bundle phase — 28 October 2026'));
assert.ok(recoveryEvidence.includes('Consolidated release gate bundle — 28 October 2026'));
assert.ok(packageJson.scripts['validate:release-bundle']);
assert.ok(packageJson.scripts.test.includes('test/test-release-gate-bundle.js'));
assert.ok(releaseGateBundleValidator.includes('SOURCE_CHECK_SHA_MISMATCH'));
assert.ok(releaseGateBundleValidator.includes('SOURCE_CHECK_REPOSITORY'));
assert.ok(releaseGateBundleValidator.includes('SOURCE_CHECK_WORKFLOW'));
assert.ok(releaseGateBundleValidator.includes('SOURCE_CHECK_EVENT'));
assert.ok(releaseGateBundleValidator.includes('SOURCE_CHECK_REF'));
assert.ok(releaseGateBundleValidator.includes('SOURCE_CHECK_RUN_URL'));
assert.ok(releaseGateBundleValidator.includes('OPERATIONAL_EVIDENCE_DIGEST'));
assert.ok(releaseGateBundleTest.includes('malformedOperationalDigest'));
assert.ok(releaseGateBundleDocs.includes('evidenceSha256'));
assert.ok(releaseGateBundleDocs.includes('--evidence-dir=/private/path/evidence-records'));
assert.ok(releaseGateBundleDocs.includes('recomputes SHA-256 from the file bytes'));
assert.ok(releaseGateBundleValidator.includes('verifyOperationalEvidenceDigests'));
assert.ok(releaseGateBundleValidator.includes('OPERATIONAL_EVIDENCE_HASH_MISMATCH'));
assert.ok(releaseGateBundleValidator.includes('readBoundedEvidenceBytes'));
assert.ok(releaseGateBundleValidator.includes('EVIDENCE_DIR_PERMISSIONS'));
assert.ok(releaseGateBundleValidator.includes('OPERATIONAL_EVIDENCE_FILE_PERMISSIONS'));
assert.ok(releaseGateBundleTest.includes('OPERATIONAL_EVIDENCE_FILE_TOO_LARGE'));
assert.ok(releaseGateBundleTest.includes('missingEvidenceDirectoryRun'));
assert.ok(releaseGateBundleDocs.includes('mode `0700` or stricter'));
assert.ok(releaseGateBundleDocs.includes('each evidence record `0600` or stricter'));

assert.ok(releaseGateBundleTest.includes('OPERATIONAL_EVIDENCE_HASH_MISMATCH'));
assert.ok(releaseGateBundleTest.includes('OPERATIONAL_EVIDENCE_FILE_UNSAFE'));
assert.ok(releaseGateBundleTest.includes('missingEvidenceDirectoryRun'));
assert.ok(handoff.includes('Operational evidence fingerprints'));

assert.ok(releaseGateBundleTest.includes('wrongSourceRunUrl'));
assert.ok(releaseGateBundleDocs.includes('integration-branch checks'));
assert.ok(releaseGateBundleDocs.includes('refs/heads/client-main'));
assert.doesNotMatch(ciWorkflow, /Temporary formatting diagnostic for PR 242|npx prettier --write/);
assert.ok(ciWorkflow.includes('Print non-mutating Prettier diff for changed files'));
assert.ok(ciWorkflow.includes("if: failure() && steps.quality.outcome == 'failure'"));
assert.ok(formatDiffScript.includes("'--stdin-filepath'"));
assert.ok(formatDiffScript.includes("'diff'"));
assert.ok(formatDiffScript.includes('fs.mkdtempSync'));
assert.ok(formatDiffScript.includes('fs.rmSync(tempRoot'));
assert.doesNotMatch(formatDiffScript, /--write/);
assert.ok(flightWorkflowContract.includes('PR-specific formatting workaround'));

assert.ok(releaseGateBundleValidator.includes('PREFLIGHT_BOUNDARY'));
assert.ok(releaseGateBundleValidator.includes("releaseApproval: 'human-review-required'"));
assert.ok(releaseGateBundleTest.includes('SOURCE_CHECK_SHA_MISMATCH'));
assert.ok(releaseGateBundleTest.includes('unsafeOperationalReference'));
assert.ok(recoveryEvidenceFixture.includes('function buildRecoveryEvidence'));
assert.ok(releaseGateBundleDocs.includes('--verify-github'));
assert.ok(releaseGateBundleValidator.includes('verifySourceRunProvenance'));
assert.ok(read('scripts/validate-release-gate-bundle-github.js').includes('Actions API lookup failed'));
assert.ok(releaseGateBundleDocs.includes('--report=/private/path/release-gate-validation.json'));
assert.ok(releaseGateBundleDocs.includes('must be outside the repository'));
assert.ok(releaseGateBundleDocs.includes('existing report files are never overwritten'));
assert.ok(releaseGateBundleValidator.includes('isInsideRepository'));
assert.ok(
  releaseGateBundleValidator.includes('input bundle must be stored outside the repository'),
);
assert.ok(releaseGateBundleTest.includes('repository-alias'));
assert.ok(releaseGateBundleTest.includes('SENSITIVE-INTERNAL-NOTE'));
assert.ok(releaseGateBundleValidator.includes('report output must not overwrite the input bundle'));
assert.ok(releaseGateBundleValidator.includes('MAX_STAGING_PREFLIGHT_AGE_MS'));
assert.ok(releaseGateBundleValidator.includes('MAX_RELEASE_BUNDLE_AGE_MS'));
assert.ok(releaseGateBundleTest.includes('BUNDLE_STALE'));
assert.ok(releaseGateBundleTest.includes('BUNDLE_TIMESTAMP_IN_FUTURE'));
assert.ok(releaseGateBundleValidator.includes('MAX_RECOVERY_EVIDENCE_AGE_MS'));
assert.ok(releaseGateBundleValidator.includes('OPERATIONAL_TEST_SHA_MISMATCH'));
assert.ok(releaseGateBundleTest.includes('OPERATIONAL_EVIDENCE_STALE'));
assert.ok(releaseGateBundleTest.includes('PREFLIGHT_STALE'));
assert.ok(releaseGateBundleTest.includes('RECOVERY_STALE'));
assert.ok(releaseGateBundleDocs.includes('Freshness windows'));

assert.ok(staging.includes(currentIntegrationSha));
assert.ok(executionPlan.includes(currentIntegrationSha));
assert.ok(staging.includes('Deep-dive findings — current source disposition'));
assert.ok(staging.includes('previous pending-code finding is resolved in the merged baseline'));
assert.ok(staging.includes('GHSA-vfj7-8cjw-p6xm was withdrawn'));
assert.ok(recoveryValidator.includes('SAFE_DEPLOYED_VERSION'));
assert.ok(recoveryEvidenceTest.includes('private-id/exec'));
assert.doesNotMatch(
  handoff,
  /\*\*Current integration baseline:\*\*.*1dba1b008eb2303ffddf069285fbb22efc76a8cb/,
);
assert.match(handoff, /Current release-session checkpoint.*28 October 2026/);
assert.match(handoff, /Historical checkpoint — 27 October 2026 09:59 IST/);
assert.match(handoff, /client\/p0-recovery-drill-evidence-20261027/);
assert.match(handoff, /40443448972/);
assert.match(handoff, /client\/p0-write-staging-inventory-20261027/);
assert.match(handoff, /Historical checkpoint — PR #229 integration audit/);
assert.match(dashboard, /function dashboardSummaryIssue/);
assert.match(browserE2e, /def inject_invalid_dashboard_summary/);
assert.match(browserE2e, /Dashboard totals unavailable/);
assert.match(browserE2e, /owner dashboard KPI grid matches the role and breakpoint contract/);
assert.match(
  browserE2e,
  /staff dashboard KPI grid matches the five-card role and breakpoint contract/,
);
assert.match(browserE2e, /dashboard KPI values fit inside their cards without horizontal clipping/);
assert.match(handoff, /audit marker canonical metadata validation/i);
assert.match(auditHelpers, /function isCanonicalAuditTimestamp_/);
assert.match(auditHelpers, /AUDIT_TIMESTAMP_PATTERN_/);
assert.ok(auditHelpers.includes("Date.parse(value + 'Z')"));
assert.ok(auditHelpers.includes('toISOString().slice(0, 19) === value'));
assert.match(auditHelpers, /typeof marker[.]failureCount !== 'number'/);
assert.match(backendTests, /count: '2e0'/);
assert.match(backendTests, /failureCount: '1'/);
assert.match(backupHelpers, /function backupMarkerHealth_\(/);
assert.match(backupHelpers, /INVALID_ATTEMPT_TIMESTAMP/);
assert.match(backupHelpers, /ATTEMPT_AFTER_SUCCESS/);
assert.match(onboardingFrontend, /onboardingCount = key/);
assert.match(onboardingFrontend, /renderBackupDetails\(step\)/);
assert.match(administrationFrontend, /Fresh for onboarding/);
assert.match(administrationFrontend, /backup-marker-issues/);
assert.match(handoff, /cv2-v35/);
assert.match(deliveryPhase, /PR #225.*merged/i);
assert.doesNotMatch(deliveryPhase, /it remains open until reviewed and merged by the owner/);
assert.match(handoff, /Historical PR #227 integration-head evidence.*#40373320173/);
assert.match(handoff, /Historical checkpoint — date correctness and release gates/);
assert.match(handoff, /PR #228 merged/);
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
assert.doesNotMatch(
  staging,
  /\*\*Current integration baseline:\*\*.*1dba1b008eb2303ffddf069285fbb22efc76a8cb/,
);
assert.ok(staging.includes('client/release-integrity-dependency-hardening-20261027'));
assert.match(staging, /PR #208/);
assert.match(staging, /Historical follow-up.*PR #229.*fix-business-date-arithmetic-20261027/);
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
assert.match(handoff, /PR #214 is the sole active follow-up/);
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
assert.match(onboarding, /Repository visibility.*public/i);
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
assert.doesNotMatch(
  executionPlan,
  /\*\*Current integration SHA:\*\*.*1dba1b008eb2303ffddf069285fbb22efc76a8cb/,
);
assert.ok(executionPlan.includes('client/release-integrity-dependency-hardening-20261027'));
assert.match(executionPlan, /e97c4e080b3f6903e16ef77f571822f9844faeed/);
assert.match(executionPlan, /PR #211/);
assert.match(executionPlan, /PRs #209–#213 are merged/);
assert.match(executionPlan, /\*\*Historical follow-up:\*\* PR #229/);
assert.doesNotMatch(executionPlan, /1304a6555ccdd777f447a63eb648df84a257f6ec/);
assert.doesNotMatch(executionPlan, /PR #210 still requires base reconciliation/);
assert.match(executionPlan, /P0-RELEASE-BATCH-B1-B3\.md/);
assert.match(p0ReleaseBatch, /B1 — staging identity and release proof/);
assert.match(p0ReleaseBatch, /B2 — staging schema, backup and restore/);
assert.match(p0ReleaseBatch, /B3 — security, authorization and real-device acceptance/);
assert.match(recoveryEvidence, /cash-voucher-recovery-drill/);

assert.ok(staging.includes('staging evidence output and cleanup hardening phase'));
assert.match(staging, /remote connectivity.*restore were not verified/i);
assert.ok(executionPlan.includes('staging evidence output and cleanup hardening phase'));
assert.ok(handoff.includes('staging evidence output and cleanup hardening phase'));
assert.match(recoveryEvidence, /configuration-only check.*validate-only.*workflow/i);
assert.match(staging, /Workflow isolation.*only from `client-main`/i);
assert.match(executionPlan, /Secrets are scoped to the one validation step/i);
assert.match(handoff, /No dependency install runs in that secret-bearing step/i);
assert.match(recoveryEvidence, /restricted to `client-main`.*protected `staging` Environment/i);
assert.match(recoveryEvidence, /does not authenticate the operator/i);
assert.match(recoveryValidator, /RESOURCE_COLLISION/);
assert.match(recoveryValidator, /PRODUCTION_CHANGED/);
assert.match(recoveryEvidenceTest, /SHEET_COUNT_MISMATCH/);
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
