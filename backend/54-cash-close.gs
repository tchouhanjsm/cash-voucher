const CASH_CLOSE_DRAWER = 'MAIN';
const CASH_CLOSE_CORRECTION_TYPES = ['VOUCHER', 'CASH_COUNT', 'OPENING_CASH', 'OTHER'];
function cashCloseAmountPaise_(value, label) {
  if (typeof value !== 'string' && typeof value !== 'number')
    throw err_('Enter a valid ' + label + ' amount.', 'VALIDATION');
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text))
    throw err_('Enter a valid ' + label + ' amount using up to two decimal places.', 'VALIDATION');
  const amount = Number(text);
  if (!isFinite(amount) || amount < 0 || amount > CFG.MAX_AMOUNT)
    throw err_(label + ' is outside the supported amount range.', 'VALIDATION');
  const paise = Math.round(amount * 100);
  if (!Number.isSafeInteger(paise)) throw err_('Invalid ' + label + ' amount.', 'VALIDATION');
  return paise;
}
function cashCloseAmountNumber_(value, label) {
  const amount = Number(value);
  if (
    value === '' ||
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    !isFinite(amount) ||
    amount < 0 ||
    amount > CFG.MAX_AMOUNT
  )
    throw err_(
      'Stored cash-close ' + label + ' is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  const paise = Math.round(amount * 100);
  if (!Number.isSafeInteger(paise))
    throw err_('Stored cash-close ' + label + ' is invalid.', 'CASH_CLOSE_DATA');
  return paise;
}
function cashClosePreviousDate_(date) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function cashDateClosed_(date) {
  return readAll_('CashCloses').some(function (close) {
    return (
      String(close.BusinessDate || '') === date &&
      String(close.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER
    );
  });
}
function cashCloseDateError_() {
  return err_(
    'This business date is closed. The original close is immutable; record an attributed correction note from Daily Cash Close instead of editing or cancelling the voucher.',
    'CASH_PERIOD_CLOSED',
  );
}
function cashCloseCalculatePeriod_(date) {
  const items = [],
    unclassified = [],
    invalidVouchers = [],
    pendingApprovals = [];
  let cashInPaise = 0,
    cashOutPaise = 0,
    noCashCount = 0;
  readAll_('Vouchers')
    .filter(function (voucher) {
      return isoDate_(voucher.Date) === date;
    })
    .sort(function (a, b) {
      return (Number(a.VoucherNo) || 0) - (Number(b.VoucherNo) || 0);
    })
    .forEach(function (voucher) {
      const status = String(voucher.Status || '');
      if (status === 'CANCELLED') return;

      const type = String(voucher.Type || '');
      const id = String(voucher.VoucherID || '');
      const rawVoucherNo = voucher.VoucherNo;
      const voucherNo = Number(rawVoucherNo);
      const voucherNoValid =
        rawVoucherNo !== '' &&
        rawVoucherNo !== null &&
        rawVoucherNo !== undefined &&
        Number.isSafeInteger(voucherNo) &&
        voucherNo > 0;
      if (status !== 'ACTIVE' || !['PAYMENT', 'RECEIPT'].includes(type) || !id || !voucherNoValid) {
        invalidVouchers.push({
          id,
          no: (type === 'RECEIPT' ? 'R-' : 'P-') + String(rawVoucherNo || 'UNKNOWN'),
          vendor: String(voucher.Vendor || ''),
          amount:
            voucher.Amount === null || voucher.Amount === undefined ? '' : String(voucher.Amount),
          reason:
            status !== 'ACTIVE'
              ? 'Voucher status is missing or unsupported.'
              : !['PAYMENT', 'RECEIPT'].includes(type)
                ? 'Voucher type is missing or unsupported.'
                : !id
                  ? 'Voucher ID is missing.'
                  : 'Voucher number is missing or invalid.',
        });
        return;
      }

      const approvalStatus = approvalStatus_(voucher);
      if (voucher.Type === 'PAYMENT' && ['NOT_REQUIRED', 'APPROVED'].indexOf(approvalStatus) < 0) {
        pendingApprovals.push({
          id: String(voucher.VoucherID || ''),
          no: 'P-' + String(voucher.VoucherNo || ''),
          date: isoDate_(voucher.Date),
          vendor: String(voucher.Vendor || ''),
          amount: Number(voucher.Amount) || null,
          approvalStatus: approvalStatus,
          reason:
            approvalStatus === 'PENDING'
              ? 'Payment approval is required.'
              : approvalStatus === 'REJECTED'
                ? 'Payment was rejected; cancel or correct it before closing.'
                : 'Approval state is invalid and needs review.',
        });
        return;
      }
      const impact =
        CASH_IMPACT_CHOICES.indexOf(voucher.CashImpact) >= 0 ? voucher.CashImpact : 'UNCLASSIFIED';
      const rawAmount = voucher.Amount,
        amount = Number(rawAmount);
      const amountValid =
        rawAmount !== '' &&
        rawAmount !== null &&
        rawAmount !== undefined &&
        typeof rawAmount !== 'boolean' &&
        isFinite(amount) &&
        amount > 0 &&
        amount <= CFG.MAX_AMOUNT &&
        Number.isSafeInteger(Math.round(amount * 100));
      const amountPaise = amountValid ? Math.round(amount * 100) : null;
      const item = {
        id: String(voucher.VoucherID || ''),
        no: String(voucher.Type === 'RECEIPT' ? 'R-' : 'P-') + String(voucher.VoucherNo || ''),
        date: isoDate_(voucher.Date),
        vendor: String(voucher.Vendor || ''),
        amount: amountValid ? amountPaise / 100 : null,
        cashImpact: impact,
      };
      items.push(item);
      if (!amountValid)
        invalidVouchers.push({
          id: item.id,
          no: item.no,
          vendor: item.vendor,
          amount: rawAmount === null || rawAmount === undefined ? '' : String(rawAmount),
          reason: 'Amount is missing, invalid, negative, zero, or outside the supported range.',
        });
      if (impact === 'UNCLASSIFIED')
        unclassified.push({
          id: item.id,
          no: item.no,
          date: item.date,
          vendor: item.vendor,
          amount: item.amount,
          reason: 'Physical cash impact is unresolved.',
        });
      if (!amountValid || impact === 'UNCLASSIFIED') return;
      if (impact === 'CASH_IN') cashInPaise += amountPaise;
      else if (impact === 'CASH_OUT') cashOutPaise += amountPaise;
      else if (impact === 'NO_CASH') noCashCount++;
    });
  return {
    items,
    unclassified,
    invalidVouchers,
    pendingApprovals,
    cashInPaise,
    cashOutPaise,
    noCashCount,
  };
}

function cashCloseCorrectionOut_(row) {
  return {
    id: String(row.CorrectionID || ''),
    closeId: String(row.CloseID || ''),
    date: String(row.BusinessDate || ''),
    voucherId: String(row.VoucherID || ''),
    type: String(row.CorrectionType || 'OTHER'),
    details: String(row.Details || ''),
    reason: String(row.Reason || ''),
    createdBy: String(row.CreatedBy || ''),
    createdAt: tsStr_(row.CreatedAt),
  };
}
function cashCloseStoredAmountPaise_(value, label, allowNegative) {
  const invalid =
    typeof value !== 'number' ||
    !isFinite(value) ||
    (!allowNegative && value < 0) ||
    !Number.isSafeInteger(Math.round(value * 100)) ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.000001;
  if (invalid) {
    throw err_(
      'Saved cash-close ' + label + ' is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  return Math.round(value * 100);
}
function cashCloseOut_(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw err_(
      'Saved cash-close record is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }

  const closeId = typeof row.CloseID === 'string' ? row.CloseID.trim() : '';
  const closeDate = typeof row.BusinessDate === 'string' ? row.BusinessDate : '';
  const drawerKey =
    typeof row.DrawerKey === 'string' && row.DrawerKey.trim()
      ? row.DrawerKey.trim()
      : CASH_CLOSE_DRAWER;
  const openingSource = typeof row.OpeningSource === 'string' ? row.OpeningSource : '';
  const openingCloseId = typeof row.OpeningCloseID === 'string' ? row.OpeningCloseID.trim() : '';
  const openingReason = typeof row.OpeningReason === 'string' ? row.OpeningReason.trim() : '';
  const varianceReason = typeof row.VarianceReason === 'string' ? row.VarianceReason.trim() : '';
  const createdBy = typeof row.CreatedBy === 'string' ? row.CreatedBy.trim() : '';
  const createdAt = typeof row.CreatedAt === 'string' ? row.CreatedAt : '';
  const timeZone =
    typeof row.TimeZone === 'string' && row.TimeZone.trim() ? row.TimeZone.trim() : CFG.TZ;
  const requestId = typeof row.RequestID === 'string' ? row.RequestID.trim() : '';
  const requestPayload = typeof row.RequestPayload === 'string' ? row.RequestPayload : '';
  const timestampMs = Date.parse(createdAt + 'Z');
  if (
    !closeId ||
    !validDate_(closeDate) ||
    closeDate.length !== 10 ||
    drawerKey !== CASH_CLOSE_DRAWER ||
    !createdBy ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(createdAt) ||
    !isFinite(timestampMs) ||
    new Date(timestampMs).toISOString().slice(0, 19) !== createdAt ||
    timeZone !== CFG.TZ ||
    !requestId ||
    !requestPayload.trim()
  ) {
    throw err_(
      'Saved cash-close identity or metadata is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  if (
    (openingSource === 'MANUAL' && (openingReason.length < 3 || openingCloseId)) ||
    (openingSource === 'PREVIOUS_CLOSE' && (!openingCloseId || openingReason)) ||
    !['MANUAL', 'PREVIOUS_CLOSE'].includes(openingSource)
  ) {
    throw err_(
      'Saved cash-close opening source is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }

  let vouchers, ids;
  try {
    if (typeof row.IncludedVouchers !== 'string' || !row.IncludedVouchers.trim()) {
      throw new Error('Missing voucher snapshot');
    }
    vouchers = JSON.parse(row.IncludedVouchers);
  } catch {
    throw err_(
      'Saved cash-close voucher snapshot is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  if (!Array.isArray(vouchers)) {
    throw err_(
      'Saved cash-close voucher snapshot is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }

  const snapshotIds = [];
  const validSnapshotVoucher = function (item) {
    if (
      item === null ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      typeof item.id !== 'string' ||
      item.id.trim() === '' ||
      typeof item.no !== 'string' ||
      item.no.trim() === '' ||
      typeof item.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !validDate_(item.date) ||
      item.date !== closeDate ||
      typeof item.vendor !== 'string' ||
      typeof item.amount !== 'number' ||
      !isFinite(item.amount) ||
      item.amount <= 0 ||
      item.amount > CFG.MAX_AMOUNT ||
      !Number.isSafeInteger(Math.round(item.amount * 100)) ||
      Math.abs(item.amount * 100 - Math.round(item.amount * 100)) > 0.000001 ||
      CASH_IMPACT_CHOICES.indexOf(item.cashImpact) < 0
    ) {
      return false;
    }
    return true;
  };
  if (!vouchers.every(validSnapshotVoucher)) {
    throw err_(
      'Saved cash-close voucher snapshot is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  vouchers.forEach(function (voucher) {
    snapshotIds.push(voucher.id);
  });

  try {
    if (typeof row.IncludedVoucherIds !== 'string' || !row.IncludedVoucherIds.trim()) {
      throw new Error('Missing voucher ID snapshot');
    }
    ids = JSON.parse(row.IncludedVoucherIds);
  } catch {
    throw err_(
      'Saved cash-close voucher IDs are invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  if (
    !Array.isArray(ids) ||
    ids.some(function (id, index) {
      return typeof id !== 'string' || id.trim() === '' || id !== snapshotIds[index];
    }) ||
    ids.length !== vouchers.length ||
    ids.some(function (id, index) {
      return ids.indexOf(id) !== index;
    })
  ) {
    throw err_(
      'Saved cash-close voucher IDs do not match the voucher snapshot. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }

  const includedVoucherCount = row.IncludedVoucherCount;
  if (
    typeof includedVoucherCount !== 'number' ||
    !Number.isSafeInteger(includedVoucherCount) ||
    includedVoucherCount < 0 ||
    includedVoucherCount !== vouchers.length
  ) {
    throw err_(
      'Saved cash-close voucher count does not match the voucher snapshot. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }

  const openingCashPaise = cashCloseStoredAmountPaise_(row.OpeningCash, 'opening cash', false);
  const cashInTotalPaise = cashCloseStoredAmountPaise_(row.CashInTotal, 'cash-in total', false);
  const cashOutTotalPaise = cashCloseStoredAmountPaise_(row.CashOutTotal, 'cash-out total', false);
  const expectedCashPaise = cashCloseStoredAmountPaise_(row.ExpectedCash, 'expected cash', false);
  const countedCashPaise = cashCloseStoredAmountPaise_(row.CountedCash, 'counted cash', false);
  const variancePaise = cashCloseStoredAmountPaise_(row.Variance, 'variance', true);
  if (
    openingCashPaise > Math.round(CFG.MAX_AMOUNT * 100) ||
    countedCashPaise > Math.round(CFG.MAX_AMOUNT * 100)
  ) {
    throw err_(
      'Saved cash-close opening/count amount exceeds the supported range. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }

  let snapshotCashInPaise = 0;
  let snapshotCashOutPaise = 0;
  vouchers.forEach(function (voucher) {
    const amountPaise = Math.round(voucher.amount * 100);
    if (voucher.cashImpact === 'CASH_IN') snapshotCashInPaise += amountPaise;
    else if (voucher.cashImpact === 'CASH_OUT') snapshotCashOutPaise += amountPaise;
    if (!Number.isSafeInteger(snapshotCashInPaise) || !Number.isSafeInteger(snapshotCashOutPaise)) {
      throw err_(
        'Saved cash-close voucher snapshot totals exceed the supported range. Stop and inspect the close record.',
        'CASH_CLOSE_DATA',
      );
    }
  });
  const calculatedExpectedPaise = openingCashPaise + snapshotCashInPaise - snapshotCashOutPaise;
  const calculatedVariancePaise = countedCashPaise - expectedCashPaise;
  if (
    cashInTotalPaise !== snapshotCashInPaise ||
    cashOutTotalPaise !== snapshotCashOutPaise ||
    !Number.isSafeInteger(calculatedExpectedPaise) ||
    calculatedExpectedPaise < 0 ||
    expectedCashPaise !== calculatedExpectedPaise ||
    !Number.isSafeInteger(calculatedVariancePaise) ||
    variancePaise !== calculatedVariancePaise ||
    (variancePaise !== 0 && varianceReason.length < 3)
  ) {
    throw err_(
      'Saved cash-close totals do not reconcile with the immutable voucher snapshot. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }

  return {
    id: closeId,
    date: closeDate,
    drawerKey: drawerKey,
    openingCash: openingCashPaise / 100,
    openingSource: openingSource,
    openingCloseId: openingCloseId,
    openingReason: openingReason,
    cashInTotal: cashInTotalPaise / 100,
    cashOutTotal: cashOutTotalPaise / 100,
    expectedCash: expectedCashPaise / 100,
    countedCash: countedCashPaise / 100,
    variance: variancePaise / 100,
    varianceReason: varianceReason,
    includedVoucherCount: includedVoucherCount,
    includedVoucherIds: ids,
    includedVouchers: vouchers,
    createdBy: createdBy,
    createdAt: createdAt,
    timeZone: timeZone,
  };
}
function cashCloseWithCorrections_(row, corrections) {
  const out = cashCloseOut_(row);
  out.corrections = corrections
    .filter(function (correction) {
      return String(correction.CloseID || '') === out.id;
    })
    .sort(function (a, b) {
      return tsStr_(a.CreatedAt).localeCompare(tsStr_(b.CreatedAt));
    })
    .map(cashCloseCorrectionOut_)
    .slice(-100);
  return out;
}
function cashClosePayload_(
  date,
  openingPaise,
  openingSource,
  openingReason,
  countedPaise,
  varianceReason,
) {
  return JSON.stringify({
    date,
    openingPaise,
    openingSource,
    openingReason,
    countedPaise,
    varianceReason,
  });
}
function cashClosePreview_(user, req) {
  need_(user, 'cashClose');
  const date = String(req.date || todayIso_(0)).trim();
  if (!validDate_(date) || date > todayIso_(0))
    throw err_('Choose a valid business date that is not in the future.', 'VALIDATION');
  const closes = readAll_('CashCloses').filter(function (row) {
    return String(row.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER;
  });
  const corrections = readAll_('CashCloseCorrections');
  const byDate = function (targetDate) {
    return closes.filter(function (row) {
      return String(row.BusinessDate || '') === targetDate;
    })[0];
  };
  const selected = byDate(date),
    previous = byDate(cashClosePreviousDate_(date));
  const laterDates = closes.filter(function (row) {
    return String(row.BusinessDate || '') > date;
  });
  laterDates.sort(function (a, b) {
    return String(a.BusinessDate || '').localeCompare(String(b.BusinessDate || ''));
  });
  const laterClose = laterDates[0] || null;
  const recentCloses = closes
    .slice()
    .sort(function (a, b) {
      return String(b.BusinessDate || '').localeCompare(String(a.BusinessDate || ''));
    })
    .slice(0, 10)
    .map(function (row) {
      return cashCloseWithCorrections_(row, corrections);
    });
  if (selected)
    return {
      date,
      today: todayIso_(0),
      closed: true,
      close: cashCloseWithCorrections_(selected, corrections),
      recentCloses,
      timeZone: CFG.TZ,
    };
  const period = cashCloseCalculatePeriod_(date);
  let openingPaise = null,
    openingSource = '',
    openingReason = '',
    openingReady = false;
  if (previous) {
    openingPaise = cashCloseAmountNumber_(previous.CountedCash, 'prior counted cash');
    openingSource = 'PREVIOUS_CLOSE';
    openingReady = true;
  } else if (req.openingCash !== undefined && req.openingCash !== '') {
    openingPaise = cashCloseAmountPaise_(req.openingCash, 'opening cash');
    openingSource = 'MANUAL';
    openingReason = clean_(req.openingReason, 200);
    openingReady = openingReason.length >= 3;
  }
  const expectedPaise =
    openingPaise === null ? null : openingPaise + period.cashInPaise - period.cashOutPaise;
  const blocked =
    period.pendingApprovals.length > 0 ||
    period.unclassified.length > 0 ||
    period.invalidVouchers.length > 0;
  const expectedValid =
    expectedPaise !== null && expectedPaise >= 0 && Number.isSafeInteger(expectedPaise);
  return {
    date,
    today: todayIso_(0),
    closed: false,
    blockedByLaterClose: !!laterClose,
    laterCloseDate: laterClose ? String(laterClose.BusinessDate || '') : '',
    requiresManualOpening: !previous,
    previousClose: previous ? cashCloseOut_(previous) : null,
    openingCash: openingPaise === null ? null : openingPaise / 100,
    openingSource,
    openingReason,
    openingReady,
    cashInTotal: period.cashInPaise / 100,
    cashOutTotal: period.cashOutPaise / 100,
    noCashCount: period.noCashCount,
    activeVoucherCount: period.items.length + period.pendingApprovals.length,
    includedVouchers: period.items,
    pendingApprovals: period.pendingApprovals,
    unclassified: period.unclassified,
    invalidVouchers: period.invalidVouchers,
    expectedCash: expectedValid && !blocked && openingReady ? expectedPaise / 100 : null,
    readyToClose: expectedValid && !blocked && openingReady && !laterClose,
    expectedInvalid: expectedPaise !== null && expectedPaise < 0,
    recentCloses,
    timeZone: CFG.TZ,
  };
}
function dailyOperationsSummary_(user, req) {
  need_(user, 'cashClose');
  const request = req || {};
  const requestedDate = readModelDate_(request.date, 'business');
  const preview = cashClosePreview_(user, { date: requestedDate || todayIso_(0) });
  const closed = preview.closed === true;
  const close = closed ? preview.close : null;
  const pendingApprovals = Array.isArray(preview.pendingApprovals) ? preview.pendingApprovals : [];
  const unclassified = Array.isArray(preview.unclassified) ? preview.unclassified : [];
  const invalidVouchers = Array.isArray(preview.invalidVouchers) ? preview.invalidVouchers : [];
  const blockedByLaterClose = !closed && preview.blockedByLaterClose === true;
  const hasExceptions =
    pendingApprovals.length > 0 || unclassified.length > 0 || invalidVouchers.length > 0;
  let status = 'REVIEW_REQUIRED';
  if (closed) status = 'CLOSED';
  else if (blockedByLaterClose) status = 'BLOCKED_BY_LATER_CLOSE';
  else if (hasExceptions) status = 'BLOCKED';
  else if (preview.openingCash === null || preview.openingCash === undefined) {
    status = 'OPENING_CASH_REQUIRED';
  } else if (preview.readyToClose === true) status = 'READY_TO_CLOSE';

  const includedVouchers =
    close && Array.isArray(close.includedVouchers) ? close.includedVouchers : [];
  const noCashCount = closed
    ? includedVouchers.filter(function (voucher) {
        return voucher.cashImpact === 'NO_CASH';
      }).length
    : Number.isSafeInteger(preview.noCashCount) && preview.noCashCount >= 0
      ? preview.noCashCount
      : 0;

  return {
    date: String(preview.date || requestedDate || todayIso_(0)),
    timeZone: String(preview.timeZone || CFG.TZ),
    status: status,
    closed: closed,
    readyToClose: !closed && preview.readyToClose === true,
    blockedByLaterClose: blockedByLaterClose,
    laterCloseDate: blockedByLaterClose ? String(preview.laterCloseDate || '') : '',
    activeVoucherCount: closed
      ? close.includedVoucherCount
      : Number.isSafeInteger(preview.activeVoucherCount) && preview.activeVoucherCount >= 0
        ? preview.activeVoucherCount
        : 0,
    cashInTotal: closed ? close.cashInTotal : preview.cashInTotal,
    cashOutTotal: closed ? close.cashOutTotal : preview.cashOutTotal,
    noCashCount: noCashCount,
    pendingApprovalCount: closed ? 0 : pendingApprovals.length,
    unclassifiedCount: closed ? 0 : unclassified.length,
    invalidVoucherCount: closed ? 0 : invalidVouchers.length,
    openingCashRequired:
      !closed &&
      preview.requiresManualOpening === true &&
      (preview.openingCash === null || preview.openingCash === undefined),
    openingReady: closed || preview.openingReady === true,
    expectedCash: closed ? close.expectedCash : preview.expectedCash,
    countedCash: closed ? close.countedCash : null,
    variance: closed ? close.variance : null,
  };
}

function createCashClose_(user, req) {
  need_(user, 'cashClose');
  const date = String(req.date || '').trim();
  if (!validDate_(date) || date > todayIso_(0))
    throw err_('Choose a valid business date that is not in the future.', 'VALIDATION');
  const requestId = clientId_(req.requestId);
  if (!requestId) throw err_('A close request ID is required. Refresh and retry.', 'VALIDATION');
  const countedPaise = cashCloseAmountPaise_(req.countedCash, 'counted cash');
  const varianceReason = clean_(req.varianceReason, 200);
  const previousDate = cashClosePreviousDate_(date),
    closes = readAll_('CashCloses');
  const sameDate = closes.filter(function (row) {
    return (
      String(row.BusinessDate || '') === date &&
      String(row.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER
    );
  })[0];
  const previous = closes.filter(function (row) {
    return (
      String(row.BusinessDate || '') === previousDate &&
      String(row.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER
    );
  })[0];
  let openingPaise,
    openingSource,
    openingReason = '',
    openingCloseId = '';
  if (previous) {
    openingPaise = cashCloseAmountNumber_(previous.CountedCash, 'prior counted cash');
    openingSource = 'PREVIOUS_CLOSE';
    openingCloseId = String(previous.CloseID || '');
  } else {
    openingPaise = cashCloseAmountPaise_(req.openingCash, 'opening cash');
    openingSource = 'MANUAL';
    openingReason = clean_(req.openingReason, 200);
    if (openingReason.length < 3)
      throw err_(
        'Explain the manual opening amount or gap in at least 3 characters.',
        'VALIDATION',
      );
  }
  const payload = cashClosePayload_(
    date,
    openingPaise,
    openingSource,
    openingReason,
    countedPaise,
    varianceReason,
  );
  const existingRequest = closes.filter(function (row) {
    return String(row.RequestID || '') === requestId;
  })[0];
  if (existingRequest) {
    if (String(existingRequest.RequestPayload || '') === payload)
      return cashCloseOut_(existingRequest);
    throw err_(
      'This close request ID was already used with different values. Refresh and review the existing close.',
      'IDEMPOTENCY_CONFLICT',
    );
  }
  if (sameDate)
    throw err_(
      'This business date is already closed. The original close cannot be overwritten.',
      'CASH_CLOSE_EXISTS',
    );
  const laterDates = closes.filter(function (row) {
    return (
      String(row.DrawerKey || CASH_CLOSE_DRAWER) === CASH_CLOSE_DRAWER &&
      String(row.BusinessDate || '') > date
    );
  });
  laterDates.sort(function (a, b) {
    return String(a.BusinessDate || '').localeCompare(String(b.BusinessDate || ''));
  });
  const laterClose = laterDates[0];
  if (laterClose)
    throw err_(
      'Cannot close ' +
        date +
        ' because the later business date ' +
        String(laterClose.BusinessDate || '') +
        ' is already closed. Finalize dates in chronological order; no close was saved.',
      'CASH_CLOSE_OUT_OF_ORDER',
    );
  const period = cashCloseCalculatePeriod_(date);
  if (period.pendingApprovals.length) {
    const ids = period.pendingApprovals
      .slice(0, 8)
      .map(function (row) {
        return row.no;
      })
      .join(', ');
    throw err_(
      'Cannot close this date: ' +
        period.pendingApprovals.length +
        ' active payment voucher(s) are not approved' +
        (ids ? ' (' + ids + ')' : '') +
        '. Approve or cancel them first; no close was saved.',
      'CASH_CLOSE_APPROVAL_PENDING',
    );
  }
  if (period.unclassified.length) {
    const ids = period.unclassified
      .slice(0, 8)
      .map(function (row) {
        return row.no;
      })
      .join(', ');
    throw err_(
      'Cannot close this date: ' +
        period.unclassified.length +
        ' active voucher(s) have UNCLASSIFIED cash impact' +
        (ids ? ' (' + ids + ')' : '') +
        '. Classify them first; no close was saved.',
      'CASH_CLOSE_UNCLASSIFIED',
    );
  }
  if (period.invalidVouchers.length) {
    const ids = period.invalidVouchers
      .slice(0, 8)
      .map(function (row) {
        return row.no;
      })
      .join(', ');
    throw err_(
      'Cannot close this date because ' +
        period.invalidVouchers.length +
        ' voucher row(s) have invalid status, type, identity, or amount data' +
        (ids ? ' (' + ids + ')' : '') +
        '. Correct the source records first; no close was saved.',
      'CASH_CLOSE_DATA',
    );
  }
  const expectedPaise = openingPaise + period.cashInPaise - period.cashOutPaise;
  if (!Number.isSafeInteger(expectedPaise) || expectedPaise < 0)
    throw err_(
      'Expected cash is invalid or negative. Review the opening amount and cash-impact classifications; no close was saved.',
      'CASH_CLOSE_DATA',
    );
  const variancePaise = countedPaise - expectedPaise;
  if (variancePaise !== 0 && varianceReason.length < 3)
    throw err_('Explain the non-zero cash variance in at least 3 characters.', 'VALIDATION');
  const includedIds = period.items.map(function (row) {
    return row.id;
  });
  const includedVouchers = JSON.stringify(period.items),
    includedVoucherIds = JSON.stringify(includedIds);
  if (includedVouchers.length > 45000 || includedVoucherIds.length > 45000)
    throw err_(
      'This date has too many voucher details for one close snapshot. No close was saved; contact the owner before retrying.',
      'CASH_CLOSE_DATA',
    );
  const close = {
    CloseID: Utilities.getUuid(),
    BusinessDate: date,
    DrawerKey: CASH_CLOSE_DRAWER,
    OpeningCash: openingPaise / 100,
    OpeningSource: openingSource,
    OpeningCloseID: openingCloseId,
    OpeningReason: openingReason,
    CashInTotal: period.cashInPaise / 100,
    CashOutTotal: period.cashOutPaise / 100,
    ExpectedCash: expectedPaise / 100,
    CountedCash: countedPaise / 100,
    Variance: variancePaise / 100,
    VarianceReason: varianceReason,
    IncludedVoucherCount: period.items.length,
    IncludedVoucherIds: includedVoucherIds,
    IncludedVouchers: includedVouchers,
    CreatedBy: user.email,
    CreatedAt: nowIso_(),
    TimeZone: CFG.TZ,
    RequestID: requestId,
    RequestPayload: payload,
  };
  // The close row is the commit point: original totals and inclusion snapshot are stored together.
  appendRows_('CashCloses', [close]);
  auditEvent_(
    user,
    'CASH_CLOSE',
    date,
    'DAILY_CASH_CLOSE_FINALIZED',
    'cashClose',
    close.CloseID,
    varianceReason || openingReason,
    [
      { field: 'businessDate', before: null, after: date },
      { field: 'openingCash', before: null, after: close.OpeningCash },
      { field: 'openingSource', before: null, after: close.OpeningSource },
      { field: 'cashInTotal', before: null, after: close.CashInTotal },
      { field: 'cashOutTotal', before: null, after: close.CashOutTotal },
      { field: 'expectedCash', before: null, after: close.ExpectedCash },
      { field: 'countedCash', before: null, after: close.CountedCash },
      { field: 'variance', before: null, after: close.Variance },
      { field: 'includedVoucherCount', before: null, after: close.IncludedVoucherCount },
    ],
    'Daily cash close finalized',
  );
  return cashCloseOut_(close);
}
function recordCashCloseCorrection_(user, req) {
  need_(user, 'cashClose');
  const closeId = clean_(req.closeId, 100);
  const close = readAll_('CashCloses').filter(function (row) {
    return String(row.CloseID || '') === closeId;
  })[0];
  if (!close) throw err_('Select a saved cash close before recording a correction.', 'NOT_FOUND');
  const type = String(req.type || 'OTHER');
  if (CASH_CLOSE_CORRECTION_TYPES.indexOf(type) < 0)
    throw err_('Choose a valid correction type.', 'VALIDATION');
  const voucherId = clean_(req.voucherId, 100);
  let includedIds;
  try {
    const raw = String(close.IncludedVoucherIds || '');
    if (!raw) throw new Error('Missing voucher IDs');
    includedIds = JSON.parse(raw);
    if (!Array.isArray(includedIds)) throw new Error('Invalid voucher IDs');
  } catch (error) {
    throw err_(
      'Saved cash-close voucher IDs are invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  if (voucherId && includedIds.indexOf(voucherId) < 0)
    throw err_(
      'The linked voucher is not part of this close snapshot. Review the voucher ID.',
      'VALIDATION',
    );
  const details = clean_(req.details, 1000),
    reason = clean_(req.reason, 200);
  if (details.length < 3)
    throw err_('Describe the correction in at least 3 characters.', 'VALIDATION');
  if (reason.length < 3)
    throw err_('Give a correction reason in at least 3 characters.', 'VALIDATION');
  const record = {
    CorrectionID: Utilities.getUuid(),
    CloseID: String(close.CloseID),
    BusinessDate: String(close.BusinessDate),
    VoucherID: voucherId,
    CorrectionType: type,
    Details: details,
    Reason: reason,
    CreatedBy: user.email,
    CreatedAt: nowIso_(),
  };
  appendRows_('CashCloseCorrections', [record]);
  auditEvent_(
    user,
    'CASH_CLOSE_CORRECTION',
    String(close.BusinessDate),
    'CASH_CLOSE_CORRECTION_RECORDED',
    'cashClose',
    String(close.CloseID),
    reason,
    [
      { field: 'correctionType', before: null, after: type },
      { field: 'details', before: null, after: details },
      { field: 'voucherId', before: null, after: voucherId || '' },
    ],
    'Attributed correction note recorded; close totals unchanged',
  );
  return cashCloseCorrectionOut_(record);
}
