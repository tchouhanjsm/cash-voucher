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
const as = (t, a, p) => g.call(a, { token: t, ...p });
ok(as(r.data.token, 'bootstrap').code === 'PIN_CHANGE', 'owner must change setup PIN');
let T = as(r.data.token, 'changePin', { oldPin: '483921', newPin: '579246' }).data.token;
const unknownAction = as(T, 'doesNotExist');
ok(unknownAction.code === 'NOT_FOUND', 'unknown action rejected');
ok(
  g.call('bootstrap').error && g.call('bootstrap').code === 'SESSION',
  'no token => session error',
);
// create users
ok(
  !as(T, 'saveUser', { name: 'Bad', email: 'a@b.com', role: 'staff', pin: '111111' }).ok,
  'weak PIN rejected',
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
const failedPinChanges = [];
for (let i = 0; i < 5; i++) {
  failedPinChanges.push(as(M, 'changePin', { oldPin: '000000', newPin: '864209' }));
}
ok(
  failedPinChanges.every((result) => !result.ok && result.code !== 'LOCKED'),
  'wrong current PIN attempts are counted before lockout',
);
ok(
  as(M, 'changePin', { oldPin: '864209', newPin: '112244' }).code === 'LOCKED',
  'PIN change is locked after five incorrect current PIN attempts',
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
g.props.BACKUP_LAST_ERROR = 'Drive copy failed';
backupStatus = as(T, 'backupStatus').data;
ok(
  backupStatus.state === 'failed' && backupStatus.lastError === 'Drive copy failed',
  'owner backup status reports latest recorded failure',
);
delete g.props.BACKUP_LAST_ERROR;
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
  'same-user client ID rejects changed date, counterparty, amount, category, notes and type',
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
ok(!as(S, 'updateVoucher', { id: id1, fields: { amount: 1 } }).ok, 'staff cannot edit');
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
ok(
  as(M, 'updateVoucher', { id: id1, fields: { amount: 175 } }).data.amount === 175,
  'manager edit',
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
ok(
  as(T, 'resetPin', {
    id: as(T, 'listUsers').data.find((u) => u.email === 'm@test.com').id,
    pin: '314159',
  }).ok,
  'owner reset pin succeeds',
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
ok(as(S, 'recordedMovementReport', { from: today, to: today }).code === 'FORBIDDEN', 'staff denied all-voucher movement report');
const movement = as(T, 'recordedMovementReport', { from: today, to: today, type: 'ALL', status: 'ALL' });
ok(movement.ok, 'owner reads date-scoped movement report');
ok(movement.data.count === movement.data.items.length, 'report count matches source rows');
ok(movement.data.paymentTotal >= movement.data.activePaymentTotal, 'payment total includes cancelled rows when selected');
ok(movement.data.receiptTotal >= movement.data.activeReceiptTotal, 'receipt total includes cancelled rows when selected');
ok(as(T, 'recordedMovementReport', { from: today, to: today, type: 'INVALID', status: 'ALL' }).code === 'VALIDATION', 'invalid report type rejected');
ok(as(T, 'recordedMovementReport', { from: '2026-12-31', to: today, type: 'ALL', status: 'ALL' }).code === 'VALIDATION', 'reversed reporting dates rejected');
ok(as(T, 'recordedMovementReport', { from: today, to: today, type: 'ALL', status: 'INVALID' }).code === 'VALIDATION', 'invalid report status rejected');
console.log(`backend OK — ${n} checks passed`);
