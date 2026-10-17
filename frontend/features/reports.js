import { $ } from '../core/dom.js';
import { can, S } from '../core/state.js';
import { csvCell, dmy, download, esc, finiteAmount, money, today } from '../core/utils.js';
import { emptyState, head, pageNotice, tableView, toast } from '../core/ui.js';

export function createReports({ api }) {
  const R = {
    from: today().slice(0, 7) + '-01',
    to: today(),
    type: 'ALL',
    status: 'ACTIVE',
    rows: [],
    summary: null,
    invalidRowCount: 0,
    error: '',
    dateRangeInvalid: false,
    loading: false,
  };
  let activeReportRequestId = 0;

  const scalarText = (value) =>
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
      ? String(value)
      : '';

  const isValidSummaryCount = (value) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

  const hasPositiveCount = (value) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0;

  function normalizeRow(item) {
    const fields = [
      'date',
      'voucherNo',
      'type',
      'vendor',
      'vendorId',
      'category',
      'notes',
      'status',
      'cancelReason',
      'approvalStatus',
      'approvedBy',
      'approvedAt',
      'approvalReason',
      'createdBy',
      'id',
    ];
    const row = Object.fromEntries(fields.map((field) => [field, scalarText(item[field])]));
    row.amount = finiteAmount(item.amount) === null ? '' : item.amount;
    return row;
  }

  function renderRows() {
    const rows = R.rows
      .map(
        (item) => `
        <tr>
          <td class="nw">${esc(dmy(scalarText(item.date)))}</td>
          <td class="nw">${esc(scalarText(item.type) === 'RECEIPT' ? 'R-' : '')}${esc(scalarText(item.voucherNo))}</td>
          <td>${esc(scalarText(item.type))}</td>
          <td>${esc(scalarText(item.vendor))}</td>
          <td class="nw"><code>${esc(scalarText(item.vendorId)) || '—'}</code></td>
          <td>
            ${esc(scalarText(item.category))}
            ${scalarText(item.notes) ? ' · ' + esc(scalarText(item.notes)) : ''}
            ${scalarText(item.cancelReason) ? '<div class="muted">Cancellation: ' + esc(scalarText(item.cancelReason)) + '</div>' : ''}
          </td>
          <td>${esc(scalarText(item.status))}</td>
          <td>
            ${esc(scalarText(item.approvalStatus || 'NOT_REQUIRED'))}
            ${scalarText(item.approvedBy) ? '<div class="muted">By ' + esc(scalarText(item.approvedBy)) + '</div>' : ''}
            ${scalarText(item.approvalReason) ? '<div class="muted">Reason: ' + esc(scalarText(item.approvalReason)) + '</div>' : ''}
          </td>
          <td class="r nw amt">${money(item.amount)}</td>
        </tr>
      `,
      )
      .join('');

    return tableView({
      label: 'Recorded voucher movements',
      columns: [
        { label: 'Date', nowrap: true },
        { label: 'Voucher', nowrap: true },
        { label: 'Type' },
        { label: 'Counterparty' },
        { label: 'Vendor ID', nowrap: true },
        { label: 'Category / notes' },
        { label: 'Status' },
        { label: 'Approval' },
        { label: 'Amount', align: 'right', nowrap: true },
      ],
      rows,
      emptyMessage: 'No vouchers match these filters.',
    });
  }

  function render() {
    if (!can('reports')) {
      $('#view').replaceChildren(
        pageNotice('Recorded Movement Report', 'Reports are unavailable for this account.', {
          panelClass: 'card',
        }),
      );
      return;
    }

    const summary = R.summary;
    const filters = `
      <div class="card report-filter-panel">
        <p class="muted report-scope-note">Recorded voucher movement only. This report does not establish physical cash, profit, bank balance or tax liability.</p>
        <form id="movementFilters" class="filters report-filters" autocomplete="off">
          <label>From<input id="movementFrom" type="date" value="${esc(R.from)}" required${R.dateRangeInvalid ? ' aria-invalid="true" aria-describedby="report-date-range-error"' : ''}></label>
          <label>To<input id="movementTo" type="date" value="${esc(R.to)}" required${R.dateRangeInvalid ? ' aria-invalid="true" aria-describedby="report-date-range-error"' : ''}></label>
          <label>Type
            <select id="movementType">
              <option value="ALL"${R.type === 'ALL' ? ' selected' : ''}>Payments and receipts</option>
              <option value="PAYMENT"${R.type === 'PAYMENT' ? ' selected' : ''}>Payments only</option>
              <option value="RECEIPT"${R.type === 'RECEIPT' ? ' selected' : ''}>Receipts only</option>
            </select>
          </label>
          <label>Status
            <select id="movementStatus">
              <option value="ACTIVE"${R.status === 'ACTIVE' ? ' selected' : ''}>Active only</option>
              <option value="CANCELLED"${R.status === 'CANCELLED' ? ' selected' : ''}>Cancelled only</option>
              <option value="ALL"${R.status === 'ALL' ? ' selected' : ''}>All statuses</option>
            </select>
          </label>
          <button class="btn primary" type="submit" ${R.loading ? 'disabled' : ''}>
            ${R.loading ? 'Loading…' : 'Run report'}
          </button>
          <button class="btn" type="button" data-act="reportCsv" ${R.summary ? '' : 'disabled'}>
            Export CSV
          </button>
        </form>
      </div>
    `;

    const error = R.error
      ? `
          <div class="card form-error report-error"${R.dateRangeInvalid ? ' id="report-date-range-error"' : ''} role="alert">
            ${esc(R.error)}
            <button class="btn sm" type="button" data-act="reportRun">Retry</button>
          </div>
        `
      : '';

    let results = '';
    if (summary) {
      results = `
        <div class="stats report-stats">
          <div class="card stat">
            <span>Selected payment total</span>
            <b>${money(summary.paymentTotal)}</b>
            <small class="muted">${esc(scalarText(summary.count))} rows · ${esc(scalarText(summary.activeCount))} active · ${esc(scalarText(summary.cancelledCount))} cancelled</small>
          </div>
          <div class="card stat">
            <span>Selected receipt total</span>
            <b>${money(summary.receiptTotal)}</b>
            <small class="muted">Includes cancelled rows when selected</small>
          </div>
          <div class="card stat">
            <span>Active payments</span>
            <b>${money(summary.activePaymentTotal)}</b>
            <small class="muted">Cancelled rows excluded; pending/rejected approval payments excluded</small>
          </div>
          <div class="card stat">
            <span>Active receipts</span>
            <b>${money(summary.activeReceiptTotal)}</b>
            <small class="muted">Cancelled rows excluded</small>
          </div>
        </div>
        <div class="card report-results-card">
          ${hasPositiveCount(summary.approvalExceptionCount) ? `<p class="muted" role="status">${esc(scalarText(summary.approvalExceptionCount))} active payment(s) have unresolved approval states. They remain visible below but are excluded from approved payment totals and block daily cash close until approved or cancelled.</p>` : ''}
          ${hasPositiveCount(summary.unmatchedVendorCount) ? `<p class="muted" role="status">${esc(scalarText(summary.unmatchedVendorCount))} report row(s) have no unique saved Vendor ID. IDs are linked only when the counterparty exactly matches one unambiguous saved vendor name; unmatched historical/free-text names remain blank.</p>` : ''}
          ${hasPositiveCount(summary.ambiguousVendorCount) ? `<p class="muted" role="status">${esc(scalarText(summary.ambiguousVendorCount))} report row(s) have ambiguous vendor names because the saved vendor master contains duplicates. No VendorID is inferred for these rows; reconcile them manually before relying on party-level summaries.</p>` : ''}
          <h2>Source vouchers <span class="muted">${esc(dmy(R.from))} – ${esc(dmy(R.to))}</span></h2>
          <p class="muted">
            Generated ${esc(scalarText(summary.generatedAt))} · ${esc(scalarText(summary.count))} rows · Type: ${esc(scalarText(summary.type))} · Status: ${esc(scalarText(summary.status))}
          </p>
          ${R.invalidRowCount ? `<p class="muted" role="status">${R.invalidRowCount} malformed report row(s) omitted from this result. Run the report again to refresh.</p>` : ''}
          ${renderRows()}
        </div>
      `;
    } else if (R.loading) {
      results =
        '<div class="card report-status-card" role="status" aria-live="polite"><p class="muted">Loading report… Previous results are hidden until this request completes.</p></div>';
    } else if (!R.error) {
      results = emptyState({
        title: 'No report generated yet',
        description: 'Run the report to see recorded voucher movements.',
        action:
          '<button type="button" class="btn primary" data-act="reportRun">Run report</button>',
      });
    }

    $('#view').innerHTML =
      head('Recorded Movement Report', '', {
        section: 'Money',
        description: 'Filter server-recorded payments and receipts for a selected date range.',
      }) +
      filters +
      `<div id="report-output" class="report-output" aria-busy="${R.loading ? 'true' : 'false'}">` +
      error +
      results +
      '</div>';
    $('#movementFilters')?.addEventListener('submit', (event) => {
      event.preventDefault();
      R.from = $('#movementFrom').value;
      R.to = $('#movementTo').value;
      R.type = $('#movementType').value;
      R.status = $('#movementStatus').value;
      load();
    });
  }

  async function load() {
    const requestId = ++activeReportRequestId;
    if (!can('reports')) {
      if (S.view === 'reports') render();
      return;
    }

    if (!R.from || !R.to || R.from > R.to) {
      R.summary = null;
      R.rows = [];
      R.invalidRowCount = 0;
      R.loading = false;
      R.dateRangeInvalid = true;
      R.error = 'Choose a valid date range (From must not be after To).';
      if (S.view === 'reports') render();
      return;
    }

    const requestFilters = {
      from: R.from,
      to: R.to,
      type: R.type,
      status: R.status,
    };
    R.dateRangeInvalid = false;
    R.loading = true;
    R.error = '';
    R.summary = null;
    R.rows = [];
    R.invalidRowCount = 0;
    if (S.view === 'reports') render();

    try {
      const summary = await api('recordedMovementReport', requestFilters);
      if (
        !summary ||
        typeof summary !== 'object' ||
        Array.isArray(summary) ||
        !Array.isArray(summary.items)
      ) {
        throw new Error('The report returned an invalid response. Please retry.');
      }

      const summaryCountFields = [
        'approvalExceptionCount',
        'unmatchedVendorCount',
        'ambiguousVendorCount',
      ];
      if (!summaryCountFields.every((field) => isValidSummaryCount(summary[field]))) {
        throw new Error('The report returned invalid summary counts. Please retry.');
      }

      const reportTextFields = [
        'date',
        'voucherNo',
        'type',
        'vendor',
        'vendorId',
        'category',
        'notes',
        'status',
        'cancelReason',
        'approvalStatus',
        'approvedBy',
        'approvedAt',
        'approvalReason',
        'createdBy',
        'id',
      ];
      const isValidReportRow = (item) =>
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        reportTextFields.every((field) => typeof item[field] === 'string') &&
        (item.type === 'PAYMENT' || item.type === 'RECEIPT') &&
        (item.status === 'ACTIVE' || item.status === 'CANCELLED') &&
        typeof item.amount === 'number' &&
        Number.isFinite(item.amount) &&
        item.amount >= 0;
      const validRows = summary.items.filter(isValidReportRow);

      // Only the newest report submission may publish a result or error.
      if (requestId !== activeReportRequestId) return;
      R.summary = summary;
      R.rows = validRows.map(normalizeRow);
      R.invalidRowCount = summary.items.length - validRows.length;
    } catch (error) {
      if (requestId !== activeReportRequestId) return;
      R.summary = null;
      R.rows = [];
      R.invalidRowCount = 0;
      R.error =
        typeof error?.message === 'string' && error.message
          ? error.message
          : 'The report could not be loaded.';
    } finally {
      if (requestId === activeReportRequestId) {
        R.loading = false;
        // An in-flight read may finish after the operator has opened another view.
        if (S.view === 'reports') render();
      }
    }
  }
  function exportCsv() {
    if (!R.summary) {
      toast('Run a successful report before exporting.', 'err');
      return;
    }

    try {
      const fields = [
        'date',
        'voucherNo',
        'type',
        'vendor',
        'vendorId',
        'category',
        'notes',
        'amount',
        'status',
        'cancelReason',
        'approvalStatus',
        'approvedBy',
        'approvedAt',
        'approvalReason',
        'createdBy',
        'id',
      ];
      const rows = [fields, ...R.rows.map((item) => fields.map((field) => item[field] ?? ''))];
      download(
        `recorded-movement-${R.from}-to-${R.to}.csv`,
        rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
        'text/csv;charset=utf-8',
      );
      toast('Report CSV downloaded.', 'ok');
    } catch (error) {
      toast(
        typeof error?.message === 'string' && error.message
          ? 'Report CSV could not be downloaded: ' + error.message
          : 'Report CSV could not be downloaded. Please retry.',
        'err',
      );
    }
  }

  return { render, load, exportCsv };
}
