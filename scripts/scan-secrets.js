'use strict';

const { spawnSync } = require('node:child_process');

const PATTERNS = [
  {
    name: 'Google API key',
    source: '(^|[^A-Za-z0-9])AIza[0-9A-Za-z_-]{35}([^A-Za-z0-9_-]|$)',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    name: 'AWS access key ID',
    source: '(^|[^A-Za-z0-9])(AKIA|ASIA)[0-9A-Z]{16}([^A-Za-z0-9]|$)',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    name: 'GitHub access token',
    source: '(^|[^A-Za-z0-9])gh[pousr]_[A-Za-z0-9_]{30,}([^A-Za-z0-9_]|$)',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g,
  },
  {
    name: 'Google OAuth client secret',
    source: '(^|[^A-Za-z0-9])GOCSPX-[A-Za-z0-9_-]{20,}([^A-Za-z0-9_-]|$)',
    regex: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: 'Slack token',
    source: '(^|[^A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}([^A-Za-z0-9-]|$)',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    name: 'Private key header',
    source: '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: 'Stripe live secret key',
    source: '(^|[^A-Za-z0-9])sk_live_[0-9A-Za-z]{20,}([^A-Za-z0-9]|$)',
    regex: /\bsk_live_[0-9A-Za-z]{20,}\b/g,
  },
];

const EXCLUDED_PATHS = [' :(exclude)scripts/scan-secrets.js'.trim()];

function findSecretKinds(content) {
  const found = [];
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) found.push(pattern.name);
    pattern.regex.lastIndex = 0;
  }
  return found;
}

function runGit(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error('Git secret scan command failed: git ' + args[0] + ' (' + result.status + ')');
  }
  return (result.stdout || '').trim();
}

function scanRepository() {
  const shallow = runGit(['rev-parse', '--is-shallow-repository']);
  if (shallow !== 'false') {
    throw new Error(
      'Secret-history scan requires a full Git clone. CI must use checkout fetch-depth: 0.',
    );
  }

  const findings = [];
  for (const pattern of PATTERNS) {
    const currentFiles = runGit([
      'grep',
      '--files-with-matches',
      '-I',
      '-E',
      '-e',
      pattern.source,
      '--',
      '.',
      ...EXCLUDED_PATHS,
    ]);
    if (currentFiles) {
      for (const file of currentFiles.split(/\r?\n/)) {
        if (file) findings.push({ pattern: pattern.name, where: 'working tree: ' + file });
      }
    }

    // Pickaxe scans additions and removals in all reachable commits without printing source lines.
    const commits = runGit([
      'log',
      '--all',
      '--format=%H',
      '-G',
      pattern.source,
      '--',
      '.',
      ...EXCLUDED_PATHS,
    ]);
    if (commits) {
      for (const commit of [...new Set(commits.split(/\r?\n/).filter(Boolean))]) {
        findings.push({ pattern: pattern.name, where: 'Git history commit ' + commit.slice(0, 12) });
      }
    }
  }
  return findings;
}

function main() {
  let findings;
  try {
    findings = scanRepository();
  } catch (error) {
    console.error('Secret scan could not establish complete evidence:', error.message);
    process.exitCode = 2;
    return;
  }

  if (findings.length) {
    console.error('Potential credential exposure detected; no matching value is printed:');
    for (const finding of findings) {
      console.error('- ' + finding.pattern + ' — ' + finding.where);
    }
    console.error(
      'Triage each finding, revoke/rotate any real credential, and follow owner-approved history handling. This scanner does not rewrite Git history.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Secret scan passed for the current tracked tree and reachable Git history across ' +
      PATTERNS.length +
      ' high-confidence credential patterns.',
  );
}

if (require.main === module) main();

module.exports = { findSecretKinds, scanRepository };
