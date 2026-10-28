'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  isInsideRepository,
  resolveOperationalEvidenceDirectory,
  validateReleaseGateBundle,
  verifyOperationalEvidenceDigests,
  verifySourceRunProvenance,
} = require('./validate-release-gate-bundle');

const REPOSITORY = 'tchouhanjsm/cash-voucher';
const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

async function main() {
  const args = process.argv.slice(2);
  const bundleArgument = args.find((arg) => !arg.startsWith('--'));
  const evidenceArgument = args.find((arg) => arg.startsWith('--evidence-dir='));
  if (
    !bundleArgument ||
    !evidenceArgument ||
    !args.includes('--verify-github') ||
    args.some((arg) => arg.startsWith('--') && arg !== '--verify-github' && !arg.startsWith('--evidence-dir='))
  ) {
    console.error('Usage: npm run validate:release-bundle:github -- /private/path/bundle.json --evidence-dir=/private/path/evidence --verify-github');
    process.exitCode = 2;
    return;
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!token) {
    console.error('RELEASE GATE BUNDLE FAILED: set GITHUB_TOKEN to a token with read-only Actions access.');
    process.exitCode = 2;
    return;
  }

  const inputPath = path.resolve(bundleArgument);
  if (isInsideRepository(inputPath)) {
    console.error('RELEASE GATE BUNDLE FAILED: input bundle must be stored outside the repository.');
    process.exitCode = 2;
    return;
  }

  let bundle;
  let evidenceDirectory;
  try {
    const linkStats = fs.lstatSync(inputPath);
    if (linkStats.isSymbolicLink() || !linkStats.isFile() || linkStats.size > MAX_BUNDLE_BYTES) throw new Error();
    bundle = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    evidenceDirectory = resolveOperationalEvidenceDirectory(evidenceArgument.slice('--evidence-dir='.length));
  } catch {
    console.error('RELEASE GATE BUNDLE FAILED: bundle or evidence directory is unsafe or unreadable.');
    process.exitCode = 2;
    return;
  }

  const structural = validateReleaseGateBundle(bundle);
  if (!structural.ok) {
    console.error('RELEASE GATE BUNDLE FAILED: fix structural contract errors before GitHub verification.');
    [...new Set(structural.errors.map((error) => error.code))].sort().forEach((code) => console.error('- [' + code + ']'));
    process.exitCode = 1;
    return;
  }

  const provenance = await verifySourceRunProvenance(bundle, async (runId) => {
    if (!/^\\d{1,20}$/.test(String(runId))) throw new Error();
    const response = await fetch('https://api.github.com/repos/' + REPOSITORY + '/actions/runs/' + runId, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error();
    return response.json();
  });
  const digestResult = verifyOperationalEvidenceDigests(bundle, evidenceDirectory);
  const errors = [...provenance.errors, ...digestResult.errors];
  if (errors.length) {
    console.error('RELEASE GATE BUNDLE FAILED: ' + errors.length + ' provenance/evidence issue(s).');
    [...new Set(errors.map((error) => error.code))].sort().forEach((code) => console.error('- [' + code + ']'));
    process.exitCode = 1;
    return;
  }

  console.log('GitHub source-run provenance verified for four distinct runs on ' + bundle.source.commitSha + '.');
  console.log('Operational evidence digests verified: ' + digestResult.verifiedCount + '.');
  console.log('Provenance only; human review and owner/QA approval remain required. No release approval is issued.');
}

main().catch(() => {
  console.error('RELEASE GATE BUNDLE FAILED: provenance verification could not be completed safely.');
  process.exitCode = 1;
});
