import { $ } from '../core/dom.js';
import { ls } from '../core/storage.js';

export function createAuth({ S, api, busy, dialog, closeModal, toast, start }) {
  let idleT;

  function showLogin(msg) {
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#lUrl').classList.toggle('hidden', !!(window.CV_CONFIG && CV_CONFIG.API_URL));
    $('#lUrl').value = ls.get('cv.url') || '';
    $('#lPin').value = '';
    $('#lErr').textContent = msg || '';
    $('#loginTitle').textContent = ls.get('cv.name') || 'Cash Vouchers';

    const lastEmail = ls.get('cv.email');
    if (lastEmail) $('#lEmail').value = lastEmail;
  }

  async function login(e) {
    e.preventDefault();

    const err = $('#lErr');
    err.textContent = '';

    S.url = (window.CV_CONFIG && CV_CONFIG.API_URL) || $('#lUrl').value.trim();

    if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1))/.test(S.url)) {
      err.textContent = 'Enter the Server URL (starts with https://).';
      return;
    }

    S.token = '';

    await busy($('#lBtn'), async () => {
      try {
        const data = await api('login', {
          email: $('#lEmail').value.trim(),
          pin: $('#lPin').value.trim(),
        });

        S.token = data.token;

        ls.set('cv.token', data.token);
        ls.set('cv.url', S.url);
        ls.set('cv.email', $('#lEmail').value.trim());

        await start(data.user.mustChangePin);
      } catch (error) {
        err.textContent = error.message;
      }
    });
  }

  function signOut(expired = false) {
    if (S.token && !expired) {
      api('logout').catch(() => {});
    }

    S.token = '';
    S.me = null;

    ls.del('cv.token');
    closeModal();

    showLogin(expired ? 'Session expired. Please sign in again.' : '');
  }

  function forcePinChange() {
    const body = document.createDocumentFragment();
    const help = document.createElement('p');
    help.className = 'muted';
    help.textContent = 'Your PIN was set by an administrator. Please choose your own 6-digit PIN.';

    const currentPin = document.createElement('input');
    currentPin.id = 'op';
    currentPin.setAttribute('aria-label', 'Current temporary PIN');
    currentPin.type = 'password';
    currentPin.inputMode = 'numeric';
    currentPin.pattern = '[0-9]{6}';
    currentPin.title = 'Enter exactly 6 digits';
    currentPin.maxLength = 6;
    currentPin.autocomplete = 'current-password';
    currentPin.placeholder = 'Current (temporary) PIN';
    currentPin.required = true;

    const newPin = document.createElement('input');
    newPin.id = 'np';
    newPin.setAttribute('aria-label', 'New PIN');
    newPin.type = 'password';
    newPin.inputMode = 'numeric';
    newPin.pattern = '[0-9]{6}';
    newPin.title = 'Enter exactly 6 digits';
    newPin.maxLength = 6;
    newPin.autocomplete = 'new-password';
    newPin.placeholder = 'New PIN';
    newPin.required = true;
    newPin.style.marginTop = '8px';

    body.append(help, currentPin, newPin);
    dialog(
      'Choose a new PIN',
      body,
      async () => {
        const data = await api('changePin', {
          oldPin: $('#op').value,
          newPin: $('#np').value,
        });

        S.token = data.token;
        ls.set('cv.token', data.token);

        closeModal();
        toast('PIN changed.', 'ok');

        await start();
      },
      'Change PIN',
    );

    $('[data-x]').onclick = () => signOut();
  }

  function handleApiError(error) {
    if (error.code === 'SESSION') {
      signOut(true);
    }

    if (error.code === 'PIN_CHANGE') {
      forcePinChange();
    }
  }

  function armIdleTimeout() {
    clearTimeout(idleT);

    if (S.me) {
      idleT = setTimeout(() => signOut(true), 30 * 60000);
    }
  }

  $('#loginForm').addEventListener('submit', login);

  ['click', 'keydown', 'touchstart'].forEach((eventName) =>
    document.addEventListener(eventName, armIdleTimeout, {
      passive: true,
    }),
  );

  return {
    showLogin,
    signOut,
    forcePinChange,
    handleApiError,
  };
}
