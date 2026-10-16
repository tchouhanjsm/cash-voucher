import { $ } from '../core/dom.js';
import { categories, rcats, S } from '../core/state.js';
import { ls } from '../core/storage.js';
import { csvCell, download, esc, initials, scalarText } from '../core/utils.js';
import {
  closeModal,
  dialog,
  fail,
  formPanel,
  head,
  refreshBtn,
  tableView,
  toast,
} from '../core/ui.js';

export function createAdministration({ api, getNavigation, signOut }) {
  let deferredInstall;
  let users = [];
  let auditRows = [];
  const auditFilters = { query: '', user: '', action: '', from: '', to: '' };
  let malformedAuditCount = 0;
  let auditResponseInvalid = false;
  let auditRequestFailed = false;
  let auditNextBeforeRow = null;
  let auditTotalCount = 0;
  let auditHealth = null;
  let auditLoadingOlder = false;
  let backupStatusLoading = false;
  let lastDataQualityReport = null;
  let lastBackupIntegrityReport = null;

  function getVendorRows() {
    const envelopeValid = Array.isArray(S.vendors);
    const receivedRows = envelopeValid ? S.vendors : [];
    const isValidVendor = (vendor) =>
      vendor !== null &&
      typeof vendor === 'object' &&
      !Array.isArray(vendor) &&
      typeof vendor.id === 'string' &&
      vendor.id.trim() !== '' &&
      typeof vendor.name === 'string' &&
      vendor.name.trim() !== '' &&
      (vendor.company === undefined ||
        vendor.company === null ||
        typeof vendor.company === 'string') &&
      (vendor.mobile === undefined ||
        vendor.mobile === null ||
        typeof vendor.mobile === 'string') &&
      typeof vendor.active === 'boolean';
    const rows = receivedRows.filter(isValidVendor).map((vendor) => ({
      ...vendor,
      company: typeof vendor.company === 'string' ? vendor.company : '',
      mobile: typeof vendor.mobile === 'string' ? vendor.mobile : '',
    }));

    return {
      rows,
      malformedCount: receivedRows.length - rows.length,
      envelopeValid,
    };
  }

  function vendors() {
    const vendorData = getVendorRows();
    const status = !vendorData.envelopeValid
      ? '<p class="muted" role="status" aria-live="polite">Vendor data is unavailable because the server response was invalid. Refresh and try again.</p>'
      : vendorData.malformedCount
        ? `<p class="muted" role="status" aria-live="polite">${vendorData.malformedCount} malformed vendor record(s) omitted from this response. Refresh and retry.</p>`
        : '';
    const emptyState =
      !vendorData.envelopeValid || vendorData.malformedCount
        ? '<tr><td colspan="6" class="muted">No valid vendor records could be displayed. Refresh and retry.</td></tr>'
        : '<tr><td colspan="6" class="muted">No vendors yet — vendors you pay are also remembered automatically.</td></tr>';
    const rows = vendorData.rows
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (vendor) =>
          `<tr><td>${esc(vendor.name)}</td><td><code>${esc(vendor.id)}</code></td><td>${esc(vendor.company)}</td><td>${esc(vendor.mobile)}</td><td><span class="badge ${vendor.active ? '' : 'bad'}">${vendor.active ? 'ACTIVE' : 'INACTIVE'}</span></td><td class="r nw"><button class="btn sm" data-act="vedit" data-id="${esc(vendor.id)}">Edit</button> <button class="btn sm" data-act="vtog" data-id="${esc(vendor.id)}">${vendor.active ? 'Deactivate' : 'Activate'}</button></td></tr>`,
      )
      .join('');

    const vendorTable = tableView({
      label: 'Saved vendors',
      columns: [
        { label: 'Name', nowrap: true },
        { label: 'Stable Vendor ID', nowrap: true },
        { label: 'Company' },
        { label: 'Mobile', nowrap: true },
        { label: 'Status' },
        { label: 'Actions', align: 'right', nowrap: true },
      ],
      rows: rows || emptyState,
    });

    $('#view').innerHTML =
      head('Vendors', refreshBtn, {
        section: 'Manage',
        description: 'Maintain the payee directory used when recording vouchers.',
      }) +
      status +
      formPanel({
        id: 'vf',
        title: 'Vendor details',
        fields: [
          '<input type="hidden" id="vid">',
          '<input id="vn" aria-label="Vendor name" autocomplete="organization" placeholder="Vendor name" required>',
          '<input id="vc" aria-label="Company name (optional)" placeholder="Company (optional)">',
          '<input id="vm" aria-label="Mobile number (optional)" type="tel" placeholder="Mobile (optional)" inputmode="tel">',
          '<button class="btn primary">Save vendor</button>',
          '<button type="button" class="btn" data-act="vclr">Clear</button>',
        ].join(''),
      }) +
      '<div class="card">' +
      vendorTable +
      '</div>';
  }
  async function saveVendor() {
    try {
      await api('saveVendor', {
        id: $('#vid').value || undefined,
        name: $('#vn').value,
        company: $('#vc').value,
        mobile: $('#vm').value,
      });
      await getNavigation().load();
      toast('Vendor saved.', 'ok');
      vendors();
    } catch (error) {
      fail(error);
    }
  }

  function editVendor(id) {
    const vendor = getVendorRows().rows.find((item) => item.id === id);
    if (!vendor) {
      toast('This vendor record is unavailable. Refresh the list and try again.', 'err');
      return;
    }
    $('#vid').value = id;
    $('#vn').value = vendor.name;
    $('#vc').value = vendor.company;
    $('#vm').value = vendor.mobile;
    $('#vn').focus();
  }

  async function toggleVendor(id) {
    try {
      await api('toggleVendor', { id });
      await getNavigation().load();
      vendors();
    } catch (error) {
      fail(error);
    }
  }

  function renderUsersLoadState(failed = false) {
    const view = $('#view');
    const pageHeader = document.createElement('div');
    pageHeader.className = 'head page-header';

    const pageHeaderCopy = document.createElement('div');
    pageHeaderCopy.className = 'page-header-copy';

    const pageTitle = document.createElement('h1');
    pageTitle.textContent = 'Users';
    pageHeaderCopy.appendChild(pageTitle);

    const pageHeaderActions = document.createElement('div');
    pageHeaderActions.className = 'page-header-actions';

    const refresh = document.createElement('button');
    refresh.className = 'btn sm';
    refresh.type = 'button';
    refresh.dataset.act = 'refresh';
    refresh.textContent = '↻ Refresh';
    pageHeaderActions.appendChild(refresh);
    pageHeader.append(pageHeaderCopy, pageHeaderActions);

    if (!failed) {
      const loading = document.createElement('p');
      loading.className = 'muted';
      loading.setAttribute('role', 'status');
      loading.setAttribute('aria-live', 'polite');
      loading.textContent = 'Loading users…';
      view.replaceChildren(pageHeader, loading);
      return;
    }

    const errorPanel = document.createElement('section');
    errorPanel.id = 'users-load-error';
    errorPanel.className = 'card form-error';
    errorPanel.setAttribute('role', 'alert');
    errorPanel.setAttribute('aria-live', 'assertive');

    const errorTitle = document.createElement('h2');
    errorTitle.textContent = 'Users unavailable';

    const errorMessage = document.createElement('p');
    errorMessage.textContent =
      'The user list could not be loaded. Check your connection and retry. The failure is not treated as an empty user list.';

    const retry = document.createElement('button');
    retry.className = 'btn primary';
    retry.type = 'button';
    retry.dataset.act = 'usersRetry';
    retry.textContent = 'Retry loading users';

    errorPanel.append(errorTitle, errorMessage, retry);
    view.replaceChildren(pageHeader, errorPanel);
  }

  async function usersView() {
    renderUsersLoadState();

    let response;
    try {
      response = await api('listUsers');
    } catch (error) {
      console.warn('Users list could not be loaded:', error);
      renderUsersLoadState(true);
      return;
    }

    const roles = ['staff', 'manager', 'accountant', 'owner'];
    const envelopeValid = Array.isArray(response);
    const receivedUsers = envelopeValid ? response : [];
    users = receivedUsers.filter(
      (user) =>
        user !== null &&
        typeof user === 'object' &&
        !Array.isArray(user) &&
        typeof user.id === 'string' &&
        user.id.trim() !== '' &&
        typeof user.name === 'string' &&
        user.name.trim() !== '' &&
        typeof user.email === 'string' &&
        user.email.trim() !== '' &&
        roles.includes(user.role) &&
        typeof user.active === 'boolean',
    );
    const malformedCount = receivedUsers.length - users.length;
    const status = !envelopeValid
      ? '<p class="muted" role="status" aria-live="polite">User data is unavailable because the server response was invalid. Refresh and try again.</p>'
      : malformedCount
        ? `<p class="muted" role="status" aria-live="polite">${malformedCount} malformed user record(s) omitted from this response. Refresh and retry.</p>`
        : '';
    const emptyRow =
      !envelopeValid || malformedCount
        ? '<tr><td colspan="5" class="muted">No valid user records could be displayed. Refresh and retry.</td></tr>'
        : '<tr><td colspan="5" class="muted">No users yet.</td></tr>';

    const rows = users
      .map(
        (user) =>
          `<tr><td>${esc(user.name)}</td><td>${esc(user.email)}</td><td><select aria-label="Role for ${esc(user.name)}" data-act="urole" data-id="${esc(user.id)}" style="min-height:34px;padding:4px">${roles.map((role) => `<option${role === user.role ? ' selected' : ''}>${role}</option>`).join('')}</select></td><td><span class="badge ${user.active ? '' : 'bad'}">${user.active ? 'ACTIVE' : 'DISABLED'}</span></td>
     <td class="r nw"><button class="btn sm" data-act="upin" data-id="${esc(user.id)}">Reset PIN</button> <button class="btn sm ${user.active ? 'danger' : ''}" data-act="utog" data-id="${esc(user.id)}">${user.active ? 'Disable' : 'Enable'}</button></td></tr>`,
      )
      .join('');

    const userTable = tableView({
      label: 'Saved users',
      columns: [
        { label: 'Name', nowrap: true },
        { label: 'Email', nowrap: true },
        { label: 'Role' },
        { label: 'Status' },
        { label: 'Actions', align: 'right', nowrap: true },
      ],
      rows: rows || emptyRow,
      emptyMessage: 'No users yet.',
    });
    const userFormFields = [
      '<input id="un" aria-label="User name" autocomplete="name" placeholder="Name" required>',
      '<input id="ue" aria-label="Email address" autocomplete="email" type="email" placeholder="Email" required>',
      '<select id="ur" aria-label="New user role">',
      roles.map((role) => '<option>' + esc(role) + '</option>').join(''),
      '</select>',
      '<input id="up" aria-label="Temporary six-digit PIN" type="password" inputmode="numeric" pattern="[0-9]{6}" title="Enter exactly 6 digits" maxlength="6" autocomplete="new-password" placeholder="Temporary 6-digit PIN" required>',
      '<button class="btn primary">Add</button>',
    ].join('');

    $('#view').innerHTML =
      head('Users', refreshBtn, {
        section: 'Manage',
        description: 'Manage team access and role assignments.',
      }) +
      status +
      formPanel({
        id: 'uf',
        title: 'Add user',
        fields: userFormFields,
        footer:
          '<p class="muted"><b>Staff</b>: create and view own entries · <b>Manager</b>: view, edit, cancel, bulk upload, vendors, cash close, approvals and reports · <b>Accountant</b>: read-only reports and CSV export · <b>Owner</b>: full administration, approvals and reports.</p>',
      }) +
      '<div class="card">' +
      userTable +
      '</div>';
  }
  async function saveUser() {
    try {
      await api('saveUser', {
        name: $('#un').value,
        email: $('#ue').value,
        role: $('#ur').value,
        pin: $('#up').value,
      });
      toast('User added. They must change the PIN at first login.', 'ok');
      usersView();
    } catch (error) {
      fail(error);
    }
  }

  async function toggleUser(id) {
    const user = users.find((item) => item.id === id);
    if (!user) {
      toast('This user record is unavailable. Refresh the list and try again.', 'err');
      return;
    }

    try {
      await api('saveUser', {
        id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: !user.active,
      });
      usersView();
    } catch (error) {
      fail(error);
    }
  }

  async function updateRole(id, role) {
    const user = users.find((item) => item.id === id);

    if (!user) return;

    try {
      await api('saveUser', {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
        active: user.active,
      });
      toast('Role updated.', 'ok');
      usersView();
    } catch (error) {
      fail(error);
      usersView();
    }
  }

  function resetPin(id) {
    const body = document.createDocumentFragment();
    const help = document.createElement('p');
    help.className = 'muted';
    help.textContent = 'Set a temporary PIN. The user must change it at next sign-in.';

    const pin = document.createElement('input');
    pin.id = 'tp';
    pin.setAttribute('aria-label', 'Temporary six-digit PIN');
    pin.type = 'password';
    pin.inputMode = 'numeric';
    pin.pattern = '[0-9]{6}';
    pin.title = 'Enter exactly 6 digits';
    pin.maxLength = 6;
    pin.autocomplete = 'new-password';
    pin.placeholder = 'Temporary 6-digit PIN';
    pin.required = true;

    body.append(help, pin);
    dialog(
      'Reset PIN',
      body,
      async () => {
        await api('resetPin', { id, pin: $('#tp').value });
        closeModal();
        toast('PIN reset.', 'ok');
      },
      'Reset',
    );
  }

  async function settings() {
    $('#view').innerHTML =
      head('Settings', '', {
        section: 'Manage',
        description: 'Configure property defaults and review operational diagnostics.',
      }) +
      '<div class="settings-layout">' +
      `<form id="sf" class="card settings-property-form" autocomplete="off"><h2>Property</h2><label>Name<input id="sn" value="${esc(S.settings.propertyName)}" required></label><label>Address (printed on vouchers)<textarea id="sa" rows="2">${esc(S.settings.propertyAddress)}</textarea></label>
    <label>Categories (one per line)<textarea id="sc" rows="8">${esc(categories().join('\n'))}</textarea></label><div class="grid g2"><label>Next payment voucher no.<input id="sq" type="number" min="1" value="${esc(S.settings.nextVoucherNo)}"></label><label>Next cash-received no. (R-)<input id="sr" type="number" min="1" value="${esc(S.settings.nextReceiptNo)}"></label><label>Opening cash balance ₹<input id="so" inputmode="decimal" value="${esc(S.settings.openingBalance || 0)}"></label></div><label>Cash-received categories (one per line)<textarea id="sx" rows="5">${esc(rcats().join('\n'))}</textarea></label><button class="btn primary">Save settings</button></form>
    <div class="settings-diagnostics">
    <section class="card" id="backup-status" aria-live="polite"><h2>🛡️ Backup &amp; recovery</h2><p class="muted">Loading backup status…</p></section>
    <section class="card" id="data-quality"><h2>🔎 Voucher data quality</h2><p class="muted">Scan saved vouchers for missing required values, invalid amounts/dates/statuses, and duplicate identifiers. This is a record-quality check, not an accounting or tax certification.</p><button class="btn primary" type="button" data-act="dqscan">Run data-quality scan</button><div id="dq-results" role="status" aria-live="polite"><p class="muted">Run a scan to review exceptions.</p></div></section>
    </div>
    </div>
`;

    await renderBackupStatus();
  }

  function isDiagnosticRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isDiagnosticCount(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function validateDataQualityReport(report) {
    if (
      !isDiagnosticRecord(report) ||
      typeof report.generatedAt !== 'string' ||
      !report.generatedAt.trim() ||
      !isDiagnosticCount(report.scanned) ||
      !isDiagnosticCount(report.issueCount) ||
      !isDiagnosticCount(report.errors) ||
      !isDiagnosticCount(report.warnings) ||
      report.errors + report.warnings !== report.issueCount ||
      !Array.isArray(report.issues) ||
      report.issues.length > 500 ||
      report.issues.length > report.issueCount ||
      typeof report.truncated !== 'boolean' ||
      report.truncated !== report.issueCount > report.issues.length
    ) {
      throw new Error('Invalid data-quality report response.');
    }

    const issues = report.issues.filter(
      (issue) =>
        isDiagnosticRecord(issue) &&
        (issue.severity === 'error' || issue.severity === 'warning') &&
        typeof issue.code === 'string' &&
        Number.isSafeInteger(issue.sourceRow) &&
        issue.sourceRow >= 2 &&
        ['voucherId', 'voucherNo', 'date', 'type', 'field', 'message'].every(
          (field) => typeof issue[field] === 'string',
        ),
    );

    return {
      ...report,
      issues,
      malformedIssueCount: report.issues.length - issues.length,
    };
  }

  function validateBackupIntegrityReport(report) {
    if (
      !isDiagnosticRecord(report) ||
      typeof report.generatedAt !== 'string' ||
      !report.generatedAt.trim() ||
      !isDiagnosticCount(report.inspected) ||
      !isDiagnosticCount(report.limit) ||
      report.limit > 10 ||
      !isDiagnosticCount(report.passCount) ||
      !isDiagnosticCount(report.warningCount) ||
      !isDiagnosticCount(report.failCount) ||
      !Array.isArray(report.snapshots) ||
      typeof report.note !== 'string' ||
      report.inspected !== report.snapshots.length
    ) {
      throw new Error('Invalid backup-integrity report response.');
    }

    const validSnapshot = (snapshot) =>
      isDiagnosticRecord(snapshot) &&
      typeof snapshot.name === 'string' &&
      typeof snapshot.createdAt === 'string' &&
      ['pass', 'warning', 'fail'].includes(snapshot.state) &&
      isDiagnosticRecord(snapshot.rowCounts) &&
      Object.values(snapshot.rowCounts).every(isDiagnosticCount) &&
      isDiagnosticCount(snapshot.receiptCount) &&
      isDiagnosticCount(snapshot.manifestCount) &&
      Array.isArray(snapshot.checks) &&
      snapshot.checks.every(
        (check) =>
          isDiagnosticRecord(check) &&
          typeof check.code === 'string' &&
          ['pass', 'warning', 'fail'].includes(check.state) &&
          typeof check.detail === 'string',
      );

    if (!report.snapshots.every(validSnapshot)) {
      throw new Error('Invalid backup-integrity snapshot response.');
    }

    const counts = report.snapshots.reduce(
      (summary, snapshot) => {
        summary[snapshot.state]++;
        return summary;
      },
      { pass: 0, warning: 0, fail: 0 },
    );

    if (
      report.passCount !== counts.pass ||
      report.warningCount !== counts.warning ||
      report.failCount !== counts.fail ||
      report.passCount + report.warningCount + report.failCount !== report.inspected
    ) {
      throw new Error('Inconsistent backup-integrity summary.');
    }

    return report;
  }

  async function dataQualityScan() {
    const results = $('#dq-results');
    const button = $('[data-act="dqscan"]');
    if (!results) return;
    lastDataQualityReport = null;

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
    results.setAttribute('role', 'status');
    results.textContent = 'Scanning voucher records…';

    try {
      const report = validateDataQualityReport(await api('dataQualityReport'));
      results.setAttribute('role', 'status');
      results.replaceChildren();

      const summary = document.createElement('p');
      summary.textContent = `Scanned ${report.scanned} vouchers · ${report.errors} errors · ${report.warnings} warnings · generated ${formatBackupTimestamp(report.generatedAt)}.`;
      results.appendChild(summary);

      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent =
        'This scan checks record completeness and structural consistency. It does not determine tax compliance, cash impact, or accounting correctness.';
      results.appendChild(note);

      if (report.malformedIssueCount) {
        const malformed = document.createElement('p');
        malformed.className = 'muted';
        malformed.textContent =
          report.malformedIssueCount +
          ' malformed data-quality issue(s) omitted from this response.';
        results.appendChild(malformed);
      }

      if (!report.issues.length && report.issueCount === 0) {
        const empty = document.createElement('p');
        empty.className = 'badge';
        empty.textContent = 'No structural exceptions found.';
        results.appendChild(empty);
      } else if (!report.issues.length) {
        const unavailable = document.createElement('p');
        unavailable.className = 'error';
        unavailable.textContent =
          'Exception details could not be displayed. Refresh the scan to retrieve valid rows.';
        results.appendChild(unavailable);
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrap';
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const header = document.createElement('tr');

        ['Severity', 'Voucher', 'Date', 'Type', 'Field', 'Finding'].forEach((label) => {
          const cell = document.createElement('th');
          cell.textContent = label;
          header.appendChild(cell);
        });

        thead.appendChild(header);
        const body = document.createElement('tbody');

        report.issues.forEach((issue) => {
          const row = document.createElement('tr');
          const values = [
            issue.severity.toUpperCase(),
            issue.voucherNo
              ? `#${issue.voucherNo}`
              : issue.voucherId || `Sheet row ${issue.sourceRow}`,
            issue.date || '—',
            issue.type || '—',
            issue.field,
            issue.message,
          ];

          values.forEach((value) => {
            const cell = document.createElement('td');
            cell.textContent = String(value ?? '');
            row.appendChild(cell);
          });
          body.appendChild(row);
        });

        table.append(thead, body);
        wrapper.appendChild(table);
        results.appendChild(wrapper);
      }

      if (report.truncated) {
        const limited = document.createElement('p');
        limited.className = 'muted';
        limited.textContent =
          'Showing the first 500 exceptions. The summary counts include all detected exceptions.';
        results.appendChild(limited);
      }
      lastDataQualityReport = report;
      appendDiagnosticExportButton(
        results,
        'dqexport',
        'Export data-quality report (JSON)',
        'The export can include voucher references, dates and diagnostic text. Share it only with authorized recipients.',
      );
    } catch (error) {
      results.setAttribute('role', 'alert');
      results.textContent =
        'The data-quality scan returned an invalid response or failed. Check the connection and retry.';
      fail(error);
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    }
  }

  function auditView() {
    auditFilters.query = '';
    auditFilters.user = '';
    auditFilters.action = '';
    auditFilters.from = '';
    auditFilters.to = '';
    auditRows = [];
    malformedAuditCount = 0;
    auditResponseInvalid = false;
    auditRequestFailed = false;
    auditNextBeforeRow = null;
    auditTotalCount = 0;
    auditHealth = null;
    auditLoadingOlder = false;

    $('#view').innerHTML =
      head('Audit log', '', {
        section: 'Manage',
        description: 'Review administrative events and export the loaded records.',
      }) +
      `<section class="card" aria-describedby="audit-scope">
        <p id="audit-scope" class="muted">Audit events load newest-first in pages of 200. Load older adds earlier events; filters and CSV export apply to loaded pages only. The log is not a tamper-evident ledger, and retention is not guaranteed by this view.</p>
        <div id="aud-health" aria-live="polite"><p class="muted">Loading audit-write health…</p></div>
        <div class="filters audit-filters">
          <label>Search<input id="aud-q" type="search" aria-label="Search audit events" placeholder="Search details, target or user"></label>
          <label>User<select id="aud-user" aria-label="Filter audit events by user"><option value="">All users</option></select></label>
          <label>Action<select id="aud-action" aria-label="Filter audit events by action"><option value="">All actions</option></select></label>
          <label>From<input id="aud-from" type="date" aria-label="Audit start date"></label>
          <label>To<input id="aud-to" type="date" aria-label="Audit end date"></label>
          <button class="btn" type="button" data-act="audclear">Clear filters</button>
          <button class="btn" type="button" data-act="audhealth">Export health snapshot (JSON)</button>
          <button class="btn primary" type="button" data-act="audcsv">Export filtered CSV</button>
        </div>
        <p id="aud-count" class="muted" role="status" aria-live="polite">Loading audit events…</p>
        <button id="aud-more" class="btn hidden" type="button" data-act="audmore">Load older events</button>
        <div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody id="aud"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody></table></div>
      </section>`;

    api('auditLog')
      .then((page) => {
        if (!setAuditPage(page, false)) {
          auditResponseInvalid = true;
          auditRows = [];
          malformedAuditCount = 0;
          auditNextBeforeRow = null;
          auditTotalCount = 0;
          populateAuditOptions();
          renderAuditRows();
        }
      })
      .catch((error) => {
        auditRequestFailed = true;
        renderAuditHealth();
        const body = $('#aud');
        if (!body) return;
        body.replaceChildren();
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.className = 'error';
        const message = document.createElement('p');
        message.textContent = 'Audit events could not be loaded. Check your connection and retry.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn sm';
        retry.dataset.act = 'audretry';
        retry.textContent = 'Retry loading audit events';
        cell.append(message, retry);
        row.appendChild(cell);
        body.appendChild(row);
        $('#aud-count').textContent = 'Audit events unavailable.';
        console.warn('Audit events could not be loaded:', error);
      });
  }

  function setAuditPage(page, append) {
    const validPage =
      page !== null &&
      typeof page === 'object' &&
      !Array.isArray(page) &&
      Array.isArray(page.rows) &&
      Number.isSafeInteger(page.totalCount) &&
      page.totalCount >= 0 &&
      (page.nextBeforeRow === null ||
        (Number.isSafeInteger(page.nextBeforeRow) && page.nextBeforeRow >= 2));
    const health = page && typeof page === 'object' ? page.auditHealth : undefined;
    const validHealth =
      health === undefined ||
      (health !== null &&
        typeof health === 'object' &&
        !Array.isArray(health) &&
        ['NO_KNOWN_FAILURE', 'DEGRADED'].includes(health.status) &&
        Number.isSafeInteger(health.failureCount) &&
        health.failureCount >= 0 &&
        typeof health.lastFailureAt === 'string' &&
        typeof health.lastFailureKind === 'string');
    if (!validPage || !validHealth) return false;
    if (health !== undefined) auditHealth = health;
    else if (!append) auditHealth = null;
    auditRequestFailed = false;

    const isValidAuditRow = (row) =>
      row !== null &&
      typeof row === 'object' &&
      !Array.isArray(row) &&
      ['time', 'user', 'action', 'target', 'details'].every(
        (field) => typeof row[field] === 'string',
      );
    const validRows = page.rows.filter(isValidAuditRow);
    const invalidRows = page.rows.length - validRows.length;
    auditRows = append ? auditRows.concat(validRows) : validRows;
    malformedAuditCount = append ? malformedAuditCount + invalidRows : invalidRows;
    auditResponseInvalid = false;
    auditNextBeforeRow = page.nextBeforeRow;
    auditTotalCount = page.totalCount;
    populateAuditOptions();
    renderAuditRows();
    const more = $('#aud-more');
    if (more) {
      more.hidden = !auditNextBeforeRow;
      more.classList.toggle('hidden', !auditNextBeforeRow);
      more.disabled = false;
      more.textContent = 'Load older events';
    }
    return true;
  }

  async function loadOlderAuditEvents() {
    if (!auditNextBeforeRow || auditLoadingOlder) return;
    auditLoadingOlder = true;
    const button = $('#aud-more');
    if (button) {
      button.disabled = true;
      button.textContent = 'Loading older events…';
    }
    try {
      const page = await api('auditLog', { beforeRow: auditNextBeforeRow });
      if (!setAuditPage(page, true)) {
        toast(
          'Older audit events returned an invalid response. Loaded events were kept; retry later.',
          'err',
        );
      }
    } catch (error) {
      fail(error);
    } finally {
      auditLoadingOlder = false;
      const currentButton = $('#aud-more');
      if (currentButton) {
        currentButton.disabled = false;
        currentButton.textContent = 'Load older events';
        currentButton.hidden = !auditNextBeforeRow;
        currentButton.classList.toggle('hidden', !auditNextBeforeRow);
      }
    }
  }

  function populateAuditOptions() {
    const usersList = [
      ...new Set(auditRows.map((row) => String(row.user || '')).filter(Boolean)),
    ].sort();
    const actionsList = [
      ...new Set(auditRows.map((row) => String(row.action || '')).filter(Boolean)),
    ].sort();
    const userSelect = $('#aud-user');
    const actionSelect = $('#aud-action');
    if (!userSelect || !actionSelect) return;

    userSelect.replaceChildren(new Option('All users', ''));
    usersList.forEach((user) => userSelect.add(new Option(user, user)));
    userSelect.value = auditFilters.user;
    actionSelect.replaceChildren(new Option('All actions', ''));
    actionsList.forEach((action) => actionSelect.add(new Option(action, action)));
    actionSelect.value = auditFilters.action;
  }

  function filteredAuditRows() {
    const query = auditFilters.query.trim().toLowerCase();
    return auditRows.filter((row) => {
      const time = String(row.time || '');
      const day = time.slice(0, 10);
      const searchable = [row.user, row.action, row.target, row.details, time]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ');
      return (
        (!query || searchable.includes(query)) &&
        (!auditFilters.user || String(row.user || '') === auditFilters.user) &&
        (!auditFilters.action || String(row.action || '') === auditFilters.action) &&
        (!auditFilters.from || day >= auditFilters.from) &&
        (!auditFilters.to || day <= auditFilters.to)
      );
    });
  }

  function auditDetailsText(row) {
    const details = String(row.details ?? '');
    try {
      const parsed = JSON.parse(details);
      if (parsed.version !== 1 || !Array.isArray(parsed.changes)) return details;

      const labels = {
        date: 'Date',
        vendor: 'Vendor',
        amount: 'Amount',
        category: 'Category',
        notes: 'Notes',
        name: 'Name',
        company: 'Company',
        mobile: 'Mobile',
        email: 'Email',
        role: 'Role',
        active: 'Active',
        mustChangePin: 'PIN change required',
        propertyName: 'Property name',
        propertyAddress: 'Property address',
        categories: 'Payment categories',
        receiptCategories: 'Receipt categories',
        nextVoucherNo: 'Next voucher number',
        nextReceiptNo: 'Next receipt number',
        openingBalance: 'Configured opening balance',
        type: 'Voucher type',
        status: 'Status',
        cancelReason: 'Cancellation reason',
        cashImpact: 'Cash impact',
        receiptCount: 'Receipt count',
        businessDate: 'Business date',
        openingCash: 'Opening cash',
        openingSource: 'Opening source',
        cashInTotal: 'Cash in total',
        cashOutTotal: 'Cash out total',
        expectedCash: 'Expected cash',
        countedCash: 'Counted cash',
        variance: 'Variance',
        includedVoucherCount: 'Included voucher count',
        correctionType: 'Correction type',
        details: 'Details',
        voucherId: 'Voucher ID',
        createdCount: 'Created count',
        skippedCount: 'Skipped count',
        firstVoucherNo: 'First voucher number',
        lastVoucherNo: 'Last voucher number',
      };
      const valueText = (value) =>
        typeof value === 'string'
          ? JSON.stringify(value)
          : value === null || value === undefined
            ? '—'
            : JSON.stringify(value);
      const changes = parsed.changes
        .filter(
          (change) => change && typeof change === 'object' && typeof change.field === 'string',
        )
        .map((change) => {
          const label = Object.prototype.hasOwnProperty.call(labels, change.field)
            ? labels[change.field]
            : change.field;
          return label + ': ' + valueText(change.before) + ' → ' + valueText(change.after);
        })
        .join('; ');
      const context = [];
      if (parsed.eventType) context.push('Event: ' + String(parsed.eventType));
      if (parsed.entityType || parsed.entityId) {
        context.push(
          'Record: ' +
            [parsed.entityType, parsed.entityId]
              .filter((value) => typeof value === 'string' && value)
              .join(' '),
        );
      }
      if (parsed.eventId) context.push('Event ID: ' + String(parsed.eventId));
      if (typeof parsed.reason === 'string' && parsed.reason.trim()) {
        context.push('Reason: ' + parsed.reason);
      }
      if (typeof parsed.summary === 'string' && parsed.summary) {
        context.push('Summary: ' + parsed.summary);
      }
      if (changes) context.push('Changes: ' + changes);
      return context.length ? context.join(' | ') : details;
    } catch {
      // Legacy free-text audit rows remain readable and are rendered as inert text.
      return details;
    }
  }

  function renderAuditHealth() {
    const panel = $('#aud-health');
    if (!panel) return;
    panel.replaceChildren();
    const message = document.createElement('p');

    if (auditRequestFailed || auditResponseInvalid) {
      panel.className = 'audit-health degraded';
      message.className = 'error form-error';
      message.setAttribute('role', 'alert');
      message.setAttribute('aria-live', 'assertive');
      message.textContent = auditResponseInvalid
        ? 'Audit monitoring could not be verified because the server response was invalid. Retry the audit read before relying on this status.'
        : 'Audit monitoring could not be checked because the audit request failed. Retry the audit read before relying on this status.';
      panel.appendChild(message);
      return;
    }

    if (!auditHealth) {
      panel.className = 'audit-health degraded';
      message.className = 'error form-error';
      message.setAttribute('role', 'alert');
      message.setAttribute('aria-live', 'assertive');
      message.textContent =
        'Audit-write monitoring is unavailable from this backend. The health snapshot will record monitoring as unavailable; historical audit completeness is not verified.';
      panel.appendChild(message);
      return;
    }

    if (auditHealth.status === 'DEGRADED') {
      panel.className = 'audit-health degraded';
      message.className = 'error form-error';
      message.setAttribute('role', 'alert');
      message.setAttribute('aria-live', 'assertive');
      const when = auditHealth.lastFailureAt || 'time unavailable';
      const kind = auditHealth.lastFailureKind
        ? ' (' + auditHealth.lastFailureKind.toLowerCase().replace(/_/g, ' ') + ')'
        : '';
      message.textContent =
        'Audit logging is degraded: ' +
        auditHealth.failureCount +
        ' write failure(s) recorded. Last failure: ' +
        when +
        kind +
        '. One or more actions may be missing from the log. Reconcile the affected records before relying on audit history; this warning does not repair missing events.';
    } else {
      panel.className = 'audit-health';
      message.className = 'muted';
      message.textContent =
        'No durable audit-write failure marker is recorded by the current monitor. This does not prove every action was logged: a simultaneous AuditLog append and failure-marker storage outage may be undetectable. Historical audit completeness is not verified.';
    }
    panel.appendChild(message);
  }

  function renderAuditRows() {
    const body = $('#aud');
    const count = $('#aud-count');
    renderAuditHealth();
    if (!body || !count) return;
    const rows = filteredAuditRows();
    body.replaceChildren();

    if (auditResponseInvalid) {
      const tr = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'error';
      cell.textContent =
        'Audit data is unavailable because the server response was invalid. Refresh and try again.';
      tr.appendChild(cell);
      body.appendChild(tr);
      count.textContent = 'Audit events unavailable: invalid server response. Refresh and retry.';
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      [
        { value: String(row.time ?? '').replace('T', ' '), className: 'nw' },
        { value: row.user },
        { value: row.action, className: 'nw' },
        { value: row.target },
        { value: auditDetailsText(row) },
      ].forEach(({ value, className }) => {
        const cell = document.createElement('td');
        if (className) cell.className = className;
        cell.textContent = String(value ?? '');
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });

    if (!rows.length) {
      const tr = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.className = 'muted';
      cell.textContent = auditRows.length
        ? 'No audit events match these filters.'
        : 'No audit events are available in the loaded pages.';
      tr.appendChild(cell);
      body.appendChild(tr);
    }
    count.textContent =
      `Showing ${rows.length} of ${auditRows.length} loaded events; ` +
      `${auditTotalCount} total recorded.` +
      (malformedAuditCount
        ? ` ${malformedAuditCount} malformed audit event(s) omitted from loaded pages.`
        : '');
  }

  function clearAuditFilters() {
    Object.assign(auditFilters, { query: '', user: '', action: '', from: '', to: '' });
    ['aud-q', 'aud-user', 'aud-action', 'aud-from', 'aud-to'].forEach((id) => {
      const field = $('#' + id);
      if (field) field.value = '';
    });
    renderAuditRows();
  }

  function exportAuditHealthSnapshot() {
    const monitoringStatus = auditRequestFailed
      ? 'UNAVAILABLE'
      : auditResponseInvalid
        ? 'INVALID_RESPONSE'
        : auditHealth
          ? auditHealth.status
          : 'UNAVAILABLE';
    const monitoringKnown = ['NO_KNOWN_FAILURE', 'DEGRADED'].includes(monitoringStatus);
    const auditPageUnavailable = auditRequestFailed || auditResponseInvalid;
    const snapshot = {
      schemaVersion: 1,
      snapshotType: 'cash-voucher-audit-health',
      capturedAt: new Date().toISOString(),
      monitoring: {
        status: monitoringStatus,
        failureCount: monitoringKnown ? auditHealth.failureCount : null,
        lastFailureAt: monitoringKnown ? auditHealth.lastFailureAt || null : null,
        lastFailureKind: monitoringKnown ? auditHealth.lastFailureKind || null : null,
      },
      coverage: {
        loadedRowCount: auditRows.length,
        serverReportedTotalCount: auditPageUnavailable ? null : auditTotalCount,
        malformedRowsOmitted: malformedAuditCount,
        requestFailed: auditRequestFailed,
        responseInvalid: auditResponseInvalid,
      },
      limitations: [
        'This snapshot contains monitoring metadata only; it does not contain or reconstruct missing audit events.',
        'NO_KNOWN_FAILURE means no failure marker was read; it does not prove audit history is complete.',
        'A simultaneous AuditLog append and Script Properties marker write failure may be undetectable without an independent durable fallback.',
        'Historical audit completeness is not verified.',
      ],
    };

    download(
      'cash-voucher-audit-health-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify(snapshot, null, 2),
      'application/json;charset=utf-8',
    );
    toast(
      'Exported audit health metadata only; the snapshot does not reconstruct missing events.',
      'ok',
    );
  }

  function exportAuditCsv() {
    const rows = filteredAuditRows();
    if (!rows.length) {
      toast(
        auditResponseInvalid
          ? 'Audit events are unavailable because the server response was invalid. Refresh and retry.'
          : 'No audit events match the current filters.',
        'err',
      );
      return;
    }
    const header = ['Time', 'User', 'Action', 'Target', 'Details'];
    const csv = [
      header,
      ...rows.map((row) => [row.time, row.user, row.action, row.target, auditDetailsText(row)]),
    ]
      .map((record) => record.map(csvCell).join(','))
      .join('\r\n');
    download(
      `cash-voucher-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8',
    );
    toast(`Exported ${rows.length} audit events from the loaded pages.`, 'ok');
  }

  function handleAuditFilters(event) {
    const field = event.target;
    const values = {
      'aud-q': 'query',
      'aud-user': 'user',
      'aud-action': 'action',
      'aud-from': 'from',
      'aud-to': 'to',
    };
    const key = values[field.id];
    if (!key) return;
    auditFilters[key] = field.value;
    renderAuditRows();
  }

  async function renderBackupStatus() {
    const card = $('#backup-status');
    if (!card || backupStatusLoading) return;

    backupStatusLoading = true;
    card.setAttribute('aria-busy', 'true');
    const retryButton = card.querySelector('[data-act="backup-retry"]');
    if (retryButton) {
      retryButton.disabled = true;
      retryButton.setAttribute('aria-busy', 'true');
      retryButton.textContent = 'Checking backup status…';
    }

    try {
      const status = await api('backupStatus');
      const labels = {
        not_configured: 'Not configured',
        never_run: 'No completed backup recorded',
        incomplete: 'Latest attempt may not have completed',
        failed: 'Latest backup attempt failed',
        success: 'Last recorded backup succeeded',
      };
      const title = document.createElement('h2');
      title.textContent = '🛡️ Backup & recovery';

      const state = document.createElement('p');
      state.className = 'badge';
      state.setAttribute('role', status.state === 'failed' ? 'alert' : 'status');
      state.setAttribute('aria-live', status.state === 'failed' ? 'assertive' : 'polite');
      if (status.state === 'failed') state.classList.add('bad');
      else if (status.state !== 'success') state.classList.add('warn');
      state.textContent = labels[status.state] || 'Status unavailable';

      const details = document.createElement('div');
      details.className = 'backup-status-details';
      const rows = [
        [
          'Configuration',
          status.configured
            ? 'Required Script Properties are present'
            : 'Required Script Properties are missing',
        ],
        ['Retention', `${status.retentionDays} days`],
        ['Last attempt', formatBackupTimestamp(status.lastAttempt)],
        ['Last success', formatBackupTimestamp(status.lastSuccess)],
        ['Last successful runtime', formatBackupDuration(status.lastSuccessDurationMs)],
        [
          'Receipt copies in last successful backup',
          status.lastSuccessReceiptCount === null || status.lastSuccessReceiptCount === undefined
            ? 'Not recorded'
            : String(status.lastSuccessReceiptCount),
        ],
        [
          'Receipt payload in last successful backup',
          status.lastSuccessReceiptBytesKnown
            ? formatBackupBytes(status.lastSuccessReceiptBytes)
            : status.lastSuccessReceiptCount === null ||
                status.lastSuccessReceiptCount === undefined
              ? 'Not recorded'
              : 'Size not measurable',
        ],
      ];

      if (status.lastError) rows.push(['Latest error', status.lastError]);
      if (status.lastAlertError) {
        rows.push(['Owner notification issue', status.lastAlertError]);
      }

      rows.forEach(([label, value]) => {
        const line = document.createElement('p');
        const name = document.createElement('strong');
        name.textContent = `${label}: `;
        const text = document.createElement('span');
        text.textContent = String(value);
        line.append(name, text);
        details.appendChild(line);
      });

      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent =
        'This is recorded Apps Script status only. It does not verify the current Drive backup contents or prove that a restore will succeed.';

      const integrityButton = document.createElement('button');
      integrityButton.type = 'button';
      integrityButton.className = 'btn';
      integrityButton.dataset.act = 'bkintegrity';
      integrityButton.textContent = 'Inspect recent snapshots';
      const integrityResults = document.createElement('div');
      integrityResults.id = 'backup-integrity-results';
      integrityResults.setAttribute('role', 'status');
      integrityResults.setAttribute('aria-live', 'polite');
      integrityResults.className = 'backup-integrity-results';
      integrityResults.textContent =
        'Structural inspection checks snapshot files, sheet headers and receipt manifests; it does not prove restoreability.';

      card.replaceChildren(title, state, details, note, integrityButton, integrityResults);
    } catch (error) {
      console.warn('Backup status could not be loaded:', error);
      const title = document.createElement('h2');
      title.textContent = '🛡️ Backup & recovery';
      const message = document.createElement('p');
      message.className = 'error';
      message.setAttribute('role', 'alert');
      message.setAttribute('aria-live', 'assertive');
      message.textContent =
        'Backup status could not be loaded. Check the connection and retry this status check.';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn';
      retry.dataset.act = 'backup-retry';
      retry.textContent = 'Retry backup status';
      card.replaceChildren(title, message, retry);
    } finally {
      backupStatusLoading = false;
      if (card.isConnected) card.setAttribute('aria-busy', 'false');
    }
  }

  async function backupIntegrityScan() {
    const results = $('#backup-integrity-results');
    const button = $('[data-act="bkintegrity"]');
    if (!results) return;
    lastBackupIntegrityReport = null;
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
    results.setAttribute('role', 'status');
    results.textContent = 'Inspecting the 10 most recent backup snapshots…';

    try {
      const report = validateBackupIntegrityReport(await api('backupIntegrityReport'));
      results.setAttribute('role', 'status');
      results.replaceChildren();

      const summary = document.createElement('p');
      summary.textContent =
        'Inspected ' +
        report.inspected +
        ' snapshot(s) · ' +
        report.passCount +
        ' pass · ' +
        report.warningCount +
        ' warning · ' +
        report.failCount +
        ' failed · generated ' +
        formatBackupTimestamp(report.generatedAt) +
        '.';
      results.appendChild(summary);

      if (!report.snapshots.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No backup snapshots matching the managed naming pattern were found.';
        results.appendChild(empty);
      }

      report.snapshots.forEach((snapshot) => {
        const article = document.createElement('article');
        article.className = 'backup-integrity-item';

        const title = document.createElement('h3');
        title.textContent = snapshot.name + ' · ' + snapshot.state.toUpperCase();
        article.appendChild(title);

        const details = document.createElement('p');
        details.className = 'muted';
        details.textContent =
          formatBackupTimestamp(snapshot.createdAt) +
          ' · ' +
          Object.entries(snapshot.rowCounts || {})
            .map(([name, count]) => name + ': ' + count + ' rows')
            .join(' · ') +
          ' · receipts: ' +
          snapshot.receiptCount +
          ' · manifest records: ' +
          snapshot.manifestCount;
        article.appendChild(details);

        const list = document.createElement('ul');
        snapshot.checks.forEach((check) => {
          const item = document.createElement('li');
          const marker = check.state === 'pass' ? '✓ ' : check.state === 'warning' ? '⚠ ' : '✗ ';
          item.textContent = marker + check.detail;
          list.appendChild(item);
        });
        article.appendChild(list);
        results.appendChild(article);
      });

      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = report.note;
      results.appendChild(note);
      lastBackupIntegrityReport = report;
      appendDiagnosticExportButton(
        results,
        'bkexport',
        'Export backup-integrity report (JSON)',
        'This export contains snapshot names, row counts and structural findings—not the copied spreadsheet or receipt files. A clean scan does not prove restoreability.',
      );
    } catch {
      results.setAttribute('role', 'alert');
      results.textContent =
        'Backup integrity inspection returned an invalid response or failed. Check Drive permissions and retry.';
    } finally {
      if (button?.isConnected) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    }
  }

  function formatBackupTimestamp(value) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? String(value)
      : date.toLocaleString('en-IN', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
  }

  function formatBackupDuration(value) {
    if (value === null || value === undefined || value === '') return 'Not recorded';
    const milliseconds = Number(value);
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Not recorded';
    return milliseconds >= 1000
      ? (milliseconds / 1000).toFixed(2) + ' s'
      : Math.round(milliseconds) + ' ms';
  }

  function formatBackupBytes(value) {
    if (value === null || value === undefined || value === '') return 'Not recorded';
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return 'Not recorded';
    if (bytes < 1024) return Math.round(bytes) + ' B';

    const units = ['KiB', 'MiB', 'GiB', 'TiB'];
    let scaled = bytes;
    let unit = units[0];
    for (let index = 0; index < units.length && scaled >= 1024; index++) {
      scaled /= 1024;
      unit = units[index];
    }
    return scaled.toFixed(2) + ' ' + unit;
  }

  function appendDiagnosticExportButton(container, action, label, notice) {
    const actions = document.createElement('div');
    actions.className = 'diagnostic-actions';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.dataset.act = action;
    button.textContent = label;
    actions.appendChild(button);

    const privacyNote = document.createElement('p');
    privacyNote.className = 'muted';
    privacyNote.textContent = notice;
    actions.appendChild(privacyNote);

    container.appendChild(actions);
  }

  function downloadDiagnosticJson(
    filenamePrefix,
    snapshotType,
    report,
    limitations,
    successMessage,
  ) {
    const capturedAt = new Date().toISOString();
    const snapshot = { schemaVersion: 1, snapshotType, capturedAt, report, limitations };
    download(
      filenamePrefix + '-' + capturedAt.slice(0, 10) + '.json',
      JSON.stringify(snapshot, null, 2),
      'application/json;charset=utf-8',
    );
    toast(successMessage, 'ok');
  }

  function exportDataQualityReport() {
    if (!lastDataQualityReport) {
      toast('Run a successful data-quality scan before exporting.', 'err');
      return;
    }

    const report = lastDataQualityReport;
    downloadDiagnosticJson(
      'cash-voucher-data-quality',
      'cash-voucher-data-quality',
      {
        generatedAt: report.generatedAt,
        scanned: report.scanned,
        issueCount: report.issueCount,
        errors: report.errors,
        warnings: report.warnings,
        truncated: report.truncated,
        returnedIssueCount: report.issues.length,
        malformedIssueCount: report.malformedIssueCount,
        issues: report.issues.map((issue) => ({
          severity: issue.severity,
          code: issue.code,
          sourceRow: issue.sourceRow,
          voucherId: issue.voucherId,
          voucherNo: issue.voucherNo,
          date: issue.date,
          type: issue.type,
          field: issue.field,
          message: issue.message,
        })),
      },
      [
        'This is a structural record-quality scan, not accounting, tax, cash-impact or financial correctness certification.',
        'Issue details include at most the first 500 valid issue rows; summary counts cover all detected issues.',
        'Malformed issue rows are omitted from detail and counted in malformedIssueCount.',
        'The report may contain voucher references, dates and diagnostic text. Share only with authorized recipients.',
      ],
      'Exported the data-quality diagnostic report. Review its scope and handle it as business data.',
    );
  }

  function exportBackupIntegrityReport() {
    if (!lastBackupIntegrityReport) {
      toast('Run a successful backup-integrity inspection before exporting.', 'err');
      return;
    }

    const report = lastBackupIntegrityReport;
    const knownSheets = [
      'Users',
      'Vouchers',
      'Vendors',
      'Settings',
      'AuditLog',
      'CashCloses',
      'CashCloseCorrections',
    ];
    downloadDiagnosticJson(
      'cash-voucher-backup-integrity',
      'cash-voucher-backup-integrity',
      {
        generatedAt: report.generatedAt,
        inspected: report.inspected,
        limit: report.limit,
        passCount: report.passCount,
        warningCount: report.warningCount,
        failCount: report.failCount,
        snapshots: report.snapshots.map((snapshot) => ({
          name: snapshot.name,
          createdAt: snapshot.createdAt,
          state: snapshot.state,
          rowCounts: Object.fromEntries(
            Object.entries(snapshot.rowCounts).filter(
              ([name, count]) => knownSheets.includes(name) && isDiagnosticCount(count),
            ),
          ),
          receiptCount: snapshot.receiptCount,
          manifestCount: snapshot.manifestCount,
          checks: snapshot.checks.map((check) => ({
            code: check.code,
            state: check.state,
            detail: check.detail,
          })),
        })),
      },
      [
        'The report inspects at most the ten most recent managed backup snapshots.',
        'Structural checks do not prove a successful restore; restore only into a separate recovery destination and validate it.',
        'The report contains snapshot names, table row counts and structural findings, but not copied spreadsheet rows or receipt payloads.',
        'Share diagnostic reports only with authorized recipients.',
      ],
      'Exported the backup-integrity diagnostic report. A clean scan is not proof of restoreability.',
    );
  }

  async function saveSettings() {
    try {
      await api('saveSettings', {
        propertyName: $('#sn').value,
        propertyAddress: $('#sa').value,
        categories: $('#sc').value.split('\n'),
        nextVoucherNo: $('#sq').value,
        nextReceiptNo: $('#sr').value,
        openingBalance: $('#so').value,
        receiptCategories: $('#sx').value.split('\n'),
      });
      await getNavigation().load();
      $('#brand').textContent = scalarText(S.settings?.propertyName) || 'Cash Vouchers';
      toast('Settings saved.', 'ok');
      settings();
    } catch (error) {
      fail(error);
    }
  }

  function account() {
    (() => {
      const view = $('#view');
      const fragment = document.createDocumentFragment();
      const header = document.createElement('div');
      header.className = 'head page-header';
      const headerCopy = document.createElement('div');
      headerCopy.className = 'page-header-copy';
      const heading = document.createElement('h1');
      heading.textContent = 'My Account';
      headerCopy.appendChild(heading);
      const headerActions = document.createElement('div');
      headerActions.className = 'page-header-actions';
      header.append(headerCopy, headerActions);
      fragment.appendChild(header);

      const name = scalarText(S.me?.name);
      const email = scalarText(S.me?.email);
      const role = scalarText(S.me?.role);
      const propertyName = scalarText(S.settings?.propertyName);
      const profile = document.createElement('div');
      profile.className = 'card profile';
      const avatar = document.createElement('span');
      avatar.className = 'avatar lg';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = initials(name || email);
      const profileMain = document.createElement('div');
      profileMain.className = 'profile-main';
      const profileName = document.createElement('h2');
      profileName.textContent = name;
      const profileEmail = document.createElement('p');
      profileEmail.textContent = email;
      const metadata = document.createElement('p');
      const roleBadge = document.createElement('span');
      roleBadge.className = 'badge';
      roleBadge.textContent = role;
      const property = document.createElement('span');
      property.className = 'muted';
      property.textContent = propertyName;
      metadata.append(roleBadge, document.createTextNode(' '), property);
      profileMain.append(profileName, profileEmail, metadata);
      const actions = document.createElement('div');
      actions.className = 'actions';
      const makeAction = (label, action, className) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.dataset.act = action;
        button.textContent = label;
        return button;
      };
      if (deferredInstall) actions.appendChild(makeAction('📲 Install app', 'install', 'btn'));
      actions.appendChild(makeAction('Sign out', 'signout', 'btn danger'));
      profile.append(avatar, profileMain, actions);
      fragment.appendChild(profile);

      const tip = document.createElement('p');
      tip.className = 'muted';
      tip.textContent =
        'Tip: on iPhone use Share → Add to Home Screen. On Android/Chrome use the menu → Install app.';
      fragment.appendChild(tip);

      const form = document.createElement('form');
      form.id = 'pf';
      form.className = 'card';
      form.autocomplete = 'off';
      const formHeading = document.createElement('h2');
      formHeading.textContent = 'Change PIN';
      const controls = document.createElement('div');
      controls.className = 'filters';
      const makePinInput = (id, label, autocomplete, placeholder) => {
        const input = document.createElement('input');
        input.id = id;
        input.type = 'password';
        input.inputMode = 'numeric';
        input.pattern = '[0-9]{6}';
        input.title = 'Enter exactly 6 digits';
        input.maxLength = 6;
        input.autocomplete = autocomplete;
        input.placeholder = placeholder;
        input.setAttribute('aria-label', label);
        input.required = true;
        return input;
      };
      controls.append(
        makePinInput('po', 'Current PIN', 'current-password', 'Current PIN'),
        makePinInput('pn', 'New PIN', 'new-password', 'New PIN'),
      );
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'btn primary';
      submit.textContent = 'Change PIN';
      controls.appendChild(submit);
      form.append(formHeading, controls);
      fragment.appendChild(form);
      view.replaceChildren(fragment);
    })();
  }

  async function changePin(event) {
    try {
      const data = await api('changePin', {
        oldPin: $('#po').value,
        newPin: $('#pn').value,
      });
      S.token = data.token;
      ls.set('cv.token', data.token);
      event.target.reset();
      toast('PIN changed.', 'ok');
    } catch (error) {
      fail(error);
    }
  }

  async function handleSubmit(event) {
    if (event.target.id === 'vf') {
      event.preventDefault();
      return saveVendor();
    }

    if (event.target.id === 'uf') {
      event.preventDefault();
      return saveUser();
    }

    if (event.target.id === 'sf') {
      event.preventDefault();
      return saveSettings();
    }

    if (event.target.id === 'pf') {
      event.preventDefault();
      return changePin(event);
    }
  }

  function bind() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstall = event;
    });

    $('#view').addEventListener('submit', handleSubmit);
    $('#view').addEventListener('input', handleAuditFilters);
    $('#view').addEventListener('change', handleAuditFilters);
  }

  return {
    bind,
    vendors,
    users: usersView,
    settings,
    audit: auditView,
    clearAuditFilters,
    exportAuditCsv,
    exportAuditHealthSnapshot,
    loadOlderAuditEvents,
    dataQualityScan,
    exportDataQualityReport,
    backupIntegrityScan,
    exportBackupIntegrityReport,
    retryBackupStatus: renderBackupStatus,
    account,
    handleSubmit,
    editVendor,
    toggleVendor,
    toggleUser,
    updateRole,
    resetPin,
    install: () => {
      if (deferredInstall) {
        deferredInstall.prompt();
        deferredInstall = null;
      }
    },
    signOut,
  };
}
