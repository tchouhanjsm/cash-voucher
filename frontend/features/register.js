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
} from '../core/state.js';
import { catOptionsNode, vendorListNode } from '../core/form-options.js';
import { createAuditReconciliationCsv } from '../core/audit-export.js';
import {
  addDays,
  compress,
  csvCell,
  dmy,
  download,
  esc,
  finiteAmount,
  money,
  parseAmt,
  isBusinessDate,
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
    cashImpact: 'ALL',
    amountValidity: 'ALL',
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

  function registerDateRanges(referenceDate = today()) {
    return [
      { key: 'today', label: 'Today', from: referenceDate, to: referenceDate },
      { key: '7d', label: 'Last 7 days', from: addDays(referenceDate, -6), to: referenceDate },
      { key: '30d', label: 'Last 30 days', from: addDays(referenceDate, -29), to: referenceDate },
      {
        key: 'mtd',
        label: 'Month to date',
        from: referenceDate.slice(0, 7) + '-01',
        to: referenceDate,
      },
    ];
  }

  function selectedRegisterDateRange() {
    return (
      registerDateRanges().find((range) => R.from === range.from && R.to === range.to)?.key || ''
    );
  }

  function labeledControl(text, control) {
    const label = document.createElement('label');
    label.append(document.createTextNode(text), control);
    return label;
  }

  function cashMovementLabel(value) {
    switch (normalizeCashImpact(value)) {
      case 'CASH_IN':
        return 'Cash added to the drawer';
      case 'CASH_OUT':
        return 'Cash taken out of the drawer';
      case 'NO_CASH':
        return 'No physical cash moved';
      default:
        return 'Needs classification';
    }
  }

  function validVoucherAmount(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return false;
    if (String(value).trim() === '') return false;
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0 && amount <= 10000000;
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
      cashImpact: R.cashImpact,
      amountValidity: R.amountValidity,
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

  function advancedRegisterFilterCount() {
    const hasCustomDateRange = Boolean(R.from || R.to) && !selectedRegisterDateRange();
    return [
      Boolean(R.vendor),
      Boolean(R.cat),
      Boolean(R.user),
      Boolean(R.t),
      R.st !== 'ACTIVE',
      R.approval !== 'ALL',
      R.paymentMethod !== 'ALL',
      R.cashImpact !== 'ALL',
      R.amountValidity !== 'ALL',
      hasCustomDateRange,
    ].filter(Boolean).length;
  }

  function syncRegisterFilterSummary() {
    const target = $('#registerFilterSummary');
    const filters = [
      [Boolean(R.q.trim()), 'Search'],
      [Boolean(R.vendor), 'Vendor'],
      [Boolean(R.cat), 'Category'],
      [Boolean(R.from || R.to), 'Date range'],
      [Boolean(R.user), 'User'],
      [Boolean(R.t), R.t === 'RECEIPT' ? 'Receipts only' : 'Payments only'],
      [R.paymentMethod !== 'ALL', 'Payment method'],
      [
        R.cashImpact !== 'ALL',
        R.cashImpact === 'UNCLASSIFIED' ? 'Needs cash classification' : 'Physical cash movement',
      ],
      [
        R.amountValidity !== 'ALL',
        R.amountValidity === 'INVALID' ? 'Amount needs review' : 'Valid amounts',
      ],
      [R.st !== 'ACTIVE', R.st === 'CANCELLED' ? 'Cancelled status' : 'All statuses'],
      [R.approval !== 'ALL', 'Approval state'],
    ]
      .filter(([active]) => active)
      .map(([, label]) => label);

    if (target) {
      target.textContent = filters.length
        ? filters.length + ' refinement(s) active · ' + filters.join(' · ')
        : 'Showing active vouchers. Search by voucher number, payee or note.';
    }

    const advancedCount = advancedRegisterFilterCount();
    const advancedCountTarget = $('#registerAdvancedFilterCount');
    if (advancedCountTarget) {
      advancedCountTarget.textContent = advancedCount
        ? advancedCount + ' active'
        : 'Vendor, category, dates and payment method';
    }

    const selected = selectedRegisterDateRange();
    $('#view')
      ?.querySelectorAll('[data-register-range]')
      .forEach((button) => {
        const pressed = button.dataset.registerRange === selected;
        button.classList.toggle('on', pressed);
        button.setAttribute('aria-pressed', String(pressed));
      });
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

    syncRegisterFilterSummary();
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
    const pageMeta = $('#registerPageMeta');
    if (pageMeta) {
      if (!dataAvailable) {
        pageMeta.textContent = 'Server results unavailable';
      } else if (rangeInvalid) {
        pageMeta.textContent = 'Correct the date range to load results';
      } else if (pageLoading) {
        pageMeta.textContent = 'Loading matching vouchers…';
      } else {
        pageMeta.textContent =
          'Loaded ' +
          pageRows.length.toLocaleString('en-IN') +
          ' of ' +
          pageTotalCount.toLocaleString('en-IN') +
          ' matching vouchers';
      }
    }
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
                  R.paymentMethod !== 'ALL' ||
                  R.cashImpact !== 'ALL' ||
                  R.amountValidity !== 'ALL'
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
        const statusLabel =
          voucher.status === 'ACTIVE'
            ? 'Active'
            : voucher.status === 'CANCELLED'
              ? 'Cancelled'
              : 'Needs review';
        const statusClass =
          voucher.status === 'ACTIVE'
            ? 'active'
            : voucher.status === 'CANCELLED'
              ? 'cancelled'
              : 'review';
        const cancelledNote =
          voucher.status === 'CANCELLED' && scalarText(voucher.cancelReason)
            ? ` · Reason: ${esc(scalarText(voucher.cancelReason))}`
            : '';
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
          voucher.status === 'ACTIVE' &&
          can('edit') &&
          normalizeCashImpact(voucher.cashImpact) === 'UNCLASSIFIED'
            ? `<button class="btn sm primary" data-act="classify" data-id="${esc(voucher.id)}">Classify cash</button>`
            : '',
          voucher.status === 'ACTIVE' && can('edit')
            ? `<button class="btn sm" data-act="edit" data-id="${esc(voucher.id)}">${validVoucherAmount(voucher.amount) ? 'Edit' : 'Review amount'}</button>`
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
            <div class="voucher-row-status voucher-row-status--${statusClass}">${statusLabel}</div>
          </td>
          <td class="nw">${esc(dmy(scalarText(voucher.date)))}</td>
          <td>
            <span class="voucher-vendor">${esc(scalarText(voucher.vendor))}</span>
            <div class="cat">
              ${esc(scalarText(voucher.category))}${scalarText(voucher.notes) ? ' · ' + esc(scalarText(voucher.notes)) : ''}${receiptWarning}${cancelledNote}
              <div class="cat">Payment method: ${esc(paymentMethodLabel(voucher.paymentMethod))} · Physical cash: ${esc(cashMovementLabel(voucher.cashImpact))}${approvalNote}</div>
            </div>
          </td>
          <td class="r nw amt${isIn(voucher) ? ' cash-impact-in' : ''}">
            <span class="voucher-amount">
              ${validVoucherAmount(voucher.amount) ? (isIn(voucher) ? '+' : '−') + money(voucher.amount) : '<span class="badge bad">Amount needs review</span>'}
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
        R.paymentMethod !== 'ALL' ||
        R.cashImpact !== 'ALL' ||
        R.amountValidity !== 'ALL',
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
    const datePresets = registerDateRanges();
    const selectedDatePreset = selectedRegisterDateRange();
    const datePresetButtons = datePresets
      .map((range) => {
        const pressed = selectedDatePreset === range.key;
        return (
          '<button type="button" data-register-range="' +
          range.key +
          '" class="' +
          (pressed ? 'on' : '') +
          '" aria-pressed="' +
          String(pressed) +
          '">' +
          range.label +
          '</button>'
        );
      })
      .join('');
    const advancedFilterCount = advancedRegisterFilterCount();
    const advancedFiltersOpen = advancedFilterCount > 0 ? ' open' : '';
    const advancedFilterCountLabel = advancedFilterCount
      ? advancedFilterCount + ' active'
      : 'None active';
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
      `<section class="card filters register-filter-panel" id="rf" aria-labelledby="registerFiltersTitle">
        <div class="register-panel-heading">
          <div>
            <p class="page-eyebrow">FIND A MOVEMENT</p>
            <h2 id="registerFiltersTitle">Search and refine</h2>
            <p class="muted">Search first. Add a filter when you need to narrow the results.</p>
          </div>
        </div>
        <div class="register-search-row">
          <label class="register-search-field" for="rq">
            Search vouchers
            <input id="rq" aria-label="Search vouchers by number, payee or note" placeholder="Voucher no., payee or note" value="${esc(R.q)}">
          </label>
        </div>
        <div class="register-date-presets" role="group" aria-label="Quick register date ranges">
          <span class="register-date-presets__label">Quick period</span>
          ${datePresetButtons}
        </div>
        <p id="registerFilterSummary" class="register-filter-summary" role="status" aria-live="polite">Showing active vouchers. Search by voucher number, payee or note.</p>
        <details class="register-advanced-filters" id="registerAdvancedFilters"${advancedFiltersOpen}>
          <summary>
            <span>Filters</span>
            <span id="registerAdvancedFilterCount" class="register-advanced-filter-count">${advancedFilterCountLabel}</span>
          </summary>
          <div class="register-primary-filter-grid">
            <label class="register-filter-field" for="rt">
              Transaction type
              <select id="rt" aria-label="Filter by transaction type">
                <option value="">Paid &amp; received</option>
                <option value="PAYMENT"${R.t === 'PAYMENT' ? ' selected' : ''}>Payments only</option>
                <option value="RECEIPT"${R.t === 'RECEIPT' ? ' selected' : ''}>Received only</option>
              </select>
            </label>
            <label class="register-filter-field" for="rs">
              Status
              <select id="rs" aria-label="Filter by status">
                <option value="ACTIVE"${R.st === 'ACTIVE' ? ' selected' : ''}>Active</option>
                <option value="CANCELLED"${R.st === 'CANCELLED' ? ' selected' : ''}>Cancelled</option>
                <option value="ALL"${R.st === 'ALL' ? ' selected' : ''}>All</option>
              </select>
            </label>
            <label class="register-filter-field" for="rapproval">
              Approval
              <select id="rapproval" aria-label="Filter by approval status">
                ${[
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
                  .join('')}
              </select>
            </label>
          </div>
            <div class="register-filter-grid">
            <label class="register-filter-field" for="rv">
              Vendor
              <select id="rv" aria-label="Filter by vendor">
                <option value="">All vendors</option>
                ${vendors.map((vendor) => `<option value="${esc(vendor)}"${vendor === R.vendor ? ' selected' : ''}>${esc(vendor)}</option>`).join('')}
              </select>
            </label>
            <label class="register-filter-field" for="rc">
              Category
              <select id="rc" aria-label="Filter by category">
                <option value="">All categories</option>
                ${categories()
                  .map(
                    (category) =>
                      `<option value="${esc(category)}"${category === R.cat ? ' selected' : ''}>${esc(category)}</option>`,
                  )
                  .join('')}
              </select>
            </label>
            <label class="register-filter-field" for="rfrom">
              From
              <input type="date" id="rfrom" value="${esc(R.from)}">
            </label>
            <label class="register-filter-field" for="rto">
              To
              <input type="date" id="rto" value="${esc(R.to)}">
            </label>
            ${can('viewAll') ? `<label class="register-filter-field" for="ru">User<select id="ru" aria-label="Filter by user"><option value="">All users</option>${users.map((user) => `<option value="${esc(user)}"${user === R.user ? ' selected' : ''}>${esc(nm(user))}</option>`).join('')}</select></label>` : ''}
            <label class="register-filter-field" for="rpmethod">
              Payment method
              <select id="rpmethod" aria-label="Filter by payment method">
                ${PAYMENT_METHOD_FILTER_OPTIONS.map(([key, label]) => `<option value="${key}"${R.paymentMethod === key ? ' selected' : ''}>${esc(label)}</option>`).join('')}
              </select>
            </label>
            <label class="register-filter-field" for="rcashimpact">
              Physical cash movement
              <select id="rcashimpact" aria-label="Filter by physical cash movement">
                <option value="ALL"${R.cashImpact === 'ALL' ? ' selected' : ''}>All movements</option>
                <option value="CASH_IN"${R.cashImpact === 'CASH_IN' ? ' selected' : ''}>Cash added to the drawer</option>
                <option value="CASH_OUT"${R.cashImpact === 'CASH_OUT' ? ' selected' : ''}>Cash taken out of the drawer</option>
                <option value="NO_CASH"${R.cashImpact === 'NO_CASH' ? ' selected' : ''}>No physical cash moved</option>
                <option value="UNCLASSIFIED"${R.cashImpact === 'UNCLASSIFIED' ? ' selected' : ''}>Needs classification</option>
              </select>
            </label>
            <label class="register-filter-field" for="ramountValidity">
              Amount review
              <select id="ramountValidity" aria-label="Filter by amount validity">
                <option value="ALL"${R.amountValidity === 'ALL' ? ' selected' : ''}>All amounts</option>
                <option value="INVALID"${R.amountValidity === 'INVALID' ? ' selected' : ''}>Needs review</option>
                <option value="VALID"${R.amountValidity === 'VALID' ? ' selected' : ''}>Valid amounts</option>
              </select>
            </label>
          </div>
        </details>
        <div class="register-filter-actions">
          <span class="register-filter-footnote">Results update automatically as you search or change a filter.</span>
          <div class="register-filter-action-buttons">
            <button type="button" class="btn" data-act="rclear" aria-label="Clear all filters" title="Clear all filters">Clear all</button>
            <button type="button" class="btn" data-act="csv">Export CSV</button>
          </div>
        </div>
      </section>
      <div class="card register-results-card">
        <div class="register-results-summary">
          <div>
            <p class="page-eyebrow">REGISTER</p>
            <h2>Recent transactions</h2>
            <p class="muted">Review voucher numbers, dates, payees, amounts and current status.</p>
            <p id="registerPageMeta" class="register-page-meta" role="status" aria-live="polite">Loading matching vouchers…</p>
          </div>
          <div id="rtot" class="register-totals"></div>
        </div>
        <div id="rempty" class="empty-state hidden" role="status" aria-live="polite"></div>
        <div class="table-wrap" role="region" aria-label="Voucher register entries" tabindex="0">
          <table>
            <thead>
              <tr>
                <th>Voucher / Type</th>
                <th>Date</th>
                <th>Payee / Source and details</th>
                <th class="r">Amount</th>
                <th>Entered by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="rbody"></tbody>
          </table>
        </div>
        <div id="rmore"></div>
      </div>`;

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
      rcashimpact: 'cashImpact',
      ramountValidity: 'amountValidity',
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
      cashImpact: 'ALL',
      amountValidity: 'ALL',
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

  function classifyCashMovement(id) {
    const voucher = voucherRows().find((item) => item.id === id);
    if (!voucher || !can('edit') || voucher.status !== 'ACTIVE') {
      fail(
        new Error(
          'This voucher cannot be classified from your current account. Refresh the Register and retry.',
        ),
      );
      return;
    }

    const body = document.createDocumentFragment();
    const summary = document.createElement('p');
    const amount = document.createElement('b');
    amount.textContent = validVoucherAmount(voucher.amount)
      ? money(voucher.amount)
      : 'Amount needs review';
    summary.append(
      document.createTextNode(voucherNo(voucher) + ' · ' + scalarText(voucher.vendor) + ' · '),
      amount,
    );
    body.appendChild(summary);

    const movement = document.createElement('select');
    movement.id = 'cash-movement';
    movement.required = true;
    const labels = {
      CASH_IN: 'Cash added to the drawer',
      CASH_OUT: 'Cash taken out of the drawer',
      NO_CASH: 'No physical cash moved',
    };
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose what actually happened';
    placeholder.disabled = true;
    placeholder.selected = true;
    movement.appendChild(placeholder);
    CASH_IMPACT_CHOICES.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = labels[value];
      movement.appendChild(option);
    });
    body.appendChild(labeledControl('Physical cash movement', movement));

    const explanation = document.createElement('p');
    explanation.className = 'muted';
    explanation.textContent =
      'Check the real drawer movement. Payment method and category do not determine whether cash moved.';
    body.appendChild(explanation);

    const reason = document.createElement('textarea');
    reason.id = 'cash-reason';
    reason.required = true;
    reason.minLength = 3;
    reason.maxLength = 200;
    reason.rows = 3;
    body.appendChild(labeledControl('Correction reason (required)', reason));

    dialog(
      'Classify physical cash · ' + voucherNo(voucher),
      body,
      async () => {
        const updated = await api('updateVoucher', {
          id,
          reason: reason.value,
          fields: { cashImpact: movement.value },
        });
        Object.assign(voucher, updated);
        closeModal();
        toast('Physical cash movement updated.', 'ok');
        go(S.view);
      },
      'Save classification',
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
    cashImpact.required = true;
    const selectedImpact = normalizeCashImpact(voucher.cashImpact);
    if (!CASH_IMPACT_CHOICES.includes(selectedImpact)) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose what happened to the physical cash';
      placeholder.selected = true;
      placeholder.disabled = true;
      cashImpact.appendChild(placeholder);
    }
    const cashMovementOptions = {
      CASH_IN: 'Cash added to the drawer',
      CASH_OUT: 'Cash taken out of the drawer',
      NO_CASH: 'No physical cash moved',
    };
    CASH_IMPACT_CHOICES.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = cashMovementOptions[value];
      cashImpact.appendChild(option);
    });
    if (CASH_IMPACT_CHOICES.includes(selectedImpact)) cashImpact.value = selectedImpact;
    body.appendChild(labeledControl('Physical cash movement', cashImpact));

    const cashImpactHint = document.createElement('p');
    cashImpactHint.className = 'muted';
    cashImpactHint.textContent =
      'Choose what actually happened to the physical cash. Payment method and category do not determine drawer movement.';
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
      let pendingUpload = null;
      const uploadStatus = document.createElement('p');
      uploadStatus.className = 'muted receipt-upload-status';
      uploadStatus.setAttribute('role', 'status');
      uploadStatus.setAttribute('aria-live', 'polite');
      add.closest('label')?.after(uploadStatus);

      const uploadReceipt = async () => {
        if (!pendingUpload || add.disabled) return;
        add.disabled = true;
        uploadStatus.className = 'muted receipt-upload-status';
        uploadStatus.textContent =
          'Uploading privately… Keep this window open until the result is confirmed.';
        try {
          Object.assign(
            voucher,
            await api('addReceipt', {
              id,
              receipt: { mime: pendingUpload.receipt.mime, data: pendingUpload.receipt.data },
              idempotencyKey: pendingUpload.idempotencyKey,
              existingReceiptIds: receiptState.ids,
            }),
          );
          uploadStatus.textContent = 'Receipt attached and verified.';
          toast('Receipt added securely.', 'ok');
          pendingUpload = null;
          closeModal();
          receipts(id);
        } catch (error) {
          uploadStatus.className = 'error receipt-upload-status';
          uploadStatus.textContent =
            'The server has not confirmed this upload. Do not upload a different copy. Retry the same receipt to safely confirm the result.';
          if (pendingUpload) {
            pendingUpload.retryButton.hidden = false;
            pendingUpload.retryButton.disabled = false;
          }
          fail(error);
        } finally {
          if (add.isConnected) add.disabled = false;
        }
      };

      add.onchange = async () => {
        if (!add.files?.length) return;
        if (pendingUpload) {
          uploadStatus.textContent =
            'A receipt upload is awaiting confirmation. Retry that upload before selecting another image.';
          return;
        }
        try {
          const receipt = await compress(add.files[0]);
          const retryButton = document.createElement('button');
          retryButton.type = 'button';
          retryButton.className = 'btn sm';
          retryButton.textContent = 'Retry same receipt';
          retryButton.hidden = true;
          retryButton.addEventListener('click', uploadReceipt);
          uploadStatus.after(retryButton);
          if (!globalThis.crypto?.getRandomValues)
            throw new Error('Secure retry identifiers are unavailable in this browser.');
          const keyBytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
          pendingUpload = {
            receipt,
            retryButton,
            idempotencyKey:
              'receipt-' +
              Array.from(keyBytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
          };
          await uploadReceipt();
        } catch (error) {
          uploadStatus.className = 'error receipt-upload-status';
          uploadStatus.textContent = error.message || 'The receipt could not be prepared.';
          fail(error);
        }
      };
    }
  }

  function history(id) {
    const voucherId = typeof id === 'string' ? id.trim() : '';
    const voucher = voucherRows().find((item) => item.id === voucherId);
    if (!voucherId || voucherId.length > 100 || !can('audit')) {
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
    const exportEvidence = document.createElement('button');
    exportEvidence.type = 'button';
    exportEvidence.className = 'btn sm voucher-history-export';
    exportEvidence.textContent = 'Export review CSV';
    exportEvidence.disabled = true;
    exportEvidence.setAttribute(
      'aria-label',
      'Export loaded voucher audit coverage and integrity findings as CSV',
    );
    const findingsPanel = document.createElement('section');
    findingsPanel.className = 'voucher-history-findings';
    findingsPanel.hidden = true;
    findingsPanel.setAttribute('aria-label', 'Audit integrity findings to reconcile');
    const findingsHeading = document.createElement('h3');
    findingsHeading.textContent = 'Integrity findings to reconcile';
    const findingsList = document.createElement('ul');
    findingsList.className = 'voucher-history-finding-list';
    const findingsGuidance = document.createElement('p');
    findingsGuidance.textContent =
      'Inspect each referenced AuditLog row against the source voucher, approval or receipt record. Preserve the original rows; document corrections separately and escalate unknown event types or malformed payloads to an owner/admin before relying on this history as complete.';
    findingsPanel.append(findingsHeading, findingsList, findingsGuidance);
    const list = document.createElement('div');
    list.className = 'voucher-history-list';
    const older = document.createElement('button');
    older.type = 'button';
    older.className = 'btn voucher-history-older';
    older.textContent = 'Load older events';
    older.hidden = true;
    body.append(note, filterLabel, status, exportEvidence, findingsPanel, list, older);

    let beforeRow = null;
    let loading = false;
    let eventCategory = 'ALL';
    let loadedEventCount = 0;
    const loadedAuditScans = [];
    const maxAuditExportScans = 100;
    const seenEventRows = new Map();
    const repeatedEventRowsAcrossPages = new Map();
    const observedIntegrityFindings = new Map();
    let integrityFindingsTruncated = false;
    const findingLabels = {
      DUPLICATE_EVENT_ID: 'Duplicate event ID',
      MISSING_EVENT_ID: 'Missing event ID',
      UNKNOWN_EVENT_TYPE: 'Unrecognized event type',
      MALFORMED_CHANGES: 'Malformed change payload',
      TRUNCATED_CHANGES: 'Change list capped at 30 entries',
    };
    const renderIntegrityFindings = (pageFindings) => {
      pageFindings.items.forEach((finding) => {
        const key =
          finding.code + ':' + finding.auditRow + ':' + String(finding.relatedAuditRow || '');
        if (observedIntegrityFindings.has(key)) return;
        if (observedIntegrityFindings.size >= 50) {
          integrityFindingsTruncated = true;
          return;
        }
        observedIntegrityFindings.set(key, finding);
      });
      integrityFindingsTruncated = integrityFindingsTruncated || pageFindings.truncated;
      findingsList.replaceChildren();
      observedIntegrityFindings.forEach((finding) => {
        const item = document.createElement('li');
        let label = findingLabels[finding.code] + ' — AuditLog row #' + finding.auditRow;
        if (finding.relatedAuditRow !== null) {
          label += ' (same event ID also appears at AuditLog row #' + finding.relatedAuditRow + ')';
        }
        if (finding.eventType) label += ' · ' + finding.eventType;
        if (finding.eventId) label += ' · Event ID ' + finding.eventId;
        item.textContent = label;
        findingsList.appendChild(item);
      });
      if (integrityFindingsTruncated) {
        const noteItem = document.createElement('li');
        noteItem.textContent =
          'Additional findings were omitted by the sample limit. Continue through older ranges and record follow-up for each scan.';
        findingsList.appendChild(noteItem);
      }
      findingsPanel.hidden = observedIntegrityFindings.size === 0 && !integrityFindingsTruncated;
    };
    const isValidPage = (page, requestedBeforeRow) => {
      if (
        !isRecord(page) ||
        page.eventCategory !== eventCategory ||
        !isRecord(page.scanDiagnostics) ||
        ![
          'recognizedRows',
          'unstructuredRows',
          'unsupportedRows',
          'duplicateEventRows',
          'missingEventIdRows',
          'unknownEventTypeRows',
          'malformedChangeRows',
          'truncatedChangeRows',
        ].every(
          (field) =>
            Number.isSafeInteger(page.scanDiagnostics[field]) &&
            page.scanDiagnostics[field] >= 0 &&
            page.scanDiagnostics[field] <= 500,
        ) ||
        page.scanDiagnostics.recognizedRows +
          page.scanDiagnostics.unstructuredRows +
          page.scanDiagnostics.unsupportedRows !==
          page.scannedRows ||
        !isRecord(page.integrityFindings) ||
        !Array.isArray(page.integrityFindings.items) ||
        page.integrityFindings.items.length > 25 ||
        typeof page.integrityFindings.truncated !== 'boolean' ||
        !page.integrityFindings.items.every(
          (finding) =>
            isRecord(finding) &&
            Object.prototype.hasOwnProperty.call(findingLabels, finding.code) &&
            Number.isSafeInteger(finding.auditRow) &&
            isRecord(page.scanRange) &&
            finding.auditRow >= page.scanRange.firstRow &&
            finding.auditRow <= page.scanRange.lastRow &&
            (finding.relatedAuditRow === null ||
              (Number.isSafeInteger(finding.relatedAuditRow) &&
                finding.relatedAuditRow >= page.scanRange.firstRow &&
                finding.relatedAuditRow <= page.scanRange.lastRow)) &&
            typeof finding.eventId === 'string' &&
            finding.eventId.length <= 100 &&
            typeof finding.eventType === 'string' &&
            finding.eventType.length <= 100,
        ) ||
        !(
          page.scanRange === null ||
          (isRecord(page.scanRange) &&
            Number.isSafeInteger(page.scanRange.firstRow) &&
            page.scanRange.firstRow >= 2 &&
            Number.isSafeInteger(page.scanRange.lastRow) &&
            page.scanRange.lastRow >= page.scanRange.firstRow &&
            page.scanRange.lastRow - page.scanRange.firstRow + 1 === page.scannedRows &&
            typeof page.scanRange.hasOlderPage === 'boolean')
        ) ||
        !Array.isArray(page.rows) ||
        page.rows.length > 50 ||
        !Number.isSafeInteger(page.scannedRows) ||
        page.scannedRows < 0 ||
        page.scannedRows > 500 ||
        !(
          page.nextBeforeRow === null ||
          (Number.isSafeInteger(page.nextBeforeRow) && page.nextBeforeRow >= 2)
        ) ||
        (page.scannedRows === 0) !== (page.scanRange === null) ||
        (page.scanRange !== null &&
          page.scanRange.hasOlderPage !== (page.nextBeforeRow !== null)) ||
        (page.scanRange !== null &&
          page.nextBeforeRow !== null &&
          (page.nextBeforeRow < page.scanRange.firstRow ||
            page.nextBeforeRow > page.scanRange.lastRow)) ||
        (requestedBeforeRow !== null &&
          requestedBeforeRow !== undefined &&
          page.nextBeforeRow !== null &&
          page.nextBeforeRow >= requestedBeforeRow) ||
        (requestedBeforeRow !== null &&
          requestedBeforeRow !== undefined &&
          page.scanRange !== null &&
          page.scanRange.lastRow >= requestedBeforeRow)
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
        (event, index) =>
          isRecord(event) &&
          Number.isSafeInteger(event.auditRow) &&
          page.scanRange !== null &&
          event.auditRow >= page.scanRange.firstRow &&
          event.auditRow <= page.scanRange.lastRow &&
          (index === 0 || page.rows[index - 1].auditRow > event.auditRow) &&
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
      const eventRowsFromEarlierPages = new Map(seenEventRows);
      const repeatedOnThisPage = new Map();
      events.forEach((event) => {
        if (event.eventId) {
          if (eventRowsFromEarlierPages.has(event.eventId)) {
            repeatedOnThisPage.set(event.eventId, {
              firstRow: eventRowsFromEarlierPages.get(event.eventId),
              repeatedRow: event.auditRow,
              eventType: event.eventType,
            });
          } else if (!seenEventRows.has(event.eventId)) {
            seenEventRows.set(event.eventId, event.auditRow);
          }
        }
        const card = document.createElement('article');
        card.className = 'voucher-history-event';
        const title = document.createElement('h3');
        title.textContent = event.summary || event.eventType || event.action || 'Audit event';
        const metadata = document.createElement('p');
        metadata.className = 'voucher-history-meta muted';
        metadata.textContent = [
          event.time,
          event.user,
          event.action,
          event.eventType,
          'AuditLog row #' + event.auditRow,
        ]
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
      repeatedOnThisPage.forEach((rowReferences, eventId) =>
        repeatedEventRowsAcrossPages.set(eventId, rowReferences),
      );
      const rowReferences = Array.from(repeatedEventRowsAcrossPages.entries())
        .slice(0, 3)
        .map(
          ([eventId, rows]) =>
            eventId + ': AuditLog rows #' + rows.firstRow + ' and #' + rows.repeatedRow,
        );
      const findings = Array.from(repeatedOnThisPage.entries()).map(([eventId, rows]) => ({
        code: 'DUPLICATE_EVENT_ID',
        auditRow: rows.repeatedRow,
        relatedAuditRow: rows.firstRow,
        eventId: eventId,
        eventType: rows.eventType || '',
      }));
      return {
        count: repeatedEventRowsAcrossPages.size,
        rowReferences: rowReferences,
        findings: findings,
      };
    };

    const loadPage = async (append) => {
      if (loading) return;
      loading = true;
      older.disabled = true;
      filter.disabled = true;
      older.textContent = 'Loading older events…';
      try {
        const requestedBeforeRow = beforeRow;
        const page = await api('voucherHistory', {
          id: voucherId,
          beforeRow: requestedBeforeRow,
          eventCategory,
        });
        if (!isValidPage(page, requestedBeforeRow)) {
          throw new Error('The server returned invalid voucher-history data.');
        }
        if (!append) {
          list.replaceChildren();
          loadedAuditScans.length = 0;
        }
        if (loadedAuditScans.length >= maxAuditExportScans) {
          throw new Error(
            'This review reached the 100-range export limit. Export the loaded evidence before starting a new review.',
          );
        }
        const repeatedAcrossPages = appendEvents(page.rows);
        const exportFindingCandidates = [
          ...page.integrityFindings.items,
          ...repeatedAcrossPages.findings,
        ];
        const exportFindingSamples = exportFindingCandidates.slice(0, 25).map((finding) => ({
          code: finding.code,
          auditRow: finding.auditRow,
          relatedAuditRow: finding.relatedAuditRow,
          eventId: finding.eventId,
          eventType: finding.eventType,
        }));
        const exportFindingsTruncated =
          page.integrityFindings.truncated || exportFindingCandidates.length > 25;
        loadedAuditScans.push({
          eventCategory: page.eventCategory,
          scannedRows: page.scannedRows,
          scanRange: page.scanRange
            ? {
                firstRow: page.scanRange.firstRow,
                lastRow: page.scanRange.lastRow,
                hasOlderPage: page.scanRange.hasOlderPage,
              }
            : null,
          scanDiagnostics: { ...page.scanDiagnostics },
          integrityFindings: {
            items: exportFindingSamples,
            truncated: exportFindingsTruncated,
          },
        });
        exportEvidence.disabled = false;
        renderIntegrityFindings({
          items: exportFindingCandidates,
          truncated: page.integrityFindings.truncated || exportFindingCandidates.length > 50,
        });
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
          const categoryLabel =
            filter.options[filter.selectedIndex]?.textContent || 'selected event type';
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
            (
              filter.options[filter.selectedIndex]?.textContent || 'selected event type'
            ).toLowerCase() +
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
        if (page.scanRange) {
          status.textContent +=
            ' Searched AuditLog rows ' +
            page.scanRange.firstRow +
            '–' +
            page.scanRange.lastRow +
            '. ' +
            (page.scanRange.hasOlderPage
              ? 'Older rows remain available.'
              : 'No older rows remain.');
        } else if (page.scannedRows === 0) {
          status.textContent += ' No AuditLog rows were available to search.';
        }
        const scanDiagnostics = page.scanDiagnostics;
        status.textContent +=
          ' Coverage diagnostics: ' +
          scanDiagnostics.recognizedRows +
          ' recognized audit envelope(s), ' +
          scanDiagnostics.unstructuredRows +
          ' unstructured row(s), ' +
          scanDiagnostics.unsupportedRows +
          ' unsupported row(s).';
        if (scanDiagnostics.unstructuredRows || scanDiagnostics.unsupportedRows) {
          status.textContent +=
            ' Unstructured and unsupported rows were not used to link events to this voucher.';
        }
        status.textContent +=
          ' Integrity diagnostics: ' +
          scanDiagnostics.missingEventIdRows +
          ' missing event ID(s), ' +
          scanDiagnostics.unknownEventTypeRows +
          ' unrecognized event type(s), ' +
          scanDiagnostics.malformedChangeRows +
          ' malformed change payload(s), ' +
          scanDiagnostics.truncatedChangeRows +
          ' change list(s) capped at 30 entries.';
        if (
          scanDiagnostics.missingEventIdRows ||
          scanDiagnostics.unknownEventTypeRows ||
          scanDiagnostics.malformedChangeRows ||
          scanDiagnostics.truncatedChangeRows
        ) {
          status.textContent +=
            ' Missing IDs prevent duplicate checks for those rows; unrecognized and malformed payloads need review before relying on completeness.';
          status.className = 'error voucher-history-status';
        }
        if (scanDiagnostics.duplicateEventRows) {
          status.textContent +=
            ' Repeated event identifiers found: ' +
            scanDiagnostics.duplicateEventRows +
            ' duplicate row(s) in this scan. The rows remain visible; review the audit log before relying on completeness.';
          status.className = 'error voucher-history-status';
        }
        if (beforeRow !== null && loadedAuditScans.length >= maxAuditExportScans) {
          status.textContent +=
            ' The review reached the 100-range export limit. Export current evidence before restarting with another filter.';
        }
        if (repeatedAcrossPages.count) {
          status.textContent +=
            ' Repeated event identifiers across loaded pages: ' +
            repeatedAcrossPages.count +
            ' unique event ID(s). Rows remain visible; review the audit log before relying on completeness.';
          if (repeatedAcrossPages.rowReferences.length) {
            status.textContent +=
              ' Row references: ' + repeatedAcrossPages.rowReferences.join('; ') + '.';
          }
          status.className = 'error voucher-history-status';
        }
      } catch (error) {
        status.className = 'error voucher-history-status';
        status.textContent =
          error && typeof error.message === 'string'
            ? error.message.slice(0, 300)
            : 'Voucher history could not be loaded. Check the connection and retry.';
      } finally {
        loading = false;
        older.disabled = beforeRow === null || loadedAuditScans.length >= maxAuditExportScans;
        filter.disabled = false;
        older.textContent = 'Load older events';
        older.hidden = beforeRow === null;
      }
    };

    exportEvidence.addEventListener('click', () => {
      try {
        const exportedAt = new Date().toISOString();
        const csv = createAuditReconciliationCsv(loadedAuditScans, exportedAt);
        const timestamp = exportedAt.replace(/[:.]/g, '-');
        download(
          'voucher-audit-reconciliation-' + timestamp + '.csv',
          csv,
          'text/csv;charset=utf-8',
        );
        toast('Audit reconciliation evidence exported.', 'ok');
      } catch (error) {
        fail(error);
      }
    });
    filter.addEventListener('change', () => {
      if (loading) return;
      eventCategory = filter.value;
      beforeRow = null;
      loadedEventCount = 0;
      loadedAuditScans.length = 0;
      exportEvidence.disabled = true;
      seenEventRows.clear();
      repeatedEventRowsAcrossPages.clear();
      observedIntegrityFindings.clear();
      integrityFindingsTruncated = false;
      findingsList.replaceChildren();
      findingsPanel.hidden = true;
      list.replaceChildren();
      status.className = 'muted voucher-history-status';
      status.textContent = 'Loading voucher history…';
      loadPage(false);
    });
    older.addEventListener('click', () => loadPage(true));
    dialog(voucher ? 'Voucher history for ' + voucherNo(voucher) : 'Voucher history', body, null);
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

  function openDashboardContext(context = {}) {
    const requestedFrom = scalarText(context.from);
    const requestedTo = scalarText(context.to);
    const validRange =
      isBusinessDate(requestedFrom) && isBusinessDate(requestedTo) && requestedFrom <= requestedTo;
    Object.assign(R, {
      q: typeof context.query === 'string' ? context.query.trim().slice(0, 120) : '',
      vendor: typeof context.vendor === 'string' ? context.vendor.trim().slice(0, 200) : '',
      cat: '',
      user: '',
      t: ['PAYMENT', 'RECEIPT'].includes(context.type) ? context.type : '',
      from: validRange ? requestedFrom : '',
      to: validRange ? requestedTo : '',
      st: ['ACTIVE', 'CANCELLED', 'ALL'].includes(context.status) ? context.status : 'ACTIVE',
      approval: [
        'ALL',
        'PENDING',
        'APPROVED',
        'REJECTED',
        'NOT_REQUIRED',
        'REVIEW_REQUIRED',
      ].includes(context.approval)
        ? context.approval
        : 'ALL',
      paymentMethod: 'ALL',
      cashImpact: ['CASH_IN', 'CASH_OUT', 'NO_CASH', 'UNCLASSIFIED'].includes(context.cashImpact)
        ? context.cashImpact
        : 'ALL',
      amountValidity: ['VALID', 'INVALID'].includes(context.amountValidity)
        ? context.amountValidity
        : 'ALL',
      limit: 100,
    });
    pageRequestSequence += 1;
    clearTimeout(filterDebounce);
    pageRows = [];
    pageTotalCount = 0;
    pageTotals = null;
    pageFacets = { vendors: [], users: [] };
    pageLoading = false;
    pageError = null;
  }

  function bind() {
    $('#view').addEventListener('input', updateFilter);
    $('#view').addEventListener('change', updateFilter);
    $('#view').addEventListener('click', (event) => {
      const button = event.target.closest('[data-register-range]');
      if (!button || S.view !== 'reg') return;
      const range = registerDateRanges().find((item) => item.key === button.dataset.registerRange);
      if (!range) return;
      R.from = range.from;
      R.to = range.to;
      R.limit = 100;
      pageRows = [];
      pageTotalCount = 0;
      renderRows();
    });
  }

  return {
    bind,
    render,
    renderRows,
    openDashboardContext,
    loadMore,
    clearFilters,
    csvExport,
    edit,
    cancel,
    approve,
    reject,
    classifyCashMovement,
    history,
    receipts,
    state: R,
  };
}
