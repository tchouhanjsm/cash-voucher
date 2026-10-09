import { $ } from '../core/dom.js';
import { can, categories, isIn, nm, S, vno, bySeq } from '../core/state.js';
import { catOpts, vendorList } from '../core/form-options.js';
import { compress, csvCell, dmy, download, esc, money, parseAmt, today } from '../core/utils.js';
import { closeModal, dialog, fail, head, refreshBtn, toast } from '../core/ui.js';

export function createRegister({ api, go }) {
  const R = {
    q: '',
    vendor: '',
    cat: '',
    user: '',
    t: '',
    from: '',
    to: '',
    st: 'ACTIVE',
    limit: 100,
  };
  const receiptCache = {};

  function filtered() {
    const query = R.q.toLowerCase();

    return S.vouchers
      .filter(
        (voucher) =>
          (R.st === 'ALL' || voucher.status === R.st) &&
          (!R.vendor || voucher.vendor === R.vendor) &&
          (!R.cat || voucher.category === R.cat) &&
          (!R.t || voucher.type === R.t) &&
          (!R.user || voucher.createdBy === R.user) &&
          (!R.from || voucher.date >= R.from) &&
          (!R.to || voucher.date <= R.to) &&
          (!query ||
            vno(voucher).toLowerCase().includes(query) ||
            voucher.vendor.toLowerCase().includes(query) ||
            voucher.notes.toLowerCase().includes(query)),
      )
      .sort(bySeq);
  }

  function renderRows() {
    const list = filtered();
    const shown = list.slice(0, R.limit);
    const active = list.filter((voucher) => voucher.status === 'ACTIVE');
    const paid = active
      .filter((voucher) => !isIn(voucher))
      .reduce((sum, voucher) => sum + voucher.amount, 0);
    const received = active.filter(isIn).reduce((sum, voucher) => sum + voucher.amount, 0);

    $('#rtot').innerHTML =
      `Paid: <b>${money(paid)}</b> · Received: <b style="color:var(--ok)">${money(received)}</b> · Net: <b>${money(received - paid)}</b> <span class="muted">(${list.length} vouchers)</span>`;

    $('#rbody').innerHTML =
      shown
        .map(
          (voucher) =>
            `<tr class="${voucher.status === 'ACTIVE' ? '' : 'cx'}"><td class="nw"><b>${vno(voucher)}</b></td><td class="nw">${esc(dmy(voucher.date))}</td>
    <td>${esc(voucher.vendor)}<div class="cat">${esc(voucher.category)}${voucher.notes ? ' · ' + esc(voucher.notes) : ''}${voucher.status !== 'ACTIVE' ? ` · <span class="badge bad">CANCELLED</span> ${esc(voucher.cancelReason)}` : ''}</div></td>
    <td class="r nw amt"${isIn(voucher) ? ' style="color:var(--ok)"' : ''}>${isIn(voucher) ? '+' : ''}${money(voucher.amount)}</td><td class="nw cat">${esc(nm(voucher.createdBy))}</td>
    <td class="r nw"><button class="btn sm" data-act="print" data-id="${esc(voucher.id)}">Print</button>
    ${voucher.receipts.length || (voucher.status === 'ACTIVE' && (can('receiptAny') || voucher.createdBy === S.me.email)) ? `<button class="btn sm" data-act="rec" data-id="${esc(voucher.id)}">📎${voucher.receipts.length || ''}</button>` : ''}
    ${voucher.status === 'ACTIVE' && can('edit') ? `<button class="btn sm" data-act="edit" data-id="${esc(voucher.id)}">Edit</button>` : ''}${voucher.status === 'ACTIVE' && can('cancel') ? `<button class="btn sm danger" data-act="cancel" data-id="${esc(voucher.id)}">Cancel</button>` : ''}</td></tr>`,
        )
        .join('') || '<tr><td colspan="6" class="muted">No payments match.</td></tr>';

    $('#rmore').innerHTML =
      list.length > R.limit
        ? `<div class="actions"><button class="btn" data-act="more">Show more (${list.length - R.limit} left)</button></div>`
        : '';
  }

  function render() {
    const vendors = [...new Set(S.vouchers.map((voucher) => voucher.vendor))].sort();
    const users = [...new Set(S.vouchers.map((voucher) => voucher.createdBy))];

    $('#view').innerHTML =
      head('Payment Register', refreshBtn) +
      `<div class="card filters" id="rf">
    <input id="rq" aria-label="Search vouchers by number, vendor or note" placeholder="Search no / vendor / note" value="${esc(R.q)}">
    <select id="rv" aria-label="Filter by vendor"><option value="">All vendors</option>${vendors.map((vendor) => `<option${vendor === R.vendor ? ' selected' : ''}>${esc(vendor)}</option>`).join('')}</select>
    <select id="rc" aria-label="Filter by category"><option value="">All categories</option>${categories()
      .map(
        (category) => `<option${category === R.cat ? ' selected' : ''}>${esc(category)}</option>`,
      )
      .join('')}</select>
    ${can('viewAll') ? `<select id="ru" aria-label="Filter by user"><option value="">All users</option>${users.map((user) => `<option value="${esc(user)}"${user === R.user ? ' selected' : ''}>${esc(nm(user))}</option>`).join('')}</select>` : ''}
    <label>From<input type="date" id="rfrom" value="${esc(R.from)}"></label><label>To<input type="date" id="rto" value="${esc(R.to)}"></label>
    <select id="rt" aria-label="Filter by transaction type"><option value="">Paid & received</option><option value="PAYMENT"${R.t === 'PAYMENT' ? ' selected' : ''}>Payments only</option><option value="RECEIPT"${R.t === 'RECEIPT' ? ' selected' : ''}>Received only</option></select>
    <select id="rs" aria-label="Filter by status">${[
      ['ACTIVE', 'Active'],
      ['CANCELLED', 'Cancelled'],
      ['ALL', 'All'],
    ]
      .map(
        ([key, label]) =>
          `<option value="${key}"${R.st === key ? ' selected' : ''}>${label}</option>`,
      )
      .join('')}</select>
    <button class="btn" data-act="rclear">Clear</button><button class="btn" data-act="csv">Export CSV</button></div>
    <div class="card"><div id="rtot" style="margin-bottom:8px"></div><div class="table-wrap"><table><thead><tr><th>No</th><th>Date</th><th>Paid to</th><th class="r">Amount</th><th>By</th><th></th></tr></thead><tbody id="rbody"></tbody></table></div><div id="rmore"></div></div>`;

    renderRows();
  }

  function updateFilter(event) {
    const mapping = {
      rq: 'q',
      rv: 'vendor',
      rc: 'cat',
      ru: 'user',
      rfrom: 'from',
      rto: 'to',
      rs: 'st',
      rt: 't',
    };
    const key = mapping[event.target.id];

    if (key && S.view === 'reg') {
      R[key] = event.target.value;
      R.limit = 100;
      renderRows();
    }
  }

  function clearFilters() {
    Object.assign(R, {
      q: '',
      vendor: '',
      cat: '',
      user: '',
      t: '',
      from: '',
      to: '',
      st: 'ACTIVE',
      limit: 100,
    });
    render();
  }

  function csvExport() {
    const rows = [
      [
        'No',
        'Type',
        'Date',
        'Vendor',
        'Category',
        'Notes',
        'Amount',
        'Status',
        'CreatedBy',
        'CreatedAt',
        'Receipts',
      ],
    ].concat(
      filtered().map((voucher) => [
        vno(voucher),
        isIn(voucher) ? 'Received' : 'Payment',
        dmy(voucher.date),
        voucher.vendor,
        voucher.category,
        voucher.notes,
        voucher.amount,
        voucher.status,
        nm(voucher.createdBy),
        voucher.createdAt,
        voucher.receipts.length,
      ]),
    );

    download(
      'vouchers-' + today() + '.csv',
      '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
      'text/csv',
    );
  }

  function edit(id) {
    const voucher = S.vouchers.find((item) => item.id === id);

    dialog(
      `Edit #${vno(voucher)}`,
      `<label>Date<input type="date" id="ed" value="${esc(voucher.date)}" required></label><label>Paid to<input id="ev" list="vlist" value="${esc(voucher.vendor)}" required></label>${vendorList()}
    <label>Amount (₹)<input id="ea" inputmode="decimal" value="${voucher.amount}" required></label><label>Category<select id="ec">${catOpts(voucher.category, voucher.type)}</select></label><label>Note<input id="en" value="${esc(voucher.notes)}"></label>`,
      async () => {
        const updated = await api('updateVoucher', {
          id,
          fields: {
            date: $('#ed').value,
            vendor: $('#ev').value,
            amount: parseAmt($('#ea').value),
            category: $('#ec').value,
            notes: $('#en').value,
          },
        });

        Object.assign(voucher, updated);
        closeModal();
        toast('Updated.', 'ok');
        go(S.view);
      },
    );
  }

  function cancel(id) {
    const voucher = S.vouchers.find((item) => item.id === id);

    dialog(
      `Cancel #${vno(voucher)}?`,
      `<p>${esc(voucher.vendor)} · <b>${money(voucher.amount)}</b></p><label>Reason (required)<input id="cr" required minlength="3" maxlength="200"></label>`,
      async () => {
        Object.assign(voucher, await api('cancelVoucher', { id, reason: $('#cr').value }));
        closeModal();
        toast('Voucher cancelled.', 'ok');
        go(S.view);
      },
      'Cancel voucher',
    );
  }

  async function receipts(id) {
    const voucher = S.vouchers.find((item) => item.id === id);
    const canAdd =
      voucher.status === 'ACTIVE' &&
      voucher.receipts.length < 3 &&
      (can('receiptAny') || voucher.createdBy === S.me.email);
    const form = dialog(
      `Receipts · #${vno(voucher)}`,
      `<div id="rimgs">${voucher.receipts.length ? '<p class="muted">Loading…</p>' : '<p class="muted">No receipts yet.</p>'}</div>${canAdd ? '<label class="btn" style="margin:0">📷 Add receipt<input type="file" id="radd" accept="image/*" hidden></label>' : ''}`,
    );

    const draw = async () => {
      const box = $('#rimgs', form);

      if (!voucher.receipts.length) return;

      box.replaceChildren();

      for (const fileId of voucher.receipts) {
        try {
          receiptCache[fileId] ||= (await api('getReceipt', { id, fileId })).dataUrl;
          const dataUrl = receiptCache[fileId];

          // Receipt data comes from the API; allow only base64-encoded raster images.
          // Build the element with DOM APIs so the value never enters an HTML attribute.
          if (!/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
            throw new Error('Receipt image response was not a supported image.');
          }

          const image = document.createElement('img');
          image.className = 'rimg';
          image.alt = 'receipt';
          image.src = dataUrl;
          box.appendChild(image);
        } catch (error) {
          const message = document.createElement('p');
          message.className = 'error';
          message.textContent = error.message || 'Could not display this receipt.';
          box.appendChild(message);
        }
      }
    };

    await draw();

    const add = $('#radd', form);

    if (add) {
      add.onchange = async () => {
        try {
          const receipt = await compress(add.files[0]);
          Object.assign(
            voucher,
            await api('addReceipt', {
              id,
              receipt: { mime: receipt.mime, data: receipt.data },
            }),
          );
          toast('Receipt added.', 'ok');
          closeModal();
          receipts(id);
        } catch (error) {
          fail(error);
        }
      };
    }
  }

  function bind() {
    $('#view').addEventListener('input', updateFilter);
  }

  return {
    bind,
    render,
    renderRows,
    clearFilters,
    csvExport,
    edit,
    cancel,
    receipts,
    state: R,
  };
}
