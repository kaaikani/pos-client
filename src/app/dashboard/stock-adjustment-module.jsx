"use client";
import React, { useState, useEffect, useCallback } from 'react';
import { usePageFocus } from '../../components/pos';
import { Sliders, Save, AlertCircle, Plus, Minus, Loader2, RefreshCw } from 'lucide-react';
import {
    ListItemsQuery,
    ListStockAdjustmentsQuery,
    CreateStockAdjustmentCommand,
} from '../../core/queries/pos.query';

/**
 * Stock Adjustment — server-backed (BUG-001, BUG-003).
 *
 * Previously this module wrote to localStorage only, so adjustments never
 * reached the database and never moved real stock. It now calls
 * `createPosStockAdjustment`, which runs `writeLedger()` inside a DB
 * transaction: it writes a PosStockLedger movement, updates
 * PosItemStockSnapshot.currentStock, and fills previousQty/resultingQty.
 *
 * One mutation per line is required — the server input takes a single
 * itemCode. Lines are submitted sequentially so a mid-way server rejection
 * (e.g. negative stock when allowNegativeStock=false) leaves the earlier
 * lines committed and is reported precisely, rather than failing opaquely.
 */

/** On-hand stock. `minStock` is the REORDER LEVEL and must never be used here (BUG-003). */
const onHand = (item) => {
    const v = item?.currentStock ?? item?.minStkQty;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const REASONS = ['Damaged', 'Lost', 'Found', 'Breakage', 'Theft', 'Expired', 'Opening Stock', 'Other'];

/** ADJ-YYYYMMDD-HHMMSS-<n> — unique per line, readable in the ledger. */
const makeAdjNo = (seq) => {
    const d = new Date();
    const p = (n, w = 2) => String(n).padStart(w, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return `ADJ-${stamp}-${seq}`;
};

export default function StockAdjustmentModule() {
    const searchRef = usePageFocus();

    const [items, setItems] = useState([]);
    const [logs, setLogs] = useState([]);
    const [search, setSearch] = useState('');
    const [adjustments, setAdjustments] = useState({}); // { [itemId]: { qty, type, reason } }
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [banner, setBanner] = useState(null); // { kind: 'ok'|'err', text }

    const loadAll = useCallback(async () => {
        setLoading(true);
        const [itemList, logList] = await Promise.all([
            new ListItemsQuery().execute().catch((e) => { console.error('Item load failed:', e); return []; }),
            new ListStockAdjustmentsQuery().execute().catch((e) => { console.error('Adjustment log load failed:', e); return []; }),
        ]);
        setItems(itemList || []);
        setLogs(logList || []);
        setLoading(false);
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const setAdj = (id, key, val) =>
        setAdjustments((p) => ({ ...p, [id]: { ...(p[id] || {}), [key]: val } }));

    const save = async () => {
        if (saving) return;
        const entries = Object.entries(adjustments).filter(
            ([, v]) => v && v.qty !== '' && Number(v.qty) > 0,
        );
        if (!entries.length) {
            setBanner({ kind: 'err', text: 'No adjustments entered. Enter a quantity greater than 0 on at least one item.' });
            return;
        }

        // Resolve every line to an item BEFORE sending anything, so a bad row
        // cannot leave a half-applied batch behind.
        const lines = [];
        for (const [id, a] of entries) {
            const it = items.find((x) => String(x.id) === String(id));
            if (!it || !it.code) {
                setBanner({ kind: 'err', text: `Item id ${id} could not be resolved to an item code. Nothing was saved.` });
                return;
            }
            lines.push({ item: it, qty: Number(a.qty), type: a.type === 'decrease' ? 'REDUCE' : 'ADD', reason: a.reason || '' });
        }

        setSaving(true);
        setBanner(null);
        const done = [];
        try {
            const adjDate = new Date().toISOString().split('T')[0];
            for (let i = 0; i < lines.length; i++) {
                const ln = lines[i];
                await new CreateStockAdjustmentCommand().execute({
                    adjNo: makeAdjNo(i + 1),
                    adjDate,
                    itemCode: String(ln.item.code),
                    adjustQty: ln.qty,
                    adjType: ln.type,
                    atPrice: Number(ln.item.purchaseRate) || 0,
                    reason: ln.reason || (ln.type === 'ADD' ? 'Stock added' : 'Stock reduced'),
                    details: `${ln.item.itemName} · ${ln.type === 'ADD' ? '+' : '-'}${ln.qty}`,
                });
                done.push(ln.item.itemName);
            }
            setAdjustments({});
            setBanner({ kind: 'ok', text: `${done.length} adjustment${done.length > 1 ? 's' : ''} saved and stock updated.` });
        } catch (err) {
            // The server rejects the whole line atomically, so anything in
            // `done` is committed and anything after it is not. Say so exactly.
            const applied = done.length ? ` ${done.length} earlier line(s) were saved: ${done.join(', ')}.` : ' Nothing was saved.';
            setBanner({ kind: 'err', text: `${err.message}${applied}` });
        } finally {
            setSaving(false);
            await loadAll(); // re-read stock and the log from the server
        }
    };

    const filtered = items.filter((it) => {
        const s = search.trim().toLowerCase();
        if (!s) return true;
        return (it.itemName || '').toLowerCase().includes(s) || String(it.code).toLowerCase().includes(s);
    });

    const pendingCount = Object.values(adjustments).filter((v) => v && v.qty !== '' && Number(v.qty) > 0).length;

    return (<div className="flex flex-col h-[85vh] bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border border-amber-200 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-700 to-yellow-700 px-6 py-4 flex items-center justify-between">
            <div>
                <h1 className="text-white text-xl font-black flex items-center gap-2"><Sliders size={22}/> Stock Adjustment</h1>
                <p className="text-yellow-100 text-xs font-bold mt-0.5">Record stock differences (damage, loss, found, breakage, etc.) — saved to the server and applied to real stock</p>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={loadAll} disabled={loading || saving} title="Reload stock and log from server"
                    className="px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg flex items-center gap-2 text-xs font-black uppercase disabled:opacity-50">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh
                </button>
                <button onClick={save} disabled={saving || loading || pendingCount === 0}
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/40 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 text-xs font-black uppercase shadow-lg">
                    {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                    {saving ? 'Saving…' : `Save Adjustments${pendingCount ? ` (${pendingCount})` : ''}`}
                </button>
            </div>
        </div>

        {banner && (
            <div className={`px-6 py-2.5 text-xs font-bold flex items-start gap-2 ${banner.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-red-50 text-red-800 border-b border-red-200'}`}>
                <AlertCircle size={14} className="mt-0.5 shrink-0"/>
                <span className="flex-1">{banner.text}</span>
                <button onClick={() => setBanner(null)} className="opacity-60 hover:opacity-100 font-black">✕</button>
            </div>
        )}

        <div className="p-4 bg-white border-b border-amber-200">
            <input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search item by name or code..." className="w-full max-w-md px-4 py-2 border-2 border-amber-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500"/>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
            {loading && <p className="text-center text-amber-700 font-bold py-8 flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin"/> Loading items…</p>}
            {!loading && filtered.length === 0 && <p className="text-center text-amber-700 font-bold py-8">No items match this search.</p>}
            {!loading && filtered.slice(0, 50).map(it => {
                const a = adjustments[it.id] || {};
                const cur = onHand(it);
                const adj = Number(a.qty) || 0;
                const isDecrease = a.type === 'decrease';
                const result = isDecrease ? cur - adj : cur + adj;
                const wouldGoNegative = isDecrease && adj > 0 && result < 0;
                return (<div key={it.id} className={`bg-white rounded-lg border p-3 flex items-center gap-3 hover:shadow-md transition ${wouldGoNegative ? 'border-red-300 ring-1 ring-red-200' : 'border-amber-200'}`}>
                    <div className="w-12 h-12 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-black text-lg shrink-0">{it.code}</div>
                    <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-900 truncate">{it.itemName}</p>
                        <p className="text-[11px] font-bold text-amber-700">
                            Current: {cur}{adj > 0 && <> → <span className={wouldGoNegative ? 'text-red-600' : 'text-emerald-700'}>{result}</span></>}
                            {wouldGoNegative && <span className="text-red-600 ml-2">· exceeds available stock</span>}
                            {!it.isStockBased && <span className="text-slate-400 ml-2">· not stock-tracked</span>}
                        </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button onClick={()=>setAdj(it.id, 'type', 'increase')} title="Increase stock" className={`w-8 h-8 rounded flex items-center justify-center font-black ${(a.type || 'increase') === 'increase' ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}><Plus size={14}/></button>
                        <button onClick={()=>setAdj(it.id, 'type', 'decrease')} title="Decrease stock" className={`w-8 h-8 rounded flex items-center justify-center font-black ${isDecrease ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700 border border-red-200'}`}><Minus size={14}/></button>
                    </div>
                    <input type="number" min="0" step="any" value={a.qty || ''} onChange={e=>setAdj(it.id, 'qty', e.target.value)} placeholder="Qty" className="w-20 px-2 py-1.5 border-2 border-amber-200 rounded text-right font-black bg-yellow-50 focus:border-amber-500 outline-none text-sm"/>
                    <select value={a.reason || ''} onChange={e=>setAdj(it.id, 'reason', e.target.value)} className="w-40 px-2 py-1.5 border-2 border-amber-200 rounded text-xs font-bold outline-none focus:border-amber-500">
                        <option value="">Reason...</option>
                        {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>);
            })}
        </div>

        {logs.length > 0 && (<div className="border-t-2 border-amber-300 bg-amber-50 max-h-48 overflow-auto">
            <div className="px-4 py-2 font-black text-amber-900 text-xs uppercase tracking-widest flex items-center gap-2"><AlertCircle size={14}/> Recent Adjustments — from server ({logs.length})</div>
            <div className="divide-y divide-amber-200 px-4 pb-3">
                {logs.slice(0, 8).map(l => (<div key={l.id} className="py-1 text-xs flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded font-black uppercase ${l.adjType === 'ADD' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{l.adjType === 'ADD' ? '+' : '-'}{l.adjustQty}</span>
                    <span className="font-black text-slate-900 flex-1 truncate">{l.details || l.itemCode}</span>
                    <span className="text-slate-500 font-bold whitespace-nowrap">{l.previousQty} → {l.resultingQty}</span>
                    <span className="text-amber-700 font-bold whitespace-nowrap">{l.reason}</span>
                    <span className="text-slate-500 text-[10px] whitespace-nowrap">{l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : l.adjDate}</span>
                </div>))}
            </div>
        </div>)}
    </div>);
}
