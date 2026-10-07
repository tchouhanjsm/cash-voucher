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
};

export const can = (permission) => !!(S.me && S.me.perms && S.me.perms[permission]);

export const nm = (email) => S.names[email] || email || '';

export const isIn = (voucher) => voucher.type === 'RECEIPT';

export const vno = (voucher) => (isIn(voucher) ? 'R-' : '') + voucher.no;

export const pays = () =>
  S.vouchers.filter((voucher) => voucher.status === 'ACTIVE' && !isIn(voucher));

export const recs = () =>
  S.vouchers.filter((voucher) => voucher.status === 'ACTIVE' && isIn(voucher));

export const bySeq = (a, b) =>
  String(b.createdAt).localeCompare(String(a.createdAt)) || b.no - a.no;

export const rcats = () => S.settings.receiptCategories || ['Other'];

export const categories = () => S.settings.categories || ['Other'];
