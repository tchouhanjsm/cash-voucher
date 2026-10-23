import { $, $$ } from '../core/dom.js';
import { normalizeVoucherCollection, S, can } from '../core/state.js';
import { fail, toast } from '../core/ui.js';
import { ls } from '../core/storage.js';
import { scalarText } from '../core/utils.js';
import { createShell } from './shell.js';

const NAV_ICON_NAMES = new Set([
  'home',
  'plus',
  'book',
  'chart',
  'wallet',
  'upload',
  'store',
  'users',
  'settings',
  'receipt',
  'user',
  'check',
]);

export function createNavigation({ api, getAuth, getPayments, renderers }) {
  const OFFLINE_VIEWS = new Set(['dash', 'new', 'reg', 'acct']);
  const NAV = [
    ['dash', 'home', 'Dashboard', () => can('viewAll') || can('viewOwn')],
    ['new', 'plus', 'New Entry', () => can('create')],
    ['reg', 'book', 'Register', () => can('viewAll') || can('viewOwn')],
    ['reports', 'chart', 'Reports', () => can('reports')],
    ['cashClose', 'wallet', 'Cash Close', () => can('cashClose')],
    ['bulk', 'upload', 'Bulk Upload', () => can('bulk')],
    ['vend', 'store', 'Vendors', () => can('vendors')],
    ['users', 'users', 'Users', () => can('users')],
    ['set', 'settings', 'Settings', () => can('settings')],
    ['audit', 'receipt', 'Audit log', () => can('audit')],
    ['acct', 'user', 'Account', () => true],
    ['onboarding', 'check', 'Onboarding', () => can('settings')],
  ];

  const NAV_GROUPS = {
    dash: 'Work',
    new: 'Work',
    reg: 'Work',
    reports: 'Money',
    cashClose: 'Money',
    bulk: 'Manage',
    vend: 'Manage',
    users: 'Manage',
    set: 'Manage',
    audit: 'Manage',
    onboarding: 'Manage',
  };
  const MOBILE_SHORTCUTS = new Set(['dash', 'new', 'reg', 'reports']);
  const shell = createShell({ go: (view, options) => go(view, options) });

  // A visibility restore, manual refresh, and background outbox sync can request
  // bootstrap concurrently. Share same-session work and ignore stale-session responses
  // so a late request cannot overwrite the current user's data or diagnostics.
  let activeBootstrapLoad = null;
  let activeViewRenderId = 0;

  async function load() {
    const requestToken = S.token;
    if (activeBootstrapLoad && activeBootstrapLoad.token === requestToken) {
      return activeBootstrapLoad.promise;
    }

    const request = { token: requestToken, promise: null };
    request.promise = (async () => {
      const data = await api('bootstrap');
      if (S.token !== requestToken) return false;

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
          invalidAmountCount: voucherData.invalidAmountCount,
        },
        vendors: data.vendors,
        names: data.names,
        loadedAt: Date.now(),
        offlineMode: false,
      });
      S.environment = (window.CV_CONFIG || {}).ENVIRONMENT || '';
      S.deploymentId = (window.CV_CONFIG || {}).DEPLOYMENT_ID || '';

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
      return true;
    })();

    activeBootstrapLoad = request;
    try {
      return await request.promise;
    } finally {
      if (activeBootstrapLoad === request) activeBootstrapLoad = null;
    }
  }

  async function start(mustChange, expectedEmail = '') {
    $('#login').classList.add('hidden');

    if (mustChange) {
      $('#app').classList.add('hidden');
      getAuth().forcePasswordChange();
      return false;
    }

    let offline = false;

    try {
      const loaded = await load();
      if (!loaded) return false;
    } catch (error) {
      if (error.code === 'PASSWORD_CHANGE') {
        getAuth().forcePasswordChange();
        return false;
      }
      if (error.code === 'SESSION') return false;

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
    shell.render();

    if (!offline && can('settings')) {
      try {
        const onboarding = await api('onboardingState');
        S.onboardingStage = onboarding.stage;
        S.onboardingEnvironment = onboarding.environment;
      } catch {
        S.onboardingStage = 'unverified';
      }
    }

    const ownerNeedsOnboarding =
      !offline && S.me?.role === 'owner' && S.onboardingStage !== 'complete';
    const savedView =
      S.view !== 'onboarding' && NAV.find((item) => item[0] === S.view && item[3]());

    renderNav();
    go(
      offline
        ? 'new'
        : ownerNeedsOnboarding
          ? 'onboarding'
          : savedView
            ? S.view
            : can('reports') && !can('viewAll') && !can('viewOwn')
              ? 'reports'
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

  function createNavButton(view, icon, label, more = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.v = view;
    if (more) {
      button.className = 'nav-more-item';
    } else if (!MOBILE_SHORTCUTS.has(view)) {
      button.className = 'mobile-overflow-item';
    }

    const iconElement = document.createElement('span');
    iconElement.className = 'ic';
    iconElement.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'i');
    svg.setAttribute('focusable', 'false');
    const iconName = NAV_ICON_NAMES.has(icon) ? icon : 'user';
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${iconName}`);
    svg.appendChild(use);
    iconElement.appendChild(svg);

    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    button.append(iconElement, labelElement);
    return button;
  }

  function syncNavActiveState() {
    $$('#nav button[data-v], #navMoreItems button[data-v]').forEach((button) => {
      const active = button.dataset.v === S.view;
      button.classList.toggle('on', active);

      if (active) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });

    const moreButton = $('#mobileMoreBtn');
    const moreActive = Boolean(S.view) && S.view !== 'acct' && !MOBILE_SHORTCUTS.has(S.view);
    moreButton.classList.toggle('on', moreActive);
    if (moreActive) {
      moreButton.setAttribute('aria-current', 'page');
    } else {
      moreButton.removeAttribute('aria-current');
    }
  }

  function renderNav() {
    const available = NAV.filter(
      (item) => item[0] !== 'acct' && (!S.offlineMode || OFFLINE_VIEWS.has(item[0])) && item[3](),
    );
    const navContent = document.createDocumentFragment();
    let lastGroup = '';

    available.forEach(([view, icon, label]) => {
      const group = NAV_GROUPS[view] || '';
      if (group && group !== lastGroup) {
        const heading = document.createElement('p');
        heading.className = 'nav-label';
        heading.textContent = group;
        navContent.appendChild(heading);
        lastGroup = group;
      }
      navContent.appendChild(createNavButton(view, icon, label));
    });
    $('#nav').replaceChildren(navContent);

    const overflowItems = available.filter(([view]) => !MOBILE_SHORTCUTS.has(view));
    const moreContent = document.createDocumentFragment();
    lastGroup = '';
    overflowItems.forEach(([view, icon, label]) => {
      const group = NAV_GROUPS[view] || '';
      if (group && group !== lastGroup) {
        const heading = document.createElement('p');
        heading.className = 'nav-more-label';
        heading.textContent = group;
        moreContent.appendChild(heading);
        lastGroup = group;
      }
      moreContent.appendChild(createNavButton(view, icon, label, true));
    });
    $('#navMoreItems').replaceChildren(moreContent);
    $('#navMoreEmpty').hidden = overflowItems.length > 0;
    syncNavActiveState();
  }

  function moreIsOpen() {
    return !$('#navMore').classList.contains('hidden');
  }

  function closeMore(restoreFocus = false) {
    $('#navMore').classList.add('hidden');
    $('#navMore').setAttribute('aria-hidden', 'true');
    $('#mobileMoreBtn').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('#mobileMoreBtn').focus();
  }

  function openMore() {
    $('#navMore').classList.remove('hidden');
    $('#navMore').setAttribute('aria-hidden', 'false');
    $('#mobileMoreBtn').setAttribute('aria-expanded', 'true');
    $('#navMorePanel').focus();
  }

  function focusPageHeading() {
    const heading = $('#view .page-header h1');
    if (!heading) {
      $('#main-content').focus({ preventScroll: true });
      return false;
    }

    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    return document.activeElement === heading;
  }

  function go(view, options = {}) {
    const focusHeading = options?.focusHeading === true;
    const requestedView = NAV.find((item) => item[0] === view);
    if (!requestedView || !requestedView[3]()) {
      view = can('reports') ? 'reports' : can('create') ? 'new' : 'dash';
    }
    if (S.offlineMode && (!OFFLINE_VIEWS.has(view) || (view === 'new' && !can('create')))) {
      view = can('create') ? 'new' : 'reg';
    }
    if (S.view === 'new') getPayments().disposePreviews();
    S.view = view;
    syncNavActiveState();

    const render = renderers[view];
    if (!render) return;

    const renderId = ++activeViewRenderId;
    const renderResult = render();
    window.scrollTo(0, 0);

    if (focusHeading) {
      focusPageHeading();

      // Async screens can replace their loading surface after the initial focus
      // operation. Restore focus only if rendering detached/lost it and this is
      // still the active route/render; never interrupt a user who moved elsewhere.
      if (renderResult && typeof renderResult.then === 'function') {
        Promise.resolve(renderResult)
          .then(() => {
            if (renderId !== activeViewRenderId || S.view !== view) return;
            const active = document.activeElement;
            if (!active || active === document.body || !active.isConnected) {
              focusPageHeading();
            }
          })
          .catch(() => {});
      }
    }

    // Expose async screen completion so callers such as background sync can wait
    // until the active server-backed view reflects the latest committed data.
    return renderResult;
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
      const loaded = await load();
      if (!loaded) return;
      renderNav();
      // Background outbox sync may refresh data while a staff member is drafting an entry.
      if (S.view !== 'new') await go(S.view);
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
    shell.bind();
    $('#nav').addEventListener('click', (event) => {
      const button = event.target.closest('[data-v]');
      if (button) go(button.dataset.v, { focusHeading: true });
    });

    $('#mobileMoreBtn').addEventListener('click', () => {
      if (moreIsOpen()) {
        closeMore(true);
      } else {
        openMore();
      }
    });

    $('#navMore').addEventListener('click', (event) => {
      if (event.target.closest('[data-nav-more-close]')) {
        closeMore(true);
        return;
      }
      const button = event.target.closest('#navMoreItems button[data-v]');
      if (!button) return;
      const view = button.dataset.v;
      closeMore();
      go(view, { focusHeading: true });
    });

    document.addEventListener('keydown', (event) => {
      if (!moreIsOpen()) return;
      if (event.key === 'Escape') {
        closeMore(true);
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = $('#navMorePanel');
      const focusable = [
        ...panel.querySelectorAll('button, a[href], input, select, textarea'),
      ].filter((element) => !element.disabled && element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === panel)
      ) {
        event.preventDefault();
        first.focus();
      }
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
