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

  function periodControls(from, to, loading = false) {
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
      ${D.r === 'cus' ? `<div class="card filters"><label>From<input type="date" id="dFrom" value="${esc(D.from || from)}"></label><label>To<input type="date" id="dTo" value="${esc(D.to || to)}"></label><button type="button" class="btn primary" data-act="cus">Apply</button></div>` : ''}
      ${loading ? '<div class="card" role="status" aria-live="polite">Calculating the dashboard from the latest saved ledger…</div>' : ''}`;
  }

  async function render() {
    const requestId = ++summaryRequestId;
    const [from, to] = range();

    if (!from || !to || from > to) {
      $('#view').innerHTML =
        '<div class="dashboard-view">' +
        head(can('viewAll') ? 'Dashboard' : 'My Dashboard', refreshBtn) +
        '<div class="dashboard-body">' +
        periodControls(from || today(), to || today()) +
        '<div class="card error" role="alert">Choose a valid date range before loading dashboard totals.</div></div></div>';
      return;
    }

    $('#view').innerHTML =
      '<div class="dashboard-view">' +
      head(
        can('viewAll') ? 'Dashboard' : 'My Dashboard',
        `${can('create') ? '<button type="button" class="btn primary" data-act="ntype" data-k="PAYMENT">+ New entry</button>' : ''}${refreshBtn}`,
        {
          section: 'Work',
          description: 'Review saved payment and receipt activity for the selected period.',
        },
      ) +
      '<div class="dashboard-body">' +
      periodControls(from, to, true) +
      '</div></div>';

    let summary;
    try {
      summary = await api('dashboardSummary', { from, to });
    } catch (error) {
      if (requestId !== summaryRequestId || S.view !== 'dash') return;
      $('#view').innerHTML =
        '<div class="dashboard-view">' +
        head(
          can('viewAll') ? 'Dashboard' : 'My Dashboard',
          `${can('create') ? '<button type="button" class="btn primary" data-act="ntype" data-k="PAYMENT">+ New entry</button>' : ''}${refreshBtn}`,
          {
            section: 'Work',
            description: 'Review saved payment and receipt activity for the selected period.',
          },
        ) +
        '<div class="dashboard-body">' +
        periodControls(from, to) +
        `<div class="card" role="alert"><h2>Dashboard totals unavailable</h2><p>${esc(error?.message || 'The server could not calculate the dashboard. Refresh and retry.')}</p></div></div></div>`;
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
    const invalidAmountCount = Number(summary.invalidAmountCount) || 0;
    const malformedRecordCount = Number(summary.malformedRecordCount) || 0;
    const malformedFieldCount = Number(summary.malformedFieldCount) || 0;
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

    const needsAttention =
      `<section class="card needs" aria-labelledby="needsTitle"><h2 id="needsTitle">Needs attention <span class="count-pill">${attention.length}</span></h2>${
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
      ${can('viewAll') ? `<div class="card dashboard-team"><h2>By team member</h2>${bars((summary.byTeamMember || []).map((row) => ({ ...row, k: nm(row.k) })), 10)}</div>` : ''}
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
      `<div class="dashboard-body">${needsAttention}${periodControls(from, to)}${financialPanels}</div></div>`;
  }

  return {
    render,
    state: D,
  };
}
