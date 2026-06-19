import { amountInWords } from './invoice-data.js';

/**
 * Tax-invoice PDF builder (pdfmake). Two layouts share one invoice model:
 *   - A4  : full GST tax invoice (per-line HSN + CGST/SGST or IGST grid)
 *   - Thermal (76/104/152mm): compact receipt with a correct tax SUMMARY
 *
 * Render-only: every value comes from the backend sale model — no tax is
 * recomputed here. Seller identity always comes from the active PosCompany.
 */

let _pdfMakePromise = null;
async function getPdfMake() {
    if (!_pdfMakePromise) {
        _pdfMakePromise = (async () => {
            const pdfMakeMod = await import('pdfmake/build/pdfmake');
            const pdfFontsMod = await import('pdfmake/build/vfs_fonts');
            const pdfMake = pdfMakeMod.default || pdfMakeMod;
            const vfs = pdfFontsMod.vfs || pdfFontsMod.default?.vfs || pdfFontsMod.pdfMake?.vfs || pdfFontsMod.default?.pdfMake?.vfs;
            if (vfs) pdfMake.vfs = vfs;
            return pdfMake;
        })();
    }
    return _pdfMakePromise;
}

const MM = 2.83465; // mm → pt
const money = (v) => '₹' + (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numf = (v) => (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

/** Map a BILL_SIZES key to a layout + page geometry. */
export function layoutFor(sizeMode) {
    if (sizeMode === '3inch') return { kind: 'thermal', widthMm: 76 };
    if (sizeMode === '4inch') return { kind: 'thermal', widthMm: 104 };
    if (sizeMode === '6inch') return { kind: 'thermal', widthMm: 152 };
    return { kind: 'a4', pageSize: sizeMode === 'A5' ? 'A5' : sizeMode === 'A6' ? 'A6' : 'A4' };
}

const docTitle = (inv) => (inv.isTaxInvoice ? 'TAX INVOICE' : 'BILL OF SUPPLY');

// ───────────────────────── A4 layout ─────────────────────────

function buildA4Doc(inv, pageSize) {
    const { seller, buyer, meta, items, interState, hasCess, totals } = inv;

    const headers = interState
        ? ['#', 'Item', 'HSN/SAC', 'Qty', 'Rate', 'Taxable', 'GST%', 'IGST', ...(hasCess ? ['Cess'] : []), 'Amount']
        : ['#', 'Item', 'HSN/SAC', 'Qty', 'Rate', 'Taxable', 'GST%', 'CGST', 'SGST', ...(hasCess ? ['Cess'] : []), 'Amount'];

    const headerRow = headers.map((h, i) => ({ text: h, style: 'th', alignment: i <= 1 ? 'left' : 'right' }));

    const bodyRows = items.map((it) => {
        const base = [
            { text: it.sno, style: 'td', alignment: 'left' },
            { text: it.name, style: 'td', alignment: 'left' },
            { text: it.hsnCode || '—', style: 'td', alignment: 'right' },
            { text: numf(it.qty) + (it.unit ? ' ' + it.unit : ''), style: 'td', alignment: 'right' },
            { text: money(it.rate), style: 'td', alignment: 'right' },
            { text: money(it.taxable), style: 'td', alignment: 'right' },
            { text: numf(it.gstPercent) + '%', style: 'td', alignment: 'right' },
        ];
        const tax = interState
            ? [{ text: money(it.igst), style: 'td', alignment: 'right' }]
            : [
                  { text: money(it.cgst), style: 'td', alignment: 'right' },
                  { text: money(it.sgst), style: 'td', alignment: 'right' },
              ];
        const cess = hasCess ? [{ text: money(it.cess), style: 'td', alignment: 'right' }] : [];
        const amt = [{ text: money(it.lineTotal), style: 'td', alignment: 'right' }];
        return [...base, ...tax, ...cess, ...amt];
    });

    if (bodyRows.length === 0) {
        bodyRows.push([{ text: 'No items', colSpan: headers.length, alignment: 'center', style: 'td' }, ...Array(headers.length - 1).fill({})]);
    }

    const taxSummaryLines = [
        { label: 'Taxable Value', value: money(totals.taxableTotal) },
        ...(interState
            ? [{ label: 'IGST', value: money(totals.igstTotal) }]
            : [
                  { label: 'CGST', value: money(totals.cgstTotal) },
                  { label: 'SGST', value: money(totals.sgstTotal) },
              ]),
        ...(hasCess ? [{ label: 'Cess', value: money(totals.cessTotal) }] : []),
        ...(totals.discount > 0 ? [{ label: 'Discount', value: '-' + money(totals.discount) }] : []),
        ...(totals.transport > 0 ? [{ label: 'Transport', value: money(totals.transport) }] : []),
        { label: 'Round Off', value: (totals.roundOff < 0 ? '-' : '') + money(Math.abs(totals.roundOff)) },
    ];

    return {
        pageSize,
        pageMargins: [28, 28, 28, 36],
        content: [
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: seller?.name || 'No active company', style: 'sellerName' },
                            seller?.address ? { text: seller.address, style: 'meta' } : null,
                            seller?.phone ? { text: 'Ph: ' + seller.phone, style: 'meta' } : null,
                            seller?.gstin ? { text: 'GSTIN: ' + seller.gstin, style: 'metaBold' } : null,
                            seller?.stateName ? { text: `State: ${seller.stateCode || ''}-${seller.stateName}`, style: 'meta' } : null,
                        ].filter(Boolean),
                    },
                    {
                        width: 'auto',
                        stack: [
                            { text: docTitle(inv), style: 'docTitle', alignment: 'right' },
                            { text: `Invoice No: ${meta.billNo}`, style: 'meta', alignment: 'right' },
                            { text: `Date: ${meta.billDate}  ${meta.billTime}`, style: 'meta', alignment: 'right' },
                            { text: `Type: ${meta.invoiceType}`, style: 'meta', alignment: 'right' },
                            { text: `Reverse Charge: ${meta.reverseCharge ? 'Yes' : 'No'}`, style: meta.reverseCharge ? 'metaBold' : 'meta', alignment: 'right' },
                        ],
                    },
                ],
            },
            { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 539, y2: 6, lineWidth: 1, lineColor: '#94a3b8' }], margin: [0, 2, 0, 6] },
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: 'BILL TO', style: 'sectionLabel' },
                            { text: buyer.name, style: 'metaBold' },
                            buyer.address ? { text: buyer.address, style: 'meta' } : null,
                            buyer.phone ? { text: 'Ph: ' + buyer.phone, style: 'meta' } : null,
                            buyer.gstin ? { text: 'GSTIN: ' + buyer.gstin, style: 'metaBold' } : null,
                            buyer.placeOfSupply ? { text: 'Place of Supply: ' + buyer.placeOfSupply, style: 'meta' } : null,
                        ].filter(Boolean),
                    },
                ],
                margin: [0, 0, 0, 8],
            },
            {
                table: { headerRows: 1, widths: headers.map((h) => (h === 'Item' ? '*' : 'auto')), body: [headerRow, ...bodyRows] },
                layout: {
                    fillColor: (ri) => (ri === 0 ? '#f1f5f9' : ri % 2 === 0 ? '#fafafa' : null),
                    hLineColor: '#e2e8f0', vLineColor: '#e2e8f0', hLineWidth: () => 0.5, vLineWidth: () => 0.5,
                },
            },
            {
                columns: [
                    { width: '*', stack: [{ text: 'Amount in words:', style: 'sectionLabel', margin: [0, 8, 0, 1] }, { text: amountInWords(totals.grandTotal), style: 'words' }] },
                    {
                        width: 'auto',
                        margin: [0, 8, 0, 0],
                        table: {
                            widths: ['*', 'auto'],
                            body: [
                                ...taxSummaryLines.map((l) => [{ text: l.label, style: 'sumK' }, { text: l.value, style: 'sumV', alignment: 'right' }]),
                                [{ text: 'GRAND TOTAL', style: 'grandK' }, { text: money(totals.grandTotal), style: 'grandV', alignment: 'right' }],
                            ],
                        },
                        layout: 'noBorders',
                    },
                ],
            },
            {
                margin: [0, 10, 0, 0],
                columns: [
                    { width: '*', text: `Payment: ${meta.saleType}   Received: ${money(totals.received)}   ${totals.balanceDue > 0 ? 'Balance Due: ' + money(totals.balanceDue) : ''}`, style: 'meta' },
                    { width: 'auto', stack: [{ text: `For ${seller?.name || ''}`, style: 'meta', alignment: 'right' }, { text: 'Authorised Signatory', style: 'meta', alignment: 'right', margin: [0, 18, 0, 0] }] },
                ],
            },
            { text: 'Thank you! Goods once sold are subject to terms of sale.', style: 'foot', alignment: 'center', margin: [0, 12, 0, 0] },
        ].filter(Boolean),
        styles: a4Styles(),
        defaultStyle: { fontSize: 8 },
    };
}

function a4Styles() {
    return {
        sellerName: { fontSize: 15, bold: true, color: '#0f172a' },
        docTitle: { fontSize: 15, bold: true, color: '#0f172a' },
        sectionLabel: { fontSize: 7, bold: true, color: '#64748b' },
        meta: { fontSize: 8, color: '#475569' },
        metaBold: { fontSize: 8, bold: true, color: '#0f172a' },
        th: { fontSize: 7.5, bold: true, color: '#334155' },
        td: { fontSize: 7.5, color: '#1e293b' },
        sumK: { fontSize: 8, color: '#475569' },
        sumV: { fontSize: 8, bold: true, color: '#0f172a' },
        grandK: { fontSize: 10, bold: true, color: '#0f172a', margin: [0, 3, 0, 0] },
        grandV: { fontSize: 11, bold: true, color: '#0f172a', margin: [0, 3, 0, 0] },
        words: { fontSize: 8, italics: true, color: '#334155' },
        foot: { fontSize: 7, color: '#94a3b8' },
    };
}

// ───────────────────────── Thermal layout ─────────────────────────

function buildThermalDoc(inv, widthMm) {
    const { seller, buyer, meta, items, interState, hasCess, totals } = inv;
    const width = widthMm * MM;
    const pad = 6;

    const itemBlocks = items.flatMap((it) => [
        { text: it.name, style: 'tName' },
        {
            columns: [
                { width: '*', text: `${numf(it.qty)}${it.unit ? ' ' + it.unit : ''} x ${money(it.rate)}${it.hsnCode ? '  HSN:' + it.hsnCode : ''}`, style: 'tSmall' },
                { width: 'auto', text: money(it.lineTotal), style: 'tAmt', alignment: 'right' },
            ],
        },
    ]);

    const taxRows = [
        ['Taxable', money(totals.taxableTotal)],
        ...(interState ? [['IGST', money(totals.igstTotal)]] : [['CGST', money(totals.cgstTotal)], ['SGST', money(totals.sgstTotal)]]),
        ...(hasCess ? [['Cess', money(totals.cessTotal)]] : []),
        ...(totals.discount > 0 ? [['Discount', '-' + money(totals.discount)]] : []),
        ...(totals.transport > 0 ? [['Transport', money(totals.transport)]] : []),
        ['Round Off', (totals.roundOff < 0 ? '-' : '') + money(Math.abs(totals.roundOff))],
    ];

    const dashed = { canvas: [{ type: 'line', x1: 0, y1: 2, x2: width - pad * 2, y2: 2, lineWidth: 0.7, dash: { length: 2 }, lineColor: '#475569' }], margin: [0, 2, 0, 2] };

    return {
        pageSize: { width, height: 'auto' },
        pageMargins: [pad, pad, pad, pad],
        content: [
            { text: seller?.name || 'No active company', style: 'tTitle', alignment: 'center' },
            seller?.address ? { text: seller.address, style: 'tSmall', alignment: 'center' } : null,
            seller?.phone ? { text: 'Ph: ' + seller.phone, style: 'tSmall', alignment: 'center' } : null,
            seller?.gstin ? { text: 'GSTIN: ' + seller.gstin, style: 'tSmallB', alignment: 'center' } : null,
            seller?.stateName ? { text: `State: ${seller.stateCode || ''}-${seller.stateName}`, style: 'tSmall', alignment: 'center' } : null,
            { text: docTitle(inv), style: 'tDocTitle', alignment: 'center', margin: [0, 3, 0, 0] },
            dashed,
            { columns: [{ width: '*', text: `Bill: ${meta.billNo}`, style: 'tSmall' }, { width: 'auto', text: `${meta.billDate} ${meta.billTime}`, style: 'tSmall', alignment: 'right' }] },
            { text: `Customer: ${buyer.name}${buyer.phone ? ' (' + buyer.phone + ')' : ''}`, style: 'tSmall' },
            buyer.gstin ? { text: `GSTIN: ${buyer.gstin}`, style: 'tSmall' } : null,
            buyer.placeOfSupply ? { text: `Place of Supply: ${buyer.placeOfSupply}`, style: 'tSmall' } : null,
            meta.reverseCharge ? { text: 'Reverse Charge: Yes', style: 'tSmallB' } : null,
            dashed,
            ...itemBlocks,
            dashed,
            ...taxRows.map(([k, v]) => ({ columns: [{ width: '*', text: k, style: 'tSmall' }, { width: 'auto', text: v, style: 'tSmall', alignment: 'right' }] })),
            { columns: [{ width: '*', text: 'GRAND TOTAL', style: 'tGrand' }, { width: 'auto', text: money(totals.grandTotal), style: 'tGrand', alignment: 'right' }], margin: [0, 2, 0, 0] },
            { columns: [{ width: '*', text: `Paid (${meta.saleType})`, style: 'tSmall' }, { width: 'auto', text: money(totals.received), style: 'tSmall', alignment: 'right' }] },
            totals.balanceDue > 0 ? { columns: [{ width: '*', text: 'Balance Due', style: 'tSmallB' }, { width: 'auto', text: money(totals.balanceDue), style: 'tSmallB', alignment: 'right' }] } : null,
            dashed,
            { text: amountInWords(totals.grandTotal), style: 'tSmall', alignment: 'center', margin: [0, 2, 0, 2] },
            { text: 'Thank you! Visit again.', style: 'tFoot', alignment: 'center', margin: [0, 3, 0, 0] },
        ].filter(Boolean),
        styles: {
            tTitle: { fontSize: 11, bold: true },
            tDocTitle: { fontSize: 9, bold: true },
            tName: { fontSize: 8, bold: true, margin: [0, 1, 0, 0] },
            tSmall: { fontSize: 7 },
            tSmallB: { fontSize: 7, bold: true },
            tAmt: { fontSize: 8, bold: true },
            tGrand: { fontSize: 10, bold: true },
            tFoot: { fontSize: 6.5, color: '#475569' },
        },
        defaultStyle: { fontSize: 7 },
    };
}

export function buildInvoiceDoc(inv, sizeMode) {
    const layout = layoutFor(sizeMode);
    return layout.kind === 'thermal' ? buildThermalDoc(inv, layout.widthMm) : buildA4Doc(inv, layout.pageSize);
}

async function createInvoicePdf(inv, sizeMode) {
    const pdfMake = await getPdfMake();
    return { instance: pdfMake.createPdf(buildInvoiceDoc(inv, sizeMode)), name: `invoice-${inv.meta.billNo || 'bill'}.pdf` };
}

export async function openInvoicePdf(inv, sizeMode) {
    const { instance } = await createInvoicePdf(inv, sizeMode);
    instance.open();
}
export async function saveInvoicePdf(inv, sizeMode) {
    const { instance, name } = await createInvoicePdf(inv, sizeMode);
    instance.download(name);
}
export async function printInvoicePdf(inv, sizeMode) {
    const { instance } = await createInvoicePdf(inv, sizeMode);
    instance.print();
}
