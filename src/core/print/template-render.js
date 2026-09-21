/**
 * Draws a document from a print template.
 *
 * One renderer for both modes, because both read the same field sources — the
 * only difference is whether the elements are positioned or stacked:
 *
 *   FLOW   3 inch and 4 inch rolls. Blocks print one after another. A roll has
 *          no bottom edge, so nothing is positioned against one.
 *   FIXED  A6 / A5 / A4. Every element sits at a millimetre position, and the
 *          item table lives in a declared region that it may not grow past.
 *
 * The template decides what appears and where. This file decides nothing about
 * layout — it only knows how to resolve a field and how to put marks on paper.
 * That separation is the whole point: adding a field to a bill must never mean
 * editing code again.
 */

const MM = 2.8346456693;             // millimetres → PDF points

const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
const money = (v) => n(v).toFixed(2);

/**
 * Builds the value bag a template reads from.
 *
 * Deliberately flat and named after what an operator would call things, so the
 * designer's field list and this object cannot drift apart.
 */
export function buildPrintContext(model, extra = {}) {
    const seller = model?.seller || {};
    const buyer = model?.buyer || {};
    const meta = model?.meta || {};
    const t = model?.totals || {};
    const items = model?.items || [];
    /*
     * The charges as the bill recorded them, each with the name it had at the
     * time. Read from the bill, never from the Charges master — a renamed
     * charge must not rewrite what an old bill says it charged for.
     */
    const chargeLines = Array.isArray(model?.charges) ? model.charges : [];

    const totalQty = items.reduce((a, i) => a + n(i.qty), 0);

    /*
     * Rate-wise GST, the block a tax invoice is expected to carry and the one
     * the department asks about. Grouped by the rate actually charged on each
     * line, so a bill mixing 5% and 18% shows both — summing to a single "GST"
     * figure loses exactly the breakdown that makes the bill checkable.
     *
     * CGST and SGST are shown as the halves they are on an intra-state bill;
     * an inter-state bill carries IGST instead, and which it is comes from the
     * bill itself rather than being guessed from the states.
     */
    const interState = n(t.igstTotal) > 0;
    const byRate = new Map();
    for (const i of items) {
        const rate = n(i.taxPercent ?? i.gstPercent);
        if (!rate) continue;
        const row = byRate.get(rate) || { taxable: 0, tax: 0 };
        row.taxable += n(i.lineTotal ?? i.amount) - n(i.taxAmount);
        row.tax += n(i.taxAmount);
        byRate.set(rate, row);
    }
    const taxSummary = [...byRate.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([rate, r]) => {
            const taxable = money(Math.round(r.taxable * 100) / 100);
            const half = money(Math.round((r.tax / 2) * 100) / 100);
            return interState
                ? `${rate}% on ${taxable}  \u00B7  IGST ${money(Math.round(r.tax * 100) / 100)}`
                : `${rate}% on ${taxable}  \u00B7  CGST ${half} + SGST ${half}`;
        })
        .join('\n');
    const savings = items.reduce(
        (a, i) => a + Math.max(0, (n(i.mrp) - n(i.rate)) * n(i.qty)), 0);

    return {
        company: {
            name: seller.name || '',
            address: seller.address || '',
            phone: seller.phone || '',
            email: seller.email || '',
            gstin: seller.gstin || '',
            stateName: seller.stateName || '',
            logo: extra.logo || '',
        },
        doc: {
            title: extra.title || (model?.isTaxInvoice ? 'TAX INVOICE' : 'BILL OF SUPPLY'),
            number: meta.billNo || '',
            date: meta.billDate || '',
            time: meta.billTime || '',
            paymentMode: meta.saleType || '',
            orderSource: meta.orderSource || extra.orderSource || '',
            priceTier: meta.priceTier === 'WHOLESALE' ? 'Wholesale' : 'Retail',
            salesman: meta.salesMan || '',
            counter: meta.bookNo || extra.counter || '',
            vehicleNo: meta.vehicleNo || extra.vehicleNo || '',
            deliveryNote: meta.deliveryNote || extra.deliveryNote || '',
            remarks: meta.remarks || '',
            qr: meta.billNo || '',
        },
        party: {
            name: buyer.name || '',
            phone: buyer.phone || '',
            address: buyer.address || '',
            gstin: buyer.gstin || '',
            placeOfSupply: buyer.placeOfSupply || '',
            /*
             * What this party owes in total after this bill — the "Current
             * Bal." line a credit customer looks for. It is not on the bill
             * model, because it is a fact about the party's ledger rather than
             * about this sale, so the caller passes it in. Left blank when the
             * caller does not know it, and the row then does not print at all.
             */
            balance: extra.partyBalance ?? '',
        },
        /*
         * One entry per charge, keyed by its code, so a layout can place
         * 'charge.TRANSPORT' at an exact spot on an A4 invoice. Most layouts
         * want 'totals.chargesBlock' instead, which prints all of them.
         */
        charge: Object.fromEntries(chargeLines.map(c => [String(c.code), n(c.amount)])),
        totals: {
            subtotal: t.taxableTotal,
            discount: t.discount,
            cgst: t.cgstTotal,
            sgst: t.sgstTotal,
            igst: t.igstTotal,
            tax: t.taxAmount,
            transport: t.transport,
            roundOff: t.roundOff,
            grandTotal: t.grandTotal,
            received: t.received,
            balance: t.balanceDue,
            change: t.changeReturned,
            /*
             * The shop's own charges — delivery, packing, service, freight.
             *
             * chargesBlock is the one a layout normally places: it prints every
             * charge on the bill with the name the shop gave it, so a charge
             * invented next year appears without anyone editing the template.
             * Individual charges are reachable as charge.<CODE> for a layout
             * that wants freight at one exact spot.
             */
            charges: chargeLines,
            chargesBlock: chargeLines
                .map(c => `${c.name}  ${money(c.amount)}`)
                .join('\n'),
            chargesTotal: chargeLines.reduce((a, c) => a + (Number(c.amount) || 0), 0),
            chargesTax: chargeLines.reduce((a, c) => a + (Number(c.taxAmount) || 0), 0),
            amountInWords: extra.amountInWords || '',
            itemCount: items.length,
            totalQty: Math.round(totalQty * 1000) / 1000,
            savings: Math.round(savings * 100) / 100,
        },
        taxSummary,
        items: items.map((i, idx) => ({
            serial: idx + 1,
            code: i.code || i.itemCode || '',
            name: i.name || '',
            nameLocal: i.tamilName || i.nameLocal || '',
            hsn: i.hsnCode || '',
            batch: i.batchNo || '',
            expiry: i.expiry || '',
            qty: i.qty,
            unit: i.unit || '',
            rate: i.rate,
            mrp: i.mrp,
            discount: i.discount,
            taxPercent: i.taxPercent ?? i.gstPercent,
            taxAmount: i.taxAmount,
            amount: i.lineTotal ?? i.amount,
        })),
    };
}

/** Reads one `a.b` path — or a bare `a` — out of the context. */
function valueAt(ctx, source) {
    if (!source) return '';
    const [group, key] = String(source).split('.');
    // A single-segment source is a value in its own right, not a group. Without
    // this, 'taxSummary' read ctx.taxSummary[undefined] and printed nothing.
    const v = key === undefined ? ctx?.[group] : ctx?.[group]?.[key];
    return v === undefined || v === null ? '' : v;
}

/** True for a source the catalogue marks as money. */
const MONEY = new Set([
    'totals.subtotal', 'totals.discount', 'totals.cgst', 'totals.sgst', 'totals.igst',
    'totals.tax', 'totals.transport', 'totals.roundOff', 'totals.grandTotal',
    'totals.received', 'totals.balance', 'totals.change', 'totals.savings',
    'totals.chargesTotal', 'totals.chargesTax', 'party.balance',
    'item.rate', 'item.mrp', 'item.discount', 'item.taxAmount', 'item.amount',
]);

/**
 * Money sources the fixed list cannot name.
 *
 * Every charge a shop invents becomes 'charge.<CODE>', and there is no way to
 * know those codes in advance — so the prefix decides, not the list.
 */
function isMoneySource(source) {
    return MONEY.has(source) || String(source || '').startsWith('charge.');
}

/**
 * The printable text for a field.
 *
 * A zero money value returns an empty string rather than "0.00": a bill with
 * "Discount 0.00" and "Balance 0.00" printed on it reads as clutter, and the
 * operator would then ask for those lines to be removed one at a time.
 */
function fieldText(ctx, f) {
    /*
     * A literal. The designer writes 'text' as the source for a fixed label,
     * but a layout's row labels are written as bare { text: 'Taxable' } with no
     * source at all — and without the second test those printed as nothing,
     * leaving a bill of unlabelled numbers.
     */
    if (f.source === 'text' || (!f.source && f.text !== undefined)) return String(f.text || '');
    const raw = valueAt(ctx, f.source);
    if (raw === '' ) return '';
    const isMoney = isMoneySource(f.source);
    if (isMoney && n(raw) === 0 && !f.showZero) return '';
    const body = isMoney ? money(raw) : String(raw);
    return `${f.prefix || ''}${body}${f.suffix || ''}`;
}

function itemCellText(row, col) {
    const raw = row?.[String(col.source).split('.')[1]];
    if (raw === undefined || raw === null || raw === '') return '';
    return MONEY.has(col.source) ? money(raw) : String(raw);
}

/**
 * The small line under one item: "HSN 1006 · MRP 1,350 · B: R2411 · Exp 06/27".
 *
 * Labelled, because on a printed bill the reader has no column header to look
 * up at — "1006" alone means nothing. Empty values are skipped entirely, so the
 * line shortens to what the shop actually records rather than showing labels
 * with nothing behind them. Returns '' when nothing survives, and the caller
 * then prints no second line at all.
 */
const SUB_LABEL = {
    'item.code':       'Code',
    'item.hsn':        'HSN',
    'item.mrp':        'MRP',
    'item.batch':      'B',
    'item.expiry':     'Exp',
    'item.serial':     'Sl',
    'item.unit':       'Unit',
    'item.taxPercent': 'GST',
    'item.discount':   'Disc',
    'item.taxAmount':  'Tax',
    'item.nameLocal':  '',
};

function itemSubText(row, sources) {
    const parts = [];
    for (const src of sources || []) {
        const key = String(src).split('.')[1];
        const raw = row?.[key];
        if (raw === undefined || raw === null || raw === '') continue;
        if (MONEY.has(src) && n(raw) === 0) continue;
        const body = MONEY.has(src) ? money(raw) : String(raw);
        const label = SUB_LABEL[src];
        parts.push(label ? `${label} ${body}` : body);
    }
    return parts.join('  \u00B7  ');
}

/* ────────────────────────── FLOW (rolls) ────────────────────────── */

function renderFlow(template, layout, ctx) {
    const usableMm = template.widthMm - template.marginLeftMm - template.marginRightMm;
    const content = [];

    for (const b of layout.blocks || []) {
        if (b.visible === false) continue;
        const size = n(b.fontSize) || 8;

        if (b.type === 'line') {
            content.push({
                canvas: [{ type: 'line', x1: 0, y1: 1, x2: usableMm * MM, y2: 1, lineWidth: 0.5, lineColor: '#999999' }],
                margin: [0, 1.5, 0, 1.5],
            });
            continue;
        }
        if (b.type === 'spacer') {
            content.push({ text: '', margin: [0, (n(b.heightMm) || 2) * MM / 2, 0, 0] });
            continue;
        }
        if (b.type === 'text' || b.type === 'field') {
            const text = b.type === 'text' ? String(b.text || '') : fieldText(ctx, b);
            if (!text) continue;
            content.push({ text, fontSize: size, bold: !!b.bold, alignment: b.align || 'left' });
            continue;
        }
        if (b.type === 'row') {
            const l = b.left ? fieldText(ctx, b.left) : '';
            const r = b.right ? fieldText(ctx, b.right) : '';
            if (!l && !r) continue;
            // A row is a label and its value. When the value comes to nothing —
            // a zero discount, a bill with no round-off — the label alone is
            // noise on a 76mm roll, so the whole row goes. A left-only row
            // (a note, a heading) has no `right` at all and is kept.
            if (b.right && !r) continue;
            content.push({
                columns: [
                    { text: l, fontSize: size, bold: !!b.bold, alignment: 'left' },
                    { text: r, fontSize: size, bold: !!b.bold, alignment: 'right' },
                ],
            });
            continue;
        }
        if (b.type === 'table') {
            const cols = b.columns || [];
            if (!cols.length || !ctx.items.length) continue;
            const widths = cols.map(c => (n(c.width) / 100) * usableMm * MM);
            const body = [];
            if (b.showHeader !== false) {
                body.push(cols.map(c => ({
                    text: c.header || '', fontSize: size, bold: true, alignment: c.align || 'left',
                })));
            }
            // A sub-line has to span every column, so it is one cell with a
            // colSpan and empty siblings — pdfmake needs the row to keep the
            // table's column count even when one cell covers it.
            const subSize = Math.max(5.5, size - 1);
            for (const row of ctx.items) {
                body.push(cols.map(c => ({
                    text: itemCellText(row, c), fontSize: size, alignment: c.align || 'left',
                })));
                const sub = itemSubText(row, b.sub);
                if (sub) {
                    const line = [{ text: sub, fontSize: subSize, color: '#444444', colSpan: cols.length, margin: [0, 0, 0, 0.6] }];
                    for (let i = 1; i < cols.length; i++) line.push({});
                    body.push(line);
                }
            }
            content.push({
                table: { widths, body, headerRows: b.showHeader === false ? 0 : 1 },
                /*
                 * No horizontal padding. The widths already add up to the
                 * usable width, and pdfmake's default 4pt each side would add
                 * some 11mm across four columns — enough to push the amount
                 * off a 76mm roll, which is exactly where the money is.
                 */
                layout: {
                    hLineWidth: () => 0,
                    vLineWidth: () => 0,
                    paddingLeft: () => 0,
                    paddingRight: () => 0,
                    paddingTop: () => 0.5,
                    paddingBottom: () => 0.5,
                },
                margin: [0, 1, 0, 1],
            });
            continue;
        }
    }

    return {
        pageSize: { width: template.widthMm * MM, height: 'auto' },
        pageMargins: [
            template.marginLeftMm * MM, template.marginTopMm * MM,
            template.marginRightMm * MM, template.marginBottomMm * MM,
        ],
        content,
        defaultStyle: { fontSize: 8, lineHeight: 1.05 },
    };
}

/* ────────────────────────── FIXED (sheets) ────────────────────────── */

function renderFixed(template, layout, ctx) {
    const content = [];

    for (const f of layout.fields || []) {
        if (f.visible === false) continue;
        const text = fieldText(ctx, f);
        if (!text) continue;
        content.push({
            text,
            absolutePosition: { x: n(f.x) * MM, y: n(f.y) * MM },
            width: n(f.w) * MM,
            fontSize: f.font?.size || 9,
            bold: !!f.font?.bold,
            alignment: f.font?.align || 'left',
        });
    }

    const t = layout.table;
    if (t && ctx.items.length) {
        const cols = t.columns || [];
        const widths = cols.map(c => (n(c.width) / 100) * n(t.w) * MM);
        const size = n(t.fontSize) || 8;
        const body = [];
        if (t.showHeader !== false) {
            body.push(cols.map(c => ({
                text: c.header || '', fontSize: size, bold: true, alignment: c.align || 'left',
            })));
        }

        // The table may not run past maxY, or it would print over the totals.
        // Rows beyond that go on to a continuation page rather than being lost,
        // because a bill that silently drops line 23 is worse than a two-page bill.
        const rowMm = size * 0.42 + 1.6;
        const capacity = t.maxY
            ? Math.max(1, Math.floor((n(t.maxY) - n(t.y) - rowMm) / rowMm))
            : ctx.items.length;

        const pages = [];
        for (let i = 0; i < ctx.items.length; i += capacity) {
            pages.push(ctx.items.slice(i, i + capacity));
        }
        pages.forEach((rows, pageIdx) => {
            const pageBody = body.slice(0, t.showHeader === false ? 0 : 1).concat(
                rows.map(row => cols.map(c => ({
                    text: itemCellText(row, c), fontSize: size, alignment: c.align || 'left',
                }))),
            );
            content.push({
                table: { widths, body: pageBody, headerRows: t.showHeader === false ? 0 : 1 },
                layout: 'lightHorizontalLines',
                absolutePosition: { x: n(t.x) * MM, y: n(t.y) * MM },
                pageBreak: pageIdx > 0 ? 'before' : undefined,
            });
        });
    }

    // Totals sit as a labelled block above the bottom margin.
    const totals = (layout.totals || []).filter(row => {
        const v = valueAt(ctx, row.source);
        return !(isMoneySource(row.source) && n(v) === 0);
    });
    if (totals.length) {
        const boxW = 70;
        const x = template.widthMm - 12 - boxW;
        const startY = n(layout.table?.maxY ?? template.heightMm - 46) + 4;
        totals.forEach((row, i) => {
            const y = startY + i * 5.5;
            content.push({
                columns: [
                    { text: row.label || row.source, fontSize: row.bold ? 9.5 : 8.5, bold: !!row.bold, alignment: 'left' },
                    { text: money(valueAt(ctx, row.source)), fontSize: row.bold ? 9.5 : 8.5, bold: !!row.bold, alignment: 'right' },
                ],
                absolutePosition: { x: x * MM, y: y * MM },
                width: boxW * MM,
            });
        });
    }

    return {
        pageSize: { width: template.widthMm * MM, height: template.heightMm * MM },
        pageMargins: [0, 0, 0, 0],
        content,
        defaultStyle: { fontSize: 9, lineHeight: 1.1 },
    };
}

/**
 * Turns a template plus a document into a pdfmake definition.
 *
 * `template.layoutJson` is parsed here rather than by the caller, so a broken
 * layout produces a readable error at one place instead of an undefined-property
 * crash somewhere inside the drawing code.
 */
export function buildDocDefinition(template, ctx) {
    if (!template) throw new Error('No print template was given.');
    let layout;
    try {
        layout = typeof template.layoutJson === 'string'
            ? JSON.parse(template.layoutJson || '{}')
            : (template.layoutJson || {});
    } catch {
        throw new Error(`The layout for "${template.name}" is not valid and cannot be printed.`);
    }
    return template.mode === 'FIXED'
        ? renderFixed(template, layout, ctx)
        : renderFlow(template, layout, ctx);
}
