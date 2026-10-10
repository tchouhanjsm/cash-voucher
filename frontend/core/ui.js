import { $, $$ } from './dom.js';
import { esc } from './utils.js';

let toastTimer;
let returnFocusTo = null;
let restoreAppInert = null;

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
  modal.innerHTML = `<form class="card mcard" autocomplete="off"><h2 id="modalTitle">${esc(title)}</h2><p class="error" id="mErr" role="alert" aria-live="assertive"></p><div class="actions"><button type="button" class="btn" data-x>Close</button>${onSubmit ? `<button type="submit" class="btn primary">${esc(ok)}</button>` : ''}</div></form>`;

  const form = $('form', modal);
  form.insertBefore(body, $('#mErr', form));
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

// `extra` is also a trusted app-authored HTML fragment, not a data string.
export const head = (title, extra = '') =>
  `<div class="head"><h1>${esc(title)}</h1><div>${extra}</div></div>`;

export const refreshBtn = '<button class="btn sm" data-act="refresh">↻ Refresh</button>';

export { $, $$ };
