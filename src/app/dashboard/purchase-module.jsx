"use client";
import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ListPurchasesQuery, CreatePurchaseCommand, DeletePurchaseCommand, ListItemsQuery } from '../../core/queries/pharma.query';

export default function PurchaseModule() {
    const [purchases, setPurchases] = useState([]);
    const [pharmaItems, setPharmaItems] = useState([]);
    const [selectedIdx, setSelectedIdx] = useState(-1);

    // Header form
    const purNoRef = useRef(null);
    const [purNo, setPurNo] = useState('0');
    const [purDate, setPurDate] = useState(new Date().toISOString().split('T')[0]);
    const [invNo, setInvNo] = useState('');
    const [invDate, setInvDate] = useState(new Date().toISOString().split('T')[0]);
    const [taxMode, setTaxMode] = useState('Exclusive');
    const [type, setType] = useState('Cash');
    const [otherState, setOtherState] = useState(false);
    const [supplier, setSupplier] = useState('');
    const [orderRef, setOrderRef] = useState('');
    const [transMode, setTransMode] = useState('');
    const [address, setAddress] = useState('');
    const [transportName, setTransportName] = useState('');

    const [rows, setRows] = useState([]);

    // Item search popup
    const [showItemSearch, setShowItemSearch] = useState(false);
    const [itemSearchText, setItemSearchText] = useState('');
    const [currentRowIdx, setCurrentRowIdx] = useState(-1);
    const [searchSelIdx, setSearchSelIdx] = useState(0);
    const searchRef = useRef(null);

    useEffect(() => { loadAll(); }, []);
    const loadAll = async () => {
        try {
            const [p, items] = await Promise.all([ new ListPurchasesQuery().execute(), new ListItemsQuery().execute() ]);
            setPurchases(p);
            setPharmaItems(items);
            setPurNo(p.length === 0 ? '0' : String(p.length));
        } catch (e) { console.error(e); }
    };

    // ── Hotkeys ──
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'F4') { e.preventDefault(); handleCancel(); return; }
            if (e.key === 'F7') { e.preventDefault(); alert('Redirect to Item Master'); return; }
            if (e.key === 'F1') { e.preventDefault(); handleSave(); return; }
            if (showItemSearch) {
                if (e.key === 'Escape') { e.preventDefault(); setShowItemSearch(false); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setSearchSelIdx(p => Math.min(p+1, filteredItems.length-1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSearchSelIdx(p => Math.max(p-1, 0)); return; }
                if (e.key === 'Enter') { e.preventDefault(); pickItem(filteredItems[searchSelIdx]); return; }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showItemSearch, searchSelIdx, rows, currentRowIdx]);

    const blankRow = () => ({ company: '', group: '', itemCode: '', itemName: '', batchNo: '', mfg: '', expiry: '', qty: '', free: '', mrp: '', puRate: '', saleRate: '', amount: '0.00', discPct: '', discAmt: '', taxPct: '' });

    const addRow = () => setRows(prev => [...prev, blankRow()]);

    const updateRow = (idx, field, val) => {
        setRows(prev => prev.map((r, i) => {
            if (i !== idx) return r;
            const u = { ...r, [field]: val };
            const qty = parseFloat(u.qty) || 0;
            const rate = parseFloat(u.puRate) || 0;
            const disc = parseFloat(u.discPct) || 0;
            const sub = qty * rate;
            const discA = sub * disc / 100;
            u.discAmt = discA.toFixed(2);
            const taxable = sub - discA;
            const tax = taxable * (parseFloat(u.taxPct) || 0) / 100;
            u.amount = (taxable + (taxMode === 'Exclusive' ? tax : 0)).toFixed(2);
            return u;
        }));
    };

    const openItemSearch = (rowIdx) => {
        setCurrentRowIdx(rowIdx); setItemSearchText(''); setSearchSelIdx(0); setShowItemSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
    };

    const pickItem = (item) => {
        if (!item) return;
        let idx = currentRowIdx;
        setRows(prev => {
            let nr = [...prev];
            while (nr.length <= idx) nr.push(blankRow());
            nr[idx] = { ...nr[idx],
                itemCode: item.code, itemName: item.itemName,
                group: item.category || 'Na', company: item.brand || '',
                mrp: item.mrpRate || '0.00', puRate: item.costRate || '0.00',
                saleRate: item.salesRate || '0.00',
                taxPct: (item.taxName || 'GST 5%').replace(/[^0-9]/g, '') || '5',
            };
            return nr;
        });
        setShowItemSearch(false);
    };

    const filteredItems = pharmaItems.filter(it => {
        if (!itemSearchText) return true;
        const s = itemSearchText.toLowerCase();
        return (it.itemName || '').toLowerCase().includes(s) || String(it.code).includes(s);
    });

    const totalAmount = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const totalDiscA = rows.reduce((s, r) => s + (parseFloat(r.discAmt) || 0), 0);
    const totalTax = rows.reduce((s, r) => {
        const sub = (parseFloat(r.qty)||0) * (parseFloat(r.puRate)||0);
        const discA = sub * (parseFloat(r.discPct)||0) / 100;
        return s + (sub - discA) * (parseFloat(r.taxPct)||0) / 100;
    }, 0);

    const handleAdd = () => {
        setPurNo(String(purchases.length));
        setInvNo(''); setSupplier(''); setAddress(''); setOrderRef('');
        setTransMode(''); setTransportName(''); setRows([]);
        setSelectedIdx(-1);
    };

    const handleSave = async () => {
        if (!supplier.trim()) return alert('Supplier is required.');
        if (!rows.some(r => r.itemName)) return alert('Add at least one item.');
        try {
            await new CreatePurchaseCommand().execute({
                purNo, purDate, invNo, invDate, taxMode, payType: type, otherState,
                supplier, orderRef, transMode, address, transportName,
                rows, totalAmount, totalDiscA, totalTax, netAmount: totalAmount,
            });
            await loadAll();
            handleAdd();
            alert('Purchase saved.');
        } catch (err) { alert(err.message); }
    };

    const handleDelete = async () => {
        if (selectedIdx < 0) return alert('No purchase selected.');
        const p = purchases[selectedIdx];
        if (!p?.id) return;
        if (!confirm('Delete this purchase?')) return;
        try { await new DeletePurchaseCommand().execute(p.id); await loadAll(); handleAdd(); } catch (err) { alert(err.message); }
    };

    const handleCancel = () => { if (confirm('Cancel current entry?')) handleAdd(); };

    const nav = (dir) => {
        if (purchases.length === 0) return;
        let idx = selectedIdx;
        if (dir === 'first') idx = 0;
        else if (dir === 'last') idx = purchases.length - 1;
        else if (dir === 'prev') idx = Math.max(0, selectedIdx - 1);
        else if (dir === 'next') idx = Math.min(purchases.length - 1, selectedIdx + 1);
        setSelectedIdx(idx);
        const p = purchases[idx];
        setPurNo(p.purNo); setPurDate(p.purDate); setInvNo(p.invNo); setInvDate(p.invDate);
        setTaxMode(p.taxMode); setType(p.type); setOtherState(p.otherState);
        setSupplier(p.supplier); setOrderRef(p.orderRef); setTransMode(p.transMode);
        setAddress(p.address); setTransportName(p.transportName); setRows(p.rows);
    };

    // Table column widths
    const cols = [
        { key: 'company', label: 'Company', w: 130 },
        { key: 'group', label: 'Group', w: 90 },
        { key: 'itemName', label: 'It...', w: 44 },
        { key: 'batchNo', label: 'BatchNo', w: 90 },
        { key: 'mfg', label: 'MFG', w: 80 },
        { key: 'expiry', label: 'Expiry', w: 80 },
        { key: 'qty', label: 'QTY', w: 60 },
        { key: 'free', label: 'Free', w: 60 },
        { key: 'mrp', label: 'MRP', w: 70 },
        { key: 'puRate', label: 'PuRate', w: 72 },
        { key: 'saleRate', label: 'SaleRate', w: 75 },
        { key: 'amount', label: 'Amount', w: 80 },
        { key: 'discPct', label: 'Disc%', w: 60 },
        { key: 'discAmt', label: 'DiscA...', w: 70 },
        { key: 'taxPct', label: 'Tax%', w: 58 },
    ];

    const cellStyle = "bg-white h-[22px] px-1 text-[11px] font-bold text-slate-900 outline-none border-r border-[#aec6d6] focus:bg-yellow-50";
    const topInp = "bg-white border border-[#7ba0b5] h-[20px] px-1 text-[11px] font-bold text-slate-900 outline-none focus:bg-yellow-50 focus:border-[#1a5276]";

    return (<div className="flex flex-col h-[85vh] rounded-md overflow-hidden font-sans shadow-xl border border-slate-400" style={{ background: '#d4e6f1' }}>
        {/* Title bar */}
        <div className="h-[22px] flex items-center px-2 shrink-0 bg-gradient-to-r from-[#1a5276] to-[#2980b9] border-b border-[#154360] relative">
            <span className="text-white text-[11px] font-bold">Purchase - AVS ECOM PRIVATE LIMITED 2026-2027</span>
            <button className="absolute right-1 top-0 text-white hover:bg-red-500 w-6 h-[20px] flex items-center justify-center"><X size={12}/></button>
        </div>

        {/* Header form rows */}
        <div className="shrink-0 py-1" style={{ background: '#d4e6f1' }}>
            {/* Row 1: PurNo | PurDate | Inv.No | InvDate | Supplier | Address */}
            <div className="flex items-center px-1 py-0.5 gap-2 text-[11px] font-bold border-b border-[#b0c4d0]">
                <label className="w-12">PurNo</label>
                <input ref={purNoRef} autoFocus type="text" value={purNo} onChange={e=>setPurNo(e.target.value)} className={`${topInp} w-16`}/>
                <label className="ml-1 w-14">PurDate</label>
                <input type="date" value={purDate} onChange={e=>setPurDate(e.target.value)} className={`${topInp} w-[115px]`}/>
                <label className="ml-3 w-12">Inv.No</label>
                <input type="text" value={invNo} onChange={e=>setInvNo(e.target.value)} className={`${topInp} w-32`}/>
                <label className="ml-1 w-14">InvDate</label>
                <input type="date" value={invDate} onChange={e=>setInvDate(e.target.value)} className={`${topInp} w-[115px]`}/>
                <label className="ml-3 w-16">Supplier</label>
                <input type="text" value={supplier} onChange={e=>setSupplier(e.target.value)} className={`${topInp} flex-1`}/>
                <label className="ml-2 w-14">Address</label>
                <input type="text" value={address} onChange={e=>setAddress(e.target.value)} className={`${topInp} flex-1`}/>
            </div>
            {/* Row 2: Radio buttons | Type | Other State | Cash label | Order Ref | Trans.Mode | Transport Name */}
            <div className="flex items-center px-1 py-0.5 gap-2 text-[11px] font-bold">
                <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="tm" checked={taxMode==='Exclusive'} onChange={()=>setTaxMode('Exclusive')}/>Exclusive</label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name="tm" checked={taxMode==='Inclusive'} onChange={()=>setTaxMode('Inclusive')}/>Inclusive</label>
                <label className="ml-2">Type</label>
                <select value={type} onChange={e=>setType(e.target.value)} className={`${topInp} w-20`}>
                    <option>Cash</option><option>Credit</option><option>Bank</option>
                </select>
                <label className="flex items-center gap-1 cursor-pointer ml-3"><input type="checkbox" checked={otherState} onChange={e=>setOtherState(e.target.checked)}/>Other State <span className="text-red-500 text-[9px]">ⓘ</span></label>
                <span className="ml-10 font-bold">{type}</span>
                <label className="ml-6 w-16">Order Ref</label>
                <input type="text" value={orderRef} onChange={e=>setOrderRef(e.target.value)} className={`${topInp} w-32`}/>
                <label className="ml-2 w-20">Trans.Mode</label>
                <input type="text" value={transMode} onChange={e=>setTransMode(e.target.value)} className={`${topInp} w-28`}/>
                <label className="ml-2 w-28">Transport Name</label>
                <input type="text" value={transportName} onChange={e=>setTransportName(e.target.value)} className={`${topInp} flex-1`}/>
            </div>
        </div>

        {/* Table area + right totals */}
        <div className="flex-1 flex overflow-hidden border-t border-[#7ba0b5] bg-white">
            {/* Main table */}
            <div className="flex-1 overflow-auto relative">
                <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-[#d4e6f1] sticky top-0 z-10">
                        <tr>
                            <th className="w-7 border-r border-b border-[#7ba0b5] font-bold py-1"></th>
                            {cols.map(c => (<th key={c.key} className="border-r border-b border-[#7ba0b5] text-slate-900 text-[11px] font-bold py-1" style={{width: c.w}}>{c.label}</th>))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (<tr key={i} className="border-b border-[#dde5ec] h-[22px]">
                            <td className="w-7 text-center text-[#2980b9] text-[11px] font-black border-r border-[#dde5ec]">{i === rows.length-1 ? '▶*' : ''}</td>
                            {cols.map(c => (<td key={c.key} className="p-0 border-r border-[#dde5ec]">
                                {c.key === 'itemName' ? (
                                    <input type="text" value={r.itemName || ''} onFocus={()=>openItemSearch(i)} readOnly className={`${cellStyle} cursor-pointer bg-[#eaf5fb]`} style={{width: c.w}} title="Click to search item"/>
                                ) : (
                                    <input type="text" value={r[c.key] || ''} onChange={e=>updateRow(i, c.key, e.target.value)} className={cellStyle} style={{width: c.w, textAlign: ['qty','free','mrp','puRate','saleRate','amount','discPct','discAmt','taxPct'].includes(c.key) ? 'right' : 'left'}}/>
                                )}
                            </td>))}
                        </tr>))}
                        {/* Empty row for new entry */}
                        <tr onClick={addRow} className="cursor-pointer hover:bg-blue-50 h-[22px] border-b border-[#dde5ec]">
                            <td className="w-7 text-center text-[#2980b9] text-[11px] font-black border-r border-[#dde5ec]">▶*</td>
                            <td colSpan={cols.length} className="text-[10px] text-slate-600 px-2 font-bold">Click to add row</td>
                        </tr>
                    </tbody>
                </table>

                {/* ── Item Search Popup (appears over table) ── */}
                {showItemSearch && (
                    <div className="absolute top-0 left-[220px] bg-white border-[1.5px] border-[#7ba0b5] shadow-2xl z-30 w-[680px]">
                        <table className="w-full text-[12px] border-collapse">
                            <thead className="bg-[#eaf3f8] border-b border-[#7ba0b5]">
                                <tr>
                                    <th className="py-1 px-2 text-left border-r border-[#aec6d6] font-bold text-slate-900 w-24">Itemcode</th>
                                    <th className="py-1 px-2 text-left border-r border-[#aec6d6] font-bold text-slate-900 w-28">Category</th>
                                    <th className="py-1 px-2 text-left border-r border-[#aec6d6] font-bold text-slate-900">ItemName</th>
                                    <th className="py-1 px-2 text-left font-bold text-slate-900 w-28">TaxName</th>
                                </tr>
                                <tr>
                                    <td colSpan={4} className="p-0">
                                        <input ref={searchRef} type="text" value={itemSearchText} onChange={e=>{setItemSearchText(e.target.value);setSearchSelIdx(0);}} placeholder="Type name or code... (↑↓ Enter Esc)" className="w-full bg-[#fafcfe] border-b border-[#aec6d6] h-6 px-2 text-[12px] font-bold text-slate-900 outline-none focus:bg-yellow-50"/>
                                    </td>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.length === 0 ? (
                                    <tr><td colSpan={4} className="py-6 text-center text-slate-700 font-bold">No items. Press F7 to create.</td></tr>
                                ) : filteredItems.map((it, i) => {
                                    const active = searchSelIdx === i;
                                    return (<tr key={it.id || i} onClick={()=>pickItem(it)} className={`cursor-pointer border-b border-[#e0e6ec] h-[22px] ${active ? 'bg-[#3498db]' : 'bg-white hover:bg-[#eaf3f8]'}`}>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e6ec] font-bold ${active?'text-white bg-[#2980b9]':'text-slate-900'}`}>{it.code}</td>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e6ec] ${active?'text-white':'text-slate-900'}`}>{it.category || 'Na'}</td>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e6ec] font-bold uppercase ${active?'text-white':'text-slate-900'}`}>{it.itemName}</td>
                                        <td className={`py-0.5 px-2 font-bold ${active?'text-white':'text-slate-900'}`}>{it.taxName || 'GST 5%'}</td>
                                    </tr>);
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Right totals column */}
            <div className="w-16 border-l border-[#7ba0b5] bg-white">
                <div className="h-[22px] border-b border-[#7ba0b5] bg-[#d4e6f1]"/>
                <div className="h-[22px] flex items-center justify-end px-1 text-[11px] font-bold text-slate-900 border-b border-[#dde5ec]">00</div>
                <div className="h-[22px] flex items-center justify-end px-1 text-[11px] font-bold text-slate-900 border-b border-[#dde5ec]">{totalDiscA.toFixed(2)}</div>
                <div className="h-[22px] flex items-center justify-end px-1 text-[11px] font-bold text-slate-900 border-b border-[#dde5ec]">{totalTax.toFixed(2)}</div>
            </div>
        </div>

        {/* Bottom section */}
        <div className="shrink-0 flex border-t border-[#7ba0b5]" style={{background:'#5dade2'}}>
            {/* LEFT: F7 badge + Item Name label + buttons grid */}
            <div className="flex-1 p-1.5" style={{background:'#5dade2'}}>
                <div className="flex items-center gap-2 mb-1">
                    <span className="bg-[#1a2530] text-white text-[11px] font-black px-1.5 py-[1px] border border-black">F7 -&gt; New Item</span>
                    <label className="text-[#16a085] text-[13px] font-black">Item Name</label>
                    <input type="text" className="flex-1 bg-white border border-[#888] h-[18px] px-1 text-[11px] font-bold text-slate-900 outline-none" readOnly/>
                </div>
                {/* Row: Add/Save/Delete/Cancel */}
                <div className="flex items-center gap-0 mb-[2px]">
                    <button onClick={handleAdd} className="bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black px-6 py-[3px] text-[13px] active:translate-y-[1px]">Add</button>
                    <button onClick={handleSave} className="bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black px-6 py-[3px] text-[13px] active:translate-y-[1px]">Save</button>
                    <button onClick={handleDelete} className="bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black px-6 py-[3px] text-[13px] active:translate-y-[1px]">Delete</button>
                    <button onClick={handleCancel} className="bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black px-6 py-[3px] text-[13px] active:translate-y-[1px]">Cancel</button>
                </div>
                {/* Row: First/Prev/Nex/Last/V */}
                <div className="flex items-center gap-0">
                    <button onClick={()=>nav('first')} className="bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black px-6 py-[3px] text-[13px] active:translate-y-[1px]">First</button>
                    <button onClick={()=>nav('prev')} className="bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black px-6 py-[3px] text-[13px] active:translate-y-[1px]">Prev</button>
                    <button onClick={()=>nav('next')} className="bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black px-6 py-[3px] text-[13px] active:translate-y-[1px]">Nex</button>
                    <button onClick={()=>nav('last')} className="bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black px-6 py-[3px] text-[13px] active:translate-y-[1px]">Last</button>
                    <button className="bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black px-3 py-[3px] text-[13px] active:translate-y-[1px]">V</button>
                </div>
            </div>

            {/* RIGHT: Save / F4 Cancel + totals */}
            <div className="w-[300px] p-1.5" style={{background:'#5dade2'}}>
                <div className="flex items-center gap-0 mb-1">
                    <button onClick={handleSave} className="flex-1 bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black py-[3px] text-[13px] active:translate-y-[1px]">Save</button>
                    <button onClick={handleCancel} className="flex-1 bg-[#ecf0f1] hover:bg-white border border-[#2c3e50] text-slate-900 font-black py-[3px] text-[13px] active:translate-y-[1px]">F4 : Cancel</button>
                </div>
                <div className="bg-white border border-[#2c3e50] text-right px-2 py-0.5 font-black text-slate-900 text-[11px]">{Math.round(totalAmount)}</div>
                <div className="bg-white border border-[#2c3e50] border-t-0 text-right px-2 py-0.5 font-black text-slate-900 text-[11px]">0.0</div>
                <div className="bg-white border border-[#2c3e50] border-t-0 text-right px-2 py-0.5 font-black text-slate-900 text-[11px]">0.0</div>
            </div>
        </div>

        {/* Hotkeys legend */}
        <div className="shrink-0 border-t border-[#7a9ca8] text-[10px] font-bold text-slate-900 bg-white">
            <div className="bg-[#1a5276] text-white px-2 py-0.5 text-[9px] uppercase tracking-widest font-black">⌨ Hotkeys</div>
            <div className="grid grid-cols-6 border border-[#aaa] border-t-0">
                <span className="px-2 py-0 border-r border-b border-[#aaa]">F1 - <u>S</u>ave</span>
                <span className="px-2 py-0 border-r border-b border-[#aaa]">F4 - <u>C</u>ancel</span>
                <span className="px-2 py-0 border-r border-b border-[#aaa]">F7 - Item Master</span>
                <span className="px-2 py-0 border-r border-b border-[#aaa]">↑↓ Navigate</span>
                <span className="px-2 py-0 border-r border-b border-[#aaa]">Enter - Pick</span>
                <span className="px-2 py-0 border-b border-[#aaa]">Esc - Close</span>
            </div>
        </div>
    </div>);
}
