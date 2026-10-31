import { categories, rcats, S } from './state.js';
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
  const named = new Map();
  const ambiguous = new Set();

  (Array.isArray(S.vendors) ? S.vendors : []).forEach((vendor) => {
    if (
      !isRecord(vendor) ||
      !vendor.active ||
      typeof vendor.id !== 'string' ||
      !vendor.id.trim()
    ) {
      return;
    }
    const name = vendorName(vendor.name);
    if (!name) return;
    const key = name.trim().toLocaleLowerCase('en-IN');
    if (named.has(key)) {
      named.delete(key);
      ambiguous.add(key);
      return;
    }
    if (!ambiguous.has(key)) named.set(key, name);
  });

  return [...named.values()];
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
