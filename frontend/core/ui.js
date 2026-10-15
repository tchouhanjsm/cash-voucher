import { $, $$ } from './dom.js';
import { esc, scalarText } from './utils.js';

let toastTimer;
let returnFocusTo = null;
let restoreAppInert = null;

function scalarModalLabel(value, fallback) {
  const label = scalarText(value).trim();
  return label || fallback;
}

export function toast(message, kind) {
  const element = $('#toast');
  element.textContent = message;
  element.className = 'toast ' + (kind || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.add('hidden'), 3800);
}

export const fail = (error) => toast(error.message || String(error), 'err');

export async function busy(button, fn) {
  if (button) button.disabled = true;

  try {
    return await fn();
  } finally {
    if (button) button.disabled = false;
  }
}

export function closeModal() {
  const modal = $('#modal');
  const restoreTarget = returnFocusTo;
  returnFocusTo = null;
  const app = $('#app');

  if (app && restoreAppInert !== null) {
    app.inert = restoreAppInert;
    restoreAppInert = null;
  }

  modal.onkeydown = null;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modal.removeAttribute('aria-labelledby');
  modal.replaceChildren();

  if (
    restoreTarget &&
    restoreTarget.isConnected &&
    !restoreTarget.closest('.hidden') &&
    !restoreTarget.disabled
  ) {
    restoreTarget.focus({ preventScroll: true });
  }
}

/**
 * Dialog content must be a DOM Node or DocumentFragment. Build user/API-derived
 * values with textContent, form properties, and explicit attributes at the callsite;
 * never pass an HTML string into this shared modal.
 */
export function dialog(title, body, onSubmit, ok = 'Save') {
  if (!body || typeof body.nodeType !== 'number') {
    throw new TypeError('Dialog body must be a DOM Node or DocumentFragment.');
  }

  const modal = $('#modal');
  const openingDialog = modal.classList.contains('hidden');

  if (openingDialog) {
    returnFocusTo = document.activeElement;
    const app = $('#app');

    if (app) {
      restoreAppInert = app.inert;
      app.inert = true;
    }
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.setAttribute('aria-labelledby', 'modalTitle');
  const form = document.createElement('form');
  form.className = 'card mcard';
  form.autocomplete = 'off';

  const heading = document.createElement('h2');
  heading.id = 'modalTitle';
  heading.textContent = scalarModalLabel(title, 'Dialog');

  const error = document.createElement('p');
  error.className = 'error';
  error.id = 'mErr';
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');

  const actions = document.createElement('div');
  actions.className = 'actions';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'btn';
  closeButton.dataset.x = '';
  closeButton.textContent = 'Close';
  actions.appendChild(closeButton);

  if (onSubmit) {
    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className = 'btn primary';
    submitButton.textContent = scalarModalLabel(ok, 'Save');
    actions.appendChild(submitButton);
  }

  form.append(heading, body, error, actions);
  modal.replaceChildren(form);
  $('[data-x]', form).onclick = closeModal;

  modal.onkeydown = (event) => {
    if (event.key === 'Escape') {
      const submitButton = $('.primary', modal);
      if (submitButton && submitButton.disabled) return;

      event.preventDefault();
      closeModal();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = [
      ...modal.querySelectorAll(
        'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => element.getClientRects().length > 0);

    if (!focusable.length) {
      event.preventDefault();
      modal.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (
      event.shiftKey &&
      (document.activeElement === first || !modal.contains(document.activeElement))
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || !modal.contains(document.activeElement))
    ) {
      event.preventDefault();
      first.focus();
    }
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    if (typeof onSubmit !== 'function') return;

    const button = $('.primary', form);
    if (button) button.disabled = true;

    try {
      await onSubmit(form);
    } catch (error) {
      $('#mErr', form).textContent = error.message || String(error);
    } finally {
      if (button && button.isConnected) button.disabled = false;
    }
  };

  const first = $('input,select,textarea', form);
  if (first) first.focus();
  else $('[data-x]', form).focus();

  return form;
}

const ICON_NAMES = new Set([
  'home', 'plus', 'book', 'chart', 'wallet', 'upload', 'store', 'users',
  'settings', 'receipt', 'user', 'alert', 'check', 'clock', 'cloud-off',
  'arrow-right', 'trend', 'cash',
]);

export const icon = (name) => {
  const safeName = ICON_NAMES.has(name) ? name : 'alert';
  return `<svg class="i" aria-hidden="true" focusable="false"><use href="#i-${safeName}"></use></svg>`;
};

// `extra` is trusted app-authored action markup, never a data string.
export const head = (title, extra = '', options = {}) => {
  const description = options.description
    ? `<p class="page-description">${esc(options.description)}</p>`
    : '';

  return `
    <div class="head page-header">
      <div class="page-header-copy">
        <h1>${esc(title)}</h1>
        ${description}
      </div>
      <div class="page-header-actions">${extra}</div>
    </div>
  `;
};

// HTML slots below are trusted app-authored markup. User/API-derived values
// must be escaped by feature renderers before they are supplied.
export function formPanel({
  id,
  title,
  description = '',
  fields,
  footer = '',
  className = 'filters',
}) {
  if (typeof id !== 'string' || !id || typeof fields !== 'string') {
    throw new TypeError('Form panel requires an id and trusted field markup.');
  }

  return `
    <section class="card form-panel">
      ${title ? `<h2>${esc(title)}</h2>` : ''}
      ${description ? `<p class="muted">${esc(description)}</p>` : ''}
      <form id="${esc(id)}" class="${esc(className)}" autocomplete="off">${fields}</form>
      ${footer}
    </section>
  `;
}

export function tableView({ label, columns, rows = '', emptyMessage = 'No records available.' }) {
  if (!label || !Array.isArray(columns) || columns.length === 0) {
    throw new TypeError('Table view requires an accessible label and at least one column.');
  }

  const headings = columns
    .map((column) => {
      const classes = [column.align === 'right' ? 'r' : '', column.nowrap ? 'nw' : '']
        .filter(Boolean)
        .join(' ');
      return `<th scope="col"${classes ? ` class="${classes}"` : ''}>${esc(column.label)}</th>`;
    })
    .join('');
  const body =
    rows || `<tr><td colspan="${columns.length}" class="muted">${esc(emptyMessage)}</td></tr>`;

  return `
    <div class="table-wrap" role="region" aria-label="${esc(label)}" tabindex="0">
      <table>
        <caption class="sr-only">${esc(label)}</caption>
        <thead><tr>${headings}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

export function emptyState({ title, description, action = '' }) {
  return `
    <section class="empty-state-card" role="status" aria-live="polite">
      <div class="empty-state-copy">
        <h2>${esc(title)}</h2>
        <p class="muted">${esc(description)}</p>
      </div>
      ${action ? `<div class="empty-state-actions">${action}</div>` : ''}
    </section>
  `;
}

export const refreshBtn =
  '<button class="btn sm" type="button" data-act="refresh">↻ Refresh</button>';

export { $, $$ };
