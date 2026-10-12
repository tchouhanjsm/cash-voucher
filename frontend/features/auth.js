import { $ } from '../core/dom.js';
import { ls } from '../core/storage.js';
import {
  clearOfflineCredential,
  saveOfflineCredential,
  verifyOfflineCredential,
} from '../core/offline-auth.js';

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

    const email = $('#lEmail').value.trim();
    const pin = $('#lPin').value.trim();
    S.token = '';
    ls.del('cv.token');

    const tryOfflineUnlock = async () => {
      const verified = await verifyOfflineCredential({
        email,
        endpoint: S.url,
        pin,
        storage: ls,
      });
      if (!verified) return false;

      const resumed = await start(false, email);
      if (resumed) return true;

      S.token = '';
      ls.del('cv.token');
      return false;
    };

    await busy($('#lBtn'), async () => {
      if (!navigator.onLine) {
        if (await tryOfflineUnlock()) return;
        err.textContent =
          'Offline unlock is unavailable or the PIN does not match. Connect and sign in to verify this account.';
        return;
      }

      try {
        const data = await api('login', { email, pin });

        S.token = data.token;
        ls.set('cv.token', data.token);
        ls.set('cv.url', S.url);
        ls.set('cv.email', email);

        if (data.user?.mustChangePin) clearOfflineCredential(ls);

        const started = await start(data.user.mustChangePin, data.user.email || email);
        const activeEmail = typeof S.me?.email === 'string' ? S.me.email.trim().toLowerCase() : '';
        if (started && !data.user.mustChangePin && activeEmail === email.toLowerCase()) {
          await saveOfflineCredential({ email, endpoint: S.url, pin, storage: ls });
        } else if (!started && !data.user.mustChangePin) {
          // A server token must never be paired with a cached identity from another account.
          S.token = '';
          ls.del('cv.token');
        }
      } catch (error) {
        if (error.code === 'NET') {
          if (await tryOfflineUnlock()) return;
          err.textContent =
            'No connection to the server. Offline unlock is available only for an account verified on this device within the last 7 days.';
        } else {
          err.textContent = error.message;
        }
      }
    });
  }
  function signOut(expired = false) {
    if (S.token && !expired) {
      api('logout').catch(() => {});
    }

    S.token = '';
    S.me = null;
    S.offlineMode = false;

    ls.del('cv.token');
    if (!expired) {
      clearOfflineCredential(ls);
      ls.del('cv.cache');
    }
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
        const newPin = $('#np').value;
        const data = await api('changePin', {
          oldPin: $('#op').value,
          newPin,
        });

        S.token = data.token;
        ls.set('cv.token', data.token);

        closeModal();
        toast('PIN changed.', 'ok');

        const started = await start(false, ls.get('cv.email') || '');
        const activeEmail = typeof S.me?.email === 'string' ? S.me.email.trim().toLowerCase() : '';
        const expectedEmail = (ls.get('cv.email') || '').trim().toLowerCase();
        if (started && activeEmail && (!expectedEmail || activeEmail === expectedEmail)) {
          await saveOfflineCredential({
            email: activeEmail,
            endpoint: S.url,
            pin: newPin,
            storage: ls,
          });
        } else if (!started) {
          S.token = '';
          ls.del('cv.token');
        }
      },
      'Change PIN',
    );

    $('[data-x]').onclick = () => signOut();
  }

  function signInOnline() {
    S.token = '';
    S.me = null;
    S.offlineMode = false;
    ls.del('cv.token');
    closeModal();
    showLogin('Sign in while connected to synchronize pending entries. Your local queue will be preserved.');
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
    signInOnline,
    handleApiError,
  };
}
