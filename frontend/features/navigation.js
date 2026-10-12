import { $, $$ } from '../core/dom.js';
import { normalizeVoucherCollection, S, can } from '../core/state.js';
import { fail, toast } from '../core/ui.js';
import { ls } from '../core/storage.js';
import { scalarText } from '../core/utils.js';

export function createNavigation({ api, getAuth, getPayments, renderers }) {
  const OFFLINE_VIEWS = new Set(['dash', 'new', 'reg', 'acct']);
  const NAV = [
    ['dash', '📊', 'Dashboard', () => true],
    ['new', '➕', 'New Entry', () => can('create')],
    ['reg', '📒', 'Register', () => true],
    ['reports', '📈', 'Reports', () => can('viewAll')],
    ['bulk', '📥', 'Bulk Upload', () => can('bulk')],
    ['vend', '🏪', 'Vendors', () => can('vendors')],
    ['users', '👥', 'Users', () => can('users')],
    ['set', '⚙️', 'Settings', () => can('settings')],
    ['audit', '🧾', 'Audit log', () => can('audit')],
    ['acct', '👤', 'Account', () => true],
  ];

  async function load() {
    const data = await api('bootstrap');
    const voucherData = normalizeVoucherCollection(data?.vouchers);
    const vouchers = voucherData.rows;
    const vendorNames = vouchers.map((voucher) => voucher.vendor).filter(Boolean);

    Object.assign(S, {
      me: data.user,
      settings: data.settings,
      vouchers,
      voucherDiagnostics: {
        envelopeValid: voucherData.envelopeValid,
        dataAvailable: voucherData.envelopeValid,
        unavailableReason: voucherData.envelopeValid ? '' : 'invalid-response',
        malformedRecordCount: voucherData.malformedRecordCount,
        malformedFieldCount: voucherData.malformedFieldCount,
      },
      vendors: data.vendors,
      names: data.names,
      loadedAt: Date.now(),
      offlineMode: false,
    });

    ls.set('cv.name', scalarText(data.settings?.propertyName));
    ls.set(
      'cv.cache',
      JSON.stringify({
        me: data.user,
        names: data.names,
        settings: data.settings,
        vendors: data.vendors,
        vn: [...new Set(vendorNames)].slice(0, 300),
      }),
    );
  }

  async function start(mustChange, expectedEmail = '') {
    $('#login').classList.add('hidden');

    if (mustChange) {
      $('#app').classList.add('hidden');
      getAuth().forcePinChange();
      return false;
    }

    let offline = false;

    try {
      await load();
    } catch (error) {
      if (error.code === 'PIN_CHANGE' || error.code === 'SESSION') return false;

      let cache = null;
      try {
        cache = JSON.parse(ls.get('cv.cache') || 'null');
      } catch {}

      const expected = typeof expectedEmail === 'string' ? expectedEmail.trim().toLowerCase() : '';
      const cachedEmail =
        typeof cache?.me?.email === 'string' ? cache.me.email.trim().toLowerCase() : '';
      const identityMatches = !expected || (cachedEmail && cachedEmail === expected);

      if (error.code === 'NET' && cache && cache.me && identityMatches) {
        Object.assign(S, {
          me: cache.me,
          settings: cache.settings,
          vendors: cache.vendors || [],
          names: cache.names || {},
          vouchers: [],
          offlineMode: true,
          voucherDiagnostics: {
            envelopeValid: false,
            dataAvailable: false,
            unavailableReason: 'offline',
            malformedRecordCount: 0,
            malformedFieldCount: 0,
          },
        });
        offline = true;
      } else {
        S.offlineMode = false;
        $('#login').classList.remove('hidden');
        $('#lErr').textContent =
          error.code === 'NET' && expected && cache?.me && !identityMatches
            ? 'The saved offline workspace belongs to a different account. Connect and sign in to continue.'
            : error.message;
        return false;
      }
    }

    $('#app').classList.remove('hidden');
    const propertyName = scalarText(S.settings?.propertyName);
    $('#brand').textContent = propertyName || 'Cash Vouchers';
    document.title = propertyName || 'Vouchers';
    const who = $('#who');
    who.replaceChildren(
      document.createTextNode(scalarText(S.me?.name)),
      document.createElement('br'),
      document.createTextNode(scalarText(S.me?.role)),
    );

    renderNav();
    go(
      offline
        ? 'new'
        : S.view && NAV.find((item) => item[0] === S.view && item[3]())
          ? S.view
          : 'dash',
    );

    await getPayments().showBanner();

    if (offline) {
      toast(
        'Offline workspace — server vouchers are unavailable. New entries stay on this device. Reconnect and sign in online to synchronize.',
      );
    } else {
      getPayments().flushOutbox();
    }
    return true;
  }

  function renderNav() {
    const nav = $('#nav');
    const navContent = document.createDocumentFragment();
    NAV.filter(
      (item) => (!S.offlineMode || OFFLINE_VIEWS.has(item[0])) && item[3](),
    ).forEach(([view, icon, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.v = view;

      const iconElement = document.createElement('span');
      iconElement.className = 'ic';
      iconElement.setAttribute('aria-hidden', 'true');
      iconElement.textContent = icon;

      const labelElement = document.createElement('span');
      labelElement.textContent = label;

      button.append(iconElement, labelElement);
      navContent.appendChild(button);
    });
    nav.replaceChildren(navContent);
  }
  function go(view) {
    if (S.offlineMode && (!OFFLINE_VIEWS.has(view) || (view === 'new' && !can('create')))) {
      view = can('create') ? 'new' : 'reg';
    }
    if (S.view === 'new') getPayments().disposePreviews();
    S.view = view;
    $$('#nav button').forEach((button) => {
      const active = button.dataset.v === view;
      button.classList.toggle('on', active);

      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    const render = renderers[view];
    if (!render) return;

    render();
    window.scrollTo(0, 0);
  }

  async function refresh(quiet) {
    const button = $('[data-act="refresh"]');
    const originalLabel = button?.textContent || '↻ Refresh';

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Refreshing…';
    }

    try {
      await load();
      renderNav();
      // Background outbox sync may refresh data while a staff member is drafting an entry.
      if (S.view !== 'new') go(S.view);
      if (!quiet) toast('Updated.', 'ok');
    } catch (error) {
      if (!quiet) fail(error);
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.textContent = originalLabel;
      }
    }
  }

  function bind() {
    $('#nav').addEventListener('click', (event) => {
      const button = event.target.closest('[data-v]');
      if (button) go(button.dataset.v);
    });

    document.addEventListener('visibilitychange', () => {
      if (
        !document.hidden &&
        S.me &&
        Date.now() - S.loadedAt > 120000 &&
        !$('#modal').hasChildNodes()
      ) {
        if (S.view !== 'new' && S.view !== 'bulk') refresh(true);
        getPayments().flushOutbox();
      }
    });
  }

  return {
    NAV,
    bind,
    load,
    start,
    go,
    refresh,
  };
}
