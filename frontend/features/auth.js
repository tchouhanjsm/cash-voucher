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
    $('#lPassword').value = '';
    $('#lErr').textContent = msg || '';
    $('#loginBrandTitle').textContent = ls.get('cv.name') || 'Cash Voucher';

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
    const password = $('#lPassword').value;
    S.token = '';
    ls.del('cv.token');

    const tryOfflineUnlock = async () => {
      const verified = await verifyOfflineCredential({
        email,
        endpoint: S.url,
        password,
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
          'Offline unlock is unavailable or the password does not match. Connect and sign in to verify this account.';
        return;
      }

      try {
        const data = await api('login', { email, password });

        S.token = data.token;
        ls.set('cv.token', data.token);
        ls.set('cv.url', S.url);
        ls.set('cv.email', email);

        if (data.user?.mustChangePassword) clearOfflineCredential(ls);

        const started = await start(data.user.mustChangePassword, data.user.email || email);
        const activeEmail = typeof S.me?.email === 'string' ? S.me.email.trim().toLowerCase() : '';
        if (started && !data.user.mustChangePassword && activeEmail === email.toLowerCase()) {
          await saveOfflineCredential({ email, endpoint: S.url, password, storage: ls });
        } else if (!started && !data.user.mustChangePassword) {
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

  function forcePasswordChange() {
    const body = document.createDocumentFragment();
    const help = document.createElement('p');
    help.className = 'muted';
    help.textContent =
      'Your temporary credential was set by an administrator. Choose your own password with at least 8 characters.';

    const currentPassword = document.createElement('input');
    currentPassword.id = 'currentPassword';
    currentPassword.setAttribute('aria-label', 'Current temporary password');
    currentPassword.type = 'password';
    currentPassword.inputMode = 'text';
    currentPassword.maxLength = 128;
    currentPassword.autocomplete = 'current-password';
    currentPassword.placeholder = 'Current password or legacy PIN';
    currentPassword.required = true;

    const newPassword = document.createElement('input');
    newPassword.id = 'newPassword';
    newPassword.setAttribute('aria-label', 'New password');
    newPassword.type = 'password';
    newPassword.inputMode = 'text';
    newPassword.minLength = 8;
    newPassword.title = 'Use 8 to 128 characters';
    newPassword.maxLength = 128;
    newPassword.autocomplete = 'new-password';
    newPassword.placeholder = 'New password (8–128 characters)';
    newPassword.required = true;
    newPassword.style.marginTop = '8px';

    body.append(help, currentPassword, newPassword);
    dialog(
      'Choose a new password',
      body,
      async () => {
        const newPasswordValue = $('#newPassword').value;
        const data = await api('changePassword', {
          oldPassword: $('#currentPassword').value,
          newPassword: newPasswordValue,
        });

        S.token = data.token;
        ls.set('cv.token', data.token);

        closeModal();
        toast('Password changed.', 'ok');

        const started = await start(false, ls.get('cv.email') || '');
        const activeEmail = typeof S.me?.email === 'string' ? S.me.email.trim().toLowerCase() : '';
        const expectedEmail = (ls.get('cv.email') || '').trim().toLowerCase();
        if (started && activeEmail && (!expectedEmail || activeEmail === expectedEmail)) {
          await saveOfflineCredential({
            email: activeEmail,
            endpoint: S.url,
            password: newPasswordValue,
            storage: ls,
          });
        } else if (!started) {
          S.token = '';
          ls.del('cv.token');
        }
      },
      'Change password',
    );

    currentPassword.focus();
  }

  function signInOnline() {
    S.token = '';
    S.me = null;
    S.offlineMode = false;
    ls.del('cv.token');
    closeModal();
    showLogin(
      'Sign in while connected to synchronize pending entries. Your local queue will be preserved.',
    );
  }

  function handleApiError(error) {
    if (error.code === 'SESSION') {
      signOut(true);
    }

    if (error.code === 'PASSWORD_CHANGE') {
      forcePasswordChange();
    }
  }

  function armIdleTimeout() {
    clearTimeout(idleT);

    if (S.me) {
      idleT = setTimeout(() => signOut(true), 30 * 60000);
    }
  }

  $('#loginForm').addEventListener('submit', login);
  const passwordToggle = $('#togglePassword');
  passwordToggle?.addEventListener('click', () => {
    const passwordInput = $('#lPassword');
    const isVisible = passwordInput.type === 'text';
    passwordInput.type = isVisible ? 'password' : 'text';
    passwordToggle.textContent = isVisible ? 'Show' : 'Hide';
    passwordToggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
    passwordToggle.setAttribute('aria-pressed', String(!isVisible));
  });

  const loginRoot = $('#login');
  document.querySelectorAll('[data-login-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      const theme = button.dataset.loginTheme;
      if (!['sky', 'blush', 'mint'].includes(theme)) return;
      loginRoot.dataset.theme = theme;
      document.querySelectorAll('[data-login-theme]').forEach((item) => {
        item.setAttribute('aria-pressed', String(item === button));
      });
    });
  });

  ['click', 'keydown', 'touchstart'].forEach((eventName) =>
    document.addEventListener(eventName, armIdleTimeout, {
      passive: true,
    }),
  );

  return {
    showLogin,
    signOut,
    forcePasswordChange,
    signInOnline,
    handleApiError,
  };
}
