"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { Package, Search, Download, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Box, ShieldAlert, Activity, RefreshCw, Layers } from 'lucide-react';
import { ListItemsQuery } from '../../core/queries/pharma.query';
import { invalidateCache } from '../../core/queries/cache';

// Read sales reports from localStorage to compute stock usage
function loadReports() { try { return JSON.parse(localStorage.getItem('pos_reports') || '[]'); } catch { return []; } }

export default function InventoryModule() {
    const [items, setItems] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL'); // ALL | IN_STOCK | LOW | OUT | EXPIRED | EXPIRING
    const [lastRefresh, setLastRefresh] = useState(new Date());

    // Load items + reports
    const loadAll = async () => {
        setLoading(true);
        try {
            const list = await new ListItemsQuery().execute();
            setItems(list);
            setReports(loadReports());
            setLastRefresh(new Date());
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => {
        loadAll();
        // Auto-refresh every 30 seconds for real-time feel
        const interval = setInterval(() => {
            invalidateCache('pharma:items');
            loadAll();
        }, 30000);
        // Refresh when window gets focus
        const onFocus = () => { invalidateCache('pharma:items'); loadAll(); };
        window.addEventListener('focus', onFocus);
        // Refresh when localStorage changes (bill saved)
        const onStorage = (e) => { if (e.key === 'pos_reports') setReports(loadReports()); };
        window.addEventListener('storage', onStorage);
        return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); window.removeEventListener('storage', onStorage); };
    }, []);

    // ── Compute real-time stock status ──
    const enriched = useMemo(() => {
        // Count sold quantity per item from pos_reports
        const soldMap = {};
        reports.forEach(r => {
            (r.items || []).forEach(it => {
                const key = it.id || it.barcode;
                if (!key) return;
                soldMap[key] = (soldMap[key] || 0) + (parseFloat(it.qty) || 0);
            });
        });

        const now = new Date();
        return items.map(it => {
            const maxStock = parseFloat(it.maxStock) || parseFloat(it.maxStkQty) || 0;
            const minStock = parseFloat(it.minStock) || parseFloat(it.minStkQty) || 10;
            const sold = soldMap[it.code] || 0;
            const currentStock = Math.max(0, maxStock - sold);
            // Expiry check
            let expiryStatus = 'ok';
            if (it.expiryDate) {
                const exp = new Date(it.expiryDate + '-01');
                const daysToExpiry = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
                if (daysToExpiry <= 0) expiryStatus = 'expired';
                else if (daysToExpiry <= 90) expiryStatus = 'expiring';
            }
            // Stock status
            let stockStatus = 'ok';
            if (currentStock === 0) stockStatus = 'out';
            else if (currentStock <= minStock) stockStatus = 'low';
            const stockValue = currentStock * (parseFloat(it.costRate) || parseFloat(it.purchaseRate) || 0);
            return { ...it, currentStock, sold, stockStatus, expiryStatus, stockValue, maxStock, minStock };
        });
    }, [items, reports]);

    // Stats
    const stats = useMemo(() => {
        const total = enriched.length;
        const inStock = enriched.filter(i => i.stockStatus === 'ok').length;
        const low = enriched.filter(i => i.stockStatus === 'low').length;
        const out = enriched.filter(i => i.stockStatus === 'out').length;
        const expired = enriched.filter(i => i.expiryStatus === 'expired').length;
        const expiring = enriched.filter(i => i.expiryStatus === 'expiring').length;
        const totalStockValue = enriched.reduce((s, i) => s + (i.stockValue || 0), 0);
        const totalQty = enriched.reduce((s, i) => s + (i.currentStock || 0), 0);
        const totalSold = enriched.reduce((s, i) => s + (i.sold || 0), 0);
        return { total, inStock, low, out, expired, expiring, totalStockValue, totalQty, totalSold };
    }, [enriched]);

    // Filtered items
    const filtered = enriched.filter(it => {
        if (search) {
            const s = search.toLowerCase();
            if (!(it.itemName || '').toLowerCase().includes(s) &&
                !String(it.code).includes(search) &&
                !(it.brand || '').toLowerCase().includes(s) &&
                !(it.hsnCode || '').includes(search) &&
                !(it.batchNo || '').toLowerCase().includes(s)) return false;
        }
        if (filterStatus === 'IN_STOCK') return it.stockStatus === 'ok';
        if (filterStatus === 'LOW') return it.stockStatus === 'low';
        if (filterStatus === 'OUT') return it.stockStatus === 'out';
        if (filterStatus === 'EXPIRED') return it.expiryStatus === 'expired';
        if (filterStatus === 'EXPIRING') return it.expiryStatus === 'expiring';
        return true;
    });

    const exportCSV = () => {
        const headers = "Code,Item Name,Category,Brand,Batch,Expiry,MRP,Sales Rate,Purchase Rate,Max Stock,Min Stock,Sold,Current Stock,Stock Value,Status\n";
        const rows = enriched.map(i => [
            i.code, `"${i.itemName}"`, i.category, i.brand || '',
            i.batchNo || '', i.expiryDate || '',
            i.mrpRate, i.salesRate, i.purchaseRate,
            i.maxStock, i.minStock, i.sold, i.currentStock, i.stockValue.toFixed(2),
            i.stockStatus + (i.expiryStatus !== 'ok' ? '|' + i.expiryStatus : '')
        ].join(',')).join('\n');
        const blob = new Blob([headers + rows], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Inventory_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    };

    return (<div className="flex flex-col h-[85vh] bg-slate-50 rounded-xl overflow-hidden border border-slate-300 shadow-sm">

        {/* Header */}
        <div className="bg-gradient-to-r from-[#0f3460] to-[#1a5276] px-6 py-4 flex items-center justify-between shrink-0 border-b border-[#0a2540]">
            <div>
                <h1 className="text-xl font-black text-white flex items-center gap-2"><Package size={22}/> Inventory — Real-Time Stock</h1>
                <p className="text-cyan-200 text-[11px] font-bold mt-0.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
                    Live • Last update: {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    • Auto-refresh every 30s
                </p>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={()=>{ invalidateCache('pharma:items'); loadAll(); }} className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded border border-white/20 text-[12px] font-bold">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Refresh
                </button>
                <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[12px] font-bold">
                    <Download size={14}/> Export CSV
                </button>
            </div>
        </div>

        {/* ═══ STATS CARDS ═══ */}
        <div className="grid grid-cols-8 gap-2 p-3 bg-slate-100 border-b border-slate-300 shrink-0">
            <StatCard icon={Box} label="Total Items" value={stats.total} color="blue" />
            <StatCard icon={Layers} label="Total Qty" value={stats.totalQty.toFixed(0)} color="cyan" />
            <StatCard icon={CheckCircle} label="In Stock" value={stats.inStock} color="emerald" />
            <StatCard icon={TrendingDown} label="Low Stock" value={stats.low} color="amber" />
            <StatCard icon={ShieldAlert} label="Out of Stock" value={stats.out} color="red" />
            <StatCard icon={AlertTriangle} label="Expiring (90d)" value={stats.expiring} color="orange" />
            <StatCard icon={AlertTriangle} label="Expired" value={stats.expired} color="rose" />
            <StatCard icon={TrendingUp} label="Stock Value" value={`₹${stats.totalStockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} color="teal" />
        </div>

        {/* ═══ FILTERS + SEARCH ═══ */}
        <div className="bg-white px-4 py-2 flex items-center gap-2 shrink-0 border-b border-slate-300">
            <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500"/>
                <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, code, brand, HSN, batch..." className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded text-[12px] font-bold outline-none focus:border-[#2980b9] bg-white"/>
            </div>
            <div className="flex items-center gap-0.5">
                {[
                    { id: 'ALL', label: 'All' },
                    { id: 'IN_STOCK', label: 'In Stock' },
                    { id: 'LOW', label: 'Low', color: 'amber' },
                    { id: 'OUT', label: 'Out', color: 'red' },
                    { id: 'EXPIRING', label: 'Expiring', color: 'orange' },
                    { id: 'EXPIRED', label: 'Expired', color: 'rose' },
                ].map(f => (
                    <button key={f.id} onClick={()=>setFilterStatus(f.id)} className={`px-3 py-1.5 text-[11px] font-black uppercase border ${filterStatus === f.id ? 'bg-[#2980b9] text-white border-[#1a5276]' : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50'}`}>
                        {f.label}
                    </button>
                ))}
            </div>
            <span className="ml-auto text-[11px] font-bold text-slate-700">Showing {filtered.length} / {enriched.length}</span>
        </div>

        {/* ═══ TABLE ═══ */}
        <div className="flex-1 overflow-auto bg-white">
            {loading ? (
                <div className="flex items-center justify-center h-full text-slate-700 font-bold">Loading inventory...</div>
            ) : enriched.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-700">
                    <Box size={40} className="mb-2 text-slate-500"/>
                    <p className="font-bold">No items in inventory.</p>
                    <p className="text-[12px] font-bold mt-1">Add items in <span className="text-blue-700">Item Master</span> to see them here.</p>
                </div>
            ) : (
                <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-[#2c3e50] text-white sticky top-0 z-10 text-[10px] uppercase tracking-wider">
                        <tr>
                            <th className="py-2 px-2 text-left border-r border-[#1a2530]">Code</th>
                            <th className="py-2 px-2 text-left border-r border-[#1a2530]">Item Name</th>
                            <th className="py-2 px-2 text-left border-r border-[#1a2530]">Category</th>
                            <th className="py-2 px-2 text-left border-r border-[#1a2530]">Brand</th>
                            <th className="py-2 px-2 text-left border-r border-[#1a2530]">Batch</th>
                            <th className="py-2 px-2 text-left border-r border-[#1a2530]">Expiry</th>
                            <th className="py-2 px-2 text-right border-r border-[#1a2530]">Max</th>
                            <th className="py-2 px-2 text-right border-r border-[#1a2530]">Sold</th>
                            <th className="py-2 px-2 text-right border-r border-[#1a2530]">Stock</th>
                            <th className="py-2 px-2 text-right border-r border-[#1a2530]">MRP</th>
                            <th className="py-2 px-2 text-right border-r border-[#1a2530]">Rate</th>
                            <th className="py-2 px-2 text-right border-r border-[#1a2530]">Value</th>
                            <th className="py-2 px-2 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="font-bold text-slate-900">
                        {filtered.map((it, i) => (<tr key={it.id} className={`border-b border-slate-200 hover:bg-blue-50 ${it.stockStatus === 'out' ? 'bg-red-50' : it.stockStatus === 'low' ? 'bg-amber-50' : it.expiryStatus === 'expired' ? 'bg-rose-50' : it.expiryStatus === 'expiring' ? 'bg-orange-50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                            <td className="py-1.5 px-2 border-r border-slate-200 text-blue-700 font-mono font-black">{it.code}</td>
                            <td className="py-1.5 px-2 border-r border-slate-200">
                                <div>{it.itemName}</div>
                                {it.tamilName && <div className="text-[9px] text-slate-700">{it.tamilName}</div>}
                            </td>
                            <td className="py-1.5 px-2 border-r border-slate-200 text-[10px]">{it.category}</td>
                            <td className="py-1.5 px-2 border-r border-slate-200 text-[10px]">{it.brand || '-'}</td>
                            <td className="py-1.5 px-2 border-r border-slate-200 text-[10px] font-mono">{it.batchNo || '-'}</td>
                            <td className="py-1.5 px-2 border-r border-slate-200">
                                {it.expiryDate ? (
                                    <span className={`text-[10px] font-black ${it.expiryStatus === 'expired' ? 'text-rose-700' : it.expiryStatus === 'expiring' ? 'text-orange-700' : 'text-slate-900'}`}>
                                        {new Date(it.expiryDate + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                                        {it.expiryStatus === 'expired' && ' ⚠'}
                                        {it.expiryStatus === 'expiring' && ' ⚡'}
                                    </span>
                                ) : '-'}
                            </td>
                            <td className="py-1.5 px-2 border-r border-slate-200 text-right text-slate-700">{it.maxStock}</td>
                            <td className="py-1.5 px-2 border-r border-slate-200 text-right text-blue-700 font-black">{it.sold}</td>
                            <td className={`py-1.5 px-2 border-r border-slate-200 text-right font-black text-[13px] ${it.stockStatus === 'out' ? 'text-red-700' : it.stockStatus === 'low' ? 'text-amber-700' : 'text-emerald-700'}`}>{it.currentStock}</td>
                            <td className="py-1.5 px-2 border-r border-slate-200 text-right">₹{parseFloat(it.mrpRate).toFixed(2)}</td>
                            <td className="py-1.5 px-2 border-r border-slate-200 text-right">₹{parseFloat(it.salesRate).toFixed(2)}</td>
                            <td className="py-1.5 px-2 border-r border-slate-200 text-right text-teal-700 font-black">₹{it.stockValue.toFixed(2)}</td>
                            <td className="py-1.5 px-2 text-center">
                                <StatusBadge stockStatus={it.stockStatus} expiryStatus={it.expiryStatus}/>
                            </td>
                        </tr>))}
                        {filtered.length === 0 && <tr><td colSpan={13} className="py-10 text-center text-slate-700 font-bold">No items match your filter.</td></tr>}
                    </tbody>
                </table>
            )}
        </div>

        {/* Footer info */}
        <div className="bg-[#2c3e50] text-white px-4 py-1.5 text-[10px] font-bold shrink-0 flex items-center justify-between">
            <span>🟢 Real-time • Updates on bill save, tab focus, or every 30 seconds</span>
            <span>Total Stock Value: ₹{stats.totalStockValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
    </div>);
}

function StatCard({ icon: Icon, label, value, color }) {
    const colors = {
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        amber: 'bg-amber-50 text-amber-700 border-amber-200',
        red: 'bg-red-50 text-red-700 border-red-200',
        orange: 'bg-orange-50 text-orange-700 border-orange-200',
        rose: 'bg-rose-50 text-rose-700 border-rose-200',
        teal: 'bg-teal-50 text-teal-700 border-teal-200',
    };
    return (<div className={`p-2 rounded border ${colors[color] || colors.blue} flex flex-col`}>
        <div className="flex items-center gap-1.5 mb-0.5">
            <Icon size={12}/>
            <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-[18px] font-black leading-tight">{value}</span>
    </div>);
}

function StatusBadge({ stockStatus, expiryStatus }) {
    if (expiryStatus === 'expired') return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-600 text-white">EXPIRED</span>;
    if (stockStatus === 'out') return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-red-600 text-white">OUT</span>;
    if (stockStatus === 'low') return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500 text-white">LOW</span>;
    if (expiryStatus === 'expiring') return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-orange-500 text-white">EXPIRING</span>;
    return <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-600 text-white">OK</span>;
}
