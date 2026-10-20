/* ============ vouchers ============ */
function validDate_(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return (
    !isNaN(t.getTime()) &&
    t.toISOString().slice(0, 10) === d &&
    d <= todayIso_(1) &&
    d >= '2000-01-01'
  );
}
function saveReceipt_(r, no, i) {
  if (!r || !/^image\/(jpeg|png|webp)$/.test(r.mime))
    throw err_('Receipt must be a JPG, PNG or WebP image.');
  if (!r.data || r.data.length > CFG.MAX_B64) throw err_('Receipt image is too large.');
  const ext = r.mime.split('/')[1].replace('jpeg', 'jpg');
  const blob = Utilities.newBlob(
    Utilities.base64Decode(r.data),
    r.mime,
    'V' + no + '-' + (Date.now() % 100000) + '-' + i + '.' + ext,
  );
  return DriveApp.getFolderById(props_().getProperty('RECEIPT_FOLDER_ID')).createFile(blob).getId();
}
function nextNumber_(configured, existing, isReceipt, fallback) {
  const current = positiveInteger_(
    configured || String(fallback),
    isReceipt ? 'next receipt number' : 'next voucher number',
  );
  const max = existing
    .filter(function (v) {
      return (v.Type === 'RECEIPT') === isReceipt;
    })
    .reduce(function (m, v) {
      return Math.max(m, positiveInteger_(v.VoucherNo, 'voucher number'));
    }, 0);
  return Math.max(current, max + 1);
}

const CASH_IMPACT_CHOICES = ['CASH_IN', 'CASH_OUT', 'NO_CASH'];
function cashImpact_(value, prefix) {
  if (typeof value !== 'string' || CASH_IMPACT_CHOICES.indexOf(value) < 0) {
    throw err_((prefix || '') + 'cash impact must be CASH_IN, CASH_OUT, or NO_CASH.', 'VALIDATION');
  }
  return value;
}

const PAYMENT_METHODS_ = ['CASH', 'UPI', 'BANK_TRANSFER'];
function paymentMethod_(value, prefix) {
  if (typeof value !== 'string' || PAYMENT_METHODS_.indexOf(value) < 0) {
    throw err_(
      (prefix || '') + 'payment method must be Cash, UPI, or Bank transfer.',
      'VALIDATION',
    );
  }
  return value;
}
function cashImpactForPaymentMethod_(method, type) {
  if (method === 'CASH') return type === 'RECEIPT' ? 'CASH_IN' : 'CASH_OUT';
  return 'NO_CASH';
}

function sameClientVoucherPayload_(voucher, entry) {
  return (
    isoDate_(voucher.Date) === entry.date &&
    String(voucher.Vendor || '') === entry.vendor &&
    Number(voucher.Amount) === Number(entry.amount) &&
    String(voucher.Category || '') === entry.category &&
    String(voucher.Notes || '') === entry.notes &&
    (voucher.Type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT') === entry.type &&
    String(voucher.CashImpact || 'UNCLASSIFIED') === entry.cashImpact &&
    (entry.paymentMethod === undefined || String(voucher.PaymentMethod || '') === entry.paymentMethod)
  );
}

function createVouchers_(user, req) {
  need_(user, 'create');
  const entries = req.entries;
  if (!Array.isArray(entries) || !entries.length) throw err_('Add at least one payment.');
  if (req.bulk) {
    need_(user, 'bulk');
    if (entries.length > CFG.MAX_BULK) throw err_('Maximum ' + CFG.MAX_BULK + ' rows per import.');
  } else if (entries.length > CFG.MAX_NORMAL)
    throw err_('Maximum ' + CFG.MAX_NORMAL + ' payments at once. Use Bulk Upload.');
  const catsP = categories_(),
    catsR = receiptCategories_(),
    existing = readAll_('Vouchers'),
    vendorLookup = vendorIdLookup_(),
    closedDates = readAll_('CashCloses').map(function (close) {
      return String(close.BusinessDate || '');
    }),
    byClient = {};
  existing.forEach(function (o) {
    if (o.ClientID) byClient[o.ClientID] = o;
  });
  const clean = [];
  entries.forEach(function (en, i) {
    const row = 'Row ' + (i + 1) + ': ';
    const date = String(en.date || '');
    if (!validDate_(date)) throw err_(row + 'invalid date.');
    if (closedDates.indexOf(date) >= 0) throw cashCloseDateError_();
    const vendor = clean_(en.vendor, 200);
    if (!vendor) throw err_(row + 'vendor is required.');
    const amount = Math.round(finiteNumber_(en.amount, row + 'amount') * 100) / 100;
    if (amount <= 0 || amount > CFG.MAX_AMOUNT) throw err_(row + 'invalid amount.');
    const rec = Array.isArray(en.receipts) ? en.receipts : [];
    if (rec.length > CFG.MAX_RECEIPTS) throw err_(row + 'too many receipts.');
    const type = en.type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT',
      cats = type === 'RECEIPT' ? catsR : catsP;
    const method =
      en.paymentMethod === undefined || en.paymentMethod === ''
        ? ''
        : paymentMethod_(en.paymentMethod, row);
    const impact = method
      ? cashImpactForPaymentMethod_(method, type)
      : cashImpact_(en.cashImpact, row);
    clean.push({
      type: type,
      date: date,
      vendor: vendor,
      vendorId: vendorIdForName_(vendor, vendorLookup),
      amount: amount,
      category: cats.indexOf(en.category) >= 0 ? en.category : 'Other',
      paymentMethod: method,
      cashImpact: impact,
      notes: clean_(en.notes, 500),
      clientId: clientId_(en.clientId),
      receipts: rec,
    });
  });
  const st = settings_();
  let next = nextNumber_(st.nextVoucherNo, existing, false, 201),
    nextR = nextNumber_(st.nextReceiptNo, existing, true, 1),
    created = [],
    skipped = 0,
    newObjs = [];
  const createdFileIds = [];
  try {
    clean.forEach(function (c) {
      if (c.clientId && byClient[c.clientId]) {
        const duplicate = byClient[c.clientId];
        if (!canSee_(user, duplicate)) throw err_('This client ID is already in use.', 'CONFLICT');
        if (!sameClientVoucherPayload_(duplicate, c)) {
          throw err_(
            'This client ID is already associated with different voucher details. Review the pending item before retrying.',
            'CONFLICT',
          );
        }
        skipped++;
        created.push(vOut_(duplicate));
        return;
      }
      const no = c.type === 'RECEIPT' ? nextR++ : next++,
        ids = [];
      c.receipts.forEach(function (r, i) {
        const id = saveReceipt_(r, no, i);
        ids.push(id);
        createdFileIds.push(id);
      });
      let approvalDayTotalPaise = 0;
      if (c.type === 'PAYMENT') {
        approvalDayTotalPaise =
          payeeDayPaymentPaise_(existing.concat(newObjs), c.vendorId, c.vendor, c.date, '') +
          Math.round(c.amount * 100);
      }
      const paymentNeedsApproval =
        c.type === 'PAYMENT' &&
        (c.amount >= CFG.PAYMENT_APPROVAL_THRESHOLD ||
          approvalDayTotalPaise >= approvalThresholdPaise_());
      const o = {
        VoucherID: Utilities.getUuid(),
        VoucherNo: no,
        Date: c.date,
        Vendor: c.vendor,
        VendorID: c.vendorId,
        Amount: c.amount,
        Category: c.category,
        Notes: c.notes,
        Status: 'ACTIVE',
        CreatedBy: user.email,
        CreatedAt: nowIso_(),
        UpdatedBy: '',
        UpdatedAt: '',
        Receipts: ids.join(','),
        CancelReason: '',
        ClientID: c.clientId,
        Type: c.type,
        CashImpact: c.cashImpact,
        PaymentMethod: c.paymentMethod,
        ApprovalStatus: paymentNeedsApproval ? 'PENDING' : 'NOT_REQUIRED',
        ApprovedBy: '',
        ApprovedAt: '',
        ApprovalReason: '',
      };
      if (c.clientId) byClient[c.clientId] = o;
      newObjs.push(o);
      created.push(vOut_(o));
    });
    appendRows_('Vouchers', newObjs);
    setSetting_('nextVoucherNo', String(next));
    setSetting_('nextReceiptNo', String(nextR));
  } catch (e) {
    trashFiles_(createdFileIds);
    throw e;
  }
  const bulkBatchId = req.bulk ? Utilities.getUuid() : '';
  const auditEvents = newObjs.map(function (voucher) {
    const changes = [
      { field: 'date', before: null, after: voucher.Date },
      { field: 'vendor', before: null, after: String(voucher.Vendor || '') },
      { field: 'vendorId', before: null, after: String(voucher.VendorID || '') },
      { field: 'amount', before: null, after: Number(voucher.Amount) },
      { field: 'category', before: null, after: String(voucher.Category || '') },
      { field: 'notes', before: null, after: String(voucher.Notes || '') },
      { field: 'type', before: null, after: String(voucher.Type || 'PAYMENT') },
      { field: 'status', before: null, after: String(voucher.Status || 'ACTIVE') },
      { field: 'approvalStatus', before: null, after: approvalStatus_(voucher) },
      { field: 'cashImpact', before: null, after: String(voucher.CashImpact || 'UNCLASSIFIED') },
      { field: 'paymentMethod', before: null, after: String(voucher.PaymentMethod || '') },
      {
        field: 'receiptCount',
        before: null,
        after: String(voucher.Receipts || '')
          .split(',')
          .filter(Boolean).length,
      },
    ];
    return {
      User: user.email,
      Action: req.bulk ? 'BULK_CREATE' : 'CREATE',
      Target: '#' + voucher.VoucherNo,
      Details: auditEventDetails_(
        req.bulk ? 'VOUCHER_BULK_CREATED' : 'VOUCHER_CREATED',
        'voucher',
        voucher.VoucherID,
        '',
        changes,
        req.bulk ? 'Created by bulk import; batch ' + bulkBatchId : 'Voucher created',
      ),
    };
  });
  if (req.bulk) {
    auditEvents.push({
      User: user.email,
      Action: 'BULK_IMPORT',
      Target: '',
      Details: auditEventDetails_(
        'BULK_IMPORT_COMPLETED',
        'bulkImport',
        bulkBatchId,
        '',
        [
          { field: 'createdCount', before: 0, after: newObjs.length },
          { field: 'skippedCount', before: 0, after: skipped },
        ],
        'Bulk import completed',
      ),
    });
  }
  auditEventRows_(auditEvents);
  return { created: created, skipped: skipped };
}
function findVoucher_(id) {
  const o = readAll_('Vouchers').filter(function (v) {
    return v.VoucherID === id;
  })[0];
  if (!o) throw err_('Voucher not found.');
  return o;
}
function updateVoucher_(user, req) {
  need_(user, 'edit');
  const o = findVoucher_(req.id);
  if (o.Status !== 'ACTIVE') throw err_('Cancelled vouchers cannot be edited.');
  if (cashDateClosed_(isoDate_(o.Date))) throw cashCloseDateError_();

  const f = req.fields || {};
  const patch = {};
  const changes = [];

  function recordChange(field, property, before, after) {
    if (before === after) return;
    patch[property] = after;
    changes.push({ field: field, before: before, after: after });
  }

  if (f.date !== undefined) {
    if (!validDate_(String(f.date))) throw err_('Invalid date.', 'VALIDATION');
    if (cashDateClosed_(String(f.date))) throw cashCloseDateError_();
    recordChange('date', 'Date', isoDate_(o.Date), String(f.date));
  }
  if (f.vendor !== undefined) {
    const vendor = clean_(f.vendor, 200);
    if (!vendor) throw err_('Vendor is required.', 'VALIDATION');
    recordChange('vendor', 'Vendor', String(o.Vendor || ''), vendor);
    recordChange('vendorId', 'VendorID', String(o.VendorID || ''), vendorIdForName_(vendor));
  }
  if (f.amount !== undefined) {
    const amount = Math.round(Number(f.amount) * 100) / 100;
    if (!isFinite(amount) || amount <= 0 || amount > CFG.MAX_AMOUNT) {
      throw err_('Invalid amount.', 'VALIDATION');
    }
    recordChange('amount', 'Amount', Number(o.Amount), amount);
  }
  if (f.category !== undefined) {
    const category =
      (o.Type === 'RECEIPT' ? receiptCategories_() : categories_()).indexOf(f.category) >= 0
        ? f.category
        : 'Other';
    recordChange('category', 'Category', String(o.Category || ''), category);
  }
  if (f.notes !== undefined) {
    recordChange('notes', 'Notes', String(o.Notes || ''), clean_(f.notes, 500));
  }
  if (f.paymentMethod !== undefined) {
    const method = paymentMethod_(f.paymentMethod, '');
    recordChange('paymentMethod', 'PaymentMethod', String(o.PaymentMethod || ''), method);
    recordChange(
      'cashImpact',
      'CashImpact',
      String(o.CashImpact || 'UNCLASSIFIED'),
      cashImpactForPaymentMethod_(method, o.Type === 'RECEIPT' ? 'RECEIPT' : 'PAYMENT'),
    );
  } else if (f.cashImpact !== undefined) {
    recordChange(
      'cashImpact',
      'CashImpact',
      String(o.CashImpact || 'UNCLASSIFIED'),
      cashImpact_(f.cashImpact, ''),
    );
  }
  if (CASH_IMPACT_CHOICES.indexOf(o.CashImpact) < 0 && f.cashImpact === undefined) {
    throw err_(
      'This historical voucher has no cash-impact classification. Choose one before saving.',
      'VALIDATION',
    );
  }

  if (!changes.length) {
    throw err_('No changes were detected. The voucher was not updated.', 'VALIDATION');
  }

  if (typeof req.reason !== 'string') {
    throw err_('Please give a correction reason of 3 to 200 characters.', 'VALIDATION');
  }
  const rawReason = req.reason.trim();
  if (rawReason.length > 200) {
    throw err_('Correction reason must be 200 characters or fewer.', 'VALIDATION');
  }
  const reason = clean_(rawReason, 200);
  if (reason.length < 3) {
    throw err_('Please give a correction reason of 3 to 200 characters.', 'VALIDATION');
  }

  const priorApprovalStatus = approvalStatus_(o);
  const priorAmount = Number(o.Amount);
  const nextAmount = Number(patch.Amount === undefined ? o.Amount : patch.Amount);
  const nextVendor = patch.Vendor !== undefined ? patch.Vendor : o.Vendor;
  const nextVendorId = patch.VendorID !== undefined ? patch.VendorID : o.VendorID;
  const nextDate = patch.Date !== undefined ? patch.Date : isoDate_(o.Date);
  const dayRows = o.Type === 'PAYMENT' ? readAll_('Vouchers') : [];
  const priorDayPaise =
    o.Type === 'PAYMENT'
      ? payeeDayPaymentPaise_(dayRows, o.VendorID, o.Vendor, isoDate_(o.Date), o.VoucherID) +
        Math.round(priorAmount * 100)
      : 0;
  const nextDayPaise =
    o.Type === 'PAYMENT'
      ? payeeDayPaymentPaise_(dayRows, nextVendorId, nextVendor, nextDate, o.VoucherID) +
        Math.round(nextAmount * 100)
      : 0;
  const nextNeedsApproval =
    o.Type === 'PAYMENT' &&
    (nextAmount >= CFG.PAYMENT_APPROVAL_THRESHOLD || nextDayPaise >= approvalThresholdPaise_());
  const crossedApprovalThreshold =
    o.Type === 'PAYMENT' &&
    ((priorAmount < CFG.PAYMENT_APPROVAL_THRESHOLD &&
      nextAmount >= CFG.PAYMENT_APPROVAL_THRESHOLD) ||
      (priorStatusNotRequired_(priorApprovalStatus) &&
        priorDayPaise < approvalThresholdPaise_() &&
        nextDayPaise >= approvalThresholdPaise_()));
  const approvalManaged =
    ['PENDING', 'APPROVED', 'REJECTED', 'REVIEW_REQUIRED'].indexOf(priorApprovalStatus) >= 0;
  const materialApprovalChange = changes.some(function (change) {
    return (
      ['amount', 'vendor', 'vendorId', 'date', 'cashImpact', 'paymentMethod'].indexOf(
        change.field,
      ) >= 0
    );
  });
  // Existing blank/NOT_REQUIRED approval fields are not retroactively backfilled.
  // UAT-048: only material edits invalidate an existing approval; category/notes corrections
  // preserve the current workflow state. Crossing into the threshold starts approval.
  const shouldReevaluateApproval =
    o.Type === 'PAYMENT' &&
    ((approvalManaged && materialApprovalChange) || crossedApprovalThreshold);
  if (shouldReevaluateApproval) {
    const nextApprovalStatus = nextNeedsApproval ? 'PENDING' : 'NOT_REQUIRED';
    if (priorApprovalStatus !== nextApprovalStatus) {
      changes.push({
        field: 'approvalStatus',
        before: priorApprovalStatus,
        after: nextApprovalStatus,
      });
    }
    if (String(o.ApprovedBy || '')) {
      changes.push({ field: 'approvedBy', before: String(o.ApprovedBy), after: '' });
    }
    if (String(o.ApprovedAt || '')) {
      changes.push({ field: 'approvedAt', before: tsStr_(o.ApprovedAt), after: '' });
    }
    if (String(o.ApprovalReason || '')) {
      changes.push({ field: 'approvalReason', before: String(o.ApprovalReason), after: '' });
    }
    patch.ApprovalStatus = nextApprovalStatus;
    patch.ApprovedBy = '';
    patch.ApprovedAt = '';
    patch.ApprovalReason = '';
  }

  patch.UpdatedBy = user.email;
  patch.UpdatedAt = nowIso_();
  updateRow_('Vouchers', o._row, patch);

  auditEvent_(
    user,
    'UPDATE',
    '#' + o.VoucherNo,
    'VOUCHER_UPDATED',
    'voucher',
    o.VoucherID,
    reason,
    changes,
    'Voucher fields updated',
  );

  return vOut_(Object.assign({}, o, patch));
}
function cancelVoucher_(user, req) {
  need_(user, 'cancel');
  const o = findVoucher_(req.id),
    reason = clean_(req.reason, 200);
  if (cashDateClosed_(isoDate_(o.Date))) throw cashCloseDateError_();
  if (o.Status !== 'ACTIVE') throw err_('Already cancelled.');
  if (reason.length < 3) throw err_('Please give a reason for cancelling.');
  const patch = {
    Status: 'CANCELLED',
    CancelReason: reason,
    UpdatedBy: user.email,
    UpdatedAt: nowIso_(),
  };
  updateRow_('Vouchers', o._row, patch);
  auditEvent_(
    user,
    'CANCEL',
    '#' + o.VoucherNo,
    'VOUCHER_CANCELLED',
    'voucher',
    o.VoucherID,
    reason,
    [
      { field: 'status', before: String(o.Status || 'ACTIVE'), after: 'CANCELLED' },
      { field: 'cancelReason', before: String(o.CancelReason || ''), after: reason },
    ],
    'Voucher cancelled',
  );
  return vOut_(Object.assign({}, o, patch));
}
function canSee_(user, o) {
  return can_(user, 'viewAll') || String(o.CreatedBy).toLowerCase() === user.email;
}
function addReceipt_(user, req) {
  const o = findVoucher_(req.id);
  if (!(
    can_(user, 'receiptAny') ||
    (can_(user, 'viewOwn') && String(o.CreatedBy).toLowerCase() === user.email)
  ))
    need_(user, 'receiptAny');
  if (o.Status !== 'ACTIVE') throw err_('Cannot add receipts to a cancelled voucher.');
  if (cashDateClosed_(isoDate_(o.Date))) throw cashCloseDateError_();
  const have = o.Receipts ? String(o.Receipts).split(',').filter(Boolean) : [];
  if (have.length >= CFG.MAX_RECEIPTS)
    throw err_('Maximum ' + CFG.MAX_RECEIPTS + ' receipts per voucher.');
  const fileId = saveReceipt_(req.receipt, o.VoucherNo, have.length);
  have.push(fileId);
  try {
    updateRow_('Vouchers', o._row, {
      Receipts: have.join(','),
      UpdatedBy: user.email,
      UpdatedAt: nowIso_(),
    });
  } catch (e) {
    trashFiles_([fileId]);
    throw e;
  }
  auditEvent_(
    user,
    'RECEIPT_ADD',
    '#' + o.VoucherNo,
    'VOUCHER_RECEIPT_ATTACHED',
    'voucher',
    o.VoucherID,
    '',
    [{ field: 'receiptCount', before: have.length - 1, after: have.length }],
    'Receipt image attached',
  );
  return vOut_(Object.assign({}, o, { Receipts: have.join(',') }));
}
function getReceipt_(user, req) {
  const o = findVoucher_(req.id);
  if (!canSee_(user, o)) need_(user, 'viewAll');
  const ids = String(o.Receipts || '').split(',');
  if (ids.indexOf(req.fileId) < 0) throw err_('Receipt not found.');
  const blob = DriveApp.getFileById(req.fileId).getBlob();
  return {
    dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()),
  };
}
