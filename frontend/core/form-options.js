import { categories, rcats, S } from './state.js';
import { ls } from './storage.js';
import { esc, hasPayeeLetter } from './utils.js';

export const catOpts = (selected, type) =>
  (type === 'RECEIPT' ? rcats() : categories())
    .map(
      (category) => `<option${category === selected ? ' selected' : ''}>${esc(category)}</option>`,
    )
    .join('');

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function vendorName(value) {
  return hasPayeeLetter(value) ? value : '';
}

function vendorNames() {
  const counts = new Map();
  const vouchers = Array.isArray(S.vouchers) ? S.vouchers : [];

  vouchers.forEach((voucher) => {
    if (!isRecord(voucher)) return;
    const name = vendorName(voucher.vendor);
    if (!name) return;
    counts.set(name, (counts.get(name) || 0) + 1);
  });

  let cache = {};

  try {
    const saved = JSON.parse(ls.get('cv.cache') || '{}');
    cache = isRecord(saved) ? saved : {};
  } catch {}

  const activeVendors = (Array.isArray(S.vendors) ? S.vendors : [])
    .filter((vendor) => isRecord(vendor) && vendor.active)
    .map((vendor) => vendorName(vendor.name))
    .filter(Boolean);
  const cachedVendors = Array.isArray(cache.vn) ? cache.vn.map(vendorName).filter(Boolean) : [];
  const frequentVendors = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));

  return [...new Set([...frequentVendors, ...activeVendors, ...cachedVendors])];
}

export const vendorList = () =>
  `<datalist id="vlist">${vendorNames()
    .map((name) => `<option value="${esc(name)}">`)
    .join('')}</datalist>`;

export const catOptionsNode = (selected, type) => {
  const options = document.createDocumentFragment();

  (type === 'RECEIPT' ? rcats() : categories()).forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    option.selected = category === selected;
    options.appendChild(option);
  });

  return options;
};

export const vendorListNode = () => {
  const list = document.createElement('datalist');
  list.id = 'vlist';

  vendorNames().forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    list.appendChild(option);
  });

  return list;
};
