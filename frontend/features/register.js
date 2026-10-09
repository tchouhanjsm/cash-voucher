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

    $('#rbody').innerHTML = shown
      .map(
        (voucher) =>
          `<tr class="${voucher.status === 'ACTIVE' ? '' : 'cx'}"><td class="nw"><b>${vno(voucher)}</b></td><td class="nw">${esc(dmy(voucher.date))}</td>
    <td>${esc(voucher.vendor)}<div class="cat">${esc(voucher.category)}${voucher.notes ? ' · ' + esc(voucher.notes) : ''}${voucher.status !== 'ACTIVE' ? ` · <span class="badge bad">CANCELLED</span> ${esc(voucher.cancelReason)}` : ''}</div></td>
    <td class="r nw amt"${isIn(voucher) ? ' style="color:var(--ok)"' : ''}>${isIn(voucher) ? '+' : ''}${money(voucher.amount)}</td><td class="nw cat">${esc(nm(voucher.createdBy))}</td>
    <td class="r nw"><button class="btn sm" data-act="print" data-id="${esc(voucher.id)}">Print</button>
    ${voucher.receipts.length || (voucher.status === 'ACTIVE' && (can('receiptAny') || voucher.createdBy === S.me.email)) ? `<button class="btn sm" data-act="rec" data-id="${esc(voucher.id)}">📎${voucher.receipts.length || ''}</button>` : ''}
    ${voucher.status === 'ACTIVE' && can('edit') ? `<button class="btn sm" data-act="edit" data-id="${esc(voucher.id)}">Edit</button>` : ''}${voucher.status === 'ACTIVE' && can('cancel') ? `<button class="btn sm danger" data-act="cancel" data-id="${esc(voucher.id)}">Cancel</button>` : ''}</td></tr>`,
      )
      .join('');

    const emptyState = $('#rempty');
    emptyState.replaceChildren();

    if (shown.length) {
      emptyState.classList.add('hidden');
    } else {
      emptyState.classList.remove('hidden');
      const message = document.createElement('span');
      message.className = 'empty-state-message';
      message.textContent = S.vouchers.length
        ? 'No vouchers match the current filters.'
        : 'No vouchers are available to show. If you are offline, reconnect and refresh; otherwise use New Entry to record the first payment or receipt.';
      emptyState.appendChild(message);

      if (S.vouchers.length) {
        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'btn';
        clearButton.dataset.act = 'rclear';
        clearButton.textContent = 'Clear filters';
        emptyState.appendChild(clearButton);
      }
    }

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
    <div class="card"><div id="rtot" style="margin-bottom:8px"></div><div id="rempty" class="empty-state hidden" role="status" aria-live="polite"></div><div class="table-wrap"><table><thead><tr><th>No</th><th>Date</th><th>Paid to</th><th class="r">Amount</th><th>By</th><th></th></tr></thead><tbody id="rbody"></tbody></table></div><div id="rmore"></div></div>`;

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
      `<div id="rimgs" aria-live="polite"></div>${canAdd ? '<label class="btn" style="margin:0">📷 Add receipt<input type="file" id="radd" accept="image/*" hidden></label>' : ''}`,
    );

    const loadReceipt = async (fileId, item) => {
      item.replaceChildren();
      const status = document.createElement('p');
      status.className = 'muted receipt-status';
      status.setAttribute('role', 'status');
      status.textContent = 'Loading receipt…';
      item.appendChild(status);

      try {
        let dataUrl = receiptCache[fileId];
        if (!dataUrl) {
          dataUrl = (await api('getReceipt', { id, fileId })).dataUrl;
        }

        // Receipt data comes from the API; allow only base64-encoded raster images.
        // Build the element with DOM APIs so the value never enters an HTML attribute.
        if (!/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
          throw new Error('Receipt image response was not a supported image.');
        }

        receiptCache[fileId] = dataUrl;
        const image = document.createElement('img');
        image.className = 'rimg';
        image.alt = 'Receipt image';
        image.src = dataUrl;
        item.replaceChildren(image);
      } catch (error) {
        item.replaceChildren();
        const message = document.createElement('p');
        message.className = 'error receipt-error';
        message.setAttribute('role', 'alert');
        message.textContent = error.message || 'Could not display this receipt.';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'btn';
        retry.dataset.act = 'retry-receipt';
        retry.textContent = 'Retry loading receipt';
        retry.onclick = () => {
          retry.disabled = true;
          loadReceipt(fileId, item);
        };
        item.append(message, retry);
      }
    };

    const draw = async () => {
      const box = $('#rimgs', form);
      box.replaceChildren();

      if (!voucher.receipts.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No receipts yet.';
        box.appendChild(empty);
        return;
      }

      const items = voucher.receipts.map(() => {
        const item = document.createElement('div');
        item.className = 'receipt-item';
        box.appendChild(item);
        return item;
      });

      await Promise.all(
        voucher.receipts.map((fileId, index) => loadReceipt(fileId, items[index])),
      );
    };

    await draw();

    const add = $('#radd', form);

    if (add) {
      add.onchange = async () => {
        if (!add.files?.length) return;

        add.disabled = true;
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
        } finally {
          if (add.isConnected) add.disabled = false;
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
