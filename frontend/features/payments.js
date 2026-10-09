import { $, $$ } from '../core/dom.js';
import { catOpts, vendorList } from '../core/form-options.js';
import { offlineQueue } from '../core/offline-queue.js';
import { S, vno } from '../core/state.js';
import { busy, fail, head, toast } from '../core/ui.js';
import { addDays, compress, esc, money, parseAmt, today, uid } from '../core/utils.js';

export function createPayments({ api, refresh }) {
  let NT = 'PAYMENT';
  let flushing = false;

  function rowHtml() {
    return `<div class="erow"><div class="top"><input class="rv" list="vlist" placeholder="${NT === 'RECEIPT' ? 'Received from' : 'Paid to (vendor)'}" autocapitalize="words"><input class="ra" inputmode="decimal" placeholder="Amount ₹"><button type="button" class="x" data-act="delrow" title="Remove">✕</button></div>
  <div class="bot"><select class="rc">${catOpts('Other', NT)}</select><input class="rn" placeholder="Note (optional)"></div>
  <div class="chips"><label class="btn sm" style="margin:0">📷 Receipt<input type="file" class="rf" accept="image/*" multiple hidden></label><span class="rp"></span></div></div>`;
  }

  function vNew() {
    $('#view').innerHTML =
      head(NT === 'RECEIPT' ? 'Cash Received' : 'New Cash Payment') +
      `<div class="seg"><button type="button" data-act="ntype" data-k="PAYMENT" class="${NT === 'PAYMENT' ? 'on' : ''}">💸 Payment out</button><button type="button" data-act="ntype" data-k="RECEIPT" class="${NT === 'RECEIPT' ? 'on' : ''}">💰 Cash received</button></div><form id="nf" class="card" autocomplete="off">${vendorList()}
    <label style="max-width:220px">Date<input type="date" id="nd" value="${today()}" max="${addDays(today(), 1)}" required></label><div id="rows"></div>
    <div class="actions"><button type="button" class="btn" data-act="addrow">+ Add another</button><button class="btn primary" id="nsave">Save payments</button></div>
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
    const v = $('.rv', r);
    if ($$('#rows .erow').length > 1) v.focus();
  }

  function clearReceipt(button) {
    const row = button.closest('.erow');
    row._rec = [];
    $('.rp', row).innerHTML = '';
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

    $('.rp', row).innerHTML =
      row._rec.map((r) => `<img class="thumb" src="${r.preview}" alt="receipt">`).join('') +
      (row._rec.length
        ? ` <button type="button" class="btn sm" data-act="clrrec">Clear</button>`
        : '');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('ra')) {
      e.preventDefault();
      const rows = $$('#rows .erow');
      if (e.target.closest('.erow') === rows[rows.length - 1]) addRow();
      else $('.rv', rows[rows.indexOf(e.target.closest('.erow')) + 1]).focus();
    }
  });

  async function saveNew(btn) {
    const date = $('#nd').value;
    const entries = [];

    for (const r of $$('#rows .erow')) {
      const vendor = $('.rv', r).value.trim();
      const raw = $('.ra', r).value.trim();
      const amount = parseAmt(raw);

      if (!vendor && !raw && !r._rec.length) continue;
      if (!vendor) return toast('Vendor is required in every row.', 'err');
      if (!(amount > 0)) return toast('Enter a valid amount for ' + vendor + '.', 'err');

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

    if (!date) return toast('Date is required.', 'err');
    if (!entries.length) return toast('Add at least one payment.', 'err');

    await busy(btn, async () => {
      try {
        const d = await api('createVouchers', { entries });
        d.created.forEach((c) => {
          if (!S.vouchers.find((v) => v.id === c.id)) S.vouchers.push(c);
        });
        $('#nf').classList.add('hidden');
        $('#nres').innerHTML =
          `<div class="card ok-panel"><h2>✔ Saved ${d.created.length} payment${d.created.length > 1 ? 's' : ''}</h2>${d.created.map((c) => `<div style="margin:8px 0">#${vno(c)} · ${esc(c.vendor)} · <b>${money(c.amount)}</b> <button class="btn sm" data-act="print" data-id="${c.id}">Print</button></div>`).join('')}<div class="actions"><button class="btn primary" data-act="newagain">New payment</button></div></div>`;
      } catch (e) {
        if (e.code !== 'NET') return fail(e);
        if (!(await queue(entries))) return;
        $('#nf').classList.add('hidden');
        $('#nres').innerHTML =
          `<div class="card ok-panel"><h2>📴 Saved on this device</h2><p>You're offline. These ${entries.length} payment(s) will upload automatically when you're back online.</p><div class="actions"><button class="btn primary" data-act="newagain">New payment</button></div></div>`;
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
      b.innerHTML = `<span>📤 ${n} payment${n > 1 ? 's' : ''} waiting to upload${errMsg ? ' — ' + esc(errMsg) : ''}</span><button class="btn sm" data-act="flush">Retry now</button><button class="btn sm" data-act="export-pending">Export</button><button class="btn sm danger" data-act="discard">Discard</button>`;
    } catch (error) {
      b.className = 'banner err';
      b.innerHTML = `<span>⚠️ Offline storage is unavailable. Reconnect before saving unsynced payments.</span>`;
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
      } catch (error) {
        await offlineQueue.release(clientIds, owner);
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

  function discardOutbox() {
    if (flushing) {
      toast('Wait for the current upload to finish.', 'err');
      return;
    }

    if (confirm('Discard all payments waiting to upload? This cannot be undone.')) {
      offlineQueue.clear().then(showBanner).catch(fail);
    }
  }

  window.addEventListener('online', () => flushOutbox());

  return {
    open,
    addRow,
    clearReceipt,
    showBanner,
    flushOutbox,
    exportOutbox,
    discardOutbox,
  };
}
