import { $, $$ } from '../core/dom.js';
import { S, can } from '../core/state.js';
import { esc } from '../core/utils.js';
import { fail, toast } from '../core/ui.js';
import { ls } from '../core/storage.js';

export function createNavigation({ api, getAuth, getPayments, renderers }) {
  const NAV = [
    ['dash', '📊', 'Dashboard', () => true],
    ['new', '➕', 'New Entry', () => can('create')],
    ['reg', '📒', 'Register', () => true],
    ['bulk', '📥', 'Bulk Upload', () => can('bulk')],
    ['vend', '🏪', 'Vendors', () => can('vendors')],
    ['users', '👥', 'Users', () => can('users')],
    ['set', '⚙️', 'Settings', () => can('settings')],
    ['acct', '👤', 'Account', () => true],
  ];

  async function load() {
    const data = await api('bootstrap');

    Object.assign(S, {
      me: data.user,
      settings: data.settings,
      vouchers: data.vouchers,
      vendors: data.vendors,
      names: data.names,
      loadedAt: Date.now(),
    });

    ls.set('cv.name', data.settings.propertyName);
    ls.set(
      'cv.cache',
      JSON.stringify({
        me: data.user,
        names: data.names,
        settings: data.settings,
        vendors: data.vendors,
        vn: [...new Set(data.vouchers.map((voucher) => voucher.vendor))].slice(0, 300),
      }),
    );
  }

  async function start(mustChange) {
    $('#login').classList.add('hidden');

    if (mustChange) {
      $('#app').classList.add('hidden');
      return getAuth().forcePinChange();
    }

    let offline = false;

    try {
      await load();
    } catch (error) {
      if (error.code === 'PIN_CHANGE' || error.code === 'SESSION') return;

      let cache = null;

      try {
        cache = JSON.parse(ls.get('cv.cache') || 'null');
      } catch {}

      if (error.code === 'NET' && cache && cache.me) {
        Object.assign(S, {
          me: cache.me,
          settings: cache.settings,
          vendors: cache.vendors || [],
          names: cache.names || {},
          vouchers: [],
        });
        offline = true;
      } else {
        $('#login').classList.remove('hidden');
        $('#lErr').textContent = error.message;
        return;
      }
    }

    $('#app').classList.remove('hidden');
    $('#brand').textContent = S.settings.propertyName || 'Cash Vouchers';
    document.title = S.settings.propertyName || 'Vouchers';
    $('#who').innerHTML = `${esc(S.me.name)}<br>${esc(S.me.role)}`;
    $('#nav').innerHTML = NAV.filter((item) => item[3]())
      .map(
        (item) =>
          `<button type="button" data-v="${item[0]}"><span class="ic" aria-hidden="true">${item[1]}</span><span>${item[2]}</span></button>`,
      )
      .join('');

    go(
      offline
        ? 'new'
        : S.view && NAV.find((item) => item[0] === S.view && item[3]())
          ? S.view
          : 'dash',
    );

    if (offline) {
      toast('Offline — you can still add payments; they upload when you are back online.');
    } else {
      getPayments().flushOutbox();
    }
  }

  function go(view) {
    S.view = view;
    $$$('#nav button').forEach((button) => {
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
    try {
      await load();
      go(S.view);
      if (!quiet) toast('Updated.', 'ok');
    } catch (error) {
      if (!quiet) fail(error);
    }
  }

  function bind() {
    $('#nav').addEventListener('click', (event) => {
      const button = event.target.closest('[data-v]');
      if (button) go(button.dataset.v);
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && S.me && Date.now() - S.loadedAt > 120000 && !$('#modal').innerHTML) {
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
