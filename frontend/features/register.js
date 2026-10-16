import { $ } from '../core/dom.js';
import {
  CASH_IMPACT_CHOICES,
  can,
  categories,
  isIn,
  nm,
  normalizeCashImpact,
  normalizeApprovalStatus,
  S,
  suggestCashImpact,
  bySeq,
} from '../core/state.js';
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
    approval: 'ALL',
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
          (R.approval === 'ALL' ||
            normalizeApprovalStatus(voucher.approvalStatus) === R.approval) &&
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

  function renderTotals({
    dataAvailable,
    rangeInvalid,
    unavailableTotalsMessage,
    list,
    paid,
    received,
    approvalExceptionCount,
    invalidAmountCount,
    malformedRecordCount,
    malformedFieldCount,
  }) {
    const target = $('#rtot');
    target.replaceChildren();

    const appendText = (value) => target.appendChild(document.createTextNode(value));
    const appendAmount = (value, color) => {
      const amount = document.createElement('b');
      if (color) amount.style.color = color;
      amount.textContent = value;
      target.appendChild(amount);
    };
    const appendStatus = (message) => {
      appendText(' · ');
      const status = document.createElement('span');
      status.className = 'muted';
      status.setAttribute('role', 'status');
      status.textContent = message;
      target.appendChild(status);
    };

    if (!dataAvailable || rangeInvalid) {
      const alert = document.createElement('span');
      alert.className = 'error';
      alert.setAttribute('role', 'alert');
      alert.textContent = !dataAvailable
        ? unavailableTotalsMessage
        : 'Totals unavailable: choose a start date on or before the end date.';
      target.appendChild(alert);
      return;
    }

    appendText('Paid: ');
    appendAmount(money(paid));
    appendText(' · Received: ');
    appendAmount(money(received), 'var(--ok)');
    appendText(' · Net: ');
    appendAmount(money(received - paid));
    appendText(' ');
    const count = document.createElement('span');
    count.className = 'muted';
    count.textContent = '(' + list.length + ' vouchers)';
    target.appendChild(count);

    if (approvalExceptionCount) {
      appendStatus(
        approvalExceptionCount +
          ' active payment(s) awaiting approval or requiring review are excluded from approved totals and cash close',
      );
    }
    if (invalidAmountCount) {
      appendStatus(invalidAmountCount + ' invalid amount(s) excluded from totals');
    }
    if (malformedRecordCount) {
      appendStatus(
        malformedRecordCount + ' malformed voucher record(s) omitted from Dashboard and Register',
      );
    }
    if (malformedFieldCount) {
      appendStatus(malformedFieldCount + ' malformed voucher field(s) handled for safe display');
    }
  }

  function renderRows() {
    const sourceRows = Array.isArray(S.vouchers) ? S.vouchers : [];
    const diagnostics = S.voucherDiagnostics || {
      envelopeValid: true,
      dataAvailable: true,
      unavailableReason: '',
      malformedRecordCount: 0,
      malformedFieldCount: 0,
    };
    const dataAvailable =
      diagnostics.dataAvailable !== false && diagnostics.envelopeValid !== false;
    const unavailableMessage =
      diagnostics.unavailableReason === 'offline'
        ? 'Voucher data is unavailable while offline. Reconnect and refresh to load saved vouchers.'
        : 'Voucher data is unavailable because the server response was invalid. Refresh and retry.';
    const unavailableTotalsMessage =
      diagnostics.unavailableReason === 'offline'
        ? 'Totals unavailable while offline. Reconnect and refresh to load saved vouchers.'
        : 'Totals unavailable because the voucher response was invalid. Refresh and retry.';
    const rangeInvalid = dataAvailable && Boolean(R.from && R.to && R.from > R.to);
    const list = rangeInvalid || !dataAvailable ? [] : filtered();
    const shown = list.slice(0, R.limit);
    const malformedRecordCount = Math.max(
      diagnostics.malformedRecordCount || 0,
      sourceRows.length - voucherRows().length,
    );
    const malformedFieldCount = diagnostics.malformedFieldCount || 0;
    const active = list.filter((voucher) => voucher.status === 'ACTIVE');
    const paidItems = active.filter(
      (voucher) =>
        !isIn(voucher) &&
        ['NOT_REQUIRED', 'APPROVED'].includes(normalizeApprovalStatus(voucher.approvalStatus)),
    );
    const receivedItems = active.filter(isIn);
    const approvalExceptionCount = active.filter(
      (voucher) =>
        !isIn(voucher) &&
        !['NOT_REQUIRED', 'APPROVED'].includes(normalizeApprovalStatus(voucher.approvalStatus)),
    ).length;
    const paid = sumAmounts(paidItems);
    const received = sumAmounts(receivedItems);
    const invalidAmountCount = active.filter(
      (voucher) => finiteAmount(voucher.amount) === null,
    ).length;

    renderTotals({
      dataAvailable,
      rangeInvalid,
      unavailableTotalsMessage,
      list,
      paid,
      received,
      approvalExceptionCount,
      invalidAmountCount,
      malformedRecordCount,
      malformedFieldCount,
    });
    const exportButton = $('#view [data-act="csv"]');
    if (exportButton) exportButton.disabled = rangeInvalid || !dataAvailable;

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
        const approvalStatus = isIn(voucher)
          ? 'NOT_REQUIRED'
          : normalizeApprovalStatus(voucher.approvalStatus);
        const approvalNote =
          approvalStatus === 'PENDING'
            ? ' · <span class="badge warn">PENDING APPROVAL</span>'
            : approvalStatus === 'APPROVED'
              ? ` · <span class="badge">APPROVED</span>${scalarText(voucher.approvedBy) ? ' · ' + esc(scalarText(voucher.approvedBy)) : ''}`
              : approvalStatus === 'REJECTED'
                ? ` · <span class="badge bad">REJECTED</span>${scalarText(voucher.approvalReason) ? ' · ' + esc(scalarText(voucher.approvalReason)) : ''}`
                : approvalStatus === 'REVIEW_REQUIRED'
                  ? ' · <span class="badge bad">APPROVAL REVIEW REQUIRED</span>'
                  : '';
        const canReviewApproval =
          can('approvePayments') &&
          !isIn(voucher) &&
          voucher.status === 'ACTIVE' &&
          approvalStatus === 'PENDING' &&
          scalarText(voucher.createdBy).toLowerCase() !== scalarText(S.me?.email).toLowerCase();
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
          canReviewApproval
            ? `<button class="btn sm primary" data-act="approve" data-id="${esc(voucher.id)}">Approve</button><button class="btn sm danger" data-act="reject" data-id="${esc(voucher.id)}">Reject</button>`
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
              <div class="cat">Cash impact: ${esc(normalizeCashImpact(voucher.cashImpact))}${approvalNote}</div>
            </div>
          </td>
          <td class="r nw amt${isIn(voucher) ? ' cash-impact-in' : ''}">
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
        : !dataAvailable
          ? unavailableMessage
          : voucherRows().length
            ? 'No vouchers match the current filters.'
            : 'No vouchers are available to show. If you are offline, reconnect and refresh; otherwise use New Entry to record the first payment or receipt.';
      emptyState.appendChild(message);

      if ((dataAvailable && voucherRows().length) || rangeInvalid) {
        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'btn';
        clearButton.dataset.act = 'rclear';
        clearButton.textContent = 'Clear filters';
        emptyState.appendChild(clearButton);
      }
    }

    const more = $('#rmore');
    more.replaceChildren();
    if (list.length > R.limit) {
      const actions = document.createElement('div');
      actions.className = 'actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset.act = 'more';
      button.textContent = 'Show more (' + (list.length - R.limit) + ' left)';
      actions.appendChild(button);
      more.appendChild(actions);
    }
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
      head(
        'Payment Register',
        `${can('create') ? '<button type="button" class="btn primary" data-act="ntype" data-k="PAYMENT">+ New entry</button>' : ''}${refreshBtn}`,
        {
          section: 'Work',
          description: 'Find and review recorded vouchers using the filters below.',
        },
      ) +
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
    <select id="rapproval" aria-label="Filter by approval status">${[
      ['ALL', 'All approval states'],
      ['PENDING', 'Pending approval'],
      ['APPROVED', 'Approved'],
      ['REJECTED', 'Rejected'],
      ['NOT_REQUIRED', 'Not required'],
      ['REVIEW_REQUIRED', 'Needs review'],
    ]
      .map(
        ([key, label]) =>
          `<option value="${key}"${R.approval === key ? ' selected' : ''}>${label}</option>`,
      )
      .join('')}</select>
    <button class="btn" data-act="rclear">Clear</button><button class="btn" data-act="csv">Export CSV</button></div>
    <div class="card register-results-card"><div id="rtot" class="register-totals"></div><div id="rempty" class="empty-state hidden" role="status" aria-live="polite"></div><div class="table-wrap" role="region" aria-label="Payment register vouchers" tabindex="0"><table><thead><tr><th>Voucher / Type</th><th>Date</th><th>Vendor / Details</th><th class="r">Amount</th><th>By</th><th>Actions</th></tr></thead><tbody id="rbody"></tbody></table></div><div id="rmore"></div></div>`;

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
      rapproval: 'approval',
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
      approval: 'ALL',
      limit: 100,
    });
    render();
  }

  function csvExport() {
    if (
      S.voucherDiagnostics?.dataAvailable === false ||
      S.voucherDiagnostics?.envelopeValid === false
    ) {
      toast(
        'Voucher data is unavailable. Reconnect and refresh before exporting the Register.',
        'err',
      );
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
        'CashImpact',
        'Notes',
        'Amount',
        'Status',
        'ApprovalStatus',
        'ApprovedBy',
        'ApprovedAt',
        'ApprovalReason',
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
        normalizeCashImpact(voucher.cashImpact),
        scalarText(voucher.notes),
        voucher.amount,
        voucher.status,
        normalizeApprovalStatus(voucher.approvalStatus),
        scalarText(voucher.approvedBy),
        scalarText(voucher.approvedAt),
        scalarText(voucher.approvalReason),
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

    const cashImpact = document.createElement('select');
    cashImpact.id = 'eci';
    cashImpact.required = true;
    const selectedImpact = normalizeCashImpact(voucher.cashImpact);
    if (!CASH_IMPACT_CHOICES.includes(selectedImpact)) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose cash impact…';
      placeholder.selected = true;
      placeholder.disabled = true;
      cashImpact.appendChild(placeholder);
    }
    CASH_IMPACT_CHOICES.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      cashImpact.appendChild(option);
    });
    if (CASH_IMPACT_CHOICES.includes(selectedImpact)) cashImpact.value = selectedImpact;
    body.appendChild(labeledControl('Cash impact (required)', cashImpact));

    const cashImpactHint = document.createElement('p');
    cashImpactHint.className = 'muted';
    const updateCashImpactHint = () => {
      cashImpactHint.textContent =
        'Category suggestion only: ' +
        suggestCashImpact(voucher.type, category.value) +
        '. Verify physical notes/coins movement; UPI, card, or bank transfer uses NO_CASH.';
    };
    category.addEventListener('change', updateCashImpactHint);
    updateCashImpactHint();
    body.appendChild(cashImpactHint);

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
          cashImpact: $('#eci').value,
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

  function approve(id) {
    const voucher = voucherRows().find((item) => item.id === id);
    if (!voucher || !can('approvePayments')) {
      fail(
        new Error('This payment is unavailable or you cannot approve payments. Refresh and retry.'),
      );
      return;
    }
    if (
      isIn(voucher) ||
      voucher.status !== 'ACTIVE' ||
      normalizeApprovalStatus(voucher.approvalStatus) !== 'PENDING' ||
      scalarText(voucher.createdBy).toLowerCase() === scalarText(S.me?.email).toLowerCase()
    ) {
      fail(
        new Error(
          'This payment is not eligible for your approval. Refresh the Register and review its current state.',
        ),
      );
      return;
    }
    const body = document.createDocumentFragment();
    const summary = document.createElement('p');
    const amount = document.createElement('b');
    amount.textContent = money(voucher.amount);
    summary.append(
      document.createTextNode(`${voucherNo(voucher)} · ${scalarText(voucher.vendor)} · `),
      amount,
    );
    body.appendChild(summary);
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent =
      'Approval makes this payment eligible for approved totals and daily cash close. The creator cannot approve their own voucher.';
    body.appendChild(note);
    dialog(
      `Approve payment ${voucherNo(voucher)}?`,
      body,
      async () => {
        Object.assign(voucher, await api('approveVoucher', { id }));
        closeModal();
        toast('Payment approved.', 'ok');
        go(S.view);
      },
      'Approve payment',
    );
  }

  function reject(id) {
    const voucher = voucherRows().find((item) => item.id === id);
    if (!voucher || !can('approvePayments')) {
      fail(
        new Error('This payment is unavailable or you cannot reject payments. Refresh and retry.'),
      );
      return;
    }
    if (
      isIn(voucher) ||
      voucher.status !== 'ACTIVE' ||
      normalizeApprovalStatus(voucher.approvalStatus) !== 'PENDING'
    ) {
      fail(new Error('This payment is not awaiting approval. Refresh the Register and retry.'));
      return;
    }
    const body = document.createDocumentFragment();
    const summary = document.createElement('p');
    const amount = document.createElement('b');
    amount.textContent = money(voucher.amount);
    summary.append(
      document.createTextNode(`${voucherNo(voucher)} · ${scalarText(voucher.vendor)} · `),
      amount,
    );
    body.appendChild(summary);
    const reason = document.createElement('textarea');
    reason.id = 'apr-reason';
    reason.required = true;
    reason.minLength = 3;
    reason.maxLength = 200;
    reason.rows = 3;
    body.appendChild(labeledControl('Rejection reason (required)', reason));
    dialog(
      `Reject payment ${voucherNo(voucher)}?`,
      body,
      async () => {
        Object.assign(voucher, await api('rejectVoucher', { id, reason: $('#apr-reason').value }));
        closeModal();
        toast(
          'Payment rejected. It remains visible and blocks cash close until cancelled or otherwise resolved.',
          'ok',
        );
        go(S.view);
      },
      'Reject payment',
    );
  }

  function bind() {
    $('#view').addEventListener('input', updateFilter);
    $('#view').addEventListener('change', updateFilter);
  }

  return {
    bind,
    render,
    renderRows,
    clearFilters,
    csvExport,
    edit,
    cancel,
    approve,
    reject,
    receipts,
    state: R,
  };
}
