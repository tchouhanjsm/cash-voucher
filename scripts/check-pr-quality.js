'use strict';

const fs = require('node:fs');

const eventPath = process.env.GITHUB_EVENT_PATH;

if (!eventPath) {
  if (process.env.CI === 'true') {
    console.error('PR quality gate cannot inspect the GitHub event payload in CI.');
    process.exit(1);
  }

  console.log('PR quality gate skipped locally: no GitHub event payload is available.');
  process.exit(0);
}

let event;

try {
  event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
} catch (error) {
  console.error(`PR quality gate could not parse the GitHub event payload: ${error.message}`);
  process.exit(1);
}

const pullRequest = event.pull_request;

if (!pullRequest) {
  console.log('PR quality gate skipped: this event is not a pull_request event.');
  process.exit(0);
}

const failures = [];
const commitCount = Number(pullRequest.commits);

if (!Number.isInteger(commitCount) || commitCount < 1) {
  failures.push('Could not verify a valid pull-request commit count from the event payload.');
} else if (commitCount > 10) {
  failures.push(
    `This batch contains ${commitCount} commits; the limit is 10. Split only at a coherent boundary—do not rewrite or force-push history to bypass this gate.`,
  );
}

const requiredHeadings = [
  'Outcome',
  'Acceptance criteria',
  'Verification evidence',
  'Security and failure review',
  'Release boundary',
  'Residual risks / not verified',
];

const body = typeof pullRequest.body === 'string' ? pullRequest.body : '';
const sections = new Map();
let currentHeading = null;

for (const line of body.split(/\r?\n/)) {
  const match = line.match(/^##\s+(.+?)\s*$/);

  if (match) {
    currentHeading = match[1].trim().toLowerCase();
    sections.set(currentHeading, []);
  } else if (currentHeading) {
    sections.get(currentHeading).push(line);
  }
}

for (const heading of requiredHeadings) {
  const section = sections.get(heading.toLowerCase());
  const value = section ? section.join('\n').trim() : '';

  if (!value) {
    failures.push(`PR description is missing the required "## ${heading}" section or its content.`);
    continue;
  }

  if (value.length < 20) {
    failures.push(`PR section "## ${heading}" is too short to provide useful review evidence.`);
  }

  if (/\b(?:TODO|TBD|FILL[ -]?IN|REPLACE ME|INSERT HERE)\b|\[ \]/i.test(value)) {
    failures.push(`PR section "## ${heading}" still contains an unresolved placeholder.`);
  }
}

if (failures.length) {
  console.error('PR quality gate FAILED:');

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  console.error('Use .github/pull_request_template.md and keep each PR/batch at 10 commits or fewer.');
  process.exit(1);
}

console.log(`PR quality gate passed: ${commitCount} commits; all ${requiredHeadings.length} required handoff sections are populated.`);
