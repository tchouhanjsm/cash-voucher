import { $ } from '../core/dom.js';
import { can, categories, isIn, nm, S, bySeq } from '../core/state.js';
import { catOptionsNode, vendorListNode } from '../core/form-options.js';
import {
  compress,
  csvCell,
  dmy,
  download,
  esc,
  finiteAmount,
  money,
  parseAmt,
  sumAmounts,
  today,
} from '../core/utils.js';
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

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const scalarText = (value) =>
    typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
      ? String(value)
      : '';

  function voucherRows() {
    return Array.isArray(S.vouchers) ? S.vouchers.filter(isRecord) : [];
  }

  function voucherNo(voucher) {
    return (isIn(voucher) ? 'R-' : '') + scalarText(voucher.no);
  }

  function receiptMetadata(voucher) {
    const values = Array.isArray(voucher?.receipts) ? voucher.receipts : null;
    const ids = values
      ? values.filter((fileId) => typeof fileId === 'string' && fileId.trim())
      : [];

    return { ids, valid: Boolean(values) && ids.length === values.length };
  }

  function labeledControl(text, control) {
    const label = document.createElement('label');
    label.append(document.createTextNode(text), control);
    return label;
  }

  function filtered() {
    const query = R.q.toLowerCase();

    return voucherRows()
      .filter((voucher) => {
        const vendor = scalarText(voucher.vendor).toLowerCase();
        const notes = scalarText(voucher.notes).toLowerCase();
        const number = voucherNo(voucher).toLowerCase();

        return (
          (R.st === 'ALL' || voucher.status === R.st) &&
          (!R.vendor || voucher.vendor === R.vendor) &&
          (!R.cat || voucher.category === R.cat) &&
          (!R.t || voucher.type === R.t) &&
          (!R.user || voucher.createdBy === R.user) &&
          (!R.from || scalarText(voucher.date) >= R.from) &&
          (!R.to || scalarText(voucher.date) <= R.to) &&
          (!query || number.includes(query) || vendor.includes(query) || notes.includes(query))
        );
      })
      .sort(bySeq);
  }

  function renderRows() {
    const sourceRows = Array.isArray(S.vouchers) ? S.vouchers : [];
    const diagnostics = S.voucherDiagnostics || {
      envelopeValid: true,
      malformedRecordCount: 0,
      malformedFieldCount: 0,
    };
    const rangeInvalid = diagnostics.envelopeValid && Boolean(R.from && R.to && R.from > R.to);
    const list = rangeInvalid || !diagnostics.envelopeValid ? [] : filtered();
    const shown = list.slice(0, R.limit);
    const malformedRecordCount = Math.max(
      diagnostics.malformedRecordCount || 0,
      sourceRows.length - voucherRows().length,
    );
    const malformedFieldCount = diagnostics.malformedFieldCount || 0;
    const active = list.filter((voucher) => voucher.status === 'ACTIVE');
    const paidItems = active.filter((voucher) => !isIn(voucher));
    const receivedItems = active.filter(isIn);
    const paid = sumAmounts(paidItems);
    const received = sumAmounts(receivedItems);
    const invalidAmountCount = active.filter(
      (voucher) => finiteAmount(voucher.amount) === null,
    ).length;

    const malformedRecordMessage = !diagnostics.envelopeValid
      ? ' · <span class="muted" role="status">Voucher data is unavailable because the server response was invalid. Refresh and retry.</span>'
      : [
          malformedRecordCount
            ? `<span class="muted" role="status">${malformedRecordCount} malformed voucher record(s) omitted from Dashboard and Register</span>`
            : '',
          malformedFieldCount
            ? `<span class="muted" role="status">${malformedFieldCount} malformed voucher field(s) handled for safe display</span>`
            : '',
        ]
          .filter(Boolean)
          .map((message) => ' · ' + message)
          .join('');

    $('#rtot').innerHTML = !diagnostics.envelopeValid
      ? '<span class="error" role="alert">Totals unavailable because the voucher response was invalid. Refresh and retry.</span>'
      : rangeInvalid
        ? '<span class="error" role="alert">Totals unavailable: choose a start date on or before the end date.</span>'
        : `Paid: <b>${money(paid)}</b> · Received: <b style="color:var(--ok)">${money(received)}</b> · Net: <b>${money(received - paid)}</b> <span class="muted">(${list.length} vouchers)</span>${invalidAmountCount ? ` · <span class="muted" role="status">${invalidAmountCount} invalid amount(s) excluded from totals</span>` : ''}${malformedRecordMessage}`;
    const exportButton = $('#view [data-act="csv"]');
    if (exportButton) exportButton.disabled = rangeInvalid || !diagnostics.envelopeValid;

    $('#rbody').innerHTML = shown
      .map((voucher) => {
        const receiptState = receiptMetadata(voucher);
        const receiptCount = receiptState.ids.length;
        const receiptWarning = receiptState.valid
          ? ''
          : ' · <span class="muted" role="status">Receipt metadata unavailable</span>';
        const receiptAction =
          receiptCount ||
          (voucher.status === 'ACTIVE' && (can('receiptAny') || voucher.createdBy === S.me.email));
        const kind = isIn(voucher) ? 'Receipt' : 'Payment';
        const cancelledNote =
          voucher.status === 'ACTIVE'
            ? ''
            : ` · <span class="badge bad">CANCELLED</span> ${esc(scalarText(voucher.cancelReason))}`;
        const actions = [
          `<button class="btn sm" data-act="print" data-id="${esc(voucher.id)}">Print</button>`,
          receiptAction
            ? `<button
                class="btn sm"
                data-act="rec"
                data-id="${esc(voucher.id)}"
                aria-label="Receipts for ${esc(voucherNo(voucher))}"
              >${!receiptState.valid ? '📎 Check receipts' : receiptCount ? '📎 ' + receiptCount : '📎 Add receipt'}</button>`
            : '',
          voucher.status === 'ACTIVE' && can('edit')
            ? `<button class="btn sm" data-act="edit" data-id="${esc(voucher.id)}">Edit</button>`
            : '',
          voucher.status === 'ACTIVE' && can('cancel')
            ? `<button class="btn sm danger" data-act="cancel" data-id="${esc(voucher.id)}">Cancel</button>`
            : '',
        ]
          .filter(Boolean)
          .join('');
        return `<tr class="voucher-row ${voucher.status === 'ACTIVE' ? '' : 'cx'}">
          <td class="nw">
            <b>${esc(voucherNo(voucher))}</b>
            <div class="cat voucher-kind">${kind}</div>
          </td>
          <td class="nw">${esc(dmy(scalarText(voucher.date)))}</td>
          <td>
            <span class="voucher-vendor">${esc(scalarText(voucher.vendor))}</span>
            <div class="cat">
              ${esc(scalarText(voucher.category))}${scalarText(voucher.notes) ? ' · ' + esc(scalarText(voucher.notes)) : ''}${receiptWarning}${cancelledNote}
            </div>
          </td>
          <td
            class="r nw amt"
            ${isIn(voucher) ? 'style="color:var(--ok)"' : ''}
          >
            <span class="voucher-amount">
              ${isIn(voucher) ? '+' : '−'}${money(voucher.amount)}
            </span>
          </td>
          <td class="nw cat">${esc(nm(scalarText(voucher.createdBy)))}</td>
          <td>
            <div
              class="voucher-actions"
              role="group"
              aria-label="Actions for ${esc(voucherNo(voucher))}"
            >${actions}</div>
          </td>
        </tr>`;
      })
      .join('');

    const emptyState = $('#rempty');
    emptyState.replaceChildren();
    emptyState.setAttribute('role', rangeInvalid ? 'alert' : 'status');
    emptyState.setAttribute('aria-live', rangeInvalid ? 'assertive' : 'polite');

    if (shown.length) {
      emptyState.classList.add('hidden');
    } else {
      emptyState.classList.remove('hidden');
      const message = document.createElement('span');
      message.className = 'empty-state-message';
      message.textContent = rangeInvalid
        ? 'The start date must be on or before the end date. Correct the range or clear filters.'
        : !diagnostics.envelopeValid
          ? 'Voucher data is unavailable because the server response was invalid. Refresh and retry.'
          : voucherRows().length
            ? 'No vouchers match the current filters.'
            : 'No vouchers are available to show. If you are offline, reconnect and refresh; otherwise use New Entry to record the first payment or receipt.';
      emptyState.appendChild(message);

      if ((diagnostics.envelopeValid && voucherRows().length) || rangeInvalid) {
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
    const vouchers = voucherRows();
    const vendors = [
      ...new Set(vouchers.map((voucher) => scalarText(voucher.vendor)).filter(Boolean)),
    ].sort();
    const users = [
      ...new Set(vouchers.map((voucher) => scalarText(voucher.createdBy)).filter(Boolean)),
    ];

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
    <div class="card"><div id="rtot" style="margin-bottom:8px"></div><div id="rempty" class="empty-state hidden" role="status" aria-live="polite"></div><div class="table-wrap"><table><thead><tr><th>Voucher / Type</th><th>Date</th><th>Vendor / Details</th><th class="r">Amount</th><th>By</th><th>Actions</th></tr></thead><tbody id="rbody"></tbody></table></div><div id="rmore"></div></div>`;

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
    if (S.voucherDiagnostics?.envelopeValid === false) {
      toast('Voucher data is unavailable. Refresh before exporting the Register.', 'err');
      return;
    }
    if (R.from && R.to && R.from > R.to) {
      toast('Correct the register date range before exporting.', 'err');
      return;
    }

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
        voucherNo(voucher),
        isIn(voucher) ? 'Received' : 'Payment',
        dmy(scalarText(voucher.date)),
        scalarText(voucher.vendor),
        scalarText(voucher.category),
        scalarText(voucher.notes),
        voucher.amount,
        voucher.status,
        nm(voucher.createdBy),
        voucher.createdAt,
        receiptMetadata(voucher).ids.length,
      ]),
    );

    download(
      'vouchers-' + today() + '.csv',
      '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
      'text/csv',
    );
  }

  function edit(id) {
    const voucher = voucherRows().find((item) => item.id === id);

    const body = document.createDocumentFragment();

    const date = document.createElement('input');
    date.type = 'date';
    date.id = 'ed';
    date.value = scalarText(voucher.date);
    date.required = true;
    body.appendChild(labeledControl('Date', date));

    const vendor = document.createElement('input');
    vendor.id = 'ev';
    vendor.setAttribute('list', 'vlist');
    vendor.value = scalarText(voucher.vendor);
    vendor.required = true;
    body.append(labeledControl('Paid to', vendor), vendorListNode());

    const amount = document.createElement('input');
    amount.id = 'ea';
    amount.inputMode = 'decimal';
    amount.value = scalarText(voucher.amount);
    amount.required = true;
    body.appendChild(labeledControl('Amount (₹)', amount));

    const category = document.createElement('select');
    category.id = 'ec';
    category.appendChild(catOptionsNode(scalarText(voucher.category), voucher.type));
    body.appendChild(labeledControl('Category', category));

    const note = document.createElement('input');
    note.id = 'en';
    note.value = scalarText(voucher.notes);
    body.appendChild(labeledControl('Note', note));

    const reason = document.createElement('textarea');
    reason.id = 'er';
    reason.required = true;
    reason.minLength = 3;
    reason.maxLength = 200;
    reason.rows = 3;
    body.appendChild(labeledControl('Correction reason (required)', reason));

    dialog(`Edit #${voucherNo(voucher)}`, body, async () => {
      const updated = await api('updateVoucher', {
        id,
        reason: $('#er').value,
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
    });
  }

  function cancel(id) {
    const voucher = voucherRows().find((item) => item.id === id);

    const body = document.createDocumentFragment();
    const summary = document.createElement('p');
    const amountSummary = document.createElement('b');
    amountSummary.textContent = money(voucher.amount);
    summary.append(document.createTextNode(`${scalarText(voucher.vendor)} · `), amountSummary);

    const reason = document.createElement('input');
    reason.id = 'cr';
    reason.required = true;
    reason.minLength = 3;
    reason.maxLength = 200;
    body.append(summary, labeledControl('Reason (required)', reason));

    dialog(
      `Cancel #${voucherNo(voucher)}?`,
      body,
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
    const voucher = voucherRows().find((item) => item.id === id);
    if (!voucher) {
      fail(new Error('Voucher record is unavailable. Refresh the register and retry.'));
      return;
    }

    const receiptState = receiptMetadata(voucher);
    const canAdd =
      receiptState.valid &&
      voucher.status === 'ACTIVE' &&
      receiptState.ids.length < 3 &&
      (can('receiptAny') || voucher.createdBy === S.me.email);
    const body = document.createDocumentFragment();
    const images = document.createElement('div');
    images.id = 'rimgs';
    images.setAttribute('aria-live', 'polite');
    body.appendChild(images);

    if (canAdd) {
      const addLabel = document.createElement('label');
      addLabel.className = 'btn';
      addLabel.style.margin = '0';
      addLabel.appendChild(document.createTextNode('📷 Add receipt'));

      const addInput = document.createElement('input');
      addInput.type = 'file';
      addInput.id = 'radd';
      addInput.accept = 'image/*';
      addInput.hidden = true;
      addLabel.appendChild(addInput);
      body.appendChild(addLabel);
    }

    const form = dialog(`Receipts · #${voucherNo(voucher)}`, body);

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

      if (!receiptState.valid) {
        const message = document.createElement('p');
        message.className = 'error receipt-error';
        message.setAttribute('role', 'alert');
        message.textContent =
          'Receipt metadata is missing or malformed. Close this dialog, refresh the register, and retry before adding or opening receipts.';
        box.appendChild(message);
        return;
      }

      if (!receiptState.ids.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No receipts yet.';
        box.appendChild(empty);
        return;
      }

      const items = receiptState.ids.map(() => {
        const item = document.createElement('div');
        item.className = 'receipt-item';
        box.appendChild(item);
        return item;
      });

      await Promise.all(receiptState.ids.map((fileId, index) => loadReceipt(fileId, items[index])));
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
