import { $ } from '../core/dom.js';
import { categories, rcats, S } from '../core/state.js';
import { ls } from '../core/storage.js';
import { esc } from '../core/utils.js';
import { closeModal, dialog, fail, head, toast } from '../core/ui.js';

export function createAdministration({ api, getNavigation, signOut }) {
  let deferredInstall;
  let users = [];

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
    dialog(
      'Reset PIN',
      '<p class="muted">Set a temporary PIN. The user must change it at next sign-in.</p><input id="tp" aria-label="Temporary six-digit PIN" type="password" inputmode="numeric" pattern="[0-9]{6}" title="Enter exactly 6 digits" maxlength="6" autocomplete="new-password" placeholder="Temporary 6-digit PIN" required>',
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
    <div class="card"><h2>Audit log <span class="muted">(latest 200)</span></h2><div class="table-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead><tbody id="aud"><tr><td colspan="4" class="muted">Loading…</td></tr></tbody></table></div></div>`;

    try {
      const audit = await api('auditLog');
      const auditBody = $('#aud');
      auditBody.replaceChildren();

      audit.forEach((row) => {
        const tr = document.createElement('tr');
        const cells = [
          { value: String(row.time ?? '').replace('T', ' '), className: 'nw' },
          { value: row.user },
          { value: row.action, className: 'nw' },
          { value: `${row.target ?? ''} ${row.details ?? ''}` },
        ];

        cells.forEach(({ value, className }) => {
          const td = document.createElement('td');
          if (className) td.className = className;
          td.textContent = String(value ?? '');
          tr.appendChild(td);
        });

        auditBody.appendChild(tr);
      });
    } catch (error) {
      fail(error);
    }

    await renderBackupStatus();
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

      card.replaceChildren(title, state, details, note);
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
  }

  return {
    bind,
    vendors,
    users: usersView,
    settings,
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
