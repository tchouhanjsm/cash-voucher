import { $ } from '../core/dom.js';
import { isIn, S, vno } from '../core/state.js';
import { dmy, esc, money } from '../core/utils.js';

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const b100 = (number) =>
  number < 20
    ? ONES[number]
    : TENS[Math.floor(number / 10)] + (number % 10 ? ' ' + ONES[number % 10] : '');

const b1000 = (number) =>
  (number >= 100 ? ONES[Math.floor(number / 100)] + ' Hundred' + (number % 100 ? ' ' : '') : '') +
  (number % 100 ? b100(number % 100) : '');

function words(number) {
  if (number === 0) return 'Zero';

  const output = [];

  for (const [divisor, name] of [
    [1e7, 'Crore'],
    [1e5, 'Lakh'],
    [1e3, 'Thousand'],
  ]) {
    const quotient = Math.floor(number / divisor);

    if (quotient) {
      output.push(words(quotient) + ' ' + name);
      number %= divisor;
    }
  }

  if (number) output.push(b1000(number));

  return output.join(' ');
}

export const amountInWords = (amount) => {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  return words(rupees) + ' Rupees' + (paise ? ' and ' + words(paise) + ' Paise' : '') + ' Only';
};

export function printVoucher(id) {
  const voucher = S.vouchers.find((item) => item.id === id);

  if (!voucher) return;

  $('#printArea').innerHTML =
    `<div class="pv"><div class="pv-head"><div class="pv-hotel">${esc(S.settings.propertyName)}</div><div class="pv-addr">${esc(S.settings.propertyAddress)}</div><div class="pv-title">${isIn(voucher) ? 'CASH RECEIPT VOUCHER' : 'CASH PAYMENT VOUCHER'}</div></div>
  <div class="pv-meta"><div>Voucher No: <b>${vno(voucher)}</b></div><div>Date: <b>${dmy(voucher.date)}</b></div></div>
  <div class="pv-row"><div class="l">${isIn(voucher) ? 'Received From' : 'Paid To'}</div><div class="v">${esc(voucher.vendor)}</div></div>
  ${voucher.category ? `<div class="pv-row"><div class="l">Category</div><div class="v">${esc(voucher.category)}${voucher.notes ? ' — ' + esc(voucher.notes) : ''}</div></div>` : ''}
  <div class="pv-row"><div class="l">Amount ${isIn(voucher) ? 'Received' : 'Paid'}</div><div class="v pv-amt">${money(voucher.amount)}</div></div>
  <div class="pv-words"><b>Amount in Words</b><br><br>${esc(amountInWords(voucher.amount))}</div>${voucher.status !== 'ACTIVE' ? '<div class="pv-cx">*** CANCELLED ***</div>' : ''}
  <div class="pv-sign">${isIn(voucher) ? '<div>Prepared By</div><div>Received By</div><div>Payer Signature</div>' : '<div>Prepared By</div><div>Paid By</div><div>Receiver Signature</div>'}</div></div>`;

  setTimeout(() => window.print(), 50);
}
