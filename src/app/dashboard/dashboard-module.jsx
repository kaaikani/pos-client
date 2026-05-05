"use client";
import React, { useState, useEffect } from 'react';
import { Row, Col } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, ShoppingBag, DollarSign, Activity, CreditCard, Wallet, Wifi, WifiOff } from 'lucide-react';
import { GetLedgerSummaryQuery } from '../../core/queries/ledger.query';
const DashboardCard = ({ children, title, extra }) => (<div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm h-full flex flex-col">
    {title && (<div className="flex justify-between items-center mb-6">
        <h3 className="font-extrabold text-slate-800 text-base uppercase tracking-tight">{title}</h3>
        {extra && <div className="text-xs">{extra}</div>}
      </div>)}
    <div className="flex-1">{children}</div>
  </div>);
export default function DashboardModule() {
    const [reports, setReports] = useState([]);
    const [ledgerSummary, setLedgerSummary] = useState({ totalSales: 0, totalPurchase: 0, totalReceivable: 0, totalPayable: 0 });
    useEffect(() => {
        const loadData = () => {
            // Load POS reports from localStorage
            try {
                const data = JSON.parse(localStorage.getItem('pos_reports') || '[]');
                setReports(data);
            }
            catch {
                setReports([]);
            }
            // Load ledger summary
            new GetLedgerSummaryQuery().execute().then(setLedgerSummary).catch(() => { });
        };
        loadData();
        // Auto-refresh every 5 seconds
        const interval = setInterval(loadData, 5000);
        // Refresh when window gets focus
        const onFocus = () => loadData();
        window.addEventListener('focus', onFocus);
        // Refresh when localStorage changes (cross-tab sync)
        const onStorage = (e) => {
            if (e.key === 'pos_reports')
                loadData();
        };
        window.addEventListener('storage', onStorage);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('storage', onStorage);
        };
    }, []);
    // Today's data
    const today = new Date().toLocaleDateString('en-GB');
    const todayReports = reports.filter(r => r.date === today);
    const todaySales = todayReports.reduce((sum, r) => sum + (r.grandTotal || 0), 0);
    const todayOrders = todayReports.length;
    const todayAvgBasket = todayOrders > 0 ? todaySales / todayOrders : 0;
    // All-time data
    const totalOrders = reports.length;
    const totalRevenue = reports.reduce((sum, r) => sum + (r.grandTotal || 0), 0);
    const avgBasket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    // Payment mode breakdown
    const onlineTotal = reports.filter(r => r.saleType === 'ONLINE').reduce((s, r) => s + r.grandTotal, 0);
    const offlineTotal = reports.filter(r => r.saleType === 'OFFLINE').reduce((s, r) => s + r.grandTotal, 0);
    const creditTotal = reports.filter(r => r.saleType === 'CREDIT').reduce((s, r) => s + r.grandTotal, 0);
    const grandAll = onlineTotal + offlineTotal + creditTotal || 1;
    const paymentData = [
        { name: 'Offline (Cash)', value: Math.round((offlineTotal / grandAll) * 100), color: '#10b981', icon: Wallet, amount: offlineTotal },
        { name: 'Online', value: Math.round((onlineTotal / grandAll) * 100), color: '#3b82f6', icon: Wifi, amount: onlineTotal },
        { name: 'Credit', value: Math.round((creditTotal / grandAll) * 100), color: '#f59e0b', icon: CreditCard, amount: creditTotal },
    ];
    const pieData = paymentData.filter(p => p.value > 0);
    // Last 7 days sales chart
    const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dateStr = d.toLocaleDateString('en-GB');
        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        const daySales = reports.filter(r => r.date === dateStr).reduce((s, r) => s + r.grandTotal, 0);
        return { name: dayName, sales: Math.round(daySales) };
    });
    // Recent transactions (last 10)
    const recentTx = [...reports].slice(0, 10);
    // Top selling products
    const productSales = {};
    reports.forEach(r => {
        (r.items || []).forEach(item => {
            const key = item.name;
            if (!productSales[key])
                productSales[key] = { name: key, qty: 0, revenue: 0 };
            productSales[key].qty += item.qty;
            productSales[key].revenue += item.total;
        });
    });
    const topSelling = Object.values(productSales).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
    return (<div className="space-y-6 pb-10">
      {/* 1. TOP SUMMARY CARDS */}
      <Row gutter={[20, 20]}>
        {[
            { title: "Today's Sales", val: fmt(todaySales), sub: `${todayOrders} order${todayOrders !== 1 ? 's' : ''} today`, icon: DollarSign, color: 'emerald' },
            { title: "Today's Orders", val: todayOrders.toString(), sub: `Total all-time: ${totalOrders}`, icon: ShoppingBag, color: 'blue' },
            { title: "Today's Revenue", val: fmt(todaySales), sub: `Total all-time: ${fmt(totalRevenue)}`, icon: Activity, color: 'indigo' },
            { title: "Avg. Basket (Today)", val: fmt(Math.round(todayAvgBasket)), sub: `All-time avg: ${fmt(Math.round(avgBasket))}`, icon: TrendingUp, color: 'amber' },
        ].map((s, i) => (<Col key={i} xs={24} sm={12} lg={6}>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
              <div className={`p-4 rounded-xl ${s.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                s.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                    s.color === 'indigo' ? 'bg-indigo-50 text-indigo-600' :
                        'bg-amber-50 text-amber-600'}`}>
                <s.icon size={28} strokeWidth={2.5}/>
              </div>
              <div className="flex-1">
                <div className="text-[11px] font-black text-slate-700 uppercase tracking-widest mb-1">{s.title}</div>
                <div className="text-2xl font-black text-slate-800 tracking-tight">{s.val}</div>
                <div className="text-[10px] font-bold text-slate-700 mt-0.5">{s.sub}</div>
              </div>
            </div>
          </Col>))}
      </Row>


      {/* 2. SALES CHART & PAYMENT SUMMARY */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={16}>
          <DashboardCard title="Sales Overview — Last 7 Days">
            <div className="h-[300px] w-full">
              {last7Days.some(d => d.sales > 0) ? (<ResponsiveContainer width="100%" height="100%">
                  <BarChart data={last7Days}>
                    <defs>
                      <linearGradient id="gradientBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.8}/>
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.8}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }} dy={10}/>
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 700 }}/>
                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px' }}/>
                    <Bar dataKey="sales" radius={[4, 4, 0, 0]} fill="url(#gradientBar)" barSize={40}/>
                  </BarChart>
                </ResponsiveContainer>) : (<div className="flex items-center justify-center h-full text-slate-900 font-bold">
                  No sales data yet. Complete a checkout in POS Terminal.
                </div>)}
            </div>
          </DashboardCard>
        </Col>
        <Col xs={24} lg={8}>
          <DashboardCard title="Payment Breakdown">
            <div className="space-y-5 mt-2">
              {paymentData.map((p, i) => (<div key={i} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <div className="p-1.5 rounded-md bg-slate-50 text-slate-800"><p.icon size={16}/></div>
                      {p.name}
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-slate-800">{p.value}%</span>
                      <span className="text-[10px] text-slate-700 ml-1 font-bold">{fmt(p.amount)}</span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${p.value}%`, backgroundColor: p.color }}/>
                  </div>
                </div>))}

              {pieData.length > 0 && (<div className="pt-4 border-t border-slate-100">
                  <div className="h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                          {pieData.map((entry, idx) => <Cell key={idx} fill={entry.color}/>)}
                        </Pie>
                        <Tooltip formatter={(v) => `${v}%`}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>)}
            </div>
          </DashboardCard>
        </Col>
      </Row>

      {/* 3. RECENT TRANSACTIONS & TOP SELLING */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={14}>
          <DashboardCard title="Recent Transactions">
            <div className="overflow-x-auto">
              {recentTx.length === 0 ? (<div className="py-10 text-center text-slate-900 font-bold">No transactions yet</div>) : (<table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[10px] font-black text-slate-700 uppercase tracking-widest">
                    <tr>
                      <th className="px-4 py-3 border-b border-slate-100">Invoice</th>
                      <th className="px-4 py-3 border-b border-slate-100">Customer</th>
                      <th className="px-4 py-3 border-b border-slate-100">Mode</th>
                      <th className="px-4 py-3 border-b border-slate-100">Time</th>
                      <th className="px-4 py-3 border-b border-slate-100 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {recentTx.map((tx, i) => (<tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-bold text-slate-700">{tx.invoiceId}</td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-800">{tx.customer?.name || 'Walk-in'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${tx.saleType === 'ONLINE' ? 'bg-emerald-100 text-emerald-700' :
                    tx.saleType === 'OFFLINE' ? 'bg-blue-100 text-blue-700' :
                        'bg-orange-100 text-orange-700'}`}>
                            {tx.saleType === 'ONLINE' ? <Wifi size={10}/> : tx.saleType === 'OFFLINE' ? <WifiOff size={10}/> : <CreditCard size={10}/>}
                            {tx.saleType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[10px] font-bold text-slate-700">
                          {tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-black text-slate-800 text-right">{fmt(Math.round(tx.grandTotal))}</td>
                      </tr>))}
                  </tbody>
                </table>)}
            </div>
          </DashboardCard>
        </Col>

        <Col xs={24} lg={10}>
          <DashboardCard title="Top Selling Products">
            {topSelling.length === 0 ? (<div className="py-10 text-center text-slate-900 font-bold">No sales data yet</div>) : (<div className="space-y-4">
                {topSelling.map((item, i) => (<div key={i} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-[10px] font-black text-emerald-700">#{i + 1}</div>
                    <div className="flex-1">
                      <div className="text-[11px] font-extrabold text-slate-700 leading-tight">{item.name}</div>
                      <div className="text-[9px] font-bold text-slate-700">{item.qty} units sold</div>
                    </div>
                    <div className="text-xs font-black text-emerald-600">{fmt(Math.round(item.revenue))}</div>
                  </div>))}
              </div>)}
          </DashboardCard>
        </Col>
      </Row>
    </div>);
}
