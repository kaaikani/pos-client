"use client";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Undo2, Save, Search, Loader2, AlertCircle, ArrowLeft, FileText, RefreshCw } from 'lucide-react';
import {
    ListPurchaseReturnsQuery,
    CreatePurchaseReturnCommand,
    SearchPurchasesForReturnQuery,
} from '../../core/queries/pharma.query';

/**
 * Purchase Return — server-backed (BUG-002).
 *
 * Previously this module wrote to localStorage only, so returns never reached
 * the database and never moved stock. It now calls `createPosPurchaseReturn`.
 *
 * The flow is source-bill-driven because the server REQUIRES it —
 * PharmaService.createPurchaseReturn() rejects any input without
 * `originalPurchaseId` ("Free-form Purchase Returns are not allowed"). The
 * server additionally:
 *   · overwrites puRate from the original purchase row,
 *   · caps returnQty at (original qty+freeQty) minus already-returned qty,
 *   · rejects any item that was not on the original purchase,
 *   · rejects a duplicate retNo,
 *   · decrements stock through writeLedger() inside one transaction.
 * The remaining-qty shown here is a client-side convenience; the server is
 * the authority and will refuse anything over the cap.
 */

const REASONS = ['Damaged', 'Wrong Item', 'Expired', 'Quality Issue', 'Short Supply', 'Other'];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const rowCode = (r) => String(r?.itemCode || r?.code || '').trim();
/** Original purchases and prior returns both count free qty toward the cap. */
const rowQty = (r) => num(r?.qty) + num(r?.freeQty);

const makeRetNo = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `PR-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export default function PurchaseReturnModule() {
    const [returns, setReturns] = useState([]);
    const [loadingReturns, setLoadingReturns] = useState(true);

    // Step 1 — find the source purchase
    const [searchSupplier, setSearchSupplier] = useState('');
    const [searchItem, setSearchItem] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);

    // Step 2 — return against the picked purchase
    const [source, setSource] = useState(null);
    const [retNo, setRetNo] = useState('');
    const [retDate, setRetDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [reason, setReason] = useState('Damaged');
    const [qtyByCode, setQtyByCode] = useState({});
    const [saving, setSaving] = useState(false);
    const [banner, setBanner] = useState(null); // { kind: 'ok'|'err', text }

    const loadReturns = useCallback(async () => {
        setLoadingReturns(true);
        const list = await new ListPurchaseReturnsQuery().execute()
            .catch((e) => { console.error('Purchase return list failed:', e); return []; });
        setReturns(list || []);
        setLoadingReturns(false);
    }, []);

    useEffect(() => { loadReturns(); }, [loadReturns]);

    /** Qty already returned per item code, for the currently picked purchase. */
    const alreadyReturned = useMemo(() => {
        const map = new Map();
        if (!source) return map;
        for (const r of returns) {
            if (String(r.originalPurchaseId) !== String(source.id)) continue;
            for (const rr of (r.rows || [])) {
                const c = rowCode(rr);
                if (!c) continue;
                map.set(c, (map.get(c) || 0) + rowQty(rr));
            }
        }
        return map;
    }, [returns, source]);

    const doSearch = async () => {
        if (searching) return;
        setSearching(true);
        setBanner(null);
        try {
            const list = await new SearchPurchasesForReturnQuery().execute({
                supplier: searchSupplier.trim() || undefined,
                itemCode: searchItem.trim() || undefined,
                limit: 25,
            });
            setResults(list);
            setSearched(true);
        } catch (err) {
            setBanner({ kind: 'err', text: `Search failed: ${err.message}` });
        } finally {
            setSearching(false);
        }
    };

    const pickSource = (purchase) => {
        setSource(purchase);
        setQtyByCode({});
        setRetNo(makeRetNo());
        setRetDate(new Date().toISOString().split('T')[0]);
        setReason('Damaged');
        setBanner(null);
    };

    const clearSource = () => { setSource(null); setQtyByCode({}); setBanner(null); };

    const sourceRows = source?.rows || [];

    const lines = useMemo(() => sourceRows.map((r) => {
        const code = rowCode(r);
        const original = rowQty(r);
        const returned = alreadyReturned.get(code) || 0;
        const remaining = Math.max(0, original - returned);
        const entered = num(qtyByCode[code]);
        const rate = num(r.puRate) || num(r.costRate);
        return {
            code,
            name: r.itemName || r.description || code,
            unit: r.unit || '',
            original,
            returned,
            remaining,
            entered,
            rate,
            amount: entered * rate,
            over: entered > remaining,
        };
    }), [sourceRows, alreadyReturned, qtyByCode]);

    const selected = lines.filter((l) => l.entered > 0);
    const totalAmount = selected.reduce((s, l) => s + l.amount, 0);
    const hasOver = selected.some((l) => l.over);

    const setQty = (code, remaining, val) => {
        if (val === '') { setQtyByCode((p) => ({ ...p, [code]: '' })); return; }
        const n = Number(val);
        if (!Number.isFinite(n) || n < 0) return;
        // Clamp in the UI; the server enforces the same cap authoritatively.
        setQtyByCode((p) => ({ ...p, [code]: String(Math.min(n, remaining)) }));
    };

    const save = async () => {
        if (saving || !source) return;
        if (!selected.length) { setBanner({ kind: 'err', text: 'Enter a return quantity on at least one line.' }); return; }
        if (hasOver) { setBanner({ kind: 'err', text: 'One or more lines exceed the remaining returnable quantity.' }); return; }
        if (!retNo.trim()) { setBanner({ kind: 'err', text: 'Return Number is required.' }); return; }
        if (!String(source.supplier || '').trim()) { setBanner({ kind: 'err', text: 'The source purchase has no supplier — it cannot be returned against.' }); return; }

        setSaving(true);
        setBanner(null);
        try {
            const saved = await new CreatePurchaseReturnCommand().execute({
                retNo: retNo.trim(),
                retDate,
                originalPurchaseId: Number(source.id),
                supplier: source.supplier,
                address: source.address || '',
                // puRate is required by row validation and is then overwritten by
                // the server from the original purchase — send the original rate.
                // `unit` is passed through unchanged so it matches what was already
                // validated when the purchase was created.
                rows: selected.map((l) => ({
                    itemCode: l.code,
                    itemName: l.name,
                    qty: l.entered,
                    puRate: l.rate,
                    ...(l.unit ? { unit: l.unit } : {}),
                    amount: l.amount,
                })),
                totalAmount,
                totalDisc: 0,
                totalTax: 0,
                netAmount: totalAmount,
                reason,
            });
            setBanner({ kind: 'ok', text: `Purchase return ${saved.retNo} saved — ₹${num(saved.netAmount).toFixed(2)} returned and stock reduced.` });
            clearSource();
            setResults([]);
            setSearched(false);
            await loadReturns();
        } catch (err) {
            setBanner({ kind: 'err', text: err.message });
        } finally {
            setSaving(false);
        }
    };

    return (<div className="flex flex-col h-[85vh] bg-gradient-to-br from-rose-50 to-orange-50 rounded-xl border border-rose-200 overflow-hidden">
        <div className="bg-gradient-to-r from-rose-700 to-orange-700 px-6 py-4 flex items-center justify-between">
            <div>
                <h1 className="text-white text-xl font-black flex items-center gap-2"><Undo2 size={22}/> Purchase Return</h1>
                <p className="text-orange-100 text-xs font-bold mt-0.5">Return goods against an original purchase bill — saved to the server and applied to real stock</p>
            </div>
            <button onClick={loadReturns} disabled={loadingReturns} title="Reload returns from server"
                className="px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg flex items-center gap-2 text-xs font-black uppercase disabled:opacity-50">
                <RefreshCw size={14} className={loadingReturns ? 'animate-spin' : ''}/> Refresh
            </button>
        </div>

        {banner && (
            <div className={`px-6 py-2.5 text-xs font-bold flex items-start gap-2 ${banner.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-red-50 text-red-800 border-b border-red-200'}`}>
                <AlertCircle size={14} className="mt-0.5 shrink-0"/>
                <span className="flex-1">{banner.text}</span>
                <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100 font-black">✕</button>
            </div>
        )}

        <div className="flex-1 overflow-auto p-4 space-y-4">

            {/* ── STEP 1 · pick the source purchase ── */}
            {!source && (<>
                <div className="bg-white rounded-xl border-2 border-rose-200 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="w-6 h-6 rounded-full bg-rose-600 text-white text-[11px] font-black flex items-center justify-center">1</span>
                        <h3 className="font-black text-rose-900 text-sm uppercase tracking-widest">Find the original purchase</h3>
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 mb-3">A purchase return must be raised against the bill the goods came in on. This is enforced by the server — free-form returns are rejected.</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Supplier</label>
                            <input value={searchSupplier} onChange={e=>setSearchSupplier(e.target.value)} onKeyDown={e=>{ if (e.key === 'Enter') doSearch(); }} placeholder="e.g. Durga Traders" className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-sm font-bold outline-none focus:border-rose-500"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Item Code</label>
                            <input value={searchItem} onChange={e=>setSearchItem(e.target.value)} onKeyDown={e=>{ if (e.key === 'Enter') doSearch(); }} placeholder="Optional" className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-sm font-bold outline-none focus:border-rose-500"/>
                        </div>
                        <div className="flex items-end">
                            <button onClick={doSearch} disabled={searching} className="w-full py-2 bg-rose-700 hover:bg-rose-600 disabled:bg-rose-700/50 text-white rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                                {searching ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>} Search Purchases
                            </button>
                        </div>
                    </div>
                </div>

                {searched && (
                    <div className="bg-white rounded-xl border-2 border-rose-200 overflow-hidden">
                        <div className="bg-rose-100 px-4 py-2 font-black text-rose-900 text-sm uppercase tracking-widest">Matching Purchases ({results.length})</div>
                        {results.length === 0 ? (
                            <p className="p-6 text-center text-slate-500 font-bold text-sm">No purchases found. Widen the search, or leave both fields blank to list the most recent bills.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-rose-50"><tr>
                                        <th className="px-3 py-2 text-left text-[10px] font-black text-rose-700 uppercase">Purchase No</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-black text-rose-700 uppercase">Date</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-black text-rose-700 uppercase">Invoice</th>
                                        <th className="px-3 py-2 text-left text-[10px] font-black text-rose-700 uppercase">Supplier</th>
                                        <th className="px-3 py-2 text-right text-[10px] font-black text-rose-700 uppercase">Items</th>
                                        <th className="px-3 py-2 text-right text-[10px] font-black text-rose-700 uppercase">Net</th>
                                        <th className="w-24"></th>
                                    </tr></thead>
                                    <tbody>{results.map(p => (<tr key={p.id} className="border-b border-rose-100 hover:bg-rose-50/40">
                                        <td className="px-3 py-2 font-black text-rose-700">{p.purNo}</td>
                                        <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">{p.purDate}</td>
                                        <td className="px-3 py-2 font-bold text-slate-700">{p.invNo || '—'}</td>
                                        <td className="px-3 py-2 font-bold text-slate-900">{p.supplier}</td>
                                        <td className="px-3 py-2 text-right font-bold text-slate-700">{(p.rows || []).length}</td>
                                        <td className="px-3 py-2 text-right font-black text-rose-700">₹{num(p.netAmount).toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right"><button onClick={()=>pickSource(p)} className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-[11px] font-black uppercase">Return</button></td>
                                    </tr>))}</tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </>)}

            {/* ── STEP 2 · enter the return ── */}
            {source && (<>
                <div className="bg-white rounded-xl border-2 border-rose-200 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-rose-600 text-white text-[11px] font-black flex items-center justify-center">2</span>
                            <h3 className="font-black text-rose-900 text-sm uppercase tracking-widest">Return against {source.purNo}</h3>
                        </div>
                        <button onClick={clearSource} className="px-3 py-1.5 border-2 border-rose-200 hover:border-rose-400 text-rose-700 rounded-lg text-[11px] font-black uppercase flex items-center gap-1.5"><ArrowLeft size={13}/> Change bill</button>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-bold text-slate-600 mb-4 pb-3 border-b border-rose-100">
                        <span><FileText size={11} className="inline mb-0.5"/> Invoice <b className="text-slate-900">{source.invNo || '—'}</b></span>
                        <span>Date <b className="text-slate-900">{source.purDate}</b></span>
                        <span>Supplier <b className="text-slate-900">{source.supplier}</b></span>
                        {source.supplierGstin && <span>GSTIN <b className="text-slate-900">{source.supplierGstin}</b></span>}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div><label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Return No *</label><input value={retNo} onChange={e=>setRetNo(e.target.value)} className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-sm font-bold outline-none focus:border-rose-500"/></div>
                        <div><label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Date</label><input type="date" value={retDate} onChange={e=>setRetDate(e.target.value)} className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-sm font-bold outline-none focus:border-rose-500"/></div>
                        <div className="col-span-2"><label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Reason</label>
                            <div className="flex flex-wrap gap-2">
                                {REASONS.map(r => (
                                    <button key={r} onClick={()=>setReason(r)} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border-2 transition ${reason === r ? 'bg-rose-600 border-rose-800 text-white' : 'bg-white border-rose-200 text-rose-700 hover:border-rose-400'}`}>{r}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border-2 border-rose-200 overflow-hidden">
                    <div className="bg-rose-100 px-4 py-2 font-black text-rose-900 text-sm uppercase tracking-widest">Items on this bill — enter what is going back</div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-rose-50 border-y border-rose-200"><tr>
                                <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase text-rose-700 w-24">Code</th>
                                <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase text-rose-700">Item Name</th>
                                <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-rose-700 w-24">Purchased</th>
                                <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-rose-700 w-24">Returned</th>
                                <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-rose-700 w-24">Remaining</th>
                                <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-rose-700 w-28">Return Qty</th>
                                <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-rose-700 w-28">Rate</th>
                                <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-rose-700 w-28">Amount</th>
                            </tr></thead>
                            <tbody>
                                {lines.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500 font-bold">This purchase has no item rows.</td></tr>}
                                {lines.map((l) => (<tr key={l.code} className={`border-b border-rose-100 ${l.remaining === 0 ? 'opacity-50' : ''}`}>
                                    <td className="px-3 py-1.5 font-black text-slate-700 text-center">{l.code}</td>
                                    <td className="px-3 py-1.5 font-black text-slate-900">{l.name}{l.unit && <span className="ml-1.5 text-[10px] font-bold text-slate-400 uppercase">{l.unit}</span>}</td>
                                    <td className="px-3 py-1.5 text-right font-bold text-slate-700">{l.original}</td>
                                    <td className="px-3 py-1.5 text-right font-bold text-slate-500">{l.returned || '—'}</td>
                                    <td className="px-3 py-1.5 text-right font-black text-emerald-700">{l.remaining}</td>
                                    <td className="p-0">
                                        <input type="number" min="0" max={l.remaining} step="any" disabled={l.remaining === 0}
                                            value={qtyByCode[l.code] ?? ''}
                                            onChange={e=>setQty(l.code, l.remaining, e.target.value)}
                                            className="w-full h-8 px-2 text-sm font-black outline-none text-right focus:bg-yellow-50 disabled:bg-slate-50 disabled:cursor-not-allowed"/>
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-bold text-slate-700">₹{l.rate.toFixed(2)}</td>
                                    <td className="px-3 py-1.5 text-right font-black text-rose-700">₹{l.amount.toFixed(2)}</td>
                                </tr>))}
                            </tbody>
                            <tfoot className="bg-rose-100 border-t-2 border-rose-300">
                                <tr><td colSpan={7} className="px-3 py-2 text-right font-black text-rose-900 text-sm uppercase">Total Return Amount</td><td className="px-3 py-2 text-right font-black text-rose-900 text-lg">₹{totalAmount.toFixed(2)}</td></tr>
                            </tfoot>
                        </table>
                    </div>
                    <p className="px-4 py-2 text-[10px] font-bold text-slate-500 bg-slate-50 border-t border-rose-100">Rate is taken from the original purchase and cannot be changed — the server enforces it.</p>
                </div>

                <button onClick={save} disabled={saving || selected.length === 0 || hasOver}
                    className="w-full py-3 bg-gradient-to-r from-rose-700 to-orange-700 hover:from-rose-600 hover:to-orange-600 disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg">
                    {saving ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                    {saving ? 'Saving…' : `Save Purchase Return${selected.length ? ` · ${selected.length} item${selected.length > 1 ? 's' : ''} · ₹${totalAmount.toFixed(2)}` : ''}`}
                </button>
            </>)}

            {/* ── Recent returns, from the server ── */}
            <div className="bg-white rounded-xl border border-rose-200 overflow-hidden">
                <div className="bg-rose-100 px-4 py-2 font-black text-rose-900 text-sm uppercase tracking-widest flex items-center gap-2">
                    Recent Returns — from server ({returns.length})
                    {loadingReturns && <Loader2 size={13} className="animate-spin"/>}
                </div>
                {returns.length === 0 && !loadingReturns ? (
                    <p className="p-6 text-center text-slate-500 font-bold text-sm">No purchase returns recorded yet.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-rose-50"><tr>
                                <th className="px-3 py-1.5 text-left text-[10px] font-black text-rose-700 uppercase">Return No</th>
                                <th className="px-3 py-1.5 text-left text-[10px] font-black text-rose-700 uppercase">Date</th>
                                <th className="px-3 py-1.5 text-left text-[10px] font-black text-rose-700 uppercase">Supplier</th>
                                <th className="px-3 py-1.5 text-right text-[10px] font-black text-rose-700 uppercase">Src Bill</th>
                                <th className="px-3 py-1.5 text-left text-[10px] font-black text-rose-700 uppercase">Reason</th>
                                <th className="px-3 py-1.5 text-right text-[10px] font-black text-rose-700 uppercase">Amount</th>
                            </tr></thead>
                            <tbody>{returns.slice(0, 10).map(r => (<tr key={r.id} className="border-b border-rose-100 hover:bg-rose-50/30">
                                <td className="px-3 py-1.5 font-black text-rose-700">{r.retNo}</td>
                                <td className="px-3 py-1.5 font-bold text-slate-700 whitespace-nowrap">{r.retDate}</td>
                                <td className="px-3 py-1.5 font-bold text-slate-900">{r.supplier}</td>
                                <td className="px-3 py-1.5 text-right font-bold text-slate-500">#{r.originalPurchaseId ?? '—'}</td>
                                <td className="px-3 py-1.5"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-black uppercase">{r.reason || '—'}</span></td>
                                <td className="px-3 py-1.5 text-right font-black text-rose-700">₹{num(r.netAmount).toFixed(2)}</td>
                            </tr>))}</tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    </div>);
}
