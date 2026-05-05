"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Download, Trash2, Search, ShoppingCart, ShoppingBag, Box, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { ListItemsQuery, ListPurchasesQuery } from '../../core/queries/pharma.query';

export default function ReportModule({ initialReport = 'purchase' }) {
    const [reportType, setReportType] = useState(initialReport);
    const [view, setView] = useState('bill');
    const [reports, setReports] = useState([]);     // sales bills (localStorage)
    const [purchases, setPurchases] = useState([]); // purchase entries (Vendure)
    const [pharmaItems, setPharmaItems] = useState([]); // for stock report
    const [search, setSearch] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [expandedKey, setExpandedKey] = useState(null);

    useEffect(() => {
        try { setReports(JSON.parse(localStorage.getItem('pos_reports') || '[]')); } catch { setReports([]); }
        new ListItemsQuery().execute().then(setPharmaItems).catch(()=>{});
        new ListPurchasesQuery().execute().then(setPurchases).catch(()=>{});
    }, []);

    const filteredReports = useMemo(() => {
        const s = search.trim().toLowerCase();
        return reports.filter(r => {
            if (fromDate || toDate) {
                const t = new Date(r.timestamp || r.date);
                if (fromDate && t < new Date(fromDate)) return false;
                if (toDate && t > new Date(toDate + 'T23:59:59')) return false;
            }
            if (!s) return true;
            return (r.billNo && String(r.billNo).toLowerCase().includes(s))
                || (r.customer?.name && r.customer.name.toLowerCase().includes(s))
                || (r.customer?.phone && r.customer.phone.includes(s))
                || (r.items || []).some(it => (it.name || '').toLowerCase().includes(s));
        });
    }, [reports, search, fromDate, toDate]);

    const itemAggregates = useMemo(() => {
        const map = {};
        filteredReports.forEach(bill => {
            (bill.items || []).forEach(it => {
                const key = `${it.id || it.barcode || it.name}::${it.name}`;
                if (!map[key]) map[key] = { code: it.id || it.barcode || '', name: it.name, totalQty: 0, totalRevenue: 0, bills: [] };
                map[key].totalQty += parseFloat(it.qty) || 0;
                map[key].totalRevenue += parseFloat(it.total) || 0;
                map[key].bills.push({ billNo: bill.billNo, date: bill.date, customer: bill.customer?.name, qty: it.qty, total: it.total });
            });
        });
        const arr = Object.values(map);
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            return arr.filter(x => x.name.toLowerCase().includes(s) || String(x.code).toLowerCase().includes(s));
        }
        return arr.sort((a,b) => b.totalRevenue - a.totalRevenue);
    }, [filteredReports, search]);

    // ── PURCHASE REPORT data ──
    const filteredPurchases = useMemo(() => {
        const s = search.trim().toLowerCase();
        return purchases.filter(p => {
            if (fromDate || toDate) {
                const t = new Date(p.purDate || p.createdAt);
                if (fromDate && t < new Date(fromDate)) return false;
                if (toDate && t > new Date(toDate + 'T23:59:59')) return false;
            }
            if (!s) return true;
            return (p.purNo && String(p.purNo).toLowerCase().includes(s))
                || (p.invNo && String(p.invNo).toLowerCase().includes(s))
                || (p.supplier && p.supplier.toLowerCase().includes(s))
                || (p.rows || []).some(it => (it.itemName || '').toLowerCase().includes(s));
        });
    }, [purchases, search, fromDate, toDate]);

    // Item-wise aggregate of purchases (which item we bought, total qty + cost)
    const purchaseItemAggregates = useMemo(() => {
        const map = {};
        filteredPurchases.forEach(pur => {
            (pur.rows || []).forEach(row => {
                if (!row.itemName) return;
                const key = `${row.itemCode || row.itemName}::${row.itemName}`;
                if (!map[key]) map[key] = { code: row.itemCode || '', name: row.itemName, totalQty: 0, totalCost: 0, purchases: [] };
                map[key].totalQty += parseFloat(row.qty) || 0;
                map[key].totalCost += parseFloat(row.amount) || 0;
                map[key].purchases.push({ purNo: pur.purNo, invNo: pur.invNo, date: pur.purDate, supplier: pur.supplier, qty: row.qty, amount: row.amount });
            });
        });
        const arr = Object.values(map);
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            return arr.filter(x => x.name.toLowerCase().includes(s) || String(x.code).toLowerCase().includes(s));
        }
        return arr.sort((a,b) => b.totalCost - a.totalCost);
    }, [filteredPurchases, search]);

    const purchaseTotals = useMemo(() => ({
        count: filteredPurchases.length,
        totalAmount: filteredPurchases.reduce((s, p) => s + (p.totalAmount || 0), 0),
        totalTax: filteredPurchases.reduce((s, p) => s + (p.totalTax || 0), 0),
        totalDisc: filteredPurchases.reduce((s, p) => s + (p.totalDiscA || 0), 0),
        netAmount: filteredPurchases.reduce((s, p) => s + (p.netAmount || 0), 0),
    }), [filteredPurchases]);

    const stockData = useMemo(() => {
        const s = search.trim().toLowerCase();
        return pharmaItems.filter(it => {
            if (!s) return true;
            return (it.itemName || '').toLowerCase().includes(s) || String(it.code).toLowerCase().includes(s);
        }).map(it => {
            const stock = it.minStkQty != null && it.minStkQty !== '' ? parseFloat(it.minStkQty)
                        : it.minStock != null && it.minStock !== '' ? parseFloat(it.minStock)
                        : null;
            const status = stock == null ? 'unknown' : stock <= 0 ? 'out' : stock <= 5 ? 'low' : 'good';
            return { ...it, stock, status };
        }).sort((a,b) => (a.status === 'out' ? -1 : b.status === 'out' ? 1 : a.status === 'low' ? -1 : b.status === 'low' ? 1 : 0));
    }, [pharmaItems, search]);

    const totals = useMemo(() => {
        const subtotal = filteredReports.reduce((s, r) => s + (r.grandTotal || 0), 0);
        const cash = filteredReports.reduce((s, r) => s + (r.cashAmount || 0), 0);
        const upi = filteredReports.reduce((s, r) => s + (r.upiAmount || 0), 0);
        const card = filteredReports.reduce((s, r) => s + (r.cardAmount || 0), 0);
        const credit = filteredReports.filter(r => (r.saleType === 'CREDIT')).reduce((s, r) => s + (r.balance || r.grandTotal || 0), 0);
        return { count: filteredReports.length, subtotal, cash, upi, card, credit };
    }, [filteredReports]);

    const exportCSV = () => {
        let csv = '';
        if (reportType === 'sales' && view === 'bill') {
            csv = "BillNo,Date,Customer,Phone,Mode,Items,GrandTotal,Cash,UPI,Card\n" +
                filteredReports.map(r => `${r.billNo},${r.date},${r.customer?.name||''},${r.customer?.phone||''},${r.saleType},${r.items?.length||0},${r.grandTotal},${r.cashAmount||0},${r.upiAmount||0},${r.cardAmount||0}`).join('\n');
        } else if (reportType === 'sales' && view === 'item') {
            csv = "Code,Item Name,Total Qty,Total Revenue\n" +
                itemAggregates.map(x => `${x.code},${x.name},${x.totalQty},${x.totalRevenue.toFixed(2)}`).join('\n');
        } else if (reportType === 'purchase' && view === 'bill') {
            csv = "PurNo,InvNo,Date,Supplier,Items,TotalAmount,Tax,Discount,NetAmount\n" +
                filteredPurchases.map(p => `${p.purNo},${p.invNo||''},${p.purDate},${p.supplier||''},${(p.rows||[]).filter(r=>r.itemName).length},${p.totalAmount||0},${p.totalTax||0},${p.totalDiscA||0},${p.netAmount||0}`).join('\n');
        } else if (reportType === 'purchase' && view === 'item') {
            csv = "Code,Item Name,Total Qty Bought,Total Cost\n" +
                purchaseItemAggregates.map(x => `${x.code},${x.name},${x.totalQty},${x.totalCost.toFixed(2)}`).join('\n');
        } else {
            csv = "Code,Item Name,Brand,Category,Stock,Status,Sales Rate,MRP\n" +
                stockData.map(x => `${x.code},${x.itemName},${x.brand||''},${x.category||''},${x.stock??'—'},${x.status},${x.salesRate||0},${x.mrpRate||0}`).join('\n');
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${reportType}-${view}-report.csv`; a.click();
    };

    const clearReports = () => {
        if (confirm('Clear all sales reports? This cannot be undone.')) {
            localStorage.removeItem('pos_reports');
            setReports([]);
        }
    };

    const renderTopTabs = () => {
        const tabs = [
            { id: 'purchase', label: 'Purchase Report', icon: ShoppingCart, num: 1 },
            { id: 'sales',    label: 'Sales Report',    icon: ShoppingBag, num: 2 },
            { id: 'stock',    label: 'Stock Report',    icon: Box,         num: 3 },
        ];
        return (<div className="flex bg-slate-100 p-1 rounded-lg border border-slate-300 w-fit">
            {tabs.map(t => {
                const I = t.icon;
                const active = reportType === t.id;
                return (<button key={t.id} onClick={() => { setReportType(t.id); setExpandedKey(null); }}
                    className={`flex items-center gap-2 px-5 py-2 text-xs font-black uppercase tracking-widest rounded transition ${active ? 'bg-[#1a5276] text-white shadow' : 'text-slate-700 hover:bg-white'}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${active ? 'bg-white text-[#1a5276]' : 'bg-slate-300 text-slate-700'}`}>{t.num}</span>
                    <I size={14}/> {t.label}
                </button>);
            })}
        </div>);
    };

    const renderViewTabs = () => {
        if (reportType === 'stock') return null;
        const tabs = [
            { id: 'bill', label: 'Bill-wise',  hint: 'Each bill, all its items' },
            { id: 'item', label: 'Item-wise',  hint: 'Each item, total sold across bills' },
        ];
        return (<div className="flex bg-white p-0.5 rounded-md border border-slate-300">
            {tabs.map(t => {
                const active = view === t.id;
                return (<button key={t.id} onClick={() => { setView(t.id); setExpandedKey(null); }}
                    className={`px-4 py-1.5 text-[11px] font-black uppercase rounded transition ${active ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                    title={t.hint}>{t.label}</button>);
            })}
        </div>);
    };

    const renderBillWise = () => (<div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-[12px]">
            <thead className="bg-[#1a5276] text-white">
                <tr>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider w-8"></th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Bill No</th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Date</th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Customer</th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Mode</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Items</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Total</th>
                </tr>
            </thead>
            <tbody>
                {filteredReports.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-slate-500 font-bold">No bills found.</td></tr>
                ) : filteredReports.map((r, i) => {
                    const key = (r.invoiceId || r.billNo || 'row') + '_' + i;
                    const expanded = expandedKey === key;
                    return (<React.Fragment key={key}>
                        <tr onClick={() => setExpandedKey(expanded ? null : key)}
                            className={`cursor-pointer border-b border-slate-200 ${expanded ? 'bg-yellow-50' : 'hover:bg-blue-50'}`}>
                            <td className="px-3 py-1.5 text-slate-500">{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
                            <td className="px-3 py-1.5 font-black text-slate-900">{r.billNo}</td>
                            <td className="px-3 py-1.5 font-bold text-slate-700">{r.date}</td>
                            <td className="px-3 py-1.5 font-bold text-slate-700">{r.customer?.name || 'Walk-in'} <span className="text-[10px] text-slate-500">{r.customer?.phone || ''}</span></td>
                            <td className="px-3 py-1.5"><span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded ${r.saleType === 'CREDIT' ? 'bg-orange-100 text-orange-700' : r.saleType === 'OFFLINE' || r.saleType === 'CASH' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{r.saleType}</span></td>
                            <td className="px-3 py-1.5 text-right font-black text-slate-900">{r.items?.length || 0}</td>
                            <td className="px-3 py-1.5 text-right font-black text-emerald-700">₹{(r.grandTotal || 0).toLocaleString()}</td>
                        </tr>
                        {expanded && (<tr><td colSpan={7} className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                            <div className="bg-white rounded border border-slate-200">
                                <table className="w-full text-[11px]">
                                    <thead className="bg-slate-100"><tr>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Code</th>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Item</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Qty</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Rate</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Amount</th>
                                    </tr></thead>
                                    <tbody>
                                        {(r.items || []).map((it, j) => (<tr key={j} className="border-b border-slate-100">
                                            <td className="px-2 py-1 font-bold text-slate-700">{it.id || it.barcode}</td>
                                            <td className="px-2 py-1 font-black text-slate-900">{it.name}</td>
                                            <td className="px-2 py-1 text-right font-bold">{it.qty}</td>
                                            <td className="px-2 py-1 text-right font-bold">₹{parseFloat(it.price).toFixed(2)}</td>
                                            <td className="px-2 py-1 text-right font-black text-emerald-700">₹{parseFloat(it.total).toFixed(2)}</td>
                                        </tr>))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-2 flex justify-end gap-4 text-[11px] font-bold">
                                <span>Subtotal: ₹{(r.subtotal || 0).toFixed(2)}</span>
                                <span>Tax: ₹{(r.taxAmount || 0).toFixed(2)}</span>
                                <span>Discount: ₹{(r.discount || 0).toFixed(2)}</span>
                                <span className="text-emerald-700">Grand Total: ₹{(r.grandTotal || 0).toFixed(2)}</span>
                            </div>
                        </td></tr>)}
                    </React.Fragment>);
                })}
            </tbody>
        </table>
    </div>);

    const renderItemWise = () => (<div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-[12px]">
            <thead className="bg-[#1a5276] text-white">
                <tr>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider w-8"></th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Code</th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Item Name</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Total Qty Sold</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Total Revenue</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Bills</th>
                </tr>
            </thead>
            <tbody>
                {itemAggregates.length === 0 ? (
                    <tr><td colSpan={6} className="py-12 text-center text-slate-500 font-bold">No items sold in this period.</td></tr>
                ) : itemAggregates.map((x, i) => {
                    const key = x.code + '_' + x.name + '_' + i;
                    const expanded = expandedKey === key;
                    return (<React.Fragment key={key}>
                        <tr onClick={() => setExpandedKey(expanded ? null : key)}
                            className={`cursor-pointer border-b border-slate-200 ${expanded ? 'bg-yellow-50' : 'hover:bg-blue-50'}`}>
                            <td className="px-3 py-1.5 text-slate-500">{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
                            <td className="px-3 py-1.5 font-black text-slate-700">{x.code}</td>
                            <td className="px-3 py-1.5 font-black text-slate-900">{x.name}</td>
                            <td className="px-3 py-1.5 text-right font-black">{x.totalQty}</td>
                            <td className="px-3 py-1.5 text-right font-black text-emerald-700">₹{x.totalRevenue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-slate-700">{x.bills.length}</td>
                        </tr>
                        {expanded && (<tr><td colSpan={6} className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                            <div className="bg-white rounded border border-slate-200">
                                <table className="w-full text-[11px]">
                                    <thead className="bg-slate-100"><tr>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Bill No</th>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Date</th>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Customer</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Qty</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Total</th>
                                    </tr></thead>
                                    <tbody>
                                        {x.bills.map((b, j) => (<tr key={j} className="border-b border-slate-100">
                                            <td className="px-2 py-1 font-bold text-slate-700">{b.billNo}</td>
                                            <td className="px-2 py-1 font-bold text-slate-700">{b.date}</td>
                                            <td className="px-2 py-1 font-bold text-slate-900">{b.customer || '—'}</td>
                                            <td className="px-2 py-1 text-right font-black">{b.qty}</td>
                                            <td className="px-2 py-1 text-right font-black text-emerald-700">₹{parseFloat(b.total).toFixed(2)}</td>
                                        </tr>))}
                                    </tbody>
                                </table>
                            </div>
                        </td></tr>)}
                    </React.Fragment>);
                })}
            </tbody>
        </table>
    </div>);

    // ── PURCHASE: Bill-wise (each purchase entry, expand to see items) ──
    const renderPurchaseBillWise = () => (<div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-[12px]">
            <thead className="bg-[#1a5276] text-white">
                <tr>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider w-8"></th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Pur No</th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Inv No</th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Date</th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Supplier</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Items</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Total</th>
                </tr>
            </thead>
            <tbody>
                {filteredPurchases.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-slate-500 font-bold">No purchase entries found.</td></tr>
                ) : filteredPurchases.map((p, i) => {
                    const key = (p.id || p.purNo || 'pur') + '_' + i;
                    const expanded = expandedKey === key;
                    return (<React.Fragment key={key}>
                        <tr onClick={() => setExpandedKey(expanded ? null : key)}
                            className={`cursor-pointer border-b border-slate-200 ${expanded ? 'bg-yellow-50' : 'hover:bg-blue-50'}`}>
                            <td className="px-3 py-1.5 text-slate-500">{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
                            <td className="px-3 py-1.5 font-black text-slate-900">{p.purNo}</td>
                            <td className="px-3 py-1.5 font-bold text-slate-700">{p.invNo || '—'}</td>
                            <td className="px-3 py-1.5 font-bold text-slate-700">{p.purDate}</td>
                            <td className="px-3 py-1.5 font-bold text-slate-700">{p.supplier || '—'}</td>
                            <td className="px-3 py-1.5 text-right font-black text-slate-900">{(p.rows || []).filter(r => r.itemName).length}</td>
                            <td className="px-3 py-1.5 text-right font-black text-emerald-700">₹{(p.netAmount || p.totalAmount || 0).toLocaleString()}</td>
                        </tr>
                        {expanded && (<tr><td colSpan={7} className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                            <div className="bg-white rounded border border-slate-200">
                                <table className="w-full text-[11px]">
                                    <thead className="bg-slate-100"><tr>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Code</th>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Item</th>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Batch</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Qty</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Pu Rate</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Amount</th>
                                    </tr></thead>
                                    <tbody>
                                        {(p.rows || []).filter(r => r.itemName).map((row, j) => (<tr key={j} className="border-b border-slate-100">
                                            <td className="px-2 py-1 font-bold text-slate-700">{row.itemCode}</td>
                                            <td className="px-2 py-1 font-black text-slate-900">{row.itemName}</td>
                                            <td className="px-2 py-1 font-bold text-slate-700">{row.batchNo || '—'}</td>
                                            <td className="px-2 py-1 text-right font-bold">{row.qty}</td>
                                            <td className="px-2 py-1 text-right font-bold">₹{parseFloat(row.puRate || 0).toFixed(2)}</td>
                                            <td className="px-2 py-1 text-right font-black text-emerald-700">₹{parseFloat(row.amount || 0).toFixed(2)}</td>
                                        </tr>))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-2 flex justify-end gap-4 text-[11px] font-bold">
                                <span>Total: ₹{(p.totalAmount || 0).toFixed(2)}</span>
                                <span>Tax: ₹{(p.totalTax || 0).toFixed(2)}</span>
                                <span>Discount: ₹{(p.totalDiscA || 0).toFixed(2)}</span>
                                <span className="text-emerald-700">Net: ₹{(p.netAmount || 0).toFixed(2)}</span>
                            </div>
                        </td></tr>)}
                    </React.Fragment>);
                })}
            </tbody>
        </table>
    </div>);

    // ── PURCHASE: Item-wise (which item bought, total qty across purchases) ──
    const renderPurchaseItemWise = () => (<div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-[12px]">
            <thead className="bg-[#1a5276] text-white">
                <tr>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider w-8"></th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Code</th>
                    <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Item Name</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Total Qty Bought</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Total Cost</th>
                    <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Purchases</th>
                </tr>
            </thead>
            <tbody>
                {purchaseItemAggregates.length === 0 ? (
                    <tr><td colSpan={6} className="py-12 text-center text-slate-500 font-bold">No items purchased in this period.</td></tr>
                ) : purchaseItemAggregates.map((x, i) => {
                    const key = x.code + '_' + x.name + '_' + i;
                    const expanded = expandedKey === key;
                    return (<React.Fragment key={key}>
                        <tr onClick={() => setExpandedKey(expanded ? null : key)}
                            className={`cursor-pointer border-b border-slate-200 ${expanded ? 'bg-yellow-50' : 'hover:bg-blue-50'}`}>
                            <td className="px-3 py-1.5 text-slate-500">{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</td>
                            <td className="px-3 py-1.5 font-black text-slate-700">{x.code}</td>
                            <td className="px-3 py-1.5 font-black text-slate-900">{x.name}</td>
                            <td className="px-3 py-1.5 text-right font-black">{x.totalQty}</td>
                            <td className="px-3 py-1.5 text-right font-black text-emerald-700">₹{x.totalCost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-slate-700">{x.purchases.length}</td>
                        </tr>
                        {expanded && (<tr><td colSpan={6} className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                            <div className="bg-white rounded border border-slate-200">
                                <table className="w-full text-[11px]">
                                    <thead className="bg-slate-100"><tr>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Pur No</th>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Inv No</th>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Date</th>
                                        <th className="px-2 py-1 text-left font-black text-slate-700">Supplier</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Qty</th>
                                        <th className="px-2 py-1 text-right font-black text-slate-700">Amount</th>
                                    </tr></thead>
                                    <tbody>
                                        {x.purchases.map((pur, j) => (<tr key={j} className="border-b border-slate-100">
                                            <td className="px-2 py-1 font-bold text-slate-700">{pur.purNo}</td>
                                            <td className="px-2 py-1 font-bold text-slate-700">{pur.invNo || '—'}</td>
                                            <td className="px-2 py-1 font-bold text-slate-700">{pur.date}</td>
                                            <td className="px-2 py-1 font-bold text-slate-900">{pur.supplier || '—'}</td>
                                            <td className="px-2 py-1 text-right font-black">{pur.qty}</td>
                                            <td className="px-2 py-1 text-right font-black text-emerald-700">₹{parseFloat(pur.amount || 0).toFixed(2)}</td>
                                        </tr>))}
                                    </tbody>
                                </table>
                            </div>
                        </td></tr>)}
                    </React.Fragment>);
                })}
            </tbody>
        </table>
    </div>);

    const renderStock = () => {
        const counts = {
            total: stockData.length,
            out: stockData.filter(x => x.status === 'out').length,
            low: stockData.filter(x => x.status === 'low').length,
            good: stockData.filter(x => x.status === 'good').length,
        };
        return (<div className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
                <div className="bg-white border border-slate-300 rounded-lg p-3"><p className="text-[10px] font-black uppercase text-slate-500">Total Items</p><p className="text-2xl font-black text-slate-900">{counts.total}</p></div>
                <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3"><p className="text-[10px] font-black uppercase text-emerald-700">In Stock</p><p className="text-2xl font-black text-emerald-700">{counts.good}</p></div>
                <div className="bg-orange-50 border border-orange-300 rounded-lg p-3"><p className="text-[10px] font-black uppercase text-orange-700">Low Stock (≤5)</p><p className="text-2xl font-black text-orange-700">{counts.low}</p></div>
                <div className="bg-red-50 border border-red-300 rounded-lg p-3"><p className="text-[10px] font-black uppercase text-red-700 flex items-center gap-1"><AlertTriangle size={11}/> Out of Stock</p><p className="text-2xl font-black text-red-700">{counts.out}</p></div>
            </div>

            <div className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-[12px]">
                    <thead className="bg-[#1a5276] text-white">
                        <tr>
                            <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Code</th>
                            <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Item Name</th>
                            <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Brand</th>
                            <th className="px-3 py-2 text-left font-black uppercase tracking-wider">Category</th>
                            <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Stock</th>
                            <th className="px-3 py-2 text-center font-black uppercase tracking-wider">Status</th>
                            <th className="px-3 py-2 text-right font-black uppercase tracking-wider">Sales Rate</th>
                            <th className="px-3 py-2 text-right font-black uppercase tracking-wider">MRP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stockData.length === 0 ? (
                            <tr><td colSpan={8} className="py-12 text-center text-slate-500 font-bold">No items match.</td></tr>
                        ) : stockData.map((x, i) => (
                            <tr key={x.id || i} className={`border-b border-slate-200 hover:bg-blue-50 ${x.status === 'out' ? 'bg-red-50' : x.status === 'low' ? 'bg-orange-50' : ''}`}>
                                <td className="px-3 py-1.5 font-black text-slate-700">{x.code}</td>
                                <td className="px-3 py-1.5 font-black text-slate-900">{x.itemName}</td>
                                <td className="px-3 py-1.5 font-bold text-slate-700">{x.brand || '—'}</td>
                                <td className="px-3 py-1.5 font-bold text-slate-700">{x.category || '—'}</td>
                                <td className="px-3 py-1.5 text-right font-black">{x.stock != null ? x.stock : '—'}</td>
                                <td className="px-3 py-1.5 text-center">
                                    {x.status === 'out' && <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-red-600 text-white">Out</span>}
                                    {x.status === 'low' && <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-orange-500 text-white">Low</span>}
                                    {x.status === 'good' && <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-emerald-600 text-white">Good</span>}
                                    {x.status === 'unknown' && <span className="px-2 py-0.5 text-[10px] font-black uppercase rounded bg-slate-300 text-slate-700">N/A</span>}
                                </td>
                                <td className="px-3 py-1.5 text-right font-black text-emerald-700">₹{x.salesRate || 0}</td>
                                <td className="px-3 py-1.5 text-right font-bold">₹{x.mrpRate || 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>);
    };

    return (<div className="flex flex-col h-[85vh] bg-slate-50 rounded-xl overflow-hidden font-sans border border-slate-300">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 shrink-0 flex items-center justify-between">
            <div>
                <h1 className="text-white text-xl font-black flex items-center gap-2"><FileText size={22}/> Reports</h1>
                <p className="text-slate-400 text-xs font-bold mt-0.5">Product · Sales · Stock — bill-wise & item-wise breakdown</p>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={exportCSV} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 font-black text-xs uppercase tracking-widest"><Download size={14}/> CSV</button>
                {reportType !== 'stock' && (
                    <button onClick={clearReports} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg flex items-center gap-2 font-black text-xs uppercase tracking-widest"><Trash2 size={14}/> Clear</button>
                )}
            </div>
        </div>

        <div className="px-5 py-3 bg-white border-b border-slate-200 shrink-0 flex items-center gap-3 flex-wrap">
            {(() => {
                const meta = {
                    purchase: { num: 1, label: 'Purchase Report', color: '#1abc9c' },
                    sales:    { num: 2, label: 'Sales Report',    color: '#e67e22' },
                    stock:    { num: 3, label: 'Stock Report',    color: '#9b59b6' },
                }[reportType] || { num: '?', label: reportType, color: '#1a5276' };
                return (<div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{background: meta.color}}>
                    <span className="w-6 h-6 rounded-full bg-white text-slate-900 flex items-center justify-center text-[12px] font-black">{meta.num}</span>
                    <span className="text-white font-black text-[13px] uppercase tracking-widest">{meta.label}</span>
                </div>);
            })()}
            {reportType !== 'stock' && <span className="text-slate-300">|</span>}
            {renderViewTabs()}
            <div className="flex-1"/>
            <div className="relative">
                <Search size={14} className="absolute left-2 top-2.5 text-slate-500"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={reportType === 'stock' ? 'Search item / code...' : 'Search bill / customer / item...'} className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-md text-sm font-bold w-72 outline-none focus:border-emerald-500"/>
            </div>
            {reportType !== 'stock' && (<>
                <input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-md text-sm font-bold outline-none" title="From"/>
                <span className="text-slate-500 font-bold">to</span>
                <input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-md text-sm font-bold outline-none" title="To"/>
            </>)}
        </div>

        {reportType === 'sales' && (
            <div className="px-5 py-3 bg-white border-b border-slate-200 shrink-0 grid grid-cols-5 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5"><p className="text-[10px] font-black uppercase text-slate-500">Total Bills</p><p className="text-lg font-black text-slate-900">{totals.count}</p></div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5"><p className="text-[10px] font-black uppercase text-blue-700">Grand Total</p><p className="text-lg font-black text-blue-700">₹{totals.subtotal.toLocaleString()}</p></div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5"><p className="text-[10px] font-black uppercase text-emerald-700">Cash</p><p className="text-lg font-black text-emerald-700">₹{totals.cash.toLocaleString()}</p></div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5"><p className="text-[10px] font-black uppercase text-indigo-700">UPI + Card</p><p className="text-lg font-black text-indigo-700">₹{(totals.upi + totals.card).toLocaleString()}</p></div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5"><p className="text-[10px] font-black uppercase text-orange-700">Credit Pending</p><p className="text-lg font-black text-orange-700">₹{totals.credit.toLocaleString()}</p></div>
            </div>
        )}

        {reportType === 'purchase' && (
            <div className="px-5 py-3 bg-white border-b border-slate-200 shrink-0 grid grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5"><p className="text-[10px] font-black uppercase text-slate-500">Total Entries</p><p className="text-lg font-black text-slate-900">{purchaseTotals.count}</p></div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5"><p className="text-[10px] font-black uppercase text-blue-700">Total Amount</p><p className="text-lg font-black text-blue-700">₹{purchaseTotals.totalAmount.toLocaleString()}</p></div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5"><p className="text-[10px] font-black uppercase text-orange-700">Total Tax</p><p className="text-lg font-black text-orange-700">₹{purchaseTotals.totalTax.toLocaleString()}</p></div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5"><p className="text-[10px] font-black uppercase text-emerald-700">Net Amount</p><p className="text-lg font-black text-emerald-700">₹{purchaseTotals.netAmount.toLocaleString()}</p></div>
            </div>
        )}

        <div className="flex-1 overflow-auto p-5">
            {reportType === 'stock' && renderStock()}
            {reportType === 'sales' && view === 'bill' && renderBillWise()}
            {reportType === 'sales' && view === 'item' && renderItemWise()}
            {reportType === 'purchase' && view === 'bill' && renderPurchaseBillWise()}
            {reportType === 'purchase' && view === 'item' && renderPurchaseItemWise()}
        </div>
    </div>);
}
