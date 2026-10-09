import { $, $$ } from '../core/dom.js';
import { catOpts, vendorList } from '../core/form-options.js';
import { offlineQueue } from '../core/offline-queue.js';
import { S, vno } from '../core/state.js';
import { busy, fail, head, toast } from '../core/ui.js';
import { addDays, compress, esc, money, parseAmt, today, uid } from '../core/utils.js';

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

  outboxChannel?.addEventListener('message', (event) => {
    if (!['changed', 'queued'].includes(event.data?.type)) return;

    showBanner();

    if (event.data.type === 'queued' && navigator.onLine) {
      flushOutbox();
    }
  });

  function rowHtml() {
    return `<div class="erow"><div class="top"><input class="rv" list="vlist" placeholder="${NT === 'RECEIPT' ? 'Received from' : 'Paid to (vendor)'}" autocapitalize="words"><input class="ra" inputmode="decimal" placeholder="Amount ₹"><button type="button" class="x" data-act="delrow" title="Remove">✕</button></div>
  <div class="bot"><select class="rc">${catOpts('Other', NT)}</select><input class="rn" placeholder="Note (optional)"></div>
  <div class="chips"><label class="btn sm" style="margin:0">📷 Receipt<input type="file" class="rf" accept="image/*" multiple hidden></label><span class="rp"></span></div></div>`;
  }

  function labelRows() {
    const direction = NT === 'RECEIPT' ? 'Cash received from' : 'Payee / vendor';

    $$('#rows .erow').forEach((row, index) => {
      const number = index + 1;
      $('.rv', row).setAttribute('aria-label', `${direction}, row ${number}`);
      $('.ra', row).setAttribute('aria-label', `Amount in rupees, row ${number}`);
      $('.rc', row).setAttribute('aria-label', `Category, row ${number}`);
      $('.rn', row).setAttribute('aria-label', `Note, row ${number}`);
      $('.rf', row).setAttribute('aria-label', `Receipt images, row ${number}`);
      $('[data-act="delrow"]', row).setAttribute('aria-label', `Remove row ${number}`);
    });
  }

  function clearRowError(row) {
    $('.row-error', row)?.remove();

    ['.rv', '.ra'].forEach((selector) => {
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
    $('#nres').innerHTML = `<p class="error form-error" role="alert">${esc(message)}</p>`;
    const firstRow = $$('#rows .erow')[0];
    if (firstRow) $('.rv', firstRow).focus();
  }

  function removeRow(button) {
    const rows = $$('#rows .erow');
    if (rows.length <= 1) return;

    const row = button.closest('.erow');
    const target = row?.previousElementSibling || row?.nextElementSibling;
    if (!row) return;
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
    const count = $('#rows .erow').filter((row) =>
      $('.rv', row).value.trim() || $('.ra', row).value.trim() || row._rec.length,
    ).length;
    const button = $('#nsave');
    if (button) button.textContent = 'Save ' + entryNoun(count === 1 ? 1 : 2);
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
    NT = type;
    vNew();
  }

  function addRow() {
    const d = document.createElement('div');
    d.innerHTML = rowHtml();
    const r = d.firstElementChild;
    r._rec = [];
    $('#rows').appendChild(r);
    $('#nres').querySelector('.form-error')?.remove();
    labelRows();
    updateSaveLabel();
    const v = $('.rv', r);
    if ($$('#rows .erow').length > 1) v.focus();
  }

  function clearReceipt(button) {
    const row = button.closest('.erow');
    row._rec = [];
    $('.rp', row).replaceChildren();
    updateSaveLabel();
  }

  document.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('rf')) return;
    const row = e.target.closest('.erow');
    const files = [...e.target.files];
    e.target.value = '';

    for (const file of files) {
      if (row._rec.length >= 3) {
        toast('Maximum 3 receipts per payment.', 'err');
        break;
      }
      try {
        row._rec.push(await compress(file));
      } catch (error) {
        fail(error);
      }
    }

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

      entries.push({
        clientId: r._cid || (r._cid = uid()),
        date,
        type: NT,
        vendor,
        amount,
        category: $('.rc', r).value,
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
      try {
        const d = await api('createVouchers', { entries });
        d.created.forEach((c) => {
          if (!S.vouchers.find((v) => v.id === c.id)) S.vouchers.push(c);
        });
        $('#nf').classList.add('hidden');
        $('#nres').innerHTML =
          `<div class="card ok-panel" role="status" aria-live="polite"><h2>✔ Saved ${d.created.length} ${entryNoun(d.created.length)}</h2>${d.created.map((c) => `<div style="margin:8px 0">#${vno(c)} · ${esc(c.vendor)} · <b>${money(c.amount)}</b> <button class="btn sm" data-act="print" data-id="${esc(c.id)}">Print</button></div>`).join('')}<div class="actions"><button class="btn primary" data-act="newagain">New ${NT === 'RECEIPT' ? 'cash receipt' : 'payment'}</button></div></div>`;
      } catch (e) {
        if (e.code !== 'NET') return fail(e);
        if (!(await queue(entries))) return;
        $('#nf').classList.add('hidden');
        $('#nres').innerHTML =
          `<div class="card ok-panel" role="status" aria-live="polite"><h2>📴 Saved on this device</h2><p>You're offline. These ${entries.length} ${entryNoun(entries.length)} will upload automatically when you're back online.</p><div class="actions"><button class="btn primary" data-act="newagain">New ${NT === 'RECEIPT' ? 'cash receipt' : 'payment'}</button></div></div>`;
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
      await offlineQueue.enqueue(entries);
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
      const records = await offlineQueue.list();
      const n = records.length;

      if (!n) return b.classList.add('hidden');

      b.className = 'banner' + (errMsg ? ' err' : '');
      b.innerHTML = `<span>📤 ${n} payment${n > 1 ? 's' : ''} waiting to upload${errMsg ? ' — ' + esc(errMsg) : ''}</span><button class="btn sm" data-act="flush">Retry now</button><button class="btn sm" data-act="export-pending">Export</button><button class="btn sm" data-act="import-pending">Import</button><button class="btn sm danger" data-act="discard">Discard</button>`;
    } catch (error) {
      b.className = 'banner err';
      const message =
        error.message ||
        'Offline storage is unavailable. Reconnect before saving unsynced payments.';
      b.innerHTML = `<span>⚠️ ${esc(message)}</span>`;
      console.error('Offline queue unavailable:', error);
    }
  }

  async function flushOutbox() {
    if (flushing || !S.token) return showBanner();
    flushing = true;

    try {
      await offlineQueue.ready();
      const owner = uid();
      const records = await offlineQueue.claim(10, owner);

      if (!records.length) {
        await showBanner();
        return;
      }

      const clientIds = records.map((record) => record.clientId);
      const entries = records.map((record) => record.entry);

      try {
        await api('createVouchers', { entries });
        await offlineQueue.ack(clientIds, owner);
        announceOutboxChange('changed');
      } catch (error) {
        await offlineQueue.release(clientIds, owner);
        announceOutboxChange('changed');
        throw error;
      }

      toast('Offline payments uploaded.', 'ok');
      await showBanner();
      await refresh(true);
    } catch (error) {
      await showBanner(error.code === 'NET' ? 'Connection to server was lost.' : error.message);
    } finally {
      flushing = false;
    }
  }

  async function exportOutbox() {
    try {
      const records = await offlineQueue.list();

      if (!records.length) {
        toast('There are no pending payments to export.', 'ok');
        return;
      }

      const payload = {
        format: 'cash-voucher.pending',
        version: 1,
        exportedAt: new Date().toISOString(),
        records: records.map((record) => ({
          clientId: record.clientId,
          status: record.status,
          attempts: record.attempts,
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
      toast('Pending payments exported. Keep the file secure.', 'ok');
    } catch (error) {
      fail(error);
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

          if (!payload.records.length) {
            throw new Error('Recovery file contains no pending payments.');
          }

          if (payload.records.length > 500) {
            throw new Error('Recovery file exceeds the 500-payment limit.');
          }

          const ids = new Set();

          payload.records.forEach((record) => {
            const clientId = String(record?.clientId || '').trim();
            const entry = record?.entry;

            if (
              !clientId ||
              clientId.length > 60 ||
              [...clientId].some((character) => {
                const code = character.charCodeAt(0);
                return code <= 31 || code === 127;
              })
            ) {
              throw new Error('Recovery file contains an invalid payment ID.');
            }

            if (ids.has(clientId)) {
              throw new Error('Recovery file contains duplicate payment IDs.');
            }
            ids.add(clientId);

            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              throw new Error('Recovery file contains a payment with invalid details.');
            }

            if (String(entry.clientId || '').trim() !== clientId) {
              throw new Error('Recovery file payment IDs do not match their details.');
            }

            const dateText = String(entry.date || '');
            const parsedDate = new Date(dateText + 'T00:00:00Z');
            const dateShapeValid =
              dateText.length === 10 &&
              dateText[4] === '-' &&
              dateText[7] === '-' &&
              [...dateText.slice(0, 4), ...dateText.slice(5, 7), ...dateText.slice(8)].every(
                (character) => character >= '0' && character <= '9',
              );
            if (
              !dateShapeValid ||
              dateText < '2000-01-01' ||
              dateText > addDays(today(), 1) ||
              Number.isNaN(parsedDate.getTime()) ||
              parsedDate.toISOString().slice(0, 10) !== dateText
            ) {
              throw new Error('Recovery file contains an invalid payment date.');
            }

            if (
              !['PAYMENT', 'RECEIPT'].includes(entry.type) ||
              typeof entry.vendor !== 'string' ||
              !entry.vendor.trim() ||
              entry.vendor.length > 200
            ) {
              throw new Error('Recovery file contains an invalid payment type or vendor.');
            }

            const amount = Number(entry.amount);
            if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
              throw new Error('Recovery file contains an invalid payment amount.');
            }

            const receipts = entry.receipts === undefined ? [] : entry.receipts;
            if (!Array.isArray(receipts) || receipts.length > 3) {
              throw new Error('Recovery file contains an invalid receipt list.');
            }

            receipts.forEach((receipt) => {
              if (
                !receipt ||
                !['image/jpeg', 'image/png', 'image/webp'].includes(String(receipt.mime || '')) ||
                typeof receipt.data !== 'string' ||
                receipt.data.length === 0 ||
                receipt.data.length > 2200000 ||
                !/^[A-Za-z0-9+/]+={0,2}$/.test(receipt.data)
              ) {
                throw new Error('Recovery file contains an invalid or oversized receipt.');
              }
            });
          });

          const confirmed = confirm(
            'Restore ' +
              payload.records.length +
              ' payment(s) to this device? Matching queued IDs will be skipped. ' +
              'Restored payments remain pending until you retry synchronization.',
          );

          if (!confirmed) return;

          const result = await offlineQueue.restore(payload.records);
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

  function discardOutbox() {
    if (flushing) {
      toast('Wait for the current upload to finish.', 'err');
      return;
    }

    if (confirm('Discard all payments waiting to upload? This cannot be undone.')) {
      offlineQueue
        .clear()
        .then(() => {
          announceOutboxChange('changed');
          return showBanner();
        })
        .catch(fail);
    }
  }

  window.addEventListener('online', () => flushOutbox());

  return {
    open,
    addRow,
    clearReceipt,
    removeRow,
    showBanner,
    flushOutbox,
    exportOutbox,
    importOutbox,
    discardOutbox,
  };
}
