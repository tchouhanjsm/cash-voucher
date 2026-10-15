const { create } = require('./mock-gas');
const assert = require('assert');
const g = create();
let n = 0;
const ok = (c, m) => {
  assert(c, m);
  n++;
};
g.props.OWNER_EMAIL = 'Owner@Test.com';
g.props.OWNER_PIN = '483921';
g.setup();
g.setup(); // idempotent
ok(!!g.props.BACKUP_FOLDER_ID, 'backup folder configured');
const nextPaymentNumber = () => {
  const highest = g.sheets.Vouchers.rows
    .slice(1)
    .reduce((max, row) => (row[15] === 'PAYMENT' ? Math.max(max, Number(row[1]) || 0) : max), 0);
  return Math.max(300, highest + 100);
};
const nextReceiptNumber = () =>
  g.sheets.Vouchers.rows
    .slice(1)
    .reduce((max, row) => (row[15] === 'RECEIPT' ? Math.max(max, Number(row[1]) || 0) : max), 0) +
  1;

// Approval migration adds R:U only, preserves prior cells, and stops on occupied columns.
const approvalMigrationMock = create();
approvalMigrationMock.props.OWNER_EMAIL = 'Owner@Test.com';
approvalMigrationMock.props.OWNER_PIN = '483921';
approvalMigrationMock.setup();
const approvalMigrationSheet = approvalMigrationMock.sheets.Vouchers;
approvalMigrationSheet.rows[0] = approvalMigrationSheet.rows[0].slice(0, 17);
approvalMigrationSheet.rows.push([
  'legacy-approval-migration-id',
  88,
  '2026-10-01',
  'Legacy high payment',
  15000,
  'Other',
  '',
  'ACTIVE',
  'legacy@test.com',
  '2026-10-01T00:00:00Z',
  '',
  '',
  '',
  '',
  'legacy-approval-migration-client',
  'PAYMENT',
  'CASH_OUT',
]);
const approvalMigrationResult = approvalMigrationMock.migrateVoucherApprovalFields();
ok(
  approvalMigrationResult.includes('Added ApprovalStatus') &&
    approvalMigrationSheet.rows[0].slice(17, 21).join(',') ===
      'ApprovalStatus,ApprovedBy,ApprovedAt,ApprovalReason',
  'approval migration appends the four approved headers in R:U',
);
ok(
  approvalMigrationSheet.rows.length === 2 &&
    approvalMigrationSheet.rows[1].slice(0, 17)[0] === 'legacy-approval-migration-id' &&
    approvalMigrationSheet.rows[1].slice(17, 21).every((value) => value === ''),
  'approval migration preserves historical voucher values and leaves new fields blank',
);
const vendorIdMigrationResult = approvalMigrationMock.migrateVoucherVendorIdField();
ok(
  vendorIdMigrationResult.includes('Added VendorID') &&
    approvalMigrationSheet.rows[0][21] === 'VendorID',
  'VendorID migration appends column V after the reviewed approval fields',
);
ok(
  approvalMigrationSheet.rows[1][0] === 'legacy-approval-migration-id' &&
    (approvalMigrationSheet.rows[1][21] || '') === '',
  'VendorID migration preserves legacy vouchers and does not backfill their vendor IDs',
);
const approvalMigrationConflict = create();
approvalMigrationConflict.props.OWNER_EMAIL = 'Owner@Test.com';
approvalMigrationConflict.props.OWNER_PIN = '483921';
approvalMigrationConflict.setup();
approvalMigrationConflict.sheets.Vouchers.rows[0] =
  approvalMigrationConflict.sheets.Vouchers.rows[0].slice(0, 17);
approvalMigrationConflict.sheets.Vouchers.rows[0][18] = 'Unrelated data';
assert.throws(
  () => approvalMigrationConflict.migrateVoucherApprovalFields(),
  /R:U already contain a header or data/,
);
ok(true, 'approval migration refuses to overwrite occupied columns');
const vendorIdMigrationConflict = create();
vendorIdMigrationConflict.props.OWNER_EMAIL = 'Owner@Test.com';
vendorIdMigrationConflict.props.OWNER_PIN = '483921';
vendorIdMigrationConflict.setup();
vendorIdMigrationConflict.sheets.Vouchers.rows[0] =
  vendorIdMigrationConflict.sheets.Vouchers.rows[0].slice(0, 21);
vendorIdMigrationConflict.sheets.Vouchers.rows[0][21] = 'Unrelated data';
assert.throws(
  () => vendorIdMigrationConflict.migrateVoucherVendorIdField(),
  /column V already contains a header or data/,
);
ok(true, 'VendorID migration refuses to overwrite occupied column V');

const retentionDayMs = 24 * 60 * 60 * 1000;
function retentionFolder(name, ageDays) {
  return {
    name,
    createdAt: new Date(Date.now() - ageDays * retentionDayMs),
    trashed: false,
    getName() {
      return this.name;
    },
    getDateCreated() {
      return this.createdAt;
    },
    setTrashed(value) {
      this.trashed = value;
    },
  };
}
const expiredBackup = retentionFolder('backup-2026-01-01_020000', 91);
const recentBackup = retentionFolder('backup-2026-10-09_020000', 2);
const unmanagedFolder = retentionFolder('backup-manual-old', 200);
const unrelatedFolder = retentionFolder('receipts', 200);
const retentionFolders = [expiredBackup, recentBackup, unmanagedFolder, unrelatedFolder];
let retentionIndex = 0;
g.pruneBackups({
  getFolders() {
    retentionIndex = 0;
    return {
      hasNext: () => retentionIndex < retentionFolders.length,
      next: () => retentionFolders[retentionIndex++],
    };
  },
});
ok(expiredBackup.trashed, 'backup retention trashes valid backups older than 90 days');
ok(
  !recentBackup.trashed && !unmanagedFolder.trashed && !unrelatedFolder.trashed,
  'backup retention preserves recent backups and folders outside its naming contract',
);
const manifestCsv = g.backupManifestCsv([
  ['originalFileId', 'backupFileId', 'name', 'createdAt'],
  ['receipt-1', 'backup-receipt-1', 'Receipt, "front".jpg', '2026-10-09T02:00:00.000Z'],
]);
ok(
  manifestCsv.split('\n').length === 2 && !manifestCsv.includes('\\n'),
  'receipt manifest separates records with real CSV line breaks',
);
ok(
  manifestCsv.includes('"Receipt, ""front"".jpg"'),
  'receipt manifest correctly quotes commas and embedded double quotes',
);

// request envelope validation
let malformed = g.call('bootstrap');
ok(malformed.code === 'SESSION', 'missing session rejected');

const malformedJson = g.raw('{');
ok(malformedJson.ok === false && malformedJson.code === 'VALIDATION', 'malformed JSON rejected');

const arrayRequest = g.raw('[]');
ok(arrayRequest.code === 'VALIDATION', 'array request rejected');

ok(!g.props.OWNER_PIN, 'owner PIN property removed after setup');
// Login lock contention: timeout must fail closed without counting an attempt or releasing an unacquired lock.
const contentionAttempts = g.lockStats.attempts;
const contentionWaits = g.lockStats.waits;
const contentionReleases = g.lockStats.releases;
g.lockStats.failNextWait = true;
const busyLogin = g.call('login', { email: 'busy@test.com', pin: '000000' });
ok(
  !busyLogin.ok && busyLogin.code === 'BUSY' && /retry shortly/i.test(busyLogin.error),
  'login lock timeout returns actionable BUSY feedback',
);
ok(
  g.lockStats.attempts === contentionAttempts + 1 &&
    g.lockStats.waits === contentionWaits &&
    g.lockStats.releases === contentionReleases,
  'timed-out lock acquisition is not counted as acquired or released',
);
ok(
  !Object.prototype.hasOwnProperty.call(g.cache, 'f:busy@test.com'),
  'login lock timeout does not increment a failed-login counter',
);
// login
const loginLockWaits = g.lockStats.waits;
const loginLockReleases = g.lockStats.releases;
const badOwnerLogin = g.call('login', { email: 'owner@test.com', pin: '000000' });
ok(
  !badOwnerLogin.ok &&
    g.lockStats.waits === loginLockWaits + 1 &&
    g.lockStats.releases === loginLockReleases + 1,
  'failed login is rejected while holding and releasing the script lock',
);
let r = g.call('login', { email: 'OWNER@test.com', pin: '483921' });
ok(r.ok && r.data.user.role === 'owner', 'owner login');
const as = (t, a, p = {}) => {
  const payload = { ...p };
  if (a === 'createVouchers' && Array.isArray(payload.entries)) {
    payload.entries = payload.entries.map((entry) => ({
      cashImpact: entry?.type === 'RECEIPT' ? 'CASH_IN' : 'CASH_OUT',
      ...entry,
    }));
  }
  return g.call(a, { token: t, ...payload });
};
ok(as(r.data.token, 'bootstrap').code === 'PIN_CHANGE', 'owner must change setup PIN');
let T = as(r.data.token, 'changePin', { oldPin: '483921', newPin: '579246' }).data.token;
const unknownAction = as(T, 'doesNotExist');
ok(unknownAction.code === 'NOT_FOUND', 'unknown action rejected');
const inheritedActionResults = ['constructor', 'toString', '__proto__', 'hasOwnProperty'].map(
  (action) => as(T, action),
);
ok(
  inheritedActionResults.every(
    (result) => !result.ok && result.code === 'NOT_FOUND' && result.data === undefined,
  ),
  'inherited object properties are rejected as API actions without returning auth data',
);
ok(
  g.call('bootstrap').error && g.call('bootstrap').code === 'SESSION',
  'no token => session error',
);
// create users
ok(
  !as(T, 'saveUser', { name: 'Bad', email: 'a@b.com', role: 'staff', pin: '111111' }).ok,
  'weak PIN rejected',
);
const inheritedRoleResults = ['constructor', 'toString', '__proto__', 'hasOwnProperty'].map(
  (role, index) =>
    as(T, 'saveUser', {
      name: 'Invalid role user',
      email: 'invalid-role-' + index + '@test.com',
      role,
      pin: '135792',
    }),
);
ok(
  inheritedRoleResults.every((result) => !result.ok && result.error === 'Invalid role.'),
  'inherited object properties cannot be assigned as user roles',
);

ok(
  as(T, 'saveUser', { name: 'Mona Manager', email: 'm@test.com', role: 'manager', pin: '246810' })
    .ok,
  'manager created',
);
ok(
  as(T, 'saveUser', { name: 'Sam Staff', email: 's@test.com', role: 'staff', pin: '135790' }).ok,
  'staff created',
);
ok(
  as(T, 'saveUser', { name: 'Alex Staff', email: 'a@test.com', role: 'staff', pin: '112233' }).ok,
  'second staff created',
);
ok(
  !as(T, 'saveUser', { name: 'X', email: 'M@test.com', role: 'staff', pin: '135791' }).ok,
  'dup email rejected',
);
// forced PIN change
const M0 = g.call('login', { email: 'm@test.com', pin: '246810' }).data.token;
ok(as(M0, 'bootstrap').code === 'PIN_CHANGE', 'must change pin first');
const cp = as(M0, 'changePin', { oldPin: '246810', newPin: '864209' });
ok(cp.ok, 'pin changed');
ok(as(M0, 'bootstrap').code === 'SESSION', 'old token invalid after pin change');
const M = cp.data.token;
ok(as(M, 'bootstrap').ok, 'new token works');
const managerUserId = as(T, 'listUsers').data.find((u) => u.email === 'm@test.com').id;

// Use a dedicated disposable account for PIN lockout tests so those intentionally
// failed attempts cannot invalidate the manager session used by later approval tests.
ok(
  as(T, 'saveUser', {
    name: 'Lockout Test User',
    email: 'lockout@test.com',
    role: 'staff',
    pin: '314159',
  }).ok,
  'dedicated account created for PIN lockout tests',
);
const lockoutLogin = g.call('login', { email: 'lockout@test.com', pin: '314159' });
const lockoutPinChange = as(lockoutLogin.data.token, 'changePin', {
  oldPin: '314159',
  newPin: '625814',
});
const L = lockoutPinChange.data.token;
const lockoutUserId = as(T, 'listUsers').data.find((u) => u.email === 'lockout@test.com').id;
const busyPinAttempts = g.lockStats.attempts;
const busyPinWaits = g.lockStats.waits;
const busyPinReleases = g.lockStats.releases;
g.lockStats.failNextWait = true;
const busyPinChange = as(L, 'changePin', { oldPin: '000000', newPin: '625814' });
ok(
  !busyPinChange.ok &&
    busyPinChange.code === 'BUSY' &&
    !Object.prototype.hasOwnProperty.call(g.cache, 'pf:' + lockoutUserId),
  'PIN-change lock timeout does not record a failed current-PIN attempt',
);
ok(
  g.lockStats.attempts === busyPinAttempts + 1 &&
    g.lockStats.waits === busyPinWaits &&
    g.lockStats.releases === busyPinReleases,
  'PIN-change timeout does not release an unacquired lock',
);
const changePinWaits = g.lockStats.waits;
const changePinReleases = g.lockStats.releases;
const failedPinChanges = [];
for (let i = 0; i < 5; i++) {
  failedPinChanges.push(as(L, 'changePin', { oldPin: '000000', newPin: '625814' }));
}
ok(
  failedPinChanges.every((result) => !result.ok && result.code !== 'LOCKED'),
  'wrong current PIN attempts are counted before lockout',
);
ok(
  g.lockStats.waits === changePinWaits + 5 && g.lockStats.releases === changePinReleases + 5,
  'each PIN-change counter update runs under the shared script lock',
);
const changePinLockoutWaits = g.lockStats.waits;
const changePinLockoutReleases = g.lockStats.releases;
ok(
  as(L, 'changePin', { oldPin: '625814', newPin: '112244' }).code === 'LOCKED',
  'PIN change is locked after five incorrect current PIN attempts',
);
ok(
  g.lockStats.waits === changePinLockoutWaits + 1 &&
    g.lockStats.releases === changePinLockoutReleases + 1,
  'locked PIN-change attempts release the acquired script lock',
);
const S0 = g.call('login', { email: 's@test.com', pin: '135790' }).data.token;
const S = as(S0, 'changePin', { oldPin: '135790', newPin: '975310' }).data.token;
const A0 = g.call('login', { email: 'a@test.com', pin: '112233' }).data.token;
const A = as(A0, 'changePin', { oldPin: '112233', newPin: '224466' }).data.token;
ok(as(S, 'backupStatus').code === 'FORBIDDEN', 'staff cannot read owner backup status');
ok(as(M, 'backupStatus').code === 'FORBIDDEN', 'manager cannot read owner backup status');
let backupStatus = as(T, 'backupStatus').data;
ok(
  backupStatus.state === 'never_run' &&
    backupStatus.configured &&
    backupStatus.retentionDays === 90 &&
    !backupStatus.lastSuccess,
  'owner backup status distinguishes configured but never-run backups',
);
g.props.BACKUP_LAST_ATTEMPT = '2026-10-09T10:00:00.000Z';
backupStatus = as(T, 'backupStatus').data;
ok(
  backupStatus.state === 'incomplete' && backupStatus.lastAttempt === g.props.BACKUP_LAST_ATTEMPT,
  'owner backup status flags an attempt without a completed success',
);
g.props.BACKUP_LAST_SUCCESS = '2026-10-09T10:01:00.000Z';
backupStatus = as(T, 'backupStatus').data;
ok(backupStatus.state === 'success', 'owner backup status reports recorded success');
g.props.BACKUP_LAST_SUCCESS_METRICS = JSON.stringify({
  completedAt: g.props.BACKUP_LAST_SUCCESS,
  durationMs: 1250,
  receiptCount: 12,
  receiptBytes: 7340032,
  receiptBytesKnown: true,
});
backupStatus = as(T, 'backupStatus').data;
ok(
  backupStatus.lastSuccessDurationMs === 1250 &&
    backupStatus.lastSuccessReceiptCount === 12 &&
    backupStatus.lastSuccessReceiptBytesKnown &&
    backupStatus.lastSuccessReceiptBytes === 7340032,
  'owner backup status exposes metrics tied to the matching successful snapshot timestamp',
);
g.props.BACKUP_LAST_SUCCESS_METRICS = JSON.stringify({
  completedAt: 'stale-metrics',
  durationMs: 999999,
  receiptCount: 999,
  receiptBytes: 999999,
  receiptBytesKnown: true,
});
backupStatus = as(T, 'backupStatus').data;
ok(
  backupStatus.lastSuccessDurationMs === null &&
    backupStatus.lastSuccessReceiptCount === null &&
    !backupStatus.lastSuccessReceiptBytesKnown,
  'owner backup status ignores stale metrics from an older success',
);
g.props.BACKUP_LAST_ERROR = 'Drive copy failed';
g.props.BACKUP_LAST_ALERT_ERROR = 'Mail service unavailable';
backupStatus = as(T, 'backupStatus').data;
ok(
  backupStatus.state === 'failed' &&
    backupStatus.lastError === 'Drive copy failed' &&
    backupStatus.lastAlertError === 'Mail service unavailable',
  'owner backup status separates backup failure from notification delivery failure',
);
delete g.props.BACKUP_LAST_ERROR;
delete g.props.BACKUP_LAST_ALERT_ERROR;
delete g.props.BACKUP_LAST_SUCCESS_METRICS;
g.props.BACKUP_LAST_SUCCESS = 'not-a-timestamp';
backupStatus = as(T, 'backupStatus').data;
ok(
  backupStatus.state === 'incomplete',
  'owner backup status does not trust malformed success timestamps',
);
delete g.props.BACKUP_LAST_ATTEMPT;
delete g.props.BACKUP_LAST_SUCCESS;
delete g.props.BACKUP_LAST_ERROR;

// create vouchers
const today = new Date().toISOString().slice(0, 10);
const tiny = Buffer.from('fakejpeg').toString('base64');
const missingCashImpact = g.call('createVouchers', {
  token: T,
  entries: [{ date: today, vendor: 'Missing Impact Vendor', amount: 17 }],
});
ok(
  !missingCashImpact.ok && missingCashImpact.code === 'VALIDATION',
  'server rejects creation without cash impact',
);
const invalidCashImpacts = ['UNCLASSIFIED', 'BANK_TRANSFER', '<img>'].map((cashImpact) =>
  g.call('createVouchers', {
    token: T,
    entries: [{ date: today, vendor: 'Invalid Impact Vendor', amount: 17, cashImpact }],
  }),
);
ok(
  invalidCashImpacts.every((result) => !result.ok && result.code === 'VALIDATION'),
  'server rejects unknown and UNCLASSIFIED values for new vouchers',
);
r = as(S, 'createVouchers', {
  entries: [
    {
      clientId: 'c1',
      date: today,
      vendor: '=HYPERLINK("x")',
      amount: '150.555',
      category: 'Fuel',
      receipts: [{ mime: 'image/jpeg', data: tiny }],
    },
    { clientId: 'c2', date: today, vendor: 'Ram Traders', amount: 2000 },
  ],
});
ok(
  r.ok &&
    r.data.created.length === 2 &&
    r.data.created[0].no === 201 &&
    r.data.created[1].no === 202,
  'numbers from 201',
);
ok(r.data.created[0].vendor.startsWith("'="), 'formula injection neutralised');
ok(
  r.data.created[0].amount === 150.56 || r.data.created[0].amount === 150.55,
  'amount rounded to 2dp',
);
ok(r.data.created[0].receipts.length === 1, 'receipt stored');
ok(r.data.created[0].cashImpact === 'CASH_OUT', 'cash impact persists and is returned to clients');
const initialCreateAudit = g.sheets.AuditLog.rows.find(
  (row) => row[2] === 'CREATE' && row[3] === '#201',
);
const initialCreateDetails = initialCreateAudit ? JSON.parse(initialCreateAudit[4]) : null;
ok(
  initialCreateDetails?.eventType === 'VOUCHER_CREATED' &&
    initialCreateDetails.eventId &&
    initialCreateDetails.entityId === r.data.created[0].id &&
    initialCreateDetails.changes.some(
      (change) =>
        change.field === 'amount' &&
        change.before === null &&
        change.after === r.data.created[0].amount,
    ),
  'voucher creation audit records an event ID and null-to-value amount delta',
);
const filesAfterFirstCreate = Object.keys(g.files).length;
const dup = as(S, 'createVouchers', {
  entries: [
    {
      clientId: 'c1',
      date: today,
      vendor: '=HYPERLINK("x")',
      amount: '150.555',
      category: 'Fuel',
      receipts: [{ mime: 'image/jpeg', data: tiny }],
    },
  ],
});
ok(
  dup.ok && dup.data.skipped === 1 && dup.data.created[0].no === 201,
  'same-user retry with matching details is idempotent',
);
ok(Object.keys(g.files).length === filesAfterFirstCreate, 'duplicate retry creates no receipt');
const changedPayloads = [
  { date: new Date(Date.now() - 86400000).toISOString().slice(0, 10) },
  { vendor: 'Different vendor' },
  { amount: 999 },
  { category: 'Kitchen' },
  { notes: 'changed notes' },
  { cashImpact: 'NO_CASH' },
  { type: 'RECEIPT' },
];
const changedPayloadResults = changedPayloads.map((override) =>
  as(S, 'createVouchers', {
    entries: [
      {
        clientId: 'c1',
        date: today,
        vendor: '=HYPERLINK("x")',
        amount: '150.555',
        category: 'Fuel',
        notes: '',
        type: 'PAYMENT',
        ...override,
      },
    ],
  }),
);
ok(
  changedPayloadResults.every((result) => !result.ok && result.code === 'CONFLICT'),
  'same-user client ID rejects changed date, counterparty, amount, category, notes, type and cash impact',
);
ok(
  Object.keys(g.files).length === filesAfterFirstCreate,
  'changed-payload conflict creates no duplicate receipt files',
);
const collision = as(A, 'createVouchers', {
  entries: [{ clientId: 'c1', date: today, vendor: 'private', amount: 999999 }],
});
ok(
  !collision.ok && collision.code === 'CONFLICT' && !collision.data,
  'cross-user client ID collision is blocked',
);
ok(
  !as(S, 'createVouchers', {
    entries: [{ clientId: 'x'.repeat(61), date: today, vendor: 'x', amount: 1 }],
  }).ok,
  'oversized client ID rejected',
);
ok(
  !as(S, 'createVouchers', {
    entries: [{ clientId: 'bad\u0001id', date: today, vendor: 'x', amount: 1 }],
  }).ok,
  'control character in client ID rejected',
);
const filesBeforeBatchDuplicate = Object.keys(g.files).length;
const sameRequest = as(S, 'createVouchers', {
  entries: [
    {
      clientId: 'c3',
      date: today,
      vendor: 'Batch',
      amount: 10,
      receipts: [{ mime: 'image/png', data: tiny }],
    },
    {
      clientId: 'c3',
      date: today,
      vendor: 'Batch',
      amount: 10,
      receipts: [{ mime: 'image/png', data: tiny }],
    },
  ],
});
ok(
  sameRequest.ok &&
    sameRequest.data.created.length === 2 &&
    sameRequest.data.skipped === 1 &&
    sameRequest.data.created[0].no === 203 &&
    sameRequest.data.created[1].no === 203,
  'same-request duplicate is deduplicated',
);
ok(
  Object.keys(g.files).length === filesBeforeBatchDuplicate + 1,
  'same-request duplicate creates one receipt',
);
ok(
  !as(S, 'createVouchers', { entries: [{ date: '2999-01-01', vendor: 'x', amount: 1 }] }).ok,
  'future date rejected',
);
ok(
  !as(S, 'createVouchers', { entries: [{ date: today, vendor: 'x', amount: -5 }] }).ok,
  'negative amount rejected',
);
ok(
  !as(S, 'createVouchers', { bulk: true, entries: [{ date: today, vendor: 'x', amount: 5 }] }).ok,
  'staff cannot bulk',
);
ok(
  !as(S, 'createVouchers', {
    entries: [
      { date: today, vendor: 'x', amount: 5, receipts: [{ mime: 'text/html', data: tiny }] },
    ],
  }).ok,
  'non-image receipt rejected',
);
// RBAC
const id1 = r.data.created[0].id;
ok(
  !as(S, 'updateVoucher', { id: id1, reason: 'Not allowed', fields: { amount: 1 } }).ok,
  'staff cannot edit',
);
ok(!as(S, 'cancelVoucher', { id: id1, reason: 'test' }).ok, 'staff cannot cancel');
ok(
  !as(S, 'listUsers').ok && !as(S, 'auditLog').ok && !as(M, 'listUsers').ok,
  'non-owners blocked from admin',
);
ok(as(S, 'bootstrap').data.vouchers.length === 3, 'staff sees own');
const mv = as(M, 'createVouchers', {
  bulk: true,
  entries: Array.from({ length: 50 }, (_, i) => ({
    date: today,
    vendor: 'V' + (i % 5),
    amount: 10 + i,
    category: 'Other',
  })),
});
ok(mv.ok && mv.data.created.length === 50 && mv.data.created[49].no === 253, 'manager bulk 50');
const bulkAuditRows = g.sheets.AuditLog.rows.filter((row) => row[2] === 'BULK_CREATE');
const bulkSummaryRows = g.sheets.AuditLog.rows.filter((row) => row[2] === 'BULK_IMPORT');
ok(
  bulkAuditRows.length === 50,
  'bulk create writes an individual audit event for each created voucher',
);
const bulkSummary = bulkSummaryRows.slice(-1)[0];
const bulkSummaryDetails = bulkSummary ? JSON.parse(bulkSummary[4]) : null;
ok(
  bulkSummaryDetails?.eventType === 'BULK_IMPORT_COMPLETED' &&
    bulkSummaryDetails.changes.some(
      (change) => change.field === 'createdCount' && change.after === 50,
    ),
  'bulk import summary records created count in structured details',
);
ok(
  bulkAuditRows.every((row) => {
    const details = JSON.parse(row[4]);
    return (
      details.version === 1 &&
      details.eventId &&
      details.entityType === 'voucher' &&
      details.entityId &&
      details.changes.some((change) => change.field === 'amount' && change.before === null)
    );
  }),
  'bulk-created vouchers have event IDs and null-to-value field deltas',
);
ok(as(S, 'bootstrap').data.vouchers.length === 3, 'staff still sees only own after bulk');
ok(as(M, 'bootstrap').data.vouchers.length === 53, 'manager sees all');

// Owner-approved high-value payment approval policy: inclusive INR 10,000 threshold.
const approvalDate = '2020-02-01';
const approvalReportBefore = as(T, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ACTIVE',
});
ok(approvalReportBefore.ok, 'baseline active-payment total available before approval tests');
const approvalTotalBefore = approvalReportBefore.data.activePaymentTotal;
const belowApprovalThreshold = as(M, 'createVouchers', {
  entries: [
    {
      clientId: 'approval-below-threshold',
      date: today,
      vendor: 'Below Approval Threshold',
      amount: 9999.99,
      type: 'PAYMENT',
    },
  ],
});
ok(
  belowApprovalThreshold.ok &&
    belowApprovalThreshold.data.created[0].approvalStatus === 'NOT_REQUIRED',
  'payment below INR 10,000 does not require approval',
);
const managerOwnedHighPayment = as(M, 'createVouchers', {
  entries: [
    {
      clientId: 'approval-manager-owned',
      date: today,
      vendor: 'Manager Own High Value',
      amount: 10000,
      type: 'PAYMENT',
    },
  ],
});
const managerOwnedHighVoucher = managerOwnedHighPayment.data.created[0];
ok(
  managerOwnedHighPayment.ok && managerOwnedHighVoucher.approvalStatus === 'PENDING',
  'payment at exactly INR 10,000 is pending approval',
);
const staffOwnedHighPayment = as(S, 'createVouchers', {
  entries: [
    {
      clientId: 'approval-manager-review',
      date: today,
      vendor: 'Staff High Value',
      amount: 12500,
      type: 'PAYMENT',
    },
  ],
});
const staffOwnedHighVoucher = staffOwnedHighPayment.data.created[0];
ok(
  staffOwnedHighPayment.ok && staffOwnedHighVoucher.approvalStatus === 'PENDING',
  'high-value payment from staff is pending approval',
);
ok(
  as(M, 'approveVoucher', { id: managerOwnedHighVoucher.id }).code === 'FORBIDDEN',
  'creator cannot approve their own high-value payment',
);
ok(
  as(M, 'rejectVoucher', {
    id: managerOwnedHighVoucher.id,
    reason: 'Creator attempted rejection',
  }).code === 'FORBIDDEN',
  'creator cannot reject their own high-value payment',
);
ok(
  as(S, 'approveVoucher', { id: staffOwnedHighVoucher.id }).code === 'FORBIDDEN',
  'staff cannot approve high-value payments',
);
const pendingApprovalReport = as(T, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ACTIVE',
});
ok(
  pendingApprovalReport.ok &&
    pendingApprovalReport.data.pendingApprovalCount === 2 &&
    Math.round((pendingApprovalReport.data.activePaymentTotal - approvalTotalBefore) * 100) ===
      999999,
  'pending payments remain visible but are excluded from active-payment totals',
);
const approvedManagerPayment = as(T, 'approveVoucher', { id: managerOwnedHighVoucher.id });
ok(
  approvedManagerPayment.ok &&
    approvedManagerPayment.data.approvalStatus === 'APPROVED' &&
    approvedManagerPayment.data.approvedBy.toLowerCase() === 'owner@test.com' &&
    approvedManagerPayment.data.approvedAt,
  'owner can approve a manager-created payment and approval metadata is saved',
);
const managerApprovesStaffPayment = as(M, 'approveVoucher', { id: staffOwnedHighVoucher.id });
ok(
  managerApprovesStaffPayment.ok &&
    managerApprovesStaffPayment.data.approvalStatus === 'APPROVED' &&
    managerApprovesStaffPayment.data.approvedBy.toLowerCase() === 'm@test.com',
  'manager can approve another user’s high-value payment',
);
const approvalAuditRow = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'PAYMENT_APPROVE' && row[3] === '#' + managerOwnedHighVoucher.no);
const approvalAuditDetails = approvalAuditRow ? JSON.parse(approvalAuditRow[4]) : null;
ok(
  approvalAuditDetails?.eventType === 'PAYMENT_VOUCHER_APPROVED' &&
    approvalAuditDetails.reason === '' &&
    approvalAuditDetails.changes.some(
      (change) =>
        change.field === 'approvalStatus' &&
        change.before === 'PENDING' &&
        change.after === 'APPROVED',
    ) &&
    approvalAuditDetails.changes.some(
      (change) => change.field === 'approvedBy' && change.after.toLowerCase() === 'owner@test.com',
    ),
  'payment approval is auditable with status change, actor and timestamp metadata',
);
const approvedPaymentReport = as(T, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ACTIVE',
});
ok(
  approvedPaymentReport.ok &&
    approvedPaymentReport.data.pendingApprovalCount === 0 &&
    Math.round((approvedPaymentReport.data.activePaymentTotal - approvalTotalBefore) * 100) ===
      3249999,
  'approved payments re-enter active-payment totals',
);
// UAT-048: non-material corrections must retain the existing approval and its metadata.
const paymentNotesEditPreservesApproval = as(M, 'updateVoucher', {
  id: managerOwnedHighVoucher.id,
  reason: 'Updated description after review',
  fields: { notes: 'Reviewed payment details' },
});
ok(
  paymentNotesEditPreservesApproval.ok &&
    paymentNotesEditPreservesApproval.data.approvalStatus === 'APPROVED' &&
    paymentNotesEditPreservesApproval.data.approvedBy.toLowerCase() === 'owner@test.com' &&
    paymentNotesEditPreservesApproval.data.approvedAt === approvedManagerPayment.data.approvedAt,
  'editing only payment notes preserves independent approval and metadata',
);
const notesEditAuditRow = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'UPDATE' && row[3] === '#' + managerOwnedHighVoucher.no);
const notesEditAudit = notesEditAuditRow ? JSON.parse(notesEditAuditRow[4]) : null;
ok(
  notesEditAudit?.reason === 'Updated description after review' &&
    notesEditAudit.changes.some(
      (change) =>
        change.field === 'notes' &&
        change.before === '' &&
        change.after === 'Reviewed payment details',
    ) &&
    !notesEditAudit.changes.some((change) => change.field === 'approvalStatus'),
  'non-material note edit retains reason and field-level audit without approval invalidation',
);
const paymentCategoryEditPreservesApproval = as(M, 'updateVoucher', {
  id: managerOwnedHighVoucher.id,
  reason: 'Corrected expense category',
  fields: { category: 'Maintenance' },
});
ok(
  paymentCategoryEditPreservesApproval.ok &&
    paymentCategoryEditPreservesApproval.data.category === 'Maintenance' &&
    paymentCategoryEditPreservesApproval.data.approvalStatus === 'APPROVED' &&
    paymentCategoryEditPreservesApproval.data.approvedBy.toLowerCase() === 'owner@test.com',
  'editing only category preserves independent approval and metadata',
);
const approvedAfterNonMaterialReport = as(T, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ACTIVE',
});
ok(
  approvedAfterNonMaterialReport.ok &&
    approvedAfterNonMaterialReport.data.pendingApprovalCount === 0 &&
    Math.round(
      (approvedAfterNonMaterialReport.data.activePaymentTotal - approvalTotalBefore) * 100,
    ) === 3249999,
  'approved payment remains in totals after category and notes corrections',
);

// Material edits invalidate approval and keep the prior decision in the attributed audit history.
function assertMaterialEditResetsApproval(fields, field, expected, reason, reapprove) {
  if (reapprove) {
    const approved = as(T, 'approveVoucher', { id: managerOwnedHighVoucher.id });
    ok(
      approved.ok && approved.data.approvalStatus === 'APPROVED',
      field + ' edit regression can be independently reapproved before correction',
    );
  }

  const result = as(M, 'updateVoucher', {
    id: managerOwnedHighVoucher.id,
    reason: reason,
    fields: fields,
  });
  ok(
    result.ok &&
      result.data[field] === expected &&
      result.data.approvalStatus === 'PENDING' &&
      result.data.approvedBy === '',
    field + ' edit returns an approved payment to pending approval',
  );
  const auditRow = [...g.sheets.AuditLog.rows]
    .reverse()
    .find((row) => row[2] === 'UPDATE' && row[3] === '#' + managerOwnedHighVoucher.no);
  const audit = auditRow ? JSON.parse(auditRow[4]) : null;
  ok(
    audit?.reason === reason &&
      audit.changes.some((change) => change.field === field && change.before !== change.after) &&
      audit.changes.some(
        (change) =>
          change.field === 'approvalStatus' &&
          change.before === 'APPROVED' &&
          change.after === 'PENDING',
      ) &&
      audit.changes.some(
        (change) =>
          change.field === 'approvedBy' &&
          change.before.toLowerCase() === 'owner@test.com' &&
          change.after === '',
      ),
    field + ' edit audit preserves prior approval attribution and correction reason',
  );
  return result;
}
assertMaterialEditResetsApproval(
  { amount: 11000 },
  'amount',
  11000,
  'Corrected payment amount after review',
  false,
);
const afterApprovalResetReport = as(T, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ACTIVE',
});
ok(
  afterApprovalResetReport.ok &&
    Math.round((afterApprovalResetReport.data.activePaymentTotal - approvalTotalBefore) * 100) ===
      2249999,
  'a materially corrected payment is removed from totals until approved again',
);
assertMaterialEditResetsApproval(
  { vendor: 'Manager Own High Value Corrected' },
  'vendor',
  'Manager Own High Value Corrected',
  'Corrected payment vendor identity',
  true,
);
assertMaterialEditResetsApproval(
  { cashImpact: 'NO_CASH' },
  'cashImpact',
  'NO_CASH',
  'Corrected cash movement classification',
  true,
);
assertMaterialEditResetsApproval(
  { date: '2020-02-02' },
  'date',
  '2020-02-02',
  'Corrected voucher business date',
  true,
);
const highValueReceipt = as(T, 'createVouchers', {
  entries: [
    {
      clientId: 'approval-receipt-not-required',
      date: today,
      vendor: 'High Value Receipt',
      amount: 15000,
      type: 'RECEIPT',
    },
  ],
});
ok(
  highValueReceipt.ok && highValueReceipt.data.created[0].approvalStatus === 'NOT_REQUIRED',
  'high-value cash receipts are outside the PAYMENT-only approval policy',
);
const closeBlockedPayment = as(S, 'createVouchers', {
  entries: [
    {
      clientId: 'approval-close-blocker',
      date: approvalDate,
      vendor: 'Rejected Payment Blocks Close',
      amount: 10000,
      type: 'PAYMENT',
    },
  ],
});
const closeBlockedVoucher = closeBlockedPayment.data.created[0];
ok(
  closeBlockedPayment.ok && closeBlockedVoucher.approvalStatus === 'PENDING',
  'high-value payment on a close date starts pending approval',
);
const missingRejectionReason = as(T, 'rejectVoucher', {
  id: closeBlockedVoucher.id,
  reason: 'no',
});
ok(
  !missingRejectionReason.ok && missingRejectionReason.code === 'VALIDATION',
  'payment rejection requires an attributable reason',
);
const rejectedApproval = as(T, 'rejectVoucher', {
  id: closeBlockedVoucher.id,
  reason: 'Supplier details not verified',
});
ok(
  rejectedApproval.ok &&
    rejectedApproval.data.approvalStatus === 'REJECTED' &&
    rejectedApproval.data.approvalReason === 'Supplier details not verified',
  'rejection preserves its reason and leaves the voucher available for review',
);
const closeApprovalPreview = as(M, 'cashClosePreview', {
  date: approvalDate,
  openingCash: '0',
  openingReason: 'Test opening cash',
});
ok(
  closeApprovalPreview.ok &&
    closeApprovalPreview.data.pendingApprovals.some(
      (item) => item.id === closeBlockedVoucher.id && item.approvalStatus === 'REJECTED',
    ) &&
    !closeApprovalPreview.data.readyToClose,
  'rejected active payments are visible as blockers in cash-close preview',
);
const closeApprovalBlocked = as(M, 'createCashClose', {
  date: approvalDate,
  openingCash: '0',
  openingReason: 'Test opening cash',
  countedCash: '0',
  requestId: 'approval-close-must-block',
});
ok(
  !closeApprovalBlocked.ok && closeApprovalBlocked.code === 'CASH_CLOSE_APPROVAL_PENDING',
  'backend refuses final cash close while a high-value payment is not approved',
);
ok(
  as(T, 'cancelVoucher', {
    id: closeBlockedVoucher.id,
    reason: 'Rejected payment removed from close period',
  }).ok,
  'owner can cancel a rejected payment before retrying close',
);
// A blank status from an older voucher remains NOT_REQUIRED; no historical backfill on edit.
const historicalHighPayment = as(T, 'createVouchers', {
  entries: [
    {
      clientId: 'approval-historical-blank',
      date: today,
      vendor: 'Legacy High Payment',
      amount: 16000,
      type: 'PAYMENT',
    },
  ],
});
const historicalRow = g.sheets.Vouchers.rows.find(
  (row) => row[0] === historicalHighPayment.data.created[0].id,
);
historicalRow[17] = '';
historicalRow[18] = '';
historicalRow[19] = '';
historicalRow[20] = '';
const historicalBootstrap = as(T, 'bootstrap').data.vouchers.find(
  (voucher) => voucher.id === historicalHighPayment.data.created[0].id,
);
ok(
  historicalBootstrap.approvalStatus === 'NOT_REQUIRED',
  'blank historical approval field does not trigger retroactive approval',
);
const historicalEdit = as(M, 'updateVoucher', {
  id: historicalBootstrap.id,
  reason: 'Legacy note cleanup without reclassifying history',
  fields: { notes: 'Historical voucher note updated' },
});
ok(
  historicalEdit.ok && historicalEdit.data.approvalStatus === 'NOT_REQUIRED',
  'editing a historical high-value voucher does not silently backfill approval state',
);
const historicalApprovalRow = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'UPDATE' && row[3] === '#' + historicalBootstrap.no);
const historicalApprovalDetails = historicalApprovalRow
  ? JSON.parse(historicalApprovalRow[4])
  : null;
ok(
  !historicalApprovalDetails?.changes.some((change) => change.field === 'approvalStatus'),
  'legacy edit audit does not invent an approval-state transition',
);

const staffImpactEdit = as(S, 'updateVoucher', {
  id: id1,
  reason: 'Digital payment',
  fields: { cashImpact: 'NO_CASH' },
});
ok(!staffImpactEdit.ok, 'staff cannot edit a saved cash-impact classification');
const impactEdit = as(M, 'updateVoucher', {
  id: id1,
  reason: 'Paid by bank transfer',
  fields: { cashImpact: 'NO_CASH' },
});
ok(
  impactEdit.ok && impactEdit.data.cashImpact === 'NO_CASH',
  'manager can correct cash impact with a reason',
);
const latestImpactAudit = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'UPDATE' && row[3] === '#201');
const impactAuditDetails = latestImpactAudit ? JSON.parse(latestImpactAudit[4]) : null;
ok(
  impactAuditDetails?.reason === 'Paid by bank transfer' &&
    impactAuditDetails.changes.some(
      (change) =>
        change.field === 'cashImpact' && change.before === 'CASH_OUT' && change.after === 'NO_CASH',
    ),
  'cash-impact edit records old/new values and correction reason',
);
const beforeReasonFailure = as(M, 'bootstrap').data.vouchers.find((voucher) => voucher.id === id1);
const auditUpdatesBefore = g.sheets.AuditLog.rows.filter(
  (row) => row[2] === 'UPDATE' && row[3] === '#201',
).length;
const missingReasonEdit = as(M, 'updateVoucher', {
  id: id1,
  fields: { amount: 175 },
});
ok(
  !missingReasonEdit.ok && missingReasonEdit.code === 'VALIDATION',
  'voucher correction without a reason is rejected',
);
const shortReasonEdit = as(M, 'updateVoucher', {
  id: id1,
  reason: 'no',
  fields: { amount: 175 },
});
ok(
  !shortReasonEdit.ok && shortReasonEdit.code === 'VALIDATION',
  'voucher correction reason must contain at least three characters',
);
const longReasonEdit = as(M, 'updateVoucher', {
  id: id1,
  reason: 'r'.repeat(201),
  fields: { amount: 175 },
});
ok(
  !longReasonEdit.ok && longReasonEdit.code === 'VALIDATION',
  'voucher correction reason exceeding 200 characters is rejected',
);
const unchangedEdit = as(M, 'updateVoucher', {
  id: id1,
  reason: 'Reviewed the voucher and confirmed the current values.',
  fields: { amount: beforeReasonFailure.amount },
});
ok(
  !unchangedEdit.ok && unchangedEdit.code === 'VALIDATION',
  'unchanged voucher edits are rejected instead of creating misleading audit events',
);
const afterRejectedEdits = as(M, 'bootstrap').data.vouchers.find((voucher) => voucher.id === id1);
ok(
  afterRejectedEdits.amount === beforeReasonFailure.amount &&
    g.sheets.AuditLog.rows.filter((row) => row[2] === 'UPDATE' && row[3] === '#201').length ===
      auditUpdatesBefore,
  'rejected/no-op edits leave voucher data and the correction audit unchanged',
);

const correction = as(M, 'updateVoucher', {
  id: id1,
  reason: 'Corrected after comparing the paper receipt.',
  fields: {
    date: '2026-10-01',
    amount: 175,
    vendor: 'Corrected supplier',
    category: 'Kitchen',
    notes: 'Verified against paper receipt',
  },
});
ok(
  correction.ok &&
    correction.data.date === '2026-10-01' &&
    correction.data.amount === 175 &&
    correction.data.vendor === 'Corrected supplier' &&
    correction.data.category === 'Kitchen' &&
    correction.data.notes === 'Verified against paper receipt',
  'manager can apply a reasoned voucher correction',
);
const updateAuditRow = g.sheets.AuditLog.rows
  .filter((row) => row[2] === 'UPDATE' && row[3] === '#201')
  .slice(-1)[0];
let updateAuditDetails = null;
try {
  updateAuditDetails = JSON.parse(updateAuditRow[4]);
} catch {
  updateAuditDetails = null;
}
ok(
  updateAuditDetails &&
    updateAuditDetails.version === 1 &&
    updateAuditDetails.reason === 'Corrected after comparing the paper receipt.',
  'correction audit records the attributable reason in structured details',
);
const auditedFields = new Map(
  (updateAuditDetails?.changes || []).map((change) => [change.field, change]),
);
ok(
  auditedFields.get('date')?.before === beforeReasonFailure.date &&
    auditedFields.get('date')?.after === '2026-10-01' &&
    auditedFields.get('amount')?.before === beforeReasonFailure.amount &&
    auditedFields.get('amount')?.after === 175 &&
    auditedFields.get('vendor')?.before === beforeReasonFailure.vendor &&
    auditedFields.get('vendor')?.after === 'Corrected supplier' &&
    auditedFields.get('category')?.before === beforeReasonFailure.category &&
    auditedFields.get('category')?.after === 'Kitchen' &&
    auditedFields.get('notes')?.before === beforeReasonFailure.notes &&
    auditedFields.get('notes')?.after === 'Verified against paper receipt',
  'correction audit records before/after values for every changed field',
);
ok(!as(M, 'cancelVoucher', { id: id1, reason: '' }).ok, 'cancel needs reason');
const cancelledVoucher = as(M, 'cancelVoucher', { id: id1, reason: 'Duplicate entry' });
ok(cancelledVoucher.data.status === 'CANCELLED', 'manager cancel');
const cancelAuditRow = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'CANCEL' && row[3] === '#201');
const cancelAuditDetails = cancelAuditRow ? JSON.parse(cancelAuditRow[4]) : null;
ok(
  cancelAuditDetails?.eventType === 'VOUCHER_CANCELLED' &&
    cancelAuditDetails.reason === 'Duplicate entry' &&
    cancelAuditDetails.changes.some(
      (change) =>
        change.field === 'status' && change.before === 'ACTIVE' && change.after === 'CANCELLED',
    ),
  'cancellation audit records reason and old/new status',
);
ok(!as(M, 'updateVoucher', { id: id1, fields: { amount: 2 } }).ok, 'cancelled not editable');
// receipts
const id2 = r.data.created[1].id;
const receiptAdded = as(S, 'addReceipt', {
  id: id2,
  receipt: { mime: 'image/png', data: tiny },
});
ok(receiptAdded.data.receipts.length === 1, 'staff adds receipt to own');
const receiptAuditRow = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'RECEIPT_ADD' && row[3] === '#202');
const receiptAuditDetails = receiptAuditRow ? JSON.parse(receiptAuditRow[4]) : null;
ok(
  receiptAuditDetails?.eventType === 'VOUCHER_RECEIPT_ATTACHED' &&
    receiptAuditDetails.changes.some(
      (change) => change.field === 'receiptCount' && change.before === 0 && change.after === 1,
    ),
  'receipt audit records the old/new attachment count',
);
ok(
  !as(S, 'addReceipt', { id: mv.data.created[0].id, receipt: { mime: 'image/png', data: tiny } })
    .ok,
  "staff cannot add to others'",
);
const fid = as(S, 'bootstrap').data.vouchers.find((v) => v.id === id2).receipts[0];
ok(
  as(S, 'getReceipt', { id: id2, fileId: fid }).data.dataUrl.startsWith('data:image/png;base64,'),
  'own receipt readable',
);
ok(
  !as(S, 'getReceipt', { id: mv.data.created[0].id, fileId: fid }).ok,
  "cannot read others' receipt",
);
// vendors + settings
ok(
  as(M, 'saveVendor', { name: 'Ram Traders', mobile: '9999999999' }).ok &&
    !as(M, 'saveVendor', { name: 'ram traders' }).ok,
  'vendor unique',
);
const ramVendor = as(M, 'bootstrap').data.vendors.find((vendor) => vendor.name === 'Ram Traders');
const vendorCreateAudit = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'VENDOR_CREATE' && row[3] === ramVendor.id);
const vendorCreateDetails = vendorCreateAudit ? JSON.parse(vendorCreateAudit[4]) : null;
ok(
  vendorCreateDetails?.eventType === 'VENDOR_CREATED' &&
    vendorCreateDetails.changes.some(
      (change) =>
        change.field === 'name' && change.before === null && change.after === 'Ram Traders',
    ),
  'vendor creation audit records structured initial values',
);
ok(
  as(M, 'saveVendor', {
    id: ramVendor.id,
    name: 'Ram Traders',
    company: 'Fort Supplies',
    mobile: '9999999999',
  }).ok,
  'vendor details can be updated',
);
const vendorUpdateAudit = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'VENDOR_UPDATE' && row[3] === ramVendor.id);
const vendorUpdateDetails = vendorUpdateAudit ? JSON.parse(vendorUpdateAudit[4]) : null;
ok(
  vendorUpdateDetails?.changes.some(
    (change) =>
      change.field === 'company' && change.before === '' && change.after === 'Fort Supplies',
  ),
  'vendor update audit records old/new company values',
);
ok(as(M, 'toggleVendor', { id: ramVendor.id }).ok, 'vendor can be deactivated');
const vendorToggleAudit = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'VENDOR_OFF' && row[3] === ramVendor.id);
const vendorToggleDetails = vendorToggleAudit ? JSON.parse(vendorToggleAudit[4]) : null;
ok(
  vendorToggleDetails?.changes.some(
    (change) => change.field === 'active' && change.before === true && change.after === false,
  ),
  'vendor activation audit records old/new status',
);
ok(as(M, 'toggleVendor', { id: ramVendor.id }).ok, 'vendor can be reactivated');
ok(!as(M, 'saveSettings', {}).ok, 'manager cannot change settings');
ok(
  !as(T, 'saveSettings', { propertyName: 'P', categories: ['A'], nextVoucherNo: 100 }).ok,
  'next no must exceed max',
);
ok(
  as(T, 'saveSettings', {
    propertyName: 'Hotel X',
    propertyAddress: 'Addr',
    categories: ['A', 'B'],
    nextVoucherNo: nextPaymentNumber(),
    nextReceiptNo: nextReceiptNumber(),
  }).ok,
  'owner settings',
);
const settingsAuditRow = [...g.sheets.AuditLog.rows].reverse().find((row) => row[2] === 'SETTINGS');
const settingsAuditDetails = settingsAuditRow ? JSON.parse(settingsAuditRow[4]) : null;
ok(
  settingsAuditDetails?.eventType === 'PROPERTY_SETTINGS_UPDATED' &&
    settingsAuditDetails.changes.some(
      (change) =>
        change.field === 'propertyName' &&
        change.before === 'My Property' &&
        change.after === 'Hotel X',
    ),
  'settings audit records prior and saved property values',
);
ok(as(T, 'bootstrap').data.settings.categories.includes('Other'), 'Other auto-added');
// strict numeric validation
ok(
  !as(T, 'saveSettings', {
    propertyName: 'Hotel X',
    categories: ['A'],
    nextVoucherNo: '400abc',
    nextReceiptNo: '3',
  }).ok,
  'malformed voucher number rejected',
);
ok(
  !as(T, 'createVouchers', {
    entries: [{ date: today, vendor: 'Bad Amount', amount: '10abc' }],
  }).ok,
  'malformed amount rejected',
);

// persistence/schema integrity
g.sheets.Vouchers.rows[0][1] = 'BrokenVoucherNo';
const schemaFailure = as(T, 'bootstrap');
ok(schemaFailure.code === 'SCHEMA', 'invalid sheet schema rejected');
g.sheets.Vouchers.rows[0][1] = 'VoucherNo';
const maxVoucher = as(T, 'bootstrap').data.vouchers.reduce((m, v) => Math.max(m, v.no), 0);
ok(maxVoucher > 0, 'voucher data readable after schema repair');
const voucherCounter = g.sheets.Settings.rows.find((row) => row[0] === 'nextVoucherNo');
voucherCounter[1] = '1';
const reconciled = as(T, 'createVouchers', {
  entries: [{ date: today, vendor: 'Counter Recovery', amount: 10 }],
});
ok(
  reconciled.ok && reconciled.data.created[0].no > maxVoucher,
  'voucher numbering reconciles with existing data',
);

// last owner guard
const me = as(T, 'listUsers').data.find((u) => u.role === 'owner');
ok(
  !as(T, 'saveUser', { id: me.id, name: 'Owner', email: 'owner@test.com', role: 'manager' }).ok,
  'cannot demote last owner',
);
const newAuditUser = as(T, 'saveUser', {
  name: 'Audit Agent',
  email: 'audit-agent@test.com',
  role: 'staff',
  pin: '258369',
});
ok(newAuditUser.ok, 'owner can create a user with a temporary PIN');
const userCreateAudit = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'USER_CREATE' && row[3] === 'audit-agent@test.com');
const userCreateDetails = userCreateAudit ? JSON.parse(userCreateAudit[4]) : null;
ok(
  userCreateDetails?.eventType === 'USER_CREATED' &&
    userCreateDetails.changes.some(
      (change) => change.field === 'role' && change.before === null && change.after === 'staff',
    ) &&
    !userCreateAudit[4].includes('258369'),
  'user creation audit records role without exposing temporary PIN',
);
// disable user kills session
const sm = as(T, 'listUsers').data.find((u) => u.email === 's@test.com');
ok(
  as(T, 'saveUser', { id: sm.id, name: sm.name, email: sm.email, role: 'staff', active: false }).ok,
  'disable staff',
);
ok(as(S, 'bootstrap').code === 'SESSION', 'disabled user session dead');
const userUpdateAudit = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'USER_UPDATE' && row[3] === sm.email);
const userUpdateDetails = userUpdateAudit ? JSON.parse(userUpdateAudit[4]) : null;
ok(
  userUpdateDetails?.changes.some(
    (change) => change.field === 'active' && change.before === true && change.after === false,
  ),
  'user status audit records old/new active state',
);
const auditPage = as(T, 'auditLog');
ok(
  auditPage.ok &&
    Array.isArray(auditPage.data.rows) &&
    auditPage.data.rows.length <= 200 &&
    auditPage.data.totalCount > 10,
  'audit log returns a bounded page and total record count',
);
const auditRowsBeforeFixture = g.sheets.AuditLog.rows.length;
for (let i = 0; i < 205; i++) {
  g.sheets.AuditLog.rows.push([
    '2026-10-13T10:00:00',
    'owner@test.com',
    'AUDIT_PAGE_FIXTURE',
    '#' + i,
    'fixture row ' + i,
  ]);
}
const firstAuditPage = as(T, 'auditLog');
ok(
  firstAuditPage.ok &&
    firstAuditPage.data.rows.length === 200 &&
    firstAuditPage.data.nextBeforeRow !== null &&
    firstAuditPage.data.rows[0].action === 'AUDIT_PAGE_FIXTURE' &&
    firstAuditPage.data.rows[0].target === '#204',
  'audit cursor returns newest 200 rows and a continuation cursor',
);
const olderAuditPage = as(T, 'auditLog', { beforeRow: firstAuditPage.data.nextBeforeRow });
ok(olderAuditPage.ok, 'older audit cursor request succeeds');
ok(olderAuditPage.data.rows.length > 0, 'older audit cursor returns a nonempty preceding page');
ok(
  olderAuditPage.data.rows.some(
    (row) => row.action === 'AUDIT_PAGE_FIXTURE' && row.target === '#4',
  ),
  'older audit cursor returns the boundary fixture immediately before the newest page',
);
ok(
  !olderAuditPage.data.rows.some(
    (row) => row.action === 'AUDIT_PAGE_FIXTURE' && row.target === '#204',
  ),
  'older audit cursor does not repeat fixture rows from the newest page',
);
ok(
  as(T, 'auditLog', { beforeRow: 'not-a-cursor' }).code === 'VALIDATION' &&
    as(T, 'auditLog', { beforeRow: firstAuditPage.data.totalCount + 100 }).code === 'VALIDATION',
  'audit API rejects malformed and out-of-range cursors',
);
g.sheets.AuditLog.rows.splice(auditRowsBeforeFixture);
// cash received
const receiptNumberStart = Number(as(T, 'bootstrap').data.settings.nextReceiptNo);
const rc = as(T, 'createVouchers', {
  entries: [
    {
      type: 'RECEIPT',
      date: today,
      vendor: 'Guest Room 5',
      amount: 5000,
      category: 'Room Advance',
    },
    { type: 'RECEIPT', date: today, vendor: 'X', amount: 100, category: 'NotACategory' },
  ],
});
ok(
  rc.ok &&
    rc.data.created[0].type === 'RECEIPT' &&
    rc.data.created[0].no === receiptNumberStart &&
    rc.data.created[1].no === receiptNumberStart + 1,
  'receipts use their independent increasing number series',
);
ok(rc.data.created[1].category === 'Other', 'unknown receipt category falls back to Other');
const bs = as(T, 'bootstrap').data;
ok(bs.settings.nextReceiptNo === receiptNumberStart + 2, 'next receipt no advances');
ok(
  as(T, 'saveSettings', {
    propertyName: 'Hotel X',
    categories: ['A', 'B'],
    nextVoucherNo: nextPaymentNumber(),
    nextReceiptNo: nextReceiptNumber(),
    openingBalance: 2500,
  }).ok && as(T, 'bootstrap').data.settings.openingBalance === 2500,
  'opening balance saved',
);
ok(
  as(T, 'createVouchers', { entries: [{ date: today, vendor: 'Pay', amount: 1 }] }).data.created[0]
    .no >= 300 && as(T, 'bootstrap').data.vouchers.filter((v) => v.type === 'RECEIPT').length === 3,
  'payment series unaffected by receipts',
);
ok(
  !as(T, 'saveSettings', {
    propertyName: 'P',
    categories: ['A'],
    nextVoucherNo: 9999,
    nextReceiptNo: 2,
  }).ok,
  'receipt no must exceed existing max',
);
// Sheets may auto-convert text to Date objects: backend must still return strings
g.sheets.Vouchers.rows[1][9] = new Date('2026-10-06T08:00:00Z');
ok(
  /^2026-10-06T/.test(as(T, 'bootstrap').data.vouchers.find((v) => v.no === 201).createdAt),
  'Date object in CreatedAt is normalised to a string',
);
// lockout
for (let i = 0; i < 5; i++) g.call('login', { email: 'm@test.com', pin: '000000' });
ok(
  g.call('login', { email: 'm@test.com', pin: '864209' }).code === 'LOCKED',
  'lockout after 5 fails',
);
const resetPinWaits = g.lockStats.waits;
const resetPinReleases = g.lockStats.releases;
ok(
  as(T, 'resetPin', {
    id: managerUserId,
    pin: '314159',
  }).ok,
  'owner reset pin succeeds',
);
const pinResetAudit = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'PIN_RESET' && row[3] === 'm@test.com');
const pinResetDetails = pinResetAudit ? JSON.parse(pinResetAudit[4]) : null;
ok(
  pinResetDetails?.eventType === 'USER_PIN_RESET' &&
    pinResetDetails.changes.some(
      (change) =>
        change.field === 'mustChangePin' && change.before === false && change.after === true,
    ) &&
    !pinResetAudit[4].includes('314159'),
  'PIN reset audit records account state without logging credential material',
);
ok(
  g.lockStats.waits === resetPinWaits + 1 && g.lockStats.releases === resetPinReleases + 1,
  'PIN reset and throttle clearing run under the shared script lock',
);
const resetLogin = g.call('login', { email: 'm@test.com', pin: '314159' });
ok(resetLogin.ok, 'owner reset pin clears login lockout');
const resetChange = as(resetLogin.data.token, 'changePin', {
  oldPin: '314159',
  newPin: '417258',
});
ok(
  resetChange.ok && as(resetChange.data.token, 'bootstrap').ok,
  'owner PIN reset also clears PIN-change throttle',
);
ok(g.lockStats.waits === g.lockStats.releases, 'all acquired script locks are released');
// owner-only data-quality report: scan source records, do not infer accounting treatment
ok(as(A, 'dataQualityReport').code === 'FORBIDDEN', 'staff cannot read data-quality report');
ok(
  as(resetChange.data.token, 'dataQualityReport').code === 'FORBIDDEN',
  'manager cannot read owner data-quality report',
);

const dataQualityRow = [
  'dq-test-id',
  '201',
  today,
  '',
  0,
  '',
  '',
  'BROKEN',
  '',
  '',
  '',
  '',
  '',
  '',
  'c1',
  'PAYMENT',
];
g.sheets.Vouchers.rows.push(dataQualityRow);
const dqReport = as(T, 'dataQualityReport').data;
const dqCodes = dqReport.issues.map((issue) => issue.code);

ok(
  dqReport.scanned === g.sheets.Vouchers.rows.length - 1,
  'data-quality report scans source voucher rows',
);
ok(
  dqCodes.includes('VOUCHER_NUMBER_DUPLICATE'),
  'data-quality report finds duplicate voucher numbers',
);
ok(dqCodes.includes('VENDOR_MISSING'), 'data-quality report finds missing vendor');
ok(dqCodes.includes('AMOUNT_INVALID'), 'data-quality report finds invalid amount');
ok(dqCodes.includes('CATEGORY_MISSING'), 'data-quality report finds missing category');
ok(dqCodes.includes('STATUS_INVALID'), 'data-quality report finds unknown status');
ok(dqCodes.includes('CLIENT_ID_DUPLICATE'), 'data-quality report finds duplicate client IDs');
ok(
  dqReport.issueCount >= dqReport.issues.length,
  'data-quality report exposes total and capped issue list',
);
g.sheets.Vouchers.rows.pop();

// Recorded movement report: permission, validation and totals.
ok(
  as(A, 'recordedMovementReport', { from: today, to: today }).code === 'FORBIDDEN',
  'staff denied all-voucher movement report',
);
const movement = as(T, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'ALL',
  status: 'ALL',
});
ok(movement.ok, 'owner reads date-scoped movement report');
ok(movement.data.count === movement.data.items.length, 'report count matches source rows');
ok(
  movement.data.paymentTotal >= movement.data.activePaymentTotal,
  'payment total includes cancelled rows when selected',
);
ok(
  movement.data.receiptTotal >= movement.data.activeReceiptTotal,
  'receipt total includes cancelled rows when selected',
);
ok(
  as(T, 'recordedMovementReport', { from: today, to: today, type: 'INVALID', status: 'ALL' })
    .code === 'VALIDATION',
  'invalid report type rejected',
);
ok(
  as(T, 'recordedMovementReport', {
    from: '2026-12-31',
    to: today,
    type: 'ALL',
    status: 'ALL',
  }).code === 'VALIDATION',
  'reversed reporting dates rejected',
);
ok(
  as(T, 'recordedMovementReport', { from: today, to: today, type: 'ALL', status: 'INVALID' })
    .code === 'VALIDATION',
  'invalid report status rejected',
);
// Backup integrity report is owner-only.
ok(as(A, 'backupIntegrityReport').code === 'FORBIDDEN', 'staff cannot inspect backup contents');
ok(
  as(resetChange.data.token, 'backupIntegrityReport').code === 'FORBIDDEN',
  'manager cannot inspect backup contents',
);
// Daily Cash Close MVP regression suite.
ok(
  as(A, 'cashClosePreview', { date: '2020-01-01' }).code === 'FORBIDDEN',
  'staff cannot preview daily cash close',
);
ok(
  as(resetChange.data.token, 'cashClosePreview', { date: '2020-01-01' }).ok,
  'manager can preview daily cash close',
);
const initialPreview = as(T, 'cashClosePreview', { date: '2020-01-01' });
ok(
  initialPreview.ok && initialPreview.data.requiresManualOpening,
  'first close requires explicit opening',
);
const missingOpeningReason = as(T, 'createCashClose', {
  date: '2020-01-01',
  openingCash: '80',
  countedCash: '100',
  varianceReason: 'Count differs',
  requestId: 'cc-missing-open-reason',
});
ok(
  !missingOpeningReason.ok && missingOpeningReason.code === 'VALIDATION',
  'manual opening needs a reason',
);
const missingVarianceReason = as(T, 'createCashClose', {
  date: '2020-01-01',
  openingCash: '80',
  openingReason: 'Initial opening count',
  countedCash: '100',
  requestId: 'cc-missing-variance-reason',
});
ok(
  !missingVarianceReason.ok && missingVarianceReason.code === 'VALIDATION',
  'non-zero variance needs a reason',
);
const firstInput = {
  date: '2020-01-01',
  openingCash: '80',
  openingReason: 'Initial opening cash count',
  countedCash: '100',
  varianceReason: 'Initial count differs from expected',
  requestId: 'cc-2020-01-01-1',
};
const firstClose = as(T, 'createCashClose', firstInput);
ok(
  firstClose.ok && firstClose.data.expectedCash === 80 && firstClose.data.variance === 20,
  'first close calculates manual opening and variance',
);
const retryClose = as(T, 'createCashClose', firstInput);
ok(
  retryClose.ok && retryClose.data.id === firstClose.data.id,
  'retry with same ID returns same close',
);
ok(
  !as(T, 'createCashClose', { ...firstInput, requestId: 'cc-2020-01-01-2' }).ok,
  'duplicate date close cannot overwrite',
);
const dayTwoPreview = as(T, 'cashClosePreview', { date: '2020-01-02' });
ok(
  dayTwoPreview.ok &&
    dayTwoPreview.data.openingCash === 100 &&
    dayTwoPreview.data.openingSource === 'PREVIOUS_CLOSE',
  'previous counted cash carries forward',
);
const dayTwo = as(T, 'createCashClose', {
  date: '2020-01-02',
  countedCash: '100',
  requestId: 'cc-day-two',
});
ok(
  dayTwo.ok && dayTwo.data.variance === 0,
  'zero-variance carried-forward close saves without variance reason',
);
const cashCloseReceipt = as(T, 'createVouchers', {
  entries: [
    {
      type: 'RECEIPT',
      date: '2020-01-03',
      vendor: 'Close receipt',
      amount: 50,
      category: 'Other',
      cashImpact: 'CASH_IN',
    },
  ],
});
ok(cashCloseReceipt.ok, 'receipt allowed on open date');
const cashClosePay = as(T, 'createVouchers', {
  entries: [
    {
      type: 'PAYMENT',
      date: '2020-01-03',
      vendor: 'Close payment',
      amount: 12.5,
      category: 'Other',
      cashImpact: 'CASH_OUT',
    },
  ],
});
ok(cashClosePay.ok, 'payment allowed on open date');
const cashCloseNonCash = as(T, 'createVouchers', {
  entries: [
    {
      type: 'RECEIPT',
      date: '2020-01-03',
      vendor: 'Close noncash',
      amount: 30,
      category: 'Other',
      cashImpact: 'NO_CASH',
    },
  ],
});
ok(cashCloseNonCash.ok, 'no-cash voucher allowed');
const unclassifiedRowIndex = g.sheets.Vouchers.rows.findIndex(
  (row) => row[0] === cashClosePay.data.created[0].id,
);
g.sheets.Vouchers.rows[unclassifiedRowIndex][16] = '';
const blockedPreview = as(T, 'cashClosePreview', { date: '2020-01-03' });
ok(
  blockedPreview.ok && blockedPreview.data.unclassified.length === 1,
  'active legacy UNCLASSIFIED voucher appears as blocker',
);
const blockedClose = as(T, 'createCashClose', {
  date: '2020-01-03',
  countedCash: '137.50',
  requestId: 'cc-unclassified-block',
});
ok(
  !blockedClose.ok && blockedClose.code === 'CASH_CLOSE_UNCLASSIFIED',
  'finalization blocks active UNCLASSIFIED vouchers',
);
g.sheets.Vouchers.rows[unclassifiedRowIndex][16] = 'CASH_OUT';
const readyPreview = as(T, 'cashClosePreview', { date: '2020-01-03' });
ok(
  readyPreview.ok &&
    readyPreview.data.cashInTotal === 50 &&
    readyPreview.data.cashOutTotal === 12.5 &&
    readyPreview.data.noCashCount === 1 &&
    readyPreview.data.expectedCash === 137.5,
  'explicit cash impact determines expected drawer cash',
);
const dayThree = as(T, 'createCashClose', {
  date: '2020-01-03',
  countedCash: '137.50',
  requestId: 'cc-day-three',
});
ok(
  dayThree.ok && dayThree.data.includedVoucherCount === 3,
  'saved close includes voucher snapshot',
);
const cashCloseAuditRow = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'CASH_CLOSE' && row[3] === '2020-01-03');
const cashCloseAuditDetails = cashCloseAuditRow ? JSON.parse(cashCloseAuditRow[4]) : null;
ok(
  cashCloseAuditDetails?.eventType === 'DAILY_CASH_CLOSE_FINALIZED' &&
    cashCloseAuditDetails.changes.some(
      (change) =>
        change.field === 'expectedCash' && change.before === null && change.after === 137.5,
    ),
  'daily close audit records expected cash and a structured event identity',
);
const dayFive = as(T, 'createCashClose', {
  date: '2020-01-05',
  openingCash: '137.50',
  openingReason: 'Gap day opening confirmed',
  countedCash: '137.50',
  requestId: 'cc-day-five',
});
ok(dayFive.ok, 'a later date can be closed with an explicit opening after a gap');
const earlierPreview = as(T, 'cashClosePreview', { date: '2020-01-04' });
ok(
  earlierPreview.ok &&
    earlierPreview.data.blockedByLaterClose &&
    earlierPreview.data.laterCloseDate === '2020-01-05' &&
    !earlierPreview.data.readyToClose,
  'preview blocks an earlier date after a later close exists',
);
const outOfOrderClose = as(T, 'createCashClose', {
  date: '2020-01-04',
  countedCash: '137.50',
  requestId: 'cc-out-of-order',
});
ok(
  !outOfOrderClose.ok && outOfOrderClose.code === 'CASH_CLOSE_OUT_OF_ORDER',
  'server rejects out-of-order close finalization',
);
ok(
  as(T, 'updateVoucher', {
    id: cashCloseReceipt.data.created[0].id,
    fields: { vendor: 'Modified' },
    reason: 'Test a closed period edit',
  }).code === 'CASH_PERIOD_CLOSED',
  'voucher edit in closed date rejected',
);
ok(
  as(T, 'cancelVoucher', {
    id: cashCloseReceipt.data.created[0].id,
    reason: 'Test closed period cancel',
  }).code === 'CASH_PERIOD_CLOSED',
  'voucher cancellation in closed date rejected',
);
ok(
  as(T, 'addReceipt', {
    id: cashCloseReceipt.data.created[0].id,
    receipt: { mime: 'image/png', data: 'AA==' },
  }).code === 'CASH_PERIOD_CLOSED',
  'receipt attachments cannot mutate a closed voucher',
);
ok(
  !as(T, 'createVouchers', {
    entries: [
      {
        type: 'RECEIPT',
        date: '2020-01-03',
        vendor: 'Late voucher',
        amount: 1,
        category: 'Other',
        cashImpact: 'CASH_IN',
      },
    ],
  }).ok,
  'new voucher for a closed date rejected',
);
const invalidCorrection = as(T, 'recordCashCloseCorrection', {
  closeId: dayThree.data.id,
  type: 'VOUCHER',
  voucherId: 'outside-snapshot',
  details: 'Bad link',
  reason: 'Must be from saved close',
});
ok(
  !invalidCorrection.ok && invalidCorrection.code === 'VALIDATION',
  'correction linked voucher must belong to snapshot',
);
const recordedCloseCorrection = as(T, 'recordCashCloseCorrection', {
  closeId: dayThree.data.id,
  type: 'CASH_COUNT',
  details: 'Physical count checked again',
  reason: 'Owner documented follow-up',
});
ok(
  recordedCloseCorrection.ok && recordedCloseCorrection.data.createdBy === 'owner@test.com',
  'correction note has actor attribution',
);
const closeCorrectionAuditRow = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'CASH_CLOSE_CORRECTION');
const closeCorrectionAuditDetails = closeCorrectionAuditRow
  ? JSON.parse(closeCorrectionAuditRow[4])
  : null;
ok(
  closeCorrectionAuditDetails?.eventType === 'CASH_CLOSE_CORRECTION_RECORDED' &&
    closeCorrectionAuditDetails.reason === 'Owner documented follow-up' &&
    closeCorrectionAuditDetails.changes.some(
      (change) => change.field === 'details' && change.after === 'Physical count checked again',
    ),
  'close correction audit preserves reason and structured note details',
);
const afterCorrection = as(T, 'cashClosePreview', { date: '2020-01-03' });
ok(
  afterCorrection.ok &&
    afterCorrection.data.close.variance === dayThree.data.variance &&
    afterCorrection.data.close.corrections.length === 1,
  'correction does not rewrite close total',
);

// Malformed saved close data must fail closed without being filtered.
const closeSheet = g.sheets.CashCloses;
const closeHeaders = closeSheet.rows[0];
const closeColumn = (name) => closeHeaders.indexOf(name);
const dayThreeRow = closeSheet.rows.find((row) => row[closeColumn('CloseID')] === dayThree.data.id);
ok(!!dayThreeRow, 'saved cash-close row is available for integrity regressions');
const originalCloseFields = {
  IncludedVouchers: dayThreeRow[closeColumn('IncludedVouchers')],
  IncludedVoucherIds: dayThreeRow[closeColumn('IncludedVoucherIds')],
  IncludedVoucherCount: dayThreeRow[closeColumn('IncludedVoucherCount')],
};
const savedVoucherSnapshot = JSON.parse(originalCloseFields.IncludedVouchers);
const savedVoucherIds = JSON.parse(originalCloseFields.IncludedVoucherIds);
function assertCorruptCashClose(changes, message) {
  const originals = {};
  Object.keys(changes).forEach((field) => {
    originals[field] = dayThreeRow[closeColumn(field)];
    dayThreeRow[closeColumn(field)] = changes[field];
  });
  let result;
  try {
    result = as(T, 'cashClosePreview', { date: '2020-01-03' });
  } finally {
    Object.keys(originals).forEach((field) => {
      dayThreeRow[closeColumn(field)] = originals[field];
    });
  }
  ok(!result.ok && result.code === 'CASH_CLOSE_DATA', message);
}
const incompleteSnapshot = [...savedVoucherSnapshot, { id: 'incomplete-snapshot-row' }];
assertCorruptCashClose(
  {
    IncludedVouchers: JSON.stringify(incompleteSnapshot),
    IncludedVoucherIds: JSON.stringify([...savedVoucherIds, 'incomplete-snapshot-row']),
    IncludedVoucherCount: savedVoucherSnapshot.length + 1,
  },
  'saved close rejects an incomplete voucher row instead of silently filtering it',
);
assertCorruptCashClose(
  { IncludedVoucherIds: JSON.stringify([...savedVoucherIds.slice(0, -1), null]) },
  'saved close rejects non-string voucher IDs instead of silently filtering them',
);
const mismatchedVoucherIds = savedVoucherIds.slice();
mismatchedVoucherIds[0] = 'mismatched-id';
assertCorruptCashClose(
  { IncludedVoucherIds: JSON.stringify(mismatchedVoucherIds) },
  'saved close rejects voucher-ID lists that do not match snapshot order and identity',
);
assertCorruptCashClose(
  { IncludedVoucherCount: savedVoucherSnapshot.length + 1 },
  'saved close rejects a stored voucher count that differs from its snapshot',
);
const duplicateSnapshot = [...savedVoucherSnapshot];
duplicateSnapshot[1] = { ...duplicateSnapshot[0] };
assertCorruptCashClose(
  {
    IncludedVouchers: JSON.stringify(duplicateSnapshot),
    IncludedVoucherIds: JSON.stringify(duplicateSnapshot.map((item) => item.id)),
  },
  'saved close rejects duplicate voucher IDs in an otherwise shape-valid snapshot',
);

const futureClose = as(T, 'cashClosePreview', { date: '2999-01-01' });
ok(!futureClose.ok && futureClose.code === 'VALIDATION', 'future close date rejected');

// Slice 4: report-only accountant access and stable VendorID export.
const savedAccountant = as(T, 'saveUser', {
  name: 'Nina Accountant',
  email: 'accountant@test.com',
  role: 'accountant',
  pin: '864209',
});
ok(savedAccountant.ok, 'owner can create an accountant role');
const accountantLogin = g.call('login', {
  email: 'accountant@test.com',
  pin: '864209',
});
ok(
  accountantLogin.ok && accountantLogin.data.user.mustChangePin,
  'new accountant account requires a PIN change at first login',
);
const accountantPinChange = as(accountantLogin.data.token, 'changePin', {
  oldPin: '864209',
  newPin: '975318',
});
const accountantToken = accountantPinChange.data.token;
const accountantBootstrap = as(accountantToken, 'bootstrap').data;
ok(
  accountantPinChange.ok &&
    accountantBootstrap.vouchers.length === 0 &&
    accountantBootstrap.vendors.length === 0 &&
    accountantBootstrap.user.perms.reports === 1 &&
    !accountantBootstrap.user.perms.viewAll &&
    !accountantBootstrap.user.perms.create &&
    !accountantBootstrap.user.perms.edit &&
    !accountantBootstrap.user.perms.cashClose,
  'accountant bootstrap exposes read-only report permission without voucher register, vendor contacts or write/close rights',
);
ok(
  as(accountantToken, 'recordedMovementReport', {
    from: today,
    to: today,
    type: 'ALL',
    status: 'ALL',
  }).ok,
  'accountant can access the server-authorized recorded movement report',
);
ok(
  as(accountantToken, 'cashClosePreview', { date: today }).code === 'FORBIDDEN' &&
    as(accountantToken, 'createVouchers', {
      entries: [{ date: today, vendor: 'Accountant must not write', amount: 1 }],
    }).code === 'FORBIDDEN' &&
    as(accountantToken, 'saveVendor', { name: 'Accountant must not create a vendor' }).code ===
      'FORBIDDEN',
  'accountant cannot finalize cash close, create vouchers, or change vendor master data',
);
const accountantVendorSave = as(T, 'saveVendor', {
  name: 'Accountant Export Vendor',
  company: 'Export Test',
  mobile: '',
});
const accountantVendorRow = g.sheets.Vendors.rows.find(
  (row) => row[1] === 'Accountant Export Vendor',
);
const accountantVendorId = accountantVendorRow && accountantVendorRow[0];
ok(
  accountantVendorSave.ok && typeof accountantVendorId === 'string' && accountantVendorId,
  'vendor master assigns a stable VendorID',
);
const linkedVendorVoucher = as(T, 'createVouchers', {
  entries: [
    {
      clientId: 'accountant-vendor-id-export',
      date: today,
      vendor: 'Accountant Export Vendor',
      amount: 325,
      category: 'Other',
      type: 'PAYMENT',
    },
  ],
});
ok(
  linkedVendorVoucher.ok && linkedVendorVoucher.data.created[0].vendorId === accountantVendorId,
  'new voucher stores the unique known VendorID',
);
const accountantReportWithVendor = as(accountantToken, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ALL',
});
const linkedVendorReportRow = accountantReportWithVendor.data.items.find(
  (item) => item.id === linkedVendorVoucher.data.created[0].id,
);
ok(
  accountantReportWithVendor.ok &&
    linkedVendorReportRow &&
    linkedVendorReportRow.vendorId === accountantVendorId,
  'accountant report exports the stable VendorID for the matched voucher',
);
// Legacy report fallback must use prototype-safe lookup keys for user-controlled names.
const prototypeVendorSave = as(T, 'saveVendor', {
  name: '__proto__',
  company: 'Prototype Safety',
  mobile: '',
});
const prototypeVendorRow = g.sheets.Vendors.rows.find((row) => row[1] === '__proto__');
const prototypeVendorId = prototypeVendorRow && prototypeVendorRow[0];
const prototypeVendorVoucher = as(T, 'createVouchers', {
  entries: [
    {
      clientId: 'accountant-prototype-vendor-fallback',
      date: today,
      vendor: '__proto__',
      amount: 75,
      category: 'Other',
      type: 'PAYMENT',
    },
  ],
});
const prototypeVoucherRow = g.sheets.Vouchers.rows.find(
  (row) => row[0] === prototypeVendorVoucher.data.created[0].id,
);
prototypeVoucherRow[21] = '';
const prototypeVendorReport = as(accountantToken, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ALL',
});
const prototypeVendorReportRow = prototypeVendorReport.data.items.find(
  (item) => item.id === prototypeVendorVoucher.data.created[0].id,
);
ok(
  prototypeVendorSave.ok &&
    prototypeVendorVoucher.ok &&
    prototypeVendorReport.ok &&
    prototypeVendorReportRow &&
    prototypeVendorReportRow.vendorId === prototypeVendorId,
  'legacy VendorID fallback safely resolves prototype-sensitive exact vendor names',
);
const unmatchedVendorVoucher = as(T, 'createVouchers', {
  entries: [
    {
      clientId: 'accountant-vendor-id-unmatched',
      date: today,
      vendor: 'Unregistered Counterparty',
      amount: 125,
      category: 'Other',
      type: 'PAYMENT',
    },
  ],
});
const unmatchedVendorReport = as(accountantToken, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ALL',
});
const unmatchedVendorRow = unmatchedVendorReport.data.items.find(
  (item) => item.id === unmatchedVendorVoucher.data.created[0].id,
);
ok(
  unmatchedVendorVoucher.ok &&
    unmatchedVendorReport.ok &&
    unmatchedVendorRow &&
    unmatchedVendorRow.vendorId === '' &&
    unmatchedVendorReport.data.unmatchedVendorCount >= 1,
  'unknown/free-text counterparty exports a blank VendorID and is surfaced as an exception',
);

const duplicateVendorName = 'Duplicate Identity Vendor';
const duplicateVendorSave = as(T, 'saveVendor', {
  name: duplicateVendorName,
  company: 'Duplicate Test',
  mobile: '',
});
g.sheets.Vendors.rows.push([
  'duplicate-identity-vendor-id-2',
  duplicateVendorName,
  'Duplicate Test',
  '',
  true,
  'owner@test.com',
  new Date().toISOString(),
]);
const reportBeforeDuplicateVoucher = as(accountantToken, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ALL',
});
ok(
  duplicateVendorSave.ok &&
    reportBeforeDuplicateVoucher.ok &&
    reportBeforeDuplicateVoucher.data.ambiguousVendorCount === 0,
  'ambiguous vendor master names with no selected source voucher are not counted in the report',
);
const ambiguousVendorVoucher = as(T, 'createVouchers', {
  entries: [
    {
      clientId: 'accountant-ambiguous-vendor',
      date: today,
      vendor: duplicateVendorName,
      amount: 42,
      category: 'Other',
      type: 'PAYMENT',
    },
  ],
});
const ambiguousVendorReport = as(accountantToken, 'recordedMovementReport', {
  from: today,
  to: today,
  type: 'PAYMENT',
  status: 'ALL',
});
const ambiguousVendorReportRow = ambiguousVendorReport.data.items.find(
  (item) => item.id === ambiguousVendorVoucher.data.created[0].id,
);
ok(
  ambiguousVendorVoucher.ok &&
    ambiguousVendorReport.ok &&
    ambiguousVendorReportRow &&
    ambiguousVendorReportRow.vendorId === '' &&
    ambiguousVendorReport.data.ambiguousVendorCount === 1 &&
    ambiguousVendorReport.data.unmatchedVendorCount ===
      reportBeforeDuplicateVoucher.data.unmatchedVendorCount,
  'report counts selected ambiguous party rows separately from genuinely unmatched counterparties',
);

// Phase 2 integration: one high-value payment must remain consistent from entry
// through independent approval, report totals, final cash-close snapshot and audit.
const workflowDate = '2020-02-04';
// PIN reset rotates session salt; use the freshly authenticated manager token, not the pre-reset token.
const workflowManagerToken = resetChange.data.token;
const workflowEntry = as(workflowManagerToken, 'createVouchers', {
  entries: [
    {
      clientId: 'phase-2-cross-workflow-payment',
      date: workflowDate,
      vendor: 'Cross Workflow Integrity Vendor',
      amount: 10000,
      category: 'Other',
      type: 'PAYMENT',
      cashImpact: 'CASH_OUT',
    },
  ],
});
const workflowVoucher = workflowEntry.ok ? workflowEntry.data.created[0] : null;
ok(
  workflowEntry.ok && workflowVoucher?.approvalStatus === 'PENDING',
  'cross-workflow payment starts pending independent approval at the inclusive threshold',
);
const workflowPendingReport = as(T, 'recordedMovementReport', {
  from: workflowDate,
  to: workflowDate,
  type: 'PAYMENT',
  status: 'ACTIVE',
});
ok(
  workflowPendingReport.ok &&
    workflowPendingReport.data.items.some(
      (item) => item.id === workflowVoucher?.id && item.approvalStatus === 'PENDING',
    ) &&
    workflowPendingReport.data.activePaymentTotal === 0,
  'pending payment is visible in its report but excluded from approved active-payment totals',
);
const workflowApproval = as(T, 'approveVoucher', { id: workflowVoucher?.id });
ok(
  workflowApproval.ok &&
    workflowApproval.data.approvalStatus === 'APPROVED' &&
    workflowApproval.data.approvedBy.toLowerCase() === 'owner@test.com',
  'independent owner approval persists for the same cross-workflow payment',
);
const workflowApprovedReport = as(accountantToken, 'recordedMovementReport', {
  from: workflowDate,
  to: workflowDate,
  type: 'PAYMENT',
  status: 'ACTIVE',
});
ok(
  workflowApprovedReport.ok &&
    workflowApprovedReport.data.items.some(
      (item) => item.id === workflowVoucher?.id && item.approvalStatus === 'APPROVED',
    ) &&
    workflowApprovedReport.data.activePaymentTotal === 10000 &&
    workflowApprovedReport.data.pendingApprovalCount === 0,
  'accountant report includes the approved payment exactly once in active payment totals',
);
const workflowPreview = as(workflowManagerToken, 'cashClosePreview', {
  date: workflowDate,
  openingCash: '10000',
  openingReason: 'Integration test opening cash',
});
ok(
  workflowPreview.ok &&
    workflowPreview.data.pendingApprovals.length === 0 &&
    workflowPreview.data.cashOutTotal === 10000 &&
    workflowPreview.data.expectedCash === 0 &&
    workflowPreview.data.readyToClose,
  'approved payment flows into cash-close expected cash with no unresolved approval blocker',
);
const workflowClose = as(workflowManagerToken, 'createCashClose', {
  date: workflowDate,
  openingCash: '10000',
  openingReason: 'Integration test opening cash',
  countedCash: '0',
  requestId: 'phase-2-cross-workflow-close',
});
ok(
  workflowClose.ok &&
    workflowClose.data.expectedCash === 0 &&
    workflowClose.data.variance === 0 &&
    workflowClose.data.includedVoucherCount === 1,
  'cash close finalizes with a zero variance and snapshots the cross-workflow payment',
);
const workflowSavedClose = as(T, 'cashClosePreview', { date: workflowDate });
ok(
  workflowSavedClose.ok &&
    workflowSavedClose.data.closed &&
    workflowSavedClose.data.close.includedVouchers.some(
      (item) =>
        item.id === workflowVoucher.id &&
        item.no === 'P-' + workflowVoucher.no &&
        item.amount === 10000 &&
        item.cashImpact === 'CASH_OUT',
    ),
  'saved immutable close snapshot retains the exact approved voucher identity and cash impact',
);
const workflowApprovalAudit = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'PAYMENT_APPROVE' && row[3] === '#' + workflowVoucher.no);
const workflowCloseAudit = [...g.sheets.AuditLog.rows]
  .reverse()
  .find((row) => row[2] === 'CASH_CLOSE' && row[3] === workflowDate);
ok(
  !!workflowApprovalAudit &&
    !!workflowCloseAudit &&
    JSON.parse(workflowApprovalAudit[4]).entityId === workflowVoucher.id &&
    JSON.parse(workflowCloseAudit[4]).eventType === 'DAILY_CASH_CLOSE_FINALIZED',
  'approval and cash-close audit events remain linked to the same end-to-end financial journey',
);

// Audit-write observability: a failed audit append must not make a completed voucher
// appear unsaved, but the owner must be able to see the unresolved audit gap.
g.failNextAuditWrite();
const auditFailureVoucher = as(workflowManagerToken, 'createVouchers', {
  entries: [
    {
      clientId: 'audit-write-observability-regression',
      date: today,
      vendor: 'Audit Failure Injection Vendor',
      amount: 145,
      category: 'Other',
      type: 'PAYMENT',
      cashImpact: 'CASH_OUT',
    },
  ],
});
ok(
  auditFailureVoucher.ok &&
    auditFailureVoucher.data.created.length === 1 &&
    g.sheets.Vouchers.rows.some((row) => row[14] === 'audit-write-observability-regression'),
  'voucher creation remains successful when best-effort audit persistence fails after the financial write',
);
const auditFailureHealth = as(T, 'auditLog');
ok(
  auditFailureHealth.ok &&
    auditFailureHealth.data.auditHealth?.status === 'DEGRADED' &&
    auditFailureHealth.data.auditHealth.failureCount === 1 &&
    auditFailureHealth.data.auditHealth.lastFailureAt &&
    auditFailureHealth.data.auditHealth.lastFailureKind === 'EVENT_BATCH',
  'owner audit view exposes a durable degraded state and timestamp after an audit batch failure',
);
const auditFailureRetry = as(T, 'auditLog');
ok(
  auditFailureRetry.ok &&
    auditFailureRetry.data.auditHealth.status === 'DEGRADED' &&
    auditFailureRetry.data.auditHealth.failureCount === 1,
  'a later successful audit read does not silently clear an unresolved audit gap',
);

// Audit-marker durability boundary: when both the audit append and its Script Properties
// marker fail, the financial write is still successful and the owner status cannot detect the gap.
const auditMarkerOutageMock = create();
auditMarkerOutageMock.props.OWNER_EMAIL = 'marker-owner@test.com';
auditMarkerOutageMock.props.OWNER_PIN = '483921';
auditMarkerOutageMock.setup();
const markerLogin = auditMarkerOutageMock.call('login', {
  email: 'marker-owner@test.com',
  pin: '483921',
});
assert(markerLogin.ok, 'audit-marker outage fixture owner login succeeds');
const markerPinChange = auditMarkerOutageMock.call('changePin', {
  token: markerLogin.data.token,
  oldPin: '483921',
  newPin: '579246',
});
assert(markerPinChange.ok, 'audit-marker outage fixture completes required first PIN change');
auditMarkerOutageMock.failNextAuditWrite();
auditMarkerOutageMock.failNextAuditMarkerWrite();
const markerOutageVoucher = auditMarkerOutageMock.call('createVouchers', {
  token: markerPinChange.data.token,
  entries: [{
    clientId: 'audit-marker-outage-test',
    date: new Date().toISOString().slice(0, 10),
    vendor: 'Audit Marker Outage Vendor',
    amount: 146,
    category: 'Other',
    type: 'PAYMENT',
    cashImpact: 'CASH_OUT',
  }],
});
assert(
  markerOutageVoucher.ok &&
    auditMarkerOutageMock.sheets.Vouchers.rows.some((row) => row[14] === 'audit-marker-outage-test'),
  'voucher write remains successful and persisted when both audit append and marker persistence fail',
);
assert(
  !auditMarkerOutageMock.props.AUDIT_WRITE_STATUS &&
    auditMarkerOutageMock.auditDiagnostics.some((entry) => entry.includes('Could not persist audit-write failure marker')),
  'marker-storage failure emits a console diagnostic without pretending a durable marker exists',
);
const unavailableMarkerHealth = auditMarkerOutageMock.call('auditLog', {
  token: markerPinChange.data.token,
});
assert(
  unavailableMarkerHealth.ok &&
    unavailableMarkerHealth.data.auditHealth?.status === 'NO_KNOWN_FAILURE' &&
    unavailableMarkerHealth.data.auditHealth.failureCount === 0,
  'owner audit status makes the simultaneous marker-store failure limitation explicit in regression evidence',
);
n += 4;

console.log('backend OK — ' + n + ' checks passed');
