import { categories, rcats, S } from './state.js';
import { ls } from './storage.js';
import { esc } from './utils.js';

export const catOpts = (selected, type) =>
  (type === 'RECEIPT' ? rcats() : categories())
    .map(
      (category) => `<option${category === selected ? ' selected' : ''}>${esc(category)}</option>`,
    )
    .join('');

function vendorNames() {
  const counts = {};

  S.vouchers.forEach((voucher) => {
    counts[voucher.vendor] = (counts[voucher.vendor] || 0) + 1;
  });

  let cache = {};

  try {
    cache = JSON.parse(ls.get('cv.cache') || '{}');
  } catch {}

  return [
    ...new Set([
      ...Object.keys(counts).sort((a, b) => counts[b] - counts[a]),
      ...S.vendors.filter((vendor) => vendor.active).map((vendor) => vendor.name),
      ...(cache.vn || []),
    ]),
  ];
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
