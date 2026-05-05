"use client";
import React, { useState, useEffect, useRef } from 'react';
import { Minus, Square, X } from 'lucide-react';
import { ListTokensQuery, CreateTokenCommand, DeleteTokenCommand } from '../../core/queries/pharma.query';

export default function TokenEntryModule() {
    const [tokens, setTokens] = useState([]);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [tokenNo, setTokenNo] = useState('');
    const [patientName, setPatientName] = useState('');
    const [address, setAddress] = useState('');
    const [cellNo, setCellNo] = useState('');
    const [amount, setAmount] = useState('');
    const [injAmt, setInjAmt] = useState('');
    const [searchDate, setSearchDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedId, setSelectedId] = useState(null);
    const patientRef = useRef(null);

    useEffect(() => { loadAll(); }, []);
    useEffect(() => { computeNextTokenNo(date); }, [tokens, date]);

    const loadAll = async () => {
        try { const list = await new ListTokensQuery().execute(); setTokens(list); } catch (e) { console.error(e); }
    };

    const computeNextTokenNo = (forDate) => {
        const existing = tokens.filter(t => t.tokenDate === forDate);
        setTokenNo(String(existing.length + 1));
    };

    const total = (parseFloat(amount) || 0) + (parseFloat(injAmt) || 0);

    const resetForm = () => {
        setPatientName(''); setAddress(''); setCellNo('');
        setAmount(''); setInjAmt(''); setSelectedId(null);
        computeNextTokenNo(date);
        setTimeout(() => patientRef.current?.focus(), 10);
    };

    const handleSave = async () => {
        if (!patientName.trim()) return alert('Patient Name is required.');
        try {
            await new CreateTokenCommand().execute({
                tokenNo: parseInt(tokenNo) || 1,
                tokenDate: date,
                tokenTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
                patientName: patientName.trim(),
                address: address.trim(),
                cellNo: cellNo.trim(),
                amount: parseFloat(amount) || 0,
                injAmt: parseFloat(injAmt) || 0,
                total,
            });
            await loadAll();
            resetForm();
        } catch (err) { alert(err.message); }
    };

    const handlePrint = () => {
        if (!patientName.trim()) return alert('Enter details first.');
        const w = window.open('', '', 'width=400,height=500');
        if (w) {
            w.document.write(`<html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;padding:20px;text-align:center;max-width:300px;margin:0 auto}</style></head><body onload="window.print()">
<h2 style="font-weight:900;letter-spacing:2px">AVS ECOM</h2>
<p style="font-size:10px;color:#666;letter-spacing:2px;margin-top:4px">MEDICAL & PHARMACY</p>
<hr style="margin:12px 0;border:1px dashed #ccc">
<h1 style="font-size:48px;font-weight:900;color:#0f3460">Token ${tokenNo}</h1>
<p style="font-size:12px;margin-top:8px"><b>${patientName}</b></p>
${cellNo?`<p style="font-size:11px;color:#666">${cellNo}</p>`:''}
${address?`<p style="font-size:10px;color:#666;margin-top:2px">${address}</p>`:''}
<p style="font-size:11px;color:#666;margin-top:4px">${date}</p>
${total>0?`<p style="font-size:16px;font-weight:900;margin-top:12px">₹${total.toFixed(2)}</p>`:''}
<hr style="margin:12px 0;border:1px dashed #ccc">
<p style="font-size:9px;color:#999">Thank You!</p>
</body></html>`);
            w.document.close();
        }
    };

    const handleCancel = () => resetForm();

    const handleDelete = async () => {
        if (!selectedId) return alert('Select a record from the table below first.');
        if (!confirm('Delete this token?')) return;
        try { await new DeleteTokenCommand().execute(selectedId); await loadAll(); resetForm(); } catch (err) { alert(err.message); }
    };

    const loadRecord = (t) => {
        setSelectedId(t.id); setDate(t.tokenDate); setTokenNo(String(t.tokenNo));
        setPatientName(t.patientName); setAddress(t.address || ''); setCellNo(t.cellNo || '');
        setAmount(String(t.amount || '')); setInjAmt(String(t.injAmt || ''));
    };

    const filteredTokens = tokens.filter(t => t.tokenDate === searchDate);
    const searchTotal = filteredTokens.reduce((s, t) => s + (t.total || 0), 0);

    const inp = "bg-white border border-[#7a9ca8] h-[26px] px-2 text-[13px] font-bold text-slate-900 outline-none focus:border-[#1a5276] focus:bg-yellow-50";
    const lbl = "text-[14px] font-bold text-slate-900";

    return (
    <div className="flex items-center justify-center h-[85vh] font-sans p-4" style={{background:'transparent'}}>
        {/* Floating Windows-style dialog */}
        <div className="flex flex-col w-full max-w-[900px] shadow-2xl border-2 border-[#1a2530] rounded-sm overflow-hidden" style={{background:'#7fc8cc'}}>

            {/* Title bar: "Token Entry" + window controls */}
            <div className="h-[26px] flex items-center justify-between px-2 shrink-0 bg-gradient-to-r from-[#2c3e50] to-[#34495e] border-b border-[#1a2530]">
                <span className="text-white text-[12px] font-bold">Token Entry</span>
                <div className="flex items-center gap-0">
                    <button className="w-6 h-[22px] text-white hover:bg-slate-600 flex items-center justify-center"><Minus size={12}/></button>
                    <button className="w-6 h-[22px] text-white hover:bg-slate-600 flex items-center justify-center"><Square size={10}/></button>
                    <button className="w-6 h-[22px] text-white hover:bg-red-500 flex items-center justify-center"><X size={14}/></button>
                </div>
            </div>

            {/* Dark TOKEN ENTRY header */}
            <div className="h-[36px] bg-[#2c3e50] flex items-center justify-center shrink-0 border-b border-[#1a2530]">
                <h1 className="text-white text-[20px] font-black tracking-[5px]">TOKEN ENTRY</h1>
            </div>

            {/* Form body */}
            <div className="p-6" style={{background:'#7fc8cc'}}>
                {/* Row 1: Date + Token No */}
                <div className="flex items-center gap-3 mb-3">
                    <label className={`${lbl} w-28`}>Date</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className={`${inp} w-40`}/>
                    <label className={`${lbl} w-24 ml-6`}>Token No</label>
                    <input type="text" value={tokenNo} onChange={e => setTokenNo(e.target.value)} className={`${inp} flex-1`}/>
                </div>

                {/* Row 2: Patient Name */}
                <div className="flex items-center gap-3 mb-3">
                    <label className={`${lbl} w-28`}>Patient Name</label>
                    <input ref={patientRef} type="text" value={patientName} onChange={e => setPatientName(e.target.value)} className={`${inp} flex-1`} autoFocus/>
                </div>

                {/* Row 3: Address */}
                <div className="flex items-center gap-3 mb-3">
                    <label className={`${lbl} w-28`}>Address</label>
                    <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={`${inp} flex-1`}/>
                </div>

                {/* Row 4: CellNo */}
                <div className="flex items-center gap-3 mb-3">
                    <label className={`${lbl} w-28`}>CellNo</label>
                    <input type="tel" value={cellNo} onChange={e => setCellNo(e.target.value)} className={`${inp} flex-1`}/>
                </div>

                {/* Row 5: Amount + Inj.Amt + Total */}
                <div className="flex items-center gap-3 mb-5">
                    <label className={`${lbl} w-28`}>Amount</label>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className={`${inp} w-36`}/>
                    <label className={`${lbl} ml-3`}>Inj.Amt</label>
                    <input type="number" value={injAmt} onChange={e => setInjAmt(e.target.value)} className={`${inp} w-36`}/>
                    <label className={`${lbl} ml-3`}>Total</label>
                    <input type="text" value={total.toFixed(2)} readOnly className={`${inp} flex-1 bg-slate-100 cursor-not-allowed text-right font-black`}/>
                </div>

                {/* Action buttons */}
                <div className="flex items-center justify-center gap-0 my-4">
                    <button onClick={handleSave} className="bg-[#7fc8cc] hover:bg-[#6bb8bc] border-[1.5px] border-[#1a2530] px-10 py-1.5 text-slate-900 font-black text-[13px] active:translate-y-[1px] transition">Save</button>
                    <button onClick={handlePrint} className="bg-[#7fc8cc] hover:bg-[#6bb8bc] border-[1.5px] border-[#1a2530] border-l-0 px-10 py-1.5 text-slate-900 font-black text-[13px] active:translate-y-[1px] transition">Print</button>
                    <button onClick={handleCancel} className="bg-[#7fc8cc] hover:bg-[#6bb8bc] border-[1.5px] border-[#1a2530] border-l-0 px-10 py-1.5 text-slate-900 font-black text-[13px] active:translate-y-[1px] transition">Cancel</button>
                    <button onClick={handleDelete} className="bg-[#7fc8cc] hover:bg-[#6bb8bc] border-[1.5px] border-[#1a2530] border-l-0 px-10 py-1.5 text-slate-900 font-black text-[13px] active:translate-y-[1px] transition">Delete</button>
                </div>

                {/* Search row */}
                <div className="flex items-center gap-3 mt-3 mb-2">
                    <label className={`${lbl} w-28`}>Search by Date</label>
                    <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} className={`${inp} w-40`}/>
                    <button className="bg-[#7fc8cc] hover:bg-[#6bb8bc] border-[1.5px] border-[#1a2530] px-5 py-1 text-slate-900 font-black text-[13px] active:translate-y-[1px] transition">Search</button>
                    <label className={`${lbl} ml-auto`}>Total</label>
                    <input type="text" value={searchTotal.toFixed(2)} readOnly className={`${inp} w-36 bg-slate-100 cursor-not-allowed text-right font-black`}/>
                </div>

                {/* Results table */}
                <div className="bg-white border border-[#7a9ca8] overflow-hidden mt-1">
                    <table className="w-full text-[12px] border-collapse">
                        <thead>
                            <tr className="bg-white border-b border-[#7a9ca8] text-slate-900 text-[12px] font-bold">
                                <th className="py-1.5 px-2 border-r border-[#c0d0d8] text-left w-14">Id</th>
                                <th className="py-1.5 px-2 border-r border-[#c0d0d8] text-left w-28">Date</th>
                                <th className="py-1.5 px-2 border-r border-[#c0d0d8] text-left w-24">TokenNo</th>
                                <th className="py-1.5 px-2 border-r border-[#c0d0d8] text-left">Name</th>
                                <th className="py-1.5 px-2 border-r border-[#c0d0d8] text-left">Address</th>
                                <th className="py-1.5 px-2 border-r border-[#c0d0d8] text-left w-28">CellNo</th>
                                <th className="py-1.5 px-2 text-left w-20">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTokens.length === 0 ? (
                                <tr className="h-[26px] border-b border-[#e0e6ec] bg-white">
                                    <td className="py-1 px-2 border-r border-[#e0e6ec] text-blue-700 text-center font-black">*</td>
                                    <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                    <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                    <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                    <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                    <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                    <td className="py-1 px-2"></td>
                                </tr>
                            ) : (
                                filteredTokens.map(t => (
                                    <tr key={t.id} onClick={() => loadRecord(t)} className={`border-b border-[#e0e6ec] h-[26px] cursor-pointer text-[12px] text-slate-900 ${selectedId === t.id ? 'bg-yellow-100' : 'bg-white hover:bg-blue-50'}`}>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec] text-slate-900 font-mono font-bold">{String(t.id).slice(-6)}</td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec] text-slate-900 font-bold">{new Date(t.tokenDate).toLocaleDateString('en-IN')}</td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec] text-slate-900 font-black">{t.tokenNo}</td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec] text-slate-900 font-bold uppercase">{t.patientName}</td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec] text-slate-900">{t.address}</td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec] text-slate-900">{t.cellNo}</td>
                                        <td className="py-1 px-2 text-right text-slate-900 font-bold">₹{(t.total || 0).toFixed(2)}</td>
                                    </tr>
                                ))
                            )}
                            {/* Extra empty space to give the "table with rows" look */}
                            {filteredTokens.length > 0 && filteredTokens.length < 5 && (
                                Array.from({ length: 5 - filteredTokens.length }).map((_, i) => (
                                    <tr key={`empty-${i}`} className="h-[26px] border-b border-[#e0e6ec] bg-white">
                                        <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                        <td className="py-1 px-2 border-r border-[#e0e6ec]"></td>
                                        <td className="py-1 px-2"></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>);
}
