export const S = {
  url: '',
  token: '',
  me: null,
  settings: {},
  vouchers: [],
  vendors: [],
  names: {},
  loadedAt: 0,
  view: 'dash',
  voucherDiagnostics: {
    envelopeValid: true,
    malformedRecordCount: 0,
    malformedFieldCount: 0,
  },
};

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isIsoDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function normalizeVoucherCollection(value) {
  if (!Array.isArray(value)) {
    return {
      envelopeValid: false,
      rows: [],
      malformedRecordCount: 0,
      malformedFieldCount: 0,
    };
  }

  const rows = [];
  let malformedRecordCount = 0;
  let malformedFieldCount = 0;
  const textFields = [
    'vendor',
    'category',
    'notes',
    'createdBy',
    'createdAt',
    'updatedBy',
    'updatedAt',
    'cancelReason',
  ];

  value.forEach((voucher) => {
    if (
      !isRecord(voucher) ||
      typeof voucher.id !== 'string' ||
      !voucher.id.trim() ||
      !isIsoDate(voucher.date) ||
      !['PAYMENT', 'RECEIPT'].includes(voucher.type) ||
      !['ACTIVE', 'CANCELLED'].includes(voucher.status)
    ) {
      malformedRecordCount++;
      return;
    }

    const row = { ...voucher };
    if (typeof row.no !== 'number' || !Number.isSafeInteger(row.no) || row.no < 1) {
      malformedFieldCount++;
      if (typeof row.no !== 'string') row.no = '';
    }
    textFields.forEach((field) => {
      if (typeof row[field] !== 'string') {
        row[field] = '';
        malformedFieldCount++;
      }
    });
    rows.push(row);
  });

  return { envelopeValid: true, rows, malformedRecordCount, malformedFieldCount };
}

export const can = (permission) => !!(S.me && S.me.perms && S.me.perms[permission]);

export const nm = (email) => {
  if (typeof email !== 'string' || !email) return '';
  const names = isRecord(S.names) ? S.names : {};
  const name = Object.prototype.hasOwnProperty.call(names, email) ? names[email] : '';
  return typeof name === 'string' && name ? name : email;
};

export const isIn = (voucher) => voucher?.type === 'RECEIPT';

export const vno = (voucher) => (isIn(voucher) ? 'R-' : '') + (voucher?.no ?? '');

const voucherRecords = () => (Array.isArray(S.vouchers) ? S.vouchers.filter(isRecord) : []);

export const pays = () =>
  voucherRecords().filter((voucher) => voucher.status === 'ACTIVE' && !isIn(voucher));

export const recs = () =>
  voucherRecords().filter((voucher) => voucher.status === 'ACTIVE' && isIn(voucher));

export const bySeq = (a, b) =>
  String(b.createdAt).localeCompare(String(a.createdAt)) || b.no - a.no;

export const rcats = () => S.settings.receiptCategories || ['Other'];

export const categories = () => S.settings.categories || ['Other'];
