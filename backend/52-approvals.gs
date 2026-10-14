const PAYMENT_APPROVAL_STATUSES = ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'];
function approvalStatus_(voucher) {
  const raw = voucher && voucher.ApprovalStatus;
  if (raw === undefined || raw === null || raw === '') return 'NOT_REQUIRED';
  return PAYMENT_APPROVAL_STATUSES.indexOf(raw) >= 0 ? raw : 'REVIEW_REQUIRED';
}
function isEligibleApprovalPayment_(voucher) {
  if (!voucher || voucher.Type !== 'PAYMENT') return false;
  const rawAmount = voucher.Amount;
  if (
    rawAmount === '' ||
    rawAmount === null ||
    rawAmount === undefined ||
    typeof rawAmount === 'boolean'
  ) {
    return false;
  }
  const amount = Number(rawAmount);
  return (
    isFinite(amount) &&
    amount >= CFG.PAYMENT_APPROVAL_THRESHOLD &&
    amount <= CFG.MAX_AMOUNT &&
    Number.isSafeInteger(Math.round(amount * 100))
  );
}
function approveVoucher_(user, req) {
  need_(user, 'approvePayments');
  const id = typeof req.id === 'string' ? req.id.trim() : '';
  if (!id) throw err_('Voucher ID is required.', 'VALIDATION');
  const voucher = findVoucher_(id);
  if (voucher.Status !== 'ACTIVE') {
    throw err_('Only active payment vouchers can be approved.', 'APPROVAL_STATE');
  }
  if (!isEligibleApprovalPayment_(voucher)) {
    throw err_(
      'Only a valid high-value PAYMENT voucher can be approved or rejected.',
      'APPROVAL_STATE',
    );
  }
  if (approvalStatus_(voucher) !== 'PENDING') {
    throw err_(
      'This payment is not awaiting approval. Refresh the Register and review its current state.',
      'APPROVAL_STATE',
    );
  }
  if (String(voucher.CreatedBy || '').toLowerCase() === String(user.email || '').toLowerCase()) {
    throw err_('You cannot approve a payment voucher you created.', 'FORBIDDEN');
  }

  const timestamp = nowIso_();
  const patch = {
    ApprovalStatus: 'APPROVED',
    ApprovedBy: user.email,
    ApprovedAt: timestamp,
    ApprovalReason: '',
    UpdatedBy: user.email,
    UpdatedAt: timestamp,
  };
  updateRow_('Vouchers', voucher._row, patch);
  auditEvent_(
    user,
    'PAYMENT_APPROVE',
    '#' + voucher.VoucherNo,
    'PAYMENT_VOUCHER_APPROVED',
    'voucher',
    voucher.VoucherID,
    '',
    [
      { field: 'approvalStatus', before: 'PENDING', after: 'APPROVED' },
      { field: 'approvedBy', before: '', after: user.email },
      { field: 'approvedAt', before: '', after: timestamp },
    ],
    'High-value payment approved',
  );
  return vOut_(Object.assign({}, voucher, patch));
}

function rejectVoucher_(user, req) {
  need_(user, 'approvePayments');
  const id = typeof req.id === 'string' ? req.id.trim() : '';
  if (!id) throw err_('Voucher ID is required.', 'VALIDATION');
  const voucher = findVoucher_(id);
  if (voucher.Status !== 'ACTIVE') {
    throw err_('Only active payment vouchers can be rejected.', 'APPROVAL_STATE');
  }
  if (!isEligibleApprovalPayment_(voucher)) {
    throw err_(
      'Only a valid high-value PAYMENT voucher can be approved or rejected.',
      'APPROVAL_STATE',
    );
  }
  if (approvalStatus_(voucher) !== 'PENDING') {
    throw err_(
      'This payment is not awaiting approval. Refresh the Register and review its current state.',
      'APPROVAL_STATE',
    );
  }
  if (String(voucher.CreatedBy || '').toLowerCase() === String(user.email || '').toLowerCase()) {
    throw err_('You cannot reject a payment voucher you created.', 'FORBIDDEN');
  }
  const reason = clean_(req.reason, 200);
  if (reason.length < 3) {
    throw err_('Please give a rejection reason of 3 to 200 characters.', 'VALIDATION');
  }

  const timestamp = nowIso_();
  const patch = {
    ApprovalStatus: 'REJECTED',
    ApprovedBy: '',
    ApprovedAt: '',
    ApprovalReason: reason,
    UpdatedBy: user.email,
    UpdatedAt: timestamp,
  };
  updateRow_('Vouchers', voucher._row, patch);
  auditEvent_(
    user,
    'PAYMENT_REJECT',
    '#' + voucher.VoucherNo,
    'PAYMENT_VOUCHER_REJECTED',
    'voucher',
    voucher.VoucherID,
    reason,
    [
      { field: 'approvalStatus', before: 'PENDING', after: 'REJECTED' },
      { field: 'approvalReason', before: '', after: reason },
    ],
    'High-value payment rejected',
  );
  return vOut_(Object.assign({}, voucher, patch));
}
