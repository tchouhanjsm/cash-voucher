'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

const PATTERNS = [
  {
    name: 'Google API key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    name: 'AWS access key ID',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    name: 'GitHub access token',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g,
  },
  {
    name: 'Google OAuth client secret',
    regex: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    name: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    name: 'Private key block',
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\r\n]+[A-Za-z0-9+/=\r\n]{40,}-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    historyRegex:
      /(?:^|\n)[+-]-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----\r?\n(?:[+-][A-Za-z0-9+/=]{1,80}\r?\n)+[+-]-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: 'Stripe live secret key',
    regex: /\bsk_live_[0-9A-Za-z]{20,}\b/g,
  },
];

function gitOutput(args, encoding = 'utf8') {
  const result = spawnSync('git', args, {
    encoding,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('Git secret scan command failed: git ' + args[0] + ' (' + result.status + ')');
  }
  return result.stdout;
}

function findSecretKinds(content, fromHistory = false) {
  const found = [];
  for (const pattern of PATTERNS) {
    const expression = fromHistory ? pattern.historyRegex || pattern.regex : pattern.regex;
    expression.lastIndex = 0;
    if (expression.test(content)) found.push(pattern.name);
    expression.lastIndex = 0;
  }
  return found;
}

function scanRepository() {
  const shallow = gitOutput(['rev-parse', '--is-shallow-repository']).trim();
  if (shallow !== 'false') {
    throw new Error(
      'Secret-history scan requires a full Git clone. CI must use checkout fetch-depth: 0.',
    );
  }

  const findings = [];
  const paths = gitOutput(['ls-files', '-z'], 'buffer')
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  for (const file of paths) {
    const bytes = fs.readFileSync(file);
    if (bytes.includes(0)) continue;
    for (const patternName of findSecretKinds(bytes.toString('utf8'))) {
      findings.push({ pattern: patternName, where: 'working tree: ' + file });
    }
  }

  // Scan the full diff history in memory; output only pattern type and commit, never credential text.
  const history = gitOutput(['log', '--all', '--format=COMMIT:%H', '-p', '--']);
  const chunks = history.split(/(?=^COMMIT:[0-9a-f]{40}\r?$)/m).filter(Boolean);
  const historyFindings = new Set();
  for (const chunk of chunks) {
    const match = chunk.match(/^COMMIT:([0-9a-f]{40})/);
    if (!match) continue;
    const commit = match[1].slice(0, 12);
    for (const patternName of findSecretKinds(chunk, true)) {
      const key = patternName + ':' + commit;
      if (historyFindings.has(key)) continue;
      historyFindings.add(key);
      findings.push({
        pattern: patternName,
        where: 'Git history commit ' + commit,
      });
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
