import { createApi } from './core/api.js';
import { $ } from './core/dom.js';
import { registerActions, installActionDelegation } from './core/actions.js';
import { S } from './core/state.js';
import { ls } from './core/storage.js';
import { busy, closeModal, dialog, fail, toast } from './core/ui.js';

import { createAuth } from './features/auth.js';
import { createPayments } from './features/payments.js';
import { createDashboard } from './features/dashboard.js';
import { createReports } from './features/reports.js';
import { createRegister } from './features/register.js';
import { createBulk } from './features/bulk.js';
import { createAdministration } from './features/administration.js';
import { createNavigation } from './features/navigation.js';
import { printVoucher } from './features/printing.js';

let auth;
let payments;
let navigation;

const apiTransport = createApi({
  getUrl: () => S.url,
  getToken: () => S.token,
});

async function api(action, payload = {}) {
  try {
    return await apiTransport(action, payload);
  } catch (error) {
    auth?.handleApiError(error);
    throw error;
  }
}

const dashboard = createDashboard();
const reports = createReports({ api });

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
  getAuth: () => auth,
  getPayments: () => payments,
  renderers: {
    dash: dashboard.render,
    reports: reports.render,
    new: () => payments.open('PAYMENT'),
    reg: register.render,
    bulk: bulk.render,
    vend: administration.vendors,
    users: administration.users,
    set: administration.settings,
    audit: administration.audit,
    acct: administration.account,
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

  delrow: ({ element }) => payments.removeRow(element),

  clrrec: ({ element }) => payments.clearReceipt(element),

  newagain: () => payments.newAgain(),

  ntype: ({ key }) => payments.open(key),

  print: ({ id }) => printVoucher(id),

  edit: ({ id }) => register.edit(id),

  cancel: ({ id }) => register.cancel(id),

  rec: ({ id }) => register.receipts(id),

  more: () => {
    register.state.limit += 200;
    register.renderRows();
  },

  rclear: () => register.clearFilters(),

  csv: () => register.csvExport(),

  flush: () => payments.flushOutbox(),

  'export-pending': () => payments.exportOutbox(),

  'import-pending': () => payments.importOutbox(),

  discard: () => payments.discardOutbox(),

  tpl: () => bulk.downloadTemplate(),

  parse: ({ element }) => busy(element, () => bulk.parseInput().catch(fail)),

  import: ({ element }) => bulk.runImport(element),

  goreg: () => bulk.goRegister(),

  bulkagain: () => bulk.renderAgain(),

  vclr: () => {
    $('#vf').reset();
    $('#vid').value = '';
  },

  vedit: ({ id }) => administration.editVendor(id),

  vtog: ({ id }) => administration.toggleVendor(id),

  upin: ({ id }) => administration.resetPin(id),

  utog: ({ id }) => administration.toggleUser(id),

  urole: ({ id, element }) => administration.updateRole(id, element.value),

  audclear: () => administration.clearAuditFilters(),

  audcsv: () => administration.exportAuditCsv(),

  dqscan: () => administration.dataQualityScan(),

  bkintegrity: () => administration.backupIntegrityScan(),

  reportRun: () => reports.load(),

  reportCsv: () => reports.exportCsv(),

  install: () => administration.install(),

  signout: () => administration.signOut(),
});

function bindFeatures() {
  navigation.bind();
  register.bind();
  bulk.bind();
  administration.bind();
  installActionDelegation();
}

function init() {
  S.url = (window.CV_CONFIG && CV_CONFIG.API_URL) || ls.get('cv.url') || '';

  S.token = ls.get('cv.token') || '';

  if (location.protocol.startsWith('http') && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  bindFeatures();
  payments.showBanner();

  if (S.token && S.url) {
    $('#login').classList.add('hidden');
    navigation.start();
  } else {
    auth.showLogin();
  }

  $('#boot').classList.add('hidden');
}

init();
