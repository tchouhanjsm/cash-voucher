import { $ } from '../core/dom.js';
import {
  CASH_IMPACT_CHOICES,
  can,
  categories,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_FILTER_OPTIONS,
  paymentMethodLabel,
  isIn,
  nm,
  normalizeCashImpact,
  normalizeApprovalStatus,
  S,
  suggestCashImpact,
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
    paymentMethod: 'ALL',
    limit: 100,
  };
  const receiptCache = {};
  let pageRows = [];
  let pageTotalCount = 0;
  let pageTotals = null;
  let pageFacets = { vendors: [], users: [] };
  let pageRequestSequence = 0;
  let pageLoading = false;
  let pageError = null;
  let filterDebounce = null;

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const scalarText = (value) =>
    typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
      ? String(value)
      : '';

  function voucherRows() {
    return Array.isArray(pageRows) ? pageRows.filter(isRecord) : [];
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

  // The server has already applied the user's filters and authorization scope.
  function filtered() {
    return voucherRows();
  }

  function renderTotals({
    dataAvailable,
    rangeInvalid,
    unavailableTotalsMessage,
    paid,
    received,
    approvalExceptionCount,
    invalidAmountCount,
    malformedRecordCount,
    malformedFieldCount,
    totalCount,
  }) {
    const target = $('#rtot');
    if (!target) return;
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
    count.textContent = '(' + totalCount + ' vouchers)';
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

  function queryFilters(offset, limit) {
    return {
      q: R.q,
      vendor: R.vendor,
      cat: R.cat,
      user: R.user,
      t: R.t,
      from: R.from,
      to: R.to,
      st: R.st,
      approval: R.approval,
      paymentMethod: R.paymentMethod,
      offset,
      limit,
    };
  }

  function syncFacets() {
    const syncSelect = (select, placeholder, options, labelFor, selectedValue) => {
      const fragment = document.createDocumentFragment();
      const first = document.createElement('option');
      first.value = '';
      first.textContent = placeholder;
      fragment.appendChild(first);
      options.forEach((item) => {
        const option = document.createElement('option');
        option.value = item;
        option.textContent = labelFor(item);
        fragment.appendChild(option);
      });
      select.replaceChildren(fragment);
      select.value = selectedValue;
    };

    const vendorSelect = $('#rv');
    if (vendorSelect) {
      const vendors = Array.isArray(pageFacets.vendors) ? pageFacets.vendors : [];
      syncSelect(vendorSelect, 'All vendors', vendors, (vendor) => vendor, R.vendor);
    }

    const userSelect = $('#ru');
    if (userSelect && can('viewAll')) {
      const users = Array.isArray(pageFacets.users) ? pageFacets.users : [];
      syncSelect(userSelect, 'All users', users, (user) => nm(user), R.user);
    }
  }

  async function renderRows(options = {}) {
    // A debounced filter can fire after navigation has detached the Register.
    if (S.view !== 'reg' || !$('#rbody')) return;

    const append = options.append === true;
    const requestId = ++pageRequestSequence;
    const diagnostics = S.voucherDiagnostics || {};
    const bootstrapUnavailable =
      S.offlineMode ||
      navigator.onLine === false ||
      diagnostics.dataAvailable === false ||
      diagnostics.envelopeValid === false;
    const rangeInvalid = Boolean(R.from && R.to && R.from > R.to);

    pageError = null;
    if (bootstrapUnavailable) {
      pageRows = [];
      pageTotalCount = 0;
      pageTotals = null;
      pageLoading = false;
      R.limit = 100;
      drawRows();
      return;
    }
    if (rangeInvalid) {
      pageRows = [];
      pageTotalCount = 0;
      pageTotals = null;
      pageLoading = false;
      R.limit = 100;
      drawRows();
      return;
    }

    const offset = append ? pageRows.length : 0;
    if (!append) {
      pageRows = [];
      pageTotalCount = 0;
      pageTotals = null;
      R.limit = 100;
      pageLoading = true;
      drawRows();
    } else {
      const moreButton = $('#view [data-act="more"]');
      if (moreButton) moreButton.disabled = true;
    }

    try {
      const result = await api('registerPage', queryFilters(offset, 100));
      if (requestId !== pageRequestSequence || S.view !== 'reg') return;

      const items = Array.isArray(result?.items) ? result.items.filter(isRecord) : [];
      pageRows = append ? pageRows.concat(items) : items;
      pageTotalCount =
        Number.isSafeInteger(result?.totalCount) && result.totalCount >= 0
          ? result.totalCount
          : pageRows.length;
      pageTotals = result?.totals && typeof result.totals === 'object' ? result.totals : {};
      pageFacets =
        result?.facets && typeof result.facets === 'object'
          ? result.facets
          : { vendors: [], users: [] };
      R.limit = pageRows.length;
      pageLoading = false;
      pageError = null;
      syncFacets();
      drawRows();
    } catch (error) {
      if (requestId !== pageRequestSequence || S.view !== 'reg') return;
      pageRows = [];
      pageTotalCount = 0;
      pageTotals = null;
      pageLoading = false;
      pageError = error;
      drawRows();
    }
  }

  function loadMore() {
    if (pageLoading || pageRows.length >= pageTotalCount || pageError) return;
    return renderRows({ append: true });
  }

  function drawRows() {
    // Stale callbacks must never attempt to render into a detached Register surface.
    if (S.view !== 'reg' || !$('#rbody')) return;

    const diagnostics = S.voucherDiagnostics || {};
    const dataAvailable =
      !pageError &&
      !S.offlineMode &&
      diagnostics.dataAvailable !== false &&
      diagnostics.envelopeValid !== false;
    const offlineUnavailable =
      S.offlineMode || diagnostics.unavailableReason === 'offline' || navigator.onLine === false;
    const unavailableMessage =
      pageError?.message ||
      (offlineUnavailable
        ? 'Voucher data is unavailable while offline. Reconnect and refresh to load saved vouchers.'
        : 'Voucher data is unavailable because the server response was invalid. Refresh and retry.');
    const unavailableTotalsMessage =
      pageError?.message ||
      (offlineUnavailable
        ? 'Totals unavailable while offline. Reconnect and refresh to load saved vouchers.'
        : 'Totals unavailable because the voucher response was invalid.');
    const rangeInvalid = dataAvailable && Boolean(R.from && R.to && R.from > R.to);
    const list = rangeInvalid || !dataAvailable ? [] : filtered();
    const shown = list.slice(0, R.limit);
    const malformedRecordCount = Math.max(
      Number(pageTotals?.malformedRecordCount) || 0,
      Number(diagnostics.malformedRecordCount) || 0,
    );
    const malformedFieldCount = Math.max(
      Number(pageTotals?.malformedFieldCount) || 0,
      Number(diagnostics.malformedFieldCount) || 0,
    );
    const approvalExceptionCount = Number(pageTotals?.approvalExceptionCount) || 0;
    const invalidAmountCount = Math.max(
      Number(pageTotals?.invalidAmountCount) || 0,
      Number(diagnostics.invalidAmountCount) || 0,
    );
    const paid = finiteAmount(pageTotals?.paid) ?? 0;
    const received = finiteAmount(pageTotals?.received) ?? 0;

    renderTotals({
      dataAvailable,
      rangeInvalid,
      unavailableTotalsMessage,
      paid,
      received,
      approvalExceptionCount,
      invalidAmountCount,
      malformedRecordCount,
      malformedFieldCount,
      totalCount: pageTotalCount,
    });
    const exportButton = $('#view [data-act="csv"]');
    if (exportButton) exportButton.disabled = rangeInvalid || !dataAvailable;
    const resultsCard = $('.register-results-card');
    if (resultsCard) {
      resultsCard.classList.toggle('is-empty', shown.length === 0);
      resultsCard.dataset.emptyKind = !dataAvailable
        ? 'unavailable'
        : rangeInvalid
          ? 'invalid-range'
          : pageLoading
            ? 'loading'
            : pageTotalCount > 0
              ? 'page-empty'
              : R.q ||
                  R.vendor ||
                  R.cat ||
                  R.user ||
                  R.t ||
                  R.from ||
                  R.to ||
                  R.st !== 'ACTIVE' ||
                  R.approval !== 'ALL' ||
                  R.paymentMethod !== 'ALL'
                ? 'filtered'
                : 'first-use';
    }

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
          can('audit')
            ? `<button class="btn sm" data-act="history" data-id="${esc(voucher.id)}">History</button>`
            : '',
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
              <div class="cat">Payment method: ${esc(paymentMethodLabel(voucher.paymentMethod))} · Cash impact: ${esc(normalizeCashImpact(voucher.cashImpact))}${approvalNote}</div>
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
      const hasActiveFilters = Boolean(
        R.q ||
        R.vendor ||
        R.cat ||
        R.user ||
        R.t ||
        R.from ||
        R.to ||
        R.st !== 'ACTIVE' ||
        R.approval !== 'ALL' ||
        R.paymentMethod !== 'ALL',
      );
      const firstUse =
        dataAvailable && !pageLoading && !rangeInvalid && pageTotalCount === 0 && !hasActiveFilters;
      const title = document.createElement('h2');
      title.className = 'register-empty-state__title';
      title.textContent = pageLoading
        ? 'Loading your vouchers'
        : rangeInvalid
          ? 'Check the date range'
          : !dataAvailable
            ? 'Vouchers could not be loaded'
            : pageTotalCount
              ? 'No vouchers on this page'
              : hasActiveFilters
                ? 'No matching vouchers'
                : 'Your voucher register starts here';
      emptyState.appendChild(title);

      const message = document.createElement('p');
      message.className = 'empty-state-message register-empty-state__copy';
      message.textContent = pageLoading
        ? 'Loading vouchers from the server…'
        : rangeInvalid
          ? 'The start date must be on or before the end date. Correct the range or clear filters.'
          : !dataAvailable
            ? unavailableMessage
            : pageTotalCount
              ? 'No vouchers are available on this page. Load more or adjust filters.'
              : hasActiveFilters
                ? 'No vouchers match the current filters.'
                : 'Record your first payment or receipt to begin building a clear, searchable cash record.';
      emptyState.appendChild(message);

      if (firstUse && can('create')) {
        const actions = document.createElement('div');
        actions.className = 'register-empty-state__actions';
        const createButton = document.createElement('button');
        createButton.type = 'button';
        createButton.className = 'btn primary';
        createButton.dataset.act = 'ntype';
        createButton.dataset.k = 'PAYMENT';
        createButton.textContent = 'Create first entry';
        actions.appendChild(createButton);
        emptyState.appendChild(actions);
      }

      if (
        (dataAvailable && hasActiveFilters) ||
        rangeInvalid ||
        (dataAvailable && pageTotalCount > shown.length)
      ) {
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
    if (list.length < pageTotalCount && !pageLoading) {
      const actions = document.createElement('div');
      actions.className = 'actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset.act = 'more';
      button.textContent = 'Load more (' + (pageTotalCount - list.length) + ' left)';
      actions.appendChild(button);
      more.appendChild(actions);
    }
  }

  function render() {
    const vouchers = Array.isArray(S.vouchers) ? S.vouchers.filter(isRecord) : [];
    const vendors =
      Array.isArray(pageFacets.vendors) && pageFacets.vendors.length
        ? pageFacets.vendors
        : [
            ...new Set(vouchers.map((voucher) => scalarText(voucher.vendor)).filter(Boolean)),
          ].sort();
    const users =
      Array.isArray(pageFacets.users) && pageFacets.users.length
        ? pageFacets.users
        : [...new Set(vouchers.map((voucher) => scalarText(voucher.createdBy)).filter(Boolean))];

    $('#view').innerHTML =
      head(
        'Voucher Register',
        `${can('create') ? '<button type="button" class="btn primary" data-act="ntype" data-k="PAYMENT">+ New entry</button>' : ''}${refreshBtn}`,
        {
          section: 'Work',
          description: 'Search payments and receipts, review status, and open voucher details.',
        },
      ) +
      `<div class="card filters" id="rf">
    <label class="register-search-field" for="rq">Search vouchers<input id="rq" aria-label="Search vouchers by number, payee or note" placeholder="Voucher no., payee or note" value="${esc(R.q)}"></label>
    <label class="register-filter-field" for="rv">Vendor<select id="rv" aria-label="Filter by vendor"><option value="">All vendors</option>${vendors.map((vendor) => `<option${vendor === R.vendor ? ' selected' : ''}>${esc(vendor)}</option>`).join('')}</select></label>
    <label class="register-filter-field" for="rc">Category<select id="rc" aria-label="Filter by category"><option value="">All categories</option>${categories()
      .map(
        (category) => `<option${category === R.cat ? ' selected' : ''}>${esc(category)}</option>`,
      )
      .join('')}</select></label>
    <label class="register-filter-field" for="rfrom">From<input type="date" id="rfrom" value="${esc(R.from)}"></label><label class="register-filter-field" for="rto">To<input type="date" id="rto" value="${esc(R.to)}"></label>
    ${can('viewAll') ? `<label class="register-filter-field" for="ru">User<select id="ru" aria-label="Filter by user"><option value="">All users</option>${users.map((user) => `<option value="${esc(user)}"${user === R.user ? ' selected' : ''}>${esc(nm(user))}</option>`).join('')}</select></label>` : ''}
    <label class="register-filter-field" for="rt">Transaction type<select id="rt" aria-label="Filter by transaction type"><option value="">Paid & received</option><option value="PAYMENT"${R.t === 'PAYMENT' ? ' selected' : ''}>Payments only</option><option value="RECEIPT"${R.t === 'RECEIPT' ? ' selected' : ''}>Received only</option></select></label>
    <label class="register-filter-field" for="rpmethod">Payment method<select id="rpmethod" aria-label="Filter by payment method">${PAYMENT_METHOD_FILTER_OPTIONS.map(([key, label]) => '<option value="' + key + '"' + (R.paymentMethod === key ? ' selected' : '') + '>' + esc(label) + '</option>').join('')}</select></label>
    <label class="register-filter-field" for="rs">Status<select id="rs" aria-label="Filter by status">${[
      ['ACTIVE', 'Active'],
      ['CANCELLED', 'Cancelled'],
      ['ALL', 'All'],
    ]
      .map(
        ([key, label]) =>
          `<option value="${key}"${R.st === key ? ' selected' : ''}>${label}</option>`,
      )
      .join('')}</select></label>
    <label class="register-filter-field" for="rapproval">Approval<select id="rapproval" aria-label="Filter by approval status">${[
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
      .join('')}</select></label>
    <button class="btn" data-act="rclear">Clear</button><button class="btn" data-act="csv">Export CSV</button></div>
    <div class="card register-results-card"><div id="rtot" class="register-totals"></div><div id="rempty" class="empty-state hidden" role="status" aria-live="polite"></div><div class="table-wrap" role="region" aria-label="Voucher register entries" tabindex="0"><table><thead><tr><th>Voucher / Type</th><th>Date</th><th>Vendor / Details</th><th class="r">Amount</th><th>By</th><th>Actions</th></tr></thead><tbody id="rbody"></tbody></table></div><div id="rmore"></div></div>`;

    return renderRows();
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
      rpmethod: 'paymentMethod',
    };
    const key = mapping[event.target.id];

    if (!key || S.view !== 'reg') return;
    if (event.type === 'input' && event.target.id !== 'rq') return;
    if (event.type === 'change' && event.target.id === 'rq') return;
    R[key] = event.target.value;
    R.limit = 100;
    pageRows = [];
    pageTotalCount = 0;
    if (event.target.id === 'rq') {
      pageRequestSequence++;
      clearTimeout(filterDebounce);
      filterDebounce = setTimeout(() => renderRows(), 220);
    } else {
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
      paymentMethod: 'ALL',
      limit: 100,
    });
    render();
  }

  async function csvExport() {
    const diagnostics = S.voucherDiagnostics || {};
    const unavailable =
      pageError ||
      S.offlineMode ||
      navigator.onLine === false ||
      diagnostics.dataAvailable === false ||
      diagnostics.envelopeValid === false;
    if (unavailable) {
      const offline =
        S.offlineMode || diagnostics.unavailableReason === 'offline' || navigator.onLine === false;
      toast(
        offline
          ? 'Voucher data is unavailable while offline. Reconnect and refresh before exporting the Register.'
          : 'Voucher data is unavailable. Refresh and retry before exporting the Register.',
        'err',
      );
      return;
    }
    if (R.from && R.to && R.from > R.to) {
      toast('Correct the register date range before exporting.', 'err');
      return;
    }

    const button = $('#view [data-act="csv"]');
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    }
    try {
      const rows = [
        [
          'No',
          'Type',
          'Date',
          'Vendor',
          'Category',
          'CashImpact',
          'PaymentMethod',
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
      ];
      let offset = 0;
      let total = null;
      while (total === null || offset < total) {
        const result = await api('registerPage', queryFilters(offset, 200));
        const items = Array.isArray(result?.items) ? result.items.filter(isRecord) : [];
        total = Number.isSafeInteger(result?.totalCount) ? result.totalCount : items.length;
        if (!items.length && offset < total) {
          throw new Error('The server returned an incomplete export page. Retry the export.');
        }
        items.forEach((voucher) => {
          const receipts = receiptMetadata(voucher);
          rows.push([
            voucherNo(voucher),
            isIn(voucher) ? 'Received' : 'Payment',
            dmy(scalarText(voucher.date)),
            scalarText(voucher.vendor),
            scalarText(voucher.category),
            normalizeCashImpact(voucher.cashImpact),
            scalarText(voucher.paymentMethod),
            scalarText(voucher.notes),
            voucher.amount,
            voucher.status,
            normalizeApprovalStatus(voucher.approvalStatus),
            scalarText(voucher.approvedBy),
            scalarText(voucher.approvedAt),
            scalarText(voucher.approvalReason),
            nm(scalarText(voucher.createdBy)),
            scalarText(voucher.createdAt),
            receipts.ids.length,
          ]);
        });
        offset += items.length;
        if (offset >= total) break;
      }

      download(
        'vouchers-' + today() + '.csv',
        '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
        'text/csv',
      );
      toast('Exported ' + (rows.length - 1) + ' vouchers.', 'ok');
    } catch (error) {
      fail(error);
    } finally {
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    }
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
    body.append(
      labeledControl(voucher.type === 'RECEIPT' ? 'Received from' : 'Paid to', vendor),
      vendorListNode(),
    );

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

    const knownPaymentMethods = PAYMENT_METHODS;
    const paymentMethodLabels = PAYMENT_METHOD_LABELS;
    const storedMethod = scalarText(voucher.paymentMethod).trim();
    const storedMethodKnown = knownPaymentMethods.includes(storedMethod);
    const paymentMethod = document.createElement('select');
    paymentMethod.id = 'epm';
    paymentMethod.required = !!storedMethod && !storedMethodKnown;
    if (!storedMethodKnown) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = storedMethod
        ? 'Unknown method — choose a valid method'
        : 'Not recorded (legacy)';
      placeholder.selected = true;
      placeholder.disabled = !!storedMethod;
      paymentMethod.appendChild(placeholder);
    }
    knownPaymentMethods.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = paymentMethodLabels[value];
      paymentMethod.appendChild(option);
    });
    if (storedMethodKnown) paymentMethod.value = storedMethod;
    body.appendChild(labeledControl('Payment method', paymentMethod));

    const cashImpact = document.createElement('select');
    cashImpact.id = 'eci';
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
    body.appendChild(labeledControl('Cash impact', cashImpact));

    const cashImpactHint = document.createElement('p');
    cashImpactHint.className = 'muted';
    const derivedImpact = (method) => {
      if (method === 'CASH') return voucher.type === 'RECEIPT' ? 'CASH_IN' : 'CASH_OUT';
      return 'NO_CASH';
    };
    const updateCashImpactHint = () => {
      const method = paymentMethod.value;
      const suggestion = suggestCashImpact(voucher.type, category.value);
      if (knownPaymentMethods.includes(method)) {
        cashImpact.value = derivedImpact(method);
        cashImpact.disabled = true;
        cashImpact.required = false;
        cashImpactHint.textContent =
          'Cash impact is derived from ' +
          paymentMethodLabels[method] +
          ' (' +
          cashImpact.value +
          '). Changing the payment method updates drawer impact.';
      } else {
        cashImpact.disabled = false;
        cashImpact.required = true;
        cashImpactHint.textContent =
          'Legacy payment method is not recorded. Category suggestion only: ' +
          suggestion +
          '. Verify physical cash movement; choose a method if known, otherwise classify the drawer impact.';
      }
    };
    paymentMethod.addEventListener('change', updateCashImpactHint);
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

    dialog('Edit #' + voucherNo(voucher), body, async () => {
      const fields = {
        date: $('#ed').value,
        vendor: $('#ev').value,
        amount: parseAmt($('#ea').value),
        category: $('#ec').value,
        cashImpact: $('#eci').value,
        notes: $('#en').value,
      };
      const selectedMethod = paymentMethod.value;
      if (knownPaymentMethods.includes(selectedMethod) || selectedMethod !== storedMethod) {
        fields.paymentMethod = selectedMethod;
      }
      const updated = await api('updateVoucher', {
        id,
        reason: $('#er').value,
        fields,
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

  function history(id) {
    const voucher = voucherRows().find((item) => item.id === id);
    if (!voucher || !can('audit')) {
      fail(new Error('Voucher history is unavailable for this account. Refresh and retry.'));
      return;
    }

    const body = document.createElement('div');
    body.className = 'voucher-history';
    const note = document.createElement('p');
    note.className = 'muted voucher-history-intro';
    note.textContent =
      'Structured events are matched by stable voucher ID. Some legacy audit entries lack a reliable ID and cannot be linked safely. This is an operational view, not a tamper-evident ledger.';
    const filterLabel = document.createElement('label');
    filterLabel.className = 'voucher-history-filter';
    filterLabel.append('Event type ');
    const filter = document.createElement('select');
    filter.id = 'voucherHistoryEventCategory';
    filter.setAttribute('aria-label', 'Filter voucher history by event type');
    [
      ['ALL', 'All events'],
      ['CREATED', 'Created'],
      ['UPDATED', 'Updated'],
      ['CANCELLED', 'Cancelled'],
      ['APPROVED', 'Payment approved'],
      ['REJECTED', 'Payment rejected'],
      ['RECEIPT_ATTACHED', 'Receipt attached'],
      ['OTHER', 'Other structured events'],
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      filter.appendChild(option);
    });
    filterLabel.appendChild(filter);
    const status = document.createElement('p');
    status.className = 'muted voucher-history-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Loading voucher history…';
    const list = document.createElement('div');
    list.className = 'voucher-history-list';
    const older = document.createElement('button');
    older.type = 'button';
    older.className = 'btn voucher-history-older';
    older.textContent = 'Load older events';
    older.hidden = true;
    body.append(note, filterLabel, status, list, older);

    let beforeRow = null;
    let loading = false;
    let eventCategory = 'ALL';
    let loadedEventCount = 0;
    const isValidPage = (page) => {
      if (
        !isRecord(page) ||
        page.eventCategory !== eventCategory ||
        !Array.isArray(page.rows) ||
        page.rows.length > 50 ||
        !Number.isSafeInteger(page.scannedRows) ||
        page.scannedRows < 0 ||
        page.scannedRows > 500 ||
        !(
          page.nextBeforeRow === null ||
          (Number.isSafeInteger(page.nextBeforeRow) && page.nextBeforeRow >= 2)
        )
      ) {
        return false;
      }
      if (
        page.auditHealth !== undefined &&
        (!isRecord(page.auditHealth) ||
          !['NO_KNOWN_FAILURE', 'DEGRADED', 'MONITORING_UNAVAILABLE'].includes(
            page.auditHealth.status,
          ))
      ) {
        return false;
      }
      return page.rows.every(
        (event) =>
          isRecord(event) &&
          ['time', 'user', 'action', 'target', 'eventId', 'eventType', 'summary', 'reason'].every(
            (field) => typeof event[field] === 'string' && event[field].length <= 500,
          ) &&
          Array.isArray(event.changes) &&
          event.changes.length <= 30 &&
          event.changes.every(
            (change) =>
              isRecord(change) &&
              typeof change.field === 'string' &&
              change.field.length <= 100 &&
              typeof change.before === 'string' &&
              change.before.length <= 300 &&
              typeof change.after === 'string' &&
              change.after.length <= 300,
          ),
      );
    };

    const appendEvents = (events) => {
      events.forEach((event) => {
        const card = document.createElement('article');
        card.className = 'voucher-history-event';
        const title = document.createElement('h3');
        title.textContent = event.summary || event.eventType || event.action || 'Audit event';
        const metadata = document.createElement('p');
        metadata.className = 'voucher-history-meta muted';
        metadata.textContent = [event.time, event.user, event.action, event.eventType]
          .filter(Boolean)
          .join(' · ');
        card.append(title, metadata);
        if (event.reason) {
          const reason = document.createElement('p');
          reason.className = 'voucher-history-reason';
          reason.textContent = 'Reason: ' + event.reason;
          card.appendChild(reason);
        }
        if (event.changes.length) {
          const changes = document.createElement('ul');
          changes.className = 'voucher-history-changes';
          event.changes.forEach((change) => {
            const item = document.createElement('li');
            item.textContent = change.field + ': ' + change.before + ' → ' + change.after;
            changes.appendChild(item);
          });
          card.appendChild(changes);
        }
        list.appendChild(card);
        loadedEventCount++;
      });
    };

    const loadPage = async (append) => {
      if (loading) return;
      loading = true;
      older.disabled = true;
      filter.disabled = true;
      older.textContent = 'Loading older events…';
      try {
        const page = await api('voucherHistory', {
          id: voucher.id,
          beforeRow,
          eventCategory,
        });
        if (!isValidPage(page)) {
          throw new Error('The server returned invalid voucher-history data.');
        }
        if (!append) list.replaceChildren();
        appendEvents(page.rows);
        beforeRow = page.nextBeforeRow;
        older.hidden = beforeRow === null;
        status.className = 'muted voucher-history-status';
        if (page.auditHealth && page.auditHealth.status !== 'NO_KNOWN_FAILURE') {
          status.className = 'error voucher-history-status';
          status.textContent =
            'Audit monitoring is ' +
            page.auditHealth.status.replace(/_/g, ' ').toLowerCase() +
            '. This view cannot prove that every audit event was saved.';
        } else if (page.rows.length) {
          const categoryLabel = filter.options[filter.selectedIndex]?.textContent || 'selected event type';
          status.textContent =
            'Loaded ' +
            loadedEventCount +
            ' structured event(s) matching ' +
            categoryLabel.toLowerCase() +
            '. This page scanned ' +
            page.scannedRows +
            ' audit row(s).';
        } else if (beforeRow !== null && loadedEventCount === 0) {
          status.textContent =
            'No matching ' +
            (filter.options[filter.selectedIndex]?.textContent || 'selected event type').toLowerCase() +
            ' events were found for this voucher in the ' +
            page.scannedRows +
            ' most recently scanned audit row(s). Load older events to continue.';
        } else if (beforeRow !== null) {
          status.textContent =
            'No additional matching events were found in the older audit range. Load older events to continue.';
        } else if (loadedEventCount === 0) {
          status.textContent =
            'No structured events could be linked to this voucher. Legacy audit rows may not contain a stable voucher ID.';
        } else {
          status.textContent = 'Reached the oldest available audit rows.';
        }
      } catch (error) {
        status.className = 'error voucher-history-status';
        status.textContent =
          error && typeof error.message === 'string'
            ? error.message.slice(0, 300)
            : 'Voucher history could not be loaded. Check the connection and retry.';
      } finally {
        loading = false;
        older.disabled = false;
        filter.disabled = false;
        older.textContent = 'Load older events';
        older.hidden = beforeRow === null;
      }
    };

    filter.addEventListener('change', () => {
      if (loading) return;
      eventCategory = filter.value;
      beforeRow = null;
      loadedEventCount = 0;
      list.replaceChildren();
      status.className = 'muted voucher-history-status';
      status.textContent = 'Loading voucher history…';
      loadPage(false);
    });
    older.addEventListener('click', () => loadPage(true));
    dialog('Voucher history for ' + voucherNo(voucher), body, null);
    loadPage(false);
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
    loadMore,
    clearFilters,
    csvExport,
    edit,
    cancel,
    approve,
    reject,
    history,
    receipts,
    state: R,
  };
}
