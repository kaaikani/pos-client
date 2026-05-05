"use client";
import React, { useState, useEffect } from 'react';
import { ListChecks, Search, Download, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import { ListPurchasesQuery } from '../../core/queries/pharma.query';

export default function PurchaseListModule() {
    const [purchases, setPurchases] = useState([]);
    const [search, setSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [expanded, setExpanded] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        new ListPurchasesQuery().execute().then(p => { setPurchases(p); setLoading(false); }).catch(()=>setLoading(false));
    }, []);

    const filtered = purchases.filter(p => {
        const s = search.trim().toLowerCase();
        if (from || to) {
            const d = new Date(p.purDate || p.createdAt);
            if (from && d < new Date(from)) return false;
            if (to && d > new Date(to + 'T23:59:59')) return false;
        }
        if (!s) return true;
        return (p.purNo && String(p.purNo).toLowerCase().includes(s))
            || (p.invNo && String(p.invNo).toLowerCase().includes(s))
            || (p.supplier && p.supplier.toLowerCase().includes(s));
    });

    const totals = filtered.reduce((acc, p) => ({
        count: acc.count + 1,
        amount: acc.amount + (p.totalAmount || 0),
        net: acc.net + (p.netAmount || 0),
        items: acc.items + (p.rows || []).filter(r => r.itemName).length,
    }), { count: 0, amount: 0, net: 0, items: 0 });

    const exportCSV = () => {
        const csv = "PurNo,InvNo,Date,Supplier,Items,Total,Tax,Discount,Net\n" +
            filtered.map(p => `${p.purNo},${p.invNo||''},${p.purDate},${p.supplier||''},${(p.rows||[]).filter(r=>r.itemName).length},${p.totalAmount||0},${p.totalTax||0},${p.totalDiscA||0},${p.netAmount||0}`).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'purchase-list.csv'; a.click();
    };

    return (<div className="flex flex-col h-[85vh] bg-gradient-to-br from-cyan-50 to-sky-50 rounded-xl border border-cyan-200 overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-700 to-sky-700 px-6 py-4 flex items-center justify-between">
            <div>
                <h1 className="text-white text-xl font-black flex items-center gap-2"><ListChecks size={22}/> Purchase List</h1>
                <p className="text-cyan-100 text-xs font-bold mt-0.5">All purchase entries — search, filter, drill-down</p>
            </div>
            <button onClick={exportCSV} className="px-5 py-2 bg-white/15 hover:bg-white/25 text-white rounded-lg flex items-center gap-2 text-xs font-black uppercase"><Download size={14}/> CSV</button>
        </div>

        <div className="p-4 bg-white border-b border-cyan-200 grid grid-cols-4 gap-3">
            <div className="bg-cyan-50 rounded-lg p-2.5 text-center"><p className="text-[10px] font-black uppercase text-cyan-700">Entries</p><p className="text-2xl font-black text-cyan-900">{totals.count}</p></div>
            <div className="bg-emerald-50 rounded-lg p-2.5 text-center"><p className="text-[10px] font-black uppercase text-emerald-700">Total Items</p><p className="text-2xl font-black text-emerald-900">{totals.items}</p></div>
            <div className="bg-blue-50 rounded-lg p-2.5 text-center"><p className="text-[10px] font-black uppercase text-blue-700">Gross</p><p className="text-2xl font-black text-blue-900">₹{totals.amount.toLocaleString()}</p></div>
            <div className="bg-violet-50 rounded-lg p-2.5 text-center"><p className="text-[10px] font-black uppercase text-violet-700">Net</p><p className="text-2xl font-black text-violet-900">₹{totals.net.toLocaleString()}</p></div>
        </div>

        <div className="px-4 py-2 bg-white border-b border-cyan-200 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-2.5 text-cyan-600"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pur No / Inv / Supplier..." className="w-full pl-9 pr-3 py-1.5 border-2 border-cyan-200 rounded-lg text-sm font-bold outline-none focus:border-cyan-500"/>
            </div>
            <Calendar size={14} className="text-cyan-700"/>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="px-2 py-1.5 border-2 border-cyan-200 rounded text-sm font-bold outline-none focus:border-cyan-500"/>
            <span className="text-cyan-700 font-bold text-xs">to</span>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="px-2 py-1.5 border-2 border-cyan-200 rounded text-sm font-bold outline-none focus:border-cyan-500"/>
            <button onClick={()=>{setSearch('');setFrom('');setTo('');}} className="text-xs font-black text-cyan-700 hover:text-cyan-900">Clear</button>
        </div>

        <div className="flex-1 overflow-auto p-4">
            <div className="bg-white rounded-xl border-2 border-cyan-200 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-cyan-100"><tr>
                        <th className="px-3 py-2 w-8"></th>
                        <th className="px-3 py-2 text-left font-black text-cyan-900 uppercase text-[10px] tracking-widest">Pur No</th>
                        <th className="px-3 py-2 text-left font-black text-cyan-900 uppercase text-[10px] tracking-widest">Inv No</th>
                        <th className="px-3 py-2 text-left font-black text-cyan-900 uppercase text-[10px] tracking-widest">Date</th>
                        <th className="px-3 py-2 text-left font-black text-cyan-900 uppercase text-[10px] tracking-widest">Supplier</th>
                        <th className="px-3 py-2 text-right font-black text-cyan-900 uppercase text-[10px] tracking-widest">Items</th>
                        <th className="px-3 py-2 text-right font-black text-cyan-900 uppercase text-[10px] tracking-widest">Total</th>
                        <th className="px-3 py-2 text-right font-black text-cyan-900 uppercase text-[10px] tracking-widest">Net</th>
                    </tr></thead>
                    <tbody>{loading ? (<tr><td colSpan={8} className="py-12 text-center font-bold text-cyan-700">Loading...</td></tr>)
                        : filtered.length === 0 ? (<tr><td colSpan={8} className="py-12 text-center font-bold text-slate-500">No purchase entries.</td></tr>)
                        : filtered.map((p, i) => {
                        const key = (p.id || p.purNo) + '_' + i;
                        const exp = expanded === key;
                        return (<React.Fragment key={key}>
                            <tr onClick={()=>setExpanded(exp ? null : key)} className={`cursor-pointer border-b border-cyan-100 ${exp ? 'bg-yellow-50' : 'hover:bg-cyan-50/40'}`}>
                                <td className="px-3 py-1.5 text-cyan-600">{exp ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
                                <td className="px-3 py-1.5 font-black text-cyan-700">{p.purNo}</td>
                                <td className="px-3 py-1.5 font-bold text-slate-700">{p.invNo || '—'}</td>
                                <td className="px-3 py-1.5 font-bold text-slate-700">{p.purDate}</td>
                                <td className="px-3 py-1.5 font-bold text-slate-900">{p.supplier || '—'}</td>
                                <td className="px-3 py-1.5 text-right font-black text-slate-900">{(p.rows||[]).filter(r=>r.itemName).length}</td>
                                <td className="px-3 py-1.5 text-right font-bold text-slate-700">₹{(p.totalAmount||0).toLocaleString()}</td>
                                <td className="px-3 py-1.5 text-right font-black text-emerald-700">₹{(p.netAmount||0).toLocaleString()}</td>
                            </tr>
                            {exp && (<tr><td colSpan={8} className="bg-cyan-50/30 px-6 py-3 border-b border-cyan-200">
                                <table className="w-full text-xs"><thead className="bg-white"><tr>
                                    <th className="px-2 py-1 text-left font-black text-cyan-700">Code</th>
                                    <th className="px-2 py-1 text-left font-black text-cyan-700">Item</th>
                                    <th className="px-2 py-1 text-left font-black text-cyan-700">Batch</th>
                                    <th className="px-2 py-1 text-right font-black text-cyan-700">Qty</th>
                                    <th className="px-2 py-1 text-right font-black text-cyan-700">Rate</th>
                                    <th className="px-2 py-1 text-right font-black text-cyan-700">Amount</th>
                                </tr></thead><tbody>{(p.rows||[]).filter(r=>r.itemName).map((r,j)=>(<tr key={j} className="border-b border-cyan-100">
                                    <td className="px-2 py-1 font-bold">{r.itemCode}</td>
                                    <td className="px-2 py-1 font-black">{r.itemName}</td>
                                    <td className="px-2 py-1">{r.batchNo || '—'}</td>
                                    <td className="px-2 py-1 text-right font-bold">{r.qty}</td>
                                    <td className="px-2 py-1 text-right font-bold">₹{parseFloat(r.puRate||0).toFixed(2)}</td>
                                    <td className="px-2 py-1 text-right font-black text-emerald-700">₹{parseFloat(r.amount||0).toFixed(2)}</td>
                                </tr>))}</tbody></table>
                            </td></tr>)}
                        </React.Fragment>);
                    })}</tbody>
                </table>
            </div>
        </div>
    </div>);
}
