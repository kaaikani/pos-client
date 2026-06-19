"use client";
import React, { useEffect, useState, useCallback } from 'react';
import { FileText, Download, Printer, Loader2, AlertTriangle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';
import { getReport, formatCell } from '../../core/reports/report-registry';
import { PosActiveCompanyQuery } from '../../core/queries/company.query';
import { openReportPdf, saveReportPdf, printReportPdf } from '../../core/reports/report-pdf';

/**
 * Shared report preview + PDF action modal for ALL standardized reports.
 * Flow: Preview (this modal) → Open PDF → Save PDF → Print.
 *
 * Driven entirely by the report registry descriptor — the same component
 * renders Sales / Purchase / Stock / Expense / Day Book with no per-report code.
 */
export default function ReportPreviewModal({
    open,
    onOpenChange,
    reportId,
    fromDate,
    toDate,
    preloadedData = null,
    preloadedCompany = null,
}) {
    const descriptor = getReport(reportId);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);
    const [company, setCompany] = useState(null);
    const [busy, setBusy] = useState('');

    const load = useCallback(async () => {
        if (!descriptor) return;
        // Reuse the caller's already-fetched payload when provided — guarantees
        // the modal and the screen render byte-identical numbers (one fetch).
        if (preloadedData) {
            setData(preloadedData);
            setCompany(preloadedCompany);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [reportData, activeCompany] = await Promise.all([
                descriptor.runQuery(fromDate, toDate),
                new PosActiveCompanyQuery().execute().catch(() => null),
            ]);
            setData(reportData);
            setCompany(activeCompany);
        } catch (e) {
            setError(e?.message || 'Failed to load report.');
        } finally {
            setLoading(false);
        }
    }, [descriptor, fromDate, toDate, preloadedData, preloadedCompany]);

    useEffect(() => {
        if (open && descriptor) load();
        if (!open) { setData(null); setError(''); }
    }, [open, descriptor, load]);

    const runPdf = async (fn, tag) => {
        if (!data) return;
        setBusy(tag);
        try {
            await fn(descriptor, data, company, fromDate, toDate);
        } catch (e) {
            setError(e?.message || 'PDF generation failed.');
        } finally {
            setBusy('');
        }
    };

    if (!descriptor) return null;

    const cols = descriptor.columns;
    const rows = data ? descriptor.buildRows(data) : [];
    const summary = data ? descriptor.buildSummary(data) : [];
    const alignCls = (type) => (type === 'money' || type === 'number' ? 'text-right' : 'text-left');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="px-6 py-4 border-b border-slate-200">
                    <DialogTitle className="flex items-center gap-2">
                        <FileText size={18} className="text-emerald-600" /> {descriptor.title} — Preview
                    </DialogTitle>
                </DialogHeader>

                <div className="flex-1 overflow-auto px-6 py-4 bg-slate-50">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                            <Loader2 className="animate-spin mb-3" size={28} />
                            <p className="font-bold">Loading report…</p>
                        </div>
                    )}

                    {!loading && error && (
                        <div className="flex flex-col items-center justify-center py-20 text-red-600">
                            <AlertTriangle className="mb-3" size={28} />
                            <p className="font-bold">{error}</p>
                            <button onClick={load} className="mt-3 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold">Retry</button>
                        </div>
                    )}

                    {!loading && !error && data && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            {/* Company / report header */}
                            <div className="flex justify-between items-start border-b border-slate-300 pb-3 mb-4">
                                <div>
                                    <div className="text-lg font-black text-slate-900">{company?.companyName || company?.name || 'No active company'}</div>
                                    {company?.address && <div className="text-xs text-slate-500">{company.address}</div>}
                                    <div className="text-xs text-slate-500">
                                        {company?.gstin ? `GSTIN: ${company.gstin}` : ''}
                                        {company?.stateName ? `   State: ${company.stateCode || ''}-${company.stateName}` : ''}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-base font-black text-slate-900">{descriptor.title}</div>
                                    {(fromDate || toDate) && (
                                        <div className="text-xs text-slate-500">
                                            {fromDate} {toDate && toDate !== fromDate ? `to ${toDate}` : ''}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Summary band */}
                            <div className="flex flex-wrap gap-x-8 gap-y-2 mb-4">
                                {summary.map((s) => (
                                    <div key={s.label}>
                                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{s.label}</div>
                                        <div className="text-sm font-black text-slate-900">{formatCell(s.value, s.type)}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Table */}
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr className="bg-slate-100">
                                        {cols.map((c) => (
                                            <th key={c.key} className={`px-2 py-2 font-bold text-slate-600 border-b-2 border-slate-200 ${alignCls(c.type)}`}>{c.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 && (
                                        <tr><td colSpan={cols.length} className="text-center py-8 text-slate-400 italic">No records for the selected period.</td></tr>
                                    )}
                                    {rows.map((r, i) => (
                                        <tr key={i} className={i % 2 ? 'bg-white' : 'bg-slate-50/50'}>
                                            {cols.map((c) => (
                                                <td key={c.key} className={`px-2 py-1.5 text-slate-700 border-b border-slate-100 ${alignCls(c.type)}`}>{formatCell(r[c.key], c.type)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Action bar */}
                <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-white">
                    <button
                        onClick={() => runPdf(openReportPdf, 'open')}
                        disabled={!data || !!busy}
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
                    >
                        {busy === 'open' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} Open PDF
                    </button>
                    <button
                        onClick={() => runPdf(saveReportPdf, 'save')}
                        disabled={!data || !!busy}
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2"
                    >
                        {busy === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Save PDF
                    </button>
                    <button
                        onClick={() => runPdf(printReportPdf, 'print')}
                        disabled={!data || !!busy}
                        className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2"
                    >
                        {busy === 'print' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Print
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
