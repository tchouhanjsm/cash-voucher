import { $ } from '../core/dom.js';
import { can, paymentMethodLabel } from '../core/state.js';
import { offlineQueue } from '../core/offline-queue.js';
import { csvCell, download, esc, money, businessDate, uid } from '../core/utils.js';
import { busy, fail, head, pageNotice, toast } from '../core/ui.js';

const CORRECTION_TYPES = [
  ['VOUCHER', 'Voucher review'],
  ['CASH_COUNT', 'Physical count'],
  ['OPENING_CASH', 'Opening cash'],
  ['OTHER', 'Other'],
];

export function createCashClose({ api }) {
  let data = null;
  let currentDate = businessDate();
  let pendingRequestId = '';
  let pendingRequestSignature = '';

  function metric(label, value) {
    return (
      '<div class="cc-metric"><span>' +
      esc(label) +
      '</span><strong>' +
      esc(value) +
      '</strong></div>'
    );
  }

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isText = (value) => typeof value === 'string';
  const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
  const isAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const isDate = (value) => {
    if (!isText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  };

  function isCloseVoucher(item, date) {
    return (
      isRecord(item) &&
      isText(item.id) &&
      item.id.trim() !== '' &&
      isText(item.no) &&
      item.no.trim() !== '' &&
      item.date === date &&
      isDate(item.date) &&
      isText(item.vendor) &&
      (item.paymentMethod === undefined ||
        (isText(item.paymentMethod) && item.paymentMethod.length <= 40)) &&
      typeof item.amount === 'number' &&
      Number.isFinite(item.amount) &&
      item.amount > 0 &&
      ['CASH_IN', 'CASH_OUT', 'NO_CASH'].includes(item.cashImpact)
    );
  }

  function isCorrection(item) {
    const textFields = [
      'id',
      'closeId',
      'voucherId',
      'type',
      'details',
      'reason',
      'createdBy',
      'createdAt',
    ];
    return isRecord(item) && textFields.every((field) => isText(item[field])) && isDate(item.date);
  }

  function isCloseRecord(close, requireCorrections = false) {
    const textFields = [
      'drawerKey',
      'openingSource',
      'openingCloseId',
      'openingReason',
      'varianceReason',
      'createdBy',
      'createdAt',
      'timeZone',
    ];
    const amountFields = [
      'openingCash',
      'cashInTotal',
      'cashOutTotal',
      'expectedCash',
      'countedCash',
    ];

    if (
      !isRecord(close) ||
      !isText(close.id) ||
      close.id.trim() === '' ||
      !isDate(close.date) ||
      !textFields.every((field) => isText(close[field])) ||
      !amountFields.every((field) => isAmount(close[field])) ||
      typeof close.variance !== 'number' ||
      !Number.isFinite(close.variance) ||
      !Array.isArray(close.includedVouchers) ||
      !Array.isArray(close.includedVoucherIds) ||
      !isCount(close.includedVoucherCount) ||
      close.includedVoucherCount !== close.includedVouchers.length ||
      close.includedVoucherIds.length !== close.includedVouchers.length ||
      !close.includedVouchers.every((item) => isCloseVoucher(item, close.date)) ||
      !close.includedVoucherIds.every(
        (id, index) =>
          isText(id) &&
          id.trim() !== '' &&
          id === close.includedVouchers[index].id &&
          close.includedVoucherIds.indexOf(id) === index,
      ) ||
      (requireCorrections && !Array.isArray(close.corrections)) ||
      (close.corrections !== undefined &&
        (!Array.isArray(close.corrections) || !close.corrections.every(isCorrection)))
    ) {
      return false;
    }

    return true;
  }

  function isPreviewVoucher(item) {
    return (
      isRecord(item) &&
      isText(item.id) &&
      isText(item.no) &&
      isDate(item.date) &&
      isText(item.vendor) &&
      (item.paymentMethod === undefined ||
        (isText(item.paymentMethod) && item.paymentMethod.length <= 40)) &&
      (isAmount(item.amount) || item.amount === null) &&
      ['CASH_IN', 'CASH_OUT', 'NO_CASH', 'UNCLASSIFIED'].includes(item.cashImpact)
    );
  }

  function isIssueRow(item, kind) {
    if (
      !isRecord(item) ||
      !['id', 'no', 'vendor', 'reason'].every((field) => isText(item[field]))
    ) {
      return false;
    }

    if (kind === 'invalid') return isText(item.amount);

    if (kind === 'unclassified') {
      return isDate(item.date) && (isAmount(item.amount) || item.amount === null);
    }

    return (
      isDate(item.date) &&
      (isAmount(item.amount) || item.amount === null) &&
      isText(item.approvalStatus)
    );
  }

  function isCashClosePreview(value, requestedDate) {
    if (
      !isRecord(value) ||
      value.date !== requestedDate ||
      !isDate(value.date) ||
      !isDate(value.today) ||
      value.date > value.today ||
      typeof value.closed !== 'boolean' ||
      !isText(value.timeZone) ||
      !Array.isArray(value.recentCloses) ||
      !value.recentCloses.every((close) => isCloseRecord(close, true))
    ) {
      return false;
    }

    if (value.closed) {
      return isCloseRecord(value.close, true) && value.close.date === value.date;
    }

    return (
      typeof value.blockedByLaterClose === 'boolean' &&
      isText(value.laterCloseDate) &&
      typeof value.requiresManualOpening === 'boolean' &&
      (value.previousClose === null || isCloseRecord(value.previousClose)) &&
      (value.openingCash === null || isAmount(value.openingCash)) &&
      isText(value.openingSource) &&
      isText(value.openingReason) &&
      typeof value.openingReady === 'boolean' &&
      isAmount(value.cashInTotal) &&
      isAmount(value.cashOutTotal) &&
      isCount(value.noCashCount) &&
      isCount(value.activeVoucherCount) &&
      Array.isArray(value.includedVouchers) &&
      value.includedVouchers.every(isPreviewVoucher) &&
      Array.isArray(value.pendingApprovals) &&
      value.pendingApprovals.every((item) => isIssueRow(item, 'approval')) &&
      Array.isArray(value.unclassified) &&
      value.unclassified.every((item) => isIssueRow(item, 'unclassified')) &&
      Array.isArray(value.invalidVouchers) &&
      value.invalidVouchers.every((item) => isIssueRow(item, 'invalid')) &&
      (value.expectedCash === null || isAmount(value.expectedCash)) &&
      typeof value.readyToClose === 'boolean' &&
      typeof value.expectedInvalid === 'boolean'
    );
  }


  function methodBreakdownMarkup(vouchers) {
    const snapshot = Array.isArray(vouchers) ? vouchers : [];
    const groups = new Map();

    snapshot.forEach((item) => {
      const direction = typeof item.no === 'string' && item.no.startsWith('R-') ? 'Receipt' : 'Payment';
      const method = paymentMethodLabel(item.paymentMethod);
      const key = direction + '|' + method;
      if (!groups.has(key)) {
        groups.set(key, {
          direction,
          method,
          count: 0,
          amountPaise: 0,
          invalidAmount: false,
          unclassifiedCount: 0,
        });
      }

      const group = groups.get(key);
      group.count++;
      const amountPaise = Math.round(item.amount * 100);
      if (
        typeof item.amount !== 'number' ||
        !Number.isFinite(item.amount) ||
        item.amount <= 0 ||
        !Number.isSafeInteger(amountPaise) ||
        Math.abs(item.amount * 100 - amountPaise) > 0.000001
      ) {
        group.invalidAmount = true;
      } else {
        group.amountPaise += amountPaise;
      }
      if (item.cashImpact === 'UNCLASSIFIED') group.unclassifiedCount++;
    });

    const sorted = Array.from(groups.values()).sort((a, b) =>
      (a.direction === b.direction ? 0 : a.direction === 'Payment' ? -1 : 1) ||
      a.method.localeCompare(b.method),
    );
    return (
      '<section class="cc-method-breakdown"><h3>Payment-method reconciliation</h3>' +
      '<p class="muted">Voucher amounts grouped by direction and saved method; these are not physical-cash or bank-balance totals. Pending approval entries remain listed separately. Blank historical methods show as Not recorded.</p>' +
      (sorted.length
        ? '<div class="cc-method-grid">' +
          sorted
            .map(
              (group) =>
                '<div class="cc-method-item"><div class="cc-method-item__label"><strong>' +
                esc(group.direction + ' · ' + group.method) +
                '</strong><span class="muted">' +
                esc(group.count) +
                (group.count === 1 ? ' voucher' : ' vouchers') +
                (group.unclassifiedCount
                  ? ' · ' + esc(group.unclassifiedCount) + ' cash-impact issue(s)'
                  : '') +
                '</span></div><strong class="cc-method-item__amount">' +
                (group.invalidAmount ? 'Amount requires review' : esc(money(group.amountPaise / 100))) +
                '</strong></div>',
            )
            .join('') +
          '</div>'
        : '<p class="muted">No voucher rows available for this breakdown.</p>') +
      '</section>'
    );
  }

  function render() {
    if (!can('cashClose')) {
      $('#view').replaceChildren(
        pageNotice('Daily Cash Close', 'This feature is available to owners and managers.', {
          messageClass: 'muted',
          role: 'status',
        }),
      );
      return;
    }
    currentDate = $('#cc-date')?.value || businessDate();
    $('#view').innerHTML =
      head('Daily Cash Close', '', {
        section: 'Money',
        description: 'Reconcile physical cash against synced vouchers.',
      }) +
      '<p class="muted cc-intro">One physical drawer · calendar day in Asia/Kolkata · server-saved vouchers only. This report is a physical cash reconciliation, not a bank balance or general ledger.</p>' +
      '<section class="card cc-controls"><div class="filters">' +
      '<label for="cc-date">Business date <input id="cc-date" type="date" min="2000-01-01" max="' +
      esc(businessDate()) +
      '" value="' +
      esc(currentDate) +
      '" required></label>' +
      '<button type="button" class="btn" data-act="closePreview">Preview date</button>' +
      '</div></section>' +
      '<div id="cc-results" aria-live="polite" aria-busy="true"><p class="muted">Loading cash-close preview…</p></div>';
    preview(currentDate);
  }

  function correctionMarkup(close) {
    const corrections = Array.isArray(close.corrections) ? close.corrections : [];
    const history = corrections.length
      ? '<ul class="cc-corrections">' +
        corrections
          .map(
            (item) =>
              '<li><b>' +
              esc(item.type) +
              '</b> · ' +
              esc(item.createdBy) +
              ' · ' +
              esc(item.createdAt) +
              '<p>' +
              esc(item.details) +
              '</p><p class="muted">Reason: ' +
              esc(item.reason) +
              (item.voucherId ? ' · Voucher ID: ' + esc(item.voucherId) : '') +
              '</p></li>',
          )
          .join('') +
        '</ul>'
      : '<p class="muted">No correction notes recorded for this close.</p>';
    return (
      '<section class="card cc-corrections-card"><h2>Attributed correction note</h2>' +
      '<p class="muted">This appends a separate correction note. It does not edit a voucher, reopen the period, or change the saved close totals.</p>' +
      '<div class="filters cc-correction-form">' +
      '<label for="cc-corr-type">Correction type<select id="cc-corr-type">' +
      CORRECTION_TYPES.map(
        ([value, label]) => '<option value="' + esc(value) + '">' + esc(label) + '</option>',
      ).join('') +
      '</select></label>' +
      '<label for="cc-corr-voucher">Included voucher ID (optional)<input id="cc-corr-voucher" maxlength="100" placeholder="Paste an ID from the close snapshot"></label>' +
      '<label for="cc-corr-details">What needs correction?<textarea id="cc-corr-details" rows="2" maxlength="1000" required></textarea></label>' +
      '<label for="cc-corr-reason">Reason<textarea id="cc-corr-reason" rows="2" maxlength="200" required></textarea></label>' +
      '<button type="button" class="btn primary" data-act="closeCorrection">Record correction note</button></div>' +
      '<h3>Correction history</h3>' +
      history +
      '</section>'
    );
  }

  function closeReport(close) {
    const vouchers = Array.isArray(close.includedVouchers) ? close.includedVouchers : [];
    const rows = vouchers
      .slice(0, 60)
      .map(
        (item) =>
          '<tr><td>' +
          esc(item.no) +
          '</td><td>' +
          esc(item.vendor) +
          '</td><td>' +
          esc(paymentMethodLabel(item.paymentMethod)) +
          '</td><td>' +
          esc(item.cashImpact) +
          '</td><td class="r">' +
          esc(money(item.amount)) +
          '</td><td class="cc-id">' +
          esc(item.id) +
          '</td></tr>',
      )
      .join('');
    const overflow =
      vouchers.length > 60
        ? '<p class="muted">Showing the first 60 of ' +
          esc(vouchers.length) +
          ' voucher snapshot rows. CSV export includes every included voucher.</p>'
        : '';
    return (
      '<section class="card cc-report" id="cc-closed-report"><div class="cc-report-heading"><div><span class="badge">CLOSED</span><h2>Cash close · ' +
      esc(close.date) +
      '</h2><p class="muted">Drawer: ' +
      esc(close.drawerKey) +
      ' · Time zone: ' +
      esc(close.timeZone) +
      '</p></div><div class="chips"><button class="btn" type="button" data-act="closeCsv">Export CSV</button><button class="btn" type="button" data-act="closePrint">Print report</button></div></div>' +
      '<div class="cc-metrics">' +
      metric('Opening cash', money(close.openingCash)) +
      metric('Cash in', money(close.cashInTotal)) +
      metric('Cash out', money(close.cashOutTotal)) +
      metric('Expected cash', money(close.expectedCash)) +
      metric('Physical count', money(close.countedCash)) +
      metric('Variance (counted − expected)', money(close.variance)) +
      '</div>' +
      methodBreakdownMarkup(vouchers) +
      '<dl class="cc-meta"><div><dt>Opening source</dt><dd>' +
      esc(
        close.openingSource === 'PREVIOUS_CLOSE'
          ? 'Previous accepted close'
          : 'Manual opening / gap resolution',
      ) +
      '</dd></div><div><dt>Opening close ID</dt><dd>' +
      esc(close.openingCloseId || 'Not applicable') +
      '</dd></div><div><dt>Opening reason</dt><dd>' +
      esc(close.openingReason || 'Carried forward from prior close') +
      '</dd></div><div><dt>Variance reason</dt><dd>' +
      esc(close.varianceReason || 'No variance') +
      '</dd></div><div><dt>Included active vouchers</dt><dd>' +
      esc(close.includedVoucherCount) +
      '</dd></div><div><dt>Operator</dt><dd>' +
      esc(close.createdBy) +
      '</dd></div><div><dt>Saved at</dt><dd>' +
      esc(close.createdAt) +
      '</dd></div><div><dt>Close ID</dt><dd class="cc-id">' +
      esc(close.id) +
      '</dd></div></dl>' +
      '<h3>Included voucher snapshot</h3><p class="muted">NO_CASH entries are listed for traceability but do not affect drawer totals. Cancelled vouchers are excluded.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>Voucher</th><th>Counterparty</th><th>Payment method</th><th>Cash impact</th><th class="r">Amount</th><th>Voucher ID</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="muted">No active vouchers in this period.</td></tr>') +
      '</tbody></table></div>' +
      overflow +
      '</section>' +
      correctionMarkup(close)
    );
  }

  function recentHistory(rows, selectedDate) {
    const closes = Array.isArray(rows) ? rows : [];
    if (!closes.length) return '';
    return (
      '<section class="card cc-history"><h2>Recent closes</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Operator</th><th>Expected</th><th>Counted</th><th>Variance</th><th></th></tr></thead><tbody>' +
      closes
        .map(
          (close) =>
            '<tr><td>' +
            esc(close.date) +
            '</td><td>' +
            esc(close.createdBy) +
            '</td><td>' +
            esc(money(close.expectedCash)) +
            '</td><td>' +
            esc(money(close.countedCash)) +
            '</td><td>' +
            esc(money(close.variance)) +
            '</td><td><button class="btn sm" type="button" data-act="closeSelect" data-k="' +
            esc(close.date) +
            '"' +
            (close.date === selectedDate ? ' disabled' : '') +
            '>Open report</button></td></tr>',
        )
        .join('') +
      '</tbody></table></div></section>'
    );
  }

  function addOneDayBefore(date) {
    const value = new Date(date + 'T12:00:00Z');
    value.setUTCDate(value.getUTCDate() - 1);
    return value.toISOString().slice(0, 10);
  }

  function previewReport(snapshot) {
    const date = snapshot.date;
    if (snapshot.closed && snapshot.close) {
      $('#cc-results').innerHTML =
        closeReport(snapshot.close) + recentHistory(snapshot.recentCloses, date);
      $('#cc-results').setAttribute('aria-busy', 'false');
      return;
    }
    const openValue = snapshot.openingCash === null ? '' : String(snapshot.openingCash);
    const openingMarkup = snapshot.requiresManualOpening
      ? '<div class="cc-opening"><h3>Opening cash requires confirmation</h3><p class="muted">No close exists for ' +
        esc(addOneDayBefore(date)) +
        '. Enter the opening physical cash and explain the starting balance or gap. The global Settings opening balance is not used.</p>' +
        '<div class="filters"><label for="cc-opening">Opening cash (₹)<input id="cc-opening" type="number" min="0" max="10000000" step="0.01" inputmode="decimal" value="' +
        esc(openValue) +
        '" required></label><label for="cc-opening-reason">Opening/gap reason<input id="cc-opening-reason" maxlength="200" value="' +
        esc(snapshot.openingReason || '') +
        '" placeholder="Why is a manual opening needed?" required></label></div></div>'
      : '<p class="cc-note">Opening cash: <b>' +
        esc(money(snapshot.openingCash)) +
        '</b> · carried from the previous accepted close on ' +
        esc(addOneDayBefore(date)) +
        '.</p>';
    const unresolved = (Array.isArray(snapshot.unclassified) ? snapshot.unclassified : [])
      .map(
        (item) =>
          '<tr><td>' +
          esc(item.no) +
          '</td><td>' +
          esc(item.vendor) +
          '</td><td>' +
          esc(money(item.amount)) +
          '</td><td class="cc-id">' +
          esc(item.id) +
          '</td><td>UNCLASSIFIED</td></tr>',
      )
      .join('');
    const bad = (Array.isArray(snapshot.invalidVouchers) ? snapshot.invalidVouchers : [])
      .map(
        (item) =>
          '<tr><td>' +
          esc(item.no) +
          '</td><td>' +
          esc(item.vendor) +
          '</td><td>' +
          esc(item.amount) +
          '</td><td class="cc-id">' +
          esc(item.id) +
          '</td><td>' +
          esc(item.reason) +
          '</td></tr>',
      )
      .join('');
    const pendingApprovalRows = Array.isArray(snapshot.pendingApprovals)
      ? snapshot.pendingApprovals
      : [];
    const approvalIssues = pendingApprovalRows
      .map(
        (item) =>
          '<tr><td>' +
          esc(item.no) +
          '</td><td>' +
          esc(item.vendor) +
          '</td><td>' +
          esc(item.amount === null || item.amount === undefined ? '—' : money(item.amount)) +
          '</td><td class="cc-id">' +
          esc(item.id) +
          '</td><td>' +
          esc(item.approvalStatus || 'REVIEW_REQUIRED') +
          ': ' +
          esc(item.reason || 'Payment approval must be resolved.') +
          '</td></tr>',
      )
      .join('');
    const issues =
      unresolved || bad || approvalIssues
        ? '<section class="cc-blockers"><h3>Resolve before final close</h3><p>Every included active voucher needs a valid amount and explicit cash impact. Active high-value payments must also be approved before close; unapproved or rejected payments are excluded from the expected-cash total but block finalization.</p><div class="table-wrap"><table><thead><tr><th>Voucher</th><th>Counterparty</th><th>Amount</th><th>Voucher ID</th><th>Issue</th></tr></thead><tbody>' +
          unresolved +
          bad +
          approvalIssues +
          '</tbody></table></div><p class="muted">Open Register to classify historical vouchers, correct invalid records, or approve/cancel unresolved payments, then refresh this preview. Historical values are never guessed.</p></section>'
        : '';
    const expectedValue =
      snapshot.expectedCash === null
        ? 'Unavailable until opening and voucher issues are resolved'
        : money(snapshot.expectedCash);
    const cannotReason = snapshot.expectedInvalid
      ? '<p class="cc-error" role="alert">Expected physical cash is negative. Review the opening amount and cash-impact classifications.</p>'
      : '';
    const orderIssue = snapshot.blockedByLaterClose
      ? '<section class="cc-blockers" role="alert"><h3>Close dates out of order</h3><p>A later business date (' +
        esc(snapshot.laterCloseDate) +
        ') is already closed. To preserve opening-cash history, an earlier date cannot be finalized. The saved close remains unchanged.</p></section>'
      : '';
    const queueKnown = snapshot.localQueueKnown === true;
    const queueCount = Number.isSafeInteger(snapshot.localQueueCount)
      ? snapshot.localQueueCount
      : null;
    const queueIssue = !queueKnown
      ? '<section class="cc-blockers" role="alert"><h3>Offline queue could not be verified</h3><p>Daily Cash Close is disabled until this browser’s offline/recovery queue can be inspected. Do not clear browser storage to bypass this check.</p></section>'
      : queueCount > 0
        ? '<section class="cc-blockers" role="alert"><h3>Resolve this browser’s offline queue</h3><p>' +
          esc(queueCount) +
          ' offline/recovery entr' +
          (queueCount === 1 ? 'y is' : 'ies are') +
          ' still stored on this browser. Sync or review/export each entry from its matching account before closing. Do not delete entries just to close the day. Other phones/devices must be checked separately; the server cannot inspect their local queues.</p></section>'
        : '<p class="cc-note">This browser’s offline queue is empty. Confirm other operating devices are also synchronized before finalizing.</p>';
    const canClose =
      snapshot.readyToClose &&
      !unresolved &&
      !bad &&
      !approvalIssues &&
      queueKnown &&
      queueCount === 0;
    $('#cc-results').innerHTML =
      '<section class="card cc-preview"><div class="cc-report-heading"><div><h2>Preview · ' +
      esc(date) +
      '</h2><p class="muted">Calculated from centrally synchronized ACTIVE vouchers. Cancelled vouchers are excluded.</p></div><span class="badge">PREVIEW ONLY</span></div>' +
      openingMarkup +
      cannotReason +
      orderIssue +
      queueIssue +
      '<div class="cc-metrics">' +
      metric('Active vouchers', String(snapshot.activeVoucherCount || 0)) +
      metric('Cash in', money(snapshot.cashInTotal)) +
      metric('Cash out', money(snapshot.cashOutTotal)) +
      metric('NO_CASH vouchers', String(snapshot.noCashCount || 0)) +
      metric('Expected physical cash', expectedValue) +
      '</div>' +
      methodBreakdownMarkup(snapshot.includedVouchers) +
      issues +
      '<div class="cc-count"><h3>Physical count</h3><div class="filters"><label for="cc-counted">Counted cash (₹)<input id="cc-counted" type="number" min="0" max="10000000" step="0.01" inputmode="decimal" placeholder="Count notes and coins" required></label>' +
      '<label for="cc-variance-reason">Variance reason (required when different)<input id="cc-variance-reason" maxlength="200" placeholder="Explain a non-zero variance"></label></div>' +
      '<button id="cc-create" type="button" class="btn primary" data-act="closeCreate"' +
      (canClose ? '' : ' disabled') +
      '>Save daily close</button><p class="muted">Saving creates an immutable close record for this date. Server totals and permissions are revalidated when saving.</p></div></section>' +
      recentHistory(snapshot.recentCloses, date);
    $('#cc-results').setAttribute('aria-busy', 'false');
  }

  async function preview(date = $('#cc-date')?.value || currentDate) {
    currentDate = date;
    // Preserve manual-opening values before replacing the preview DOM.
    const sameOpenDate = data && data.date === date && !data.closed;
    const opening = sameOpenDate ? $('#cc-opening')?.value : undefined;
    const reason = sameOpenDate ? $('#cc-opening-reason')?.value : undefined;
    const results = $('#cc-results');
    data = null;
    if (results) {
      results.setAttribute('aria-busy', 'true');
      const loading = document.createElement('p');
      loading.className = 'muted';
      loading.textContent = 'Refreshing server cash-close preview…';
      results.replaceChildren(loading);
    }
    const payload = { date };
    if (opening !== undefined && opening !== '') payload.openingCash = opening;
    if (reason !== undefined) payload.openingReason = reason;
    try {
      const serverPreview = await api('cashClosePreview', payload);
      if (!isCashClosePreview(serverPreview, date)) {
        throw new Error(
          'The server returned an invalid cash-close preview. Refresh and review before saving.',
        );
      }
      try {
        const localRecords = await offlineQueue.list();
        data = { ...serverPreview, localQueueKnown: true, localQueueCount: localRecords.length };
      } catch {
        data = { ...serverPreview, localQueueKnown: false, localQueueCount: null };
      }
      previewReport(data);
    } catch (error) {
      if (results) {
        const section = document.createElement('section');
        section.className = 'card';
        const errorMessage = document.createElement('p');
        errorMessage.className = 'cc-error';
        errorMessage.setAttribute('role', 'alert');
        errorMessage.textContent = error.message || 'Unable to load cash-close preview.';
        const recoveryNote = document.createElement('p');
        recoveryNote.className = 'muted';
        recoveryNote.textContent =
          'No close was created. Confirm storage migration and refresh after the reviewed backend is installed.';
        section.append(errorMessage, recoveryNote);
        results.replaceChildren(section);
        results.setAttribute('aria-busy', 'false');
      }
      fail(error);
    }
  }

  async function create(button) {
    const date = $('#cc-date')?.value || '';
    if (!data || data.date !== date) {
      await preview(date);
      toast('Preview refreshed. Review the totals before saving.', 'err');
      return;
    }
    if (data.closed) {
      toast('This date is already closed; the saved report remains unchanged.', 'err');
      return;
    }
    let queueRecords;
    try {
      queueRecords = await offlineQueue.list();
    } catch {
      data = { ...data, localQueueKnown: false, localQueueCount: null };
      previewReport(data);
      toast('Could not verify this browser’s offline queue. Daily Cash Close is blocked.', 'err');
      return;
    }
    if (queueRecords.length) {
      data = { ...data, localQueueKnown: true, localQueueCount: queueRecords.length };
      previewReport(data);
      toast('Sync or review this browser’s offline queue before closing the day.', 'err');
      return;
    }
    const countedCash = $('#cc-counted')?.value ?? '';
    const openingCash = $('#cc-opening')?.value;
    const openingReason = $('#cc-opening-reason')?.value || '';
    const varianceReason = $('#cc-variance-reason')?.value || '';
    const signature = JSON.stringify({
      date,
      openingCash: openingCash ?? null,
      openingReason,
      countedCash,
      varianceReason,
    });
    if (!pendingRequestId || pendingRequestSignature !== signature) {
      pendingRequestId = uid();
      pendingRequestSignature = signature;
    }
    const payload = { date, countedCash, varianceReason, requestId: pendingRequestId };
    if (openingCash !== undefined && openingCash !== '') payload.openingCash = openingCash;
    if (openingReason) payload.openingReason = openingReason;
    await busy(button, async () => {
      try {
        await api('createCashClose', payload);
        pendingRequestId = '';
        pendingRequestSignature = '';
        toast('Daily cash close saved. The original report is now immutable.', 'ok');
        await preview(date);
      } catch (error) {
        if (error.code !== 'NET' && error.code !== 'BAD') {
          pendingRequestId = '';
          pendingRequestSignature = '';
        }
        fail(error);
        if (error.code === 'CASH_CLOSE_EXISTS') await preview(date);
      }
    });
  }

  async function recordCorrection(button) {
    if (!data?.closed || !data.close?.id) {
      toast('Open a saved close before recording a correction.', 'err');
      return;
    }
    const payload = {
      closeId: data.close.id,
      type: $('#cc-corr-type')?.value || 'OTHER',
      voucherId: $('#cc-corr-voucher')?.value || '',
      details: $('#cc-corr-details')?.value || '',
      reason: $('#cc-corr-reason')?.value || '',
    };
    await busy(button, async () => {
      try {
        await api('recordCashCloseCorrection', payload);
        toast('Attributed correction note recorded; original close unchanged.', 'ok');
        await preview(data.date);
      } catch (error) {
        fail(error);
      }
    });
  }

  function selectClose(date) {
    const input = $('#cc-date');
    if (!input || !date) return;
    input.value = date;
    preview(date);
  }

  function exportCsv() {
    const close = data?.closed ? data.close : null;
    if (!close) {
      toast('Save or open a closed report before exporting.', 'err');
      return;
    }
    const rows = [
      ['Daily Cash Close', close.date],
      ['Time zone', close.timeZone],
      ['Drawer', close.drawerKey],
      ['Opening cash', close.openingCash],
      ['Opening source', close.openingSource],
      ['Opening reason', close.openingReason],
      ['Cash in', close.cashInTotal],
      ['Cash out', close.cashOutTotal],
      ['Expected physical cash', close.expectedCash],
      ['Counted physical cash', close.countedCash],
      ['Variance (counted minus expected)', close.variance],
      ['Variance reason', close.varianceReason],
      ['Included voucher count', close.includedVoucherCount],
      ['Created by', close.createdBy],
      ['Created at', close.createdAt],
      ['Close ID', close.id],
      [],
      ['Voucher', 'Counterparty', 'Payment method', 'Cash impact', 'Amount', 'Date', 'Voucher ID'],
      ...(close.includedVouchers || []).map((voucher) => [
        voucher.no,
        voucher.vendor,
        paymentMethodLabel(voucher.paymentMethod),
        voucher.cashImpact,
        voucher.amount,
        voucher.date,
        voucher.id,
      ]),
      [],
      ['Correction type', 'Details', 'Reason', 'Voucher ID', 'Created by', 'Created at'],
      ...(close.corrections || []).map((item) => [
        item.type,
        item.details,
        item.reason,
        item.voucherId,
        item.createdBy,
        item.createdAt,
      ]),
    ];
    download(
      'cash-close-' + close.date + '.csv',
      rows.map((row) => row.map(csvCell).join(',')).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  }

  function print() {
    const close = data?.closed ? data.close : null;
    if (!close) {
      toast('Open a saved close before printing.', 'err');
      return;
    }
    const vouchers = Array.isArray(close.includedVouchers) ? close.includedVouchers : [];
    const rows = vouchers
      .map(
        (item) =>
          '<tr><td>' +
          esc(item.no) +
          '</td><td>' +
          esc(item.vendor) +
          '</td><td>' +
          esc(paymentMethodLabel(item.paymentMethod)) +
          '</td><td>' +
          esc(item.cashImpact) +
          '</td><td>' +
          esc(money(item.amount)) +
          '</td><td>' +
          esc(item.id) +
          '</td></tr>',
      )
      .join('');
    $('#printArea').innerHTML =
      '<div class="pv"><div class="pv-head"><div class="pv-hotel">Daily Cash Close</div><div class="pv-title">PHYSICAL CASH RECONCILIATION</div></div>' +
      '<div class="pv-meta"><div>Business date: <b>' +
      esc(close.date) +
      '</b></div><div>Time zone: <b>' +
      esc(close.timeZone) +
      '</b></div></div>' +
      '<div class="pv-row"><div class="l">Opening cash</div><div class="v">' +
      esc(money(close.openingCash)) +
      ' (' +
      esc(close.openingSource) +
      ')</div></div>' +
      '<div class="pv-row"><div class="l">Cash in / out</div><div class="v">' +
      esc(money(close.cashInTotal)) +
      ' / ' +
      esc(money(close.cashOutTotal)) +
      '</div></div>' +
      '<div class="pv-row"><div class="l">Expected cash</div><div class="v">' +
      esc(money(close.expectedCash)) +
      '</div></div><div class="pv-row"><div class="l">Physical count</div><div class="v">' +
      esc(money(close.countedCash)) +
      '</div></div><div class="pv-row"><div class="l">Variance</div><div class="v">' +
      esc(money(close.variance)) +
      ' — ' +
      esc(close.varianceReason || 'No variance') +
      '</div></div>' +
      methodBreakdownMarkup(vouchers) +
      '<p>Recorded by ' +
      esc(close.createdBy) +
      ' at ' +
      esc(close.createdAt) +
      ' · Close ID: ' +
      esc(close.id) +
      '</p><h3>Included voucher snapshot</h3><table><thead><tr><th>Voucher</th><th>Counterparty</th><th>Payment method</th><th>Cash impact</th><th>Amount</th><th>Voucher ID</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6">No active vouchers in this period.</td></tr>') +
      '</tbody></table></div>';
    window.print();
  }

  return { render, preview, create, exportCsv, print, recordCorrection, selectClose };
}
