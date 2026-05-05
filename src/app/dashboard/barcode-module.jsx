"use client";
import React, { useState } from 'react';
import { ScanLine, Printer, Search, RefreshCw, CheckCircle, Settings, FileText, AlertTriangle } from 'lucide-react';
const DUMMY_PRODUCTS = [
    { id: '1', name: 'Aashirvaad Atta 5kg', sku: 'AASH-5KG', barcode: '8901001001001', stock: 150 },
    { id: '2', name: 'Fortune Sunflower Oil 1L', sku: 'FORT-1L', barcode: '8901001001002', stock: 45 },
    { id: '3', name: 'Coca Cola 2L', sku: 'COCA-2L', barcode: '', stock: 80 },
    { id: '4', name: 'Lays Classic Salted 50g', sku: 'LAYS-50', barcode: '8901001001004', stock: 200 },
    { id: '5', name: 'Britannia Good Day 60g', sku: 'GOOD-60', barcode: '', stock: 300 },
    { id: '6', name: 'Colgate Toothpaste 200g', sku: 'COLG-200', barcode: '', stock: 65 },
];
export default function BarcodeModule() {
    const [activeTab, setActiveTab] = useState('manage');
    const [products, setProducts] = useState(DUMMY_PRODUCTS);
    const [search, setSearch] = useState('');
    const [printQueue, setPrintQueue] = useState([]);
    const [printFormat, setPrintFormat] = useState('sticker_50x25');
    const filtered = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));
    // Auto-generate EAN-13 style dummy code
    const generateBarcode = (id) => {
        const code = '890' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
        setProducts(prev => prev.map(p => p.id === id ? { ...p, barcode: code } : p));
    };
    const addToPrintQueue = (p) => {
        if (!p.barcode)
            return alert('Cannot print label without a barcode!');
        if (!printQueue.find(q => q.id === p.id)) {
            setPrintQueue([...printQueue, { ...p, copies: 1 }]);
        }
    };
    const updatePrintCopies = (id, delta) => {
        setPrintQueue(prev => prev.map(q => q.id === id ? { ...q, copies: Math.max(1, q.copies + delta) } : q));
    };
    return (<div className="flex flex-col h-[85vh] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden font-sans">
      
      {/* HEADER */}
      <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
        <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
          <ScanLine className="text-emerald-600"/> Barcode Management System
        </h2>
        <div className="flex gap-2 bg-slate-200/50 p-1 rounded-lg border border-slate-200">
           <button onClick={() => setActiveTab('manage')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all ${activeTab === 'manage' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-800 hover:text-slate-700'}`}>Assign Barcodes</button>
           <button onClick={() => setActiveTab('print')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-all flex items-center gap-2 ${activeTab === 'print' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-800 hover:text-slate-700'}`}>
             <Printer size={16}/> Print Labels {printQueue.length > 0 && <span className="bg-emerald-800 text-white text-xs px-1.5 rounded-full">{printQueue.length}</span>}
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {/* --- TAB 1: MANAGE BARCODES --- */}
        {activeTab === 'manage' && (<div className="h-full flex flex-col bg-slate-50">
             <div className="p-4 bg-white border-b border-slate-200 flex gap-4 shrink-0">
                <div className="relative flex-1 max-w-md">
                   <Search className="absolute left-3 top-2.5 text-slate-700" size={18}/>
                   <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items by name or SKU..." className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"/>
                </div>
                <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold rounded-lg text-sm flex items-center gap-2 border border-slate-200"><Settings size={16}/> Auto-Generate Missing</button>
             </div>

             <div className="flex-1 overflow-auto p-4 md:p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filtered.map(p => (<div key={p.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between group hover:border-emerald-300 transition-colors">
                        <div>
                           <h3 className="font-bold text-slate-800 line-clamp-1">{p.name}</h3>
                           <div className="text-xs text-slate-800 font-mono mt-1">SKU: {p.sku} • Stock: {p.stock}</div>
                           
                           <div className="mt-3 flex items-center gap-2">
                             {p.barcode ? (<span className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-md text-xs font-black border border-emerald-200 font-mono tracking-widest"><CheckCircle size={14}/> {p.barcode}</span>) : (<span className="flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1 rounded-md text-xs font-bold border border-amber-200"><AlertTriangle size={14}/> No Barcode Assigned</span>)}
                           </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0 ml-4">
                           {!p.barcode && (<button onClick={() => generateBarcode(p.id)} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold flex items-center justify-center gap-1 shadow-sm"><RefreshCw size={12}/> Generate Formatted</button>)}
                           {p.barcode && (<button onClick={() => addToPrintQueue(p)} className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 text-slate-900 rounded text-xs font-bold flex items-center justify-center gap-1 transition-all"><Printer size={12}/> Add to Printer</button>)}
                        </div>
                     </div>))}
                  {filtered.length === 0 && <div className="col-span-1 lg:col-span-2 text-center py-12 text-slate-700 font-bold">No products match your search.</div>}
                </div>
             </div>
          </div>)}

        {/* --- TAB 2: PRINT PRINTER QUEUE --- */}
        {activeTab === 'print' && (<div className="h-full flex overflow-hidden">
             
             {/* Left List: The Queue */}
             <div className="w-[350px] bg-white border-r border-slate-200 flex flex-col shrink-0">
                <div className="p-4 bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-700 flex justify-between items-center">
                  <span>Items to Print ({printQueue.length})</span>
                  <button onClick={() => setPrintQueue([])} className="text-xs text-red-500 hover:underline">Clear</button>
                </div>
                
                <div className="flex-1 overflow-auto p-4 space-y-3 bg-slate-50/50">
                  {printQueue.length === 0 ? (<div className="text-center py-10 text-slate-700 font-bold text-sm border-2 border-dashed border-slate-200 rounded-xl bg-white p-4">Select items from the "Assign" tab to print barcode labels.</div>) : printQueue.map(q => (<div key={q.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-sm">
                        <div className="font-bold text-slate-800 line-clamp-1">{q.name}</div>
                        <div className="text-[10px] text-emerald-600 font-black font-mono tracking-widest mt-1">{q.barcode}</div>
                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100">
                           <span className="text-xs font-bold text-slate-800">Copies:</span>
                           <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-0.5 border border-slate-200 mx-1">
                               <button onClick={() => updatePrintCopies(q.id, -1)} className="p-1 px-2 text-slate-800 hover:bg-white rounded shadow-sm font-black">-</button>
                               <span className="w-4 text-center font-black text-xs">{q.copies}</span>
                               <button onClick={() => updatePrintCopies(q.id, 1)} className="p-1 px-2 text-slate-800 hover:bg-white rounded shadow-sm font-black">+</button>
                           </div>
                           <button onClick={() => setPrintQueue(prev => prev.filter(x => x.id !== q.id))} className="text-xs text-red-500 font-bold hover:underline">Remove</button>
                        </div>
                     </div>))}
                </div>
                
                <div className="p-4 bg-white border-t border-slate-200">
                   <button disabled={printQueue.length === 0} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl shadow-md transition disabled:opacity-80 flex items-center justify-center gap-2"><Printer size={18}/> Print {printQueue.reduce((a, b) => a + b.copies, 0)} Labels</button>
                </div>
             </div>

             {/* Right View: Print Preview */}
             <div className="flex-1 bg-slate-200/50 flex flex-col p-6 overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-black text-slate-700 flex items-center gap-2"><FileText size={18}/> Live Print Preview</h3>
                  <select value={printFormat} onChange={e => setPrintFormat(e.target.value)} className="p-2 border border-slate-300 rounded-lg text-sm font-bold shadow-sm outline-none w-48 bg-white">
                    <option value="sticker_50x25">Thermal 50x25mm</option>
                    <option value="a4_sheet">A4 Label Sheet (3x8)</option>
                  </select>
                </div>

                <div className="flex-1 bg-white border border-slate-300 shadow-lg rounded-xl overflow-auto p-8 flex justify-center items-start">
                  
                  {printQueue.length === 0 ? (<div className="m-auto text-slate-900 flex flex-col items-center">
                      <Printer size={64} className="mb-4 opacity-80"/>
                      <p className="font-black text-2xl">Preview Area Blank</p>
                    </div>) : (<div className="grid gap-4 w-full max-w-2xl" style={{ gridTemplateColumns: printFormat === 'a4_sheet' ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)' }}>
                       {printQueue.flatMap(q => Array(q.copies).fill(q)).map((q, idx) => (<div key={idx} className="border-2 border-slate-900 border-dashed p-3 flex flex-col items-center text-center bg-white">
                              <div className="text-[10px] font-bold text-slate-800 truncate w-full mb-1">{q.name}</div>
                              <div className="text-[9px] text-slate-800 font-bold mb-1 truncate w-full">{q.sku} | MRP: ₹{Math.floor(Math.random() * 200 + 50)}.00</div>
                              
                              {/* Pseudo-Barcode Visual */}
                              <div className="flex h-10 w-full justify-center items-end overflow-hidden px-2 my-1 opacity-80">
                                 {q.barcode.split('').map((char, i) => {
                        const w = (parseInt(char, 10) % 3) + 1; // Simulate random widths 1-3px
                        return <div key={i} className="bg-black mix-blend-multiply flex-shrink-0" style={{ width: `${w}px`, height: '100%', marginRight: '2px' }}/>;
                    })}
                              </div>
                              <div className="text-[11px] font-mono font-black tracking-[0.2em]">{q.barcode}</div>
                           </div>))}
                    </div>)}
                </div>
             </div>
          </div>)}
      </div>
    </div>);
}
