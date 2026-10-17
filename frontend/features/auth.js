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
    $('#lPasswordErr').textContent = '';
    $('#lEmailErr').textContent = '';
    $('#lErr').textContent = msg || '';
    const lastEmail = ls.get('cv.email');
    if (lastEmail) $('#lEmail').value = lastEmail;
    $('#lEmail').focus({ preventScroll: true });
  }

  async function login(e) {
    e.preventDefault();
    const err = $('#lErr');
    const emailError = $('#lEmailErr');
    const passwordError = $('#lPasswordErr');
    err.textContent = '';
    emailError.textContent = '';
    passwordError.textContent = '';
    $('#lEmail').removeAttribute('aria-invalid');
    $('#lPassword').removeAttribute('aria-invalid');

    S.url = (window.CV_CONFIG && CV_CONFIG.API_URL) || $('#lUrl').value.trim();
    if (!/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1))/.test(S.url)) {
      err.textContent = 'The application server URL is missing or invalid. Contact your administrator.';
      return;
    }

    const email = $('#lEmail').value.trim().toLowerCase();
    const password = $('#lPassword').value;
    let valid = true;
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      emailError.textContent = 'Enter a valid work email address.';
      $('#lEmail').setAttribute('aria-invalid', 'true');
      valid = false;
    }
    if (password.length < 8 || password.length > 128) {
      passwordError.textContent = 'Password must contain 8–128 characters.';
      $('#lPassword').setAttribute('aria-invalid', 'true');
      valid = false;
    }
    if (!valid) return;

    S.token = '';
    ls.del('cv.token');

    const tryOfflineUnlock = async () => {
      const verified = await verifyOfflineCredential({ email, endpoint: S.url, password, storage: ls });
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
        err.textContent = 'Offline access is unavailable or this password does not match this device. Connect and sign in to verify your account.';
        return;
      }
      try {
        const data = await api('login', { email, password });
        S.token = data.token;
        ls.set('cv.token', data.token);
        ls.set('cv.url', S.url);
        ls.set('cv.email', email);

        if (data.user?.mustChangePassword) clearOfflineCredential(ls);
        const mustChange = Boolean(data.user?.mustChangePassword);
        const started = await start(mustChange, data.user.email || email);
        const activeEmail = typeof S.me?.email === 'string' ? S.me.email.trim().toLowerCase() : '';
        if (started && !mustChange && activeEmail === email) {
          await saveOfflineCredential({ email, endpoint: S.url, password, storage: ls });
        } else if (!started && !mustChange) {
          S.token = '';
          ls.del('cv.token');
        }
      } catch (error) {
        if (error.code === 'NET') {
          if (await tryOfflineUnlock()) return;
          err.textContent = 'Unable to reach the server. Connect to the internet and try again.';
        } else {
          err.textContent = error.message || 'Unable to sign in. Check your credentials and try again.';
        }
      }
    });
  }

  function signOut(expired = false) {
    if (S.token && !expired) api('logout').catch(() => {});
    S.token = '';
    S.me = null;
    S.offlineMode = false;
    ls.del('cv.token');
    if (!expired) {
      clearOfflineCredential(ls);
      ls.del('cv.cache');
    }
    closeModal();
    showLogin(expired ? 'Your session expired. Please sign in again.' : '');
  }

  function forcePasswordChange() {
    const body = document.createDocumentFragment();
    const help = document.createElement('p');
    help.className = 'muted';
    help.textContent = 'Your administrator issued a temporary password. Choose a new password with at least 8 characters.';

    const currentPassword = document.createElement('input');
    currentPassword.id = 'currentPassword';
    currentPassword.setAttribute('aria-label', 'Current temporary password');
    currentPassword.type = 'password';
    currentPassword.minLength = 8;
    currentPassword.maxLength = 128;
    currentPassword.pattern = '.{8,128}';
    currentPassword.autocomplete = 'current-password';
    currentPassword.placeholder = 'Current temporary password';
    currentPassword.required = true;

    const newPassword = document.createElement('input');
    newPassword.id = 'newPassword';
    newPassword.setAttribute('aria-label', 'New password');
    newPassword.type = 'password';
    newPassword.minLength = 8;
    newPassword.maxLength = 128;
    newPassword.pattern = '.{8,128}';
    newPassword.autocomplete = 'new-password';
    newPassword.placeholder = 'New password (8+ characters)';
    newPassword.required = true;
    newPassword.style.marginTop = '8px';

    body.append(help, currentPassword, newPassword);
    dialog(
      'Choose a new password',
      body,
      async () => {
        const password = $('#newPassword').value;
        $('#newPassword').setCustomValidity('');
        if (password.length < 8 || password.length > 128) {
          $('#newPassword').setCustomValidity('Password must contain 8–128 characters.');
          $('#newPassword').reportValidity();
          return;
        }
        const data = await api('changePassword', {
          oldPassword: $('#currentPassword').value,
          newPassword: password,
        });
        S.token = data.token;
        ls.set('cv.token', data.token);
        closeModal();
        toast('Password changed.', 'ok');
        const started = await start(false, ls.get('cv.email') || '');
        const activeEmail = typeof S.me?.email === 'string' ? S.me.email.trim().toLowerCase() : '';
        const expectedEmail = (ls.get('cv.email') || '').trim().toLowerCase();
        if (started && activeEmail && (!expectedEmail || activeEmail === expectedEmail)) {
          await saveOfflineCredential({ email: activeEmail, endpoint: S.url, password, storage: ls });
        } else if (!started) {
          S.token = '';
          ls.del('cv.token');
        }
      },
      'Change password',
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
    if (error.code === 'SESSION') signOut(true);
    if (error.code === 'PASSWORD_CHANGE') forcePasswordChange();
  }

  function armIdleTimeout() {
    clearTimeout(idleT);
    if (S.me) idleT = setTimeout(() => signOut(true), 30 * 60000);
  }

  $('#loginForm').addEventListener('submit', login);
  $('#lPasswordToggle').addEventListener('click', () => {
    const input = $('#lPassword');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    $('#lPasswordToggle').setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    $('#lPasswordToggle').setAttribute('aria-pressed', String(visible));
  });
  document.querySelectorAll('[data-login-theme]').forEach((button) => {
    button.addEventListener('click', () => {
      const themes = {
        sky: ['#DCEBFA', '#3B82D6', 'rgba(59,130,214,.22)'],
        blush: ['#FBE1EA', '#D4537E', 'rgba(212,83,126,.22)'],
        mint: ['#DDF1E5', '#2F9461', 'rgba(47,148,97,.22)'],
      };
      const theme = themes[button.dataset.loginTheme];
      if (!theme) return;
      const root = $('#cvLogin');
      root.style.setProperty('--cv-story', theme[0]);
      root.style.setProperty('--cv-accent', theme[1]);
      root.style.setProperty('--cv-ring', theme[2]);
      document.querySelectorAll('[data-login-theme]').forEach((item) =>
        item.setAttribute('aria-pressed', String(item === button)),
      );
    });
  });
  ['click', 'keydown', 'touchstart'].forEach((eventName) =>
    document.addEventListener(eventName, armIdleTimeout, { passive: true }),
  );

  return { showLogin, signOut, forcePasswordChange, signInOnline, handleApiError };
}
