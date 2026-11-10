import { $ } from '../core/dom.js';
import { CASH_IMPACT_CHOICES, categories, rcats, S, suggestCashImpact } from '../core/state.js';
import { addDays, dmy, download, esc, money, pad, parseAmt, today, uid } from '../core/utils.js';
import { busy, fail, head } from '../core/ui.js';

export function createBulk({ api, refresh, go }) {
  let rows = [];
  let type = 'PAYMENT';
  let sourceSystem = 'manual-csv';

  function render() {
    rows = [];

    $('#view').innerHTML =
      head('Bulk Upload', '', {
        section: 'Manage',
        description: 'Review row data and cash-impact classifications before importing a batch.',
      }) +
      `<div class="card bulk-import-panel"><h2>1. Get your data in</h2>
    <p class="muted">Required columns: <b>SourceID, Date, Vendor, Amount</b>; optional <b>Category, Notes, CashImpact, PaymentMethod</b>. CashImpact values: CASH_IN, CASH_OUT, NO_CASH. If omitted, the preview shows a suggestion only and requires your explicit selection before import. Verify each choice against physical drawer movement. Dates like 25/12/2026 or 2026-12-25. Import CSV/TSV files or paste spreadsheet rows. Excel (.xls/.xlsx) is temporarily disabled for security; save as CSV/TSV or paste the rows instead.</p>
    <div class="actions"><button class="btn" data-act="tpl">⬇ Download template</button><label class="btn bulk-file-label">📁 Choose file<input type="file" id="bf" class="bulk-file-input" accept=".csv,.tsv,.txt" aria-label="Choose CSV or TSV file"></label></div>
    <label class="bulk-entry-kind">These rows are<select id="bt2"><option value="PAYMENT">Payments (cash out)</option><option value="RECEIPT">Cash received (cash in)</option></select></label>
    <label>…or paste rows here<textarea id="bt" rows="5" placeholder="25/12/2026&#9;Ram Traders&#9;1500&#9;Kitchen&#9;vegetables"></textarea></label>
    <button class="btn primary" data-act="parse">Check data</button></div><div id="bprev"></div>`;
  }

  function parseDelim(text) {
    text = text.replace(/^\uFEFF/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delimiter = first.includes('\t')
      ? '\t'
      : first.split(';').length > first.split(',').length
        ? ';'
        : ',';
    const output = [];
    let row = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < text.length; index++) {
      const character = text[index];

      if (quoted) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            cell += '"';
            index++;
          } else {
            quoted = false;
          }
        } else {
          cell += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === delimiter) {
        row.push(cell);
        cell = '';
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && text[index + 1] === '\n') index++;
        row.push(cell);
        output.push(row);
        row = [];
        cell = '';
      } else {
        cell += character;
      }
    }

    if (cell !== '' || row.length) {
      row.push(cell);
      output.push(row);
    }

    return output.filter((item) => item.some((value) => String(value).trim() !== ''));
  }

  const MONTHS = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  function checkDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? `${year}-${pad(month)}-${pad(day)}`
      : '';
  }

  function parseDate(value) {
    if (typeof value === 'number' && value > 20000 && value < 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 864e5);
      return date.toISOString().slice(0, 10);
    }

    const text = String(value ?? '').trim();
    let match;

    if ((match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
      return checkDate(+match[1], +match[2], +match[3]);
    }

    if ((match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
      return checkDate(match[3].length === 2 ? 2000 + +match[3] : +match[3], +match[2], +match[1]);
    }

    if ((match = text.match(/^\d{1,2}[\s-]+[A-Za-z]{3}[a-z]*[\s,-]+\d{2,4}/))) {
      const parts = text.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*[\s,-]+(\d{2,4})/);
      return checkDate(
        parts[3].length === 2 ? 2000 + +parts[3] : +parts[3],
        MONTHS[parts[2].toLowerCase()] || 0,
        +parts[1],
      );
    }

    return '';
  }

  function mapRows(input) {
    const normalize = (value) =>
      String(value ?? '')
        .toLowerCase()
        .replace(/[^a-z]/g, '');
    const headers = input[0].map(normalize);
    const find = (pattern) => headers.findIndex((value) => pattern.test(value));
    let indexes = {
      sourceRecordId: find(/^(sourceid|voucherid|recordid|externalid|transactionid)$/),
      date: find(/^date|voucherdate/),
      vendor: find(/vendor|paidto|payee|party|name/),
      vendorId: find(/^vendorid$/),
      vendorType: find(/^vendortype$/),
      amount: find(/amount|amt|rs|inr/),
      cat: find(/categor|head/),
      notes: find(/note|remark|desc|narration|particular/),
      cashImpact: find(/cashimpact|drawerimpact|cashmovement/),
      paymentMethod: find(/^paymentmethod$/),
      type: find(/^(type|vouchertype)$/),
      sourceStatus: find(/^status$/),
      sourceApprovalStatus: find(/^approvalstatus$/),
      sourceVoucherNo: find(/^(voucherno|receiptnumber)$/),
      sourceReceipts: find(/^receipts?$/),
    };
    let body = input.slice(1);
    sourceSystem = indexes.sourceRecordId >= 0 && headers[indexes.sourceRecordId] === 'voucherid'
      ? 'apps-script-vouchers'
      : 'manual-csv';

    if (indexes.date < 0 || indexes.vendor < 0 || indexes.amount < 0) {
      indexes = {
        sourceRecordId: -1,
        date: 0,
        vendor: 1,
        vendorId: -1,
        vendorType: -1,
        amount: 2,
        cat: 3,
        notes: 4,
        cashImpact: 5,
        paymentMethod: -1,
        type: -1,
        sourceStatus: -1,
        sourceApprovalStatus: -1,
        sourceVoucherNo: -1,
        sourceReceipts: -1,
      };
      body = input;
      sourceSystem = 'manual-csv';
    }

    return body.map((row) => ({
      sourceRecordId: indexes.sourceRecordId >= 0 ? row[indexes.sourceRecordId] : '',
      date: row[indexes.date],
      vendor: row[indexes.vendor],
      vendorId: indexes.vendorId >= 0 ? row[indexes.vendorId] : '',
      vendorType: indexes.vendorType >= 0 ? row[indexes.vendorType] : '',
      amount: row[indexes.amount],
      cat: indexes.cat >= 0 ? row[indexes.cat] : '',
      notes: indexes.notes >= 0 ? row[indexes.notes] : '',
      cashImpact: indexes.cashImpact >= 0 ? row[indexes.cashImpact] : '',
      paymentMethod: indexes.paymentMethod >= 0 ? row[indexes.paymentMethod] : '',
      type: indexes.type >= 0 ? row[indexes.type] : '',
      sourceStatus: indexes.sourceStatus >= 0 ? row[indexes.sourceStatus] : '',
      sourceApprovalStatus: indexes.sourceApprovalStatus >= 0 ? row[indexes.sourceApprovalStatus] : '',
      sourceVoucherNo: indexes.sourceVoucherNo >= 0 ? row[indexes.sourceVoucherNo] : '',
      sourceReceipts: indexes.sourceReceipts >= 0 ? row[indexes.sourceReceipts] : '',
    }));
  }

  function checkRows(raw, duplicateResultsByIndex = new Map()) {
    const seen = new Set();
    const seenSourceIds = new Set();
    const output = [];

    raw.forEach((row, index) => {
      const date = parseDate(row.date);
      const vendor = String(row.vendor ?? '').trim();
      const amount = parseAmt(row.amount);
      const categoryInput = String(row.cat ?? '').trim();
      const impactInput = String(row.cashImpact ?? '').trim().toUpperCase();
      const sourceRecordId = String(row.sourceRecordId ?? '').trim();
      const rawPaymentMethod = String(row.paymentMethod ?? '').trim().toUpperCase().replace(/[ -]+/g, '_');
      const paymentMethod = rawPaymentMethod === 'BANKTRANSFER' ? 'BANK_TRANSFER' : rawPaymentMethod;
      const rowType = String(row.type ?? '').trim().toUpperCase() || type;
      const errors = [];
      const warnings = [];

      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(sourceRecordId)) errors.push('missing or invalid SourceID');
      else if (seenSourceIds.has(sourceRecordId)) errors.push('duplicate SourceID in file');
      else seenSourceIds.add(sourceRecordId);
      if (!date) errors.push('bad date');
      else if (date > addDays(today(), 1)) errors.push('future date');
      if (!vendor) errors.push('no vendor');
      if (!(amount > 0) || amount > 1e7) errors.push('bad amount');
      if (!['PAYMENT', 'RECEIPT'].includes(rowType)) errors.push('bad transaction type');
      if (!['', 'CASH', 'UPI', 'BANK_TRANSFER'].includes(paymentMethod)) errors.push('bad payment method');

      const allowedCategories = rowType === 'RECEIPT' ? rcats() : categories();
      let category = allowedCategories.find(
        (item) => item.toLowerCase() === categoryInput.toLowerCase(),
      );
      if (categoryInput && !category) warnings.push('category → Other');
      category ||= 'Other';

      if (impactInput && !CASH_IMPACT_CHOICES.includes(impactInput)) errors.push('bad cash impact');
      const cashImpactSuggested = !impactInput;
      const cashImpact = cashImpactSuggested ? suggestCashImpact(rowType, category) : impactInput;
      const key = `${date}|${vendor.toLowerCase()}|${amount}`;
      const localDuplicate = !errors.length && seen.has(key);
      if (!errors.length) seen.add(key);

      const duplicateResult = duplicateResultsByIndex.get(index) || null;
      const serverDuplicate = Number.isSafeInteger(duplicateResult?.duplicateCount)
        ? duplicateResult.duplicateCount > 0
        : false;
      const duplicate = localDuplicate || serverDuplicate;
      const sourceIdForClient = sourceRecordId || uid();

      output.push({
        n: index + 1,
        sourceRecordId,
        cid: 'bulk-' + sourceIdForClient,
        sourceStatus: String(row.sourceStatus ?? '').trim(),
        sourceApprovalStatus: String(row.sourceApprovalStatus ?? '').trim(),
        sourceVoucherNo: String(row.sourceVoucherNo ?? '').trim(),
        sourceReceipts: String(row.sourceReceipts ?? '').trim(),
        sourceVendorType: String(row.vendorType ?? '').trim(),
        vendorId: String(row.vendorId ?? '').trim(),
        paymentMethod,
        type: rowType,
        date,
        vendor,
        amount,
        category,
        cashImpact,
        cashImpactSuggested,
        notes: String(row.notes ?? '').trim(),
        errs: errors,
        warns: warnings,
        dup: duplicate,
        localDup: localDuplicate,
        serverDup: serverDuplicate,
        duplicateConfirmed: false,
        duplicateConfirmationToken:
          typeof duplicateResult?.confirmationToken === 'string'
            ? duplicateResult.confirmationToken
            : '',
        skip: localDuplicate || serverDuplicate,
      });
    });

    return output;
  }

  function drawPreview() {
    const ready = rows.filter((row) => !row.errs.length && !row.skip && !row.cashImpactSuggested);
    const needImpact = rows.filter(
      (row) => !row.errs.length && !row.skip && row.cashImpactSuggested,
    );
    const bad = rows.filter((row) => row.errs.length);
    const duplicates = rows.filter((row) => row.dup);
    const singular = ready.length === 1;
    const importNoun =
      type === 'RECEIPT'
        ? singular
          ? 'cash receipt'
          : 'cash receipts'
        : singular
          ? 'payment'
          : 'payments';

    $('#bprev').innerHTML =
      `<div class="card bulk-review-panel"><h2>2. Review</h2><p class="bulk-review-summary" role="status" aria-live="polite"><b>${ready.length}</b> ready · <b>${needImpact.length}</b> need cash-impact selection · <span class="${bad.length ? 'up' : ''}"><b>${bad.length}</b> with errors (skipped)</span> · <b>${duplicates.length}</b> possible duplicates ${duplicates.length ? '<label class="bulk-duplicate-option"><input type="checkbox" id="bdup"> confirm server matches (same-file exact duplicates remain skipped)</label>' : ''}</p>
    <div class="table-wrap bulk-review-table" role="region" aria-label="Bulk import preview table" tabindex="0"><table><thead><tr><th>#</th><th>Date</th><th>Vendor</th><th class="r">Amount</th><th>Category</th><th>Cash impact (required)</th><th>Status</th></tr></thead><tbody>${rows
      .slice(0, 300)
      .map(
        (row) =>
          `<tr><td>${row.n}</td><td class="nw">${row.date ? esc(dmy(row.date)) : '–'}</td><td>${esc(row.vendor)}</td><td class="r nw">${row.amount > 0 ? money(row.amount) : '–'}</td><td>${esc(row.category)}</td><td class="nw"><select class="bci" data-row-index="${row.n - 1}" aria-label="Cash impact row ${row.n}"><option value=""${row.cashImpactSuggested ? ' selected' : ''} disabled>Choose…</option>${CASH_IMPACT_CHOICES.map((value) => `<option value="${value}"${!row.cashImpactSuggested && row.cashImpact === value ? ' selected' : ''}>${value}</option>`).join('')}</select><div class="muted">${row.cashImpactSuggested ? 'Suggestion: ' + esc(row.cashImpact) : 'Selected'}</div></td><td class="nw">${row.errs.length ? `<span class="badge bad">${esc(row.errs.join(', '))}</span>` : row.cashImpactSuggested ? '<span class="badge warn">choose cash impact</span>' : row.dup ? '<span class="badge warn">duplicate?</span>' : row.warns.length ? `<span class="badge warn">${esc(row.warns[0])}</span>` : '<span class="badge">OK</span>'}</td></tr>`,
      )
      .join('')}</tbody></table></div>
    ${rows.length > 300 ? `<p class="muted">Showing first 300 of ${rows.length} rows.</p>` : ''}<div class="actions"><button class="btn primary" data-act="import" ${ready.length && !needImpact.length ? '' : 'disabled'}>Import ${ready.length} ${importNoun}</button></div><p id="bprog" class="muted" role="status" aria-live="polite"></p></div>`;
  }

  function toggleDuplicates(checked) {
    rows.forEach((row) => {
      if (row.serverDup) {
        row.duplicateConfirmed = checked;
        row.skip = !checked;
      } else if (row.localDup) {
        row.skip = true;
      }
    });
    drawPreview();

    const duplicateCheckbox = $('#bdup');
    if (duplicateCheckbox) duplicateCheckbox.checked = checked;
  }

  async function parseInput() {
    const file = $('#bf').files[0];
    let inputRows;

    if (file && /\.xlsx?$/i.test(file.name)) {
      throw new Error(
        'Excel (.xls/.xlsx) import is temporarily disabled for security. Save the workbook as CSV/TSV or paste its rows instead.',
      );
    }

    inputRows = parseDelim(file ? await file.text() : $('#bt').value);

    if (!inputRows.length) {
      throw new Error('Nothing to read — choose a file or paste some rows.');
    }

    if (inputRows.length > 3001) {
      throw new Error('Too many rows. Please upload up to 3,000 at a time.');
    }

    type = $('#bt2').value;
    const mappedRows = mapRows(inputRows);
    const duplicateCandidates = [];
    mappedRows.forEach((row, index) => {
      const date = parseDate(row.date);
      const vendor = String(row.vendor ?? '').trim();
      const amount = parseAmt(row.amount);
      const sourceRecordId = String(row.sourceRecordId ?? '').trim();
      const rowType = String(row.type ?? '').trim().toUpperCase() || type;
      const category = String(row.cat ?? '').trim() || 'Other';
      const paymentMethod = String(row.paymentMethod ?? '').trim().toUpperCase().replace(/[ -]+/g, '_');
      const normalizedPaymentMethod = paymentMethod === 'BANKTRANSFER' ? 'BANK_TRANSFER' : paymentMethod;
      const requestedImpact = String(row.cashImpact ?? '').trim().toUpperCase();
      const cashImpact = requestedImpact || suggestCashImpact(rowType, category);
      if (
        /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(sourceRecordId) &&
        date &&
        vendor &&
        amount > 0 &&
        amount <= 1e7 &&
        ['PAYMENT', 'RECEIPT'].includes(rowType) &&
        CASH_IMPACT_CHOICES.includes(cashImpact) &&
        ['', 'CASH', 'UPI', 'BANK_TRANSFER'].includes(normalizedPaymentMethod)
      ) {
        duplicateCandidates.push({
          rowIndex: index,
          clientId: 'bulk-' + sourceRecordId,
          date,
          vendor,
          vendorId: String(row.vendorId ?? '').trim() || null,
          amount: amount.toFixed(2),
          type: rowType,
          cashImpact,
          paymentMethod: normalizedPaymentMethod,
          category,
          notes: String(row.notes ?? '').trim(),
        });
      }
    });

    const duplicateResultsByIndex = new Map();
    if (duplicateCandidates.length) {
      const duplicateResult = await api('checkPaymentDuplicates', {
        entries: duplicateCandidates.map(({ rowIndex, ...entry }) => entry),
      });
      if (!Array.isArray(duplicateResult?.results) || duplicateResult.results.length !== duplicateCandidates.length) {
        throw new Error('The server could not verify possible duplicates. Retry before importing.');
      }
      duplicateResult.results.forEach((result, candidateIndex) => {
        const rowIndex = duplicateCandidates[candidateIndex].rowIndex;
        if (
          !result ||
          result.index !== candidateIndex ||
          typeof result.confirmationToken !== 'string' ||
          !Number.isSafeInteger(result.duplicateCount)
        ) {
          throw new Error('The duplicate-review response was incomplete. Retry before importing.');
        }
        duplicateResultsByIndex.set(rowIndex, result);
      });
    }

    rows = checkRows(mappedRows, duplicateResultsByIndex);
    drawPreview();
  }

  function renderImportResult(summary) {
    const panel = document.createElement('div');
    panel.className = 'card ok-panel bulk-import-result';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');

    const title = document.createElement('h2');
    title.textContent =
      summary.pending || summary.quarantined || summary.unbalanced
        ? 'Import requires reconciliation'
        : 'Import batch reconciled';
    panel.appendChild(title);

    const counts = document.createElement('p');
    counts.textContent =
      summary.imported + ' imported · ' + summary.replayed + ' replayed · ' +
      summary.quarantined + ' quarantined · ' + summary.pending + ' pending';
    panel.appendChild(counts);

    const totals = document.createElement('p');
    totals.className = 'muted';
    totals.textContent =
      'Source total ₹' + (summary.sourceTotalPaise / 100).toFixed(2) +
      ' · imported ₹' + (summary.importedTotalPaise / 100).toFixed(2) +
      ' · quarantined ₹' + (summary.quarantinedTotalPaise / 100).toFixed(2) +
      ' · pending ₹' + (summary.pendingTotalPaise / 100).toFixed(2) +
      ' · variance ₹' + (summary.variancePaise / 100).toFixed(2);
    panel.appendChild(totals);

    const batch = document.createElement('p');
    batch.className = 'muted';
    batch.textContent =
      'Batch ID: ' + summary.batchIds.join(', ') +
      '. Re-submit the same file with the same SourceIDs to resume uncertain rows safely.';
    panel.appendChild(batch);

    if (summary.quarantinedRows.length || summary.pendingRows.length) {
      const heading = document.createElement('h3');
      heading.textContent = 'Rows requiring review';
      panel.appendChild(heading);
      const list = document.createElement('ul');
      summary.quarantinedRows.concat(summary.pendingRows).forEach((row) => {
        const item = document.createElement('li');
        item.textContent =
          'Row ' + row.rowNumber + ' · SourceID ' + row.sourceRecordId + ' · ' + row.status +
          (row.errorCode ? ' · ' + row.errorCode : '') +
          (row.errorMessage ? ' — ' + row.errorMessage : '');
        list.appendChild(item);
      });
      panel.appendChild(list);
    }

    if (summary.unbalanced) {
      const warning = document.createElement('p');
      warning.className = 'error';
      warning.textContent =
        'Financial reconciliation did not balance or a source amount could not be verified. Do not treat this import as complete.';
      panel.appendChild(warning);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    const openRegister = document.createElement('button');
    openRegister.type = 'button';
    openRegister.className = 'btn primary';
    openRegister.dataset.act = 'goreg';
    openRegister.textContent = 'Open register';
    const importMore = document.createElement('button');
    importMore.type = 'button';
    importMore.className = 'btn';
    importMore.dataset.act = 'bulkagain';
    importMore.textContent = 'Import more';
    actions.append(openRegister, importMore);
    panel.appendChild(actions);
    $('#bprev').replaceChildren(panel);
  }

  async function runImport(button) {
    const ready = rows.filter((row) => !row.errs.length && !row.skip);
    const unclassified = rows.some(
      (row) => !row.errs.length && !row.skip && !CASH_IMPACT_CHOICES.includes(row.cashImpact),
    );
    if (unclassified) {
      $('#bprog').textContent = 'Choose a cash impact for every valid row before importing.';
      return;
    }
    if (!ready.length) return;

    const summary = {
      imported: 0,
      replayed: 0,
      quarantined: 0,
      pending: 0,
      sourceTotalPaise: 0,
      importedTotalPaise: 0,
      quarantinedTotalPaise: 0,
      pendingTotalPaise: 0,
      variancePaise: 0,
      batchIds: [],
      quarantinedRows: [],
      pendingRows: [],
      unbalanced: false,
    };

    await busy(button, async () => {
      try {
        for (let index = 0; index < ready.length; index += 100) {
          const chunkRows = ready.slice(index, index + 100);
          const chunk = chunkRows.map((row) => ({
            sourceRecordId: row.sourceRecordId,
            clientId: row.cid,
            type: row.type,
            date: row.date,
            vendor: row.vendor,
            vendorId: row.vendorId || null,
            amount: row.amount.toFixed(2),
            category: row.category,
            notes: row.notes,
            cashImpact: row.cashImpact,
            paymentMethod: row.paymentMethod,
            duplicateConfirmationToken: row.duplicateConfirmed
              ? row.duplicateConfirmationToken
              : '',
            sourceStatus: row.sourceStatus,
            sourceApprovalStatus: row.sourceApprovalStatus,
            sourceVoucherNo: row.sourceVoucherNo,
            sourceReceipts: row.sourceReceipts,
          }));
          const data = await api('createVouchers', {
            bulk: true,
            sourceSystem,
            entries: chunk,
          });
          const reconciliation = data.reconciliation;
          summary.batchIds.push(data.batchId);
          summary.imported += reconciliation.importedCount;
          summary.replayed += reconciliation.replayedCount;
          summary.quarantined += reconciliation.quarantinedCount;
          summary.pending += reconciliation.pendingCount;
          summary.sourceTotalPaise += reconciliation.sourceTotalPaise;
          summary.importedTotalPaise += reconciliation.importedTotalPaise;
          summary.quarantinedTotalPaise += reconciliation.quarantinedTotalPaise;
          summary.pendingTotalPaise += reconciliation.pendingTotalPaise;
          summary.variancePaise += reconciliation.variancePaise;
          summary.unbalanced =
            summary.unbalanced ||
            reconciliation.balanced !== true ||
            reconciliation.unpricedCount > 0;

          data.created.forEach((created) => {
            if (!S.vouchers.find((voucher) => voucher.id === created.id)) {
              S.vouchers.push(created);
            }
          });
          data.rows.forEach((row) => {
            if (row.status === 'QUARANTINED') summary.quarantinedRows.push(row);
            if (row.status === 'PENDING') summary.pendingRows.push(row);
          });

          $('#bprog').textContent =
            'Processed ' + Math.min(index + chunkRows.length, ready.length) +
            ' of ' + ready.length + ' rows; reconciliation status: ' + data.status + '.';
        }

        await refresh(true);
        renderImportResult(summary);
      } catch (error) {
        fail(error);
        $('#bprog').textContent =
          'Import stopped before confirmation. Keep the same SourceIDs and retry the same file; completed rows will replay and unresolved rows will remain visible for reconciliation.';
        await refresh(true);
      }
    });
  }

  function bind() {
    $('#view').addEventListener('change', (event) => {
      if (event.target.matches('.bci')) {
        const index = Number(event.target.dataset.rowIndex);
        const row = rows[index];
        if (row) {
          row.cashImpact = event.target.value;
          row.cashImpactSuggested = !CASH_IMPACT_CHOICES.includes(row.cashImpact);
          drawPreview();
        }
        return;
      }
      if (event.target.id === 'bdup') {
        toggleDuplicates(event.target.checked);
      }
    });
  }

  function downloadTemplate() {
    download(
      'voucher-template.csv',
      'SourceID,Date,Vendor,VendorID,VendorType,Amount,Category,Notes,CashImpact,PaymentMethod\r\n' +
        'manual-row-0001,25/12/2026,Ram Traders,,,1500,Kitchen,Vegetables,CASH_OUT,CASH\r\n',
      'text/csv',
    );
  }

  return {
    bind,
    render,
    parseInput,
    runImport,
    toggleDuplicates,
    goRegister: () => go('reg'),
    renderAgain: render,
    downloadTemplate,
  };
}
