import { createApi } from './core/api.js';
import { createUnsavedWorkGuard } from './core/unsaved-work.js';
import { $ } from './core/dom.js';
import { registerActions, installActionDelegation } from './core/actions.js';
import { S } from './core/state.js';
import { registerPwa } from './core/pwa.js';
import { ls } from './core/storage.js';
import {
  clearPersistedApiSessionToken,
  resolveApiSession,
  SESSION_ENDPOINT_STORAGE_KEY,
} from './core/session.js';
import { initTheme } from './core/theme.js';
import { busy, closeModal, dialog, fail, toast } from './core/ui.js';

import { createAuth } from './features/auth.js';
import { createPayments } from './features/payments.js';
import { createDashboard } from './features/dashboard.js';
import { createReports } from './features/reports.js';
import { createCashClose } from './features/cash-close.js';
import { createRegister } from './features/register.js';
import { createBulk } from './features/bulk.js';
import { createAdministration } from './features/administration.js';
import { createNavigation } from './features/navigation.js';
import { createOnboarding } from './features/onboarding.js';
import { printVoucher } from './features/printing.js';

let auth;
let payments;
let navigation;

const apiTransport = createApi({
  getUrl: () => S.url,
  getToken: () => S.token,
});

const unsavedWork = createUnsavedWorkGuard({
  onBlocked: () =>
    toast('A voucher save is still in progress. Wait for it to finish before leaving.', 'err'),
});

async function api(action, payload = {}) {
  try {
    return await apiTransport(action, payload);
  } catch (error) {
    auth?.handleApiError(error);
    throw error;
  }
}

const dashboard = createDashboard({ api });
const reports = createReports({ api });
const cashClose = createCashClose({ api });
const onboarding = createOnboarding({ api });

const authStart = (...args) => navigation.start(...args);
const paymentRefresh = (...args) => navigation.refresh(...args);
const go = (view) => navigation.go(view);

auth = createAuth({
  S,
  api,
  busy,
  dialog,
  closeModal,
  toast,
  start: authStart,
});

payments = createPayments({
  api,
  refresh: paymentRefresh,
});

const register = createRegister({
  api,
  go,
});

const bulk = createBulk({
  api,
  refresh: paymentRefresh,
  go,
});

const administration = createAdministration({
  api,
  getNavigation: () => navigation,
  signOut: () => auth.signOut(),
});

navigation = createNavigation({
  api,
  unsavedWork,
  getAuth: () => auth,
  getPayments: () => payments,
  renderers: {
    dash: dashboard.render,
    reports: reports.render,
    cashClose: cashClose.render,
    new: () => payments.open('PAYMENT'),
    reg: register.render,
    bulk: bulk.render,
    vend: administration.vendors,
    users: administration.users,
    set: administration.settings,
    audit: administration.audit,
    acct: administration.account,
    onboarding: onboarding.render,
  },
});

registerActions({
  refresh: () => navigation.refresh(),

  range: ({ key }) => {
    dashboard.state.r = key;
    dashboard.render();
  },

  cus: () => {
    const from = $('#dFrom').value;
    const to = $('#dTo').value;

    if (!from || from > to) {
      toast('Pick a valid range.', 'err');
      return;
    }

    dashboard.state.from = from;
    dashboard.state.to = to;
    dashboard.state.r = 'cus';
    dashboard.render();
  },

  addrow: () => payments.addRow(),

  'save-payee': ({ element }) => payments.savePayee(element),

  delrow: ({ element }) => payments.removeRow(element),

  clrrec: ({ element }) => payments.clearReceipt(element),

  newagain: () => payments.newAgain(),

  ntype: ({ key }) => {
    if (unsavedWork.confirmDiscard()) payments.open(key);
  },

  print: ({ id }) => printVoucher(id),

  edit: ({ id }) => register.edit(id),

  cancel: ({ id }) => register.cancel(id),

  approve: ({ id }) => register.approve(id),

  reject: ({ id }) => register.reject(id),

  rec: ({ id }) => register.receipts(id),

  history: ({ id }) => register.history(id),

  more: () => register.loadMore(),

  rclear: () => register.clearFilters(),

  csv: () => register.csvExport(),

  flush: () => payments.flushOutbox(),

  'export-pending': () => payments.exportOutbox(),

  'import-pending': () => payments.importOutbox(),

  discard: () => payments.discardOutbox(),

  'discard-failed': ({ id }) => payments.discardFailedOutbox(id),

  'reconnect-signin': () => auth.signInOnline(),

  tpl: () => bulk.downloadTemplate(),

  parse: ({ element }) => busy(element, () => bulk.parseInput().catch(fail)),

  import: ({ element }) => bulk.runImport(element),

  goreg: () => bulk.goRegister(),

  goto: ({ key }) => {
    if (key === 'reg') navigation.go('reg');
  },

  bulkagain: () => bulk.renderAgain(),

  vclr: () => {
    $('#vf').reset();
    $('#vid').value = '';
  },

  vedit: ({ id }) => administration.editVendor(id),

  vtog: ({ id }) => administration.toggleVendor(id),

  upassword: ({ id }) => administration.resetPassword(id),

  usersRetry: () => administration.users(),

  audretry: () => administration.audit(),

  'backup-retry': () => administration.retryBackupStatus(),

  utog: ({ id }) => administration.toggleUser(id),

  urole: ({ id, element }) => administration.updateRole(id, element.value),

  audclear: () => administration.clearAuditFilters(),

  audcsv: () => administration.exportAuditCsv(),

  audhealth: () => administration.exportAuditHealthSnapshot(),

  audmore: () => administration.loadOlderAuditEvents(),

  dqscan: () => administration.dataQualityScan(),

  dqexport: () => administration.exportDataQualityReport(),

  bkintegrity: () => administration.backupIntegrityScan(),

  bkexport: () => administration.exportBackupIntegrityReport(),

  reportRun: () => reports.load(),

  reportCsv: () => reports.exportCsv(),

  closePreview: () => cashClose.preview(),

  closeCreate: ({ element }) => cashClose.create(element),

  closeCsv: () => cashClose.exportCsv(),

  closePrint: () => cashClose.print(),

  closeCorrection: ({ element }) => cashClose.recordCorrection(element),

  closeSelect: ({ key }) => cashClose.selectClose(key),

  install: () => administration.install(),

  signout: () => administration.signOut(),
});

function bindFeatures() {
  navigation.bind();
  register.bind();
  bulk.bind();
  administration.bind();
  onboarding.init();
  installActionDelegation();
}

async function init() {
  try {
    const session = resolveApiSession({
      configuredEndpoint: window.CV_CONFIG?.API_URL,
      storedEndpoint: ls.get('cv.url'),
      token: ls.get('cv.token'),
      tokenEndpoint: ls.get(SESSION_ENDPOINT_STORAGE_KEY),
    });
    S.url = session.endpoint;
    S.token = session.token;
    if (session.clearPersistedToken) clearPersistedApiSessionToken(ls);

    registerPwa({ confirmDiscardUnsavedWork: unsavedWork.confirmDiscard });

    bindFeatures();
    void payments.showBanner().catch((error) => {
      console.error('Could not restore the offline queue banner:', error);
    });

    if (session.autoResume) {
      $('#login').classList.add('hidden');
      const started = await navigation.start();
      if (
        !started &&
        $('#login').classList.contains('hidden') &&
        $('#app').classList.contains('hidden') &&
        !$('#modal')?.classList.contains('open')
      ) {
        auth.showLogin('Your session could not be restored. Sign in again to continue.');
      }
    } else {
      auth.showLogin();
    }
  } catch (error) {
    console.error('Application startup failed:', error);
    if ($('#login').classList.contains('hidden') && $('#app').classList.contains('hidden')) {
      auth.showLogin('The workspace could not be loaded. Sign in again or retry your connection.');
    }
  } finally {
    // Keep the boot status visible until session recovery has reached a real login or app state.
    $('#boot').classList.add('hidden');
  }
}

initTheme();
void init();
