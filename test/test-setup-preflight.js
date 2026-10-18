'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const USER_HEADERS = [
  'UserID',
  'Name',
  'Email',
  'Role',
  'Active',
  'Salt',
  'PasswordHash',
  'MustChangePassword',
  'CreatedAt',
  'LastLogin',
];

function seededUsersSheet(rows) {
  const values = rows.map((row) => row.slice());
  return {
    getLastRow: () => values.length,
    getDataRange: () => ({ getValues: () => values.map((row) => row.slice()) }),
  };
}

function assertPreflightDidNotInitialize(g, expectedSheetNames = []) {
  assert.deepEqual(Object.keys(g.sheets).sort(), [...expectedSheetNames].sort());
  assert.equal(g.props.PEPPER, undefined, 'preflight must not create PEPPER');
  assert.equal(g.props.RECEIPT_FOLDER_ID, undefined, 'preflight must not create a receipt folder');
  assert.equal(g.props.BACKUP_FOLDER_ID, undefined, 'preflight must not create a backup folder');
}

// Missing owner credentials must fail before persisting inferred SS_ID or creating resources.
{
  const g = create();
  assert.throws(() => g.setup(), /OWNER_EMAIL/);
  assert.deepEqual(Object.keys(g.props), [], 'failed preflight must not write Script Properties');
  assertPreflightDidNotInitialize(g);
}

// Invalid email must fail before creating tabs, PEPPER, folders, or a backup trigger.
{
  const g = create();
  g.props.SS_ID = 'SS1';
  g.props.OWNER_EMAIL = 'not-an-email';
  g.props.OWNER_PASSWORD = 'Unique#TempPass2026';
  const before = { ...g.props };
  assert.throws(() => g.setup(), /OWNER_EMAIL/);
  assert.deepEqual(g.props, before);
  assertPreflightDidNotInitialize(g);
}

// Invalid password must fail before initialization writes.
{
  const g = create();
  g.props.SS_ID = 'SS1';
  g.props.OWNER_EMAIL = 'owner@test.com';
  g.props.OWNER_PASSWORD = 'short';
  const before = { ...g.props };
  assert.throws(() => g.setup(), /OWNER_PASSWORD/);
  assert.deepEqual(g.props, before);
  assertPreflightDidNotInitialize(g);
}

// A malformed/legacy Users header must not be silently rewritten by setup().
{
  const g = create();
  g.props.SS_ID = 'SS1';
  g.props.OWNER_EMAIL = 'owner@test.com';
  g.props.OWNER_PASSWORD = 'Unique#TempPass2026';
  g.sheets.Users = seededUsersSheet([['LegacyID', ...USER_HEADERS.slice(1)]]);
  const before = { ...g.props };
  assert.throws(() => g.setup(), /unexpected header/i);
  assert.deepEqual(g.props, before);
  assertPreflightDidNotInitialize(g, ['Users']);
}

// A row with data but no ID must fail closed rather than causing setup to create a second owner.
{
  const g = create();
  g.props.SS_ID = 'SS1';
  g.props.OWNER_EMAIL = 'owner@test.com';
  g.props.OWNER_PASSWORD = 'Unique#TempPass2026';
  g.sheets.Users = seededUsersSheet([
    USER_HEADERS,
    ['', 'Orphan row', 'orphan@test.com', 'staff', true, 'salt', 'hash', true, '2026-10-18', ''],
  ]);
  const before = { ...g.props };
  assert.throws(() => g.setup(), /without a UserID/i);
  assert.deepEqual(g.props, before);
  assertPreflightDidNotInitialize(g, ['Users']);
}

// A partially populated row must be investigated rather than treated as an initialized account.
{
  const g = create();
  g.props.SS_ID = 'SS1';
  g.props.OWNER_EMAIL = 'owner@test.com';
  g.props.OWNER_PASSWORD = 'Unique#TempPass2026';
  g.sheets.Users = seededUsersSheet([
    USER_HEADERS,
    [
      'user-1',
      'Incomplete',
      'incomplete@test.com',
      'staff',
      true,
      'salt',
      '',
      true,
      '2026-10-18',
      '',
    ],
  ]);
  const before = { ...g.props };
  assert.throws(() => g.setup(), /incomplete user row/i);
  assert.deepEqual(g.props, before);
  assertPreflightDidNotInitialize(g, ['Users']);
}

// A successful setup consumes its temporary password and a valid subsequent call is idempotent
// for owner records: it does not create a duplicate owner or require the deleted password property.
{
  const g = create();
  g.props.OWNER_EMAIL = 'owner@test.com';
  g.props.OWNER_PASSWORD = 'Unique#TempPass2026';
  g.setup();
  assert.equal(g.props.OWNER_PASSWORD, undefined);
  const usersBefore = g.sheets.Users.rows.length;
  g.setup();
  assert.equal(g.sheets.Users.rows.length, usersBefore);
}

console.log(
  'Setup preflight OK — credentials fail closed before writes; malformed Users schema/data are preserved for inspection; valid initialization remains idempotent.',
);
