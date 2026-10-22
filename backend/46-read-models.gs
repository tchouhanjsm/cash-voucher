/* ============ bounded register and dashboard read models ============ */
/*
 * Keep full-ledger processing on the server. Bootstrap deliberately returns only a small
 * recent slice for quick-entry defaults; the dashboard and register use these read models
 * so their response sizes stay proportional to the visible result, not the ledger history.
 */
const READ_MODEL_PAGE_LIMIT = 200;
const READ_MODEL_BOOTSTRAP_LIMIT = 200;
const READ_MODEL_APPROVED_STATUSES = ['NOT_REQUIRED', 'APPROVED'];

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

function registerPage_(user, req) {
  const seeAll = can_(user, 'viewAll');
  let rows = readModelRows_(user);
  const query = readModelFilterText_(req.q, 'Search', 120).toLowerCase();
  const vendor = readModelFilterText_(req.vendor, 'Vendor', 200);
  const category = readModelFilterText_(req.cat, 'Category', 120);
  const type = readModelFilterText_(req.t, 'Transaction type', 20);
  const status = readModelFilterText_(req.st, 'Status', 20) || 'ACTIVE';
  const approval = readModelFilterText_(req.approval, 'Approval status', 30) || 'ALL';
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
    const name = String(row.Vendor || '');
    if (name) vendorSet[name] = true;
    const email = String(row.CreatedBy || '').toLowerCase();
    if (email) userSet[email] = true;
    if (readModelHasMalformedRecord_(row)) dataQuality.malformedRecordCount++;
    if (!readModelAmount_(row).valid && String(row.Status || 'ACTIVE') === 'ACTIVE') {
      dataQuality.invalidAmountCount++;
    }
    ['Vendor', 'Category', 'CreatedBy', 'Type', 'Status'].forEach(function (key) {
      if (row[key] === undefined || row[key] === null) dataQuality.malformedFieldCount++;
    });
  });

  rows = rows.filter(function (row) {
    const rowDate = readModelDateValue_(row);
    const rowType = row.Type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT';
    const rowStatus = String(row.Status || 'ACTIVE');
    const rowApproval = readModelApproval_(row);
    const no = readModelNo_(row).toLowerCase();
    const rowVendor = String(row.Vendor || '');
    const rowCategory = String(row.Category || '');
    const rowUser = String(row.CreatedBy || '').toLowerCase();
    const rowNotes = String(row.Notes || '');
    return (
      (status === 'ALL' || rowStatus === status) &&
      (approval === 'ALL' || rowApproval === approval) &&
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
  const rows = readModelRows_(user);
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
  const scopedAllVouchers = rows;
  const malformedRecordCount = scopedAllVouchers.filter(readModelHasMalformedRecord_).length;
  const malformedFieldCount = scopedAllVouchers.reduce(function (count, row) {
    return (
      count +
      ['Vendor', 'Category', 'CreatedBy', 'Type', 'Status'].filter(function (key) {
        return row[key] === undefined || row[key] === null;
      }).length
    );
  }, 0);
  const invalidAmountCount = approvedPayments.concat(receipts).filter(function (row) {
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
