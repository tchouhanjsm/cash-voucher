import { $ } from '../core/dom.js';
import { can } from '../core/state.js';
import { csvCell, dmy, download, esc, money, today } from '../core/utils.js';
import { head, toast } from '../core/ui.js';

export function createReports({ api }) {
  const R = { from: today().slice(0, 7) + '-01', to: today(), type: 'ALL', status: 'ACTIVE', rows: [], summary: null, error: '', loading: false };

  function render() {
    if (!can('viewAll')) {
      $('#view').innerHTML = head('Recorded Movement Report') + '<div class="card"><p>Reports are available to managers and owners only.</p></div>';
      return;
    }
    const s = R.summary;
    $('#view').innerHTML = head('Recorded Movement Report') + `
      <div class="card">
        <p class="muted">Recorded voucher movement only. This report does not establish physical cash, profit, bank balance or tax liability.</p>
        <form id="movementFilters" class="filters" autocomplete="off">
          <label>From<input id="movementFrom" type="date" value="${esc(R.from)}" required></label>
          <label>To<input id="movementTo" type="date" value="${esc(R.to)}" required></label>
          <label>Type<select id="movementType"><option value="ALL"${R.type === 'ALL' ? ' selected' : ''}>Payments and receipts</option><option value="PAYMENT"${R.type === 'PAYMENT' ? ' selected' : ''}>Payments only</option><option value="RECEIPT"${R.type === 'RECEIPT' ? ' selected' : ''}>Receipts only</option></select></label>
          <label>Status<select id="movementStatus"><option value="ACTIVE"${R.status === 'ACTIVE' ? ' selected' : ''}>Active only</option><option value="CANCELLED"${R.status === 'CANCELLED' ? ' selected' : ''}>Cancelled only</option><option value="ALL"${R.status === 'ALL' ? ' selected' : ''}>All statuses</option></select></label>
          <button class="btn primary" type="submit" ${R.loading ? 'disabled' : ''}>${R.loading ? 'Loading…' : 'Run report'}</button>
          <button class="btn" type="button" data-act="reportCsv" ${R.summary ? '' : 'disabled'}>Export CSV</button>
        </form>
      </div>
      ${R.error ? `<div class="card form-error" role="alert">${esc(R.error)} <button class="btn sm" type="button" data-act="reportRun">Retry</button></div>` : ''}
      ${s ? `
        <div class="stats">
          <div class="card stat"><span>Selected payment total</span><b>${money(s.paymentTotal)}</b><small class="muted">${s.count} rows · ${s.activeCount} active · ${s.cancelledCount} cancelled</small></div>
          <div class="card stat"><span>Selected receipt total</span><b>${money(s.receiptTotal)}</b><small class="muted">Includes cancelled rows when selected</small></div>
          <div class="card stat"><span>Active payments</span><b>${money(s.activePaymentTotal)}</b><small class="muted">Cancelled rows excluded</small></div>
          <div class="card stat"><span>Active receipts</span><b>${money(s.activeReceiptTotal)}</b><small class="muted">Cancelled rows excluded</small></div>
        </div>
        <div class="card">
          <h2>Source vouchers <span class="muted">${dmy(R.from)} – ${dmy(R.to)}</span></h2>
          <p class="muted">Generated ${esc(s.generatedAt)} · ${s.count} rows · Type: ${esc(s.type)} · Status: ${esc(s.status)}</p>
          ${R.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Counterparty</th><th>Category / notes</th><th>Status</th><th class="r">Amount</th></tr></thead><tbody>${R.rows.map((item) => `<tr><td class="nw">${esc(dmy(item.date))}</td><td class="nw">${esc(item.type === 'RECEIPT' ? 'R-' : '')}${esc(item.voucherNo)}</td><td>${esc(item.type)}</td><td>${esc(item.vendor)}</td><td>${esc(item.category)}${item.notes ? ' · ' + esc(item.notes) : ''}${item.cancelReason ? '<div class="muted">Cancellation: ' + esc(item.cancelReason) + '</div>' : ''}</td><td>${esc(item.status)}</td><td class="r nw amt">${money(item.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No vouchers match these filters.</p>'}
        </div>
      ` : (!R.loading && !R.error ? '<div class="card"><p class="muted">Run the report to see recorded voucher movements.</p></div>' : '')}
    `;
    $('#movementFilters')?.addEventListener('submit', (event) => {
      event.preventDefault();
      R.from = $('#movementFrom').value; R.to = $('#movementTo').value;
      R.type = $('#movementType').value; R.status = $('#movementStatus').value;
      load();
    });
  }

  async function load() {
    if (!can('viewAll')) return render();
    if (!R.from || !R.to || R.from > R.to) { R.error = 'Choose a valid date range (From must not be after To).'; render(); return; }
    R.loading = true; R.error = ''; render();
    try {
      R.summary = await api('recordedMovementReport', { from: R.from, to: R.to, type: R.type, status: R.status });
      R.rows = R.summary.items || [];
    } catch (error) {
      R.error = error.message || 'The report could not be loaded.';
    } finally {
      R.loading = false; render();
    }
  }

  function exportCsv() {
    if (!R.summary) return;
    const fields = ['date', 'voucherNo', 'type', 'vendor', 'category', 'notes', 'amount', 'status', 'cancelReason', 'createdBy', 'id'];
    const rows = [fields, ...R.rows.map((item) => fields.map((field) => item[field] ?? ''))];
    download(`recorded-movement-${R.from}-to-${R.to}.csv`, rows.map((row) => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    toast('Report CSV downloaded.', 'ok');
  }

  return { render, load, exportCsv };
}
