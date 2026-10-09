'use strict';

const { spawnSync } = require('node:child_process');

const reportOnly = process.argv.includes('--report-only');
const result = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

let report;

try {
  report = JSON.parse(result.stdout || '');
} catch {
  console.error('npm audit did not return valid JSON.');
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(2);
}

if (report.error) {
  console.error(`npm audit failed: ${report.error.summary || report.error.message || 'unknown error'}`);
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(2);
}

const metadata = report.metadata?.vulnerabilities || {};
const vulnerabilities = Object.entries(report.vulnerabilities || {}).sort((a, b) => {
  const rank = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
  return (rank[a[1].severity] ?? 5) - (rank[b[1].severity] ?? 5) || a[0].localeCompare(b[0]);
});

console.log(
  `npm audit summary: total=${metadata.total ?? vulnerabilities.length}, critical=${metadata.critical ?? 0}, high=${metadata.high ?? 0}, moderate=${metadata.moderate ?? 0}, low=${metadata.low ?? 0}, info=${metadata.info ?? 0}`,
);

for (const [name, item] of vulnerabilities) {
  const fix = item.fixAvailable === undefined ? 'unknown' : JSON.stringify(item.fixAvailable);
  console.log(
    `- ${name}: severity=${item.severity}; direct=${item.isDirect}; range=${item.range}; installedPaths=${(item.nodes || []).join(', ') || 'not reported'}; fixAvailable=${fix}`,
  );

  for (const advisory of item.via || []) {
    if (typeof advisory === 'string') {
      console.log(`  dependency advisory: ${advisory}`);
      continue;
    }

    console.log(
      `  advisory: ${advisory.title || advisory.name || 'untitled'}; url=${advisory.url || 'not provided'}; range=${advisory.range || 'not provided'}; severity=${advisory.severity || item.severity}`,
    );
  }
}

const blocking = vulnerabilities.filter(([, item]) =>
  ['high', 'critical'].includes(String(item.severity).toLowerCase()),
);

if (!reportOnly && blocking.length) {
  console.error(`Dependency security gate failed: ${blocking.length} high/critical package advisories remain.`);
  process.exit(1);
}

if (result.status !== 0 && !vulnerabilities.length) {
  console.error('npm audit exited unsuccessfully without listing vulnerabilities.');
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(result.status || 2);
}

console.log(
  reportOnly
    ? 'Report-only mode: vulnerabilities were reported for triage; the command does not block this diagnostic run.'
    : 'Dependency security gate passed: no high or critical advisories remain.',
);
