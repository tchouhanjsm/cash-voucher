/* ============ bounded register and dashboard read models ============ */
/*
 * Keep full-ledger processing on the server. Bootstrap deliberately returns only a small
 * recent slice for quick-entry defaults; the dashboard and register use these read models
 * so their response sizes stay proportional to the visible result, not the ledger history.
 */
const READ_MODEL_PAGE_LIMIT = 200;
const READ_MODEL_BOOTSTRAP_LIMIT = 200;
const READ_MODEL_APPROVED_STATUSES = ['NOT_REQUIRED', 'APPROVED'];
const READ_MODEL_PAYMENT_METHOD_FILTERS = [
  'ALL',
  'CASH',
  'UPI',
  'BANK_TRANSFER',
  'UNRECORDED',
  'UNRECOGNIZED',
];

function readModelPaymentMethodKey_(value) {
  const method = typeof value === 'string' ? value.trim() : '';
  if (!method) return 'UNRECORDED';
  return ['CASH', 'UPI', 'BANK_TRANSFER'].indexOf(method) >= 0 ? method : 'UNRECOGNIZED';
}

function readModelPaymentMethodLabel_(value) {
  const key = readModelPaymentMethodKey_(value);
  if (key === 'UNRECORDED') return 'Not recorded';
  if (key === 'UNRECOGNIZED') return 'Unrecognized method';
  return key === 'BANK_TRANSFER' ? 'Bank transfer' : key === 'CASH' ? 'Cash' : 'UPI';
}

function readModelCanView_(user) {
  return can_(user, 'viewAll') || can_(user, 'viewOwn');
}

function readModelRows_(user) {
  if (!readModelCanView_(user)) {
    throw err_('You do not have permission to view vouchers.', 'FORBIDDEN');
  }
  const seeAll = can_(user, 'viewAll');
  const email = String(user.email || '').toLowerCase();
  return readAll_('Vouchers').filter(function (row) {
    return seeAll || String(row.CreatedBy || '').toLowerCase() === email;
  });
}

function readModelDate_(value, label) {
  if (value === undefined || value === null || value === '') return '';
  const date = String(value);
  if (!validDate_(date)) throw err_('Invalid ' + label + ' date filter.', 'VALIDATION');
  return date;
}

function readModelFilterText_(value, label, maxLength) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw err_('Invalid ' + label + ' filter.', 'VALIDATION');
  const text = value.trim();
  if (text.length > maxLength) throw err_(label + ' filter is too long.', 'VALIDATION');
  return text;
}

function readModelAmount_(row) {
  const raw = row && row.Amount;
  if (
    raw === '' ||
    raw === null ||
    raw === undefined ||
    typeof raw === 'boolean' ||
    (typeof raw !== 'string' && typeof raw !== 'number')
  ) {
    return { valid: false, paise: 0 };
  }
  const amount = Number(raw);
  if (!isFinite(amount) || amount <= 0 || amount > CFG.MAX_AMOUNT) {
    return { valid: false, paise: 0 };
  }
  const paise = Math.round(amount * 100);
  return Number.isSafeInteger(paise) ? { valid: true, paise: paise } : { valid: false, paise: 0 };
}

function readModelApproval_(row) {
  return row.Type === 'PAYMENT' ? approvalStatus_(row) : 'NOT_REQUIRED';
}

function readModelIsApprovedPayment_(row) {
  return (
    row.Type === 'PAYMENT' && READ_MODEL_APPROVED_STATUSES.indexOf(readModelApproval_(row)) >= 0
  );
}

function readModelCreatedAt_(row) {
  return tsStr_(row.CreatedAt);
}

function readModelDateValue_(row) {
  return isoDate_(row.Date);
}

function readModelNo_(row) {
  return (row.Type === 'RECEIPT' ? 'R-' : '') + String(row.VoucherNo || '');
}

function readModelHasMalformedRecord_(row) {
  return (
    !String(row.VoucherID || '').trim() ||
    !validDate_(readModelDateValue_(row)) ||
    ['PAYMENT', 'RECEIPT'].indexOf(row.Type) < 0 ||
    ['ACTIVE', 'CANCELLED'].indexOf(String(row.Status || 'ACTIVE')) < 0
  );
}

function readModelGroup_(rows, keyForRow) {
  const groups = Object.create(null);
  rows.forEach(function (row) {
    const key = String(keyForRow(row) || 'Other');
    if (!Object.prototype.hasOwnProperty.call(groups, key)) {
      groups[key] = { k: key, n: 0, paise: 0 };
    }
    const amount = readModelAmount_(row);
    groups[key].n++;
    if (amount.valid) groups[key].paise += amount.paise;
  });
  return Object.keys(groups)
    .map(function (key) {
      const item = groups[key];
      return { k: item.k, n: item.n, s: item.paise / 100 };
    })
    .sort(function (a, b) {
      return b.s - a.s || String(a.k).localeCompare(String(b.k));
    });
}

function readModelSum_(rows) {
  return rows.reduce(function (total, row) {
    const amount = readModelAmount_(row);
    return total + (amount.valid ? amount.paise : 0);
  }, 0);
}

function checkVoucherDuplicates_(user, req) {
  if (!can_(user, 'bulk')) {
    throw err_('You do not have permission to run bulk imports.', 'FORBIDDEN');
  }
  const type = req.type;
  if (type !== 'PAYMENT' && type !== 'RECEIPT') {
    throw err_('Invalid bulk transaction type.', 'VALIDATION');
  }
  if (!Array.isArray(req.entries) || req.entries.length > 3000) {
    throw err_('Bulk duplicate check requires up to 3,000 entries.', 'VALIDATION');
  }

  const seenIndexes = Object.create(null);
  const candidates = req.entries.map(function (entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw err_('Invalid bulk duplicate-check entry.', 'VALIDATION');
    }
    const index = Number(entry.index);
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= 3000 ||
      Object.prototype.hasOwnProperty.call(seenIndexes, String(index))
    ) {
      throw err_('Invalid or duplicate bulk row index.', 'VALIDATION');
    }
    seenIndexes[String(index)] = true;

    const date = readModelDate_(entry.date, 'entry');
    const vendor = readModelFilterText_(entry.vendor, 'Vendor', 200);
    const amount = entry.amount;
    if (!date || !vendor) {
      throw err_('Bulk duplicate-check rows require a date and vendor.', 'VALIDATION');
    }
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0 || amount > CFG.MAX_AMOUNT) {
      throw err_('Bulk duplicate-check rows require a valid positive amount.', 'VALIDATION');
    }
    const paise = Math.round(amount * 100);
    if (!Number.isSafeInteger(paise) || paise <= 0) {
      throw err_('Invalid bulk duplicate-check amount precision.', 'VALIDATION');
    }
    return { index: index, date: date, vendor: vendor.toLowerCase(), paise: paise };
  });

  const existingKeys = Object.create(null);
  readModelRows_(user).forEach(function (row) {
    if (String(row.Status || 'ACTIVE') !== 'ACTIVE' || row.Type !== type) return;
    const date = readModelDateValue_(row);
    const vendor = String(row.Vendor || '')
      .trim()
      .toLowerCase();
    const amount = readModelAmount_(row);
    if (!date || !vendor || !amount.valid) return;
    existingKeys[JSON.stringify([type, date, vendor, amount.paise])] = true;
  });

  return {
    duplicateIndexes: candidates
      .filter(function (candidate) {
        const key = JSON.stringify([type, candidate.date, candidate.vendor, candidate.paise]);
        return Object.prototype.hasOwnProperty.call(existingKeys, key);
      })
      .map(function (candidate) {
        return candidate.index;
      }),
  };
}


function paymentDuplicateFingerprint_(entry) {
  return JSON.stringify([
    'PAYMENT',
    String(entry.date || ''),
    String(entry.vendorId || ''),
    String(entry.vendorType || ''),
    String(entry.vendor || '').trim().toLowerCase(),
    Math.round(Number(entry.amount) * 100),
  ]);
}

function paymentDuplicateCandidateKey_(voucher) {
  const clientId = String(voucher.ClientID || '').trim();
  if (clientId) return 'CLIENT:' + clientId;
  const voucherId = String(voucher.VoucherID || '').trim();
  if (voucherId) return 'VOUCHER:' + voucherId;
  return voucher._row ? 'ROW:' + String(voucher._row) : '';
}

function paymentDuplicateCandidates_(rows, entry) {
  if (entry.type !== 'PAYMENT') return [];
  const target = new Date(entry.date + 'T12:00:00Z').getTime();
  const expectedVendorId = String(entry.vendorId || '');

  return rows.filter(function (voucher) {
    if (!voucher || String(voucher.Status || 'ACTIVE') !== 'ACTIVE' || voucher.Type !== 'PAYMENT') {
      return false;
    }
    const existingVendorId = String(voucher.VendorID || '');
    const sameIdentity =
      expectedVendorId && existingVendorId
        ? expectedVendorId === existingVendorId
        : String(voucher.Vendor || '').trim().toLowerCase() ===
          String(entry.vendor || '').trim().toLowerCase();
    if (!sameIdentity) return false;
    if (Math.round(Number(voucher.Amount) * 100) !== Math.round(Number(entry.amount) * 100)) {
      return false;
    }
    const date = isoDate_(voucher.Date);
    const timestamp = new Date(date + 'T12:00:00Z').getTime();
    return (
      date &&
      isFinite(timestamp) &&
      isFinite(target) &&
      Math.abs(timestamp - target) / 86400000 <= 3 &&
      !!paymentDuplicateCandidateKey_(voucher)
    );
  });
}

function paymentDuplicateCandidateFingerprint_(voucher) {
  return {
    key: paymentDuplicateCandidateKey_(voucher),
    date: isoDate_(voucher.Date),
    vendorId: String(voucher.VendorID || ''),
    vendor: String(voucher.Vendor || '').trim().toLowerCase(),
    amountPaise: Math.round(Number(voucher.Amount) * 100),
    type: String(voucher.Type || ''),
    status: String(voucher.Status || 'ACTIVE'),
    voucherNo: String(voucher.VoucherNo || ''),
  };
}

function paymentDuplicateConfirmationToken_(user, entry, candidates, expiresAt) {
  const expiry = Number(expiresAt) || Date.now() + 5 * 60 * 1000;
  const candidateFingerprints = candidates
    .map(paymentDuplicateCandidateFingerprint_)
    .filter(function (candidate) { return !!candidate.key; })
    .sort(function (a, b) { return a.key.localeCompare(b.key); });
  const payload = JSON.stringify({
    user: String(user.email || '').trim().toLowerCase(),
    fingerprint: paymentDuplicateFingerprint_(entry),
    candidates: candidateFingerprints,
    expiresAt: expiry,
  });
  const pepper = String(props_().getProperty('PEPPER') || '');
  if (!pepper) throw err_('Duplicate confirmation is unavailable. Contact an administrator.', 'SERVER');
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, pepper),
  ).replace(/=+$/g, '');
  return String(expiry) + '.' + signature;
}

function paymentDuplicateConfirmationValid_(token, user, entry, candidates) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^\d+$/.test(parts[0])) return false;
  const expiry = Number(parts[0]);
  const now = Date.now();
  if (!isFinite(expiry) || expiry <= now || expiry > now + 5 * 60 * 1000 + 5000) return false;
  return token === paymentDuplicateConfirmationToken_(user, entry, candidates, expiry);
}

function checkPaymentDuplicates_(user, req) {
  need_(user, 'create');
  if (!Array.isArray(req.entries) || !req.entries.length || req.entries.length > CFG.MAX_NORMAL) {
    throw err_('Duplicate check requires between 1 and ' + CFG.MAX_NORMAL + ' entry rows.', 'VALIDATION');
  }

  const lookup = vendorIdLookup_();
  const existing = readAll_('Vouchers');
  const seenIndexes = Object.create(null);
  const batchRows = [];
  const results = req.entries.map(function (source, position) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw err_('Invalid duplicate-check entry.', 'VALIDATION');
    }
    const index = source.index === undefined ? position : Number(source.index);
    if (!Number.isSafeInteger(index) || index < 0 || index >= CFG.MAX_NORMAL ||
        Object.prototype.hasOwnProperty.call(seenIndexes, String(index))) {
      throw err_('Invalid or duplicate entry index.', 'VALIDATION');
    }
    seenIndexes[String(index)] = true;

    const type = source.type === undefined || source.type === '' ? 'PAYMENT' : source.type;
    if (type !== 'PAYMENT' && type !== 'RECEIPT') {
      throw err_('Invalid transaction type.', 'VALIDATION');
    }
    const date = String(source.date || '');
    if (!validDate_(date)) throw err_('Invalid entry date.', 'VALIDATION');
    const vendor = nameText_(source.vendor, 'Vendor name', 200);
    if (!vendor) throw err_('Payee is required.', 'VALIDATION');
    const amount = Math.round(finiteNumber_(source.amount, 'amount') * 100) / 100;
    if (amount <= 0 || amount > CFG.MAX_AMOUNT) throw err_('Invalid amount.', 'VALIDATION');
    const identity = resolveVendorIdentity_(vendor, source.vendorId, source.vendorType, lookup);
    const entry = {
      type: type,
      date: date,
      vendor: identity.vendor,
      vendorId: identity.vendorId,
      vendorType: identity.vendorType,
      amount: amount,
      clientId: clientId_(source.clientId),
    };
    const candidates = paymentDuplicateCandidates_(existing.concat(batchRows), entry);
    const visible = candidates.filter(function (candidate) { return canSee_(user, candidate); });
    const result = {
      index: index,
      duplicateCount: candidates.length,
      hiddenCount: candidates.length - visible.length,
      matches: visible.slice(0, 4).map(function (candidate) {
        return {
          voucherNo: candidate.VoucherNo ? String(candidate.VoucherNo) : '',
          date: isoDate_(candidate.Date),
          vendor: String(candidate.Vendor || ''),
          amount: Number(candidate.Amount),
          inBatch: candidate._duplicateBatch === true,
          row: candidate._batchIndex || 0,
        };
      }),
      confirmationToken: candidates.length
        ? paymentDuplicateConfirmationValid_(source.confirmationToken, user, entry, candidates)
          ? source.confirmationToken
          : paymentDuplicateConfirmationToken_(user, entry, candidates)
        : '',
    };
    if (type === 'PAYMENT') {
      batchRows.push({
        _duplicateBatch: true,
        _batchIndex: index + 1,
        ClientID: entry.clientId || 'CHECK-ROW-' + index,
        Date: entry.date,
        Vendor: entry.vendor,
        VendorID: entry.vendorId,
        VendorType: entry.vendorType,
        Amount: entry.amount,
        Type: 'PAYMENT',
        Status: 'ACTIVE',
        CreatedBy: user.email,
      });
    }
    return result;
  });
  return { results: results };
}

function registerPage_(user, req) {
  const seeAll = can_(user, 'viewAll');
  let rows = readModelRows_(user);
  const query = readModelFilterText_(req.q, 'Search', 120).toLowerCase();
  const vendor = readModelFilterText_(req.vendor, 'Vendor', 200);
  const category = readModelFilterText_(req.cat, 'Category', 120);
  const type = readModelFilterText_(req.t, 'Transaction type', 20);
  const status = readModelFilterText_(req.st, 'Status', 20) || 'ACTIVE';
  const approval = readModelFilterText_(req.approval, 'Approval status', 30) || 'ALL';
  const paymentMethod = readModelFilterText_(req.paymentMethod, 'Payment method', 20) || 'ALL';
  const createdBy = readModelFilterText_(req.user, 'User', 254).toLowerCase();
  const from = readModelDate_(req.from, 'start');
  const to = readModelDate_(req.to, 'end');
  if (from && to && from > to)
    throw err_('The start date must be on or before the end date.', 'VALIDATION');
  if (['', 'PAYMENT', 'RECEIPT'].indexOf(type) < 0)
    throw err_('Invalid transaction type filter.', 'VALIDATION');
  if (['ACTIVE', 'CANCELLED', 'ALL'].indexOf(status) < 0)
    throw err_('Invalid status filter.', 'VALIDATION');
  if (
    ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'NOT_REQUIRED', 'REVIEW_REQUIRED'].indexOf(
      approval,
    ) < 0
  ) {
    throw err_('Invalid approval status filter.', 'VALIDATION');
  }
  if (READ_MODEL_PAYMENT_METHOD_FILTERS.indexOf(paymentMethod) < 0) {
    throw err_('Invalid payment method filter.', 'VALIDATION');
  }
  if (createdBy && !seeAll) throw err_('You cannot filter other users’ vouchers.', 'FORBIDDEN');

  const offsetValue =
    req.offset === undefined || req.offset === null || req.offset === '' ? 0 : Number(req.offset);
  const limitValue =
    req.limit === undefined || req.limit === null || req.limit === '' ? 100 : Number(req.limit);
  if (!Number.isSafeInteger(offsetValue) || offsetValue < 0 || offsetValue > 1000000) {
    throw err_('Invalid register page offset.', 'VALIDATION');
  }
  if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > READ_MODEL_PAGE_LIMIT) {
    throw err_(
      'Register page size must be between 1 and ' + READ_MODEL_PAGE_LIMIT + '.',
      'VALIDATION',
    );
  }

  const vendorSet = Object.create(null);
  const userSet = Object.create(null);
  const dataQuality = { malformedRecordCount: 0, invalidAmountCount: 0, malformedFieldCount: 0 };
  rows.forEach(function (row) {
    if (readModelHasMalformedRecord_(row)) {
      dataQuality.malformedRecordCount++;
      return;
    }
    const name = String(row.Vendor || '');
    if (name) vendorSet[name] = true;
    const email = String(row.CreatedBy || '').toLowerCase();
    if (email) userSet[email] = true;
    if (!readModelAmount_(row).valid && String(row.Status || 'ACTIVE') === 'ACTIVE') {
      dataQuality.invalidAmountCount++;
    }
    ['Vendor', 'Category', 'CreatedBy', 'Type', 'Status'].forEach(function (key) {
      if (row[key] === undefined || row[key] === null) dataQuality.malformedFieldCount++;
    });
  });

  rows = rows.filter(function (row) {
    if (readModelHasMalformedRecord_(row)) return false;
    const rowDate = readModelDateValue_(row);
    const rowType = row.Type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT';
    const rowStatus = String(row.Status || 'ACTIVE');
    const rowApproval = readModelApproval_(row);
    const rowPaymentMethod = readModelPaymentMethodKey_(row.PaymentMethod);
    const no = readModelNo_(row).toLowerCase();
    const rowVendor = String(row.Vendor || '');
    const rowCategory = String(row.Category || '');
    const rowUser = String(row.CreatedBy || '').toLowerCase();
    const rowNotes = String(row.Notes || '');
    return (
      (status === 'ALL' || rowStatus === status) &&
      (approval === 'ALL' || rowApproval === approval) &&
      (paymentMethod === 'ALL' || rowPaymentMethod === paymentMethod) &&
      (!vendor || rowVendor === vendor) &&
      (!category || rowCategory === category) &&
      (!type || rowType === type) &&
      (!createdBy || rowUser === createdBy) &&
      (!from || rowDate >= from) &&
      (!to || rowDate <= to) &&
      (!query ||
        no.indexOf(query) >= 0 ||
        rowVendor.toLowerCase().indexOf(query) >= 0 ||
        rowNotes.toLowerCase().indexOf(query) >= 0)
    );
  });

  rows.sort(function (a, b) {
    return (
      readModelCreatedAt_(b).localeCompare(readModelCreatedAt_(a)) ||
      Number(b.VoucherNo || 0) - Number(a.VoucherNo || 0)
    );
  });

  const filteredRows = rows;
  const activeRows = filteredRows.filter(function (row) {
    return String(row.Status || 'ACTIVE') === 'ACTIVE';
  });
  const paidRows = activeRows.filter(readModelIsApprovedPayment_);
  const receivedRows = activeRows.filter(function (row) {
    return row.Type === 'RECEIPT';
  });
  const approvalExceptionCount = activeRows.filter(function (row) {
    return row.Type === 'PAYMENT' && !readModelIsApprovedPayment_(row);
  }).length;
  const invalidAmountCount = activeRows.filter(function (row) {
    return !readModelAmount_(row).valid;
  }).length;
  const resultItems = filteredRows.slice(offsetValue, offsetValue + limitValue).map(vOut_);
  return {
    items: resultItems,
    offset: offsetValue,
    limit: limitValue,
    totalCount: filteredRows.length,
    hasMore: offsetValue + resultItems.length < filteredRows.length,
    totals: {
      paid: readModelSum_(paidRows) / 100,
      received: readModelSum_(receivedRows) / 100,
      approvalExceptionCount: approvalExceptionCount,
      invalidAmountCount: invalidAmountCount,
      malformedRecordCount: dataQuality.malformedRecordCount,
      malformedFieldCount: dataQuality.malformedFieldCount,
    },
    facets: {
      vendors: Object.keys(vendorSet).sort(function (a, b) {
        return a.localeCompare(b);
      }),
      users: Object.keys(userSet).sort(),
    },
  };
}

function dashboardSummary_(user, req) {
  let rows = readModelRows_(user);
  const malformedRecordCount = rows.filter(readModelHasMalformedRecord_).length;
  rows = rows.filter(function (row) {
    return !readModelHasMalformedRecord_(row);
  });
  const from = readModelDate_(req.from, 'start');
  const to = readModelDate_(req.to, 'end');
  if (!from || !to || from > to) {
    throw err_('Choose a valid dashboard date range.', 'VALIDATION');
  }

  const startDate = new Date(from + 'T00:00:00Z');
  const endDate = new Date(to + 'T00:00:00Z');
  const periodDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (!Number.isSafeInteger(periodDays) || periodDays < 1 || periodDays > 3660) {
    throw err_('Dashboard date range cannot exceed ten years.', 'VALIDATION');
  }
  const previousFromDate = new Date(startDate.getTime() - periodDays * 86400000);
  const previousFrom = previousFromDate.toISOString().slice(0, 10);
  const previousTo = new Date(startDate.getTime() - 86400000).toISOString().slice(0, 10);
  const currentDate = todayIso_(0);
  const active = rows.filter(function (row) {
    return String(row.Status || 'ACTIVE') === 'ACTIVE';
  });
  const approvedPayments = active.filter(readModelIsApprovedPayment_);
  const receipts = active.filter(function (row) {
    return row.Type === 'RECEIPT';
  });
  const previousPayments = approvedPayments.filter(function (row) {
    const date = readModelDateValue_(row);
    return date >= previousFrom && date <= previousTo;
  });
  const currentPayments = approvedPayments.filter(function (row) {
    const date = readModelDateValue_(row);
    return date >= from && date <= to;
  });
  const currentReceipts = receipts.filter(function (row) {
    const date = readModelDateValue_(row);
    return date >= from && date <= to;
  });
  const todayPayments = approvedPayments.filter(function (row) {
    return readModelDateValue_(row) === currentDate;
  });
  const largest = currentPayments.reduce(function (best, row) {
    const amount = readModelAmount_(row);
    return !amount.valid || (best && amount.paise <= best.paise)
      ? best
      : { paise: amount.paise, vendor: String(row.Vendor || '') };
  }, null);
  const malformedFieldCount = rows.reduce(function (count, row) {
    return (
      count +
      ['Vendor', 'Category', 'CreatedBy', 'Type', 'Status'].filter(function (key) {
        return row[key] === undefined || row[key] === null;
      }).length
    );
  }, 0);
  const invalidAmountCount = active.filter(function (row) {
    return !readModelAmount_(row).valid;
  }).length;
  const approvalExceptionCount = active.filter(function (row) {
    return row.Type === 'PAYMENT' && !readModelIsApprovedPayment_(row);
  }).length;
  const trendMonthly = periodDays > 62;
  const trend = Object.create(null);
  currentPayments.forEach(function (row) {
    const date = readModelDateValue_(row);
    const key = trendMonthly ? date.slice(0, 7) : date;
    trend[key] = (trend[key] || 0) + readModelAmount_(row).paise;
  });
  const keys = [];
  if (trendMonthly) {
    const cursor = new Date(from.slice(0, 7) + '-01T00:00:00Z');
    const finalMonth = to.slice(0, 7);
    while (cursor.toISOString().slice(0, 7) <= finalMonth) {
      keys.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  } else {
    for (let index = 0; index < periodDays; index++) {
      keys.push(new Date(startDate.getTime() + index * 86400000).toISOString().slice(0, 10));
    }
  }
  const currentAmountPaise = readModelSum_(currentPayments);
  const previousAmountPaise = readModelSum_(previousPayments);
  const receiptAmountPaise = readModelSum_(currentReceipts);
  const allPaymentAmountPaise = readModelSum_(approvedPayments);
  const allReceiptAmountPaise = readModelSum_(receipts);
  const openingBalancePaise = can_(user, 'viewAll')
    ? Math.round((Number(settings_().openingBalance || 0) || 0) * 100)
    : 0;

  return {
    from: from,
    to: to,
    periodDays: periodDays,
    trendMonthly: trendMonthly,
    trend: keys.map(function (key) {
      return { date: key, amount: (trend[key] || 0) / 100 };
    }),
    paid: currentAmountPaise / 100,
    previousPaid: previousAmountPaise / 100,
    paymentCount: currentPayments.length,
    validPaymentCount: currentPayments.filter(function (row) {
      return readModelAmount_(row).valid;
    }).length,
    largest: largest ? { amount: largest.paise / 100, vendor: largest.vendor } : null,
    todayPaid: readModelSum_(todayPayments) / 100,
    todayPaymentCount: todayPayments.length,
    received: receiptAmountPaise / 100,
    receiptCount: currentReceipts.length,
    bookBalance: (openingBalancePaise + allReceiptAmountPaise - allPaymentAmountPaise) / 100,
    topVendors: readModelGroup_(currentPayments, function (row) {
      return row.Vendor || 'Other';
    }).slice(0, 10),
    byCategory: readModelGroup_(currentPayments, function (row) {
      return row.Category || 'Other';
    }).slice(0, 10),
    byPaymentMethod: readModelGroup_(currentPayments, function (row) {
      return readModelPaymentMethodLabel_(row.PaymentMethod);
    }).slice(0, 5),
    byTeamMember: can_(user, 'viewAll')
      ? readModelGroup_(currentPayments, function (row) {
          return row.CreatedBy || 'Unknown';
        }).slice(0, 10)
      : [],
    approvalExceptionCount: approvalExceptionCount,
    invalidAmountCount: invalidAmountCount,
    malformedRecordCount: malformedRecordCount,
    malformedFieldCount: malformedFieldCount,
  };
}
