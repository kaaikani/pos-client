"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { FileText, Download, Printer, Loader2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { InvoiceSaleQuery, buildInvoiceModel } from '../../core/invoice/invoice-data';
import { PosActiveCompanyQuery } from '../../core/queries/company.query';
import { openInvoicePdf, saveInvoicePdf, printInvoicePdf } from '../../core/invoice/invoice-pdf';
import { PosPrintTemplateQuery } from '../../core/queries/pos.query';
import { buildPrintContext } from '../../core/print/template-render';
import {
    openTemplatePdf, saveTemplatePdf, printTemplatePdf, templatePdfBase64,
} from '../../core/print/template-print';
import { amountInWords } from '../../core/invoice/invoice-data';
import { qzIsAvailable, qzListPrinters, qzPrintPdfBase64 } from '../../core/barcode/qz-print';

const money = (v) => '₹' + (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SIZE_OPTIONS = [
    { value: '3inch', label: 'Thermal 3"' },
    { value: '4inch', label: 'Thermal 4"' },
    { value: '6inch', label: 'Thermal 6"' },
    { value: 'A4', label: 'A4' },
    { value: 'A5', label: 'A5' },
    { value: 'A6', label: 'A6' },
];

/**
 * Tax-invoice preview + PDF actions. Sole data source = backend sale
 * (InvoiceSaleQuery) + active PosCompany. Flow: Preview → Open PDF → Save PDF → Print.
 */
export default function InvoicePreviewModal({ open, onOpenChange, saleId, billNo, sizeMode = '3inch' }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [inv, setInv] = useState(null);
    const [busy, setBusy] = useState('');
    const [size, setSize] = useState(sizeMode);

    /**
     * The shop's own layout for this paper size, and the printer to send it to.
     *
     * The layout is fetched rather than built here: the same template drives the
     * designer's preview, so the bill a customer receives is the one the shop
     * laid out, not a second version living in this file.
     */
    const [template, setTemplate] = useState(null);
    const [printers, setPrinters] = useState([]);
    const [printer, setPrinter] = useState('');
    const [directReady, setDirectReady] = useState(false);

    useEffect(() => { setSize(sizeMode); }, [sizeMode]);

    const load = useCallback(async () => {
        if (!saleId && !billNo) return;
        setLoading(true);
        setError('');
        try {
            const [sale, company] = await Promise.all([
                new InvoiceSaleQuery().execute({ saleId, billNo }),
                new PosActiveCompanyQuery().execute().catch(() => null),
            ]);
            if (!sale) throw new Error('Sale not found for this invoice.');
            setInv(buildInvoiceModel(sale, company));
        } catch (e) {
            setError(e?.message || 'Failed to load invoice.');
        } finally {
            setLoading(false);
        }
    }, [saleId, billNo]);

    useEffect(() => {
        if (open) load();
        if (!open) { setInv(null); setError(''); }
    }, [open, load]);

    /* The selector speaks in '3inch'; templates are keyed by paper code. */
    const paperCode = ({
        '3inch': '3IN', '4inch': '4IN', '6inch': '6IN',
        A6: 'A6', A5: 'A5', A4: 'A4',
    })[size] || '3IN';

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        new PosPrintTemplateQuery().execute('SALE', paperCode)
            .then(t => { if (!cancelled) setTemplate(t); })
            // No template is not an error the cashier can act on — the old
            // built-in layout still prints, so fall back quietly.
            .catch(() => { if (!cancelled) setTemplate(null); });
        return () => { cancelled = true; };
    }, [open, paperCode]);

    /* Direct printing is available only when QZ Tray is actually running. */
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            try {
                const ok = await qzIsAvailable();
                if (cancelled) return;
                setDirectReady(!!ok);
                if (!ok) return;
                const list = await qzListPrinters();
                if (cancelled) return;
                setPrinters(list || []);
                const saved = localStorage.getItem('pos_bill_printer') || '';
                if (saved && (list || []).includes(saved)) setPrinter(saved);
            } catch {
                if (!cancelled) setDirectReady(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open]);

    const choosePrinter = (name) => {
        setPrinter(name);
        // Remembered per machine, not per company: the printer on this counter
        // is nothing to do with the printer at the next one.
        try { localStorage.setItem('pos_bill_printer', name); } catch { /* private window */ }
    };

    /** Sale plus company, in the shape a template reads. */
    const printContext = () => buildPrintContext(inv, {
        title: inv?.isTaxInvoice ? 'TAX INVOICE' : 'BILL OF SUPPLY',
        amountInWords: amountInWords(inv?.totals?.grandTotal || 0),
    });

    /**
     * Uses the shop's template when one exists, and the original built-in
     * layout when it does not — so a shop that has never opened the designer
     * still gets a bill.
     */
    const runPdf = async (fn, tag) => {
        if (!inv) return;
        setBusy(tag);
        try {
            if (template) {
                const byTag = { open: openTemplatePdf, save: saveTemplatePdf, print: printTemplatePdf };
                await byTag[tag](template, printContext());
            } else {
                await fn(inv, size);
            }
        } catch (e) {
            setError(e?.message || 'PDF generation failed.');
        } finally {
            setBusy('');
        }
    };

    /**
     * Sends the bill straight to the printer, with no Windows dialog.
     *
     * This is the difference between a counter that can bill continuously and
     * one where the cashier clicks through a dialog on every sale.
     */
    const printDirect = async () => {
        if (!inv || !template || !printer) return;
        setBusy('direct');
        try {
            const b64 = await templatePdfBase64(template, printContext());
            await qzPrintPdfBase64(printer, b64);
        } catch (e) {
            setError(e?.message || 'Direct printing failed. Check that QZ Tray is running.');
        } finally {
            setBusy('');
        }
    };

    const t = inv?.totals;
    const interState = inv?.interState;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b border-slate-200">
                    <DialogTitle className="flex items-center gap-2">
                        <FileText size={18} className="text-emerald-600" /> {inv?.isTaxInvoice ? 'Tax Invoice' : 'Bill of Supply'} — Preview
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto px-6 py-4 bg-slate-50">
                    {loading && <div className="flex flex-col items-center justify-center py-20 text-slate-500"><Loader2 className="animate-spin mb-3" size={28} /><p className="font-bold">Loading invoice…</p></div>}
                    {!loading && error && (
                        <div className="flex flex-col items-center justify-center py-20 text-red-600"><AlertTriangle className="mb-3" size={28} /><p className="font-bold">{error}</p><button onClick={load} className="mt-3 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold">Retry</button></div>
                    )}
                    {!loading && !error && inv && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-xs">
                            {/* Header */}
                            <div className="flex justify-between items-start border-b border-slate-300 pb-3 mb-3">
                                <div>
                                    <div className="text-lg font-black text-slate-900">{inv.seller?.name || 'No active company'}</div>
                                    {inv.seller?.address && <div className="text-slate-500">{inv.seller.address}</div>}
                                    {inv.seller?.gstin && <div className="font-bold text-slate-800">GSTIN: {inv.seller.gstin}</div>}
                                    {inv.seller?.stateName && <div className="text-slate-500">State: {inv.seller.stateCode}-{inv.seller.stateName}</div>}
                                </div>
                                <div className="text-right">
                                    <div className="text-base font-black text-slate-900">{inv.isTaxInvoice ? 'TAX INVOICE' : 'BILL OF SUPPLY'}</div>
                                    <div className="text-slate-600">Invoice No: <b>{inv.meta.billNo}</b></div>
                                    <div className="text-slate-500">{inv.meta.billDate} {inv.meta.billTime}</div>
                                    <div className="text-slate-500">Type: {inv.meta.invoiceType}</div>
                                    <div className={inv.meta.reverseCharge ? 'font-bold text-slate-800' : 'text-slate-500'}>Reverse Charge: {inv.meta.reverseCharge ? 'Yes' : 'No'}</div>
                                </div>
                            </div>
                            {/* Buyer */}
                            <div className="mb-3">
                                <div className="text-[10px] font-bold uppercase text-slate-400">Bill To</div>
                                <div className="font-bold text-slate-900">{inv.buyer.name}</div>
                                {inv.buyer.address && <div className="text-slate-500">{inv.buyer.address}</div>}
                                {inv.buyer.phone && <div className="text-slate-500">Ph: {inv.buyer.phone}</div>}
                                {inv.buyer.gstin && <div className="font-bold text-slate-800">GSTIN: {inv.buyer.gstin}</div>}
                                {inv.buyer.placeOfSupply && <div className="text-slate-500">Place of Supply: {inv.buyer.placeOfSupply}</div>}
                            </div>
                            {/* Items */}
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-100 text-slate-600">
                                        <th className="px-2 py-1 text-left">#</th>
                                        <th className="px-2 py-1 text-left">Item</th>
                                        <th className="px-2 py-1 text-right">HSN/SAC</th>
                                        <th className="px-2 py-1 text-right">Qty</th>
                                        <th className="px-2 py-1 text-right">Rate</th>
                                        <th className="px-2 py-1 text-right">Taxable</th>
                                        <th className="px-2 py-1 text-right">GST%</th>
                                        {interState ? <th className="px-2 py-1 text-right">IGST</th> : (<><th className="px-2 py-1 text-right">CGST</th><th className="px-2 py-1 text-right">SGST</th></>)}
                                        {inv.hasCess && <th className="px-2 py-1 text-right">Cess</th>}
                                        <th className="px-2 py-1 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inv.items.map((it) => (
                                        <tr key={it.sno} className="border-b border-slate-100">
                                            <td className="px-2 py-1">{it.sno}</td>
                                            <td className="px-2 py-1 font-bold text-slate-900">{it.name}</td>
                                            <td className="px-2 py-1 text-right">{it.hsnCode || '—'}</td>
                                            <td className="px-2 py-1 text-right">{it.qty}{it.unit ? ' ' + it.unit : ''}</td>
                                            <td className="px-2 py-1 text-right">{money(it.rate)}</td>
                                            <td className="px-2 py-1 text-right">{money(it.taxable)}</td>
                                            <td className="px-2 py-1 text-right">{it.gstPercent}%</td>
                                            {interState ? <td className="px-2 py-1 text-right">{money(it.igst)}</td> : (<><td className="px-2 py-1 text-right">{money(it.cgst)}</td><td className="px-2 py-1 text-right">{money(it.sgst)}</td></>)}
                                            {inv.hasCess && <td className="px-2 py-1 text-right">{money(it.cess)}</td>}
                                            <td className="px-2 py-1 text-right font-bold">{money(it.lineTotal)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {/* Totals */}
                            <div className="flex justify-end mt-3">
                                <div className="w-64 space-y-0.5">
                                    <Row k="Taxable Value" v={money(t.taxableTotal)} />
                                    {interState ? <Row k="IGST" v={money(t.igstTotal)} /> : (<><Row k="CGST" v={money(t.cgstTotal)} /><Row k="SGST" v={money(t.sgstTotal)} /></>)}
                                    {inv.hasCess && <Row k="Cess" v={money(t.cessTotal)} />}
                                    {t.discount > 0 && <Row k="Discount" v={'-' + money(t.discount)} />}
                                    {t.transport > 0 && <Row k="Transport" v={money(t.transport)} />}
                                    <Row k="Round Off" v={(t.roundOff < 0 ? '-' : '') + money(Math.abs(t.roundOff))} />
                                    <div className="flex justify-between border-t-2 border-slate-800 pt-1 mt-1 text-sm font-black text-slate-900"><span>GRAND TOTAL</span><span>{money(t.grandTotal)}</span></div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-white">
                    <label className="text-xs font-bold text-slate-500 mr-auto flex items-center gap-2">
                        Format
                        <select value={size} onChange={(e) => setSize(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-md text-sm font-bold outline-none">
                            {SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </label>
                    <button onClick={() => runPdf(openInvoicePdf, 'open')} disabled={!inv || !!busy} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">{busy === 'open' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} Open PDF</button>
                    <button onClick={() => runPdf(saveInvoicePdf, 'save')} disabled={!inv || !!busy} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">{busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Save PDF</button>
                    {directReady && (
                        <select value={printer} onChange={(e) => choosePrinter(e.target.value)}
                            title="Printer for direct printing, remembered on this machine"
                            className="px-2 py-1.5 border border-slate-300 rounded-md text-sm font-bold outline-none max-w-[190px]">
                            <option value="">Choose printer…</option>
                            {printers.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    )}
                    <button onClick={() => runPdf(printInvoicePdf, 'print')} disabled={!inv || !!busy} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">{busy === 'print' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Print dialog</button>
                    {directReady && (
                        <button onClick={printDirect} disabled={!inv || !template || !printer || !!busy}
                            title={!printer ? 'Choose a printer first' : 'Print without the Windows dialog'}
                            className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2">
                            {busy === 'direct' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Print now
                        </button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Row({ k, v }) {
    return <div className="flex justify-between text-slate-600"><span>{k}</span><span className="font-bold text-slate-800">{v}</span></div>;
}
