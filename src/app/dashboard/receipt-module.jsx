"use client";
import React, { useState, useEffect } from 'react';
import { X, Minus, Square } from 'lucide-react';
import { ListReceiptsQuery, CreateReceiptCommand, DeleteReceiptCommand } from '../../core/queries/pharma.query';

export default function ReceiptModule() {
    const [receipts, setReceipts] = useState([]);
    const [selectedIdx, setSelectedIdx] = useState(-1);

    // Header form
    const [docNo, setDocNo] = useState('0');
    const [docDate, setDocDate] = useState(new Date().toISOString().split('T')[0]);
    const [lastRecNo, setLastRecNo] = useState('8');
    const [billRefNo, setBillRefNo] = useState('');
    const [type, setType] = useState('Against Ref.');
    const [refType, setRefType] = useState('Manual');
    const [accHead, setAccHead] = useState('');
    const [mode, setMode] = useState('Cash');
    const [narration1, setNarration1] = useState('');
    const [narration2, setNarration2] = useState('');
    const [cashDisc, setCashDisc] = useState('0.00');
    const [amount, setAmount] = useState('0.00');
    const [recAmount, setRecAmount] = useState('0.00');

    // Rows
    const [rows, setRows] = useState([]);

    useEffect(() => { loadAll(); }, []);
    const loadAll = async () => {
        try {
            const r = await new ListReceiptsQuery().execute();
            setReceipts(r);
            setDocNo(String(r.length));
            setLastRecNo(String(r.length || 8));
        } catch (e) { console.error(e); }
    };

    const blankRow = () => ({ billRefNo: '', refNo: '', refDate: '', billAmt: '0.000', balance: '0.00', paidAmt: '0.000', discount: '0.000' });
    const addRow = () => setRows(prev => [...prev, blankRow()]);

    const updateRow = (idx, field, val) => {
        setRows(prev => prev.map((r, i) => {
            if (i !== idx) return r;
            const u = { ...r, [field]: val };
            const bill = parseFloat(u.billAmt) || 0;
            const paid = parseFloat(u.paidAmt) || 0;
            const disc = parseFloat(u.discount) || 0;
            u.balance = (bill - paid - disc).toFixed(2);
            return u;
        }));
    };

    const totalBill = rows.reduce((s, r) => s + (parseFloat(r.billAmt) || 0), 0);
    const totalBalance = rows.reduce((s, r) => s + (parseFloat(r.balance) || 0), 0);

    const handleAdd = () => {
        setDocNo(String(receipts.length));
        setBillRefNo(''); setAccHead(''); setNarration1(''); setNarration2('');
        setCashDisc('0.00'); setAmount('0.00'); setRecAmount('0.00');
        setRows([]); setSelectedIdx(-1);
    };

    const handleSave = async () => {
        if (!accHead.trim()) return alert('Acc Head is required.');
        if (!recAmount || parseFloat(recAmount) <= 0) return alert('Rec.Amount is required.');
        try {
            await new CreateReceiptCommand().execute({
                docNo, docDate, billRefNo, docType: type, refType, accHead, payMode: mode,
                narration1, narration2,
                cashDisc: parseFloat(cashDisc) || 0,
                amount: parseFloat(amount) || 0,
                recAmount: parseFloat(recAmount) || 0,
                rows,
            });
            await loadAll();
            alert(`Receipt saved: ${accHead} - ₹${recAmount}`);
            handleAdd();
        } catch (err) { alert(err.message); }
    };

    const handleDelete = async () => {
        if (selectedIdx < 0) return alert('No receipt selected.');
        const r = receipts[selectedIdx];
        if (!r?.id) return;
        if (!confirm('Delete this receipt?')) return;
        try { await new DeleteReceiptCommand().execute(r.id); await loadAll(); handleAdd(); } catch (err) { alert(err.message); }
    };

    const handleEdit = () => { if (selectedIdx < 0) alert('Select a receipt first.'); };
    const handleView = () => { if (receipts.length === 0) alert('No receipts yet.'); else alert(`Total receipts: ${receipts.length}`); };
    const handlePrint = () => {
        const w = window.open('', '', 'width=500,height=600');
        if (w) {
            w.document.write(`<html><body style="font-family:Arial;padding:20px"><h2 style="text-align:center">AVS ECOM</h2><hr><h3 style="text-align:center;color:#1a5276">RECEIPT</h3><p>Doc No: <b>${docNo}</b> | Date: ${docDate}</p><p>Acc Head: <b>${accHead}</b></p><p>Mode: ${mode} | Amount: <b>₹${recAmount}</b></p><hr><p>Narration: ${narration1} ${narration2}</p><p style="text-align:center;margin-top:20px">Thank You!</p></body></html>`);
            w.document.close(); w.print();
        }
    };

    const nav = (dir) => {
        if (receipts.length === 0) return;
        let idx = selectedIdx;
        if (dir === 'first') idx = 0;
        else if (dir === 'last') idx = receipts.length - 1;
        else if (dir === 'prev') idx = Math.max(0, selectedIdx - 1);
        else if (dir === 'next') idx = Math.min(receipts.length - 1, selectedIdx + 1);
        setSelectedIdx(idx);
        const r = receipts[idx];
        setDocNo(r.docNo); setDocDate(r.docDate); setBillRefNo(r.billRefNo);
        setType(r.docType || r.type); setRefType(r.refType); setAccHead(r.accHead); setMode(r.payMode || r.mode);
        setNarration1(r.narration1); setNarration2(r.narration2);
        setCashDisc(r.cashDisc); setAmount(r.amount); setRecAmount(r.recAmount);
        setRows(r.rows || []);
    };

    const inp = "bg-white border border-[#a0a0a0] h-[22px] px-1 text-[12px] font-bold text-slate-900 outline-none focus:bg-yellow-50 focus:border-[#1a5276]";
    const lbl = "text-[12px] font-bold text-slate-900";

    return (<div className="flex flex-col h-[85vh] rounded-md overflow-hidden font-sans shadow-xl border border-slate-400" style={{background:'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)'}}>

        {/* Title bar */}
        <div className="h-[22px] flex items-center px-2 shrink-0 bg-gradient-to-r from-[#1a5276] to-[#2980b9] relative">
            <span className="text-white text-[11px] font-bold">Receipt - AVS ECOM PRIVATE LIMITED 2026-2027</span>
            <div className="absolute right-1 top-0 flex items-center gap-0">
                <button className="text-white hover:bg-slate-600 w-5 h-[20px] flex items-center justify-center"><Minus size={11}/></button>
                <button className="text-white hover:bg-slate-600 w-5 h-[20px] flex items-center justify-center"><Square size={9}/></button>
                <button className="text-white hover:bg-red-500 w-5 h-[20px] flex items-center justify-center"><X size={12}/></button>
            </div>
        </div>

        {/* Form area */}
        <div className="p-4 relative" style={{background:'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 60%, #90caf9 100%)'}}>
            {/* Big "Receipt" text (right side, semi-transparent) */}
            <div className="absolute right-10 top-2 text-[#1a5276] text-[22px] font-bold italic">Receipt</div>

            <div className="grid grid-cols-[100px_200px_80px_200px_80px_60px] gap-y-2 gap-x-2 items-center max-w-3xl">
                {/* Row 1: Doc No | Doc Date | Last RecNo */}
                <label className={lbl}>Doc No.</label>
                <input type="text" value={docNo} onChange={e=>setDocNo(e.target.value)} className={`${inp} text-right`}/>
                <label className={`${lbl} ml-2`}>Doc Date <span className="text-red-500">*</span></label>
                <input type="date" value={docDate} onChange={e=>setDocDate(e.target.value)} className={inp}/>
                <label className={`${lbl} ml-2`}>Last RecNo</label>
                <span className="text-[#c0392b] font-bold text-[14px]">{lastRecNo}</span>

                {/* Row 2: BillRefNo */}
                <label className={lbl}>BillRefNo</label>
                <input type="text" value={billRefNo} onChange={e=>setBillRefNo(e.target.value)} className={inp}/>
                <div/><div/><div/><div/>

                {/* Row 3: Type | Ref.Type */}
                <label className={lbl}>Type.</label>
                <select value={type} onChange={e=>setType(e.target.value)} className={inp}>
                    <option>Against Ref.</option><option>On Account</option><option>Advance</option>
                </select>
                <label className={`${lbl} ml-2`}>Ref.Type</label>
                <select value={refType} onChange={e=>setRefType(e.target.value)} className={inp}>
                    <option>Manual</option><option>Auto</option>
                </select>
                <div/><div/>

                {/* Row 4: Acc Head */}
                <label className={lbl}>Acc Head <span className="text-red-500">*</span></label>
                <input type="text" value={accHead} onChange={e=>setAccHead(e.target.value)} className={`${inp} col-span-3`} style={{width: '100%'}}/>
                <div/><div/><div/>

                {/* Row 5: Mode */}
                <label className={lbl}>Mode <span className="text-red-500">*</span></label>
                <select value={mode} onChange={e=>setMode(e.target.value)} className={inp}>
                    <option>Cash</option><option>Bank</option><option>Cheque</option><option>UPI</option>
                </select>
                <div/><div/><div/><div/>

                {/* Row 6: Narration */}
                <label className={lbl}>Narration</label>
                <input type="text" value={narration1} onChange={e=>setNarration1(e.target.value)} className={`${inp} col-span-4`} style={{width: '100%'}}/>
                <div/>
                <div/>
                <input type="text" value={narration2} onChange={e=>setNarration2(e.target.value)} className={`${inp} col-span-4`} style={{width: '100%'}}/>
                <div/>

                {/* Row 7: Cash Disc */}
                <label className={lbl}>Cash Disc</label>
                <input type="number" value={cashDisc} onChange={e=>setCashDisc(e.target.value)} className={`${inp} text-right`}/>
                <div/><div/><div/><div/>

                {/* Row 8: Amount | Rec.Amount */}
                <label className={lbl}>Amount <span className="text-red-500">*</span></label>
                <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} className={`${inp} text-right`}/>
                <label className={`${lbl} ml-2`}>Rec.Amount <span className="text-red-500">*</span></label>
                <input type="number" value={recAmount} onChange={e=>setRecAmount(e.target.value)} className={`${inp} text-right`}/>
                <div/><div/>
            </div>

            {/* Data grid table */}
            <div className="mt-4 bg-white border border-[#a0a0a0]">
                <table className="w-full text-[12px] border-collapse">
                    <thead className="bg-[#d4e6f1]">
                        <tr>
                            <th className="w-6 border-r border-b border-[#a0a0a0]"></th>
                            <th className="py-1 px-2 text-left border-r border-b border-[#a0a0a0] font-bold text-slate-900">BillRefNo</th>
                            <th className="py-1 px-2 text-left border-r border-b border-[#a0a0a0] font-bold text-slate-900 w-28">RefNo</th>
                            <th className="py-1 px-2 text-left border-r border-b border-[#a0a0a0] font-bold text-slate-900 w-32">RefDate</th>
                            <th className="py-1 px-2 text-right border-r border-b border-[#a0a0a0] font-bold text-slate-900 w-24">BillAmt</th>
                            <th className="py-1 px-2 text-right border-r border-b border-[#a0a0a0] font-bold text-slate-900 w-24">Balance</th>
                            <th className="py-1 px-2 text-right border-r border-b border-[#a0a0a0] font-bold text-slate-900 w-24">PaidAmt</th>
                            <th className="py-1 px-2 text-right border-b border-[#a0a0a0] font-bold text-slate-900 w-24">Discount</th>
                        </tr>
                    </thead>
                    <tbody className="bg-[#e8eef5]">
                        {rows.length === 0 ? (
                            <tr className="h-[22px] border-b border-[#c0c0c0] bg-white">
                                <td className="w-6 text-center text-[#2980b9] font-black border-r border-[#c0c0c0]">▶*</td>
                                <td className="p-0 border-r border-[#c0c0c0]"><input type="text" onFocus={addRow} className="w-full h-[22px] px-1 text-[11px] font-bold outline-none bg-white focus:bg-yellow-50"/></td>
                                <td className="p-0 border-r border-[#c0c0c0]"></td>
                                <td className="p-0 border-r border-[#c0c0c0]"></td>
                                <td className="p-0 border-r border-[#c0c0c0] text-right px-2">0.000</td>
                                <td className="p-0 border-r border-[#c0c0c0] text-right px-2">0.00</td>
                                <td className="p-0 border-r border-[#c0c0c0] text-right px-2">0.000</td>
                                <td className="p-0 text-right px-2">0.000</td>
                            </tr>
                        ) : rows.map((r, i) => (<tr key={i} className="h-[22px] border-b border-[#c0c0c0] bg-white">
                            <td className="w-6 text-center text-[#2980b9] font-black border-r border-[#c0c0c0]">{i === rows.length-1 ? '▶*' : ''}</td>
                            <td className="p-0 border-r border-[#c0c0c0]"><input type="text" value={r.billRefNo || ''} onChange={e=>updateRow(i,'billRefNo',e.target.value)} className="w-full h-[22px] px-1 text-[11px] font-bold outline-none bg-white focus:bg-yellow-50"/></td>
                            <td className="p-0 border-r border-[#c0c0c0]"><input type="text" value={r.refNo || ''} onChange={e=>updateRow(i,'refNo',e.target.value)} className="w-full h-[22px] px-1 text-[11px] font-bold outline-none bg-white focus:bg-yellow-50"/></td>
                            <td className="p-0 border-r border-[#c0c0c0]"><input type="date" value={r.refDate || ''} onChange={e=>updateRow(i,'refDate',e.target.value)} className="w-full h-[22px] px-1 text-[11px] font-bold outline-none bg-white focus:bg-yellow-50"/></td>
                            <td className="p-0 border-r border-[#c0c0c0]"><input type="number" value={r.billAmt || ''} onChange={e=>updateRow(i,'billAmt',e.target.value)} className="w-full h-[22px] px-1 text-right text-[11px] font-bold outline-none bg-white focus:bg-yellow-50"/></td>
                            <td className="p-0 border-r border-[#c0c0c0] text-right px-2 font-bold">{r.balance}</td>
                            <td className="p-0 border-r border-[#c0c0c0]"><input type="number" value={r.paidAmt || ''} onChange={e=>updateRow(i,'paidAmt',e.target.value)} className="w-full h-[22px] px-1 text-right text-[11px] font-bold outline-none bg-white focus:bg-yellow-50"/></td>
                            <td className="p-0"><input type="number" value={r.discount || ''} onChange={e=>updateRow(i,'discount',e.target.value)} className="w-full h-[22px] px-1 text-right text-[11px] font-bold outline-none bg-white focus:bg-yellow-50"/></td>
                        </tr>))}
                        {/* Empty space below */}
                        <tr><td colSpan={8} className="h-[120px] bg-[#e8eef5]"></td></tr>
                    </tbody>
                </table>
            </div>

            {/* Balance + Total row */}
            <div className="flex items-center justify-end gap-3 mt-2 text-[12px] font-bold text-slate-900">
                <label>Balance</label>
                <input type="text" value={totalBalance.toFixed(2)} readOnly className={`${inp} w-28 text-right bg-white`}/>
                <label className="ml-4">Total</label>
                <input type="text" value={totalBill.toFixed(2)} readOnly className={`${inp} w-28 text-right bg-white`}/>
            </div>
        </div>

        {/* Spacer to push buttons to bottom */}
        <div className="flex-1"/>

        {/* Bottom action buttons (red) */}
        <div className="shrink-0 p-2 flex items-center justify-between" style={{background:'linear-gradient(180deg, #bbdefb 0%, #90caf9 100%)'}}>
            <div className="flex items-center gap-0">
                <button onClick={handleAdd} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">Add</button>
                <button onClick={handleEdit} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">Edit</button>
                <button onClick={handleDelete} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">Delete</button>
                <button onClick={handleView} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">View</button>
                <button onClick={handleSave} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">Close</button>
                <button onClick={handlePrint} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">Print</button>
            </div>
            <div className="flex items-center gap-0">
                <button onClick={()=>nav('first')} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">First</button>
                <button onClick={()=>nav('prev')} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">Prev</button>
                <button onClick={()=>nav('next')} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">Next</button>
                <button onClick={()=>nav('last')} className="bg-[#e74c3c] hover:bg-[#ec7063] text-white font-black px-6 py-1.5 text-[14px] border border-[#c0392b] shadow-sm active:translate-y-[1px]">Last</button>
            </div>
        </div>
    </div>);
}
