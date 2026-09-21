/**
 * Printing a document through its template.
 *
 * Kept separate from `template-render.js` so the drawing code stays pure and
 * testable: that file turns a template plus data into a document definition and
 * touches nothing else, while this one deals with pdfmake, the browser and the
 * printer.
 */
import { buildDocDefinition } from './template-render';
import { getPdfMake } from './pdfmake';

async function createPdf(template, ctx) {
    const pdfMake = await getPdfMake();
    return pdfMake.createPdf(buildDocDefinition(template, ctx));
}

/*
 * Every output call is awaited. In pdfmake 0.3 these return promises, and an
 * un-awaited one swallows its own failure: the caller's try/catch sees nothing
 * and the operator is told the bill printed when it did not.
 */

/** Opens the document in a new tab. */
export async function openTemplatePdf(template, ctx) {
    await (await createPdf(template, ctx)).open();
}

/** Downloads it. */
export async function saveTemplatePdf(template, ctx, filename) {
    await (await createPdf(template, ctx)).download(filename || 'document.pdf');
}

/** Sends it to the browser's print dialog. */
export async function printTemplatePdf(template, ctx) {
    await (await createPdf(template, ctx)).print();
}

/**
 * The PDF as base64, for the preview pane and for QZ Tray.
 *
 * getBase64 takes no callback in pdfmake 0.3 — it returns a promise. Passing
 * one gave us a call that never came back and a preview pane that stayed empty
 * in silence, so the deadline below stays: a draw that stalls should say so
 * rather than look like a screen still loading.
 */
export async function templatePdfBase64(template, ctx) {
    const pdf = await createPdf(template, ctx);
    const data = await withDeadline(
        Promise.resolve(pdf.getBase64()),
        20000,
        'The PDF did not finish drawing within 20 seconds. The layout may be too large, or a font may be missing.',
    );
    if (!data) throw new Error('The PDF came back empty.');
    return data;
}

/** Rejects if a promise has not settled in time, so a stall is reported. */
function withDeadline(promise, ms, message) {
    let timer;
    return Promise.race([
        promise.finally(() => clearTimeout(timer)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]);
}

/** A data URL, for showing the document inside a preview pane. */
export async function templatePdfDataUrl(template, ctx) {
    return 'data:application/pdf;base64,' + (await templatePdfBase64(template, ctx));
}

/**
 * Sample data for the designer, so a template can be laid out before any real
 * document exists — and so the preview shows a long enough item list to reveal
 * a table that would overflow.
 */
export function sampleContext() {
    const items = [
        { serial: 1, code: 'ITM-0001', name: 'Sugar', nameLocal: 'சர்க்கரை', hsn: '1701', batch: 'B12', expiry: '2027-04', qty: 2, unit: 'KG', rate: 60, mrp: 70, discount: 0, taxPercent: 5, taxAmount: 6, amount: 126 },
        { serial: 2, code: 'ITM-0002', name: 'Rice 25 KG Bag', nameLocal: 'அரிசி', hsn: '1006', batch: '', expiry: '', qty: 1, unit: 'BAG', rate: 1400, mrp: 1500, discount: 0, taxPercent: 5, taxAmount: 70, amount: 1470 },
        { serial: 3, code: 'ITM-0003', name: 'Cooking Oil', nameLocal: 'எண்ணெய்', hsn: '1512', batch: '', expiry: '', qty: 5, unit: 'LTR', rate: 140, mrp: 155, discount: 0, taxPercent: 5, taxAmount: 35, amount: 735 },
        { serial: 4, code: 'ITM-0004', name: 'Tea Powder 500 GM', nameLocal: 'தேயிலை', hsn: '0902', batch: '', expiry: '', qty: 2, unit: 'PKT', rate: 240, mrp: 260, discount: 0, taxPercent: 5, taxAmount: 24, amount: 504 },
    ];
    return {
        company: {
            name: 'AVS ECOM PRIVATE LIMITED',
            address: '12 Market Street, Coimbatore 641001',
            phone: '98400 00000',
            email: 'billing@example.com',
            gstin: '33AAAAA0000A1Z5',
            stateName: 'Tamil Nadu',
            logo: '',
        },
        doc: {
            title: 'TAX INVOICE', number: 'INV/000971', date: '2026-09-08', time: '11:45 am',
            paymentMode: 'CASH', orderSource: 'Counter', priceTier: 'Retail',
            salesman: 'Ravi', counter: 'COUNTER A', vehicleNo: 'TN 37 AB 1234',
            deliveryNote: 'Deliver before 6 pm', remarks: '', qr: 'INV/000971',
        },
        party: {
            name: 'Kumar Stores', phone: '99400 11111',
            address: '4 Bazaar Road, Erode', gstin: '33BBBBB1111B1Z6',
            placeOfSupply: 'Tamil Nadu',
            // So the designer can show the "Current Bal." line rather than
            // leaving it blank and looking like a field that does nothing.
            balance: 8410,
        },
        totals: {
            subtotal: 2700, discount: 0, cgst: 67.5, sgst: 67.5, igst: 0, tax: 135,
            transport: 0, roundOff: 0, grandTotal: 2835, received: 2835, balance: 0,
            change: 0, amountInWords: 'Two Thousand Eight Hundred Thirty Five Rupees Only',
            itemCount: items.length, totalQty: 10, savings: 175,
        },
        // The rate-wise summary, in the same shape buildPrintContext produces.
        taxSummary: '5% on 2,700.00  \u00B7  CGST 67.50 + SGST 67.50',
        items,
    };
}
