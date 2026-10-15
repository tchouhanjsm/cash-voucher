import { $, $$ } from '../core/dom.js';
import { catOpts, vendorList } from '../core/form-options.js';
import { offlineQueue } from '../core/offline-queue.js';
import { CASH_IMPACT_CHOICES, S, suggestCashImpact, vno } from '../core/state.js';
import { busy, fail, head, toast } from '../core/ui.js';
import { addDays, compress, esc, money, parseAmt, scalarText, today, uid } from '../core/utils.js';
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
    if (['VALIDATION', 'CONFLICT'].includes(String(error?.code || ''))) return true;
    return error?.code === 'SERVER' && /^\[\d+\]\s/.test(String(error?.message || ''));
  }

  outboxChannel?.addEventListener('message', (event) => {
    if (!['changed', 'queued'].includes(event.data?.type)) return;

    showBanner();

    if (event.data.type === 'queued' && navigator.onLine) {
      flushOutbox();
    }
  });

  function cashImpactOptions(selected) {
    const labels = {
      CASH_IN: 'CASH_IN — physical cash enters the drawer',
      CASH_OUT: 'CASH_OUT — physical cash leaves the drawer',
      NO_CASH: 'NO_CASH — no physical drawer movement',
    };
    const placeholder = selected
      ? ''
      : `<option value='' selected disabled>Choose cash impact…</option>`;
    return (
      placeholder +
      CASH_IMPACT_CHOICES.map(
        (value) =>
          `<option value='${value}'${value === selected ? ' selected' : ''}>${labels[value]}</option>`,
      ).join('')
    );
  }

  function rowHtml() {
    const suggested = suggestCashImpact(NT, 'Other');
    return `<div class='erow'><div class='top'><input class='rv' list='vlist' placeholder='${NT === 'RECEIPT' ? 'Received from' : 'Paid to (vendor)'}' autocapitalize='words'><input class='ra' inputmode='decimal' placeholder='Amount ₹'><button type='button' class='x' data-act='delrow' title='Remove'>✕</button></div>
  <div class='bot'><select class='rc'>${catOpts('Other', NT)}</select><input class='rn' placeholder='Note (optional)'></div>
  <label class='cash-impact-control'>Cash impact (required)<select class='rci'>${cashImpactOptions('')}</select></label>
  <p class='muted ci-hint'>Suggested only: <span class='ci-suggestion'>${suggested}</span>. Verify physical notes/coins movement; UPI, card, or bank transfer uses NO_CASH.</p>
  <div class='chips'><label class='btn sm' style='margin:0'>📷 Receipt<input type='file' class='rf' accept='image/*' multiple hidden></label><span class='rp'></span></div></div>`;
  }

  function labelRows() {
    const direction = NT === 'RECEIPT' ? 'Cash received from' : 'Payee / vendor';

    $$('#rows .erow').forEach((row, index) => {
      const number = index + 1;
      $('.rv', row).setAttribute('aria-label', `${direction}, row ${number}`);
      $('.ra', row).setAttribute('aria-label', `Amount in rupees, row ${number}`);
      $('.rc', row).setAttribute('aria-label', `Category, row ${number}`);
      $('.rci', row).setAttribute('aria-label', `Cash impact, row ${number}`);
      $('.rn', row).setAttribute('aria-label', `Note, row ${number}`);
      $('.rf', row).setAttribute('aria-label', `Receipt images, row ${number}`);
      $('[data-act="delrow"]', row).setAttribute('aria-label', `Remove row ${number}`);
    });
  }

  function clearRowError(row) {
    $('.row-error', row)?.remove();

    ['.rv', '.ra', '.rci'].forEach((selector) => {
      const field = $(selector, row);
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
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
    field.setAttribute('aria-describedby', error.id);
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
    if (target) $('.rv', target).focus();
  }

  function entryNoun(count = 1) {
    if (NT === 'RECEIPT') return count === 1 ? 'cash receipt' : 'cash receipts';
    return count === 1 ? 'payment' : 'payments';
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

  function vNew() {
    $('#view').innerHTML =
      head(NT === 'RECEIPT' ? 'Cash Received' : 'New Cash Payment') +
      `<div class="seg"><button type="button" data-act="ntype" data-k="PAYMENT" class="${NT === 'PAYMENT' ? 'on' : ''}">💸 Payment out</button><button type="button" data-act="ntype" data-k="RECEIPT" class="${NT === 'RECEIPT' ? 'on' : ''}">💰 Cash received</button></div><form id="nf" class="card" autocomplete="off">${vendorList()}
    <label style="max-width:220px">Date<input type="date" id="nd" value="${today()}" max="${addDays(today(), 1)}" required></label><div id="rows"></div>
    <div class="actions"><button type="button" class="btn" data-act="addrow">+ Add another</button><button class="btn primary" id="nsave">Save ${NT === 'RECEIPT' ? 'cash receipt' : 'payment'}</button><button type="button" class="btn" data-act="import-pending">Import recovery file</button></div>
    <p class="muted">Tip: tap “Receipt” to take a photo or pick a screenshot (up to 3 per payment).</p></form><div id="nres"></div>`;
    addRow();
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
    const row = event.target.closest('.erow');
    if (!row) return;
    if (event.target.matches('.rci')) {
      row.dataset.cashImpactChosen = 'true';
      clearRowError(row);
      return;
    }
    if (event.target.matches('.rc')) {
      $('.ci-suggestion', row).textContent = suggestCashImpact(NT, event.target.value);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('ra')) {
      e.preventDefault();
      const rows = $$('#rows .erow');
      if (e.target.closest('.erow') === rows[rows.length - 1]) addRow();
      else $('.rv', rows[rows.indexOf(e.target.closest('.erow')) + 1]).focus();
    }
  });

  document.addEventListener('input', (event) => {
    if (!event.target.matches('.rv, .ra')) return;

    const row = event.target.closest('.erow');
    if (row) clearRowError(row);
    $('#nres .form-error')?.remove();
    updateSaveLabel();
  });

  async function saveNew(btn) {
    const date = $('#nd').value;
    const entries = [];
    const rows = $$('#rows .erow');
    rows.forEach(clearRowError);

    for (const r of rows) {
      const vendor = $('.rv', r).value.trim();
      const raw = $('.ra', r).value.trim();
      const amount = parseAmt(raw);

      if (!vendor && !raw && !r._rec.length) continue;
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

      const cashImpact = $('.rci', r).value;
      if (!CASH_IMPACT_CHOICES.includes(cashImpact)) {
        showRowError(r, $('.rci', r), 'Choose a cash-impact classification before saving.');
        return;
      }

      entries.push({
        clientId: r._cid || (r._cid = uid()),
        date,
        type: NT,
        vendor,
        amount,
        category: $('.rc', r).value,
        cashImpact,
        notes: $('.rn', r).value.trim(),
        receipts: r._rec.map((x) => ({ mime: x.mime, data: x.data })),
      });
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
        $('#nres').innerHTML =
          `<div class="card ok-panel" role="status" aria-live="polite"><h2>📴 Saved on this device</h2><p>${esc(message)}</p><div class="actions"><button class="btn primary" data-act="newagain">New ${NT === 'RECEIPT' ? 'cash receipt' : 'payment'}</button></div></div>`;
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
        const d = await api('createVouchers', { entries });
        d.created.forEach((c) => {
          if (!S.vouchers.find((v) => v.id === c.id)) S.vouchers.push(c);
        });
        const pendingApprovalCount = d.created.filter(
          (voucher) => voucher.approvalStatus === 'PENDING',
        ).length;
        disposeReceiptPreviews();
        $('#nf').classList.add('hidden');
        $('#nres').innerHTML =
          `<div class="card ok-panel" role="status" aria-live="polite"><h2>✔ Saved ${d.created.length} ${entryNoun(d.created.length)}</h2>${pendingApprovalCount ? `<p role="status">${pendingApprovalCount} payment(s) are pending owner/manager approval. They are excluded from approved totals and Daily Cash Close until approved by someone other than the creator.</p>` : ''}${d.created.map((c) => `<div style="margin:8px 0">#${esc(vno(c))} · ${esc(c.vendor)} · <b>${money(c.amount)}</b> <button class="btn sm" data-act="print" data-id="${esc(c.id)}">Print</button></div>`).join('')}<div class="actions"><button class="btn primary" data-act="newagain">New ${NT === 'RECEIPT' ? 'cash receipt' : 'payment'}</button></div></div>`;
      } catch (e) {
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
      const failedDetails = failed
        .slice(0, 5)
        .map((record) => {
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
          const removeAction = clientId
            ? ' <button class="btn sm danger" data-act="discard-failed" data-id="' +
              esc(clientId) +
              '">Export &amp; remove</button>'
            : '';

          return (
            '<li><b>' +
            esc(kind + displayScalar(entry.vendor, 'Unnamed entry')) +
            '</b> — ₹' +
            esc(displayScalar(entry.amount, 'unknown')) +
            ': ' +
            esc(displayScalar(record.failure, 'Rejected by server')) +
            removeAction +
            '</li>'
          );
        })
        .join('');
      const failedReview = failedDetails
        ? '<details class="outbox-failures"><summary>Review rejected entries</summary><p class="muted">Export a recovery copy before removing an entry. Removed entries are no longer stored on this device.</p><ul>' +
          failedDetails +
          (failed.length > 5
            ? '<li>+' + (failed.length - 5) + ' more; export the queue for full details.</li>'
            : '') +
          '</ul></details>'
        : '';
      const pendingDetails = pending
        .slice(0, 5)
        .map((record) => {
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

          return (
            '<li><b>' +
            esc(kind + ': ' + vendor) +
            '</b> — ' +
            esc(amount) +
            ' · ' +
            esc(date) +
            ' · ' +
            status +
            esc(receiptLabel) +
            '</li>'
          );
        })
        .join('');
      const pendingReview = pendingDetails
        ? '<details class="outbox-pending"><summary>Review queued entries</summary><p class="muted">These entries are stored on this device and are not confirmed on the server yet. Do not re-enter them just because they have not uploaded.</p><ul>' +
          pendingDetails +
          (pending.length > 5
            ? '<li>+' +
              (pending.length - 5) +
              ' more; export the queue to inspect all queued entries.</li>'
            : '') +
          '</ul></details>'
        : '';
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
      b.innerHTML =
        '<span>' +
        messages.map((message) => esc(message)).join('<br>') +
        '</span>' +
        pendingReview +
        failedReview +
        (pending.length && S.token
          ? '<button class="btn sm" data-act="flush">Retry now</button>'
          : '') +
        (visible.length ? '<button class="btn sm" data-act="export-pending">Export</button>' : '') +
        '<button class="btn sm" data-act="import-pending">Import</button>' +
        (S.offlineMode && !S.token
          ? '<button class="btn sm" data-act="reconnect-signin">Sign in to sync</button>'
          : '') +
        (owned.length
          ? '<button class="btn sm danger" data-act="discard">Clear my queued entries</button>'
          : '');
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
      link.download = 'cash-vouchers-pending-' + today() + '.json';
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
            addDays(today(), 1),
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
