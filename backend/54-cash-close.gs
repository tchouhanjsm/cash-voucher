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
      return isoDate_(voucher.Date) === date && String(voucher.Status || '') === 'ACTIVE';
    })
    .sort(function (a, b) {
      return Number(a.VoucherNo) - Number(b.VoucherNo);
    })
    .forEach(function (voucher) {
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
function cashCloseOut_(row) {
  let vouchers = [],
    ids = [];
  try {
    const raw = String(row.IncludedVouchers || '');
    if (!raw) throw new Error('Missing voucher snapshot');
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('Invalid voucher snapshot');
    vouchers = value.filter(function (item) {
      return item && typeof item === 'object' && typeof item.id === 'string';
    });
  } catch (error) {
    throw err_(
      'Saved cash-close voucher snapshot is invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  try {
    const raw = String(row.IncludedVoucherIds || '');
    if (!raw) throw new Error('Missing voucher ID snapshot');
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error('Invalid voucher ID snapshot');
    ids = value.filter(function (id) {
      return typeof id === 'string';
    });
  } catch (error) {
    throw err_(
      'Saved cash-close voucher IDs are invalid. Stop and inspect the close record.',
      'CASH_CLOSE_DATA',
    );
  }
  return {
    id: String(row.CloseID || ''),
    date: String(row.BusinessDate || ''),
    drawerKey: String(row.DrawerKey || CASH_CLOSE_DRAWER),
    openingCash: Number(row.OpeningCash),
    openingSource: String(row.OpeningSource || ''),
    openingCloseId: String(row.OpeningCloseID || ''),
    openingReason: String(row.OpeningReason || ''),
    cashInTotal: Number(row.CashInTotal),
    cashOutTotal: Number(row.CashOutTotal),
    expectedCash: Number(row.ExpectedCash),
    countedCash: Number(row.CountedCash),
    variance: Number(row.Variance),
    varianceReason: String(row.VarianceReason || ''),
    includedVoucherCount: Number(row.IncludedVoucherCount) || ids.length || vouchers.length,
    includedVoucherIds: ids,
    includedVouchers: vouchers,
    createdBy: String(row.CreatedBy || ''),
    createdAt: tsStr_(row.CreatedAt),
    timeZone: String(row.TimeZone || CFG.TZ),
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
        ' active voucher(s) have invalid amounts' +
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
