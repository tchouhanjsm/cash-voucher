import { $ } from '../core/dom.js';
import {
  CASH_IMPACT_CHOICES,
  categories,
  isIn,
  rcats,
  S,
  suggestCashImpact,
} from '../core/state.js';
import { addDays, dmy, download, esc, money, pad, parseAmt, today, uid } from '../core/utils.js';
import { busy, fail, head } from '../core/ui.js';

export function createBulk({ api, refresh, go }) {
  let rows = [];
  let type = 'PAYMENT';

  function render() {
    rows = [];

    $('#view').innerHTML =
      head('Bulk Upload', '', {
        section: 'Manage',
        description: 'Review row data and cash-impact classifications before importing a batch.',
      }) +
      `<div class="card bulk-import-panel"><h2>1. Get your data in</h2>
    <p class="muted">Columns: <b>Date, Vendor, Amount</b>, optional <b>Category, Notes, CashImpact</b>. CashImpact values: CASH_IN, CASH_OUT, NO_CASH. If omitted, the preview shows a suggestion only and requires your explicit selection before import. Verify each choice against physical drawer movement. Dates like 25/12/2026 or 2026-12-25. Import CSV/TSV files or paste spreadsheet rows. Excel (.xls/.xlsx) is temporarily disabled for security; save as CSV/TSV or paste the rows instead.</p>
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
      date: find(/^date|voucherdate/),
      vendor: find(/vendor|paidto|payee|party|name/),
      amount: find(/amount|amt|rs|inr/),
      cat: find(/categor|head|type/),
      notes: find(/note|remark|desc|narration|particular/),
      cashImpact: find(/cashimpact|drawerimpact|cashmovement/),
    };
    let body = input.slice(1);

    if (indexes.date < 0 || indexes.vendor < 0 || indexes.amount < 0) {
      indexes = { date: 0, vendor: 1, amount: 2, cat: 3, notes: 4, cashImpact: 5 };
      body = input;
    }

    return body.map((row) => ({
      date: row[indexes.date],
      vendor: row[indexes.vendor],
      amount: row[indexes.amount],
      cat: indexes.cat >= 0 ? row[indexes.cat] : '',
      notes: indexes.notes >= 0 ? row[indexes.notes] : '',
      cashImpact: indexes.cashImpact >= 0 ? row[indexes.cashImpact] : '',
    }));
  }

  function checkRows(raw) {
    const seen = new Set(
      S.vouchers
        .filter((voucher) => voucher.status === 'ACTIVE' && isIn(voucher) === (type === 'RECEIPT'))
        .map((voucher) => `${voucher.date}|${voucher.vendor.toLowerCase()}|${voucher.amount}`),
    );
    const allowedCategories = type === 'RECEIPT' ? rcats() : categories();
    const output = [];

    raw.forEach((row, index) => {
      const date = parseDate(row.date);
      const vendor = String(row.vendor ?? '').trim();
      const amount = parseAmt(row.amount);
      const categoryInput = String(row.cat ?? '').trim();
      const impactInput = String(row.cashImpact ?? '')
        .trim()
        .toUpperCase();
      const errors = [];
      const warnings = [];

      if (!date) errors.push('bad date');
      else if (date > addDays(today(), 1)) errors.push('future date');
      if (!vendor) errors.push('no vendor');
      if (!(amount > 0) || amount > 1e7) errors.push('bad amount');

      let category = allowedCategories.find(
        (item) => item.toLowerCase() === categoryInput.toLowerCase(),
      );

      if (categoryInput && !category) warnings.push('category → Other');

      category ||= 'Other';

      if (impactInput && !CASH_IMPACT_CHOICES.includes(impactInput)) errors.push('bad cash impact');
      const cashImpactSuggested = !impactInput;
      const cashImpact = cashImpactSuggested ? suggestCashImpact(type, category) : impactInput;

      const key = `${date}|${vendor.toLowerCase()}|${amount}`;
      const duplicate = !errors.length && seen.has(key);

      if (!errors.length) seen.add(key);

      output.push({
        n: index + 1,
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
        skip: duplicate,
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
      `<div class="card bulk-review-panel"><h2>2. Review</h2><p class="bulk-review-summary" role="status" aria-live="polite"><b>${ready.length}</b> ready · <b>${needImpact.length}</b> need cash-impact selection · <span class="${bad.length ? 'up' : ''}"><b>${bad.length}</b> with errors (skipped)</span> · <b>${duplicates.length}</b> possible duplicates ${duplicates.length ? '<label class="bulk-duplicate-option"><input type="checkbox" id="bdup"> import duplicates too</label>' : ''}</p>
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
      if (row.dup) row.skip = !checked;
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
    rows = checkRows(mapRows(inputRows));
    drawPreview();
  }

  function renderImportResult(done, pendingApprovalIds, skipped) {
    const panel = document.createElement('div');
    panel.className = 'card ok-panel';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');

    const title = document.createElement('h2');
    title.textContent =
      '✔ Imported ' + done + ' ' + (type === 'RECEIPT' ? 'cash receipts' : 'payments');
    panel.appendChild(title);

    if (pendingApprovalIds.size) {
      const pending = document.createElement('p');
      pending.setAttribute('role', 'status');
      pending.textContent =
        pendingApprovalIds.size +
        ' payment(s) need owner/manager approval. They are excluded from approved totals and Daily Cash Close until approved by someone other than the creator.';
      panel.appendChild(pending);
    }

    if (skipped) {
      const skippedMessage = document.createElement('p');
      skippedMessage.className = 'muted';
      skippedMessage.textContent = skipped + ' already existed and were skipped.';
      panel.appendChild(skippedMessage);
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

    let done = 0;
    let skipped = 0;
    const pendingApprovalIds = new Set();

    await busy(button, async () => {
      try {
        for (let index = 0; index < ready.length; index += 100) {
          const chunk = ready.slice(index, index + 100).map((row) => ({
            clientId: (row.cid ||= uid()),
            type,
            date: row.date,
            vendor: row.vendor,
            amount: row.amount,
            category: row.category,
            cashImpact: row.cashImpact,
            notes: row.notes,
          }));
          const data = await api('createVouchers', {
            bulk: true,
            entries: chunk,
          });

          done += data.created.length - data.skipped;
          skipped += data.skipped;

          data.created.forEach((created) => {
            if (created.approvalStatus === 'PENDING' && typeof created.id === 'string') {
              pendingApprovalIds.add(created.id);
            }
            if (!S.vouchers.find((voucher) => voucher.id === created.id)) {
              S.vouchers.push(created);
            }
          });

          $('#bprog').textContent =
            `Imported ${Math.min(index + 100, ready.length)} of ${ready.length}…`;
        }

        renderImportResult(done, pendingApprovalIds, skipped);
      } catch (error) {
        fail(error);
        $('#bprog').textContent =
          `Stopped after ${done} rows. Fix the problem and run "Check data" again — already imported rows will be skipped as duplicates.`;
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
      'Date,Vendor,Amount,Category,Notes,CashImpact\r\n' +
        '25/12/2026,Ram Traders,1500,Kitchen,Vegetables,CASH_OUT\r\n',
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
