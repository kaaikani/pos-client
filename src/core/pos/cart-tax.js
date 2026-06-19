/**
 * POS live-cart tax mirror — a faithful port of the backend's pure tax math
 * (utils/tax-calc.ts computeLineTax + service resolveItemTax) so the on-screen
 * cart preview shows the SAME taxable / tax / grand total the server will
 * compute and persist. This removes the old flat 18% guess and, critically,
 * keeps the client grandTotal within the server's ±₹1 mismatch tolerance so
 * saves don't get rejected for inclusive-priced or non-18% items.
 *
 * The server remains authoritative (it recomputes and overrides subtotal/tax on
 * save); this is display + a matching grandTotal only.
 */

export function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

/** Port of utils/tax-calc.ts computeLineTax. */
export function computeLineTax({ rate, qty, gstPercent, inclusive, interState, discountFlat = 0, discountPct = 0 }) {
    const r = Number(rate) || 0;
    const q = Number(qty) || 0;
    const g = Math.max(0, Number(gstPercent) || 0);
    const gross = round2(r * q);

    const pctDisc = gross * (Math.max(0, Number(discountPct) || 0) / 100);
    const flatDisc = Math.max(0, Number(discountFlat) || 0);
    const discount = round2(Math.min(gross, pctDisc + flatDisc));
    const base = round2(gross - discount);

    let taxable;
    let gstAmount;
    if (inclusive && g > 0) {
        taxable = round2((base * 100) / (100 + g));
        gstAmount = round2(base - taxable);
    } else {
        taxable = base;
        gstAmount = round2((base * g) / 100);
    }

    const inter = !!interState;
    const cgst = inter ? 0 : round2(gstAmount / 2);
    const sgst = inter ? 0 : round2(gstAmount - cgst);
    const igst = inter ? gstAmount : 0;

    return { gross, discount, taxable, gstPercent: g, cgst, sgst, igst, gstAmount, total: round2(taxable + gstAmount) };
}

/**
 * Port of service.resolveItemTax: effective gst%/inclusive/inter-state for an
 * item, honoring an optional PosTaxMaster override (EXEMPT / IGST / GST_INCLUSIVE).
 */
export function resolveItemTax(item, taxMastersById, { interState }) {
    let gstPercent = Number(item?.gstPercent) || 0;
    let inclusive = !!item?.priceIncludesTax;
    let inter = !!interState;

    const tmId = item?.taxMasterId;
    if (tmId != null && taxMastersById) {
        const m = taxMastersById.get(Number(tmId));
        if (m) {
            gstPercent = Number(m.ratePercent) || 0;
            if (m.taxType === 'EXEMPT') gstPercent = 0;
            if (m.taxType === 'IGST') inter = true;
            if (m.taxType === 'GST_INCLUSIVE') inclusive = true;
        }
    }
    return { gstPercent, inclusive, interState: inter };
}

/**
 * Aggregate cart rows into bill-level tax totals, mirroring the server.
 * @param rows           cart rows ({ code, itemName, qty, rate })
 * @param itemsByCode    Map<code, item master> (carries gstPercent/priceIncludesTax/taxMasterId)
 * @param taxMastersById Map<id, PosTaxMaster>
 * @param opts           { otherState, discount, transport }
 */
export function computeCartTotals(rows, itemsByCode, taxMastersById, opts = {}) {
    const interState = !!opts.otherState;
    const discount = Number(opts.discount) || 0;
    const transport = Number(opts.transport) || 0;

    let taxableTotal = 0, taxAmount = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0, itemsTotal = 0;
    for (const r of rows || []) {
        const qty = parseFloat(r.qty) || 0;
        const rate = parseFloat(r.rate) || 0;
        if (qty <= 0 || !r.itemName) continue;
        const item = itemsByCode?.get(String(r.code)) || null;
        const eff = item
            ? resolveItemTax(item, taxMastersById, { interState })
            : { gstPercent: 0, inclusive: false, interState };
        const line = computeLineTax({ rate, qty, gstPercent: eff.gstPercent, inclusive: eff.inclusive, interState: eff.interState });
        taxableTotal += line.taxable;
        taxAmount += line.gstAmount;
        cgstTotal += line.cgst;
        sgstTotal += line.sgst;
        igstTotal += line.igst;
        itemsTotal += line.total;
    }
    taxableTotal = round2(taxableTotal);
    taxAmount = round2(taxAmount);
    cgstTotal = round2(cgstTotal);
    sgstTotal = round2(sgstTotal);
    igstTotal = round2(igstTotal);
    itemsTotal = round2(itemsTotal);
    // Mirrors server: serverGrand = linesTotal − discount + transport (+ roundOff, 0 here).
    const grandTotal = round2(itemsTotal - discount + transport);

    return { taxableTotal, taxAmount, cgstTotal, sgstTotal, igstTotal, itemsTotal, grandTotal };
}
