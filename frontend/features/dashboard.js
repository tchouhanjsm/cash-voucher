import { $ } from '../core/dom.js';
import { can, nm, pays, recs, S } from '../core/state.js';
import { addDays, dmy, esc, finiteAmount, iso, money, sumAmounts, today } from '../core/utils.js';
import { head, refreshBtn } from '../core/ui.js';

export function createDashboard() {
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

  function group(list, key) {
    const grouped = new Map();

    list.forEach((voucher) => {
      const groupKey = key(voucher);
      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, { k: groupKey, n: 0, s: 0 });
      }

      const item = grouped.get(groupKey);
      item.n++;
      item.s += finiteAmount(voucher.amount) ?? 0;
    });

    return [...grouped.values()].sort((a, b) => b.s - a.s);
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

  function render() {
    const [from, to] = range();
    const length = Math.round((new Date(to) - new Date(from)) / 864e5) + 1;
    const payments = pays();
    const current = payments.filter((voucher) => voucher.date >= from && voucher.date <= to);
    const previous = payments.filter(
      (voucher) => voucher.date >= addDays(from, -length) && voucher.date < from,
    );
    const validCurrent = current.filter((voucher) => finiteAmount(voucher.amount) !== null);
    const total = sumAmounts(current);
    const previousTotal = sumAmounts(previous);
    const delta = previousTotal ? ((total - previousTotal) / previousTotal) * 100 : null;
    const todayPayments = payments.filter((voucher) => voucher.date === today());
    const largest = current.reduce((max, voucher) => {
      const amount = finiteAmount(voucher.amount);
      return amount !== null && amount > (max ? finiteAmount(max.amount) : 0) ? voucher : max;
    }, null);
    const receipts = recs().filter((voucher) => voucher.date >= from && voucher.date <= to);
    const received = sumAmounts(receipts);
    const allReceipts = recs();
    const openingBalance = finiteAmount(S.settings.openingBalance) ?? 0;
    const cashInHand = openingBalance + sumAmounts(allReceipts) - sumAmounts(payments);
    const invalidAmountCount = [...payments, ...allReceipts].filter(
      (voucher) => finiteAmount(voucher.amount) === null,
    ).length;
    const diagnostics = S.voucherDiagnostics || {
      envelopeValid: true,
      malformedRecordCount: 0,
      malformedFieldCount: 0,
    };
    const dataWarnings = [];
    if (!diagnostics.envelopeValid) {
      dataWarnings.push(
        'Voucher data is unavailable because the server response was invalid. Refresh and retry.',
      );
    } else if (diagnostics.malformedRecordCount) {
      dataWarnings.push(
        `${diagnostics.malformedRecordCount} malformed voucher record(s) omitted from Dashboard and Register.`,
      );
    }
    if (diagnostics.malformedFieldCount) {
      dataWarnings.push(
        `${diagnostics.malformedFieldCount} malformed voucher field(s) normalized for safe display.`,
      );
    }

    $('#view').innerHTML =
      head(can('viewAll') ? 'Dashboard' : 'My Dashboard', refreshBtn) +
      `
  <div class="seg">${[
    ['7d', 'Last 7 days'],
    ['30d', 'Last 30 days'],
    ['mtd', 'This month'],
    ['lm', 'Last month'],
    ['cus', 'Custom'],
  ]
    .map(
      ([key, label]) =>
        `<button data-act="range" data-k="${key}" class="${D.r === key ? 'on' : ''}">${label}</button>`,
    )
    .join('')}</div>
  ${D.r === 'cus' ? `<div class="card filters"><label>From<input type="date" id="dFrom" value="${esc(D.from || from)}"></label><label>To<input type="date" id="dTo" value="${esc(D.to || to)}"></label><button class="btn primary" data-act="cus">Apply</button></div>` : ''}
  <div class="stats">
    <div class="card stat"><span>Total paid</span><b>${money(total)}</b><small class="${delta === null ? 'muted' : delta > 0 ? 'up' : 'down'}">${delta === null ? 'no earlier data' : (delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta).toFixed(0) + '% vs previous ' + length + ' days'}</small></div>
    <div class="card stat"><span>Vouchers</span><b>${current.length}</b><small class="muted">avg ${money(validCurrent.length ? total / validCurrent.length : 0)}</small></div>
    <div class="card stat"><span>Largest</span><b>${money(largest ? largest.amount : 0)}</b><small class="muted">${largest ? esc(largest.vendor) : '–'}</small></div>
    <div class="card stat"><span>Today</span><b>${money(sumAmounts(todayPayments))}</b><small class="muted">${todayPayments.length} vouchers</small></div>
    <div class="card stat"><span>Cash received</span><b style="color:var(--ok)">${money(received)}</b><small class="muted">${receipts.length} entries · net ${money(received - total)}</small></div>
    ${can('viewAll') ? `<div class="card stat"><span>Book balance</span><b>${money(cashInHand)}</b><small class="muted">opening balance + recorded receipts − recorded payments; not a physical cash count</small></div>` : ''}
  </div>
  ${dataWarnings.length ? `<p class="muted" role="status" aria-live="polite">${dataWarnings.map(esc).join(' ')}</p>` : ''}
  ${invalidAmountCount ? `<p class="muted" role="status">${invalidAmountCount} recorded voucher amount(s) are invalid and excluded from totals.</p>` : ''}
  <div class="card"><h2>Spending trend <span class="muted">${esc(dmy(from))} – ${esc(dmy(to))}</span></h2>${trendSvg(current, from, to)}</div>
  <div class="two"><div class="card"><h2>Top vendors</h2>${bars(group(current, (voucher) => voucher.vendor))}</div><div class="card"><h2>By category</h2>${bars(group(current, (voucher) => voucher.category || 'Other'))}</div></div>
  ${
    can('viewAll')
      ? `<div class="card"><h2>By team member</h2>${bars(
          group(current, (voucher) => nm(voucher.createdBy)),
          10,
        )}</div>`
      : ''
  }`;
  }

  return {
    render,
    state: D,
  };
}
