"use client";
import React, { useState, useEffect, useRef } from 'react';
import { ListPaymentsQuery, CreatePaymentCommand, DeletePaymentCommand, ListPurchasesQuery } from '../../core/queries/pharma.query';

const LEDGER_LS_KEY = 'supplier_registry';
function loadSuppliers() { try { return JSON.parse(localStorage.getItem(LEDGER_LS_KEY) || '[]'); } catch { return []; } }

export default function PaymentModule() {
    const [payments, setPayments] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [selectedIdx, setSelectedIdx] = useState(-1);
    const [mode, setMode] = useState('new');

    const payNoRef = useRef(null);
    // Header form
    const [payNo, setPayNo] = useState('0');
    const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
    const [refNo, setRefNo] = useState('');
    const [payType, setPayType] = useState('Cash');
    const [otherState, setOtherState] = useState(false);
    const [supplierName, setSupplierName] = useState('');
    const [supplierGST, setSupplierGST] = useState('');
    const [orderRef, setOrderRef] = useState('');
    const [transMode, setTransMode] = useState('');
    const [address, setAddress] = useState('');
    const [chequeNo, setChequeNo] = useState('');
    const [bankName, setBankName] = useState('');
    const [narration, setNarration] = useState('');

    // Payment rows — invoices being settled
    const [rows, setRows] = useState([]);

    // Supplier search popup
    const [showSupSearch, setShowSupSearch] = useState(false);
    const [supSearchText, setSupSearchText] = useState('');
    const [supSelIdx, setSupSelIdx] = useState(0);
    const supSearchRef = useRef(null);

    // Invoice search popup
    const [showInvSearch, setShowInvSearch] = useState(false);
    const [invSearchText, setInvSearchText] = useState('');
    const [invRowIdx, setInvRowIdx] = useState(-1);
    const [invSelIdx, setInvSelIdx] = useState(0);
    const invSearchRef = useRef(null);

    useEffect(() => { loadAll(); }, []);
    const loadAll = async () => {
        try {
            const [p, purch] = await Promise.all([ new ListPaymentsQuery().execute(), new ListPurchasesQuery().execute() ]);
            setPayments(p); setPurchases(purch); setSuppliers(loadSuppliers());
            setPayNo(String(p.length));
        } catch (e) { console.error(e); }
    };

    const blankRow = () => ({ invoiceNo: '', invDate: '', purchaseId: '', totalAmt: '', paidAmt: '', balanceAmt: '', payingAmt: '', discPct: '', discAmt: '', netAmt: '' });

    const addRow = () => setRows(prev => [...prev, blankRow()]);

    const updateRow = (idx, field, val) => {
        setRows(prev => prev.map((r, i) => {
            if (i !== idx) return r;
            const u = { ...r, [field]: val };
            const total = parseFloat(u.totalAmt) || 0;
            const paid = parseFloat(u.paidAmt) || 0;
            u.balanceAmt = (total - paid).toFixed(2);
            const paying = parseFloat(u.payingAmt) || 0;
            const discP = parseFloat(u.discPct) || 0;
            const discA = paying * discP / 100;
            u.discAmt = discA.toFixed(2);
            u.netAmt = (paying - discA).toFixed(2);
            return u;
        }));
    };

    const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));

    // ── Supplier search ──
    const openSupSearch = () => { setShowSupSearch(true); setSupSearchText(''); setSupSelIdx(0); setTimeout(()=>supSearchRef.current?.focus(),50); };
    const filteredSuppliers = (() => {
        // Merge: suppliers registry + unique suppliers from purchases
        const fromPurch = [...new Set(purchases.map(p => p.supplier).filter(Boolean))].map(s => ({ name: s, contactNumber: '', gstNumber: '' }));
        const all = [...suppliers];
        fromPurch.forEach(p => { if (!all.find(a => a.name === p.name)) all.push(p); });
        if (!supSearchText) return all.slice(0, 30);
        const s = supSearchText.toLowerCase();
        return all.filter(sp => (sp.name||'').toLowerCase().includes(s) || (sp.contactNumber||'').includes(supSearchText));
    })();

    const pickSupplier = (sp) => {
        if (!sp) return;
        setSupplierName(sp.name); setSupplierGST(sp.gstNumber || ''); setAddress(sp.address || '');
        setShowSupSearch(false);
        // Auto-load unpaid invoices for this supplier
        const supInvoices = purchases.filter(p => p.supplier === sp.name);
        if (supInvoices.length > 0 && rows.length === 0) {
            setRows(supInvoices.map(inv => ({
                invoiceNo: inv.invoiceNo || inv.purchaseNo, invDate: inv.purchaseDate, purchaseId: inv.id,
                totalAmt: String(inv.netAmount || inv.subtotal || 0), paidAmt: '0',
                balanceAmt: String(inv.netAmount || inv.subtotal || 0),
                payingAmt: '', discPct: '0', discAmt: '0', netAmt: '0',
            })));
        }
    };

    // ── Invoice search ──
    const openInvSearch = (rowIdx) => { setInvRowIdx(rowIdx); setShowInvSearch(true); setInvSearchText(''); setInvSelIdx(0); setTimeout(()=>invSearchRef.current?.focus(),50); };
    const filteredInvoices = (() => {
        const list = supplierName ? purchases.filter(p => p.supplier === supplierName) : purchases;
        if (!invSearchText) return list.slice(0, 30);
        const s = invSearchText.toLowerCase();
        return list.filter(p => (p.invoiceNo||'').toLowerCase().includes(s) || (p.purchaseNo||'').toLowerCase().includes(s));
    })();
    const pickInvoice = (inv) => {
        if (!inv) return;
        let idx = invRowIdx;
        setRows(prev => {
            let nr = [...prev];
            while (nr.length <= idx) nr.push(blankRow());
            const total = inv.netAmount || inv.subtotal || 0;
            nr[idx] = { ...nr[idx],
                invoiceNo: inv.invoiceNo || inv.purchaseNo, invDate: inv.purchaseDate, purchaseId: inv.id,
                totalAmt: String(total), paidAmt: '0', balanceAmt: String(total),
                payingAmt: String(total), discPct: '0', discAmt: '0', netAmt: String(total),
            };
            return nr;
        });
        setShowInvSearch(false);
    };

    // ── Hotkeys ──
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'F4') { e.preventDefault(); handleCancel(); return; }
            if (e.key === 'F1') { e.preventDefault(); handleSave(); return; }
            if (showSupSearch) {
                if (e.key === 'Escape') { e.preventDefault(); setShowSupSearch(false); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setSupSelIdx(p => Math.min(p+1, filteredSuppliers.length-1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSupSelIdx(p => Math.max(p-1, 0)); return; }
                if (e.key === 'Enter') { e.preventDefault(); pickSupplier(filteredSuppliers[supSelIdx]); return; }
            }
            if (showInvSearch) {
                if (e.key === 'Escape') { e.preventDefault(); setShowInvSearch(false); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setInvSelIdx(p => Math.min(p+1, filteredInvoices.length-1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setInvSelIdx(p => Math.max(p-1, 0)); return; }
                if (e.key === 'Enter') { e.preventDefault(); pickInvoice(filteredInvoices[invSelIdx]); return; }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showSupSearch, showInvSearch, supSelIdx, invSelIdx, filteredSuppliers, filteredInvoices, rows, supplierName]);

    // Totals
    const totalPaying = rows.reduce((s, r) => s + (parseFloat(r.payingAmt) || 0), 0);
    const totalDisc = rows.reduce((s, r) => s + (parseFloat(r.discAmt) || 0), 0);
    const totalNet = rows.reduce((s, r) => s + (parseFloat(r.netAmt) || 0), 0);

    // ── Actions ──
    const handleAdd = () => {
        setMode('new');
        setPayNo(String(payments.length));
        setPayDate(new Date().toISOString().split('T')[0]);
        setRefNo(''); setSupplierName(''); setSupplierGST(''); setAddress('');
        setOrderRef(''); setTransMode(''); setChequeNo(''); setBankName(''); setNarration('');
        setRows([blankRow()]); setSelectedIdx(-1);
    };

    const handleSave = async () => {
        if (!supplierName.trim()) return alert('Supplier is required.');
        const validRows = rows.filter(r => r.invoiceNo && parseFloat(r.payingAmt) > 0);
        if (validRows.length === 0) return alert('Enter paying amount for at least one invoice.');
        try {
            await new CreatePaymentCommand().execute({
                payNo, payDate, refNo, payType, otherState,
                supplierName, supplierGST, orderRef, transMode, address, chequeNo, bankName, narration,
                rows: validRows, totalPaying, totalDisc, totalNet,
            });
            await loadAll();
            alert(`Payment saved: ₹${totalNet.toFixed(2)} to ${supplierName}`);
            handleAdd();
        } catch (err) { alert(err.message); }
    };

    const handleDelete = async () => {
        if (selectedIdx < 0) return alert('No payment selected.');
        const p = payments[selectedIdx];
        if (!p?.id) return;
        if (!confirm('Delete this payment?')) return;
        try { await new DeletePaymentCommand().execute(p.id); await loadAll(); handleAdd(); } catch (err) { alert(err.message); }
    };

    const handleCancel = () => { if (confirm('Cancel current entry?')) handleAdd(); };

    const nav = (dir) => {
        if (payments.length === 0) return;
        let idx = selectedIdx;
        if (dir === 'first') idx = 0;
        else if (dir === 'last') idx = payments.length - 1;
        else if (dir === 'prev') idx = Math.max(0, selectedIdx - 1);
        else if (dir === 'next') idx = Math.min(payments.length - 1, selectedIdx + 1);
        const p = payments[idx];
        setSelectedIdx(idx); setPayNo(p.payNo); setPayDate(p.payDate); setRefNo(p.refNo);
        setPayType(p.payType); setOtherState(p.otherState); setSupplierName(p.supplierName);
        setSupplierGST(p.supplierGST); setOrderRef(p.orderRef); setTransMode(p.transMode);
        setAddress(p.address); setChequeNo(p.chequeNo); setBankName(p.bankName);
        setNarration(p.narration); setRows(p.rows); setMode('view');
    };

    // Table columns
    const cols = [
        { key: 'invoiceNo', label: 'InvoiceNo', w: 120 },
        { key: 'invDate', label: 'Inv Date', w: 90 },
        { key: 'totalAmt', label: 'Total Amt', w: 90 },
        { key: 'paidAmt', label: 'Paid Amt', w: 90 },
        { key: 'balanceAmt', label: 'Balance', w: 90 },
        { key: 'payingAmt', label: 'Paying Amt', w: 100 },
        { key: 'discPct', label: 'Disc%', w: 60 },
        { key: 'discAmt', label: 'DiscA...', w: 80 },
        { key: 'netAmt', label: 'Net Amt', w: 90 },
    ];

    const cell = "bg-white h-6 px-1 text-[11px] font-bold text-slate-900 outline-none border-r border-[#b0c4d0] focus:bg-yellow-50";

    return (<div className="flex flex-col h-[85vh] rounded-md overflow-hidden font-sans shadow-xl" style={{ background: '#d4e6f1' }}>
        {/* Title bar */}
        <div className="h-6 flex items-center px-2 shrink-0 bg-gradient-to-r from-[#1a5276] to-[#2980b9]">
            <span className="text-white text-[11px] font-bold">Payment - AVS ECOM PRIVATE LIMITED 2026-2027</span>
        </div>

        {/* Header form */}
        <div className="shrink-0 p-2" style={{ background: '#d4e6f1' }}>
            <div className="flex items-center gap-1 mb-1 text-[11px] font-bold">
                <div className="flex items-center gap-1"><label>PayNo</label><input ref={payNoRef} autoFocus type="text" value={payNo} onChange={e=>setPayNo(e.target.value)} className="bg-white border border-[#7ba0b5] h-5 px-1 w-16 text-[11px] font-bold outline-none"/></div>
                <div className="flex items-center gap-1 ml-2"><label>PayDate</label><input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} className="bg-white border border-[#7ba0b5] h-5 px-1 w-28 text-[11px] font-bold outline-none"/></div>
                <div className="flex items-center gap-1 ml-3"><label>Ref.No</label><input type="text" value={refNo} onChange={e=>setRefNo(e.target.value)} className="bg-white border border-[#7ba0b5] h-5 px-1 w-36 text-[11px] font-bold outline-none"/></div>
                <div className="flex items-center gap-1 ml-3">
                    <label>Supplier</label>
                    <input type="text" value={supplierName} onFocus={openSupSearch} readOnly className="bg-[#ffffd0] border border-[#7ba0b5] h-5 px-1 flex-1 max-w-xs text-[11px] font-bold outline-none cursor-pointer" title="Click to search supplier"/>
                </div>
                <div className="flex items-center gap-1 ml-3"><label>GST</label><input type="text" value={supplierGST} onChange={e=>setSupplierGST(e.target.value)} className="bg-white border border-[#7ba0b5] h-5 px-1 w-32 text-[11px] font-bold outline-none"/></div>
                <div className="flex items-center gap-1 ml-3"><label>Address</label><input type="text" value={address} onChange={e=>setAddress(e.target.value)} className="bg-white border border-[#7ba0b5] h-5 px-1 flex-1 max-w-xs text-[11px] font-bold outline-none"/></div>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-bold">
                <label>PayType</label>
                <select value={payType} onChange={e=>setPayType(e.target.value)} className="bg-white border border-[#7ba0b5] h-5 px-1 text-[11px] font-bold outline-none">
                    <option>Cash</option><option>Bank Transfer</option><option>Cheque</option><option>UPI</option><option>Card</option>
                </select>
                <label className="flex items-center gap-1 cursor-pointer ml-3"><input type="checkbox" checked={otherState} onChange={e=>setOtherState(e.target.checked)}/>Other State <span className="text-red-500">⓵</span></label>
                <span className="ml-6 font-bold text-red-700">{payType.toUpperCase()}</span>
                <div className="flex items-center gap-1 ml-3"><label>Cheque/Ref No</label><input type="text" value={chequeNo} onChange={e=>setChequeNo(e.target.value)} className="bg-white border border-[#7ba0b5] h-5 px-1 w-32 text-[11px] font-bold outline-none"/></div>
                <div className="flex items-center gap-1 ml-3"><label>Bank</label><input type="text" value={bankName} onChange={e=>setBankName(e.target.value)} className="bg-white border border-[#7ba0b5] h-5 px-1 w-36 text-[11px] font-bold outline-none"/></div>
                <div className="flex items-center gap-1 ml-3"><label>Narration</label><input type="text" value={narration} onChange={e=>setNarration(e.target.value)} className="bg-white border border-[#7ba0b5] h-5 px-1 flex-1 max-w-xs text-[11px] font-bold outline-none"/></div>
            </div>
        </div>

        {/* Table area with right totals */}
        <div className="flex-1 flex overflow-hidden bg-white border-y border-[#7ba0b5]">
            <div className="flex-1 overflow-auto relative">
                <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-[#d4e6f1] sticky top-0 z-10">
                        <tr>
                            <th className="w-6 border-r border-b border-[#7ba0b5]"></th>
                            {cols.map(c => (<th key={c.key} className="border-r border-b border-[#7ba0b5] text-slate-700 text-[10px] font-bold py-0.5" style={{width: c.w}}>{c.label}</th>))}
                            <th className="border-b border-[#7ba0b5] w-8"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (<tr key={i} className="border-b border-[#b0c4d0]">
                            <td className="w-6 text-center text-blue-600 text-[10px] border-r border-[#b0c4d0]">{i === rows.length-1 ? '▶*' : ''}</td>
                            {cols.map(c => (
                                <td key={c.key} className="p-0 border-r border-[#b0c4d0]">
                                    {c.key === 'invoiceNo' ? (
                                        <input type="text" value={r.invoiceNo || ''} onFocus={()=>openInvSearch(i)} readOnly className={`${cell} cursor-pointer`} style={{width: c.w}} title="Click to search invoice"/>
                                    ) : (
                                        <input type="text" value={r[c.key] || ''} onChange={e=>updateRow(i, c.key, e.target.value)}
                                            readOnly={['invDate','totalAmt','paidAmt','balanceAmt','discAmt','netAmt'].includes(c.key)}
                                            className={`${cell} ${['invDate','totalAmt','paidAmt','balanceAmt','discAmt','netAmt'].includes(c.key)?'bg-[#f5f5f5]':''}`}
                                            style={{width: c.w, textAlign: ['totalAmt','paidAmt','balanceAmt','payingAmt','discPct','discAmt','netAmt'].includes(c.key) ? 'right' : 'left'}}/>
                                    )}
                                </td>
                            ))}
                            <td className="text-center"><button onClick={()=>removeRow(i)} className="text-red-500 hover:text-red-700 text-xs font-bold">✕</button></td>
                        </tr>))}
                        <tr onClick={addRow} className="cursor-pointer hover:bg-blue-50 h-6">
                            <td className="w-6 text-center text-blue-600 text-[10px] border-r border-[#b0c4d0]">*</td>
                            <td colSpan={cols.length + 1} className="text-[10px] text-slate-700 px-2">Click to add invoice row</td>
                        </tr>
                    </tbody>
                </table>

                {/* Supplier Search Popup */}
                {showSupSearch && (
                    <div className="absolute left-1/4 top-2 bg-white border-2 border-[#7ba0b5] shadow-2xl z-30 w-[560px]">
                        <div className="bg-[#d4e6f1] border-b-2 border-[#7ba0b5] px-2 py-1 flex items-center gap-2">
                            <label className="text-[12px] font-bold">Search Supplier</label>
                            <input ref={supSearchRef} type="text" value={supSearchText} onChange={e=>{setSupSearchText(e.target.value);setSupSelIdx(0);}} placeholder="Type supplier name... (↑↓ Enter Esc)" className="flex-1 bg-white border border-[#7ba0b5] h-6 px-2 text-[12px] font-bold outline-none focus:border-[#1a5276]"/>
                        </div>
                        <table className="w-full text-[12px] border-collapse">
                            <thead className="bg-[#eef5fb]"><tr>
                                <th className="py-1 px-2 text-left border-r border-[#ccc] font-bold w-12">#</th>
                                <th className="py-1 px-2 text-left border-r border-[#ccc] font-bold">Supplier Name</th>
                                <th className="py-1 px-2 text-left border-r border-[#ccc] font-bold w-32">Phone</th>
                                <th className="py-1 px-2 text-left font-bold w-32">GST</th>
                            </tr></thead>
                            <tbody>
                                {filteredSuppliers.length === 0 ? (
                                    <tr><td colSpan={4} className="py-6 text-center text-slate-700 font-bold">No suppliers. Add in Ledger module.</td></tr>
                                ) : filteredSuppliers.map((sp, i) => (
                                    <tr key={i} onClick={()=>pickSupplier(sp)} className={`cursor-pointer border-b border-[#e0e0e0] ${supSelIdx===i?'bg-[#2980b9] text-white':'hover:bg-blue-50'}`}>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e0e0] font-bold ${supSelIdx===i?'text-white':''}`}>{i+1}</td>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e0e0] font-bold uppercase ${supSelIdx===i?'text-white':''}`}>{sp.name}</td>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e0e0] ${supSelIdx===i?'text-white':''}`}>{sp.contactNumber||'-'}</td>
                                        <td className={`py-0.5 px-2 ${supSelIdx===i?'text-white':''}`}>{sp.gstNumber||'-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Invoice Search Popup */}
                {showInvSearch && (
                    <div className="absolute left-1/4 top-2 bg-white border-2 border-[#7ba0b5] shadow-2xl z-30 w-[620px]">
                        <div className="bg-[#d4e6f1] border-b-2 border-[#7ba0b5] px-2 py-1 flex items-center gap-2">
                            <label className="text-[12px] font-bold">Search Invoice {supplierName && `— ${supplierName}`}</label>
                            <input ref={invSearchRef} type="text" value={invSearchText} onChange={e=>{setInvSearchText(e.target.value);setInvSelIdx(0);}} placeholder="Type invoice no... (↑↓ Enter Esc)" className="flex-1 bg-white border border-[#7ba0b5] h-6 px-2 text-[12px] font-bold outline-none focus:border-[#1a5276]"/>
                        </div>
                        <table className="w-full text-[12px] border-collapse">
                            <thead className="bg-[#eef5fb]"><tr>
                                <th className="py-1 px-2 text-left border-r border-[#ccc] font-bold w-20">Pur.No</th>
                                <th className="py-1 px-2 text-left border-r border-[#ccc] font-bold">Invoice No</th>
                                <th className="py-1 px-2 text-left border-r border-[#ccc] font-bold">Supplier</th>
                                <th className="py-1 px-2 text-left border-r border-[#ccc] font-bold w-24">Date</th>
                                <th className="py-1 px-2 text-right font-bold w-24">Amount</th>
                            </tr></thead>
                            <tbody>
                                {filteredInvoices.length === 0 ? (
                                    <tr><td colSpan={5} className="py-6 text-center text-slate-700 font-bold">No invoices found.</td></tr>
                                ) : filteredInvoices.map((inv, i) => (
                                    <tr key={inv.id} onClick={()=>pickInvoice(inv)} className={`cursor-pointer border-b border-[#e0e0e0] ${invSelIdx===i?'bg-[#2980b9] text-white':'hover:bg-blue-50'}`}>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e0e0] font-bold ${invSelIdx===i?'text-white':''}`}>{inv.purchaseNo}</td>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e0e0] font-bold ${invSelIdx===i?'text-white':''}`}>{inv.invoiceNo}</td>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e0e0] ${invSelIdx===i?'text-white':''}`}>{inv.supplier}</td>
                                        <td className={`py-0.5 px-2 border-r border-[#e0e0e0] ${invSelIdx===i?'text-white':''}`}>{new Date(inv.purchaseDate).toLocaleDateString('en-IN')}</td>
                                        <td className={`py-0.5 px-2 text-right font-bold ${invSelIdx===i?'text-white':''}`}>{(inv.netAmount||inv.subtotal||0).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Right totals */}
            <div className="w-24 border-l border-[#7ba0b5] bg-white">
                <div className="bg-[#d4e6f1] h-6 border-b border-[#7ba0b5] text-[10px] font-bold flex items-center justify-end px-2 text-slate-700">Total</div>
                <div className="py-0.5 px-2 text-right border-b border-[#e0e0e0] text-[11px] font-bold">{totalPaying.toFixed(2)}</div>
                <div className="py-0.5 px-2 text-right border-b border-[#e0e0e0] text-[11px] font-bold text-red-600">{totalDisc.toFixed(2)}</div>
                <div className="py-0.5 px-2 text-right border-b border-[#e0e0e0] text-[11px] font-black text-blue-700">{totalNet.toFixed(2)}</div>
            </div>
        </div>

        {/* Bottom controls */}
        <div className="shrink-0" style={{ background: '#5dade2' }}>
            <div className="flex items-stretch">
                <div className="flex-1 bg-[#5dade2] p-2">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-white text-[11px] font-bold bg-[#1a5276] px-1.5 py-0.5 rounded">F1 = Save</span>
                        <label className="text-[#16a085] text-[12px] font-black">Payment Entry</label>
                    </div>
                    <div className="flex items-center gap-0">
                        <button onClick={handleAdd} className="bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold px-5 py-1 text-[12px] active:translate-y-[1px]">Add</button>
                        <button onClick={handleSave} className="bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold px-5 py-1 text-[12px] active:translate-y-[1px]">Save</button>
                        <button onClick={handleDelete} className="bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold px-5 py-1 text-[12px] active:translate-y-[1px]">Delete</button>
                        <button onClick={handleCancel} className="bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold px-5 py-1 text-[12px] active:translate-y-[1px]">Cancel</button>
                    </div>
                    <div className="flex items-center gap-0 mt-1">
                        <button onClick={()=>nav('first')} className="bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold px-5 py-1 text-[12px] active:translate-y-[1px]">First</button>
                        <button onClick={()=>nav('prev')} className="bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold px-5 py-1 text-[12px] active:translate-y-[1px]">Prev</button>
                        <button onClick={()=>nav('next')} className="bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold px-5 py-1 text-[12px] active:translate-y-[1px]">Nex</button>
                        <button onClick={()=>nav('last')} className="bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold px-5 py-1 text-[12px] active:translate-y-[1px]">Last</button>
                        <button className="bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold px-3 py-1 text-[12px] active:translate-y-[1px]">V</button>
                    </div>
                </div>

                {/* Right: Save / F4 Cancel + totals panel */}
                <div className="w-[380px] bg-[#5dade2] p-2">
                    <div className="flex items-center gap-0 mb-1">
                        <button onClick={handleSave} className="flex-1 bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold py-1 text-[12px] active:translate-y-[1px]">Save</button>
                        <button onClick={handleCancel} className="flex-1 bg-white hover:bg-slate-100 border border-slate-600 text-slate-900 font-bold py-1 text-[12px] active:translate-y-[1px]">F4 : Cancel</button>
                    </div>
                    <table className="w-full text-[11px] border-collapse bg-white border border-[#888]">
                        <tbody>
                            <tr className="border-b border-[#ccc]">
                                <td className="px-2 py-0.5 font-bold text-slate-700">Total Paying</td>
                                <td className="px-2 py-0.5 text-right font-bold">{totalPaying.toFixed(2)}</td>
                            </tr>
                            <tr className="border-b border-[#ccc]">
                                <td className="px-2 py-0.5 font-bold text-slate-700">Total Discount</td>
                                <td className="px-2 py-0.5 text-right font-bold text-red-600">{totalDisc.toFixed(2)}</td>
                            </tr>
                            <tr className="bg-[#1a5276] text-white">
                                <td className="px-2 py-0.5 font-black">NET PAYMENT</td>
                                <td className="px-2 py-0.5 text-right font-black text-[14px]">₹{totalNet.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Hotkeys legend */}
        <div className="shrink-0 border-t border-[#7a9ca8] text-[10px] font-bold text-slate-900 bg-white">
            <div className="bg-[#1a5276] text-white px-2 py-0.5 text-[9px] uppercase tracking-widest font-black">⌨ Hotkeys</div>
            <div className="grid grid-cols-6 border border-[#aaa] border-t-0">
                <span className="px-2 py-0 border-r border-b border-[#aaa]">F1 - <u>S</u>ave</span>
                <span className="px-2 py-0 border-r border-b border-[#aaa]">F4 - <u>C</u>ancel</span>
                <span className="px-2 py-0 border-r border-b border-[#aaa]">↑↓ Navigate</span>
                <span className="px-2 py-0 border-r border-b border-[#aaa]">Enter - Pick</span>
                <span className="px-2 py-0 border-r border-b border-[#aaa]">Tab - Next field</span>
                <span className="px-2 py-0 border-b border-[#aaa]">Esc - Close</span>
            </div>
        </div>
    </div>);
}
