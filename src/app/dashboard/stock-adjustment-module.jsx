"use client";
import React, { useState, useEffect } from 'react';
import { Sliders, Save, AlertCircle, Plus, Minus } from 'lucide-react';
import { ListItemsQuery } from '../../core/queries/pharma.query';

const KEY = 'pharma_stock_adjustments';

export default function StockAdjustmentModule() {
    const [items, setItems] = useState([]);
    const [logs, setLogs] = useState([]);
    const [search, setSearch] = useState('');
    const [adjustments, setAdjustments] = useState({}); // {itemId: {qty, type, reason}}

    useEffect(() => {
        new ListItemsQuery().execute().then(setItems).catch(()=>{});
        try { setLogs(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {}
    }, []);

    const setAdj = (id, key, val) => setAdjustments(p => ({ ...p, [id]: { ...(p[id] || {}), [key]: val } }));

    const save = () => {
        const entries = Object.entries(adjustments).filter(([,v]) => v.qty && parseFloat(v.qty) > 0);
        if (!entries.length) return alert('No adjustments entered.');
        const newLogs = entries.map(([id, a]) => {
            const it = items.find(x => x.id === id);
            return {
                id: 'ADJ-' + Date.now() + '-' + id,
                itemId: id, itemCode: it?.code, itemName: it?.itemName,
                qty: parseFloat(a.qty), type: a.type || 'increase', reason: a.reason || 'Manual adjustment',
                date: new Date().toISOString(),
            };
        });
        const all = [...newLogs, ...logs];
        localStorage.setItem(KEY, JSON.stringify(all));
        setLogs(all);
        setAdjustments({});
        alert(`✓ ${newLogs.length} stock adjustment(s) recorded.`);
    };

    const filtered = items.filter(it => {
        const s = search.trim().toLowerCase();
        if (!s) return true;
        return (it.itemName || '').toLowerCase().includes(s) || String(it.code).toLowerCase().includes(s);
    });

    return (<div className="flex flex-col h-[85vh] bg-gradient-to-br from-amber-50 to-yellow-50 rounded-xl border border-amber-200 overflow-hidden">
        <div className="bg-gradient-to-r from-amber-700 to-yellow-700 px-6 py-4 flex items-center justify-between">
            <div>
                <h1 className="text-white text-xl font-black flex items-center gap-2"><Sliders size={22}/> Stock Adjustment</h1>
                <p className="text-yellow-100 text-xs font-bold mt-0.5">Record stock differences (damage, loss, found, breakage, etc.)</p>
            </div>
            <button onClick={save} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg flex items-center gap-2 text-xs font-black uppercase shadow-lg"><Save size={14}/> Save Adjustments</button>
        </div>

        <div className="p-4 bg-white border-b border-amber-200">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search item..." className="w-full max-w-md px-4 py-2 border-2 border-amber-200 rounded-lg text-sm font-bold outline-none focus:border-amber-500"/>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3">
            {filtered.length === 0 && <p className="text-center text-amber-700 font-bold py-8">No items.</p>}
            {filtered.slice(0, 50).map(it => {
                const a = adjustments[it.id] || {};
                const cur = parseFloat(it.minStkQty || it.minStock || 0);
                const adj = parseFloat(a.qty) || 0;
                const result = a.type === 'decrease' ? cur - adj : cur + adj;
                return (<div key={it.id} className="bg-white rounded-lg border border-amber-200 p-3 flex items-center gap-3 hover:shadow-md transition">
                    <div className="w-12 h-12 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-black text-lg shrink-0">{it.code}</div>
                    <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-900 truncate">{it.itemName}</p>
                        <p className="text-[11px] font-bold text-amber-700">Current: {cur} {a.qty && `→ ${result}`}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                        <button onClick={()=>setAdj(it.id, 'type', 'increase')} title="Increase stock" className={`w-8 h-8 rounded flex items-center justify-center font-black ${(a.type || 'increase') === 'increase' ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}><Plus size={14}/></button>
                        <button onClick={()=>setAdj(it.id, 'type', 'decrease')} title="Decrease stock" className={`w-8 h-8 rounded flex items-center justify-center font-black ${a.type === 'decrease' ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700 border border-red-200'}`}><Minus size={14}/></button>
                    </div>
                    <input type="number" value={a.qty || ''} onChange={e=>setAdj(it.id, 'qty', e.target.value)} placeholder="Qty" className="w-20 px-2 py-1.5 border-2 border-amber-200 rounded text-right font-black bg-yellow-50 focus:border-amber-500 outline-none text-sm"/>
                    <select value={a.reason || ''} onChange={e=>setAdj(it.id, 'reason', e.target.value)} className="w-40 px-2 py-1.5 border-2 border-amber-200 rounded text-xs font-bold outline-none focus:border-amber-500">
                        <option value="">Reason...</option>
                        <option>Damaged</option><option>Lost</option><option>Found</option>
                        <option>Breakage</option><option>Theft</option><option>Expired</option><option>Other</option>
                    </select>
                </div>);
            })}
        </div>

        {logs.length > 0 && (<div className="border-t-2 border-amber-300 bg-amber-50 max-h-48 overflow-auto">
            <div className="px-4 py-2 font-black text-amber-900 text-xs uppercase tracking-widest flex items-center gap-2"><AlertCircle size={14}/> Recent Adjustment Log ({logs.length})</div>
            <div className="divide-y divide-amber-200 px-4 pb-3">
                {logs.slice(0, 8).map(l => (<div key={l.id} className="py-1 text-xs flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded font-black uppercase ${l.type === 'increase' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{l.type === 'increase' ? '+' : '-'}{l.qty}</span>
                    <span className="font-black text-slate-900 flex-1">{l.itemName}</span>
                    <span className="text-amber-700 font-bold">{l.reason}</span>
                    <span className="text-slate-500 text-[10px]">{new Date(l.date).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                </div>))}
            </div>
        </div>)}
    </div>);
}
