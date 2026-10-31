'use strict';

const assert = require('node:assert/strict');
const { create } = require('./mock-gas');

const g = create();
g.props.OWNER_EMAIL = 'owner@test.com';
g.props.OWNER_PASSWORD = 'Owner#Start2026';
g.setup();

const login = g.call('login', {
  email: 'owner@test.com',
  password: 'Owner#Start2026',
});
assert.equal(login.ok, true, 'test owner can sign in');
const passwordChange = g.call('changePassword', {
  token: login.data.token,
  oldPassword: 'Owner#Start2026',
  newPassword: 'Owner#Final2026',
});
assert.equal(passwordChange.ok, true, 'test owner completes first-login password change');
const token = passwordChange.data.token;
const call = (action, payload = {}) => g.call(action, { token, ...payload });

const vendorResult = call('saveVendor', {
  name: 'Identity Test Supplier',
  company: 'Identity Test Supplier',
  mobile: '',
});
assert.equal(vendorResult.ok, true, 'registered vendor is created');
const vendorId = vendorResult.data.vendorId;
assert.ok(vendorId, 'vendor receives a stable ID');

function entry(clientId, overrides = {}) {
  return {
    clientId,
    date: '2026-10-30',
    type: 'PAYMENT',
    vendor: 'Identity Test Supplier',
    vendorId,
    vendorType: 'REGISTERED',
    amount: 125.5,
    category: 'Other',
    cashImpact: 'CASH_OUT',
    paymentMethod: 'CASH',
    notes: '',
    receipts: [],
    ...overrides,
  };
}

const first = call('createVouchers', { entries: [entry('identity-first-001')] });
assert.equal(first.ok, true, 'first registered payment is saved');
assert.equal(first.data.created[0].vendorId, vendorId);
assert.equal(first.data.created[0].vendorType, 'REGISTERED');

const oneTime = call('createVouchers', {
  entries: [
    entry('identity-one-time-001', {
      vendor: 'Walk-in One Time Payee',
      vendorId: null,
      vendorType: 'ONE_TIME',
      amount: 77,
    }),
  ],
});
assert.equal(oneTime.ok, true, 'one-time payee can be saved without a master record');
assert.equal(oneTime.data.created[0].vendorId, '');
assert.equal(oneTime.data.created[0].vendorType, 'ONE_TIME');

const oneTimeMatchingRegisteredName = call('createVouchers', {
  entries: [
    entry('identity-one-time-matching-name-001', {
      vendor: 'Identity Test Supplier',
      vendorId: null,
      vendorType: 'ONE_TIME',
      amount: 66,
    }),
  ],
});
assert.equal(oneTimeMatchingRegisteredName.ok, true);
assert.equal(oneTimeMatchingRegisteredName.data.created[0].vendorType, 'ONE_TIME');
const oneTimeNoOpPayeeEdit = call('updateVoucher', {
  id: oneTimeMatchingRegisteredName.data.created[0].id,
  fields: {
    vendor: 'Identity Test Supplier',
    notes: 'Receipt verified',
  },
  reason: 'Preserve one-time payee classification',
});
assert.equal(oneTimeNoOpPayeeEdit.ok, true);
assert.equal(oneTimeNoOpPayeeEdit.data.vendorType, 'ONE_TIME');
assert.equal(oneTimeNoOpPayeeEdit.data.vendorId, '');

const mismatch = call('createVouchers', {
  entries: [
    entry('identity-mismatch-001', {
      vendor: 'A Different Supplier',
    }),
  ],
});
assert.equal(mismatch.ok, false);
assert.equal(mismatch.code, 'VENDOR_MISMATCH', 'server rejects an ID/name mismatch');

const unknownId = call('createVouchers', {
  entries: [
    entry('identity-unknown-id-001', {
      vendor: 'Identity Test Supplier',
      vendorId: 'not-a-real-vendor-id',
    }),
  ],
});
assert.equal(unknownId.ok, false);
assert.equal(unknownId.code, 'VENDOR_INVALID', 'server rejects unknown vendor IDs');

const pendingDuplicate = entry('identity-duplicate-002');
const check = call('checkPaymentDuplicates', {
  entries: [{ index: 0, ...pendingDuplicate }],
});
assert.equal(check.ok, true);
assert.equal(check.data.results[0].duplicateCount, 1);
assert.ok(check.data.results[0].confirmationToken, 'server signs an entry-bound confirmation');

const rejectedWithoutConfirmation = call('createVouchers', {
  entries: [pendingDuplicate],
});
assert.equal(rejectedWithoutConfirmation.ok, false);
assert.equal(
  rejectedWithoutConfirmation.code,
  'DUPLICATE_CONFIRMATION_REQUIRED',
  'server rejects a matching payment until a reviewed confirmation is supplied',
);

const reviewed = call('checkPaymentDuplicates', {
  entries: [
    {
      index: 0,
      ...pendingDuplicate,
      confirmationToken: check.data.results[0].confirmationToken,
    },
  ],
});
assert.equal(reviewed.data.results[0].confirmationToken, check.data.results[0].confirmationToken);

// The same voucher ID remains a candidate, but a material edit to that voucher
// must also invalidate the signed review.
const matchedVoucherRow = g.sheets.Vouchers.rows.find((row) => row[0] === first.data.created[0].id);
assert.ok(matchedVoucherRow, 'created voucher is present in the mock ledger');
matchedVoucherRow[2] = '2026-10-29';
const candidateEditRejected = call('createVouchers', {
  entries: [
    {
      ...pendingDuplicate,
      duplicateConfirmationToken: reviewed.data.results[0].confirmationToken,
    },
  ],
});
assert.equal(candidateEditRejected.ok, false);
assert.equal(
  candidateEditRejected.code,
  'DUPLICATE_CONFIRMATION_REQUIRED',
  'editing a matched voucher invalidates its prior review token',
);
const refreshedForEdit = call('checkPaymentDuplicates', {
  entries: [
    {
      index: 0,
      ...pendingDuplicate,
      confirmationToken: reviewed.data.results[0].confirmationToken,
    },
  ],
});
assert.notEqual(
  refreshedForEdit.data.results[0].confirmationToken,
  reviewed.data.results[0].confirmationToken,
  'server issues a fresh review token after a matched voucher changes',
);

const acceptedDuplicate = call('createVouchers', {
  entries: [
    {
      ...pendingDuplicate,
      duplicateConfirmationToken: refreshedForEdit.data.results[0].confirmationToken,
    },
  ],
});
assert.equal(acceptedDuplicate.ok, true, 'explicitly reviewed duplicate can be saved');
assert.equal(acceptedDuplicate.data.created.length, 1);

// A retry of a transaction already committed must stay idempotent even if the
// short-lived duplicate-review token is omitted or expired.
const idempotentRetry = call('createVouchers', { entries: [pendingDuplicate] });
assert.equal(idempotentRetry.ok, true);
assert.equal(idempotentRetry.data.skipped, 1);
assert.equal(idempotentRetry.data.created[0].id, acceptedDuplicate.data.created[0].id);
const idempotentPreflight = call('checkPaymentDuplicates', {
  entries: [{ index: 0, ...pendingDuplicate }],
});
assert.equal(
  idempotentPreflight.data.results[0].duplicateCount,
  0,
  'a committed voucher with the same client transaction ID is treated as an idempotent retry',
);
const conflictingClientIdReuse = call('createVouchers', {
  entries: [{ ...pendingDuplicate, amount: 126 }],
});
assert.equal(conflictingClientIdReuse.ok, false);
assert.equal(
  conflictingClientIdReuse.code,
  'CONFLICT',
  'reusing a client transaction ID with a different payload is rejected',
);

// The candidate set changes when another matching payment is committed. The old
// confirmation token must no longer authorize a third payment.
const staleEntry = entry('identity-duplicate-003');
const staleCheck = call('checkPaymentDuplicates', {
  entries: [{ index: 0, ...staleEntry }],
});
assert.equal(staleCheck.data.results[0].duplicateCount, 2);
const staleToken = staleCheck.data.results[0].confirmationToken;
const staleCommit = call('createVouchers', {
  entries: [{ ...staleEntry, duplicateConfirmationToken: staleToken }],
});
assert.equal(staleCommit.ok, true);

const changedCandidatesEntry = entry('identity-duplicate-004');
const staleTokenRejected = call('createVouchers', {
  entries: [{ ...changedCandidatesEntry, duplicateConfirmationToken: staleToken }],
});
assert.equal(staleTokenRejected.ok, false);
assert.equal(
  staleTokenRejected.code,
  'DUPLICATE_CONFIRMATION_REQUIRED',
  'changed candidate set invalidates a previously reviewed confirmation',
);

const refreshedCheck = call('checkPaymentDuplicates', {
  entries: [
    {
      index: 0,
      ...changedCandidatesEntry,
      confirmationToken: staleToken,
    },
  ],
});
assert.notEqual(
  refreshedCheck.data.results[0].confirmationToken,
  staleToken,
  'server issues a new confirmation when matching candidates change',
);
const refreshedCommit = call('createVouchers', {
  entries: [
    {
      ...changedCandidatesEntry,
      duplicateConfirmationToken: refreshedCheck.data.results[0].confirmationToken,
    },
  ],
});
assert.equal(refreshedCommit.ok, true, 'newly reviewed candidate set can be confirmed');

const inactiveCreate = call('saveVendor', {
  name: 'Inactive Identity Vendor',
  company: '',
  mobile: '',
});
assert.equal(inactiveCreate.ok, true);
const committedBeforeDeactivation = entry('identity-inactive-retry-001', {
  vendor: 'Inactive Identity Vendor',
  vendorId: inactiveCreate.data.vendorId,
  amount: 44,
});
const inactiveCommittedVoucher = call('createVouchers', {
  entries: [committedBeforeDeactivation],
});
assert.equal(inactiveCommittedVoucher.ok, true);
assert.equal(call('toggleVendor', { id: inactiveCreate.data.vendorId }).ok, true);
const inactiveRetryPreflight = call('checkPaymentDuplicates', {
  entries: [{ index: 0, ...committedBeforeDeactivation }],
});
assert.equal(inactiveRetryPreflight.ok, true);
assert.equal(inactiveRetryPreflight.data.results[0].duplicateCount, 0);
const inactiveRetry = call('createVouchers', {
  entries: [committedBeforeDeactivation],
});
assert.equal(inactiveRetry.ok, true, 'committed transaction retry succeeds after vendor deactivation');
assert.equal(inactiveRetry.data.skipped, 1);
const inactiveVoucher = call('createVouchers', {
  entries: [
    entry('identity-inactive-001', {
      vendor: 'Inactive Identity Vendor',
      vendorId: inactiveCreate.data.vendorId,
    }),
  ],
});
assert.equal(inactiveVoucher.ok, false);
assert.equal(inactiveVoucher.code, 'VENDOR_INACTIVE');

console.log(
  'Vendor identity and duplicate safeguards: verified registered/one-time payees, inactive and mismatched IDs, server review, changed candidate sets, and idempotent retries.',
);
