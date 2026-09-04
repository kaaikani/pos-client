"use client";
/**
 * Receipt / Payment voucher printing.
 *
 * Modelled on the legacy ERP's ReceiptHdr + ReceiptDet pair: the header carries
 * who paid, how much and by what mode; the detail carries WHICH bills the money
 * was applied to. A voucher that only prints a total is useless to the customer —
 * what they need to see is which of their bills this settled and what is still
 * open, which is exactly what the detail lines give.
 *
 * Sizes are the ones the business configuration selects between: 3in and 4in
 * thermal rolls, A5, A6 and A4. Everything is inlined into the print window, so
 * nothing here depends on the app's stylesheet being present.
 *
 * Amounts are RUPEES.
 */

export const VOUCHER_SIZES = [
    { id: '3in', label: '3 inch', width: '72mm', page: '80mm auto', base: 11, compact: true },
    { id: '4in', label: '4 inch', width: '96mm', page: '104mm auto', base: 11.5, compact: true },
    { id: 'A6', label: 'A6', width: '96mm', page: 'A6', base: 10.5, compact: true },
    { id: 'A5', label: 'A5', width: '138mm', page: 'A5', base: 11, compact: false },
    { id: 'A4', label: 'A4', width: '190mm', page: 'A4', base: 12, compact: false },
];

const SIZE_BY_ID = Object.fromEntries(VOUCHER_SIZES.map(s => [s.id, s]));

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const inr = (v) => Number(v || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const ymd = (d) => {
    const s = String(d || '');
    const iso = s.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return s;
    const [y, m, day] = iso.split('-');
    return `${day}-${m}-${y}`;
};

/* ── Amount in words — every printed voucher in India carries it ────────── */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function under100(n) {
    if (n < 20) return ONES[n];
    const t = Math.floor(n / 10), o = n % 10;
    return TENS[t] + (o ? ' ' + ONES[o] : '');
}

/** Indian grouping: crore, lakh, thousand, hundred. */
export function amountInWords(value) {
    const total = Math.round(Math.abs(Number(value) || 0) * 100);
    const rupees = Math.floor(total / 100);
    const paise = total % 100;
    if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

    const part = (n) => {
        const out = [];
        const cr = Math.floor(n / 10000000); n %= 10000000;
        const lk = Math.floor(n / 100000); n %= 100000;
        const th = Math.floor(n / 1000); n %= 1000;
        const hu = Math.floor(n / 100); n %= 100;
        if (cr) out.push(`${under100(cr)} Crore`);
        if (lk) out.push(`${under100(lk)} Lakh`);
        if (th) out.push(`${under100(th)} Thousand`);
        if (hu) out.push(`${ONES[hu]} Hundred`);
        if (n) out.push(under100(n));
        return out.join(' ');
    };

    const words = [];
    if (rupees) words.push(`${part(rupees)} Rupees`);
    if (paise) words.push(`${words.length ? 'and ' : ''}${part(paise)} Paise`);
    return `${words.join(' ')} Only`;
}

/**
 * Build the voucher HTML.
 *
 * @param v.kind        'RECEIPT' | 'PAYMENT'
 * @param v.company     { name, addressLines[], gstin, phone }
 * @param v.docNo       voucher number
 * @param v.docDate     yyyy-mm-dd
 * @param v.partyName   who paid / who was paid
 * @param v.mode        CASH | BANK | UPI | CHEQUE
 * @param v.refNo       cheque / UPI reference
 * @param v.narration   free text
 * @param v.lines       [{ invoiceNumber, invoiceDate, billAmount, openBefore, paidNow }]
 * @param v.total       amount received / paid
 * @param v.unapplied   held on account
 * @param v.partyBalanceAfter  what the party still owes after this voucher
 * @param sizeId        one of VOUCHER_SIZES
 */
export function voucherHtml(v, sizeId = 'A5') {
    const S = SIZE_BY_ID[sizeId] || SIZE_BY_ID.A5;
    const isReceipt = (v.kind || 'RECEIPT') === 'RECEIPT';
    const title = isReceipt ? 'RECEIPT' : 'PAYMENT VOUCHER';
    const partyLabel = isReceipt ? 'Received From' : 'Paid To';
    const totalLabel = isReceipt ? 'Amount Received' : 'Amount Paid';
    const lines = Array.isArray(v.lines) ? v.lines : [];
    const co = v.company || {};

    const rows = lines.map(l => `
        <tr>
          <td class="l">${esc(l.invoiceNumber)}</td>
          <td class="l">${esc(ymd(l.invoiceDate))}</td>
          ${S.compact ? '' : `<td class="r">${inr(l.billAmount)}</td>`}
          <td class="r">${inr(l.openBefore)}</td>
          <td class="r b">${inr(l.paidNow)}</td>
          <td class="r">${inr(Number(l.openBefore || 0) - Number(l.paidNow || 0))}</td>
        </tr>`).join('');

    const head = S.compact
        ? '<th class="l">Bill</th><th class="l">Date</th><th class="r">Due</th><th class="r">Paid</th><th class="r">Bal</th>'
        : '<th class="l">Bill No</th><th class="l">Bill Date</th><th class="r">Bill Amt</th>'
          + '<th class="r">Outstanding</th><th class="r">Paid Now</th><th class="r">Balance</th>';

    const cols = S.compact ? 5 : 6;

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title} ${esc(v.docNo)}</title>
<style>
  @page { size: ${S.page}; margin: ${S.compact ? '4mm' : '10mm'}; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; width: ${S.width};
    font-family: ${S.compact ? '"Courier New", monospace' : 'Arial, Helvetica, sans-serif'};
    font-size: ${S.base}px; color: #000; background: #fff; line-height: 1.35;
  }
  .co { text-align: center; }
  .co h1 { margin: 0; font-size: ${S.base + (S.compact ? 3 : 6)}px; letter-spacing: .02em; }
  .co div { font-size: ${S.base - 1}px; }
  .title {
    text-align: center; font-weight: bold; letter-spacing: .18em;
    font-size: ${S.base + 1}px; margin: 6px 0;
    border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0;
  }
  .meta { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
  .meta td { padding: 1px 0; vertical-align: top; font-size: ${S.base}px; }
  .meta .k { color: #333; width: ${S.compact ? '38%' : '18%'}; }
  .meta .v { font-weight: bold; }
  table.g { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.g th, table.g td { padding: ${S.compact ? '2px 2px' : '4px 6px'}; font-size: ${S.base - 0.5}px; }
  table.g th { border-top: 1px solid #000; border-bottom: 1px solid #000; text-align: left; }
  table.g td { border-bottom: 1px dotted #999; }
  table.g .r { text-align: right; white-space: nowrap; }
  table.g .l { text-align: left; }
  table.g .l { word-break: break-word; }

  table.g .b { font-weight: bold; }
  tfoot td { border-top: 1px solid #000 !important; border-bottom: none !important; font-weight: bold; }
  .words { margin-top: 6px; font-size: ${S.base - 0.5}px; font-style: italic; }
  .sum { margin-top: 6px; width: 100%; border-collapse: collapse; }
  .sum td { padding: 2px 0; font-size: ${S.base}px; }
  .sum .r { text-align: right; font-weight: bold; white-space: nowrap; }
  .sum .big { font-size: ${S.base + 3}px; }
  .due { border-top: 1px solid #000; }
  .note { margin-top: 6px; font-size: ${S.base - 1}px; }
  .sign { margin-top: ${S.compact ? '14px' : '26px'}; display: flex; justify-content: space-between; font-size: ${S.base - 1}px; }
  .sign span { border-top: 1px solid #000; padding-top: 2px; min-width: 40%; text-align: center; }
  .thanks { text-align: center; margin-top: 8px; font-size: ${S.base - 1}px; }
</style></head>
<body>
  <div class="co">
    <h1>${esc(co.name || 'AVS ECOM PRIVATE LIMITED')}</h1>
    ${(co.addressLines || []).map(a => `<div>${esc(a)}</div>`).join('')}
    ${co.gstin ? `<div>GSTIN: ${esc(co.gstin)}</div>` : ''}
    ${co.phone ? `<div>Ph: ${esc(co.phone)}</div>` : ''}
  </div>

  <div class="title">${title}</div>

  <table class="meta">
    ${S.compact
        // A 72mm roll cannot hold four columns: the number and the date each
        // wrapped onto three lines. One label/value pair per row instead.
        ? `<tr><td class="k">No.</td><td class="v">${esc(v.docNo)}</td></tr>
           <tr><td class="k">Date</td><td class="v">${esc(ymd(v.docDate))}</td></tr>`
        : `<tr><td class="k">No.</td><td class="v">${esc(v.docNo)}</td>
               <td class="k">Date</td><td class="v">${esc(ymd(v.docDate))}</td></tr>`}
    <tr><td class="k">${partyLabel}</td><td class="v" colspan="${S.compact ? 1 : 3}">${esc(v.partyName)}</td></tr>
    <tr><td class="k">Mode</td><td class="v" colspan="${S.compact ? 1 : 3}">${esc(v.mode || 'CASH')}${v.refNo ? ` — ${esc(v.refNo)}` : ''}</td></tr>
  </table>

  ${lines.length ? `
  <table class="g">
    <thead><tr>${head}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="${cols - 2}" class="l">Total</td>
        <td class="r">${inr(lines.reduce((a, l) => a + Number(l.paidNow || 0), 0))}</td>
        <td class="r">${inr(lines.reduce((a, l) => a + (Number(l.openBefore || 0) - Number(l.paidNow || 0)), 0))}</td>
      </tr>
    </tfoot>
  </table>` : '<div class="note">On account — not applied to any specific bill.</div>'}

  <table class="sum">
    <tr><td>${totalLabel}</td><td class="r big">${inr(v.total)}</td></tr>
    ${Number(v.unapplied) > 0
        ? `<tr><td>Held on account</td><td class="r">${inr(v.unapplied)}</td></tr>` : ''}
    ${v.partyBalanceAfter != null
        ? `<tr class="due"><td>Balance still due</td><td class="r">${inr(v.partyBalanceAfter)}</td></tr>` : ''}
  </table>

  <div class="words">${esc(amountInWords(v.total))}</div>
  ${v.narration ? `<div class="note">Note: ${esc(v.narration)}</div>` : ''}

  <div class="sign"><span>Customer</span><span>For ${esc(co.name || 'AVS ECOM')}</span></div>
  <div class="thanks">Thank you</div>
</body></html>`;
}

/**
 * Open the voucher in a print window.
 *
 * Written into an off-screen iframe rather than window.open: a popup blocker
 * silently swallows window.open and the operator sees nothing happen at all,
 * with no way to tell whether the voucher printed.
 */
export function printVoucher(voucher, sizeId = 'A5') {
    if (typeof window === 'undefined') return;
    const html = voucherHtml(voucher, sizeId);

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);

    const cleanup = () => { try { document.body.removeChild(frame); } catch { /* already gone */ } };

    frame.onload = () => {
        try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        } finally {
            // Give the print dialog time to take the document before removing it.
            setTimeout(cleanup, 60_000);
        }
    };

    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
}
