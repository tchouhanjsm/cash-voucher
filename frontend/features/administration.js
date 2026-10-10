import { $ } from '../core/dom.js';
import { categories, rcats, S } from '../core/state.js';
import { ls } from '../core/storage.js';
import { csvCell, download, esc } from '../core/utils.js';
import { closeModal, dialog, fail, head, toast } from '../core/ui.js';

export function createAdministration({ api, getNavigation, signOut }) {
  let deferredInstall;
  let users = [];
  let auditRows = [];
  const auditFilters = { query: '', user: '', action: '', from: '', to: '' };

  function vendors() {
    $('#view').innerHTML =
      head('Vendors') +
      `<form id="vf" class="card filters" autocomplete="off"><input type="hidden" id="vid"><input id="vn" aria-label="Vendor name" autocomplete="organization" placeholder="Vendor name" required><input id="vc" aria-label="Company name (optional)" placeholder="Company (optional)"><input id="vm" aria-label="Mobile number (optional)" type="tel" placeholder="Mobile (optional)" inputmode="tel"><button class="btn primary">Save vendor</button><button type="button" class="btn" data-act="vclr">Clear</button></form>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Company</th><th>Mobile</th><th>Status</th><th></th></tr></thead><tbody>${
    S.vendors
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (vendor) =>
          `<tr><td>${esc(vendor.name)}</td><td>${esc(vendor.company)}</td><td>${esc(vendor.mobile)}</td><td><span class="badge ${vendor.active ? '' : 'bad'}">${vendor.active ? 'ACTIVE' : 'INACTIVE'}</span></td><td class="r nw"><button class="btn sm" data-act="vedit" data-id="${esc(vendor.id)}">Edit</button> <button class="btn sm" data-act="vtog" data-id="${esc(vendor.id)}">${vendor.active ? 'Deactivate' : 'Activate'}</button></td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="5" class="muted">No vendors yet — vendors you pay are also remembered automatically.</td></tr>'
  }</tbody></table></div></div>`;
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
    const vendor = S.vendors.find((item) => item.id === id);
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

  async function usersView() {
    $('#view').innerHTML = head('Users') + '<p class="muted">Loading…</p>';

    try {
      users = await api('listUsers');
    } catch (error) {
      return fail(error);
    }

    const roles = ['staff', 'manager', 'owner'];

    $('#view').innerHTML =
      head('Users') +
      `<div class="card"><h2>Add user</h2><form id="uf" class="filters" autocomplete="off"><input id="un" aria-label="User name" autocomplete="name" placeholder="Name" required><input id="ue" aria-label="Email address" autocomplete="email" type="email" placeholder="Email" required><select id="ur" aria-label="New user role">${roles.map((role) => `<option>${role}</option>`).join('')}</select><input id="up" aria-label="Temporary six-digit PIN" type="password" inputmode="numeric" pattern="[0-9]{6}" title="Enter exactly 6 digits" maxlength="6" autocomplete="new-password" placeholder="Temporary 6-digit PIN" required><button class="btn primary">Add</button></form>
    <p class="muted"><b>Staff</b>: add payments + receipts, see own entries · <b>Manager</b>: also view all, edit, cancel, bulk upload, vendors · <b>Owner</b>: also users, settings, audit log.</p></div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>${users
    .map(
      (user) =>
        `<tr><td>${esc(user.name)}</td><td>${esc(user.email)}</td><td><select aria-label="Role for ${esc(user.name)}" data-act="urole" data-id="${esc(user.id)}" style="min-height:34px;padding:4px">${roles.map((role) => `<option${role === user.role ? ' selected' : ''}>${role}</option>`).join('')}</select></td><td><span class="badge ${user.active ? '' : 'bad'}">${user.active ? 'ACTIVE' : 'DISABLED'}</span></td>
    <td class="r nw"><button class="btn sm" data-act="upin" data-id="${esc(user.id)}">Reset PIN</button> <button class="btn sm ${user.active ? 'danger' : ''}" data-act="utog" data-id="${esc(user.id)}">${user.active ? 'Disable' : 'Enable'}</button></td></tr>`,
    )
    .join('')}</tbody></table></div></div>`;
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
      head('Settings') +
      `<form id="sf" class="card" autocomplete="off"><h2>Property</h2><label>Name<input id="sn" value="${esc(S.settings.propertyName)}" required></label><label>Address (printed on vouchers)<textarea id="sa" rows="2">${esc(S.settings.propertyAddress)}</textarea></label>
    <label>Categories (one per line)<textarea id="sc" rows="8">${esc(categories().join('\n'))}</textarea></label><div class="grid g2"><label>Next payment voucher no.<input id="sq" type="number" min="1" value="${S.settings.nextVoucherNo}"></label><label>Next cash-received no. (R-)<input id="sr" type="number" min="1" value="${S.settings.nextReceiptNo}"></label><label>Opening cash balance ₹<input id="so" inputmode="decimal" value="${S.settings.openingBalance || 0}"></label></div><label>Cash-received categories (one per line)<textarea id="sx" rows="5">${esc(rcats().join('\n'))}</textarea></label><button class="btn primary">Save settings</button></form>
    <section class="card" id="backup-status" aria-live="polite"><h2>🛡️ Backup &amp; recovery</h2><p class="muted">Loading backup status…</p></section>
    <section class="card" id="data-quality"><h2>🔎 Voucher data quality</h2><p class="muted">Scan saved vouchers for missing required values, invalid amounts/dates/statuses, and duplicate identifiers. This is a record-quality check, not an accounting or tax certification.</p><button class="btn primary" type="button" data-act="dqscan">Run data-quality scan</button><div id="dq-results" role="status" aria-live="polite"><p class="muted">Run a scan to review exceptions.</p></div></section>
`;

    await renderBackupStatus();
  }

  async function dataQualityScan() {
    const results = $('#dq-results');
    const button = $('[data-act="dqscan"]');
    if (!results) return;

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
    results.textContent = 'Scanning voucher records…';

    try {
      const report = await api('dataQualityReport');
      results.replaceChildren();

      const summary = document.createElement('p');
      summary.textContent = `Scanned ${report.scanned} vouchers · ${report.errors} errors · ${report.warnings} warnings · generated ${formatBackupTimestamp(report.generatedAt)}.`;
      results.appendChild(summary);

      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent =
        'This scan checks record completeness and structural consistency. It does not determine tax compliance, cash impact, or accounting correctness.';
      results.appendChild(note);

      if (!report.issues.length) {
        const empty = document.createElement('p');
        empty.className = 'badge';
        empty.textContent = 'No structural exceptions found.';
        results.appendChild(empty);
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
    } catch (error) {
      results.textContent = 'The data-quality scan failed. Check the connection and retry.';
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

    $('#view').innerHTML =
      head('Audit log') +
      `<section class="card" aria-describedby="audit-scope">
        <p id="audit-scope" class="muted">Showing the latest 200 events returned by the server. Filters and CSV export apply only to these loaded events, not the full audit history.</p>
        <div class="filters audit-filters">
          <label>Search<input id="aud-q" type="search" aria-label="Search audit events" placeholder="Search details, target or user"></label>
          <label>User<select id="aud-user" aria-label="Filter audit events by user"><option value="">All users</option></select></label>
          <label>Action<select id="aud-action" aria-label="Filter audit events by action"><option value="">All actions</option></select></label>
          <label>From<input id="aud-from" type="date" aria-label="Audit start date"></label>
          <label>To<input id="aud-to" type="date" aria-label="Audit end date"></label>
          <button class="btn" type="button" data-act="audclear">Clear filters</button>
          <button class="btn primary" type="button" data-act="audcsv">Export filtered CSV</button>
        </div>
        <p id="aud-count" class="muted" role="status" aria-live="polite">Loading audit events…</p>
        <div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody id="aud"><tr><td colspan="5" class="muted">Loading…</td></tr></tbody></table></div>
      </section>`;

    api('auditLog')
      .then((rows) => {
        auditRows = Array.isArray(rows) ? rows : [];
        if (!$('#aud')) return;
        populateAuditOptions();
        renderAuditRows();
      })
      .catch((error) => {
        const body = $('#aud');
        if (!body) return;
        body.replaceChildren();
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.className = 'error';
        cell.textContent = 'Audit events could not be loaded. Check your connection and retry.';
        row.appendChild(cell);
        body.appendChild(row);
        $('#aud-count').textContent = 'Audit events unavailable.';
        fail(error);
      });
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

  function renderAuditRows() {
    const body = $('#aud');
    const count = $('#aud-count');
    if (!body || !count) return;
    const rows = filteredAuditRows();
    body.replaceChildren();

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      [
        { value: String(row.time ?? '').replace('T', ' '), className: 'nw' },
        { value: row.user },
        { value: row.action, className: 'nw' },
        { value: row.target },
        { value: row.details },
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
        : 'No audit events are available in the latest 200 records.';
      tr.appendChild(cell);
      body.appendChild(tr);
    }
    count.textContent = `Showing ${rows.length} of ${auditRows.length} loaded events.`;
  }

  function clearAuditFilters() {
    Object.assign(auditFilters, { query: '', user: '', action: '', from: '', to: '' });
    ['aud-q', 'aud-user', 'aud-action', 'aud-from', 'aud-to'].forEach((id) => {
      const field = $('#' + id);
      if (field) field.value = '';
    });
    renderAuditRows();
  }

  function exportAuditCsv() {
    const rows = filteredAuditRows();
    if (!rows.length) {
      toast('No audit events match the current filters.', 'err');
      return;
    }
    const header = ['Time', 'User', 'Action', 'Target', 'Details'];
    const csv = [
      header,
      ...rows.map((row) => [row.time, row.user, row.action, row.target, row.details]),
    ]
      .map((record) => record.map(csvCell).join(','))
      .join('\r\n');
    download(
      `cash-voucher-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
      'text/csv;charset=utf-8',
    );
    toast(`Exported ${rows.length} audit events from the loaded latest-200 window.`, 'ok');
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
    if (!card) return;

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
      ];

      if (status.lastError) rows.push(['Latest error', status.lastError]);

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
    } catch {
      const title = document.createElement('h2');
      title.textContent = '🛡️ Backup & recovery';
      const message = document.createElement('p');
      message.className = 'error';
      message.textContent =
        'Backup status could not be loaded. Check the connection and refresh Settings.';
      card.replaceChildren(title, message);
    }
  }

  async function backupIntegrityScan() {
    const results = $('#backup-integrity-results');
    const button = $('[data-act="bkintegrity"]');
    if (!results) return;
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
    results.textContent = 'Inspecting the 10 most recent backup snapshots…';

    try {
      const report = await api('backupIntegrityReport');
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
    } catch (error) {
      results.textContent =
        'Backup integrity inspection failed. Check Drive permissions and retry. ' +
        (error && error.message ? error.message : '');
    } finally {
      if (button) {
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
      $('#brand').textContent = S.settings.propertyName;
      toast('Settings saved.', 'ok');
      settings();
    } catch (error) {
      fail(error);
    }
  }

  function account() {
    $('#view').innerHTML =
      head('My Account') +
      `<div class="card"><h2>${esc(S.me.name)}</h2><p>${esc(S.me.email)} · <span class="badge">${esc(S.me.role)}</span></p><div class="actions">${deferredInstall ? '<button class="btn" data-act="install">📲 Install app</button>' : ''}<button class="btn danger" data-act="signout">Sign out</button></div>
    <p class="muted">Tip: on iPhone use Share → Add to Home Screen. On Android/Chrome use the menu → Install app.</p></div>
    <form id="pf" class="card" autocomplete="off"><h2>Change PIN</h2><div class="filters"><input id="po" aria-label="Current PIN" type="password" inputmode="numeric" pattern="[0-9]{6}" title="Enter exactly 6 digits" maxlength="6" autocomplete="current-password" placeholder="Current PIN" required><input id="pn" aria-label="New PIN" type="password" inputmode="numeric" pattern="[0-9]{6}" title="Enter exactly 6 digits" maxlength="6" autocomplete="new-password" placeholder="New PIN" required><button class="btn primary">Change PIN</button></div></form>`;
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
    dataQualityScan,
    backupIntegrityScan,
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
