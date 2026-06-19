import { gql } from '../queries/gql.js';

/**
 * Invoice data layer — the ONLY source of truth for the printed tax invoice is
 * the persisted backend sale (PharmaSale + its itemsJson tax snapshot) plus the
 * active PosCompany (seller identity). Nothing here recomputes tax; it only
 * reads backend values and sums per-line amounts for the totals band.
 *
 * Note: SALE_FIELDS in pharma.query.js omits the GST-compliance columns, so this
 * module uses its own field set that includes customerGstin / placeOfSupply /
 * invoiceType / reverseCharge / roundOff and the full itemsJson.
 */

const INVOICE_SALE_FIELDS = `
    id billNo billDate billTime saleType
    customerName customerPhone customerAddress salesMan
    customerGstin placeOfSupply invoiceType reverseCharge
    itemsJson subtotal taxAmount discount transportCharges roundOff grandTotal
    cashAmount upiAmount cardAmount chequeAmount onlineAmount
    receivedAmount balanceDue changeReturned remarks
`;

/** Fetch the authoritative sale by DB id (preferred) or bill number. */
export class InvoiceSaleQuery {
    async execute({ saleId, billNo }) {
        if (saleId) {
            const data = await gql(
                `query InvoiceSale($id: ID!) { pharmaSale(id: $id) { ${INVOICE_SALE_FIELDS} } }`,
                { useAdmin: true, variables: { id: String(saleId) } },
            );
            return data.pharmaSale || null;
        }
        const data = await gql(
            `query InvoiceSaleByBill($b: String!) { pharmaSaleByBillNo(billNo: $b) { ${INVOICE_SALE_FIELDS} } }`,
            { useAdmin: true, variables: { b: String(billNo) } },
        );
        return data.pharmaSaleByBillNo || null;
    }
}

const n = (v) => Number(v) || 0;

/**
 * Normalize a backend sale + active company into a flat invoice model that both
 * the preview and the two PDF layouts render. All money fields are taken from
 * the backend; line tax amounts come from the itemsJson snapshot.
 */
export function buildInvoiceModel(sale, company) {
    let lines = [];
    try {
        lines = JSON.parse(sale?.itemsJson || '[]') || [];
    } catch {
        lines = [];
    }

    const items = lines.map((r, i) => ({
        sno: i + 1,
        name: String(r.itemName || r.name || r.itemCode || r.code || ''),
        hsnCode: String(r.hsnCode || ''),
        unit: String(r.unit || ''),
        qty: n(r.qty),
        rate: n(r.rate),
        gstPercent: n(r.gstPercent),
        interState: !!r.interState,
        taxable: n(r.taxableAmount),
        cgst: n(r.cgstAmount),
        sgst: n(r.sgstAmount),
        igst: n(r.igstAmount),
        cessPercent: n(r.cessPercent),
        cess: n(r.cessAmount),
        lineTotal: n(r.lineTotal) || n(r.taxableAmount) + n(r.taxAmount) + n(r.cessAmount),
    }));

    // Sum per-line snapshot amounts for the tax-split totals (display only).
    const sum = (k) => items.reduce((s, it) => s + it[k], 0);
    const round2 = (x) => Math.round(x * 100) / 100;
    const interState = items.some((it) => it.interState);
    const hasCess = items.some((it) => it.cess > 0);

    return {
        // Seller identity — ALWAYS from the active PosCompany.
        seller: company
            ? {
                  name: company.companyName || company.name || '',
                  address: company.address || '',
                  gstin: company.gstin || '',
                  stateName: company.stateName || '',
                  stateCode: company.stateCode || '',
                  phone: company.phone || '',
                  email: company.email || '',
              }
            : null,
        buyer: {
            name: sale?.customerName || 'Walk-in',
            phone: sale?.customerPhone || '',
            address: sale?.customerAddress || '',
            gstin: sale?.customerGstin || '',
            placeOfSupply: sale?.placeOfSupply || '',
        },
        meta: {
            billNo: sale?.billNo || '',
            billDate: sale?.billDate || '',
            billTime: sale?.billTime || '',
            saleType: sale?.saleType || '',
            invoiceType: sale?.invoiceType || 'B2C',
            reverseCharge: !!sale?.reverseCharge,
            salesMan: sale?.salesMan || '',
            remarks: sale?.remarks || '',
        },
        items,
        interState,
        hasCess,
        // Bill-level money — backend values are authoritative.
        totals: {
            taxableTotal: round2(sum('taxable')),
            cgstTotal: round2(sum('cgst')),
            sgstTotal: round2(sum('sgst')),
            igstTotal: round2(sum('igst')),
            cessTotal: round2(sum('cess')),
            taxAmount: n(sale?.taxAmount),
            discount: n(sale?.discount),
            transport: n(sale?.transportCharges),
            roundOff: n(sale?.roundOff),
            grandTotal: n(sale?.grandTotal),
            received: n(sale?.receivedAmount),
            balanceDue: n(sale?.balanceDue),
            changeReturned: n(sale?.changeReturned),
        },
        // Whether this is a true tax invoice (seller has a GSTIN) or bill of supply.
        isTaxInvoice: !!(company && company.gstin),
    };
}

/** Convert an INR amount to words (e.g. 1234.50 → "One Thousand Two Hundred Thirty Four Rupees and Fifty Paise"). */
export function amountInWords(amount) {
    const a = Math.max(0, Number(amount) || 0);
    const rupees = Math.floor(a);
    const paise = Math.round((a - rupees) * 100);
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const twoDigits = (num) => (num < 20 ? ones[num] : tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : ''));
    const threeDigits = (num) => {
        const h = Math.floor(num / 100);
        const r = num % 100;
        return (h ? ones[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? twoDigits(r) : '');
    };
    const toWords = (num) => {
        if (num === 0) return 'Zero';
        const crore = Math.floor(num / 10000000); num %= 10000000;
        const lakh = Math.floor(num / 100000); num %= 100000;
        const thousand = Math.floor(num / 1000); num %= 1000;
        const hundred = num;
        let out = '';
        if (crore) out += threeDigits(crore) + ' Crore ';
        if (lakh) out += threeDigits(lakh) + ' Lakh ';
        if (thousand) out += threeDigits(thousand) + ' Thousand ';
        if (hundred) out += threeDigits(hundred);
        return out.trim();
    };
    let result = `${toWords(rupees)} Rupees`;
    if (paise > 0) result += ` and ${toWords(paise)} Paise`;
    return result + ' Only';
}
