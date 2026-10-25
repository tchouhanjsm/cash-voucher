'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
g.props.OWNER_EMAIL = 'support-owner@test.com';
g.props.OWNER_PASSWORD = 'Owner#Start2026';
g.setup();

function signIn(email, temporary, final) {
  const login = g.call('login', { email, password: temporary });
  assert.ok(login.ok, email + ' can sign in');
  const changed = g.call('changePassword', {
    token: login.data.token,
    oldPassword: temporary,
    newPassword: final,
  });
  assert.ok(changed.ok, email + ' can change the temporary password');
  return changed.data.token;
}

const owner = signIn('support-owner@test.com', 'Owner#Start2026', 'Owner#Final2026');
const created = g.call('saveUser', {
  token: owner,
  name: 'Support Staff',
  email: 'support-staff@test.com',
  role: 'staff',
  password: 'Staff#Start2026',
});
assert.ok(created.ok, 'owner can create a staff user');
const staff = signIn('support-staff@test.com', 'Staff#Start2026', 'Staff#Final2026');

const report = {
  category: 'bug',
  subject: 'Register does not load',
  message: 'I opened the Register on my phone and it stays blank after login.',
  context: 'view=reg; online=true; test-agent',
  environment: 'production',
};

// 1. Fails clearly (and sends nothing) until the support address is configured.
let result = g.call('reportIssue', { token: staff, ...report });
assert.equal(result.ok, false);
assert.equal(result.code, 'SUPPORT_NOT_CONFIGURED');
assert.equal(g.mailLog.length, 0, 'nothing is emailed when SUPPORT_EMAIL is not configured');

// 2. A malformed address is treated as not configured.
g.props.SUPPORT_EMAIL = 'not-an-email';
result = g.call('reportIssue', { token: staff, ...report });
assert.equal(result.code, 'SUPPORT_NOT_CONFIGURED');

// 3. Any signed-in role can report; the mail goes to support with the reporter as reply-to.
g.props.SUPPORT_EMAIL = 'support@vendor.test';
result = g.call('reportIssue', { token: staff, ...report });
assert.ok(result.ok, 'staff can report a problem');
assert.match(result.data.ref, /^[0-9A-F]{8}$/);
assert.equal(g.mailLog.length, 1);
const mail = g.mailLog[0];
assert.equal(mail.to, 'support@vendor.test');
assert.equal(mail.replyTo, 'support-staff@test.com');
assert.ok(mail.subject.includes(result.data.ref), 'subject carries the reference');
assert.ok(mail.body.includes('Support Staff <support-staff@test.com> (staff)'));
assert.ok(mail.body.includes(report.message));
assert.ok(mail.body.includes('Environment: production'));
assert.ok(mail.body.includes('owner-google@test.com'), 'identifies the owner Google account');
assert.ok(
  !/password/i.test(mail.body.split('\n').slice(0, 9).join('\n')),
  'no credentials in headers',
);

// 4. Header injection through the subject is neutralised.
result = g.call('reportIssue', {
  token: owner,
  ...report,
  subject: 'Hello\r\nBcc: attacker@evil.test',
});
assert.ok(result.ok);
const injected = g.mailLog[1];
assert.ok(!/[\r\n]/.test(injected.subject), 'subject has no line breaks');
assert.equal(injected.bcc, undefined);

// 5. Validation.
assert.equal(g.call('reportIssue', { token: staff, ...report, subject: 'x' }).code, 'VALIDATION');
assert.equal(
  g.call('reportIssue', { token: staff, ...report, message: 'short' }).code,
  'VALIDATION',
);
assert.equal(g.mailLog.length, 2, 'invalid reports send nothing');

// 6. Unknown category falls back to bug; long text is clipped.
result = g.call('reportIssue', {
  token: owner,
  ...report,
  category: '<script>',
  message: 'x'.repeat(5000),
});
assert.ok(result.ok);
assert.ok(g.mailLog[2].subject.includes('Bug'));
assert.ok(g.mailLog[2].body.length < 2800, 'message is clipped');

// 7. Mail failure is reported honestly and audited.
g.failNextMail();
result = g.call('reportIssue', { token: owner, ...report });
assert.equal(result.code, 'MAIL_FAILED');

// 8. Audit trail records sends and failures without the message text.
const audit = g.call('auditLog', { token: owner });
assert.ok(audit.ok);
const text = JSON.stringify(audit.data);
assert.ok(text.includes('SUPPORT_REPORT'));
assert.ok(text.includes('SUPPORT_REPORT_FAILED'));
assert.ok(!text.includes('stays blank after login'), 'audit log never stores the message body');

// 9. Per-user hourly limit protects the owner's mail quota.
let blocked = null;
for (let i = 0; i < 6 && !blocked; i++) {
  const attempt = g.call('reportIssue', { token: staff, ...report });
  if (!attempt.ok) blocked = attempt;
}
assert.ok(blocked, 'a user cannot send unlimited reports');
assert.equal(blocked.code, 'RATE_LIMIT');

// 10. Quota check and increments must happen after acquiring one shared lock.
const userRateKey = 'support:u:support-staff@test.com';
const workspaceRateKey = 'support:w';
const mailCountBeforeAtomicChecks = g.mailLog.length;
g.cache[userRateKey] = '4';
g.cache[workspaceRateKey] = '0';
g.lockStats.afterAcquire = () => {
  g.cache[userRateKey] = '5';
};
result = g.call('reportIssue', { token: staff, ...report });
assert.equal(result.code, 'RATE_LIMIT', 'the latest user counter is rechecked under the lock');
assert.equal(
  g.mailLog.length,
  mailCountBeforeAtomicChecks,
  'a concurrent quota update sends no email',
);
assert.equal(g.cache[userRateKey], '5');
assert.equal(g.lockStats.afterAcquire, null, 'the lock mock hook is consumed');

// 11. Workspace quota is also rechecked under the same lock.
g.cache[userRateKey] = '0';
g.cache[workspaceRateKey] = '19';
g.lockStats.afterAcquire = () => {
  g.cache[workspaceRateKey] = '20';
};
result = g.call('reportIssue', { token: staff, ...report });
assert.equal(result.code, 'RATE_LIMIT', 'the latest workspace counter is rechecked under the lock');
assert.equal(
  g.mailLog.length,
  mailCountBeforeAtomicChecks,
  'workspace quota blocks email before sending',
);
assert.equal(g.cache[workspaceRateKey], '20');

// 12. Lock contention fails closed without releasing a lock that was not acquired.
g.cache[userRateKey] = '0';
g.cache[workspaceRateKey] = '0';
const lockAttemptsBeforeBusy = g.lockStats.attempts;
const lockWaitsBeforeBusy = g.lockStats.waits;
const lockReleasesBeforeBusy = g.lockStats.releases;
g.lockStats.failNextWait = true;
result = g.call('reportIssue', { token: staff, ...report });
assert.equal(
  result.code,
  'BUSY',
  'lock contention returns a temporary busy response, not a false quota error',
);
assert.equal(g.mailLog.length, mailCountBeforeAtomicChecks, 'lock contention sends no email');
assert.equal(g.lockStats.attempts, lockAttemptsBeforeBusy + 1);
assert.equal(g.lockStats.waits, lockWaitsBeforeBusy);
assert.equal(g.lockStats.releases, lockReleasesBeforeBusy, 'an unacquired lock is never released');

// 13. A successful request consumes both counters exactly once.
result = g.call('reportIssue', { token: staff, ...report });
assert.ok(result.ok, 'report is accepted when both quotas are available');
assert.equal(g.cache[userRateKey], '1');
assert.equal(g.cache[workspaceRateKey], '1');
assert.equal(g.lockStats.releases, lockReleasesBeforeBusy + 1);

console.log('Support report tests passed');
