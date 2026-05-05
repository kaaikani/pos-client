"use client";
import React, { useState, useEffect } from 'react';
import { PackageOpen, Truck, Save, Plus, Trash2 } from 'lucide-react';

const KEY = 'pharma_inwards';

export default function InwardModule() {
    const [list, setList] = useState([]);
    const [form, setForm] = useState({ inwardNo: '', date: new Date().toISOString().split('T')[0], source: 'Supplier', sourceName: '', vehicle: '', driver: '', remarks: '' });
    const [items, setItems] = useState([{ name: '', qty: '', unit: 'Pcs', condition: 'Good' }]);

    useEffect(() => {
        try { setList(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {}
        setForm(p => ({ ...p, inwardNo: 'IN-' + Math.floor(Math.random()*9000+1000) }));
    }, []);

    const updateItem = (i, field, val) => setItems(p => p.map((x, idx) => idx === i ? { ...x, [field]: val } : x));
    const addItem = () => setItems(p => [...p, { name: '', qty: '', unit: 'Pcs', condition: 'Good' }]);
    const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i));

    const save = () => {
        const valid = items.filter(it => it.name && parseFloat(it.qty) > 0);
        if (!valid.length) return alert('Add at least one item.');
        if (!form.sourceName.trim()) return alert('Source name required.');
        const entry = { id: 'IN-' + Date.now(), ...form, items: valid, createdAt: new Date().toISOString() };
        const all = [entry, ...list];
        localStorage.setItem(KEY, JSON.stringify(all));
        setList(all);
        alert(`✓ Inward ${form.inwardNo} recorded.`);
        setForm({ inwardNo: 'IN-' + Math.floor(Math.random()*9000+1000), date: new Date().toISOString().split('T')[0], source: 'Supplier', sourceName: '', vehicle: '', driver: '', remarks: '' });
        setItems([{ name: '', qty: '', unit: 'Pcs', condition: 'Good' }]);
    };

    return (<div className="flex flex-col h-[85vh] bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-700 to-purple-700 px-6 py-4">
            <h1 className="text-white text-xl font-black flex items-center gap-2"><Truck size={22}/> Inward Register</h1>
            <p className="text-purple-100 text-xs font-bold mt-0.5">Record incoming goods (vehicle, driver, source, condition)</p>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4">
            <div className="bg-white rounded-xl border-2 border-indigo-200 p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div><label className="text-[10px] font-black uppercase text-indigo-700 block mb-1">Inward No</label><input value={form.inwardNo} onChange={e=>setForm({...form, inwardNo: e.target.value})} className="w-full px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500"/></div>
                <div><label className="text-[10px] font-black uppercase text-indigo-700 block mb-1">Date</label><input type="date" value={form.date} onChange={e=>setForm({...form, date: e.target.value})} className="w-full px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500"/></div>
                <div><label className="text-[10px] font-black uppercase text-indigo-700 block mb-1">Source Type</label>
                    <select value={form.source} onChange={e=>setForm({...form, source: e.target.value})} className="w-full px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500">
                        <option>Supplier</option><option>Branch Transfer</option><option>Customer Return</option><option>Production</option><option>Other</option>
                    </select>
                </div>
                <div><label className="text-[10px] font-black uppercase text-indigo-700 block mb-1">Source Name *</label><input value={form.sourceName} onChange={e=>setForm({...form, sourceName: e.target.value})} placeholder="e.g. ABC Suppliers" className="w-full px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500"/></div>
                <div><label className="text-[10px] font-black uppercase text-indigo-700 block mb-1">Vehicle No</label><input value={form.vehicle} onChange={e=>setForm({...form, vehicle: e.target.value.toUpperCase()})} placeholder="TN 01 AB 1234" className="w-full px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500"/></div>
                <div><label className="text-[10px] font-black uppercase text-indigo-700 block mb-1">Driver Name</label><input value={form.driver} onChange={e=>setForm({...form, driver: e.target.value})} className="w-full px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500"/></div>
                <div className="col-span-2"><label className="text-[10px] font-black uppercase text-indigo-700 block mb-1">Remarks</label><input value={form.remarks} onChange={e=>setForm({...form, remarks: e.target.value})} className="w-full px-3 py-2 border-2 border-indigo-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500"/></div>
            </div>

            <div className="bg-white rounded-xl border-2 border-indigo-200 overflow-hidden">
                <div className="bg-indigo-100 px-4 py-2 flex items-center justify-between">
                    <h3 className="font-black text-indigo-900 text-sm uppercase tracking-widest flex items-center gap-2"><PackageOpen size={14}/> Inward Items</h3>
                    <button onClick={addItem} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-black flex items-center gap-1"><Plus size={12}/> Add</button>
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-indigo-50 border-y border-indigo-200">
                        <tr>
                            <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase text-indigo-700">Item Name</th>
                            <th className="px-3 py-1.5 text-right text-[10px] font-black uppercase text-indigo-700 w-24">Qty</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase text-indigo-700 w-24">Unit</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-black uppercase text-indigo-700 w-32">Condition</th>
                            <th className="w-10"></th>
                        </tr>
                    </thead>
                    <tbody>{items.map((it, i) => (<tr key={i} className="border-b border-indigo-100">
                        <td className="p-0"><input value={it.name} onChange={e=>updateItem(i, 'name', e.target.value)} className="w-full h-9 px-3 text-sm font-black outline-none focus:bg-yellow-50"/></td>
                        <td className="p-0"><input type="number" value={it.qty} onChange={e=>updateItem(i, 'qty', e.target.value)} className="w-full h-9 px-2 text-sm font-black outline-none focus:bg-yellow-50 text-right"/></td>
                        <td className="p-0"><select value={it.unit} onChange={e=>updateItem(i, 'unit', e.target.value)} className="w-full h-9 px-2 text-xs font-bold outline-none bg-white">
                            <option>Pcs</option><option>Box</option><option>Kg</option><option>Litre</option><option>Pack</option><option>Carton</option>
                        </select></td>
                        <td className="p-0"><select value={it.condition} onChange={e=>updateItem(i, 'condition', e.target.value)} className={`w-full h-9 px-2 text-xs font-black outline-none ${it.condition === 'Good' ? 'text-emerald-700' : it.condition === 'Damaged' ? 'text-red-700' : 'text-amber-700'}`}>
                            <option>Good</option><option>Damaged</option><option>Partial</option><option>To Inspect</option>
                        </select></td>
                        <td className="text-center">{items.length > 1 && <button onClick={()=>removeItem(i)} className="text-red-500 hover:text-red-700"><Trash2 size={14}/></button>}</td>
                    </tr>))}</tbody>
                </table>
            </div>

            <button onClick={save} className="w-full py-3 bg-gradient-to-r from-indigo-700 to-purple-700 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg"><Save size={16}/> Save Inward Entry</button>

            {list.length > 0 && (<div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
                <div className="bg-indigo-100 px-4 py-2 font-black text-indigo-900 text-sm uppercase tracking-widest">Recent Inward Entries ({list.length})</div>
                <div className="divide-y divide-indigo-100">{list.slice(0,10).map(e => (<div key={e.id} className="px-4 py-2 hover:bg-indigo-50/50 flex items-center gap-4 text-sm">
                    <span className="font-black text-indigo-700 w-24">{e.inwardNo}</span>
                    <span className="font-bold text-slate-700 w-24">{e.date}</span>
                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-black uppercase">{e.source}</span>
                    <span className="font-black text-slate-900 flex-1 truncate">{e.sourceName}</span>
                    <span className="text-slate-700 text-xs">{e.vehicle || '—'}</span>
                    <span className="font-black text-indigo-700">{e.items.length} items</span>
                </div>))}</div>
            </div>)}
        </div>
    </div>);
}
