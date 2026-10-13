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
const busyPinAttempts = g.lockStats.attempts;
const busyPinWaits = g.lockStats.waits;
const busyPinReleases = g.lockStats.releases;
g.lockStats.failNextWait = true;
const busyPinChange = as(M, 'changePin', { oldPin: '000000', newPin: '864209' });
ok(
  !busyPinChange.ok &&
    busyPinChange.code === 'BUSY' &&
    !Object.prototype.hasOwnProperty.call(g.cache, 'pf:' + managerUserId),
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
  failedPinChanges.push(as(M, 'changePin', { oldPin: '000000', newPin: '864209' }));
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
  as(M, 'changePin', { oldPin: '864209', newPin: '112244' }).code === 'LOCKED',
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
ok(as(S, 'bootstrap').data.vouchers.length === 3, 'staff still sees only own after bulk');
ok(as(M, 'bootstrap').data.vouchers.length === 53, 'manager sees all');

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
ok(
  as(M, 'cancelVoucher', { id: id1, reason: 'Duplicate entry' }).data.status === 'CANCELLED',
  'manager cancel',
);
ok(!as(M, 'updateVoucher', { id: id1, fields: { amount: 2 } }).ok, 'cancelled not editable');
// receipts
const id2 = r.data.created[1].id;
ok(
  as(S, 'addReceipt', { id: id2, receipt: { mime: 'image/png', data: tiny } }).data.receipts
    .length === 1,
  'staff adds receipt to own',
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
    nextVoucherNo: 300,
  }).ok,
  'owner settings',
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
// disable user kills session
const sm = as(T, 'listUsers').data.find((u) => u.email === 's@test.com');
ok(
  as(T, 'saveUser', { id: sm.id, name: sm.name, email: sm.email, role: 'staff', active: false }).ok,
  'disable staff',
);
ok(as(S, 'bootstrap').code === 'SESSION', 'disabled user session dead');
ok(as(T, 'auditLog').data.length > 10, 'audit log written');
// cash received
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
    rc.data.created[0].no === 1 &&
    rc.data.created[1].no === 2,
  'receipts numbered 1,2 in their own series',
);
ok(rc.data.created[1].category === 'Other', 'unknown receipt category falls back to Other');
const bs = as(T, 'bootstrap').data;
ok(bs.settings.nextReceiptNo === 3, 'next receipt no advances');
ok(
  as(T, 'saveSettings', {
    propertyName: 'Hotel X',
    categories: ['A', 'B'],
    nextVoucherNo: 400,
    nextReceiptNo: 3,
    openingBalance: 2500,
  }).ok && as(T, 'bootstrap').data.settings.openingBalance === 2500,
  'opening balance saved',
);
ok(
  as(T, 'createVouchers', { entries: [{ date: today, vendor: 'Pay', amount: 1 }] }).data.created[0]
    .no >= 300 && as(T, 'bootstrap').data.vouchers.filter((v) => v.type === 'RECEIPT').length === 2,
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
ok(as(A, 'cashClosePreview', { date: '2020-01-01' }).code === 'FORBIDDEN', 'staff cannot preview daily cash close');
ok(as(M, 'cashClosePreview', { date: '2020-01-01' }).ok, 'manager can preview daily cash close');
const initialPreview = as(T, 'cashClosePreview', { date: '2020-01-01' });
ok(initialPreview.ok && initialPreview.data.requiresManualOpening, 'first close requires explicit opening');
const missingOpeningReason = as(T, 'createCashClose', { date: '2020-01-01', openingCash: '80', countedCash: '100', varianceReason: 'Count differs', requestId: 'cc-missing-open-reason' });
ok(!missingOpeningReason.ok && missingOpeningReason.code === 'VALIDATION', 'manual opening needs a reason');
const missingVarianceReason = as(T, 'createCashClose', { date: '2020-01-01', openingCash: '80', openingReason: 'Initial opening count', countedCash: '100', requestId: 'cc-missing-variance-reason' });
ok(!missingVarianceReason.ok && missingVarianceReason.code === 'VALIDATION', 'non-zero variance needs a reason');
const firstInput = { date: '2020-01-01', openingCash: '80', openingReason: 'Initial opening cash count', countedCash: '100', varianceReason: 'Initial count differs from expected', requestId: 'cc-2020-01-01-1' };
const firstClose = as(T, 'createCashClose', firstInput);
ok(firstClose.ok && firstClose.data.expectedCash === 80 && firstClose.data.variance === 20, 'first close calculates manual opening and variance');
const retryClose = as(T, 'createCashClose', firstInput);
ok(retryClose.ok && retryClose.data.id === firstClose.data.id, 'retry with same ID returns same close');
ok(!as(T, 'createCashClose', { ...firstInput, requestId: 'cc-2020-01-01-2' }).ok, 'duplicate date close cannot overwrite');
const dayTwoPreview = as(T, 'cashClosePreview', { date: '2020-01-02' });
ok(dayTwoPreview.ok && dayTwoPreview.data.openingCash === 100 && dayTwoPreview.data.openingSource === 'PREVIOUS_CLOSE', 'previous counted cash carries forward');
const dayTwo = as(T, 'createCashClose', { date: '2020-01-02', countedCash: '100', requestId: 'cc-day-two' });
ok(dayTwo.ok && dayTwo.data.variance === 0, 'zero-variance carried-forward close saves without variance reason');
const cashCloseReceipt = as(T, 'createVouchers', { entries: [{ type: 'RECEIPT', date: '2020-01-03', vendor: 'Close receipt', amount: 50, category: 'Other', cashImpact: 'CASH_IN' }] });
ok(cashCloseReceipt.ok, 'receipt allowed on open date');
const cashClosePay = as(T, 'createVouchers', { entries: [{ type: 'PAYMENT', date: '2020-01-03', vendor: 'Close payment', amount: 12.5, category: 'Other', cashImpact: 'CASH_OUT' }] });
ok(cashClosePay.ok, 'payment allowed on open date');
const cashCloseNonCash = as(T, 'createVouchers', { entries: [{ type: 'RECEIPT', date: '2020-01-03', vendor: 'Close noncash', amount: 30, category: 'Other', cashImpact: 'NO_CASH' }] });
ok(cashCloseNonCash.ok, 'no-cash voucher allowed');
const unclassifiedRowIndex = g.sheets.Vouchers.rows.findIndex((row) => row[0] === cashClosePay.data.created[0].id);
g.sheets.Vouchers.rows[unclassifiedRowIndex][16] = '';
const blockedPreview = as(T, 'cashClosePreview', { date: '2020-01-03' });
ok(blockedPreview.ok && blockedPreview.data.unclassified.length === 1, 'active legacy UNCLASSIFIED voucher appears as blocker');
const blockedClose = as(T, 'createCashClose', { date: '2020-01-03', countedCash: '137.50', requestId: 'cc-unclassified-block' });
ok(!blockedClose.ok && blockedClose.code === 'CASH_CLOSE_UNCLASSIFIED', 'finalization blocks active UNCLASSIFIED vouchers');
g.sheets.Vouchers.rows[unclassifiedRowIndex][16] = 'CASH_OUT';
const readyPreview = as(T, 'cashClosePreview', { date: '2020-01-03' });
ok(readyPreview.ok && readyPreview.data.cashInTotal === 50 && readyPreview.data.cashOutTotal === 12.5 && readyPreview.data.noCashCount === 1 && readyPreview.data.expectedCash === 137.5, 'explicit cash impact determines expected drawer cash');
const dayThree = as(T, 'createCashClose', { date: '2020-01-03', countedCash: '137.50', requestId: 'cc-day-three' });
ok(dayThree.ok && dayThree.data.includedVoucherCount === 3, 'saved close includes voucher snapshot');
ok(as(T, 'updateVoucher', { id: cashCloseReceipt.data.created[0].id, fields: { vendor: 'Modified' }, reason: 'Test a closed period edit' }).code === 'CASH_PERIOD_CLOSED', 'voucher edit in closed date rejected');
ok(as(T, 'cancelVoucher', { id: cashCloseReceipt.data.created[0].id, reason: 'Test closed period cancel' }).code === 'CASH_PERIOD_CLOSED', 'voucher cancellation in closed date rejected');
ok(as(T, 'addReceipt', { id: cashCloseReceipt.data.created[0].id, receipt: { mime: 'image/png', data: 'AA==' } }).code === 'CASH_PERIOD_CLOSED', 'receipt attachments cannot mutate a closed voucher');
ok(!as(T, 'createVouchers', { entries: [{ type: 'RECEIPT', date: '2020-01-03', vendor: 'Late voucher', amount: 1, category: 'Other', cashImpact: 'CASH_IN' }] }).ok, 'new voucher for a closed date rejected');
const invalidCorrection = as(T, 'recordCashCloseCorrection', { closeId: dayThree.data.id, type: 'VOUCHER', voucherId: 'outside-snapshot', details: 'Bad link', reason: 'Must be from saved close' });
ok(!invalidCorrection.ok && invalidCorrection.code === 'VALIDATION', 'correction linked voucher must belong to snapshot');
const recordedCloseCorrection = as(T, 'recordCashCloseCorrection', { closeId: dayThree.data.id, type: 'CASH_COUNT', details: 'Physical count checked again', reason: 'Owner documented follow-up' });
ok(recordedCloseCorrection.ok && recordedCloseCorrection.data.createdBy === 'owner@test.com', 'correction note has actor attribution');
const afterCorrection = as(T, 'cashClosePreview', { date: '2020-01-03' });
ok(afterCorrection.ok && afterCorrection.data.close.variance === dayThree.data.variance && afterCorrection.data.close.corrections.length === 1, 'correction does not rewrite close total');
const futureClose = as(T, 'cashClosePreview', { date: '2999-01-01' });
ok(!futureClose.ok && futureClose.code === 'VALIDATION', 'future close date rejected');

console.log('backend OK — ' + n + ' checks passed');
