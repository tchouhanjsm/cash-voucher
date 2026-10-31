import { $, $$ } from '../core/dom.js';
import { catOpts, vendorList } from '../core/form-options.js';
import { offlineQueue } from '../core/offline-queue.js';
import {
  CASH_IMPACT_CHOICES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  S,
  vno,
} from '../core/state.js';
import { busy, fail, head, icon, toast } from '../core/ui.js';
import {
  addDays,
  compress,
  dmy,
  hasPayeeLetter,
  money,
  parseAmt,
  scalarText,
  businessDate,
  uid,
} from '../core/utils.js';
import { validateRecoveryRecords } from '../core/recovery-validation.js';

export function createPayments({ api, refresh }) {
  let NT = 'PAYMENT';
  let flushing = false;
  let rowErrorSeq = 0;
  const outboxChannel =
    typeof BroadcastChannel === 'function' ? new BroadcastChannel('cash-voucher-outbox') : null;

  function announceOutboxChange(type = 'changed') {
    try {
      outboxChannel?.postMessage({ type });
    } catch {}
  }

  function queueOwnerKey() {
    const email = typeof S.me?.email === 'string' ? S.me.email.trim().toLowerCase() : '';
    const endpoint = typeof S.url === 'string' ? S.url.trim() : '';
    if (!email || !endpoint) return '';

    try {
      const url = new URL(endpoint);
      return url.origin + url.pathname.replace(/\/+$/, '') + '|' + email;
    } catch {
      return '';
    }
  }

  function isRecordRejection(error) {
    if (
      ['VALIDATION', 'CONFLICT', 'DUPLICATE_CONFIRMATION_REQUIRED'].includes(
        String(error?.code || ''),
      )
    )
      return true;
    return error?.code === 'SERVER' && /^\[\d+\]\s/.test(String(error?.message || ''));
  }

  outboxChannel?.addEventListener('message', (event) => {
    if (!['changed', 'queued'].includes(event.data?.type)) return;

    showBanner();

    if (event.data.type === 'queued' && navigator.onLine) {
      flushOutbox();
    }
  });

  function paymentMethodOptions(selected = 'CASH') {
    return PAYMENT_METHODS.map(
      (method) =>
        "<option value='" +
        method +
        "'" +
        (method === selected ? ' selected' : '') +
        '>' +
        PAYMENT_METHOD_LABELS[method] +
        '</option>',
    ).join('');
  }
  function vendorForName(name) {
    const normalized = scalarText(name).trim().toLocaleLowerCase('en-IN');
    if (!normalized) return null;
    const matches = (Array.isArray(S.vendors) ? S.vendors : []).filter(
      (vendor) =>
        vendor &&
        vendor.active &&
        typeof vendor.id === 'string' &&
        vendor.id.trim() &&
        scalarText(vendor.name).trim().toLocaleLowerCase('en-IN') === normalized,
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function vendorRecordForName(name) {
    const normalized = scalarText(name).trim().toLocaleLowerCase('en-IN');
    if (!normalized) return null;
    return (
      (Array.isArray(S.vendors) ? S.vendors : []).find(
        (vendor) =>
          vendor && scalarText(vendor.name).trim().toLocaleLowerCase('en-IN') === normalized,
      ) || null
    );
  }

  function updateVendorIdentity(row) {
    const status = $('.vendor-identity', row);
    if (!status) return;
    const name = scalarText($('.rv', row)?.value).trim();
    if (!name) {
      status.textContent = 'Choose a saved vendor or enter a one-time payee.';
      status.dataset.kind = 'empty';
      return;
    }
    const vendor = vendorForName(name);
    if (vendor) {
      status.textContent = 'Verified vendor · linked to the vendor master';
      status.dataset.kind = 'verified';
      return;
    }
    const record = vendorRecordForName(name);
    status.textContent =
      record && !record.active
        ? 'One-time payee · the matching vendor record is inactive and will not be linked.'
        : 'One-time payee · not linked to the vendor master.';
    status.dataset.kind = 'one-time';
  }

  function canSavePayeeDefaults() {
    return !!(
      S.me?.perms?.vendors &&
      S.token &&
      !S.offlineMode &&
      typeof navigator !== 'undefined' &&
      navigator.onLine
    );
  }

  function updateQuickSavePayee(row) {
    if (!row) return;
    const holder = $('.chips', row);
    if (!holder) return;
    const name = scalarText($('.rv', row)?.value).trim();
    const normalized = name.toLowerCase();
    const conflictName = row.dataset.quickSaveConflict || '';
    if (conflictName && conflictName !== normalized) delete row.dataset.quickSaveConflict;
    const shouldShow =
      !!name &&
      canSavePayeeDefaults() &&
      !vendorRecordForName(name) &&
      row.dataset.quickSaveConflict !== normalized;
    let button = $('.rv-quick-save', holder);
    if (!shouldShow) {
      button?.remove();
      return;
    }
    if (button) return;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn sm rv-quick-save';
    button.dataset.act = 'save-payee';
    button.title = 'Save this payee with the selected category and payment method for next time';
    button.textContent = 'Save payee';
    const receiptPreview = $('.rp', holder);
    holder.insertBefore(button, receiptPreview || null);
  }

  function categoryForPayee(name) {
    const vendor = vendorForName(name);
    const allowed = NT === 'RECEIPT' ? S.settings?.receiptCategories : S.settings?.categories;
    if (
      vendor?.defaultCategory &&
      Array.isArray(allowed) &&
      allowed.includes(vendor.defaultCategory)
    ) {
      return vendor.defaultCategory;
    }
    return 'Other';
  }

  function methodForPayee(name) {
    const vendor = vendorForName(name);
    return vendor?.defaultPaymentMethod && PAYMENT_METHODS.includes(vendor.defaultPaymentMethod)
      ? vendor.defaultPaymentMethod
      : 'CASH';
  }

  function applyPayeeDefaults(row) {
    const category = categoryForPayee($('.rv', row).value);
    const categorySelect = $('.rc', row);
    categorySelect.value = [...categorySelect.options].some((option) => option.value === category)
      ? category
      : 'Other';
    const method = methodForPayee($('.rv', row).value);
    $('.rci', row).value = method;
    row.dataset.paymentMethod = method;
    updateBatchSummary();
  }
  function rowHtml() {
    return (
      "<div class='erow'>" +
      "<div class='top'>" +
      "<label class='entry-row-field entry-payee-field'><span>" +
      (NT === 'RECEIPT' ? 'Received from' : 'Paid to') +
      "</span><input class='rv' list='vlist' placeholder='Vendor or recipient' autocapitalize='words' autocomplete='off'><small class='vendor-identity' role='status' aria-live='polite'>Choose a saved vendor or enter a one-time payee.</small></label>" +
      "<label class='entry-row-field entry-amount-field'><span>Amount (₹)</span><input class='ra' inputmode='decimal' placeholder='0.00'></label>" +
      "<label class='entry-row-field entry-note-field'><span>Note</span><input class='rn' placeholder='Optional' aria-label='Note, optional' maxlength='500'></label>" +
      "<button type='button' class='x' data-act='delrow' title='Remove payment' aria-label='Remove payment'>✕</button></div>" +
      "<div class='bot'>" +
      "<label class='category-field'>Category<select class='rc'>" +
      catOpts('Other', NT) +
      '</select></label>' +
      "<label class='cash-impact-control payment-method-control'>" +
      (NT === 'RECEIPT' ? 'Received via' : 'Paid via') +
      "<select class='rci' required>" +
      paymentMethodOptions('CASH') +
      '</select></label></div>' +
      "<div class='chips'><label class='btn sm receipt-upload-label'>" +
      icon('receipt') +
      " Receipt<input type='file' class='rf' accept='image/*' multiple hidden></label><span class='rp'></span></div></div>"
    );
  }

  function labelRows() {
    const direction = NT === 'RECEIPT' ? 'Received from' : 'Paid to';
    $$('#rows .erow').forEach((row, index) => {
      const number = index + 1;
      $('.rv', row).setAttribute('aria-label', direction + ', row ' + number);
      $('.ra', row).setAttribute('aria-label', 'Amount in rupees, row ' + number);
      $('.rc', row).setAttribute('aria-label', 'Category, row ' + number);
      $('.rci', row).setAttribute('aria-label', 'Payment method, row ' + number);
      $('.rn', row).setAttribute('aria-label', 'Note, row ' + number);
      $('.rf', row).setAttribute('aria-label', 'Receipt images, row ' + number);
      $('[data-act="delrow"]', row).setAttribute('aria-label', 'Remove row ' + number);
    });
  }

  function clearRowError(row) {
    const error = $('.row-error', row);
    const errorId = error?.id || '';
    error?.remove();

    ['.rv', '.ra'].forEach((selector) => {
      const field = $(selector, row);
      field.removeAttribute('aria-invalid');
      const descriptions = (field.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((id) => id && id !== errorId);
      if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' '));
      else field.removeAttribute('aria-describedby');
    });
  }

  function showRowError(row, field, message) {
    clearRowError(row);
    const error = document.createElement('p');
    error.className = 'row-error';
    error.id = `payment-row-error-${++rowErrorSeq}`;
    error.setAttribute('role', 'alert');
    error.textContent = message;
    row.appendChild(error);
    field.setAttribute('aria-invalid', 'true');
    const descriptions = (field.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter(Boolean);
    if (!descriptions.includes(error.id)) descriptions.push(error.id);
    field.setAttribute('aria-describedby', descriptions.join(' '));
    field.focus();
  }

  function showFormError(message) {
    const error = document.createElement('p');
    error.className = 'error form-error';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    $('#nres').replaceChildren(error);
    const firstRow = document.querySelector('#rows .erow');
    if (firstRow) $('.rv', firstRow).focus();
  }

  function revokePreviewUrl(url) {
    if (typeof url !== 'string' || !url.startsWith('blob:')) return;

    try {
      URL.revokeObjectURL(url);
    } catch {
      // Resource cleanup must not block payment entry or navigation.
    }
  }

  function releaseReceiptPreviews(row) {
    if (!row) return;

    (Array.isArray(row._rec) ? row._rec : []).forEach((receipt) =>
      revokePreviewUrl(receipt?.preview),
    );
    row._rec = [];
    row._receiptRevision = (row._receiptRevision || 0) + 1;
  }

  function disposeReceiptPreviews() {
    $$('#rows .erow').forEach(releaseReceiptPreviews);
  }

  function removeRow(button) {
    const rows = $$('#rows .erow');
    if (rows.length <= 1) return;

    const row = button.closest('.erow');
    const target = row?.previousElementSibling || row?.nextElementSibling;
    if (!row) return;
    releaseReceiptPreviews(row);
    row.remove();
    labelRows();
    updateSaveLabel();
    updateBatchSummary();
    if (target) $('.rv', target).focus();
  }

  function entryNoun(count = 1) {
    if (NT === 'RECEIPT') return count === 1 ? 'cash receipt' : 'cash receipts';
    return count === 1 ? 'payment' : 'payments';
  }

  function resultPanel() {
    const panel = document.createElement('div');
    panel.className = 'card ok-panel';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    return panel;
  }

  function resultButton(label, action, className = 'btn') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.act = action;
    button.textContent = label;
    return button;
  }

  function renderDeviceSaveResult(message) {
    const panel = resultPanel();
    const title = document.createElement('h2');
    title.textContent = '📴 Saved on this device';
    const detail = document.createElement('p');
    detail.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(
      resultButton(
        'New ' + (NT === 'RECEIPT' ? 'cash receipt' : 'payment'),
        'newagain',
        'btn primary',
      ),
    );
    panel.append(title, detail, actions);
    $('#nres').replaceChildren(panel);
  }

  function renderServerSaveResult(created, pendingApprovalCount) {
    const panel = resultPanel();
    const title = document.createElement('h2');
    title.textContent = '✔ Saved ' + created.length + ' ' + entryNoun(created.length);
    panel.appendChild(title);

    if (pendingApprovalCount) {
      const pending = document.createElement('p');
      pending.setAttribute('role', 'status');
      pending.textContent =
        pendingApprovalCount +
        ' payment(s) are pending owner/manager approval. They are excluded from approved totals and Daily Cash Close until approved by someone other than the creator.';
      panel.appendChild(pending);
    }

    created.forEach((voucher) => {
      const row = document.createElement('div');
      row.style.margin = '8px 0';
      row.appendChild(
        document.createTextNode(
          '#' + String(vno(voucher) ?? '') + ' · ' + String(voucher.vendor ?? '') + ' · ',
        ),
      );
      const amount = document.createElement('b');
      amount.textContent = money(voucher.amount);
      const print = resultButton('Print', 'print', 'btn sm');
      print.dataset.id = String(voucher.id ?? '');
      row.append(amount, document.createTextNode(' '), print);
      panel.appendChild(row);
    });

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(
      resultButton(
        'New ' + (NT === 'RECEIPT' ? 'cash receipt' : 'payment'),
        'newagain',
        'btn primary',
      ),
    );
    panel.appendChild(actions);
    $('#nres').replaceChildren(panel);
  }

  function updateSaveLabel() {
    let count = 0;
    document.querySelectorAll('#rows .erow').forEach((row) => {
      if ($('.rv', row).value.trim() || $('.ra', row).value.trim() || row._rec.length) {
        count += 1;
      }
    });
    const button = $('#nsave');
    if (button) button.textContent = 'Save ' + entryNoun(count > 1 ? 2 : 1);
  }

  function updateBatchSummary() {
    const summary = $('#entrySummary');
    if (!summary) return;
    const totals = { CASH: 0, UPI: 0, BANK_TRANSFER: 0 };
    let readyCount = 0;
    $$('#rows .erow').forEach((row) => {
      const payee = $('.rv', row).value.trim();
      const amount = parseAmt($('.ra', row).value.trim());
      const method = $('.rci', row).value;
      if (!payee || !(amount > 0) || !PAYMENT_METHODS.includes(method)) return;
      readyCount += 1;
      totals[method] += amount;
    });
    const writeMetric = (id, amount) => {
      const node = $('#' + id);
      if (!node) return;
      const value = Math.round(amount * 100) / 100;
      node.dataset.value = value.toFixed(2);
      node.textContent = money(value);
    };
    const count = $('#batchCount');
    if (count) count.textContent = readyCount + ' ready entr' + (readyCount === 1 ? 'y' : 'ies');
    writeMetric('batchTotal', totals.CASH + totals.UPI + totals.BANK_TRANSFER);
    writeMetric('batchCash', totals.CASH);
    writeMetric('batchUpi', totals.UPI);
    writeMetric('batchBank', totals.BANK_TRANSFER);
    summary.dataset.readyCount = String(readyCount);
  }

  function vNew() {
    $('#view').innerHTML =
      head(NT === 'RECEIPT' ? 'Cash Received' : 'New Cash Payment', '', {
        section: 'Work',
        description:
          'Record a payment or receipt, attach supporting evidence, and confirm how the money moved.',
      }) +
      `<div class="seg entry-type-switch" role="group" aria-label="Entry type"><button type="button" data-act="ntype" data-k="PAYMENT" class="${NT === 'PAYMENT' ? 'on' : ''}">${icon('wallet')} Payment out</button><button type="button" data-act="ntype" data-k="RECEIPT" class="${NT === 'RECEIPT' ? 'on' : ''}">${icon('cash')} Cash received</button></div><form id="nf" class="card entry-form" autocomplete="off">${vendorList()}
    <label class="entry-date-field">Date<input type="date" id="nd" value="${businessDate()}" max="${addDays(businessDate(), 1)}" required></label><div id="recentVendors" class="chips" role="group" aria-label="${NT === 'RECEIPT' ? 'Recent verified payers' : 'Recent verified payees'}" hidden></div><div id="rows"></div>
    <section id="entrySummary" class="entry-summary" aria-label="Current batch totals">
      <div class="entry-summary__head"><strong>Current batch</strong><span id="batchCount" aria-live="polite">0 ready entries</span></div>
      <div class="entry-summary__grid">
        <div class="entry-summary__metric entry-summary__metric--total"><span>Total</span><strong id="batchTotal" data-value="0.00">₹0</strong></div>
        <div class="entry-summary__metric"><span>Cash method</span><strong id="batchCash" data-value="0.00">₹0</strong></div>
        <div class="entry-summary__metric"><span>UPI</span><strong id="batchUpi" data-value="0.00">₹0</strong></div>
        <div class="entry-summary__metric"><span>Bank transfer</span><strong id="batchBank" data-value="0.00">₹0</strong></div>
      </div>
      <p class="entry-summary__note">Totals include rows with a payee and valid amount. Only Cash counts toward drawer movement; UPI and bank transfer stay separate.</p>
    </section>
    <div class="actions"><button type="button" class="btn" data-act="addrow">+ Add another</button><button class="btn primary" id="nsave">Save ${NT === 'RECEIPT' ? 'cash receipt' : 'payment'}</button><button type="button" class="btn" data-act="import-pending">Import recovery file</button></div>
    <p class="muted">Tip: tap “Receipt” to take a photo or pick a screenshot (up to 3 per payment).</p></form><div id="nres"></div>`;
    addRow();
    renderRecentVendors();
    updateBatchSummary();
  }

  function recentVendors(limit = 6) {
    const vouchers = Array.isArray(S.vouchers) ? S.vouchers : [];
    const lastUsed = new Map();

    vouchers.forEach((voucher) => {
      if (!voucher || voucher.status !== 'ACTIVE' || voucher.type !== NT || !voucher.vendorId)
        return;
      const key = String(voucher.vendorId);
      const stamp = String(voucher.date || '') + '|' + String(voucher.no || '').padStart(12, '0');
      if (stamp > (lastUsed.get(key) || '')) lastUsed.set(key, stamp);
    });

    const byName = new Map();
    const ambiguous = new Set();
    (Array.isArray(S.vendors) ? S.vendors : []).forEach((vendor) => {
      if (!vendor || !vendor.active || typeof vendor.id !== 'string' || !vendor.id.trim()) return;
      const name = scalarText(vendor.name).trim();
      if (!hasPayeeLetter(name)) return;
      const key = name.toLocaleLowerCase('en-IN');
      if (byName.has(key)) {
        byName.delete(key);
        ambiguous.add(key);
      } else if (!ambiguous.has(key)) {
        byName.set(key, { id: vendor.id, name });
      }
    });

    return [...byName.values()]
      .sort(
        (a, b) =>
          (lastUsed.get(b.id) || '').localeCompare(lastUsed.get(a.id) || '') ||
          a.name.localeCompare(b.name, 'en-IN'),
      )
      .slice(0, limit);
  }

  function renderRecentVendors() {
    const holder = $('#recentVendors');
    if (!holder) return;
    const vendors = recentVendors();
    holder.hidden = vendors.length === 0;
    holder.replaceChildren(
      ...vendors.map((vendor) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'btn sm vchip';
        chip.textContent = vendor.name;
        chip.title = vendor.name;
        chip.setAttribute('aria-label', 'Use verified vendor ' + vendor.name);
        chip.dataset.vendorId = vendor.id;
        return chip;
      }),
    );
  }

  document.addEventListener('click', (event) => {
    const chip = event.target.closest('.vchip');
    if (!chip) return;
    const rows = $$('#rows .erow');
    const row = rows.find((item) => !$('.rv', item).value.trim()) || rows[rows.length - 1];
    if (!row) return;
    $('.rv', row).value = chip.textContent;
    $('.rv', row).dispatchEvent(new Event('input', { bubbles: true }));
    $('.rv', row).dispatchEvent(new Event('change', { bubbles: true }));
    clearRowError(row);
    $('.ra', row).focus();
  });

  function duplicateFingerprint(entry) {
    return JSON.stringify([
      entry.type,
      entry.date,
      entry.vendorId || '',
      entry.vendorType,
      scalarText(entry.vendor).trim().toLowerCase(),
      Math.round(Number(entry.amount) * 100),
    ]);
  }

  async function requestDuplicateConfirmations(entries, entryRows) {
    const response = await api('checkPaymentDuplicates', {
      entries: entries.map((entry, index) => ({
        index,
        clientId: entry.clientId,
        date: entry.date,
        type: entry.type,
        vendor: entry.vendor,
        vendorId: entry.vendorId,
        vendorType: entry.vendorType,
        amount: entry.amount,
        confirmationToken: entryRows[index].dataset.duplicateConfirmationToken || '',
      })),
    });
    if (!Array.isArray(response?.results) || response.results.length !== entries.length) {
      throw Object.assign(
        new Error('The server did not return a complete duplicate-check result.'),
        {
          code: 'BAD',
        },
      );
    }

    let ready = true;
    response.results.forEach((result) => {
      const entry = entries[result.index];
      const row = entryRows[result.index];
      if (!entry || !row) {
        ready = false;
        return;
      }
      if (!(Number(result.duplicateCount) > 0)) {
        delete row.dataset.duplicateConfirmationFingerprint;
        delete row.dataset.duplicateConfirmationToken;
        return;
      }

      const fingerprint = duplicateFingerprint(entry);
      const token = String(result.confirmationToken || '');
      const previousFingerprint = row.dataset.duplicateConfirmationFingerprint || '';
      const previousToken = row.dataset.duplicateConfirmationToken || '';
      if (!token) {
        showRowError(
          row,
          $('.ra', row),
          'A possible duplicate was found, but its confirmation could not be prepared. Retry the check before saving.',
        );
        ready = false;
        return;
      }

      if (previousFingerprint !== fingerprint || previousToken !== token) {
        row.dataset.duplicateConfirmationFingerprint = fingerprint;
        row.dataset.duplicateConfirmationToken = token;
        const details = (Array.isArray(result.matches) ? result.matches : []).map((match) =>
          match.inBatch
            ? 'another row in this batch (row ' + match.row + ')'
            : 'voucher ' + (match.voucherNo || 'on record') + ' dated ' + dmy(match.date),
        );
        if (Number(result.hiddenCount) > 0) {
          details.push(
            Number(result.hiddenCount) + ' additional match(es) not visible to this account',
          );
        }
        const suffix = details.length ? ' Matches: ' + details.join('; ') + '.' : '';
        showRowError(
          row,
          $('.ra', row),
          'Possible duplicate: ' +
            money(entry.amount) +
            ' to ' +
            entry.vendor +
            ' near ' +
            dmy(entry.date) +
            '.' +
            suffix +
            ' Review the existing record(s). Save again only if this is a separate transaction.',
        );
        ready = false;
        return;
      }

      entry.duplicateConfirmationToken = token;
    });

    return ready;
  }

  function open(type = 'PAYMENT') {
    disposeReceiptPreviews();
    NT = type;
    vNew();
  }

  function newAgain() {
    open(NT);
  }

  function addRow() {
    const previousRows = $$('#rows .erow');
    for (const previous of previousRows) {
      const payee = $('.rv', previous).value.trim();
      const amount = parseAmt($('.ra', previous).value.trim());
      if (!payee) {
        showRowError(
          previous,
          $('.rv', previous),
          'Enter who was paid before adding another payment.',
        );
        return;
      }
      if (!(amount > 0)) {
        showRowError(
          previous,
          $('.ra', previous),
          'Enter a valid amount before adding another payment.',
        );
        return;
      }
    }
    const d = document.createElement('div');
    d.innerHTML = rowHtml();
    const r = d.firstElementChild;
    r._rec = [];
    r._receiptRevision = 0;
    $('#rows').appendChild(r);
    $('#nres').querySelector('.form-error')?.remove();
    labelRows();
    updateSaveLabel();
    const v = $('.rv', r);
    if ($$('#rows .erow').length > 1) v.focus();
    applyPayeeDefaults(r);
    updateQuickSavePayee(r);
    updateBatchSummary();
  }

  function clearReceipt(button) {
    const row = button.closest('.erow');
    if (!row) return;
    releaseReceiptPreviews(row);
    $('.rp', row).replaceChildren();
    updateSaveLabel();
  }

  document.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('rf')) return;
    const row = e.target.closest('.erow');
    if (!row) return;
    const files = [...e.target.files];
    const revision = row._receiptRevision;
    e.target.value = '';

    for (const file of files) {
      if (row._rec.length >= 3) {
        toast('Maximum 3 receipts per payment.', 'err');
        break;
      }
      try {
        const receipt = await compress(file);
        if (!row.isConnected || !$('#rows')?.contains(row) || row._receiptRevision !== revision) {
          revokePreviewUrl(receipt.preview);
          continue;
        }
        row._rec.push(receipt);
      } catch (error) {
        if (row.isConnected && $('#rows')?.contains(row)) fail(error);
      }
    }

    if (!row.isConnected || !$('#rows')?.contains(row)) return;

    const preview = $('.rp', row);
    preview.replaceChildren();

    row._rec.forEach((receipt) => {
      const image = document.createElement('img');
      image.className = 'thumb';
      image.alt = 'receipt';
      image.src = receipt.preview;
      preview.appendChild(image);
    });

    updateSaveLabel();

    if (row._rec.length) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'btn sm';
      clear.dataset.act = 'clrrec';
      clear.textContent = 'Clear';
      preview.append(' ', clear);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('#nd')) {
      $$('#rows .erow').forEach((row) => {
        delete row.dataset.duplicateConfirmationFingerprint;
        delete row.dataset.duplicateConfirmationToken;
      });
      return;
    }
    const row = event.target.closest('.erow');
    if (!row) return;
    if (event.target.matches('.rv')) {
      applyPayeeDefaults(row);
      updateVendorIdentity(row);
      updateQuickSavePayee(row);
    }
    if (event.target.matches('.rci, .rc, .rn')) clearRowError(row);
    updateBatchSummary();
  });
  document.addEventListener('focusout', (event) => {
    if (!event.target.matches('.rv')) return;
    const row = event.target.closest('.erow');
    if (row && event.target.value.trim()) {
      applyPayeeDefaults(row);
      updateVendorIdentity(row);
      updateQuickSavePayee(row);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('rv')) {
      e.preventDefault();
      const row = e.target.closest('.erow');
      if (row) $('.ra', row).focus();
    } else if (e.key === 'Enter' && e.target.classList.contains('ra')) {
      e.preventDefault();
      const rows = $$('#rows .erow');
      if (e.target.closest('.erow') === rows[rows.length - 1]) addRow();
      else $('.rv', rows[rows.indexOf(e.target.closest('.erow')) + 1]).focus();
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('#nd')) {
      $$('#rows .erow').forEach((row) => {
        delete row.dataset.duplicateConfirmationFingerprint;
        delete row.dataset.duplicateConfirmationToken;
      });
      return;
    }
    if (!event.target.matches('.rv, .ra, .rn')) return;

    const row = event.target.closest('.erow');
    if (row) {
      clearRowError(row);
      if (event.target.matches('.rv, .ra')) {
        delete row.dataset.duplicateConfirmationFingerprint;
        delete row.dataset.duplicateConfirmationToken;
      }
      if (event.target.matches('.rv')) {
        updateVendorIdentity(row);
        updateQuickSavePayee(row);
      }
    }
    $('#nres .form-error')?.remove();
    updateSaveLabel();
    updateBatchSummary();
  });

  async function savePayee(button) {
    const row = button?.closest('.erow');
    if (!row) return;
    if (!S.me?.perms?.vendors) {
      toast('Only managers and owners can save payee defaults.', 'err');
      updateQuickSavePayee(row);
      return;
    }
    const name = scalarText($('.rv', row).value).trim();
    if (!name) return toast('Enter a payee name first.', 'err');
    if (!canSavePayeeDefaults()) {
      toast('Reconnect to save this payee for next time. Your voucher entry is still here.', 'err');
      updateQuickSavePayee(row);
      return;
    }
    if (vendorRecordForName(name)) {
      toast('This payee is already saved. Your current entry is unchanged.', 'err');
      updateQuickSavePayee(row);
      return;
    }

    const category = $('.rc', row).value;
    const paymentMethod = $('.rci', row).value;
    try {
      await busy(button, async () => {
        const result = await api('saveVendor', {
          name,
          company: '',
          mobile: '',
          defaultCategory: category,
          defaultPaymentMethod: paymentMethod,
        });
        const vendorId = scalarText(result?.vendorId).trim();
        if (!vendorId)
          throw new Error(
            'Payee was saved but its ID was not returned. Refresh before saving another voucher.',
          );
        const vendor = {
          id: vendorId,
          name,
          company: '',
          mobile: '',
          active: true,
          defaultCategory: category,
          defaultPaymentMethod: paymentMethod,
        };
        if (!Array.isArray(S.vendors)) S.vendors = [];
        const existingIndex = S.vendors.findIndex(
          (item) => scalarText(item?.name).trim().toLowerCase() === name.toLowerCase(),
        );
        if (existingIndex >= 0) S.vendors[existingIndex] = vendor;
        else S.vendors.push(vendor);
        if (
          row.isConnected &&
          scalarText($('.rv', row).value).trim().toLowerCase() === name.toLowerCase()
        ) {
          delete row.dataset.quickSaveConflict;
          applyPayeeDefaults(row);
          updateQuickSavePayee(row);
        }
        toast('Payee saved for next time. Your current entry is unchanged.', 'ok');
      });
    } catch (error) {
      if (/already exists/i.test(String(error?.message || ''))) {
        row.dataset.quickSaveConflict = name.toLowerCase();
        updateQuickSavePayee(row);
        toast(
          'This payee was saved in another session. Your entry is kept; refresh to load its defaults.',
          'err',
        );
      } else {
        fail(error);
      }
    }
  }

  async function saveNew(btn) {
    const date = $('#nd').value;
    const entries = [];
    const rows = $('#rows .erow');
    const entryRows = [];
    rows.forEach(clearRowError);

    for (const [index, r] of rows.entries()) {
      const vendor = $('.rv', r).value.trim();
      const raw = $('.ra', r).value.trim();
      const amount = parseAmt(raw);
      const note = $('.rn', r).value.trim();
      const hasReceipt = Array.isArray(r._rec) && r._rec.length > 0;
      if (!vendor && !raw && !note && !hasReceipt && index === rows.length - 1) continue;
      if (!vendor && !raw && !note && !hasReceipt) {
        showRowError(r, $('.rv', r), 'Complete or remove this payment row before saving.');
        return;
      }
      if (!vendor) {
        showRowError(
          r,
          $('.rv', r),
          NT === 'RECEIPT'
            ? 'Enter who the cash was received from.'
            : 'Enter a payee or vendor for this row.',
        );
        return;
      }

      if (!(amount > 0)) {
        showRowError(r, $('.ra', r), 'Enter a valid amount greater than ₹0.');
        return;
      }

      const paymentMethod = $('.rci', r).value;
      if (!PAYMENT_METHODS.includes(paymentMethod)) {
        showRowError(r, $('.rci', r), 'Choose Cash, UPI or Bank transfer.');
        return;
      }
      const cashImpact =
        paymentMethod === 'CASH' ? (NT === 'RECEIPT' ? 'CASH_IN' : 'CASH_OUT') : 'NO_CASH';

      const selectedVendor = vendorForName(vendor);

      entries.push({
        clientId: r._cid || (r._cid = uid()),
        date,
        type: NT,
        vendor,
        vendorId: selectedVendor ? selectedVendor.id : null,
        vendorType: selectedVendor ? 'REGISTERED' : 'ONE_TIME',
        amount,
        category: $('.rc', r).value,
        cashImpact,
        paymentMethod,
        notes: note,
        receipts: r._rec.map((x) => ({ mime: x.mime, data: x.data })),
      });
      entryRows.push(r);
    }

    if (!date) {
      toast('Date is required.', 'err');
      $('#nd').focus();
      return;
    }
    if (!entries.length) {
      showFormError(
        NT === 'RECEIPT'
          ? 'Add at least one cash receipt before saving.'
          : 'Add at least one payment before saving.',
      );
      return;
    }

    await busy(btn, async () => {
      const saveOnDevice = async (message) => {
        if (!(await queue(entries))) return false;
        disposeReceiptPreviews();
        $('#nf').classList.add('hidden');
        renderDeviceSaveResult(message);
        return true;
      };

      if (S.offlineMode || !S.token || !navigator.onLine) {
        const message =
          S.offlineMode || !S.token
            ? 'Sign in online to synchronize these entries. They will stay on this device until then.'
            : 'Your connection is unavailable. These entries will upload automatically when it returns.';
        await saveOnDevice(message);
        return;
      }

      try {
        const duplicatesConfirmed = await requestDuplicateConfirmations(entries, entryRows);
        if (!duplicatesConfirmed) return;
        const d = await api('createVouchers', { entries });
        d.created.forEach((c) => {
          if (!S.vouchers.find((v) => v.id === c.id)) S.vouchers.push(c);
        });
        const pendingApprovalCount = d.created.filter(
          (voucher) => voucher.approvalStatus === 'PENDING',
        ).length;
        disposeReceiptPreviews();
        $('#nf').classList.add('hidden');
        renderServerSaveResult(d.created, pendingApprovalCount);
      } catch (e) {
        if (e?.code === 'DUPLICATE_CONFIRMATION_REQUIRED') {
          try {
            await requestDuplicateConfirmations(entries, entryRows);
          } catch (checkError) {
            fail(checkError);
          }
          return;
        }
        // A lost connection or non-JSON response can happen after the server committed the voucher.
        // Preserve each original client ID locally, then retry those same IDs once through the outbox.
        if (!['NET', 'BAD'].includes(String(e?.code || ''))) return fail(e);
        const queued = await saveOnDevice(
          'The server response did not confirm whether this entry was saved. It is stored on this device under the same transaction ID. Do not enter it again while we confirm the result.',
        );
        if (!queued || !navigator.onLine || !S.token || S.offlineMode) return;

        await flushOutbox();
        try {
          const clientIds = new Set(entries.map((entry) => entry.clientId));
          const records = await offlineQueue.list();
          const remaining = records.filter((record) => clientIds.has(record.clientId));
          const panel = $('#nres .ok-panel');
          if (!panel) return;
          const title = $('h2', panel);
          const message = $('p', panel);
          if (!title || !message) return;

          if (!remaining.length) {
            title.textContent = '✔ Saved and synchronized';
            message.textContent =
              'The server confirmed the entry on retry using the same transaction ID. No duplicate voucher was created.';
          } else if (remaining.some((record) => record.status === 'failed')) {
            title.textContent = '⚠ Saved on this device — review required';
            message.textContent =
              'One or more entries need review. Check the recovery banner and export before removing any rejected entry. Do not re-enter an uncertain entry.';
          } else {
            title.textContent = '⚠ Saved on this device — confirmation pending';
            message.textContent =
              'The server has not confirmed every entry yet. They remain queued under the same transaction IDs. Do not re-enter them; use Sync now when the connection or session is ready.';
          }
        } catch {
          // Keep the conservative confirmation-pending message if queue state cannot be read.
        }
      }
    });
  }

  $('#view').addEventListener('submit', (e) => {
    if (e.target.id === 'nf') {
      e.preventDefault();
      saveNew($('#nsave'));
    }
  });

  async function queue(entries) {
    try {
      await offlineQueue.enqueue(entries, queueOwnerKey());
      await showBanner();
      announceOutboxChange('queued');
      return true;
    } catch (error) {
      toast(
        error.name === 'QuotaExceededError'
          ? 'Phone storage is full — reconnect before saving offline.'
          : error.message || 'Could not save offline. Reconnect before saving.',
        'err',
      );
      return false;
    }
  }

  async function showBanner(errMsg) {
    const b = $('#banner');

    try {
      const allRecords = await offlineQueue.list();
      const ownerKey = queueOwnerKey();
      if (!ownerKey) return b.classList.add('hidden');
      const owned = allRecords.filter((record) => String(record.ownerKey || '') === ownerKey);
      const unbound = allRecords.filter((record) => !String(record.ownerKey || ''));
      const visible = owned.concat(unbound);
      const pending = owned.filter((record) => ['pending', 'sending'].includes(record.status));
      const failed = owned.filter((record) => record.status === 'failed');
      const describeEntries = (records) => {
        const payments = records.filter((record) => record.entry?.type === 'PAYMENT').length;
        const receipts = records.filter((record) => record.entry?.type === 'RECEIPT').length;
        const unknown = records.length - payments - receipts;
        const parts = [];
        if (payments) parts.push(payments + ' payment' + (payments === 1 ? '' : 's'));
        if (receipts) parts.push(receipts + ' cash receipt' + (receipts === 1 ? '' : 's'));
        if (unknown) parts.push(unknown + ' unclassified entr' + (unknown === 1 ? 'y' : 'ies'));
        return parts.length === 1
          ? parts[0]
          : records.length + ' queued entries (' + parts.join(', ') + ')';
      };

      if (!visible.length && !errMsg && !S.offlineMode) return b.classList.add('hidden');

      const messages = [];
      if (pending.length) {
        messages.push('📤 ' + describeEntries(pending) + ' waiting to upload');
      }
      if (failed.length) {
        messages.push('⚠️ ' + describeEntries(failed) + ' need review; automatic retry stopped');
      }

      const displayScalar = (value, fallback) =>
        typeof value === 'string'
          ? value
          : typeof value === 'number' && Number.isFinite(value)
            ? String(value)
            : fallback;
      const makeButton = (label, action, className = 'btn sm', id = '') => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.dataset.act = action;
        if (id) button.dataset.id = id;
        button.textContent = label;
        return button;
      };
      const makeDetails = (className, label, description, entries, appendEntry, overflow) => {
        if (!entries.length) return null;
        const details = document.createElement('details');
        details.className = className;
        const summary = document.createElement('summary');
        summary.textContent = label;
        const help = document.createElement('p');
        help.className = 'muted';
        help.textContent = description;
        const list = document.createElement('ul');
        entries.forEach((entry) => list.appendChild(appendEntry(entry)));
        if (overflow) {
          const item = document.createElement('li');
          item.textContent = overflow;
          list.appendChild(item);
        }
        details.append(summary, help, list);
        return details;
      };

      if (unbound.length) {
        messages.push(
          '⚠️ ' +
            unbound.length +
            ' older queued entr' +
            (unbound.length === 1 ? 'y' : 'ies') +
            ' need account confirmation before upload',
        );
      }
      if (S.offlineMode) {
        messages.unshift(
          'Offline workspace — server vouchers are unavailable. New entries stay on this device until you sign in online.',
        );
      }
      if (errMsg) messages.push(errMsg);

      b.className =
        'banner' + (S.offlineMode || errMsg || failed.length || unbound.length ? ' err' : '');
      const messageNode = document.createElement('span');
      messages.forEach((message, index) => {
        if (index) messageNode.appendChild(document.createElement('br'));
        messageNode.appendChild(document.createTextNode(message));
      });
      b.replaceChildren(messageNode);

      const pendingReview = makeDetails(
        'outbox-pending',
        'Review queued entries',
        'These entries are stored on this device and are not confirmed on the server yet. Do not re-enter them just because they have not uploaded.',
        pending.slice(0, 5),
        (record) => {
          const entry =
            record.entry && typeof record.entry === 'object' && !Array.isArray(record.entry)
              ? record.entry
              : {};
          const kind =
            entry.type === 'RECEIPT'
              ? 'Cash receipt'
              : entry.type === 'PAYMENT'
                ? 'Payment'
                : 'Entry';
          const vendor = displayScalar(entry.vendor, 'Unnamed entry').slice(0, 120);
          const amount =
            typeof entry.amount === 'number' && Number.isFinite(entry.amount)
              ? money(entry.amount)
              : 'Amount unavailable';
          const date =
            typeof entry.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
              ? entry.date
              : 'Date unavailable';
          const receiptCount = Array.isArray(entry.receipts) ? entry.receipts.length : 0;
          const status = record.status === 'sending' ? 'Upload in progress' : 'Waiting to upload';
          const receiptLabel =
            receiptCount === 1
              ? ' · 1 receipt image'
              : receiptCount > 1
                ? ' · ' +
                  Math.min(receiptCount, 99) +
                  (receiptCount > 99 ? '+' : '') +
                  ' receipt images'
                : '';
          const item = document.createElement('li');
          const title = document.createElement('b');
          title.textContent = kind + ': ' + vendor;
          item.append(
            title,
            document.createTextNode(' — ' + amount + ' · ' + date + ' · ' + status + receiptLabel),
          );
          return item;
        },
        pending.length > 5
          ? '+' + (pending.length - 5) + ' more; export the queue to inspect all queued entries.'
          : '',
      );

      const failedReview = makeDetails(
        'outbox-failures',
        'Review rejected entries',
        'Export a recovery copy before removing an entry. Removed entries are no longer stored on this device.',
        failed.slice(0, 5),
        (record) => {
          const entry =
            record.entry && typeof record.entry === 'object' && !Array.isArray(record.entry)
              ? record.entry
              : {};
          const kind =
            entry.type === 'RECEIPT'
              ? 'Cash receipt: '
              : entry.type === 'PAYMENT'
                ? 'Payment: '
                : 'Entry: ';
          const clientId = typeof record.clientId === 'string' ? record.clientId : '';
          const amount = displayScalar(entry.amount, 'unknown');
          const failure = displayScalar(record.failure, 'Rejected by server');
          const item = document.createElement('li');
          const title = document.createElement('b');
          title.textContent = kind + displayScalar(entry.vendor, 'Unnamed entry');
          item.append(title, document.createTextNode(' — ₹' + amount + ': ' + failure));
          if (clientId) {
            item.append(
              document.createTextNode(' '),
              makeButton('Export & remove', 'discard-failed', 'btn sm danger', clientId),
            );
          }
          return item;
        },
        failed.length > 5
          ? '+' + (failed.length - 5) + ' more; export the queue for full details.'
          : '',
      );

      if (pendingReview) b.appendChild(pendingReview);
      if (failedReview) b.appendChild(failedReview);
      if (pending.length && S.token) b.appendChild(makeButton('Retry now', 'flush'));
      if (visible.length) b.appendChild(makeButton('Export', 'export-pending'));
      b.appendChild(makeButton('Import', 'import-pending'));
      if (S.offlineMode && !S.token)
        b.appendChild(makeButton('Sign in to sync', 'reconnect-signin'));
      if (owned.length)
        b.appendChild(makeButton('Clear my queued entries', 'discard', 'btn sm danger'));
    } catch (error) {
      b.className = 'banner err';
      const message =
        error.message ||
        'Offline storage is unavailable. Reconnect before saving unsynced payments.';
      const messageNode = document.createElement('span');
      messageNode.textContent = '⚠️ ' + message;
      b.replaceChildren(messageNode);
      console.error('Offline queue unavailable:', error);
    }
  }

  async function flushOutbox() {
    const ownerKey = queueOwnerKey();
    if (flushing || S.offlineMode || !S.token || !ownerKey || !navigator.onLine)
      return showBanner();
    flushing = true;

    let uploaded = 0;
    let rejected = 0;
    let bannerError = '';
    let stopFlush = false;
    const leaseOwner = uid();

    try {
      await offlineQueue.ready();

      while (!stopFlush) {
        const records = await offlineQueue.claim(10, leaseOwner, ownerKey);
        if (!records.length) break;

        for (let index = 0; index < records.length; index++) {
          const record = records[index];
          const remainingIds = records.slice(index).map((item) => item.clientId);

          if (!S.token || queueOwnerKey() !== ownerKey) {
            await offlineQueue.release(remainingIds, leaseOwner);
            bannerError = 'The signed-in account changed. Remaining payments were kept pending.';
            announceOutboxChange('changed');
            stopFlush = true;
            break;
          }

          let serverConfirmed = false;
          try {
            if (!CASH_IMPACT_CHOICES.includes(record.entry?.cashImpact)) {
              throw Object.assign(
                new Error(
                  'This queued entry predates cash-impact classification. Export it and re-enter it with a cash-impact value; the queued record has been kept for recovery.',
                ),
                { code: 'VALIDATION' },
              );
            }
            // Submit one row per request so one rejected row cannot poison its neighbours.
            await api('createVouchers', { entries: [record.entry] });
            serverConfirmed = true;
            await offlineQueue.ack([record.clientId], leaseOwner);
            uploaded++;
          } catch (error) {
            // A successful server response followed by an IndexedDB failure is not a failed
            // voucher: retain the original client ID and make the local-confirmation gap explicit.
            if (serverConfirmed) {
              try {
                await offlineQueue.release(remainingIds, leaseOwner);
              } catch (storageError) {
                console.error(
                  'Could not release an unacknowledged payment after server confirmation:',
                  storageError,
                );
              }
              bannerError =
                'The server accepted a payment, but this device could not confirm local cleanup. The entry remains recoverable under the same transaction ID. Do not enter it again.';
              announceOutboxChange('changed');
              stopFlush = true;
              break;
            }

            if (isRecordRejection(error)) {
              try {
                await offlineQueue.markFailed(record.clientId, leaseOwner, error.message);
                rejected++;
                announceOutboxChange('changed');
                continue;
              } catch (storageError) {
                await offlineQueue.release(remainingIds, leaseOwner);
                bannerError = storageError.message || 'Could not save the rejected payment state.';
                announceOutboxChange('changed');
                stopFlush = true;
                break;
              }
            }

            await offlineQueue.release(remainingIds, leaseOwner);
            bannerError =
              error.code === 'NET'
                ? 'Connection to server was lost. Remaining payments are still queued.'
                : error.message || 'Upload stopped; remaining payments are still queued.';
            announceOutboxChange('changed');
            stopFlush = true;
            break;
          }
        }
      }

      if (uploaded) {
        announceOutboxChange('changed');
        if (S.token && queueOwnerKey() === ownerKey) {
          toast(uploaded + ' offline payment' + (uploaded === 1 ? '' : 's') + ' uploaded.', 'ok');
          await refresh(true);
        }
      }
      if (rejected) {
        toast(
          rejected +
            ' payment' +
            (rejected === 1 ? '' : 's') +
            ' need review and will not retry automatically. ' +
            'Export the queue before discarding any item.',
          'err',
        );
      }
    } catch (error) {
      bannerError = error.code === 'NET' ? 'Connection to server was lost.' : error.message;
    } finally {
      flushing = false;
    }

    await showBanner(bannerError);
  }

  async function exportOutbox() {
    try {
      const ownerKey = queueOwnerKey();
      if (!ownerKey) {
        toast('Sign in before exporting pending entries.', 'err');
        return false;
      }
      const allRecords = await offlineQueue.list();
      const unbound = allRecords.filter((record) => !String(record.ownerKey || ''));
      if (
        unbound.length &&
        !confirm(
          'The offline queue contains ' +
            unbound.length +
            ' older payment(s) with no recorded owner. Export includes them. ' +
            'Continue only if you are authorised to access these records.',
        )
      ) {
        return false;
      }

      const records = allRecords.filter(
        (record) => String(record.ownerKey || '') === ownerKey || !String(record.ownerKey || ''),
      );

      if (!records.length) {
        toast('There are no queued entries for this account to export.', 'ok');
        return false;
      }

      const payload = {
        format: 'cash-voucher.pending',
        version: 1,
        exportedAt: new Date().toISOString(),
        records: records.map((record) => ({
          clientId: record.clientId,
          ownerKey: String(record.ownerKey || ''),
          status: record.status,
          attempts: record.attempts,
          failure: record.failure || '',
          queuedAt: new Date(record.createdAt).toISOString(),
          entry: record.entry,
        })),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = 'cash-vouchers-pending-' + businessDate() + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast('Offline entry recovery file exported. Keep it secure.', 'ok');
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }

  async function importOutbox() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;

    input.addEventListener('cancel', () => input.remove(), { once: true });
    input.addEventListener(
      'change',
      async () => {
        const file = input.files && input.files[0];
        input.remove();

        if (!file) return;
        if (file.size > 25 * 1024 * 1024) {
          return toast('Recovery file exceeds the 25 MB limit.', 'err');
        }

        try {
          const payload = JSON.parse(await file.text());

          if (
            !payload ||
            payload.format !== 'cash-voucher.pending' ||
            payload.version !== 1 ||
            !Array.isArray(payload.records)
          ) {
            throw new Error('This is not a supported Cash Vouchers recovery file.');
          }

          const ownerKey = queueOwnerKey();
          if (!ownerKey) throw new Error('Sign in before restoring pending payments.');

          const validation = validateRecoveryRecords(
            payload.records,
            ownerKey,
            addDays(businessDate(), 1),
          );
          const unboundCount = validation.unboundCount;
          const accountName = scalarText(S.me?.email) || 'the signed-in account';
          const confirmation = unboundCount
            ? 'This recovery file contains ' +
              unboundCount +
              ' older payment(s) that are not bound to an account. Importing will bind them to ' +
              accountName +
              ' on this server. Continue only if you verified these records belong to ' +
              'this account. Matching IDs are checked before import.'
            : 'Restore ' +
              payload.records.length +
              ' payment(s) for ' +
              accountName +
              ' to this device? Matching queued IDs will be skipped. Restored payments ' +
              'remain pending until you retry synchronization.';
          const confirmed = confirm(confirmation);

          if (!confirmed) return;
          if (!S.token || queueOwnerKey() !== ownerKey) {
            throw new Error(
              'The signed-in account changed. Sign in and retry the recovery import.',
            );
          }

          const result = await offlineQueue.restore(validation.records, ownerKey);
          await showBanner();
          announceOutboxChange('changed');
          toast(
            result.added +
              ' payment(s) restored; ' +
              result.skipped +
              ' matching item(s) already queued and skipped. Review before syncing.',
            'ok',
          );
        } catch (error) {
          toast(error.message || 'Could not restore this recovery file.', 'err');
        }
      },
      { once: true },
    );

    document.body.appendChild(input);
    input.click();
  }

  async function discardFailedOutbox(clientId) {
    if (flushing) {
      toast('Wait for the current upload to finish.', 'err');
      return;
    }

    const ownerKey = queueOwnerKey();
    if (!ownerKey) return toast('Sign in before removing a rejected entry.', 'err');

    try {
      const records = await offlineQueue.list();
      const selected = records.find(
        (record) =>
          record.clientId === clientId &&
          record.status === 'failed' &&
          record.ownerKey === ownerKey,
      );
      if (!selected) {
        toast(
          'That rejected entry is no longer available for this account. Refresh and retry.',
          'err',
        );
        await showBanner();
        return;
      }

      // Always export the current queue before permitting this destructive action.
      const exported = await exportOutbox();
      if (!exported) return;
      if (
        !confirm(
          'A recovery file was downloaded. Remove only this rejected entry from this device? ' +
            'The exported file is needed if you want to correct and restore it later.',
        )
      ) {
        return;
      }
      if (!S.token || queueOwnerKey() !== ownerKey) {
        toast('The signed-in account changed. Sign in again before removing this entry.', 'err');
        await showBanner();
        return;
      }

      const removed = await offlineQueue.discardFailed(clientId, ownerKey);
      if (!removed) {
        toast(
          'The rejected entry changed before it could be removed. Nothing else was cleared.',
          'err',
        );
        await showBanner();
        return;
      }

      announceOutboxChange('changed');
      await showBanner();
      toast(
        'Rejected entry removed from this device. Keep the recovery file until it is no longer needed.',
        'ok',
      );
    } catch (error) {
      fail(error);
    }
  }

  async function discardOutbox() {
    if (flushing) {
      toast('Wait for the current upload to finish.', 'err');
      return;
    }

    const ownerKey = queueOwnerKey();
    if (!ownerKey) return toast('Sign in before discarding pending payments.', 'err');

    try {
      const records = await offlineQueue.list();
      const ownedCount = records.filter(
        (record) => String(record.ownerKey || '') === ownerKey,
      ).length;
      const unboundCount = records.filter((record) => !String(record.ownerKey || '')).length;
      if (!ownedCount) {
        toast(
          unboundCount
            ? 'Older payments are not bound to an account and were preserved. ' +
                'Export or explicitly restore them to confirm ownership.'
            : 'There are no pending payments for this account to discard.',
          unboundCount ? 'err' : 'ok',
        );
        return;
      }

      const message =
        'Discard ' +
        ownedCount +
        ' payment(s) bound to this account? Items belonging to other accounts and older ' +
        'unbound payments will be kept. This cannot be undone.';

      if (confirm(message)) {
        await offlineQueue.clear(ownerKey);
        announceOutboxChange('changed');
        await showBanner();
      }
    } catch (error) {
      fail(error);
    }
  }

  window.addEventListener('online', async () => {
    // An existing server session can be offline-fallback state; revalidate it before queue sync.
    if (S.offlineMode) {
      if (!S.token || !queueOwnerKey()) {
        await showBanner();
        return;
      }
      await refresh(true);
      if (S.offlineMode || !S.token) return showBanner();
    }
    await flushOutbox();
  });

  return {
    open,
    newAgain,
    addRow,
    savePayee,
    clearReceipt,
    removeRow,
    showBanner,
    flushOutbox,
    exportOutbox,
    importOutbox,
    discardOutbox,
    discardFailedOutbox,
    disposePreviews: disposeReceiptPreviews,
  };
}
