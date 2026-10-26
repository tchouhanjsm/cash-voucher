import { $ } from '../core/dom.js';
import { can, nm, S } from '../core/state.js';
import { addDays, dmy, esc, finiteAmount, iso, money, today } from '../core/utils.js';
import { head, icon, refreshBtn } from '../core/ui.js';

export function createDashboard({ api }) {
  const D = { r: '30d', from: '', to: '' };

  function range() {
    const current = today();
    const date = new Date();
    const monthStart = iso(new Date(date.getFullYear(), date.getMonth(), 1));

    if (D.r === '7d') return [addDays(current, -6), current];
    if (D.r === 'mtd') return [monthStart, current];

    if (D.r === 'lm') {
      const first = new Date(date.getFullYear(), date.getMonth() - 1, 1);
      const last = new Date(date.getFullYear(), date.getMonth(), 0);
      return [iso(first), iso(last)];
    }

    if (D.r === 'cus' && D.from && D.to) return [D.from, D.to];

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
      const date = new Date(from.slice(0, 7) + '-01T12:00:00');
      const end = to.slice(0, 7);

      while (iso(date).slice(0, 7) <= end) {
        keys.push(iso(date).slice(0, 7));
        date.setMonth(date.getMonth() + 1);
      }
    } else {
      for (let index = 0; index < days; index++) {
        keys.push(addDays(from, index));
      }
    }

    const values = keys.map((key) => amounts.get(key) || 0);
    const max = Math.max(1, ...values);
    const width = Math.max(280, Math.min(1100, innerWidth - (innerWidth > 800 ? 262 : 24) - 34));
    const height = 190;
    const left = 8;
    const bottom = 22;
    const barWidth = (width - left * 2) / keys.length;
    const step = Math.ceil(keys.length / Math.max(3, Math.floor(width / 70)));

    return (
      `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Spending trend">` +
      keys
        .map((key, index) => {
          const barHeight = Math.max(
            values[index] ? 2 : 0,
            (values[index] / max) * (height - bottom - 18),
          );

          return (
            `<rect class="b" x="${left + index * barWidth + 1}" y="${height - bottom - barHeight}" width="${Math.max(1, barWidth - 2)}" height="${barHeight}" rx="2"><title>${esc(monthly ? key : dmy(key))}: ${money(values[index])}</title></rect>` +
            (index % step === 0
              ? `<text x="${left + index * barWidth}" y="${height - 6}">${esc(monthly ? key : key.slice(8) + '/' + key.slice(5, 7))}</text>`
              : '')
          );
        })
        .join('') +
      `<text x="${left}" y="11">Peak ${money(max)}</text></svg>`
    );
  }

  let summaryRequestId = 0;

  function periodControls(from, to) {
    return `
      <div class="seg dashboard-period">${[
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
          typeof data.laterCloseDate === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(data.laterCloseDate)
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
        details.push('Server-side checks pass. Verify the physical drawer count before finalizing.');
      }
      if (!details.length) {
        details.push('Readiness is not established. Review the full close screen before taking action.');
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
    const dailyOperationsRequest = can('cashClose')
      ? api('dailyOperationsSummary').then(
          (data) => ({ data }),
          (error) => ({ error }),
        )
      : Promise.resolve(null);
    try {
      const results = await Promise.all([
        api('dashboardSummary', { from, to }),
        dailyOperationsRequest,
      ]);
      summary = results[0];
      if (results[1]) {
        dailyOperations = results[1].data || null;
        dailyOperationsError = results[1].error || null;
      }
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
    const total = finiteAmount(summary.paid) ?? 0;
    const previousTotal = finiteAmount(summary.previousPaid) ?? 0;
    const delta = previousTotal ? ((total - previousTotal) / previousTotal) * 100 : null;
    const paymentCount = Number.isSafeInteger(summary.paymentCount) ? summary.paymentCount : 0;
    const validPaymentCount = Number.isSafeInteger(summary.validPaymentCount)
      ? summary.validPaymentCount
      : 0;
    const received = finiteAmount(summary.received) ?? 0;
    const approvalExceptionCount = Number(summary.approvalExceptionCount) || 0;
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

    const needsAttention = `<section class="card needs" aria-labelledby="needsTitle"><h2 id="needsTitle">Needs attention <span class="count-pill">${attention.length}</span></h2>${
      attention.length
        ? `<ul class="needs-list">${attention
            .map(
              (item) =>
                `<li class="needs-item ${item.tone}">${icon(item.icon)}<span>${esc(item.text)}</span>${item.action ? `<button type="button" class="btn" data-act="goto" data-k="${item.action}">${item.label}${icon('arrow-right')}</button>` : ''}</li>`,
            )
            .join('')}</ul>`
        : `<p class="needs-clear">${icon('check')}<span>No known dashboard exceptions were found in the checks shown here. This does not verify backups, the full recovery queue, or release readiness.</span></p>`
    }</section>`;

    const financialPanels = `
      <div class="stats dashboard-stats">
        <div class="card stat"><span class="stat-ic">${icon('wallet')}</span><span>Total paid</span><b>${money(total)}</b><small class="${delta === null ? 'muted' : delta > 0 ? 'up' : 'down'}">${delta === null ? 'no earlier data' : (delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta).toFixed(0) + '% vs previous ' + length + ' days'}</small></div>
        <div class="card stat"><span class="stat-ic">${icon('receipt')}</span><span>Vouchers</span><b>${paymentCount}</b><small class="muted">avg ${money(validPaymentCount ? total / validPaymentCount : 0)}</small></div>
        <div class="card stat"><span class="stat-ic">${icon('trend')}</span><span>Largest</span><b>${money(summary.largest?.amount || 0)}</b><small class="muted">${summary.largest ? esc(summary.largest.vendor) : '–'}</small></div>
        <div class="card stat"><span class="stat-ic">${icon('clock')}</span><span>Today</span><b>${money(summary.todayPaid || 0)}</b><small class="muted">${Number(summary.todayPaymentCount) || 0} vouchers</small></div>
        <div class="card stat"><span class="stat-ic">${icon('cash')}</span><span>Cash received</span><b class="cash-received-value">${money(received)}</b><small class="muted">${Number(summary.receiptCount) || 0} entries · net ${money(received - total)}</small></div>
        ${can('viewAll') ? `<div class="card stat"><span class="stat-ic">${icon('book')}</span><span>Book balance</span><b>${money(summary.bookBalance || 0)}</b><small class="muted">opening balance + recorded receipts − approved recorded payments; not a physical cash count</small></div>` : ''}
      </div>
      ${dataWarnings.length ? `<p class="muted" role="status" aria-live="polite">${dataWarnings.map(esc).join(' ')}</p>` : ''}
      ${invalidAmountCount ? `<p class="muted" role="status">${invalidAmountCount} recorded voucher amount(s) are invalid and excluded from totals.</p>` : ''}
      <div class="card dashboard-trend"><h2>Spending trend <span class="muted">${esc(dmy(from))} – ${esc(dmy(to))}</span></h2>${trendSvg(summary.trend || [], from, to)}</div>
      <div class="two dashboard-breakdowns"><div class="card dashboard-breakdown"><h2>Top vendors</h2>${bars(summary.topVendors || [])}</div><div class="card dashboard-breakdown"><h2>By category</h2>${bars(summary.byCategory || [])}</div></div>
      ${
        can('viewAll')
          ? `<div class="card dashboard-team"><h2>By team member</h2>${bars(
              (summary.byTeamMember || []).map((row) => ({ ...row, k: nm(row.k) })),
              10,
            )}</div>`
          : ''
      }
    `;

    $('#view').innerHTML =
      `<div class="dashboard-view">` +
      head(
        can('viewAll') ? 'Dashboard' : 'My Dashboard',
        `${can('create') ? '<button type="button" class="btn primary" data-act="ntype" data-k="PAYMENT">+ New entry</button>' : ''}${refreshBtn}`,
        {
          section: 'Work',
          description: 'Review saved payment and receipt activity for the selected period.',
        },
      ) +
      `<div class="dashboard-body">${needsAttention}${dailyCloseCard(dailyOperations, dailyOperationsError)}${periodControls(from, to)}${financialPanels}</div></div>`;
  }

  return {
    render,
    state: D,
  };
}
