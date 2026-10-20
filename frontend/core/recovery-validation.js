const MAX_RECORDS = 500;
const MAX_RECEIPT_BYTES = 25 * 1024 * 1024;
const MAX_RECEIPT_LENGTH = 2_200_000;
const RECEIPT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateClientId(value, message = 'Recovery file contains an invalid payment ID.') {
  if (typeof value !== 'string') throw new Error(message);

  const clientId = value.trim();
  if (
    !clientId ||
    clientId.length > 60 ||
    [...clientId].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new Error(message);
  }

  return clientId;
}

export function validateOptionalClientId(
  value,
  message = 'Offline payment contains an invalid payment ID.',
) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new Error(message);

  const clientId = value.trim();
  return clientId ? validateClientId(clientId, message) : '';
}

export function validateRecoveryRecords(records, ownerKey, maxDate) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Recovery file contains no pending payments.');
  }
  if (records.length > MAX_RECORDS) {
    throw new Error('Recovery file exceeds the 500-payment limit.');
  }
  if (typeof ownerKey !== 'string' || !ownerKey.trim()) {
    throw new Error('Sign in before restoring pending payments.');
  }
  if (!isIsoDate(maxDate)) {
    throw new Error('The recovery date range could not be validated. Retry after refreshing.');
  }

  const activeOwnerKey = ownerKey.trim();
  const ids = new Set();
  let unboundCount = 0;
  let receiptBytes = 0;

  const normalizedRecords = records.map((record) => {
    if (!isRecord(record)) {
      throw new Error('Recovery file contains a payment with invalid details.');
    }

    const clientId = validateClientId(record.clientId);
    if (ids.has(clientId)) throw new Error('Recovery file contains duplicate payment IDs.');
    ids.add(clientId);

    const ownerValue = record.ownerKey;
    if (ownerValue !== undefined && ownerValue !== null && typeof ownerValue !== 'string') {
      throw new Error('Recovery file contains an invalid account binding.');
    }
    const sourceOwner = typeof ownerValue === 'string' ? ownerValue.trim() : '';

    if (sourceOwner && sourceOwner !== activeOwnerKey) {
      throw new Error(
        'Recovery file is bound to another endpoint or user; restore it while signed in ' +
          'to the matching account.',
      );
    }
    if (!sourceOwner) unboundCount++;

    const entry = record.entry;
    if (!isRecord(entry)) {
      throw new Error('Recovery file contains a payment with invalid details.');
    }
    if (validateClientId(entry.clientId) !== clientId) {
      throw new Error('Recovery file payment IDs do not match their details.');
    }

    const dateText = entry.date;
    if (!isIsoDate(dateText) || dateText < '2000-01-01' || dateText > maxDate) {
      throw new Error('Recovery file contains an invalid payment date.');
    }

    if (
      !['PAYMENT', 'RECEIPT'].includes(entry.type) ||
      typeof entry.vendor !== 'string' ||
      !entry.vendor.trim() ||
      entry.vendor.length > 200
    ) {
      throw new Error('Recovery file contains an invalid payment type or vendor.');
    }

    if (
      typeof entry.amount !== 'number' ||
      !Number.isFinite(entry.amount) ||
      entry.amount <= 0 ||
      entry.amount > 10_000_000
    ) {
      throw new Error('Recovery file contains an invalid payment amount.');
    }

    const category =
      entry.category === undefined || entry.category === null ? 'Other' : entry.category;
    const notes = entry.notes === undefined || entry.notes === null ? '' : entry.notes;
    if (typeof category !== 'string' || typeof notes !== 'string') {
      throw new Error('Recovery file contains invalid category or note data.');
    }

    const cashImpact =
      entry.cashImpact === undefined || entry.cashImpact === null || entry.cashImpact === ''
        ? 'UNCLASSIFIED'
        : entry.cashImpact;
    if (!['CASH_IN', 'CASH_OUT', 'NO_CASH', 'UNCLASSIFIED'].includes(cashImpact)) {
      throw new Error('Recovery file contains an invalid cash-impact classification.');
    }

    const hasPaymentMethod =
      entry.paymentMethod !== undefined &&
      entry.paymentMethod !== null &&
      entry.paymentMethod !== '';
    if (hasPaymentMethod && !['CASH', 'UPI', 'BANK_TRANSFER'].includes(entry.paymentMethod)) {
      throw new Error('Recovery file contains an invalid payment method.');
    }

    const sourceReceipts =
      entry.receipts === undefined || entry.receipts === null ? [] : entry.receipts;
    if (!Array.isArray(sourceReceipts) || sourceReceipts.length > 3) {
      throw new Error('Recovery file contains an invalid receipt list.');
    }

    const receipts = sourceReceipts.map((receipt) => {
      if (
        !isRecord(receipt) ||
        typeof receipt.mime !== 'string' ||
        !RECEIPT_MIME_TYPES.has(receipt.mime) ||
        typeof receipt.data !== 'string' ||
        receipt.data.length === 0 ||
        receipt.data.length > MAX_RECEIPT_LENGTH ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(receipt.data)
      ) {
        throw new Error('Recovery file contains an invalid or oversized receipt.');
      }

      receiptBytes += receipt.data.length;
      if (receiptBytes > MAX_RECEIPT_BYTES) {
        throw new Error('Recovery file receipt data exceeds the 25 MB safety limit.');
      }

      return { mime: receipt.mime, data: receipt.data };
    });

    return {
      clientId,
      ownerKey: sourceOwner,
      entry: {
        clientId,
        date: dateText,
        type: entry.type,
        vendor: entry.vendor.trim(),
        amount: entry.amount,
        category,
        cashImpact,
        ...(hasPaymentMethod ? { paymentMethod: entry.paymentMethod } : {}),
        notes,
        receipts,
      },
    };
  });

  return { records: normalizedRecords, unboundCount };
}
