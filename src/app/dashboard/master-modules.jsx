"use client";
// Combined master-data modules for Category dropdown options.
// Each module is exported individually and routed from page.jsx.

import React, { useState, useEffect } from 'react';
import { Percent, Receipt, Ruler, Tag, FolderTree, RefreshCw, Users, Plus, Trash2, Save, Edit3, Search, X } from 'lucide-react';
import { ListItemsQuery } from '../../core/queries/pharma.query';

// ── Generic CRUD shell with localStorage persistence ──
function useLocalList(key) {
    const [list, setList] = useState([]);
    useEffect(() => { try { setList(JSON.parse(localStorage.getItem(key) || '[]')); } catch {} }, [key]);
    const persist = (newList) => { localStorage.setItem(key, JSON.stringify(newList)); setList(newList); };
    return [list, persist];
}

// ══════════════════════════════════════════════
// 1. TAX MASTER (red)
// ══════════════════════════════════════════════
export function TaxMasterModule() {
    const [list, set] = useLocalList('master_tax');
    const [form, setForm] = useState({ name: '', percent: '', hsn: '', isInterstate: false });
    const [editId, setEditId] = useState(null);
    const save = () => {
        if (!form.name.trim() || !form.percent) return alert('Name + Percent required.');
        if (editId) { set(list.map(x => x.id === editId ? { ...x, ...form, percent: parseFloat(form.percent) } : x)); setEditId(null); }
        else { set([{ id: 'TAX-' + Date.now(), ...form, percent: parseFloat(form.percent), createdAt: new Date().toISOString() }, ...list]); }
        setForm({ name: '', percent: '', hsn: '', isInterstate: false });
    };
    const edit = (x) => { setEditId(x.id); setForm({ name: x.name, percent: x.percent, hsn: x.hsn || '', isInterstate: !!x.isInterstate }); };
    const del = (id) => { if (confirm('Delete this tax rate?')) set(list.filter(x => x.id !== id)); };
    return (<MasterShell color="red" icon={Percent} title="Tax Master" subtitle="Manage GST / VAT / CGST / SGST tax rates"
        leftForm={(<>
            <FormField color="red" label="Tax Name *" value={form.name} onChange={v=>setForm({...form, name: v})} placeholder="e.g. GST 18%"/>
            <FormField color="red" label="Percent (%) *" type="number" value={form.percent} onChange={v=>setForm({...form, percent: v})} placeholder="18"/>
            <FormField color="red" label="HSN Code" value={form.hsn} onChange={v=>setForm({...form, hsn: v})} placeholder="optional"/>
            <label className="flex items-center gap-2 text-xs font-black text-red-900 cursor-pointer"><input type="checkbox" checked={form.isInterstate} onChange={e=>setForm({...form, isInterstate: e.target.checked})}/> Inter-state (IGST)</label>
            <SaveBtn color="red" onSave={save} editId={editId} onCancel={()=>{setEditId(null);setForm({name:'',percent:'',hsn:'',isInterstate:false});}}/>
        </>)}
        list={(<table className="w-full text-sm"><thead className="bg-red-50"><tr>
            <Th>Name</Th><Th align="right">%</Th><Th>HSN</Th><Th>Type</Th><Th></Th>
        </tr></thead><tbody>{list.map(x => (<tr key={x.id} className="border-b border-red-100 hover:bg-red-50/30">
            <td className="px-3 py-1.5 font-black text-slate-900">{x.name}</td>
            <td className="px-3 py-1.5 text-right font-black text-red-700">{x.percent}%</td>
            <td className="px-3 py-1.5 font-bold text-slate-700">{x.hsn || '—'}</td>
            <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${x.isInterstate ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>{x.isInterstate ? 'IGST' : 'CGST/SGST'}</span></td>
            <td className="px-3 py-1.5 text-right"><RowActions onEdit={()=>edit(x)} onDelete={()=>del(x.id)}/></td>
        </tr>))}{!list.length && <Empty colspan={5} text="No tax rates configured."/>}</tbody></table>)}
    />);
}

// ══════════════════════════════════════════════
// 2. RATE MASTER (blue)
// ══════════════════════════════════════════════
export function RateMasterModule() {
    const [list, set] = useLocalList('master_rate');
    const [form, setForm] = useState({ code: '', name: '', description: '', defaultMultiplier: '1.00' });
    const [editId, setEditId] = useState(null);
    const save = () => {
        if (!form.code.trim() || !form.name.trim()) return alert('Code + Name required.');
        if (editId) { set(list.map(x => x.id === editId ? { ...x, ...form, defaultMultiplier: parseFloat(form.defaultMultiplier) || 1 } : x)); setEditId(null); }
        else { set([{ id: 'RT-' + Date.now(), ...form, defaultMultiplier: parseFloat(form.defaultMultiplier) || 1 }, ...list]); }
        setForm({ code: '', name: '', description: '', defaultMultiplier: '1.00' });
    };
    const edit = (x) => { setEditId(x.id); setForm({ code: x.code, name: x.name, description: x.description || '', defaultMultiplier: String(x.defaultMultiplier) }); };
    return (<MasterShell color="blue" icon={Receipt} title="Rate Master" subtitle="Define rate buckets (A/B/C/D wholesale, retail, special)"
        leftForm={(<>
            <FormField color="blue" label="Code *" value={form.code} onChange={v=>setForm({...form, code: v.toUpperCase()})} placeholder="e.g. ARATE"/>
            <FormField color="blue" label="Name *" value={form.name} onChange={v=>setForm({...form, name: v})} placeholder="e.g. A Rate (Retail)"/>
            <FormField color="blue" label="Description" value={form.description} onChange={v=>setForm({...form, description: v})}/>
            <FormField color="blue" label="Default Multiplier" type="number" value={form.defaultMultiplier} onChange={v=>setForm({...form, defaultMultiplier: v})} placeholder="1.00"/>
            <SaveBtn color="blue" onSave={save} editId={editId} onCancel={()=>{setEditId(null);setForm({code:'',name:'',description:'',defaultMultiplier:'1.00'});}}/>
        </>)}
        list={(<table className="w-full text-sm"><thead className="bg-blue-50"><tr>
            <Th>Code</Th><Th>Name</Th><Th>Description</Th><Th align="right">Multiplier</Th><Th></Th>
        </tr></thead><tbody>{list.map(x => (<tr key={x.id} className="border-b border-blue-100 hover:bg-blue-50/30">
            <td className="px-3 py-1.5 font-black text-blue-700">{x.code}</td>
            <td className="px-3 py-1.5 font-black text-slate-900">{x.name}</td>
            <td className="px-3 py-1.5 font-bold text-slate-700">{x.description || '—'}</td>
            <td className="px-3 py-1.5 text-right font-black text-blue-700">×{x.defaultMultiplier}</td>
            <td className="px-3 py-1.5 text-right"><RowActions onEdit={()=>edit(x)} onDelete={()=>{ if(confirm('Delete?')) set(list.filter(y=>y.id!==x.id)); }}/></td>
        </tr>))}{!list.length && <Empty colspan={5} text="No rate types configured."/>}</tbody></table>)}
    />);
}

// ══════════════════════════════════════════════
// 3. SIZE MASTER (purple)
// ══════════════════════════════════════════════
export function SizeMasterModule() {
    const [list, set] = useLocalList('master_size');
    const [form, setForm] = useState({ size: '', unit: 'kg', baseQty: '1' });
    const save = () => {
        if (!form.size.trim()) return alert('Size required.');
        set([{ id: 'SZ-' + Date.now(), ...form, baseQty: parseFloat(form.baseQty) || 1 }, ...list]);
        setForm({ size: '', unit: 'kg', baseQty: '1' });
    };
    return (<MasterShell color="purple" icon={Ruler} title="Size Master" subtitle="Standard sizes (1/4 kg, 1/2 kg, 1 kg, 250ml, 500ml...)"
        leftForm={(<>
            <FormField color="purple" label="Size Label *" value={form.size} onChange={v=>setForm({...form, size: v})} placeholder="e.g. 1/2 kg"/>
            <div><label className="text-[10px] font-black uppercase text-purple-700 block mb-1">Unit</label>
                <select value={form.unit} onChange={e=>setForm({...form, unit: e.target.value})} className="w-full px-3 py-2 border-2 border-purple-200 rounded-lg text-sm font-bold outline-none focus:border-purple-500">
                    <option>kg</option><option>g</option><option>L</option><option>ml</option><option>pcs</option><option>pack</option>
                </select>
            </div>
            <FormField color="purple" label="Base Qty" type="number" value={form.baseQty} onChange={v=>setForm({...form, baseQty: v})}/>
            <SaveBtn color="purple" onSave={save}/>
        </>)}
        list={(<div className="grid grid-cols-2 gap-2 p-3">{list.map(x => (<div key={x.id} className="bg-white border-2 border-purple-200 rounded-lg p-3 flex items-center justify-between">
            <div><p className="font-black text-slate-900">{x.size}</p><p className="text-[10px] text-purple-700 font-bold">{x.baseQty} {x.unit}</p></div>
            <button onClick={()=>{ if(confirm('Delete?')) set(list.filter(y=>y.id!==x.id)); }} className="text-red-500 hover:text-red-700"><Trash2 size={14}/></button>
        </div>))}{!list.length && <p className="col-span-2 text-center py-8 font-bold text-purple-600">No sizes defined.</p>}</div>)}
    />);
}

// ══════════════════════════════════════════════
// 4. BRAND MASTER (amber)
// ══════════════════════════════════════════════
export function BrandMasterModule() {
    const [list, set] = useLocalList('master_brand');
    const [form, setForm] = useState({ name: '', mfr: '', country: 'India' });
    const save = () => {
        if (!form.name.trim()) return alert('Brand name required.');
        if (list.some(x => x.name.toLowerCase() === form.name.toLowerCase())) return alert('Brand already exists.');
        set([{ id: 'BR-' + Date.now(), ...form }, ...list]);
        setForm({ name: '', mfr: '', country: 'India' });
    };
    return (<MasterShell color="amber" icon={Tag} title="Brand Master" subtitle="Maintain product brands & manufacturers"
        leftForm={(<>
            <FormField color="amber" label="Brand Name *" value={form.name} onChange={v=>setForm({...form, name: v})} placeholder="e.g. Britannia"/>
            <FormField color="amber" label="Manufacturer" value={form.mfr} onChange={v=>setForm({...form, mfr: v})} placeholder="Mfr Co Ltd"/>
            <FormField color="amber" label="Country of Origin" value={form.country} onChange={v=>setForm({...form, country: v})}/>
            <SaveBtn color="amber" onSave={save}/>
        </>)}
        list={(<table className="w-full text-sm"><thead className="bg-amber-50"><tr>
            <Th>Brand</Th><Th>Manufacturer</Th><Th>Origin</Th><Th></Th>
        </tr></thead><tbody>{list.map(x => (<tr key={x.id} className="border-b border-amber-100 hover:bg-amber-50/40">
            <td className="px-3 py-1.5 font-black text-amber-900 flex items-center gap-2"><Tag size={12} className="text-amber-600"/> {x.name}</td>
            <td className="px-3 py-1.5 font-bold text-slate-700">{x.mfr || '—'}</td>
            <td className="px-3 py-1.5 font-bold text-slate-700">{x.country || '—'}</td>
            <td className="px-3 py-1.5 text-right"><button onClick={()=>{if(confirm('Delete?')) set(list.filter(y=>y.id!==x.id));}} className="text-red-500 hover:text-red-700"><Trash2 size={14}/></button></td>
        </tr>))}{!list.length && <Empty colspan={4} text="No brands."/>}</tbody></table>)}
    />);
}

// ══════════════════════════════════════════════
// 5. BRANDWISE RATE UPDATE (emerald)
// ══════════════════════════════════════════════
export function BrandwiseRateUpdateModule() {
    const [items, setItems] = useState([]);
    const [brand, setBrand] = useState('');
    const [pct, setPct] = useState('');
    const [direction, setDirection] = useState('increase');
    const [field, setField] = useState('salesRate');
    const [preview, setPreview] = useState([]);
    useEffect(() => { new ListItemsQuery().execute().then(setItems).catch(()=>{}); }, []);
    const brands = [...new Set(items.map(it => it.brand).filter(Boolean))].sort();
    const calculate = () => {
        if (!brand) return alert('Pick a brand.');
        const p = parseFloat(pct) || 0;
        const f = direction === 'decrease' ? 1 - p/100 : 1 + p/100;
        setPreview(items.filter(it => it.brand === brand).map(it => {
            const cur = parseFloat(it[field]) || 0;
            return { ...it, _cur: cur, _new: +(cur * f).toFixed(2) };
        }));
    };
    return (<MasterShell color="emerald" icon={RefreshCw} title="Brandwise Rate Update" subtitle="Bulk update rates for all items of a brand"
        leftForm={(<>
            <div><label className="text-[10px] font-black uppercase text-emerald-700 block mb-1">Brand *</label>
                <select value={brand} onChange={e=>setBrand(e.target.value)} className="w-full px-3 py-2 border-2 border-emerald-200 rounded-lg text-sm font-bold outline-none focus:border-emerald-500">
                    <option value="">Select brand...</option>{brands.map(b => <option key={b}>{b}</option>)}
                </select>
            </div>
            <div><label className="text-[10px] font-black uppercase text-emerald-700 block mb-1">Rate Field</label>
                <select value={field} onChange={e=>setField(e.target.value)} className="w-full px-3 py-2 border-2 border-emerald-200 rounded-lg text-sm font-bold outline-none focus:border-emerald-500">
                    <option value="salesRate">Sales Rate</option><option value="mrpRate">MRP</option><option value="purchaseRate">Purchase Rate</option>
                </select>
            </div>
            <div className="flex gap-2">
                <button onClick={()=>setDirection('increase')} className={`flex-1 py-2 rounded-lg font-black text-xs uppercase ${direction === 'increase' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200'}`}>↑ Increase</button>
                <button onClick={()=>setDirection('decrease')} className={`flex-1 py-2 rounded-lg font-black text-xs uppercase ${direction === 'decrease' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border-2 border-red-200'}`}>↓ Decrease</button>
            </div>
            <FormField color="emerald" label="Percent (%)" type="number" value={pct} onChange={setPct} placeholder="e.g. 5"/>
            <button onClick={calculate} className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-black text-xs uppercase">Calculate Preview</button>
        </>)}
        list={preview.length === 0
            ? <p className="text-center py-12 text-emerald-700 font-bold">Pick brand + percent → Preview shows here. (Updates are simulated; real API write requires Item Master integration.)</p>
            : (<table className="w-full text-sm"><thead className="bg-emerald-50"><tr>
                <Th>Code</Th><Th>Item</Th><Th align="right">Current</Th><Th align="right">New</Th><Th align="right">Diff</Th>
            </tr></thead><tbody>{preview.map(p => (<tr key={p.id} className="border-b border-emerald-100">
                <td className="px-3 py-1.5 font-black text-emerald-700">{p.code}</td>
                <td className="px-3 py-1.5 font-black text-slate-900">{p.itemName}</td>
                <td className="px-3 py-1.5 text-right text-slate-700">₹{p._cur}</td>
                <td className="px-3 py-1.5 text-right font-black text-emerald-700">₹{p._new}</td>
                <td className={`px-3 py-1.5 text-right font-black ${p._new > p._cur ? 'text-emerald-700' : 'text-red-700'}`}>{(p._new - p._cur).toFixed(2)}</td>
            </tr>))}</tbody></table>)}
    />);
}

// ══════════════════════════════════════════════
// 6. CATEGORYWISE RATE UPDATE (cyan)
// ══════════════════════════════════════════════
export function CategorywiseRateUpdateModule() {
    const [items, setItems] = useState([]);
    const [cat, setCat] = useState('');
    const [pct, setPct] = useState('');
    const [direction, setDirection] = useState('increase');
    const [preview, setPreview] = useState([]);
    useEffect(() => { new ListItemsQuery().execute().then(setItems).catch(()=>{}); }, []);
    const cats = [...new Set(items.map(it => it.category).filter(Boolean))].sort();
    const calc = () => {
        if (!cat) return alert('Pick a category.');
        const p = parseFloat(pct) || 0;
        const f = direction === 'decrease' ? 1 - p/100 : 1 + p/100;
        setPreview(items.filter(it => it.category === cat).map(it => ({
            ...it, _cur: parseFloat(it.salesRate) || 0, _new: +(((parseFloat(it.salesRate) || 0) * f)).toFixed(2)
        })));
    };
    return (<MasterShell color="cyan" icon={FolderTree} title="Categorywise Rate Update" subtitle="Adjust sales rate for an entire product category"
        leftForm={(<>
            <div><label className="text-[10px] font-black uppercase text-cyan-700 block mb-1">Category *</label>
                <select value={cat} onChange={e=>setCat(e.target.value)} className="w-full px-3 py-2 border-2 border-cyan-200 rounded-lg text-sm font-bold outline-none focus:border-cyan-500">
                    <option value="">Select...</option>{cats.map(c => <option key={c}>{c}</option>)}
                </select>
            </div>
            <div className="flex gap-2">
                <button onClick={()=>setDirection('increase')} className={`flex-1 py-2 rounded-lg font-black text-xs uppercase ${direction === 'increase' ? 'bg-cyan-700 text-white' : 'bg-cyan-50 text-cyan-700 border-2 border-cyan-200'}`}>↑ Up</button>
                <button onClick={()=>setDirection('decrease')} className={`flex-1 py-2 rounded-lg font-black text-xs uppercase ${direction === 'decrease' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border-2 border-red-200'}`}>↓ Down</button>
            </div>
            <FormField color="cyan" label="Percent (%)" type="number" value={pct} onChange={setPct}/>
            <button onClick={calc} className="w-full py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg font-black text-xs uppercase">Calculate</button>
            <p className="text-[10px] text-cyan-700 font-bold mt-2">Total items in category: {items.filter(it => it.category === cat).length}</p>
        </>)}
        list={preview.length === 0
            ? <p className="text-center py-12 text-cyan-700 font-bold">Select category & percent to preview rate changes.</p>
            : (<table className="w-full text-sm"><thead className="bg-cyan-50"><tr>
                <Th>Code</Th><Th>Item</Th><Th align="right">Cur Rate</Th><Th align="right">New Rate</Th>
            </tr></thead><tbody>{preview.map(p => (<tr key={p.id} className="border-b border-cyan-100">
                <td className="px-3 py-1.5 font-black text-cyan-700">{p.code}</td>
                <td className="px-3 py-1.5 font-black text-slate-900">{p.itemName}</td>
                <td className="px-3 py-1.5 text-right">₹{p._cur}</td>
                <td className={`px-3 py-1.5 text-right font-black ${p._new > p._cur ? 'text-emerald-700' : 'text-red-700'}`}>₹{p._new}</td>
            </tr>))}</tbody></table>)}
    />);
}

// ══════════════════════════════════════════════
// 7. SALESMAN MODULE (rose)
// ══════════════════════════════════════════════
export function SalesManModule() {
    const [list, set] = useLocalList('master_salesman');
    const [form, setForm] = useState({ name: '', code: '', phone: '', territory: '', commission: '', active: true });
    const [editId, setEditId] = useState(null);
    const save = () => {
        if (!form.name.trim() || !form.code.trim()) return alert('Name + Code required.');
        if (editId) { set(list.map(x => x.id === editId ? { ...x, ...form, commission: parseFloat(form.commission) || 0 } : x)); setEditId(null); }
        else { set([{ id: 'SM-' + Date.now(), ...form, commission: parseFloat(form.commission) || 0, joinedAt: new Date().toISOString() }, ...list]); }
        setForm({ name: '', code: '', phone: '', territory: '', commission: '', active: true });
    };
    const edit = (x) => { setEditId(x.id); setForm({ name: x.name, code: x.code, phone: x.phone || '', territory: x.territory || '', commission: String(x.commission || ''), active: x.active !== false }); };
    return (<MasterShell color="rose" icon={Users} title="SalesMan Master" subtitle="Manage sales representatives & commission rates"
        leftForm={(<>
            <FormField color="rose" label="Name *" value={form.name} onChange={v=>setForm({...form, name: v})} placeholder="e.g. Ravi Kumar"/>
            <FormField color="rose" label="Code *" value={form.code} onChange={v=>setForm({...form, code: v.toUpperCase()})} placeholder="SM-01"/>
            <FormField color="rose" label="Phone" value={form.phone} onChange={v=>setForm({...form, phone: v})}/>
            <FormField color="rose" label="Territory" value={form.territory} onChange={v=>setForm({...form, territory: v})} placeholder="e.g. North Zone"/>
            <FormField color="rose" label="Commission (%)" type="number" value={form.commission} onChange={v=>setForm({...form, commission: v})}/>
            <label className="flex items-center gap-2 text-xs font-black text-rose-900 cursor-pointer"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form, active: e.target.checked})}/> Active</label>
            <SaveBtn color="rose" onSave={save} editId={editId} onCancel={()=>{setEditId(null);setForm({name:'',code:'',phone:'',territory:'',commission:'',active:true});}}/>
        </>)}
        list={(<table className="w-full text-sm"><thead className="bg-rose-50"><tr>
            <Th>Code</Th><Th>Name</Th><Th>Phone</Th><Th>Territory</Th><Th align="right">Commission</Th><Th>Status</Th><Th></Th>
        </tr></thead><tbody>{list.map(x => (<tr key={x.id} className="border-b border-rose-100 hover:bg-rose-50/40">
            <td className="px-3 py-1.5 font-black text-rose-700">{x.code}</td>
            <td className="px-3 py-1.5 font-black text-slate-900">{x.name}</td>
            <td className="px-3 py-1.5 font-bold text-slate-700">{x.phone || '—'}</td>
            <td className="px-3 py-1.5 font-bold text-slate-700">{x.territory || '—'}</td>
            <td className="px-3 py-1.5 text-right font-black text-rose-700">{x.commission}%</td>
            <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${x.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{x.active !== false ? 'Active' : 'Inactive'}</span></td>
            <td className="px-3 py-1.5 text-right"><RowActions onEdit={()=>edit(x)} onDelete={()=>{if(confirm('Delete?')) set(list.filter(y=>y.id!==x.id));}}/></td>
        </tr>))}{!list.length && <Empty colspan={7} text="No salesmen registered."/>}</tbody></table>)}
    />);
}

// ── Shared shell + helpers ──
function MasterShell({ color, icon: Icon, title, subtitle, leftForm, list }) {
    const colors = {
        red: { from: 'from-red-700', to: 'to-rose-700', bg: 'from-red-50 to-rose-50', bd: 'border-red-200' },
        blue: { from: 'from-blue-700', to: 'to-sky-700', bg: 'from-blue-50 to-sky-50', bd: 'border-blue-200' },
        purple: { from: 'from-purple-700', to: 'to-violet-700', bg: 'from-purple-50 to-violet-50', bd: 'border-purple-200' },
        amber: { from: 'from-amber-700', to: 'to-yellow-700', bg: 'from-amber-50 to-yellow-50', bd: 'border-amber-200' },
        emerald: { from: 'from-emerald-700', to: 'to-teal-700', bg: 'from-emerald-50 to-teal-50', bd: 'border-emerald-200' },
        cyan: { from: 'from-cyan-700', to: 'to-sky-700', bg: 'from-cyan-50 to-sky-50', bd: 'border-cyan-200' },
        rose: { from: 'from-rose-700', to: 'to-pink-700', bg: 'from-rose-50 to-pink-50', bd: 'border-rose-200' },
    }[color] || { from: 'from-slate-700', to: 'to-gray-700', bg: 'from-slate-50 to-gray-50', bd: 'border-slate-200' };
    return (<div className={`flex flex-col h-[85vh] bg-gradient-to-br ${colors.bg} rounded-xl border ${colors.bd} overflow-hidden`}>
        <div className={`bg-gradient-to-r ${colors.from} ${colors.to} px-6 py-4`}>
            <h1 className="text-white text-xl font-black flex items-center gap-2"><Icon size={22}/> {title}</h1>
            <p className="text-white/80 text-xs font-bold mt-0.5">{subtitle}</p>
        </div>
        <div className="flex-1 grid grid-cols-[340px_1fr] overflow-hidden">
            <div className={`bg-white border-r ${colors.bd} p-4 space-y-3 overflow-auto`}>{leftForm}</div>
            <div className="overflow-auto p-4">
                <div className={`bg-white rounded-xl border ${colors.bd} overflow-hidden`}>{list}</div>
            </div>
        </div>
    </div>);
}
const FormField = ({ color, label, value, onChange, type = 'text', placeholder }) => (
    <div><label className={`text-[10px] font-black uppercase text-${color}-700 block mb-1`}>{label}</label>
        <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={`w-full px-3 py-2 border-2 border-${color}-200 rounded-lg text-sm font-bold outline-none focus:border-${color}-500`}/>
    </div>
);
const SaveBtn = ({ color, onSave, editId, onCancel }) => (
    <div className="flex gap-2">
        <button onClick={onSave} className={`flex-1 py-2 bg-${color}-700 hover:bg-${color}-600 text-white rounded-lg font-black text-xs uppercase tracking-widest flex items-center justify-center gap-1`}><Save size={13}/> {editId ? 'Update' : 'Save'}</button>
        {editId && onCancel && <button onClick={onCancel} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-900 rounded-lg font-black text-xs uppercase">Cancel</button>}
    </div>
);
const RowActions = ({ onEdit, onDelete }) => (
    <div className="flex gap-1 justify-end">
        {onEdit && <button onClick={onEdit} className="p-1 text-slate-700 hover:bg-slate-100 rounded"><Edit3 size={13}/></button>}
        <button onClick={onDelete} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={13}/></button>
    </div>
);
const Th = ({ children, align = 'left' }) => <th className={`px-3 py-1.5 text-${align} text-[10px] font-black uppercase tracking-widest text-slate-700`}>{children}</th>;
const Empty = ({ colspan, text }) => <tr><td colSpan={colspan} className="py-8 text-center text-slate-500 font-bold">{text}</td></tr>;
