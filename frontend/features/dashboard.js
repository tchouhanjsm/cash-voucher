import { $ } from '../core/dom.js';
import { can, nm, S } from '../core/state.js';
import {
  addDays,
  dmy,
  esc,
  finiteAmount,
  iso,
  isBusinessDate,
  money,
  pad,
  today,
} from '../core/utils.js';
import { head, icon, refreshBtn } from '../core/ui.js';

export function createDashboard({ api }) {
  const D = { r: '30d', from: '', to: '', customDraft: false };

  function range() {
    const current = today();
    const [year, month] = current.split('-').map(Number);
    const monthStart = `${year}-${pad(month)}-01`;

    if (D.r === 'today') return [current, current];
    if (D.r === '7d') return [addDays(current, -6), current];
    if (D.r === 'mtd') return [monthStart, current];

    if (D.r === 'lm') {
      const first = new Date(Date.UTC(year, month - 2, 1));
      const last = new Date(Date.UTC(year, month - 1, 0));
      return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
    }

    if (D.r === 'cus' && isBusinessDate(D.from) && isBusinessDate(D.to) && D.from <= D.to) {
      return [D.from, D.to];
    }

    return [addDays(current, -29), current];
  }

  function bars(rows, limit = 8) {
    // Persisted/bootstrap data is untrusted; keep non-finite totals out of CSS geometry.
    const top = rows.slice(0, limit).map((row) => ({
      ...row,
      s: Number.isFinite(Number(row.s)) ? Number(row.s) : 0,
    }));
    const max = Math.max(1, ...top.map((row) => row.s));

    return (
      top
        .map(
          (row) =>
            `<div class="hb"><div class="hb-l" title="${esc(row.k)}">${esc(row.k)}</div><div class="hb-t"><i style="width:${Math.min(100, Math.max(2, (row.s / max) * 100))}%"></i></div><div class="hb-v">${money(row.s)}</div></div>`,
        )
        .join('') || '<p class="muted">No data in this period.</p>'
    );
  }

  function trendSvg(list, from, to) {
    const days = Math.round((new Date(to) - new Date(from)) / 864e5) + 1;
    const monthly = days > 62;
    const amounts = new Map();

    list.forEach((voucher) => {
      const key = monthly ? voucher.date.slice(0, 7) : voucher.date;
      const amount = finiteAmount(voucher.amount);
      if (amount === null) return;
      amounts.set(key, (amounts.get(key) || 0) + amount);
    });

    const keys = [];
    if (monthly) {
      const cursor = new Date(from.slice(0, 7) + '-01T00:00:00.000Z');
      const end = to.slice(0, 7);
      while (iso(cursor).slice(0, 7) <= end) {
        keys.push(iso(cursor).slice(0, 7));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    } else {
      for (let index = 0; index < days; index += 1) keys.push(addDays(from, index));
    }

    const values = keys.map((key) => amounts.get(key) || 0);
    const maximum = Math.max(0, ...values);
    const scaleMaximum = maximum || 1;
    const width = 920;
    const height = 260;
    const left = 76;
    const right = 22;
    const top = 22;
    const bottom = 40;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const baseline = top + plotHeight;
    const xAt = (index) =>
      keys.length === 1 ? left + plotWidth / 2 : left + (index / (keys.length - 1)) * plotWidth;
    const yAt = (amount) => top + plotHeight - (amount / scaleMaximum) * plotHeight;
    const points = values.map((amount, index) => ({
      x: xAt(index),
      y: yAt(amount),
      amount,
      key: keys[index],
      label: monthly ? keys[index].slice(5, 7) + '/' + keys[index].slice(0, 4) : dmy(keys[index]),
      axisLabel: monthly
        ? keys[index].slice(5, 7) + '/' + keys[index].slice(0, 4)
        : keys[index].slice(8, 10) + '/' + keys[index].slice(5, 7),
    }));
    const pointPath = points
      .map(
        (point, index) =>
          (index === 0 ? 'M ' : 'L ') + point.x.toFixed(2) + ' ' + point.y.toFixed(2),
      )
      .join(' ');
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const areaPath =
      pointPath +
      ' L ' +
      lastPoint.x.toFixed(2) +
      ' ' +
      baseline.toFixed(2) +
      ' L ' +
      firstPoint.x.toFixed(2) +
      ' ' +
      baseline.toFixed(2) +
      ' Z';

    const tickFractions = maximum > 0 ? [0, 0.5, 1] : [0];
    const grid = tickFractions
      .map((fraction) => {
        const y = top + plotHeight - fraction * plotHeight;
        return (
          '<line class="dashboard-trend__gridline" x1="' +
          left +
          '" y1="' +
          y.toFixed(2) +
          '" x2="' +
          (width - right) +
          '" y2="' +
          y.toFixed(2) +
          '"></line><text class="dashboard-trend__axis-label" x="' +
          (left - 10) +
          '" y="' +
          (y + 4).toFixed(2) +
          '" text-anchor="end">' +
          esc(money(maximum * fraction)) +
          '</text>'
        );
      })
      .join('');

    const labelStep = Math.max(1, Math.ceil(keys.length / 9));
    const axisLabels = points
      .map((point, index) =>
        index % labelStep === 0 || index === points.length - 1
          ? '<text class="dashboard-trend__axis-label dashboard-trend__x-label" x="' +
            point.x.toFixed(2) +
            '" y="' +
            (height - 12) +
            '" text-anchor="middle">' +
            esc(point.axisLabel) +
            '</text>'
          : '',
      )
      .join('');
    const pointMarks = points
      .map(
        (point) =>
          '<circle class="dashboard-trend__point" cx="' +
          point.x.toFixed(2) +
          '" cy="' +
          point.y.toFixed(2) +
          '" r="3"><title>' +
          esc(point.label) +
          ': ' +
          esc(money(point.amount)) +
          '</title></circle>',
      )
      .join('');
    const description =
      maximum > 0
        ? 'Approved payment amounts are grouped ' +
          (monthly ? 'by month' : 'by business date') +
          ' from ' +
          dmy(from) +
          ' through ' +
          dmy(to) +
          '. Each point includes its exact amount.'
        : 'No approved payment amount appears in the trend buckets for the selected period.';

    return (
      '<div class="dashboard-trend__scroll" role="region" aria-label="Scrollable approved payment trend" tabindex="0">' +
      '<svg class="chart dashboard-trend-chart" width="' +
      width +
      '" height="' +
      height +
      '" viewBox="0 0 ' +
      width +
      ' ' +
      height +
      '" role="img" aria-labelledby="dashboardTrendChartTitle dashboardTrendChartDescription" data-chart-points="' +
      keys.length +
      '" data-empty="' +
      (maximum === 0 ? 'true' : 'false') +
      '">' +
      '<title id="dashboardTrendChartTitle">Approved payment trend</title>' +
      '<desc id="dashboardTrendChartDescription">' +
      esc(description) +
      '</desc>' +
      '<defs><linearGradient id="dashboardTrendFill" x1="0" y1="0" x2="0" y2="1"><stop class="dashboard-trend__gradient-start" offset="0%"></stop><stop class="dashboard-trend__gradient-end" offset="100%"></stop></linearGradient></defs>' +
      grid +
      '<path class="dashboard-trend__area" d="' +
      areaPath +
      '"></path><path class="dashboard-trend__line" d="' +
      pointPath +
      '"></path>' +
      pointMarks +
      axisLabels +
      '</svg></div>'
    );
  }

  function dashboardSummaryIssue(summary, from, to) {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return 'envelope';
    if (summary.from !== from || summary.to !== to) return 'date range';

    const startMs = Date.parse(from + 'T00:00:00Z');
    const endMs = Date.parse(to + 'T00:00:00Z');
    const periodDays = Math.round((endMs - startMs) / 864e5) + 1;
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      !Number.isSafeInteger(periodDays) ||
      periodDays < 1 ||
      periodDays > 3660 ||
      summary.periodDays !== periodDays
    ) {
      return 'period';
    }
    if (summary.trendMonthly !== periodDays > 62) return 'trend interval';

    const amountFields = {
      paid: false,
      previousPaid: false,
      received: false,
      todayPaid: false,
      bookBalance: true,
    };
    for (const [field, allowNegative] of Object.entries(amountFields)) {
      const value = summary[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || (!allowNegative && value < 0)) {
        return field;
      }
    }

    const countFields = [
      'paymentCount',
      'validPaymentCount',
      'receiptCount',
      'todayPaymentCount',
      'approvalExceptionCount',
      'invalidAmountCount',
      'malformedRecordCount',
      'malformedFieldCount',
    ];
    for (const field of countFields) {
      if (!Number.isSafeInteger(summary[field]) || summary[field] < 0) return field;
    }
    if (summary.validPaymentCount > summary.paymentCount) return 'validPaymentCount';

    if (summary.largest !== null) {
      if (
        !summary.largest ||
        typeof summary.largest !== 'object' ||
        Array.isArray(summary.largest) ||
        typeof summary.largest.vendor !== 'string' ||
        typeof summary.largest.amount !== 'number' ||
        !Number.isFinite(summary.largest.amount) ||
        summary.largest.amount < 0
      ) {
        return 'largest';
      }
    }

    if (!Array.isArray(summary.trend) || summary.trend.length > 3660) return 'trend';
    const startDate = from.slice(0, 10);
    const endDate = to.slice(0, 10);
    const startMonth = from.slice(0, 7);
    const endMonth = to.slice(0, 7);
    const trendKeys = new Set();
    for (const row of summary.trend) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return 'trend';
      const key = row.date;
      const validKey =
        typeof key === 'string' &&
        (summary.trendMonthly
          ? /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && key >= startMonth && key <= endMonth
          : /^\d{4}-\d{2}-\d{2}$/.test(key) && key >= startDate && key <= endDate);
      if (
        !validKey ||
        trendKeys.has(key) ||
        typeof row.amount !== 'number' ||
        !Number.isFinite(row.amount) ||
        row.amount < 0
      ) {
        return 'trend';
      }
      trendKeys.add(key);
    }

    for (const field of ['topVendors', 'byCategory', 'byTeamMember', 'byPaymentMethod']) {
      const rows = summary[field];
      if (field === 'byPaymentMethod' && rows === undefined) continue;
      if (!Array.isArray(rows) || rows.length > 10) return field;
      for (const row of rows) {
        if (
          !row ||
          typeof row !== 'object' ||
          Array.isArray(row) ||
          typeof row.k !== 'string' ||
          !Number.isSafeInteger(row.n) ||
          row.n < 0 ||
          typeof row.s !== 'number' ||
          !Number.isFinite(row.s) ||
          row.s < 0
        ) {
          return field;
        }
      }
    }

    return '';
  }

  let summaryRequestId = 0;

  function periodControls(from, to) {
    return `
      <div class="seg dashboard-period">${[
        ['today', 'Today'],
        ['7d', 'Last 7 days'],
        ['30d', 'Last 30 days'],
        ['mtd', 'This month'],
        ['lm', 'Last month'],
        ['cus', 'Custom'],
      ]
        .map(
          ([key, label]) =>
            `<button type="button" data-act="range" data-k="${key}" class="${D.r === key ? 'on' : ''}">${label}</button>`,
        )
        .join('')}</div>
      ${D.r === 'cus' ? `<div class="card filters"><label>From<input type="date" id="dFrom" value="${esc(D.from || from)}"></label><label>To<input type="date" id="dTo" value="${esc(D.to || to)}"></label><button type="button" class="btn primary" data-act="cus">Apply</button></div>` : ''}`;
  }

  function renderShell(from, to) {
    const view = $('#view');
    const frame = document.createElement('div');
    frame.className = 'dashboard-view';

    const header = document.createElement('div');
    header.className = 'head page-header';
    const copy = document.createElement('div');
    copy.className = 'page-header-copy';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'page-eyebrow';
    eyebrow.textContent = 'Work';
    const title = document.createElement('h1');
    title.textContent = can('viewAll') ? 'Dashboard' : 'My Dashboard';
    const description = document.createElement('p');
    description.className = 'page-description';
    description.textContent = 'Review saved payment and receipt activity for the selected period.';
    copy.append(eyebrow, title, description);

    const actions = document.createElement('div');
    actions.className = 'page-header-actions';
    if (can('create')) {
      const create = document.createElement('button');
      create.type = 'button';
      create.className = 'btn primary';
      create.dataset.act = 'ntype';
      create.dataset.k = 'PAYMENT';
      create.textContent = '+ New entry';
      actions.appendChild(create);
    }
    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'btn sm';
    refresh.dataset.act = 'refresh';
    refresh.textContent = '↻ Refresh';
    actions.appendChild(refresh);
    header.append(copy, actions);

    const body = document.createElement('div');
    body.className = 'dashboard-body';
    const periods = document.createElement('div');
    periods.className = 'seg dashboard-period';
    [
      ['today', 'Today'],
      ['7d', 'Last 7 days'],
      ['30d', 'Last 30 days'],
      ['mtd', 'This month'],
      ['lm', 'Last month'],
      ['cus', 'Custom'],
    ].forEach(([key, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.act = 'range';
      button.dataset.k = key;
      button.className = D.r === key ? 'on' : '';
      button.textContent = label;
      periods.appendChild(button);
    });
    body.appendChild(periods);

    if (D.r === 'cus') {
      const filters = document.createElement('div');
      filters.className = 'card filters';
      [
        ['From', 'dFrom', D.from || from],
        ['To', 'dTo', D.to || to],
      ].forEach(([labelText, id, value]) => {
        const label = document.createElement('label');
        label.appendChild(document.createTextNode(labelText));
        const input = document.createElement('input');
        input.type = 'date';
        input.id = id;
        input.value = value;
        label.appendChild(input);
        filters.appendChild(label);
      });
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'btn primary';
      apply.dataset.act = 'cus';
      apply.textContent = 'Apply';
      filters.appendChild(apply);
      body.appendChild(filters);
    }

    frame.append(header, body);
    view.replaceChildren(frame);
    return body;
  }

  function appendStatusCard(body, message, options = {}) {
    const card = document.createElement('div');
    card.className = options.className || 'card';
    card.setAttribute('role', options.role || 'status');
    card.setAttribute('aria-live', options.role === 'alert' ? 'assertive' : 'polite');
    if (options.title) {
      const title = document.createElement('h2');
      title.textContent = options.title;
      card.appendChild(title);
    }
    const text = document.createElement('p');
    text.textContent = message;
    card.appendChild(text);
    body.appendChild(card);
  }

  function dailyCloseCard(data, error) {
    if (!can('cashClose')) return '';

    const action =
      '<button type="button" class="btn" data-act="goto" data-k="cashClose">Open Daily Cash Close ' +
      icon('arrow-right') +
      '</button>';
    if (error || !data || typeof data !== 'object') {
      return (
        '<section class="card daily-close-readiness" data-status="UNAVAILABLE" aria-labelledby="dailyCloseTitle">' +
        '<h2 id="dailyCloseTitle">Daily Cash Close</h2>' +
        '<p role="status">Today’s close readiness could not be verified. No ready or closed status is assumed.</p>' +
        action +
        '</section>'
      );
    }

    const labels = {
      CLOSED: 'Closed',
      READY_TO_CLOSE: 'Ready to close',
      BLOCKED: 'Needs attention',
      BLOCKED_BY_LATER_CLOSE: 'Blocked by a later close',
      OPENING_CASH_REQUIRED: 'Opening cash required',
      REVIEW_REQUIRED: 'Review required',
    };
    const status = Object.prototype.hasOwnProperty.call(labels, data.status)
      ? data.status
      : 'REVIEW_REQUIRED';
    const amountLabel = (value) =>
      typeof value === 'number' && Number.isFinite(value) ? money(value) : 'Not available';
    const countLabel = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
    const dateLabel =
      typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
        ? dmy(data.date)
        : 'unknown date';
    const pending = countLabel(data.pendingApprovalCount);
    const unclassified = countLabel(data.unclassifiedCount);
    const invalid = countLabel(data.invalidVoucherCount);
    const details = [];

    if (status === 'CLOSED') {
      details.push(
        'Close recorded. Counted drawer cash: ' +
          amountLabel(data.countedCash) +
          '; variance: ' +
          amountLabel(data.variance) +
          '.',
      );
    } else {
      if (data.blockedByLaterClose === true) {
        const laterDate =
          typeof data.laterCloseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.laterCloseDate)
            ? dmy(data.laterCloseDate)
            : 'a later business date';
        details.push('Closing is blocked because ' + laterDate + ' already has a close.');
      }
      if (pending > 0) {
        details.push(pending + ' payment approval/review exception(s) block closing.');
      }
      if (unclassified > 0) {
        details.push(unclassified + ' voucher(s) need a verified cash-impact classification.');
      }
      if (invalid > 0) {
        details.push(invalid + ' voucher(s) contain invalid data and block closing.');
      }
      if (data.openingCashRequired === true) {
        details.push('Record opening cash and explain the opening amount before closing.');
      }
      if (data.readyToClose === true && status === 'READY_TO_CLOSE') {
        details.push(
          'Server-side checks pass. Verify the physical drawer count before finalizing.',
        );
      }
      if (!details.length) {
        details.push(
          'Readiness is not established. Review the full close screen before taking action.',
        );
      }
    }

    const noCashCount = countLabel(data.noCashCount);
    const movements =
      '<p class="muted">Business date: ' +
      esc(dateLabel) +
      ' · Cash in: ' +
      esc(amountLabel(data.cashInTotal)) +
      ' · Cash out: ' +
      esc(amountLabel(data.cashOutTotal)) +
      ' · Non-cash entries: ' +
      (noCashCount === null ? 'Not available' : noCashCount) +
      '</p>';
    return (
      '<section class="card daily-close-readiness" data-status="' +
      esc(status) +
      '" aria-labelledby="dailyCloseTitle">' +
      '<div class="head"><h2 id="dailyCloseTitle">Daily Cash Close</h2><span class="muted">' +
      esc(labels[status]) +
      '</span></div>' +
      movements +
      '<ul class="needs-list">' +
      details.map((item) => '<li class="needs-item">' + esc(item) + '</li>').join('') +
      '</ul>' +
      action +
      '</section>'
    );
  }


  function dailyCashPositionCard(data, error) {
    if (!can('cashClose')) return '';

    const isRecord = data && typeof data === 'object' && !Array.isArray(data);
    const unavailable = Boolean(error) || !isRecord;
    const validStatuses = [
      'CLOSED',
      'READY_TO_CLOSE',
      'BLOCKED',
      'BLOCKED_BY_LATER_CLOSE',
      'OPENING_CASH_REQUIRED',
      'REVIEW_REQUIRED',
    ];
    const status = unavailable
      ? 'UNAVAILABLE'
      : validStatuses.includes(data.status)
        ? data.status
        : 'REVIEW_REQUIRED';
    const statusLabels = {
      CLOSED: 'Closed',
      READY_TO_CLOSE: 'Ready to close',
      BLOCKED: 'Needs attention',
      BLOCKED_BY_LATER_CLOSE: 'Blocked by later close',
      OPENING_CASH_REQUIRED: 'Opening cash required',
      REVIEW_REQUIRED: 'Review required',
      UNAVAILABLE: 'Unavailable',
    };
    const date = !unavailable && isBusinessDate(data.date) ? dmy(data.date) : 'Business date unavailable';
    const amountLabel = (value) =>
      typeof value === 'number' && Number.isFinite(value) ? money(value) : 'Not available';
    const countLabel = (value) =>
      Number.isSafeInteger(value) && value >= 0 ? String(value) : 'Not available';
    const expected = unavailable
      ? 'Not available'
      : typeof data.expectedCash === 'number' && Number.isFinite(data.expectedCash)
        ? money(data.expectedCash)
        : data.openingCashRequired === true
          ? 'Opening cash required'
          : 'Not available';
    const cashIn = unavailable ? 'Not available' : amountLabel(data.cashInTotal);
    const cashOut = unavailable ? 'Not available' : amountLabel(data.cashOutTotal);
    const nonCash = unavailable ? 'Not available' : countLabel(data.noCashCount);
    const activeVouchers = unavailable ? 'Not available' : countLabel(data.activeVoucherCount);
    return (
      '<section class="card dashboard-cash-position" data-status="' +
      esc(status) +
      '" aria-labelledby="dashboardCashPositionTitle">' +
      '<div class="dashboard-cash-position__header">' +
      '<div><p class="dashboard-cash-position__eyebrow">Physical drawer · ' +
      esc(date) +
      '</p><h2 id="dashboardCashPositionTitle">Daily cash position</h2><p>Server-calculated for the current business date, separate from the all-time Book balance.</p></div>' +
      '<span class="dashboard-cash-position__status">' +
      esc(statusLabels[status]) +
      '</span></div>' +
      '<div class="dashboard-cash-position__body">' +
      '<div class="dashboard-cash-position__expected"><span>Expected drawer cash</span><strong>' +
      esc(expected) +
      '</strong><small>Opening cash + approved CASH_IN − approved CASH_OUT</small></div>' +
      '<div class="dashboard-cash-position__metrics">' +
      '<div class="dashboard-cash-position__metric"><span>Cash received</span><strong>' +
      esc(cashIn) +
      '</strong></div>' +
      '<div class="dashboard-cash-position__metric"><span>Cash paid</span><strong>' +
      esc(cashOut) +
      '</strong></div>' +
      '<div class="dashboard-cash-position__metric"><span>Non-cash entries</span><strong>' +
      esc(nonCash) +
      '</strong></div>' +
      '<div class="dashboard-cash-position__metric"><span>Active vouchers</span><strong>' +
      esc(activeVouchers) +
      '</strong></div>' +
      '</div></div>' +
      '<p class="dashboard-cash-position__footnote">UPI and bank movements do not change drawer cash. Expected cash is not a physical count; complete Daily Cash Close to record the counted amount.</p>' +
      '</section>'
    );
  }

  function recentTransactionsIssue(result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) return 'envelope';
    if (
      !Array.isArray(result.items) ||
      result.items.length > 5 ||
      result.offset !== 0 ||
      result.limit !== 5 ||
      !Number.isSafeInteger(result.totalCount) ||
      result.totalCount < result.items.length
    ) {
      return 'page';
    }
    for (const row of result.items) {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        typeof row.id !== 'string' ||
        !row.id.trim() ||
        !Number.isSafeInteger(row.no) ||
        row.no < 1 ||
        !isBusinessDate(row.date) ||
        typeof row.vendor !== 'string' ||
        !['PAYMENT', 'RECEIPT'].includes(row.type) ||
        row.status !== 'ACTIVE' ||
        (row.amount !== null &&
          (typeof row.amount !== 'number' || !Number.isFinite(row.amount) || row.amount <= 0))
      ) {
        return 'row';
      }
    }
    return '';
  }

  function recentTransactionsCard(result, error, from, to) {
    const heading =
      '<div class="dashboard-panel-heading"><div><h2 id="dashboardRecentTitle">Recent transactions</h2><p>Latest active vouchers in the selected period · ' +
      esc(dmy(from)) +
      ' – ' +
      esc(dmy(to)) +
      '</p></div><button type="button" class="btn" data-act="goto" data-k="reg">Open register ' +
      icon('arrow-right') +
      '</button></div>';
    if (error || recentTransactionsIssue(result)) {
      return (
        '<section class="card dashboard-recent-transactions" aria-labelledby="dashboardRecentTitle">' +
        heading +
        '<p class="dashboard-recent-empty" role="status">Recent activity could not be loaded. Your dashboard totals remain available; open the register or refresh to retry.</p>' +
        '</section>'
      );
    }

    const items = result.items;
    let content = '<p class="dashboard-recent-empty">No active vouchers were recorded in this period.</p>';
    if (items.length) {
      content =
        '<ul class="dashboard-recent-list">' +
        items
          .map((row) => {
            const isReceipt = row.type === 'RECEIPT';
            const approval = isReceipt
              ? 'Receipt recorded'
              : row.approvalStatus === 'PENDING'
                ? 'Pending approval'
                : row.approvalStatus === 'APPROVED'
                  ? 'Approved'
                  : row.approvalStatus === 'REJECTED'
                    ? 'Rejected'
                    : row.approvalStatus === 'REVIEW_REQUIRED'
                      ? 'Approval review required'
                      : 'Recorded';
            const amount =
              typeof row.amount === 'number' && Number.isFinite(row.amount) && row.amount > 0
                ? (isReceipt ? '+' : '−') + money(row.amount)
                : 'Amount unavailable';
            const number = (isReceipt ? 'R-' : '') + String(row.no);
            return (
              '<li class="dashboard-recent-item" data-type="' +
              (isReceipt ? 'RECEIPT' : 'PAYMENT') +
              '"><div class="dashboard-recent-item__main"><div class="dashboard-recent-item__identity"><span class="dashboard-recent-item__kind">' +
              (isReceipt ? 'Receipt' : 'Payment') +
              '</span><span>' +
              esc(number) +
              '</span></div><span class="dashboard-recent-item__vendor">' +
              esc(row.vendor) +
              '</span><small class="dashboard-recent-item__meta">' +
              esc(dmy(row.date)) +
              ' · ' +
              esc(approval) +
              '</small></div><strong class="dashboard-recent-item__amount">' +
              esc(amount) +
              '</strong></li>'
            );
          })
          .join('') +
        '</ul>';
    }
    return (
      '<section class="card dashboard-recent-transactions" aria-labelledby="dashboardRecentTitle">' +
      heading +
      content +
      '</section>'
    );
  }

  async function render() {
    const requestId = ++summaryRequestId;
    const [from, to] = range();
    const body = renderShell(from || today(), to || today());
    const diagnostics = S.voucherDiagnostics || {};
    const bootstrapUnavailable =
      S.offlineMode ||
      navigator.onLine === false ||
      diagnostics.dataAvailable === false ||
      diagnostics.envelopeValid === false;
    if (bootstrapUnavailable) {
      const reason =
        S.offlineMode || diagnostics.unavailableReason === 'offline' || navigator.onLine === false
          ? 'Voucher data is unavailable while offline. Reconnect and refresh to load saved vouchers.'
          : 'Voucher data is unavailable because the server response was invalid. Refresh and retry.';
      appendStatusCard(
        body,
        reason + ' No financial totals or charts are shown until voucher data is available.',
        { title: 'Dashboard totals unavailable', role: 'alert' },
      );
      return;
    }

    if (D.r === 'cus' && D.customDraft) {
      appendStatusCard(
        body,
        'Choose the From and To dates, then apply the range. Dashboard totals stay unchanged until the custom selection is applied.',
        {
          className: 'card dashboard-custom-range-prompt',
          title: 'Custom date range not applied',
        },
      );
      return;
    }

    if (!from || !to || from > to) {
      appendStatusCard(body, 'Choose a valid date range before loading dashboard totals.', {
        className: 'card error',
        role: 'alert',
      });
      return;
    }

    appendStatusCard(body, 'Calculating the dashboard from the latest saved ledger…');
    let summary;
    let dailyOperations = null;
    let dailyOperationsError = null;
    let recentTransactions = null;
    let recentTransactionsError = null;
    const dailyOperationsRequest = can('cashClose')
      ? api('dailyOperationsSummary').then(
          (data) => ({ data }),
          (error) => ({ error }),
        )
      : Promise.resolve(null);
    const recentTransactionsRequest = api('registerPage', {
      from,
      to,
      st: 'ACTIVE',
      approval: 'ALL',
      offset: 0,
      limit: 5,
    }).then(
      (data) => ({ data }),
      (error) => ({ error }),
    );
    try {
      const results = await Promise.all([
        api('dashboardSummary', { from, to }),
        dailyOperationsRequest,
        recentTransactionsRequest,
      ]);
      summary = results[0];
      if (dashboardSummaryIssue(summary, from, to)) {
        throw Object.assign(
          new Error(
            'The server returned incomplete or invalid dashboard summary data. Financial totals remain hidden. Refresh and retry; if this persists, verify that the frontend and Apps Script deployment are on compatible versions.',
          ),
          { code: 'BAD_SUMMARY' },
        );
      }
      if (results[1]) {
        dailyOperations = results[1].data || null;
        dailyOperationsError = results[1].error || null;
      }
      recentTransactions = results[2]?.data || null;
      recentTransactionsError = results[2]?.error || null;
    } catch (error) {
      if (requestId !== summaryRequestId || S.view !== 'dash') return;
      const errorBody = renderShell(from, to);
      const unsupportedDashboardAction =
        error?.code === 'NOT_FOUND' && /unknown action/i.test(String(error?.message || ''));
      const message = unsupportedDashboardAction
        ? 'The connected Apps Script deployment does not recognize dashboardSummary. The client and backend may be on different versions or this may be the wrong API URL. Verify the staging deployment identity and deploy the reviewed backend to that same staging project before retrying. Financial totals remain hidden.'
        : error?.message || 'The server could not calculate the dashboard. Refresh and retry.';
      appendStatusCard(errorBody, message, {
        title: 'Dashboard totals unavailable',
        role: 'alert',
      });
      return;
    }
    if (requestId !== summaryRequestId || S.view !== 'dash') return;

    const length = summary.periodDays;
    const total = summary.paid;
    const previousTotal = summary.previousPaid;
    const change = total - previousTotal;
    const percentageBaselineReliable = previousTotal >= 100;
    const delta = percentageBaselineReliable ? (change / previousTotal) * 100 : null;
    const comparisonDirection =
      previousTotal === 0
        ? 'zero-baseline'
        : change === 0
          ? 'flat'
          : change > 0
            ? 'increase'
            : 'decrease';
    const comparisonText =
      change === 0
        ? 'No change vs previous ' + length + ' days'
        : previousTotal === 0
          ? 'Previous period paid ' + money(previousTotal) + ' · percentage change unavailable'
          : !percentageBaselineReliable
            ? 'Change ' +
              (change > 0 ? '+' : '−') +
              money(Math.abs(change)) +
              ' vs previous ' +
              length +
              ' days · percentage omitted for a small baseline'
            : (delta > 0 ? '↑ ' : '↓ ') +
              Math.abs(delta).toFixed(0) +
              '% vs previous ' +
              length +
              ' days';
    const paymentCountValid =
      Number.isSafeInteger(summary.paymentCount) && summary.paymentCount >= 0;
    const paymentCount = summary.paymentCount;
    const receiptCountValid =
      Number.isSafeInteger(summary.receiptCount) && summary.receiptCount >= 0;
    const receiptCount = summary.receiptCount;
    const periodIsEmpty =
      paymentCountValid && receiptCountValid && paymentCount === 0 && receiptCount === 0;
    const validPaymentCount = summary.validPaymentCount;
    const received = summary.received;
    const approvalExceptionCount = summary.approvalExceptionCount;
    const invalidAmountCount = Math.max(
      Number(summary.invalidAmountCount) || 0,
      Number(diagnostics.invalidAmountCount) || 0,
    );
    const malformedRecordCount = Math.max(
      Number(summary.malformedRecordCount) || 0,
      Number(diagnostics.malformedRecordCount) || 0,
    );
    const malformedFieldCount = Math.max(
      Number(summary.malformedFieldCount) || 0,
      Number(diagnostics.malformedFieldCount) || 0,
    );
    const dataWarnings = [];

    if (malformedRecordCount) {
      dataWarnings.push(
        `${malformedRecordCount} malformed voucher record(s) were omitted from normal financial calculations.`,
      );
    }
    if (malformedFieldCount) {
      dataWarnings.push(
        `${malformedFieldCount} malformed voucher field(s) were handled for safe display.`,
      );
    }
    if (approvalExceptionCount) {
      dataWarnings.push(
        `${approvalExceptionCount} active payment(s) are pending approval, rejected, or require review. They are excluded from approved totals and block Daily Cash Close until resolved.`,
      );
    }

    const attention = [];
    if (approvalExceptionCount) {
      attention.push({
        tone: 'warn',
        icon: 'clock',
        text: `${approvalExceptionCount} payment${approvalExceptionCount === 1 ? '' : 's'} need approval or review`,
        action: 'reg',
        label: 'Open register',
      });
    }
    if (S.offlineMode || navigator.onLine === false) {
      attention.push({
        tone: 'warn',
        icon: 'cloud-off',
        text: 'Working offline. New entries are saved on this device until you reconnect',
        action: '',
        label: '',
      });
    }
    if (malformedRecordCount || invalidAmountCount) {
      attention.push({
        tone: 'bad',
        icon: 'alert',
        text: `${malformedRecordCount + invalidAmountCount} voucher record(s) have invalid data and are excluded`,
        action: 'reg',
        label: 'Check register',
      });
    }
    if (can('cashClose')) {
      if (dailyOperationsError || !dailyOperations) {
        attention.push({
          tone: 'warn',
          icon: 'alert',
          text: "Today's physical cash readiness could not be verified",
          action: 'cashClose',
          label: 'Review cash close',
        });
      } else {
        if (Number.isSafeInteger(dailyOperations.unclassifiedCount) && dailyOperations.unclassifiedCount > 0) {
          attention.push({
            tone: 'warn',
            icon: 'alert',
            text: `${dailyOperations.unclassifiedCount} current-day voucher(s) need a verified cash-impact classification`,
            action: 'cashClose',
            label: 'Review cash close',
          });
        }
        if (Number.isSafeInteger(dailyOperations.invalidVoucherCount) && dailyOperations.invalidVoucherCount > 0) {
          attention.push({
            tone: 'bad',
            icon: 'alert',
            text: `${dailyOperations.invalidVoucherCount} current-day voucher(s) contain invalid data and block closing`,
            action: 'cashClose',
            label: 'Review cash close',
          });
        }
        if (dailyOperations.openingCashRequired === true) {
          attention.push({
            tone: 'warn',
            icon: 'wallet',
            text: 'Opening cash is required before today can be closed',
            action: 'cashClose',
            label: 'Record opening cash',
          });
        }
        if (dailyOperations.blockedByLaterClose === true) {
          attention.push({
            tone: 'bad',
            icon: 'calendar',
            text: "Today's cash close is blocked by a later closed business date",
            action: 'cashClose',
            label: 'Review cash close',
          });
        }
      }
    }

    const needsAttention = `<section class="card needs" aria-labelledby="needsTitle"><h2 id="needsTitle">Needs attention <span class="count-pill">${attention.length}</span></h2>${
      attention.length
        ? `<ul class="needs-list">${attention
            .map(
              (item) =>
                `<li class="needs-item ${item.tone}">${icon(item.icon)}<span>${esc(item.text)}</span>${item.action ? `<button type="button" class="btn" data-act="goto" data-k="${item.action}">${item.label}${icon('arrow-right')}</button>` : ''}</li>`,
            )
            .join('')}</ul>`
        : `<p class="needs-clear">${icon('check')}<span>No dashboard issues need your attention right now. Backup and recovery status are checked separately.</span></p>`
    }</section>`;

    const emptyPeriodActions = can('create')
      ? `<div class="dashboard-empty-state__actions">
          <button type="button" class="btn primary" data-act="ntype" data-k="PAYMENT">${icon('wallet')}<span>Record a payment</span>${icon('arrow-right')}</button>
          <button type="button" class="btn" data-act="ntype" data-k="RECEIPT">${icon('cash')}<span>Record a receipt</span>${icon('arrow-right')}</button>
        </div>`
      : `<div class="dashboard-empty-state__actions"><button type="button" class="btn primary" data-act="goto" data-k="reg">Open register ${icon('arrow-right')}</button></div>`;
    const emptyNextSteps = can('create')
      ? `<ol class="dashboard-empty-state__steps">
          <li><span class="dashboard-empty-state__step-number" aria-hidden="true">01</span><div><strong>Record the movement</strong><p>Choose Payment out or Cash received.</p></div></li>
          <li><span class="dashboard-empty-state__step-number" aria-hidden="true">02</span><div><strong>Capture the details</strong><p>Confirm date, amount, payee or source, and purpose. Attach a receipt image when available.</p></div></li>
          <li><span class="dashboard-empty-state__step-number" aria-hidden="true">03</span><div><strong>Follow its status</strong><p>Review the entry in Register. Payment approval remains a separate step.</p></div></li>
        </ol>`
      : `<ol class="dashboard-empty-state__steps">
          <li><span class="dashboard-empty-state__step-number" aria-hidden="true">01</span><div><strong>Confirm the date range</strong><p>Choose the dates where you expect to see recorded activity.</p></div></li>
          <li><span class="dashboard-empty-state__step-number" aria-hidden="true">02</span><div><strong>Review the register</strong><p>Inspect entries and their current approval or receipt status.</p></div></li>
          <li><span class="dashboard-empty-state__step-number" aria-hidden="true">03</span><div><strong>Escalate an exception</strong><p>Ask an owner or manager to investigate an expected entry that is not visible.</p></div></li>
        </ol>`;
    const emptyPeriodPanel = periodIsEmpty
      ? `<section class="card dashboard-empty-state" aria-labelledby="dashboardEmptyTitle" data-state="period-empty">
          <div class="dashboard-empty-state__main">
            <p class="dashboard-empty-state__eyebrow">SELECTED PERIOD</p>
            <p class="dashboard-empty-state__period">${esc(dmy(from))} <span aria-hidden="true">—</span> ${esc(dmy(to))}</p>
            <h2 id="dashboardEmptyTitle">No approved payments or recorded receipts for these dates</h2>
            <p class="dashboard-empty-state__copy">No approved payments or recorded receipts are included in the selected period’s totals.</p>
            <p class="dashboard-empty-state__scope">This is a date-filtered summary, not a statement that your full voucher book is empty. Pending or rejected payments remain separate from approved totals.</p>
            ${emptyPeriodActions}
          </div>
          <aside class="dashboard-empty-state__next" aria-label="What to do next">
            <p class="dashboard-empty-state__next-title">WHAT TO DO NEXT</p>
            ${emptyNextSteps}
          </aside>
        </section>`
      : '';
    const dashboardWarnings =
      (dataWarnings.length
        ? `<p class="muted" role="status" aria-live="polite">${dataWarnings.map(esc).join(' ')}</p>`
        : '') +
      (invalidAmountCount
        ? `<p class="muted" role="status">${invalidAmountCount} recorded voucher amount(s) are invalid and excluded from totals.</p>`
        : '');

    const operationsPanels =
      dailyCashPositionCard(dailyOperations, dailyOperationsError) +
      '<div class="dashboard-operations-grid">' +
      dailyCloseCard(dailyOperations, dailyOperationsError) +
      recentTransactionsCard(recentTransactions, recentTransactionsError, from, to) +
      '</div>';

    const financialPanels = periodIsEmpty
      ? ''
      : `
      <div class="stats dashboard-stats${can('viewAll') ? ' dashboard-stats--owner' : ' dashboard-stats--staff'}">
        <div class="card stat"><span class="stat-ic">${icon('wallet')}</span><span>Approved payments · period</span><b>${money(total)}</b><small class="dashboard-period-comparison" data-direction="${comparisonDirection}">${esc(comparisonText)}</small></div>
        <div class="card stat"><span class="stat-ic">${icon('receipt')}</span><span>Payment vouchers</span><b>${paymentCount}</b><small class="muted">avg ${money(validPaymentCount ? total / validPaymentCount : 0)}</small></div>
        <div class="card stat"><span class="stat-ic">${icon('trend')}</span><span>Largest payment</span><b>${money(summary.largest?.amount ?? 0)}</b><small class="muted">${summary.largest ? esc(summary.largest.vendor) : '–'}</small></div>
        <div class="card stat"><span class="stat-ic">${icon('clock')}</span><span>Paid today</span><b>${money(summary.todayPaid)}</b><small class="muted">${summary.todayPaymentCount} vouchers</small></div>
        <div class="card stat"><span class="stat-ic">${icon('cash')}</span><span>Receipts · period</span><b class="cash-received-value">${money(received)}</b><small class="muted">${receiptCount} recorded receipts · all methods</small></div>
        ${can('viewAll') ? `<div class="card stat"><span class="stat-ic">${icon('book')}</span><span>Book balance · all time</span><b>${money(summary.bookBalance)}</b><small class="muted">Opening balance + active receipts − approved payments; not a physical cash or bank count</small></div>` : ''}
      </div>
      ${dashboardWarnings}
      ${operationsPanels}
      <div class="dashboard-analysis-grid">
        <div class="dashboard-analysis-primary">
      <div class="card dashboard-trend"><h2>Spending trend <span class="muted">${esc(dmy(from))} – ${esc(dmy(to))}</span></h2>${trendSvg(summary.trend, from, to)}</div>
      <div class="two dashboard-breakdowns"><div class="card dashboard-breakdown"><h2>Top vendors</h2>${bars(summary.topVendors)}</div><div class="card dashboard-breakdown"><h2>By category</h2>${bars(summary.byCategory)}</div></div>
        </div>
        <aside class="dashboard-analysis-secondary" aria-label="Payment analysis">
      <div class="card dashboard-payment-methods"><h2>Approved payments by method</h2><p class="muted">Active approved payments in this period. Historical entries without a saved method appear as Not recorded.</p>${Array.isArray(summary.byPaymentMethod) ? bars(summary.byPaymentMethod, 5) : '<p class="muted">Payment-method breakdown is unavailable for this deployment.</p>'}</div>
      ${
        can('viewAll')
          ? `<div class="card dashboard-team"><h2>By team member</h2>${bars(
              summary.byTeamMember.map((row) => ({ ...row, k: nm(row.k) })),
              10,
            )}</div>`
          : ''
      }
      </aside>
      </div>
    `;

    const dashboardContent = periodIsEmpty
      ? [
          needsAttention,
          periodControls(from, to),
          emptyPeriodPanel,
          dashboardWarnings,
          operationsPanels,
        ].join('')
      : [
          needsAttention,
          periodControls(from, to),
          financialPanels,
        ].join('');

    $('#view').innerHTML =
      `<div class="dashboard-view">` +
      head(
        can('viewAll') ? 'Dashboard' : 'My Dashboard',
        `${can('create') ? '<button type="button" class="btn primary" data-act="ntype" data-k="PAYMENT">+ New entry</button>' : ''}${refreshBtn}`,
        {
          section: 'Work',
          description: 'Review approved movement, today’s drawer position and the actions that need attention.',
        },
      ) +
      `<div class="dashboard-body">${dashboardContent}</div></div>`;
  }

  return {
    render,
    state: D,
  };
}
