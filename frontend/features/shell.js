import { $ } from '../core/dom.js';
import { S } from '../core/state.js';
import { initials, scalarText } from '../core/utils.js';

// App shell: top bar identity, connection pill and user menu.
export function createShell({ go }) {
  function menuOpen() {
    return !$('#userPop').classList.contains('hidden');
  }

  function closeMenu(restoreFocus = false) {
    $('#userPop').classList.add('hidden');
    $('#userBtn').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('#userBtn').focus();
  }

  function openMenu() {
    $('#userPop').classList.remove('hidden');
    $('#userBtn').setAttribute('aria-expanded', 'true');
  }

  function renderNetwork() {
    const online = navigator.onLine !== false && !S.offlineMode;
    const pill = $('#netPill');
    pill.textContent = online ? 'Online' : 'Offline';
    pill.classList.toggle('on', online);
  }

  function render() {
    const email = scalarText(S.me?.email);
    const name = scalarText(S.me?.name) || email || 'User';
    const brand = scalarText(S.settings?.propertyName) || 'Cash Vouchers';

    $('#brandTop').textContent = brand;
    $('#avatar').textContent = initials(name);
    $('#userName').textContent = name;
    const role = scalarText(S.me?.role);
    $('#userRole').textContent = role.toLowerCase() === name.toLowerCase() ? '' : role;
    $('#popName').textContent = name;
    $('#popEmail').textContent = email;
    closeMenu();
    renderNetwork();
  }

  function bind() {
    $('#userBtn').addEventListener('click', () => (menuOpen() ? closeMenu() : openMenu()));

    $('#userPop').addEventListener('click', (event) => {
      const item = event.target.closest('button');
      if (!item) return;
      closeMenu();

      if (item.dataset.go) {
        go(item.dataset.go, { focusHeading: true });
        const focusId = item.dataset.focus;
        if (focusId) setTimeout(() => document.getElementById(focusId)?.focus(), 0);
      }
    });

    document.addEventListener('click', (event) => {
      if (menuOpen() && !event.target.closest('.usermenu')) closeMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuOpen()) closeMenu(true);
    });

    window.addEventListener('online', renderNetwork);
    window.addEventListener('offline', renderNetwork);
  }

  return { render, bind, closeMenu };
}
