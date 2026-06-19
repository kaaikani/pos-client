"use client";
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { FileText, Download, Printer, Loader2, AlertTriangle, Calendar, Search, Eye } from 'lucide-react';
import { getReport, formatCell } from '../../core/reports/report-registry';
import { PosActiveCompanyQuery } from '../../core/queries/company.query';
import { openReportPdf, saveReportPdf, printReportPdf } from '../../core/reports/report-pdf';
import ReportPreviewModal from './ReportPreviewModal';

/** YYYY-MM-DD for the first day of the current month / today (client clock). */
function defaultRange() {
    const now = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

/**
 * THE single, registry-driven report screen for every report
 * (Sales / Purchase / Stock / Expense / Day Book).
 *
 * One backend source of truth: the in-page table, the Preview modal, and the
 * Open/Save/Print PDFs all render the SAME server-aggregated payload fetched
 * here once. No localStorage, no browser-side total recomputation — the search
 * box only filters which already-fetched rows are shown (presentation only;
 * the summary band always reflects backend period totals).
 */
export default function StandardReportScreen({ reportId }) {
    const descriptor = getReport(reportId);
    const [{ from, to }, setRange] = useState(defaultRange);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);
    const [company, setCompany] = useState(null);
    const [busy, setBusy] = useState('');
    const [search, setSearch] = useState('');
    const [previewOpen, setPreviewOpen] = useState(false);

    const load = useCallback(async () => {
        if (!descriptor) return;
        setLoading(true);
        setError('');
        try {
            const [reportData, activeCompany] = await Promise.all([
                descriptor.runQuery(from, to),
                new PosActiveCompanyQuery().execute().catch(() => null),
            ]);
            setData(reportData);
            setCompany(activeCompany);
        } catch (e) {
            setError(e?.message || 'Failed to load report.');
        } finally {
            setLoading(false);
        }
    }, [descriptor, from, to]);

    useEffect(() => { load(); }, [load]);

    const runPdf = async (fn, tag) => {
        if (!data) return;
        setBusy(tag);
        try { await fn(descriptor, data, company, from, to); }
        catch (e) { setError(e?.message || 'PDF generation failed.'); }
        finally { setBusy(''); }
    };

    const cols = descriptor?.columns || [];
    const allRows = useMemo(() => (data ? descriptor.buildRows(data) : []), [data, descriptor]);
    const rows = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return allRows;
        return allRows.filter((r) => cols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(s)));
    }, [allRows, search, cols]);
    const summary = data ? descriptor.buildSummary(data) : [];
    const alignCls = (type) => (type === 'money' || type === 'number' ? 'text-right' : 'text-left');

    if (!descriptor) return <div className="p-8 text-slate-500 font-bold">Unknown report.</div>;

    return (
        <div className="flex flex-col h-[85vh] bg-slate-50 rounded-xl overflow-hidden font-sans border border-slate-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 shrink-0 flex items-center justify-between">
                <div>
                    <h1 className="text-white text-xl font-black flex items-center gap-2"><FileText size={22} /> {descriptor.title}</h1>
                    <p className="text-slate-400 text-xs font-bold mt-0.5">Server-aggregated · one source for screen · preview · PDF</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setPreviewOpen(true)} disabled={!data || !!busy} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 font-black text-xs uppercase tracking-widest disabled:opacity-50">
                        <Eye size={14} /> Preview
                    </button>
                    <button onClick={() => runPdf(openReportPdf, 'open')} disabled={!data || !!busy} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 font-black text-xs uppercase tracking-widest disabled:opacity-50">
                        {busy === 'open' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Open PDF
                    </button>
                    <button onClick={() => runPdf(saveReportPdf, 'save')} disabled={!data || !!busy} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 font-black text-xs uppercase tracking-widest disabled:opacity-50">
                        {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Save PDF
                    </button>
                    <button onClick={() => runPdf(printReportPdf, 'print')} disabled={!data || !!busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center gap-2 font-black text-xs uppercase tracking-widest disabled:opacity-50">
                        {busy === 'print' ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Print
                    </button>
                </div>
            </div>

            {/* Filter bar */}
            <div className="px-5 py-3 bg-white border-b border-slate-200 shrink-0 flex items-center gap-3 flex-wrap">
                {descriptor.needsDateRange && (<>
                    <Calendar size={16} className="text-slate-500" />
                    <input type="date" value={from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="px-2 py-1.5 border border-slate-300 rounded-md text-sm font-bold outline-none" title="From" />
                    <span className="text-slate-500 font-bold">to</span>
                    <input type="date" value={to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="px-2 py-1.5 border border-slate-300 rounded-md text-sm font-bold outline-none" title="To" />
                    <button onClick={load} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-md text-sm font-bold">Apply</button>
                    <span className="text-slate-300">|</span>
                </>)}
                <div className="relative">
                    <Search size={14} className="absolute left-2 top-2.5 text-slate-500" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rows…" className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-sm font-bold w-64 outline-none focus:border-emerald-500" />
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-5">
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500"><Loader2 className="animate-spin mb-3" size={28} /><p className="font-bold">Loading report…</p></div>
                )}
                {!loading && error && (
                    <div className="flex flex-col items-center justify-center py-20 text-red-600"><AlertTriangle className="mb-3" size={28} /><p className="font-bold">{error}</p><button onClick={load} className="mt-3 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold">Retry</button></div>
                )}
                {!loading && !error && data && (
                    <div className="space-y-3">
                        {/* Summary cards (always backend period totals) */}
                        <div className="flex flex-wrap gap-3">
                            {summary.map((s) => (
                                <div key={s.label} className="bg-white border border-slate-200 rounded-lg p-3 min-w-[130px]">
                                    <p className="text-[10px] font-black uppercase text-slate-500">{s.label}</p>
                                    <p className="text-lg font-black text-slate-900">{formatCell(s.value, s.type)}</p>
                                </div>
                            ))}
                        </div>
                        {/* Table */}
                        <div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
                            <table className="w-full text-[12px]">
                                <thead className="bg-[#1a5276] text-white">
                                    <tr>
                                        {cols.map((c) => (
                                            <th key={c.key} className={`px-3 py-2 font-black uppercase tracking-wider ${alignCls(c.type)}`}>{c.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr><td colSpan={cols.length} className="py-12 text-center text-slate-500 font-bold">{allRows.length === 0 ? 'No records for the selected period.' : 'No rows match your search.'}</td></tr>
                                    ) : rows.map((r, i) => (
                                        <tr key={i} className="border-b border-slate-200 hover:bg-blue-50">
                                            {cols.map((c) => (
                                                <td key={c.key} className={`px-3 py-1.5 font-bold text-slate-700 ${alignCls(c.type)}`}>{formatCell(r[c.key], c.type)}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Shared preview modal — fed the SAME payload (no re-fetch) */}
            <ReportPreviewModal
                open={previewOpen}
                onOpenChange={setPreviewOpen}
                reportId={reportId}
                fromDate={from}
                toDate={to}
                preloadedData={data}
                preloadedCompany={company}
            />
        </div>
    );
}
