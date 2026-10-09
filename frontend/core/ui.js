import { $, $$ } from './dom.js';
import { esc } from './utils.js';

let toastTimer;

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
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = '';
}

export function dialog(title, body, onSubmit, ok = 'Save') {
  const modal = $('#modal');
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.innerHTML = `<form class="card mcard" autocomplete="off"><h2>${esc(title)}</h2>${body}<p class="error" id="mErr"></p><div class="actions"><button type="button" class="btn" data-x>Close</button>${onSubmit ? `<button class="btn primary">${esc(ok)}</button>` : ''}</div></form>`;

  const form = $('form', modal);
  $('[data-x]', form).onclick = closeModal;

  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = $('.primary', form);
    button.disabled = true;

    try {
      await onSubmit(form);
    } catch (error) {
      $('#mErr').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };

  const first = $('input,select,textarea', form);
  if (first) first.focus();

  return form;
}

export const head = (title, extra = '') =>
  `<div class="head"><h1>${esc(title)}</h1><div>${extra}</div></div>`;

export const refreshBtn = '<button class="btn sm" data-act="refresh">↻ Refresh</button>';

export { $, $$ };
