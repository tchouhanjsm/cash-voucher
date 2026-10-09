import { $, $$ } from './dom.js';
import { esc } from './utils.js';

let toastTimer;
let returnFocusTo = null;

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

  modal.onkeydown = null;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modal.removeAttribute('aria-labelledby');
  modal.innerHTML = '';

  if (
    restoreTarget &&
    restoreTarget.isConnected &&
    !restoreTarget.closest('.hidden') &&
    !restoreTarget.disabled
  ) {
    restoreTarget.focus({ preventScroll: true });
  }
}

export function dialog(title, body, onSubmit, ok = 'Save') {
  const modal = $('#modal');
  returnFocusTo = modal.classList.contains('hidden') ? document.activeElement : returnFocusTo;

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.setAttribute('aria-labelledby', 'modalTitle');
  modal.innerHTML = `<form class="card mcard" autocomplete="off"><h2 id="modalTitle">${esc(title)}</h2>${body}<p class="error" id="modalError" role="alert" aria-live="assertive"></p><div class="actions"><button type="button" class="btn" data-x>Close</button>${onSubmit ? `<button type="submit" class="btn primary">${esc(ok)}</button>` : ''}</div></form>`;

  const form = $('form', modal);
  $('[data-x]', form).onclick = closeModal;

  modal.onkeydown = (event) => {
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

    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
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
      $('#modalError').textContent = error.message || String(error);
    } finally {
      if (button && button.isConnected) button.disabled = false;
    }
  };

  const first = $('input,select,textarea', form);
  if (first) first.focus();
  else $('[data-x]', form).focus();

  return form;
}

export const head = (title, extra = '') =>
  `<div class="head"><h1>${esc(title)}</h1><div>${extra}</div></div>`;

export const refreshBtn = '<button class="btn sm" data-act="refresh">↻ Refresh</button>';

export { $, $$ };
