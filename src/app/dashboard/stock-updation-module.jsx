"use client";
import React, { useState, useEffect } from 'react';
import { Boxes, Save, RefreshCw, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { ListItemsQuery, UpdateItemCommand } from '../../core/queries/pharma.query';

export default function StockUpdationModule() {
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState('');
    const [updates, setUpdates] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => { load(); }, []);
    const load = async () => {
        setLoading(true);
        try { setItems(await new ListItemsQuery().execute()); } catch {}
        setLoading(false);
    };

    const setNew = (id, val) => setUpdates(p => ({ ...p, [id]: val }));
    const adjustment = (it) => {
        const newVal = parseFloat(updates[it.id]);
        if (isNaN(newVal)) return null;
        const cur = parseFloat(it.minStkQty || it.minStock || 0);
        return newVal - cur;
    };

    const saveAll = async () => {
        const ids = Object.keys(updates).filter(id => updates[id] !== '' && !isNaN(parseFloat(updates[id])));
        if (!ids.length) return alert('No changes to save.');
        if (!confirm(`Update stock for ${ids.length} item(s)?`)) return;
        setSaving(true);
        try {
            for (const id of ids) {
                const it = items.find(x => x.id === id);
                if (!it) continue;
                await new UpdateItemCommand().execute(id, {
                    code: it.code, itemName: it.itemName, minStkQty: parseFloat(updates[id]),
                });
            }
            alert(`✓ Stock updated for ${ids.length} item(s).`);
            setUpdates({});
            load();
        } catch (e) { alert(e.message); }
        setSaving(false);
    };

    const filtered = items.filter(it => {
        const s = search.trim().toLowerCase();
        if (!s) return true;
        return (it.itemName || '').toLowerCase().includes(s) || String(it.code).toLowerCase().includes(s);
    });

    return (<div className="flex flex-col h-[85vh] bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl border border-teal-200 overflow-hidden">
        <div className="bg-gradient-to-r from-teal-700 to-cyan-700 px-6 py-4 flex items-center justify-between">
            <div>
                <h1 className="text-white text-xl font-black flex items-center gap-2"><Boxes size={22}/> Stock Updation</h1>
                <p className="text-cyan-100 text-xs font-bold mt-0.5">Bulk update item stock quantities • Vendure-backed</p>
            </div>
            <div className="flex gap-2">
                <button onClick={load} className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-2 text-xs font-black uppercase"><RefreshCw size={14}/> Reload</button>
                <button onClick={saveAll} disabled={saving} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 text-xs font-black uppercase shadow-lg">
                    <Save size={14}/> {saving ? 'Saving...' : `Save ${Object.keys(updates).length || 'All'}`}
                </button>
            </div>
        </div>

        <div className="p-4 bg-white border-b border-teal-200 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3 top-3 text-teal-600"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search code / item..." className="w-full pl-9 pr-3 py-2 border-2 border-teal-200 rounded-lg text-sm font-bold outline-none focus:border-teal-500 bg-teal-50/30"/>
            </div>
            <span className="ml-auto text-[11px] font-black text-teal-700">{Object.keys(updates).filter(k => updates[k] !== '').length} pending changes</span>
        </div>

        <div className="flex-1 overflow-auto p-4">
            <div className="bg-white rounded-xl border border-teal-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gradient-to-r from-teal-100 to-cyan-100">
                        <tr>
                            <th className="px-4 py-2 text-left font-black text-teal-900 uppercase text-[10px] tracking-widest">Code</th>
                            <th className="px-4 py-2 text-left font-black text-teal-900 uppercase text-[10px] tracking-widest">Item Name</th>
                            <th className="px-4 py-2 text-left font-black text-teal-900 uppercase text-[10px] tracking-widest">Brand</th>
                            <th className="px-4 py-2 text-right font-black text-teal-900 uppercase text-[10px] tracking-widest">Current Stock</th>
                            <th className="px-4 py-2 text-center font-black text-teal-900 uppercase text-[10px] tracking-widest">New Stock</th>
                            <th className="px-4 py-2 text-center font-black text-teal-900 uppercase text-[10px] tracking-widest">Adjustment</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (<tr><td colSpan={6} className="py-12 text-center font-bold text-teal-700">Loading...</td></tr>)
                         : filtered.length === 0 ? (<tr><td colSpan={6} className="py-12 text-center font-bold text-slate-500">No items match.</td></tr>)
                         : filtered.map(it => {
                            const adj = adjustment(it);
                            return (<tr key={it.id} className="border-b border-teal-100 hover:bg-teal-50/40">
                                <td className="px-4 py-1.5 font-black text-teal-700">{it.code}</td>
                                <td className="px-4 py-1.5 font-black text-slate-900">{it.itemName}</td>
                                <td className="px-4 py-1.5 font-bold text-slate-700">{it.brand || '—'}</td>
                                <td className="px-4 py-1.5 text-right font-black text-slate-900">{it.minStkQty || it.minStock || 0}</td>
                                <td className="px-4 py-0.5">
                                    <input type="number" value={updates[it.id] ?? ''} onChange={e=>setNew(it.id, e.target.value)} placeholder="—" className="w-full px-2 py-1 border-2 border-teal-200 rounded text-right font-black bg-yellow-50 focus:border-teal-500 outline-none text-sm"/>
                                </td>
                                <td className="px-4 py-1.5 text-center">
                                    {adj == null ? <span className="text-slate-400">—</span>
                                     : adj > 0 ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-black text-xs"><TrendingUp size={11}/>+{adj}</span>
                                     : adj < 0 ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-700 font-black text-xs"><TrendingDown size={11}/>{adj}</span>
                                     : <span className="text-slate-400 font-bold">No change</span>}
                                </td>
                            </tr>);
                         })}
                    </tbody>
                </table>
            </div>
        </div>
    </div>);
}
