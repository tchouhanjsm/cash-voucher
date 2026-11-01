const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

function configureRecovery(g, overrides = {}) {
  g.props.OWNER_RECOVERY_EXPECTED_SCRIPT_ID = overrides.scriptId || 'MOCK_SCRIPT_ID';
  g.props.OWNER_RECOVERY_EXPECTED_SS_ID = overrides.ssId || 'SS1';
  g.props.OWNER_RECOVERY_EMAIL = overrides.email || 'owner@test.com';
  g.props.OWNER_RECOVERY_PASSWORD = overrides.password || 'Secure-Temporary-Password-2026';
  g.props.OWNER_RECOVERY_CONFIRM =
    overrides.confirm === undefined ? 'RESET_EXISTING_OWNER_ONLY' : overrides.confirm;
}
function matchingRow(g, email) {
  const emailColumn = g.sheets.Users.rows[0].indexOf('Email');
  return g.sheets.Users.rows
    .slice(1)
    .find((row) => String(row[emailColumn]).toLowerCase() === email.toLowerCase());
}
function credentialSnapshot(row) {
  return {
    userId: row[0],
    name: row[1],
    email: row[2],
    role: row[3],
    active: row[4],
    salt: row[5],
    hash: row[6],
    mustChange: row[7],
    createdAt: row[8],
    lastLogin: row[9],
  };
}
function recoveryKeys() {
  return [
    'OWNER_RECOVERY_EXPECTED_SCRIPT_ID',
    'OWNER_RECOVERY_EXPECTED_SS_ID',
    'OWNER_RECOVERY_EMAIL',
    'OWNER_RECOVERY_PASSWORD',
    'OWNER_RECOVERY_CONFIRM',
  ];
}
function recoveryPropertiesCleared(g) {
  return recoveryKeys().every((key) => !Object.prototype.hasOwnProperty.call(g.props, key));
}
function makeReady(overrides = {}) {
  const g = create();
  g.props.OWNER_EMAIL = 'Owner@Test.com';
  g.props.OWNER_PASSWORD = 'Initial-Owner-Password-2026';
  g.setup();
  configureRecovery(g, overrides);
  const owner = matchingRow(g, 'owner@test.com');
  assert.ok(owner);
  const peer = [
    'USER-PEER',
    'Peer User',
    'peer@test.com',
    'staff',
    true,
    'peer-salt',
    'peer-hash',
    false,
    new Date().toISOString(),
    '',
  ];
  g.sheets.Users.rows.push(peer);
  return { g, owner, peer, before: credentialSnapshot(owner) };
}
function peerSnapshot(g) {
  return g.sheets.Users.rows.slice(2).map(credentialSnapshot);
}
function assertOwnerPreserved(before, after) {
  for (const key of ['userId', 'name', 'email', 'role', 'active', 'createdAt', 'lastLogin']) {
    assert.equal(after[key], before[key], key + ' preserved');
  }
  assert.equal(after.mustChange, true);
  assert.notEqual(after.salt, before.salt);
  assert.notEqual(after.hash, before.hash);
}
async function run() {
  const success = makeReady();
  const before = success.before;
  const peers = peerSnapshot(success.g);
  const pepperBefore = success.g.props.PEPPER;
  const ssIdBefore = success.g.props.SS_ID;
  success.g.cache['f:owner@test.com'] = '4';
  success.g.cache['pf:' + before.userId] = '3';
  success.g.cache['f:other@test.com'] = '2';
  success.g.cache['pf:other-user'] = '1';
  success.g.cache['s:preexisting-owner-session'] = JSON.stringify({
    email: 'owner@test.com',
    salt: before.salt,
  });
  const auditStart = success.g.sheets.AuditLog.rows.length;
  const propsBeforePreflight = JSON.stringify(success.g.props);
  const rowsBeforePreflight = JSON.stringify(
    Object.fromEntries(Object.entries(success.g.sheets).map(([name, sheet]) => [name, sheet.rows])),
  );
  const cacheBeforePreflight = JSON.stringify(success.g.cache);
  const locksBeforePreflight = success.g.lockStats.attempts;
  const preflight = success.g.ownerRecoveryPreflight();
  assert.equal(preflight.ready, true);
  assert.equal(preflight.readOnly, true);
  assert.equal(
    preflight.checks.every((check) => check.passed),
    true,
  );
  assert.equal(preflight.owner.email, 'ow***@test.com');
  assert.equal(JSON.stringify(success.g.props), propsBeforePreflight);
  assert.equal(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(success.g.sheets).map(([name, sheet]) => [name, sheet.rows]),
      ),
    ),
    rowsBeforePreflight,
  );
  assert.equal(JSON.stringify(success.g.cache), cacheBeforePreflight);
  assert.equal(success.g.lockStats.attempts, locksBeforePreflight);

  const recovered = success.g.recoverOwnerPassword();
  assert.equal(recovered.status, 'RECOVERY_COMPLETED');
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.auditVerified, true);
  assert.equal(recovered.cacheCountersCleared, true);
  assert.equal(recovered.cleanupComplete, true);
  assert.equal(recoveryPropertiesCleared(success.g), true);
  const after = credentialSnapshot(matchingRow(success.g, 'owner@test.com'));
  assertOwnerPreserved(before, after);
  assert.deepEqual(peerSnapshot(success.g), peers);
  assert.equal(success.g.props.PEPPER, pepperBefore);
  assert.equal(success.g.props.SS_ID, ssIdBefore);
  assert.equal(success.g.cache['f:owner@test.com'], undefined);
  assert.equal(success.g.cache['pf:' + before.userId], undefined);
  assert.equal(success.g.cache['f:other@test.com'], '2');
  assert.equal(success.g.cache['pf:other-user'], '1');
  assert.ok(success.g.cache['s:preexisting-owner-session']);
  assert.equal(
    after.hash,
    success.g.expectedPasswordHash(after.salt, 'Secure-Temporary-Password-2026'),
  );
  const auditEvent = success.g.sheets.AuditLog.rows
    .slice(auditStart)
    .find((row) => row[2] === 'PASSWORD_RESET');
  assert.ok(auditEvent);
  const auditDetails = JSON.parse(auditEvent[4]);
  assert.equal(auditDetails.eventType, 'USER_PASSWORD_RESET');
  assert.equal(auditDetails.entityType, 'user');
  assert.equal(auditDetails.entityId, before.userId);
  assert.ok(auditDetails.reason.startsWith('EDITOR_AUTHORIZED_OWNER_RECOVERY|'));
  assert.ok(!JSON.stringify(auditDetails).includes(after.hash));
  assert.ok(!JSON.stringify(auditDetails).includes(after.salt));
  assert.ok(!JSON.stringify(auditDetails).includes('Secure-Temporary-Password-2026'));

  const login = success.g.call('login', {
    email: 'owner@test.com',
    password: 'Secure-Temporary-Password-2026',
  });
  assert.equal(login.ok, true);
  assert.equal(login.data.user.mustChangePassword, true);
  const blocked = success.g.call('dashboardSummary', { token: login.data.token });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'PASSWORD_CHANGE');
  const changed = success.g.call('changePassword', {
    token: login.data.token,
    oldPassword: 'Secure-Temporary-Password-2026',
    newPassword: 'Final-Owner-Password-2026',
  });
  assert.equal(changed.ok, true);
  assert.equal(success.g.call('dashboardSummary', { token: changed.data.token }).ok, true);
  assert.equal(
    success.g.call('dashboardSummary', { token: 'preexisting-owner-session' }).code,
    'SESSION',
  );

  const preflightCases = [
    [makeReady({ scriptId: 'WRONG_SCRIPT' }), 'script identity'],
    [makeReady({ ssId: 'WRONG_SHEET' }), 'spreadsheet identity'],
    [makeReady({ email: 'nobody@test.com' }), 'Owner missing'],
  ];
  const missingPepper = makeReady();
  delete missingPepper.g.props.PEPPER;
  preflightCases.push([missingPepper, 'PEPPER missing']);
  const missingUsers = makeReady();
  delete missingUsers.g.sheets.Users;
  preflightCases.push([missingUsers, 'Users missing']);
  const invalidHeader = makeReady();
  invalidHeader.g.sheets.Users.rows[0][0] = 'BrokenHeader';
  preflightCases.push([invalidHeader, 'Users header invalid']);
  const duplicate = makeReady();
  duplicate.g.sheets.Users.rows.push(duplicate.owner.slice());
  preflightCases.push([duplicate, 'duplicate email']);
  const nonOwner = makeReady();
  nonOwner.owner[3] = 'manager';
  preflightCases.push([nonOwner, 'non-owner']);
  const inactive = makeReady();
  inactive.owner[4] = false;
  preflightCases.push([inactive, 'inactive owner']);
  const incomplete = makeReady();
  incomplete.owner[5] = '';
  preflightCases.push([incomplete, 'missing credentials']);
  const missingAudit = makeReady();
  delete missingAudit.g.sheets.AuditLog;
  preflightCases.push([missingAudit, 'AuditLog missing']);
  const missingBackup = makeReady();
  delete missingBackup.g.props.BACKUP_FOLDER_ID;
  preflightCases.push([missingBackup, 'backup missing']);
  for (const [fixture, label] of preflightCases) {
    const propsBefore = JSON.stringify(fixture.g.props);
    const rowsBefore = JSON.stringify(
      Object.fromEntries(
        Object.entries(fixture.g.sheets).map(([name, sheet]) => [name, sheet.rows]),
      ),
    );
    const cacheBefore = JSON.stringify(fixture.g.cache);
    const locksBefore = fixture.g.lockStats.attempts;
    assert.equal(fixture.g.ownerRecoveryPreflight().ready, false, label);
    assert.equal(JSON.stringify(fixture.g.props), propsBefore);
    assert.equal(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(fixture.g.sheets).map(([name, sheet]) => [name, sheet.rows]),
        ),
      ),
      rowsBefore,
    );
    assert.equal(JSON.stringify(fixture.g.cache), cacheBefore);
    assert.equal(fixture.g.lockStats.attempts, locksBefore);
  }

  const failureCases = [
    [makeReady({ confirm: 'NO' }), 'VALIDATION_FAILED', 'confirmation'],
    [makeReady({ password: 'tiny' }), 'VALIDATION_FAILED', 'password'],
    [makeReady({ scriptId: 'WRONG_SCRIPT' }), 'ENVIRONMENT_VALIDATION_FAILED', 'script ID'],
    [makeReady({ ssId: 'WRONG_SHEET' }), 'ENVIRONMENT_VALIDATION_FAILED', 'spreadsheet ID'],
  ];
  const noPepper = makeReady();
  delete noPepper.g.props.PEPPER;
  failureCases.push([noPepper, 'ENVIRONMENT_VALIDATION_FAILED', 'PEPPER']);
  const duplicates = makeReady();
  duplicates.g.sheets.Users.rows.push(duplicates.owner.slice());
  failureCases.push([duplicates, 'ACCOUNT_VALIDATION_FAILED', 'duplicate owner']);
  const inactiveRecovery = makeReady();
  inactiveRecovery.owner[4] = false;
  failureCases.push([inactiveRecovery, 'ACCOUNT_VALIDATION_FAILED', 'inactive owner']);
  const roleRecovery = makeReady();
  roleRecovery.owner[3] = 'manager';
  failureCases.push([roleRecovery, 'ACCOUNT_VALIDATION_FAILED', 'wrong role']);
  for (const [fixture, expectedStatus, label] of failureCases) {
    const ownerBefore = credentialSnapshot(fixture.owner);
    const result = fixture.g.recoverOwnerPassword();
    assert.equal(result.status, expectedStatus, label);
    assert.deepEqual(credentialSnapshot(matchingRow(fixture.g, 'owner@test.com')), ownerBefore);
    assert.equal(recoveryPropertiesCleared(fixture.g), true);
  }

  const lockFailure = makeReady();
  const lockOwnerBefore = credentialSnapshot(lockFailure.owner);
  lockFailure.g.failNextLock();
  assert.equal(lockFailure.g.recoverOwnerPassword().status, 'LOCK_ACQUISITION_FAILED');
  assert.deepEqual(
    credentialSnapshot(matchingRow(lockFailure.g, 'owner@test.com')),
    lockOwnerBefore,
  );
  assert.equal(recoveryPropertiesCleared(lockFailure.g), true);
  assert.equal(lockFailure.g.lockStats.releases, 0);

  const auditDegraded = makeReady();
  auditDegraded.g.failNextAuditWrite();
  const partial = auditDegraded.g.recoverOwnerPassword();
  assert.equal(partial.status, 'RECOVERY_COMPLETED_AUDIT_UNVERIFIED');
  assert.equal(partial.recovered, true);
  assert.equal(partial.auditVerified, false);
  assert.equal(recoveryPropertiesCleared(auditDegraded.g), true);

  const routes = create();
  routes.setup();
  assert.equal(routes.registeredActions().includes('recoverExistingOwnerPasswordOnce_'), false);
  assert.equal(routes.registeredActions().includes('ownerRecoveryPreflight_'), false);
  console.log(
    'Owner recovery tests passed: preflight, safeguards, identity isolation, hashing, sessions, forced password change, audit and cleanup.',
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
