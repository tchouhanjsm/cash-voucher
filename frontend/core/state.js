export const S = {
  url: '',
  token: '',
  me: null,
  offlineMode: false,
  environment: '',
  deploymentId: '',
  onboardingStage: '',
  onboardingEnvironment: '',
  settings: {},
  vouchers: [],
  vendors: [],
  names: {},
  loadedAt: 0,
  view: 'dash',
  voucherDiagnostics: {
    envelopeValid: true,
    dataAvailable: true,
    unavailableReason: '',
    malformedRecordCount: 0,
    malformedFieldCount: 0,
  },
};

export const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER'];
export const PAYMENT_METHOD_LABELS = { CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank transfer' };
export const CASH_IMPACT_CHOICES = ['CASH_IN', 'CASH_OUT', 'NO_CASH'];
export const CASH_IMPACT_LABELS = {
  CASH_IN: 'Cash received into the drawer',
  CASH_OUT: 'Cash paid out of the drawer',
  NO_CASH: 'Not cash (UPI, card or bank transfer)',
};
export const CASH_IMPACT_VALUES = [...CASH_IMPACT_CHOICES, 'UNCLASSIFIED'];
export const APPROVAL_STATUS_VALUES = [
  'NOT_REQUIRED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVIEW_REQUIRED',
];

export function normalizeApprovalStatus(value) {
  if (value === undefined || value === null || value === '') return 'NOT_REQUIRED';
  return APPROVAL_STATUS_VALUES.includes(value) ? value : 'REVIEW_REQUIRED';
}

export function isPaymentApprovedForTotals(voucher) {
  return (
    voucher?.type !== 'PAYMENT' ||
    ['NOT_REQUIRED', 'APPROVED'].includes(normalizeApprovalStatus(voucher?.approvalStatus))
  );
}

export function normalizeCashImpact(value) {
  return CASH_IMPACT_VALUES.includes(value) ? value : 'UNCLASSIFIED';
}

export function suggestCashImpact(type, category) {
  const normalizedCategory = String(category || '')
    .trim()
    .toLowerCase();
  if (type !== 'RECEIPT' && normalizedCategory === 'bank charges') {
    return 'NO_CASH';
  }
  return type === 'RECEIPT' ? 'CASH_IN' : 'CASH_OUT';
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
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
      invalidAmountCount: 0,
    };
  }

  const rows = [];
  let malformedRecordCount = 0;
  let malformedFieldCount = 0;
  let invalidAmountCount = 0;
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
  const optionalVoucherTextFields = ['vendorId', 'approvedBy', 'approvedAt', 'approvalReason'];

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
    if (row.cashImpact === undefined || row.cashImpact === '') {
      row.cashImpact = 'UNCLASSIFIED';
    } else if (!CASH_IMPACT_VALUES.includes(row.cashImpact)) {
      row.cashImpact = 'UNCLASSIFIED';
      malformedFieldCount++;
    }
    const originalApprovalStatus = row.approvalStatus;
    row.approvalStatus = normalizeApprovalStatus(originalApprovalStatus);
    if (
      originalApprovalStatus !== undefined &&
      originalApprovalStatus !== null &&
      originalApprovalStatus !== '' &&
      row.approvalStatus === 'REVIEW_REQUIRED'
    ) {
      malformedFieldCount++;
    }
    optionalVoucherTextFields.forEach((field) => {
      if (typeof row[field] !== 'string') row[field] = '';
    });
    if (
      row.status === 'ACTIVE' &&
      (row.amount === null ||
        row.amount === undefined ||
        typeof row.amount === 'boolean' ||
        (typeof row.amount !== 'number' && typeof row.amount !== 'string') ||
        (typeof row.amount === 'string' && row.amount.trim() === '') ||
        !Number.isFinite(Number(row.amount)) ||
        Number(row.amount) <= 0)
    ) {
      invalidAmountCount++;
    }
    rows.push(row);
  });

  return { envelopeValid: true, rows, malformedRecordCount, malformedFieldCount, invalidAmountCount };
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
  voucherRecords().filter(
    (voucher) =>
      voucher.status === 'ACTIVE' && !isIn(voucher) && isPaymentApprovedForTotals(voucher),
  );

export const recs = () =>
  voucherRecords().filter((voucher) => voucher.status === 'ACTIVE' && isIn(voucher));

export const bySeq = (a, b) =>
  String(b.createdAt).localeCompare(String(a.createdAt)) || b.no - a.no;

const normalizeCategoryList = (value, includeSalary = false) => {
  const normalized = Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((category) => typeof category === 'string')
            .map((category) => category.trim())
            .filter(Boolean),
        ),
      ]
    : [];

  if (!normalized.length) normalized.push('Other');
  if (includeSalary && !normalized.includes('Staff Salary')) normalized.push('Staff Salary');
  return normalized;
};

export const rcats = () => normalizeCategoryList(S.settings?.receiptCategories);

export const categories = () => normalizeCategoryList(S.settings?.categories, true);
