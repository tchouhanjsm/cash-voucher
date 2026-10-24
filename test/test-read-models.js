'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
g.props.OWNER_EMAIL = 'read-model-owner@test.com';
g.props.OWNER_PASSWORD = 'Owner#Start2026';
g.setup();

const loginAndRotate = (email, temporaryPassword, finalPassword) => {
  const login = g.call('login', { email, password: temporaryPassword });
  assert.equal(login.ok, true, email + ' should be able to sign in');
  const change = g.call('changePassword', {
    token: login.data.token,
    oldPassword: temporaryPassword,
    newPassword: finalPassword,
  });
  assert.equal(change.ok, true, email + ' should complete mandatory password change');
  return change.data.token;
};

const owner = loginAndRotate('read-model-owner@test.com', 'Owner#Start2026', 'Owner#Final2026');
const dateParts = Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(new Date())
    .map((part) => [part.type, part.value]),
);
const date = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
const created = g.call('createVouchers', {
  token: owner,
  entries: [
    {
      clientId: 'read-model-approved-payment',
      date,
      vendor: 'Read Model Approved Vendor',
      amount: 150,
      category: 'Other',
      paymentMethod: 'CASH',
      type: 'PAYMENT',
    },
    {
      clientId: 'read-model-pending-payment',
      date,
      vendor: 'Read Model Pending Vendor',
      amount: 12000,
      category: 'Other',
      paymentMethod: 'CASH',
      type: 'PAYMENT',
    },
    {
      clientId: 'read-model-receipt',
      date,
      vendor: 'Read Model Receipt Source',
      amount: 300,
      category: 'Other',
      paymentMethod: 'CASH',
      type: 'RECEIPT',
    },
  ],
});
assert.equal(created.ok, true, 'owner should create three read-model fixture vouchers');
assert.equal(created.data.created[1].approvalStatus, 'PENDING', 'high payment needs approval');

const firstPage = g.call('registerPage', {
  token: owner,
  from: date,
  to: date,
  status: 'ACTIVE',
  st: 'ACTIVE',
  approval: 'ALL',
  offset: 0,
  limit: 2,
});
assert.equal(firstPage.ok, true, 'owner register query succeeds');
assert.equal(firstPage.data.items.length, 2, 'register query returns only the requested page');
assert.equal(firstPage.data.totalCount, 3, 'register count describes all matching rows');
assert.equal(firstPage.data.hasMore, true, 'register indicates more pages');
assert.equal(
  firstPage.data.totals.paid,
  150,
  'pending payment is excluded from approved paid totals',
);
assert.equal(firstPage.data.totals.received, 300, 'received totals include active receipts');
assert.equal(
  firstPage.data.totals.approvalExceptionCount,
  1,
  'register surfaces an outstanding approval exception across all matching rows',
);
assert.ok(
  Array.isArray(firstPage.data.facets.vendors) &&
    firstPage.data.facets.vendors.includes('Read Model Approved Vendor'),
  'register returns vendor facets for filters without sending the full voucher ledger',
);

const nextPage = g.call('registerPage', {
  token: owner,
  from: date,
  to: date,
  st: 'ACTIVE',
  approval: 'ALL',
  offset: 2,
  limit: 2,
});
assert.equal(nextPage.ok, true, 'next register page succeeds');
assert.equal(nextPage.data.items.length, 1, 'last page contains just its remaining row');
assert.equal(nextPage.data.hasMore, false, 'last page closes pagination');
assert.equal(
  g.call('registerPage', { token: owner, limit: 201 }).code,
  'VALIDATION',
  'server rejects register pages larger than its bounded response limit',
);

const dashboard = g.call('dashboardSummary', { token: owner, from: date, to: date });
assert.equal(dashboard.ok, true, 'owner dashboard read model succeeds');
assert.equal(dashboard.data.paid, 150, 'dashboard only counts approved payment amounts');
assert.equal(dashboard.data.paymentCount, 1, 'dashboard payment count excludes pending approval');
assert.equal(dashboard.data.received, 300, 'dashboard returns period receipt amount');
assert.equal(dashboard.data.receiptCount, 1, 'dashboard returns period receipt count');
assert.equal(
  dashboard.data.approvalExceptionCount,
  1,
  'dashboard identifies pending high-value payment',
);
assert.equal(dashboard.data.bookBalance, 150, 'book balance uses approved payments plus receipts');
assert.ok(
  dashboard.data.trend.some((item) => item.date === date && item.amount === 150),
  'dashboard returns a compact server-aggregated trend rather than voucher details',
);

const malformedRecord = {
  VoucherID: 'malformed-read-model-voucher-id',
  VoucherNo: 99999,
  Date: 'not-a-date',
  Vendor: 'Malformed Hidden Vendor',
  Amount: 90000,
  Category: 'Other',
  Notes: 'must not appear in read models',
  Status: 'ACTIVE',
  CreatedBy: 'read-model-owner@test.com',
  CreatedAt: date + 'T12:00:00',
  UpdatedBy: '',
  UpdatedAt: '',
  Receipts: '',
  CancelReason: '',
  ClientID: 'malformed-read-model-row',
  Type: 'PAYMENT',
  CashImpact: 'CASH_OUT',
  ApprovalStatus: 'NOT_REQUIRED',
  ApprovedBy: '',
  ApprovedAt: '',
  ApprovalReason: '',
  VendorID: '',
  PaymentMethod: 'CASH',
};
g.sheets.Vouchers.rows.push(
  g.sheets.Vouchers.rows[0].map((header) => malformedRecord[header] ?? ''),
);
const malformedBlankStatusRecord = {
  ...malformedRecord,
  VoucherID: 'malformed-blank-status-voucher-id',
  VoucherNo: 99997,
  Date: date,
  Vendor: 'Malformed Blank Status Vendor',
  Amount: 250,
  Status: '',
  CreatedAt: date + 'T13:00:00',
};
const malformedMissingNumberRecord = {
  ...malformedRecord,
  VoucherID: 'malformed-missing-number-voucher-id',
  VoucherNo: '',
  Date: date,
  Vendor: 'Malformed Missing Number Vendor',
  Amount: 350,
  Status: 'ACTIVE',
  CreatedAt: date + 'T13:30:00',
};
const malformedUnknownTypeRecord = {
  ...malformedRecord,
  VoucherID: 'malformed-unknown-type-voucher-id',
  VoucherNo: 99996,
  Date: date,
  Vendor: 'Malformed Unknown Type Vendor',
  Amount: 450,
  Status: 'ACTIVE',
  Type: 'EXPENSE',
  CreatedAt: date + 'T13:45:00',
};
const malformedBooleanNumberRecord = {
  ...malformedRecord,
  VoucherID: 'malformed-boolean-number-voucher-id',
  VoucherNo: true,
  Date: date,
  Vendor: 'Malformed Boolean Number Vendor',
  Amount: 550,
  Status: 'ACTIVE',
  Type: 'PAYMENT',
  CreatedAt: date + 'T13:50:00',
};
[
  malformedBlankStatusRecord,
  malformedMissingNumberRecord,
  malformedUnknownTypeRecord,
  malformedBooleanNumberRecord,
].forEach(
  (record) => {
    g.sheets.Vouchers.rows.push(
      g.sheets.Vouchers.rows[0].map((header) => record[header] ?? ''),
    );
  },
);
const filteredAfterMalformed = g.call('registerPage', {
  token: owner,
  from: date,
  to: date,
  st: 'ACTIVE',
  approval: 'ALL',
  offset: 0,
  limit: 100,
});
assert.equal(
  filteredAfterMalformed.ok,
  true,
  'register remains available with malformed legacy rows',
);
assert.equal(
  filteredAfterMalformed.data.totalCount,
  3,
  'malformed records are excluded from visible register results',
);
assert.equal(
  filteredAfterMalformed.data.totals.malformedRecordCount,
  5,
  'invalid date, blank status, missing or non-numeric voucher number and unsupported type are surfaced as malformed records',
);
assert.equal(
  filteredAfterMalformed.data.items.some((item) =>
    [
      'Malformed Hidden Vendor',
      'Malformed Blank Status Vendor',
      'Malformed Missing Number Vendor',
      'Malformed Unknown Type Vendor',
      'Malformed Boolean Number Vendor',
    ].includes(item.vendor),
  ),
  false,
  'malformed voucher data never reaches the normal register rows',
);
assert.equal(
  filteredAfterMalformed.data.totals.malformedFieldCount,
  2,
  'blank status and voucher-number fields contribute to field-level data-quality diagnostics',
);
const bootstrapAfterMalformed = g.call('bootstrap', { token: owner });
assert.equal(bootstrapAfterMalformed.ok, true, 'bootstrap remains available with malformed ledger rows');
assert.equal(
  bootstrapAfterMalformed.data.vouchers.some((item) =>
    [
      'Malformed Hidden Vendor',
      'Malformed Blank Status Vendor',
      'Malformed Missing Number Vendor',
      'Malformed Unknown Type Vendor',
      'Malformed Boolean Number Vendor',
    ].includes(item.vendor),
  ),
  false,
  'bootstrap excludes malformed rows instead of normalizing unknown types into payments',
);
const pendingInvalidAmountRow = {
  VoucherID: 'pending-invalid-amount-read-model-row',
  VoucherNo: 99998,
  Date: date,
  Vendor: 'Pending Invalid Amount',
  Amount: 'not-a-number',
  Category: 'Other',
  Notes: '',
  Status: 'ACTIVE',
  CreatedBy: 'read-model-owner@test.com',
  CreatedAt: date + 'T13:00:00',
  UpdatedBy: '',
  UpdatedAt: '',
  Receipts: '',
  CancelReason: '',
  ClientID: 'pending-invalid-amount-read-model-row',
  Type: 'PAYMENT',
  CashImpact: 'CASH_OUT',
  ApprovalStatus: 'PENDING',
  ApprovedBy: '',
  ApprovedAt: '',
  ApprovalReason: '',
  VendorID: '',
  PaymentMethod: 'CASH',
};
g.sheets.Vouchers.rows.push(
  g.sheets.Vouchers.rows[0].map((header) => pendingInvalidAmountRow[header] ?? ''),
);
const dashboardAfterMalformed = g.call('dashboardSummary', { token: owner, from: date, to: date });
assert.equal(
  dashboardAfterMalformed.ok,
  true,
  'dashboard remains available with malformed legacy rows',
);
assert.equal(
  dashboardAfterMalformed.data.paid,
  150,
  'malformed amount is excluded from the dashboard total',
);
assert.equal(
  dashboardAfterMalformed.data.paymentCount,
  1,
  'malformed record is excluded from the dashboard count',
);
assert.equal(
  dashboardAfterMalformed.data.malformedRecordCount,
  5,
  'dashboard reports every structurally malformed record separately',
);
assert.equal(
  dashboardAfterMalformed.data.invalidAmountCount,
  1,
  'active pending payments with invalid amounts remain in data-quality counts',
);
assert.equal(
  dashboardAfterMalformed.data.approvalExceptionCount,
  2,
  'pending invalid-amount payments remain in approval exception counts',
);
assert.equal(
  dashboardAfterMalformed.data.malformedFieldCount,
  2,
  'dashboard field-quality count includes blank values even when those rows are excluded from totals',
);

const voucherHeaders = g.sheets.Vouchers.rows[0];
const seedHistoricVoucher = (record) => {
  g.sheets.Vouchers.rows.push(
    voucherHeaders.map((header) => (record[header] === undefined ? '' : record[header])),
  );
};
seedHistoricVoucher({
  VoucherID: 'historical-bulk-duplicate',
  VoucherNo: 88001,
  Date: '2026-10-01',
  Vendor: 'Historical Duplicate Vendor',
  Amount: 450,
  Category: 'Other',
  Notes: '',
  Status: 'ACTIVE',
  CreatedBy: 'read-model-owner@test.com',
  CreatedAt: '2025-01-01T00:00:00Z',
  UpdatedBy: '',
  UpdatedAt: '',
  Receipts: '',
  CancelReason: '',
  ClientID: 'historical-bulk-duplicate',
  Type: 'PAYMENT',
  CashImpact: 'CASH_OUT',
  ApprovalStatus: 'NOT_REQUIRED',
  ApprovedBy: '',
  ApprovedAt: '',
  ApprovalReason: '',
});
for (let index = 0; index < 205; index++) {
  seedHistoricVoucher({
    VoucherID: 'bulk-dedupe-window-' + index,
    VoucherNo: 90000 + index,
    Date: '2026-10-01',
    Vendor: 'Bulk Dedupe Window Vendor ' + index,
    Amount: index + 1,
    Category: 'Other',
    Notes: '',
    Status: 'ACTIVE',
    CreatedBy: 'read-model-owner@test.com',
    CreatedAt: '2026-10-22T22:00:00Z',
    UpdatedBy: '',
    UpdatedAt: '',
    Receipts: '',
    CancelReason: '',
    ClientID: 'bulk-dedupe-window-' + index,
    Type: 'PAYMENT',
    CashImpact: 'CASH_OUT',
    ApprovalStatus: 'NOT_REQUIRED',
    ApprovedBy: '',
    ApprovedAt: '',
    ApprovalReason: '',
  });
}
const compactBootstrap = g.call('bootstrap', { token: owner });
assert.equal(
  compactBootstrap.ok,
  true,
  'bootstrap remains available after historical ledger seeding',
);
assert.equal(
  compactBootstrap.data.vouchers.length,
  200,
  'bootstrap remains capped at 200 recent voucher rows',
);
assert.equal(
  compactBootstrap.data.vouchers.some((row) => row.vendor === 'Historical Duplicate Vendor'),
  false,
  'historical duplicate fixture is older than the 200-row bootstrap sample',
);
const historicalDuplicateCheck = g.call('checkVoucherDuplicates', {
  token: owner,
  type: 'PAYMENT',
  entries: [
    { index: 19, date: '2026-10-01', vendor: 'historical duplicate vendor', amount: 450 },
    { index: 20, date: '2026-10-01', vendor: 'Brand New Bulk Vendor', amount: 450 },
  ],
});
assert.equal(historicalDuplicateCheck.ok, true, 'owner duplicate preflight succeeds for bulk rows');
assert.deepEqual(
  historicalDuplicateCheck.data.duplicateIndexes,
  [19],
  'server detects an old voucher outside the capped bootstrap cache',
);
assert.equal(
  g.call('checkVoucherDuplicates', {
    token: owner,
    type: 'UNKNOWN',
    entries: [],
  }).code,
  'VALIDATION',
  'duplicate preflight rejects an unsupported transaction type',
);
assert.equal(
  g.call('checkVoucherDuplicates', {
    token: owner,
    type: 'PAYMENT',
    entries: [{ index: 0, date: '2026-10-01', vendor: 'Bad Amount', amount: Infinity }],
  }).code,
  'VALIDATION',
  'duplicate preflight rejects non-finite amounts',
);

const createStaff = g.call('saveUser', {
  token: owner,
  name: 'Read Model Staff',
  email: 'read-model-staff@test.com',
  role: 'staff',
  password: 'Staff#Start2026',
});
assert.equal(createStaff.ok, true, 'owner can create a staff fixture');
const staff = loginAndRotate('read-model-staff@test.com', 'Staff#Start2026', 'Staff#Final2026');
assert.equal(
  g.call('checkVoucherDuplicates', { token: staff, type: 'PAYMENT', entries: [] }).code,
  'FORBIDDEN',
  'staff without bulk permission cannot call the bulk duplicate preflight',
);
const staffVoucher = g.call('createVouchers', {
  token: staff,
  entries: [
    {
      clientId: 'read-model-staff-payment',
      date,
      vendor: 'Staff Private Vendor',
      amount: 75,
      category: 'Other',
      paymentMethod: 'CASH',
      type: 'PAYMENT',
    },
  ],
});
assert.equal(staffVoucher.ok, true, 'staff can create an own payment');
const staffPage = g.call('registerPage', {
  token: staff,
  from: date,
  to: date,
  st: 'ACTIVE',
  approval: 'ALL',
  offset: 0,
  limit: 100,
});
assert.equal(staffPage.ok, true, 'staff can read own register rows');
assert.equal(
  staffPage.data.totalCount,
  1,
  'staff register query is server-scoped to their own rows',
);
assert.equal(
  staffPage.data.items[0].vendor,
  'Staff Private Vendor',
  'staff sees their own voucher',
);
assert.equal(
  staffPage.data.facets.vendors.includes('Read Model Approved Vendor'),
  false,
  'staff filter facets do not leak other users vendor names',
);
const staffDashboard = g.call('dashboardSummary', { token: staff, from: date, to: date });
assert.equal(staffDashboard.ok, true, 'staff dashboard is available within their own scope');
assert.equal(staffDashboard.data.paid, 75, 'staff dashboard cannot aggregate other users payments');
assert.equal(staffDashboard.data.byTeamMember.length, 0, 'team breakdown is owner-only');

console.log(
  'Read models OK — bounded paging, full-result totals, approval-aware summaries, facets and role scoping.',
);
