"use client";
import React, { useState, useEffect } from 'react';
import { Undo2, Plus, Trash2, Save, Search } from 'lucide-react';
import { ListItemsQuery } from '../../core/queries/pharma.query';

const KEY = 'pharma_purchase_returns';

export default function PurchaseReturnModule() {
    const [items, setItems] = useState([]);
    const [returns, setReturns] = useState([]);
    const [retNo, setRetNo] = useState('');
    const [retDate, setRetDate] = useState(new Date().toISOString().split('T')[0]);
    const [supplier, setSupplier] = useState('');
    const [reason, setReason] = useState('Damaged');
    const [refInvNo, setRefInvNo] = useState('');
    const [rows, setRows] = useState([{ itemCode: '', itemName: '', batchNo: '', qty: '', rate: '', amount: '0.00' }]);

    useEffect(() => {
        new ListItemsQuery().execute().then(setItems).catch(()=>{});
        try { setReturns(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {}
        setRetNo('PR-' + Math.floor(Math.random()*9000+1000));
    }, []);

    const addRow = () => setRows(p => [...p, { itemCode: '', itemName: '', batchNo: '', qty: '', rate: '', amount: '0.00' }]);
    const removeRow = (i) => setRows(p => p.filter((_, idx) => idx !== i));
    const updateRow = (i, field, val) => setRows(p => p.map((r, idx) => {
        if (idx !== i) return r;
        const u = { ...r, [field]: val };
        const q = parseFloat(u.qty) || 0, ra = parseFloat(u.rate) || 0;
        u.amount = (q * ra).toFixed(2);
        return u;
    }));
    const pickItem = (i, code) => {
        const it = items.find(x => x.code === code);
        if (!it) { updateRow(i, 'itemCode', code); return; }
        setRows(p => p.map((r, idx) => idx === i ? { ...r, itemCode: it.code, itemName: it.itemName, rate: String(it.purchaseRate || it.salesRate || 0) } : r));
    };

    const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

    const save = () => {
        const valid = rows.filter(r => r.itemName && parseFloat(r.qty) > 0);
        if (!valid.length) return alert('Add at least one returned item.');
        if (!supplier.trim()) return alert('Supplier name required.');
        const entry = { id: 'PR-' + Date.now(), retNo, retDate, supplier, reason, refInvNo, rows: valid, total, createdAt: new Date().toISOString() };
        const list = [entry, ...returns];
        localStorage.setItem(KEY, JSON.stringify(list));
        setReturns(list);
        alert(`✓ Purchase return ${retNo} saved (₹${total.toFixed(2)}).`);
        setRows([{ itemCode: '', itemName: '', batchNo: '', qty: '', rate: '', amount: '0.00' }]);
        setSupplier(''); setRefInvNo(''); setReason('Damaged');
        setRetNo('PR-' + Math.floor(Math.random()*9000+1000));
    };

    return (<div className="flex flex-col h-[85vh] bg-gradient-to-br from-rose-50 to-orange-50 rounded-xl border border-rose-200 overflow-hidden">
        <div className="bg-gradient-to-r from-rose-700 to-orange-700 px-6 py-4">
            <h1 className="text-white text-xl font-black flex items-center gap-2"><Undo2 size={22}/> Purchase Return</h1>
            <p className="text-orange-100 text-xs font-bold mt-0.5">Return goods to suppliers (damaged / wrong / expired)</p>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Form Header */}
            <div className="bg-white rounded-xl border-2 border-rose-200 p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div><label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Return No</label><input value={retNo} onChange={e=>setRetNo(e.target.value)} className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-sm font-bold outline-none focus:border-rose-500"/></div>
                <div><label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Date</label><input type="date" value={retDate} onChange={e=>setRetDate(e.target.value)} className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-sm font-bold outline-none focus:border-rose-500"/></div>
                <div><label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Supplier *</label><input value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="e.g. Durga Traders" className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-sm font-bold outline-none focus:border-rose-500"/></div>
                <div><label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Ref Invoice No</label><input value={refInvNo} onChange={e=>setRefInvNo(e.target.value)} placeholder="Original PO/Invoice" className="w-full px-3 py-2 border-2 border-rose-200 rounded-lg text-sm font-bold outline-none focus:border-rose-500"/></div>
                <div className="col-span-2 lg:col-span-4"><label className="text-[10px] font-black uppercase text-rose-700 block mb-1">Reason</label>
                    <div className="flex flex-wrap gap-2">
                        {['Damaged','Wrong Item','Expired','Quality Issue','Other'].map(r => (
                            <button key={r} onClick={()=>setReason(r)} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest border-2 transition ${reason === r ? 'bg-rose-600 border-rose-800 text-white' : 'bg-white border-rose-200 text-rose-700 hover:border-rose-400'}`}>{r}</button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Items grid */}
            <div className="bg-white rounded-xl border-2 border-rose-200 overflow-hidden">
                <div className="bg-rose-100 px-4 py-2 flex items-center justify-between">
                    <h3 className="font-black text-rose-900 text-sm uppercase tracking-widest">Returned Items</h3>
                    <button onClick={addRow} className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-black flex items-center gap-1"><Plus size={12}/> Add Row</button>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-rose-50 border-y border-rose-200">
                        <tr>
                            <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase text-rose-700 w-24">Code</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase text-rose-700">Item Name</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase text-rose-700 w-32">Batch</th>
                            <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-rose-700 w-24">Qty</th>
                            <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-rose-700 w-28">Rate</th>
                            <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-rose-700 w-28">Amount</th>
                            <th className="w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (<tr key={i} className="border-b border-rose-100">
                            <td className="p-0"><input value={r.itemCode} onChange={e=>updateRow(i,'itemCode',e.target.value)} onBlur={e=>pickItem(i, e.target.value)} className="w-full h-8 px-2 text-sm font-black outline-none focus:bg-yellow-50 text-center"/></td>
                            <td className="p-0"><input value={r.itemName} onChange={e=>updateRow(i,'itemName',e.target.value)} className="w-full h-8 px-2 text-sm font-black outline-none focus:bg-yellow-50"/></td>
                            <td className="p-0"><input value={r.batchNo} onChange={e=>updateRow(i,'batchNo',e.target.value)} className="w-full h-8 px-2 text-sm font-bold outline-none focus:bg-yellow-50"/></td>
                            <td className="p-0"><input type="number" value={r.qty} onChange={e=>updateRow(i,'qty',e.target.value)} className="w-full h-8 px-2 text-sm font-black outline-none focus:bg-yellow-50 text-right"/></td>
                            <td className="p-0"><input type="number" value={r.rate} onChange={e=>updateRow(i,'rate',e.target.value)} className="w-full h-8 px-2 text-sm font-bold outline-none focus:bg-yellow-50 text-right"/></td>
                            <td className="px-3 py-1.5 text-right font-black text-rose-700">₹{r.amount}</td>
                            <td className="text-center">{rows.length > 1 && <button onClick={()=>removeRow(i)} className="text-red-500 hover:text-red-700"><Trash2 size={14}/></button>}</td>
                        </tr>))}
                    </tbody>
                    <tfoot className="bg-rose-100 border-t-2 border-rose-300">
                        <tr><td colSpan={5} className="px-3 py-2 text-right font-black text-rose-900 text-sm uppercase">Total Return Amount</td><td className="px-3 py-2 text-right font-black text-rose-900 text-lg">₹{total.toFixed(2)}</td><td/></tr>
                    </tfoot>
                </table>
            </div>

            <button onClick={save} className="w-full py-3 bg-gradient-to-r from-rose-700 to-orange-700 hover:from-rose-600 hover:to-orange-600 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg">
                <Save size={16}/> Save Purchase Return
            </button>

            {/* Recent returns */}
            {returns.length > 0 && (<div className="bg-white rounded-xl border border-rose-200 overflow-hidden">
                <div className="bg-rose-100 px-4 py-2 font-black text-rose-900 text-sm uppercase tracking-widest">Recent Returns ({returns.length})</div>
                <table className="w-full text-sm">
                    <thead className="bg-rose-50"><tr>
                        <th className="px-3 py-1.5 text-left text-[10px] font-black text-rose-700 uppercase">Return No</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-black text-rose-700 uppercase">Date</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-black text-rose-700 uppercase">Supplier</th>
                        <th className="px-3 py-1.5 text-left text-[10px] font-black text-rose-700 uppercase">Reason</th>
                        <th className="px-3 py-1.5 text-right text-[10px] font-black text-rose-700 uppercase">Amount</th>
                    </tr></thead>
                    <tbody>{returns.slice(0, 10).map(r => (<tr key={r.id} className="border-b border-rose-100 hover:bg-rose-50/30">
                        <td className="px-3 py-1.5 font-black text-rose-700">{r.retNo}</td>
                        <td className="px-3 py-1.5 font-bold text-slate-700">{r.retDate}</td>
                        <td className="px-3 py-1.5 font-bold text-slate-900">{r.supplier}</td>
                        <td className="px-3 py-1.5"><span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-black uppercase">{r.reason}</span></td>
                        <td className="px-3 py-1.5 text-right font-black text-rose-700">₹{r.total.toFixed(2)}</td>
                    </tr>))}</tbody>
                </table>
            </div>)}
        </div>
    </div>);
}
