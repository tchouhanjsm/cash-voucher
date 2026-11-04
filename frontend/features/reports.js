import { $ } from '../core/dom.js';
import { can, PAYMENT_METHOD_FILTER_OPTIONS, paymentMethodLabel, S } from '../core/state.js';
import {
  addDays,
  csvCell,
  dmy,
  download,
  esc,
  finiteAmount,
  isBusinessDate,
  money,
  today,
} from '../core/utils.js';
import { emptyState, head, pageNotice, tableView, toast } from '../core/ui.js';

export function createReports({ api }) {
  const R = {
    from: today().slice(0, 7) + '-01',
    to: today(),
    type: 'ALL',
    status: 'ACTIVE',
    paymentMethod: 'ALL',
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
      'paymentMethod',
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
    row.paymentMethodAvailable = typeof item.paymentMethod === 'string';
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
          <td>${esc(item.paymentMethodAvailable ? paymentMethodLabel(item.paymentMethod) : 'Unavailable')}</td>
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
        { label: 'Payment method' },
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

  function movementTrend() {
    if (!isBusinessDate(R.from) || !isBusinessDate(R.to) || R.from > R.to) return '';

    const start = new Date(R.from + 'T00:00:00.000Z');
    const end = new Date(R.to + 'T00:00:00.000Z');
    const periodDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const monthly = periodDays > 62;
    const keys = [];

    if (monthly) {
      const cursor = new Date(R.from.slice(0, 7) + '-01T00:00:00.000Z');
      const finalMonth = R.to.slice(0, 7);
      while (cursor.toISOString().slice(0, 7) <= finalMonth) {
        keys.push(cursor.toISOString().slice(0, 7));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    } else {
      for (let index = 0; index < periodDays; index += 1) keys.push(addDays(R.from, index));
    }

    const buckets = new Map(keys.map((key) => [key, { payments: 0, receipts: 0 }]));
    let paymentTotal = 0;
    let receiptTotal = 0;
    let plottedRows = 0;

    R.rows.forEach((row) => {
      if (!isBusinessDate(row.date) || row.date < R.from || row.date > R.to) return;
      const amount = finiteAmount(row.amount);
      if (amount === null || amount < 0) return;
      const key = monthly ? row.date.slice(0, 7) : row.date;
      const bucket = buckets.get(key);
      if (!bucket) return;

      if (row.type === 'PAYMENT') {
        if (!['NOT_REQUIRED', 'APPROVED'].includes(row.approvalStatus)) return;
        bucket.payments += amount;
        paymentTotal += amount;
      } else if (row.type === 'RECEIPT') {
        bucket.receipts += amount;
        receiptTotal += amount;
      } else {
        return;
      }
      plottedRows += 1;
    });

    const maximum = Math.max(
      1,
      ...keys.map((key) => {
        const values = buckets.get(key);
        return Math.max(values.payments, values.receipts);
      }),
    );
    const width = Math.max(720, 74 + keys.length * 44);
    const height = 232;
    const left = 76;
    const right = 18;
    const top = 16;
    const bottom = 42;
    const plotHeight = height - top - bottom;
    const plotWidth = width - left - right;
    const slotWidth = plotWidth / keys.length;
    const barWidth = Math.min(12, slotWidth * 0.26);
    const barGap = Math.min(7, slotWidth * 0.12);
    const labelStep = Math.max(1, Math.ceil(keys.length / 12));
    const grid = [0, 0.25, 0.5, 0.75, 1]
      .map((fraction) => {
        const y = top + plotHeight - fraction * plotHeight;
        return (
          '<line class="report-trend-grid" x1="' +
          left +
          '" y1="' +
          y +
          '" x2="' +
          (width - right) +
          '" y2="' +
          y +
          '"></line><text class="report-trend-axis" x="' +
          (left - 8) +
          '" y="' +
          (y + 3) +
          '" text-anchor="end">' +
          esc(money(maximum * fraction)) +
          '</text>'
        );
      })
      .join('');

    const bars = keys
      .map((key, index) => {
        const values = buckets.get(key);
        const center = left + index * slotWidth + slotWidth / 2;
        const paymentHeight = (values.payments / maximum) * plotHeight;
        const receiptHeight = (values.receipts / maximum) * plotHeight;
        const paymentX = center - barGap / 2 - barWidth;
        const receiptX = center + barGap / 2;
        const paymentY = top + plotHeight - paymentHeight;
        const receiptY = top + plotHeight - receiptHeight;
        const label = monthly
          ? key.slice(5, 7) + '/' + key.slice(2, 4)
          : key.slice(8, 10) + '/' + key.slice(5, 7);
        const paymentBar =
          '<rect class="report-trend-bar report-trend-payment" x="' +
          paymentX +
          '" y="' +
          paymentY +
          '" width="' +
          barWidth +
          '" height="' +
          paymentHeight +
          '" rx="3"><title>' +
          esc(label) +
          ' · Approved payments: ' +
          esc(money(values.payments)) +
          '</title></rect>';
        const receiptBar =
          '<rect class="report-trend-bar report-trend-receipt" x="' +
          receiptX +
          '" y="' +
          receiptY +
          '" width="' +
          barWidth +
          '" height="' +
          receiptHeight +
          '" rx="3"><title>' +
          esc(label) +
          ' · Receipts: ' +
          esc(money(values.receipts)) +
          '</title></rect>';
        const axisLabel =
          index % labelStep === 0
            ? '<text class="report-trend-axis report-trend-x-label" x="' +
              center +
              '" y="' +
              (height - 12) +
              '" text-anchor="middle">' +
              esc(label) +
              '</text>'
            : '';
        return paymentBar + receiptBar + axisLabel;
      })
      .join('');

    const svg =
      '<svg class="report-trend-svg" width="' +
      width +
      '" height="' +
      height +
      '" viewBox="0 0 ' +
      width +
      ' ' +
      height +
      '" role="img" aria-labelledby="reportTrendSvgTitle reportTrendSvgDescription">' +
      '<title id="reportTrendSvgTitle">Payments and receipts over the selected report period</title>' +
      '<desc id="reportTrendSvgDescription">Grouped daily or monthly bars compare approved payments with recorded receipts. Pending and rejected payments are excluded from the payment series.</desc>' +
      grid +
      bars +
      '</svg>';
    const emptyMessage = plottedRows
      ? ''
      : '<p class="report-trend-empty" role="status">No reportable payment or receipt amounts appear in this selection.</p>';

    return (
      '<section id="report-movement-trend" class="card report-trend-panel" aria-labelledby="reportMovementTrendTitle">' +
      '<div class="report-trend-heading"><div><p class="page-eyebrow">OVER TIME</p><h2 id="reportMovementTrendTitle">Payment &amp; receipt movement</h2><p class="muted">Daily view for shorter periods; monthly view for ranges over 62 days.</p></div>' +
      '<div class="report-trend-legend" aria-label="Chart legend"><span><i class="report-trend-legend-payment"></i>Approved payments</span><span><i class="report-trend-legend-receipt"></i>Receipts</span></div></div>' +
      '<div class="report-trend-totals"><div><span>Approved payments</span><strong>' +
      money(paymentTotal) +
      '</strong></div><div><span>Recorded receipts</span><strong>' +
      money(receiptTotal) +
      '</strong></div></div>' +
      '<div id="reportMovementTrendScroll" class="report-trend-scroll" role="region" aria-label="Scrollable payment and receipt trend chart" tabindex="0">' +
      svg +
      '</div>' +
      emptyMessage +
      '</section>'
    );
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
    const reportToday = today();
    const previousMonthEnd = addDays(reportToday.slice(0, 7) + '-01', -1);
    const quickRanges = [
      { key: 'today', label: 'Today', from: reportToday, to: reportToday },
      { key: '7d', label: 'Last 7 days', from: addDays(reportToday, -6), to: reportToday },
      { key: '30d', label: 'Last 30 days', from: addDays(reportToday, -29), to: reportToday },
      { key: '90d', label: 'Last 90 days', from: addDays(reportToday, -89), to: reportToday },
      {
        key: 'mtd',
        label: 'Month to date',
        from: reportToday.slice(0, 7) + '-01',
        to: reportToday,
      },
      {
        key: 'previous-month',
        label: 'Previous month',
        from: previousMonthEnd.slice(0, 7) + '-01',
        to: previousMonthEnd,
      },
    ];
    const quickRangeControls =
      '<div class="report-period-presets" role="group" aria-label="Quick report date ranges">' +
      quickRanges
        .map(
          (range) =>
            '<button type="button" data-report-range="' +
            range.key +
            '" class="' +
            (R.from === range.from && R.to === range.to ? 'on' : '') +
            '" aria-pressed="' +
            (R.from === range.from && R.to === range.to ? 'true' : 'false') +
            '">' +
            range.label +
            '</button>',
        )
        .join('') +
      '</div>';
    const reportRangeLabel = R.dateRangeInvalid
      ? 'Invalid date selection'
      : esc(dmy(R.from)) + ' – ' + esc(dmy(R.to));
    const appliedReportFilters = [
      [
        'Type',
        R.type === 'PAYMENT'
          ? 'Payments only'
          : R.type === 'RECEIPT'
            ? 'Receipts only'
            : 'Payments and receipts',
      ],
      [
        'Payment method',
        R.paymentMethod === 'ALL' ? 'All methods' : paymentMethodLabel(R.paymentMethod),
      ],
      [
        'Status',
        R.status === 'ACTIVE'
          ? 'Active only'
          : R.status === 'CANCELLED'
            ? 'Cancelled only'
            : 'All statuses',
      ],
    ];
    const methodRows = Array.isArray(summary?.byPaymentMethod) ? summary.byPaymentMethod : [];
    const methodMax = Math.max(1, ...methodRows.map((item) => item.s));
    const methodBreakdown = methodRows.length
      ? methodRows
          .map((item) => {
            const amount = finiteAmount(item.s) ?? 0;
            const width = Math.min(100, Math.max(0, (amount / methodMax) * 100));
            return (
              '<div class="report-method-breakdown-item"><div class="report-method-breakdown-item__top"><span>' +
              esc(item.k) +
              '</span><strong>' +
              money(amount) +
              '</strong></div><div class="report-method-bar" aria-hidden="true"><i style="width:' +
              width +
              '%"></i></div><small class="muted">' +
              esc(scalarText(item.n)) +
              ' payment(s)</small></div>'
            );
          })
          .join('')
      : '<p class="muted">Payment-method breakdown is unavailable for this deployment or selection.</p>';
    const filters = `
      <div class="card report-filter-panel">
        <div class="report-filter-heading"><div><p class="page-eyebrow">MONEY · REPORTING</p><h2>Movement filters</h2><p class="muted report-scope-note">Recorded voucher movement only. This report does not establish physical cash, profit, bank balance or tax liability.</p></div><div class="report-range-summary"><span>Selected window</span><strong>${reportRangeLabel}</strong></div></div>
        <form id="movementFilters" class="filters report-filters" autocomplete="off">
          ${quickRangeControls}
          <label>From<input id="movementFrom" type="date" value="${esc(R.from)}" required${R.dateRangeInvalid ? ' aria-invalid="true" aria-describedby="report-date-range-error"' : ''}></label>
          <label>To<input id="movementTo" type="date" value="${esc(R.to)}" required${R.dateRangeInvalid ? ' aria-invalid="true" aria-describedby="report-date-range-error"' : ''}></label>
          <label>Type
            <select id="movementType">
              <option value="ALL"${R.type === 'ALL' ? ' selected' : ''}>Payments and receipts</option>
              <option value="PAYMENT"${R.type === 'PAYMENT' ? ' selected' : ''}>Payments only</option>
              <option value="RECEIPT"${R.type === 'RECEIPT' ? ' selected' : ''}>Receipts only</option>
            </select>
          </label>
          <label>Payment method
            <select id="movementPaymentMethod">
              ${PAYMENT_METHOD_FILTER_OPTIONS.map(
                ([value, label]) =>
                  '<option value="' +
                  value +
                  '"' +
                  (R.paymentMethod === value ? ' selected' : '') +
                  '>' +
                  esc(label) +
                  '</option>',
              ).join('')}
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
        ${movementTrend()}
        <div class="card report-method-breakdown">
          <h2>Active approved payments by method</h2>
          <p class="muted">Payment amounts exclude cancelled and unresolved approvals. Historical entries without a saved method remain visible as Not recorded.</p>
          <div class="report-method-breakdown-list">
${methodBreakdown}
          </div>
        </div>
        <div class="card report-results-card">
          ${hasPositiveCount(summary.approvalExceptionCount) ? `<p class="muted" role="status">${esc(scalarText(summary.approvalExceptionCount))} active payment(s) have unresolved approval states. They remain visible below but are excluded from approved payment totals and block daily cash close until approved or cancelled.</p>` : ''}
          ${hasPositiveCount(summary.unmatchedVendorCount) ? `<p class="muted" role="status">${esc(scalarText(summary.unmatchedVendorCount))} report row(s) have no unique saved Vendor ID. IDs are linked only when the counterparty exactly matches one unambiguous saved vendor name; unmatched historical/free-text names remain blank.</p>` : ''}
          ${hasPositiveCount(summary.ambiguousVendorCount) ? `<p class="muted" role="status">${esc(scalarText(summary.ambiguousVendorCount))} report row(s) have ambiguous vendor names because the saved vendor master contains duplicates. No VendorID is inferred for these rows; reconcile them manually before relying on party-level summaries.</p>` : ''}
          <div class="report-results-heading">
            <div>
              <p class="page-eyebrow">SOURCE RECORDS</p>
              <h2>Source vouchers</h2>
              <p class="muted">
                Generated ${esc(scalarText(summary.generatedAt))} · ${esc(scalarText(summary.count))} rows · Type: ${esc(scalarText(summary.type))} · Status: ${esc(scalarText(summary.status))}
              </p>
            </div>
            <div class="report-results-period">
              <span>Report period</span>
              <strong>${esc(dmy(R.from))} – ${esc(dmy(R.to))}</strong>
            </div>
          </div>
          <div class="report-applied-filters" aria-label="Filters applied to this report">
            ${appliedReportFilters.map(([label, value]) => '<span><b>' + esc(label) + '</b> · ' + esc(value) + '</span>').join('')}
          </div>
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
    $('#movementFilters')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-report-range]');
      if (!button) return;
      const range = quickRanges.find((item) => item.key === button.dataset.reportRange);
      if (!range) return;
      R.from = range.from;
      R.to = range.to;
      load();
    });
    $('#movementFilters')?.addEventListener('submit', (event) => {
      event.preventDefault();
      R.from = $('#movementFrom').value;
      R.to = $('#movementTo').value;
      R.type = $('#movementType').value;
      R.status = $('#movementStatus').value;
      R.paymentMethod = $('#movementPaymentMethod').value;
      load();
    });
  }

  async function load() {
    const requestId = ++activeReportRequestId;
    if (!can('reports')) {
      if (S.view === 'reports') render();
      return;
    }

    if (!isBusinessDate(R.from) || !isBusinessDate(R.to) || R.from > R.to) {
      R.summary = null;
      R.rows = [];
      R.invalidRowCount = 0;
      R.loading = false;
      R.dateRangeInvalid = true;
      R.error = 'Choose real calendar dates with From on or before To.';
      if (S.view === 'reports') render();
      return;
    }

    const requestFilters = {
      from: R.from,
      to: R.to,
      type: R.type,
      status: R.status,
      paymentMethod: R.paymentMethod,
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

      if (
        (summary.paymentMethod !== undefined &&
          summary.paymentMethod !== requestFilters.paymentMethod) ||
        (requestFilters.paymentMethod !== 'ALL' &&
          summary.paymentMethod !== requestFilters.paymentMethod) ||
        (summary.byPaymentMethod !== undefined &&
          (!Array.isArray(summary.byPaymentMethod) ||
            !summary.byPaymentMethod.every(
              (item) =>
                item !== null &&
                typeof item === 'object' &&
                !Array.isArray(item) &&
                typeof item.k === 'string' &&
                isValidSummaryCount(item.n) &&
                typeof item.s === 'number' &&
                Number.isFinite(item.s) &&
                item.s >= 0,
            )))
      ) {
        throw new Error(
          'The report returned invalid payment-method data. Confirm the client and backend versions, then retry.',
        );
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
        (item.paymentMethod === undefined || typeof item.paymentMethod === 'string') &&
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
  function openDashboardContext(context = {}) {
    const from = typeof context.from === 'string' ? context.from : '';
    const to = typeof context.to === 'string' ? context.to : '';
    if (!isBusinessDate(from) || !isBusinessDate(to) || from > to) return;
    R.from = from;
    R.to = to;
    R.type = ['PAYMENT', 'RECEIPT'].includes(context.type) ? context.type : 'ALL';
    R.status = 'ACTIVE';
    R.paymentMethod = 'ALL';
    return load();
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
        'paymentMethod',
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

  return { render, load, openDashboardContext, exportCsv };
}
