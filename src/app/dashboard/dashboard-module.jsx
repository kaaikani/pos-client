"use client";
/**
 * Dashboard.
 *
 * ONE network call — `posDashboard` returns the KPIs, the sales/profit series,
 * cash flow, the inventory snapshot, top sellers, the recent-activity feed and
 * the alert list together. Nothing here fetches a second time.
 *
 * What earns a place on this screen is decided by a single test: does it help
 * answer one of eight questions — what did I sell, what did I earn, who owes me,
 * whom do I owe, how are sales trending, what stock needs attention, what
 * happened recently, and what needs me today. Anything else belongs on its own
 * screen, so there is no wall of KPI tiles here.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LayoutDashboard, TrendingUp, TrendingDown, Wallet, ArrowDownLeft, ArrowUpRight,
    Plus, ShoppingCart, Package, UserPlus, ArrowRight, AlertTriangle, Info,
    RefreshCw, Boxes,
} from 'lucide-react';
import { PosDashboardQuery } from '../../core/queries/dashboard.query';
import { Page, PageHeader, PageBody, Button, Banner, EmptyState, Spinner } from '../../components/pos';
import SalesProfitChart from '../../components/pos/chart';
import { canOpenScreen, readSession } from '../../components/pos/permissions';

/* ── formatting ─────────────────────────────────────────── */
const inr = (v, dp = 0) =>
    '₹' + (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const compact = (v) => {
    const n = Math.abs(Number(v) || 0);
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.00$/, '') + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.00$/, '') + ' L';
    return inr(v);
};
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const RANGES = [
    { id: '7d',  label: '7 Days',   from: () => daysAgo(6) },
    { id: '30d', label: '30 Days',  from: () => daysAgo(29) },
    { id: '3m',  label: '3 Months', from: () => daysAgo(89) },
    { id: '1y',  label: 'This Year', from: () => `${new Date().getFullYear()}-01-01` },
];

/* ── pieces ─────────────────────────────────────────────── */

function Card({ title, action, children, className, pad = true }) {
    return (
        <section className={`flex flex-col min-w-0 bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[8px] ${className || ''}`}>
            {(title || action) && (
                <header className="flex items-center gap-3 px-5 h-[46px] border-b border-[var(--pos-line-soft)] shrink-0">
                    <h2 className="flex-1 min-w-0 text-[14.5px] font-semibold text-[var(--pos-ink)] truncate">{title}</h2>
                    {action}
                </header>
            )}
            <div className={`flex-1 min-h-0 ${pad ? 'p-5' : ''}`}>{children}</div>
        </section>
    );
}

function LinkAction({ children, onClick }) {
    return (
        <button type="button" onClick={onClick}
            className="pos-focusable inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--pos-ink-2)] hover:text-[var(--pos-ink)] rounded">
            {children} <ArrowRight size={13} />
        </button>
    );
}

function Kpi({ icon: Icon, label, value, sub, changePct, onClick }) {
    const up = Number(changePct) >= 0;
    const Arrow = up ? TrendingUp : TrendingDown;
    return (
        <button type="button" onClick={onClick} disabled={!onClick}
            className="pos-focusable text-left flex flex-col gap-1.5 bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[8px] px-4 py-3.5 enabled:hover:border-[var(--pos-line-hover)] transition-colors disabled:cursor-default">
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--pos-ink-2)]">
                <Icon size={14} className="text-[var(--pos-ink-3)]" strokeWidth={2} />
                {label}
            </span>
            <span className="text-[27px] font-semibold leading-none tracking-tight tabular-nums"
                  style={{ fontFamily: 'var(--pos-mono)' }}>
                {value}
            </span>
            <span className="flex items-center gap-1.5 text-[11.5px] min-h-[15px]">
                {changePct != null && (
                    <span className="inline-flex items-center gap-1 font-semibold"
                          style={{ color: up ? 'var(--pos-ok)' : 'var(--pos-danger)' }}>
                        <Arrow size={13} strokeWidth={2.4} />
                        {Math.abs(Number(changePct)).toFixed(1)}%
                    </span>
                )}
                <span className="text-[var(--pos-ink-3)] truncate">{sub}</span>
            </span>
        </button>
    );
}

const KIND_TONE = {
    SALE:     { label: 'Sale',     color: 'var(--pos-ok)',     bg: 'var(--pos-ok-soft)' },
    PURCHASE: { label: 'Purchase', color: 'var(--pos-info)',   bg: 'var(--pos-info-soft)' },
    RECEIPT:  { label: 'Receipt',  color: 'var(--pos-ok)',     bg: 'var(--pos-ok-soft)' },
    PAYMENT:  { label: 'Payment',  color: 'var(--pos-warn)',   bg: 'var(--pos-warn-soft)' },
    EXPENSE:  { label: 'Expense',  color: 'var(--pos-danger)', bg: 'var(--pos-danger-soft)' },
};

const SEVERITY = {
    URGENT:  { color: 'var(--pos-danger)', bg: 'var(--pos-danger-soft)', icon: AlertTriangle },
    WARNING: { color: 'var(--pos-warn)',   bg: 'var(--pos-warn-soft)',   icon: AlertTriangle },
    INFO:    { color: 'var(--pos-info)',   bg: 'var(--pos-info-soft)',   icon: Info },
};

/* ── screen ─────────────────────────────────────────────── */

export default function DashboardModule({ setActiveTab }) {
    const session = useMemo(() => readSession(), []);
    const perms = session?.permissions;
    const go = useCallback((screen) => {
        if (screen && setActiveTab && canOpenScreen(perms, screen)) setActiveTab(screen);
    }, [setActiveTab, perms]);

    const [range, setRange] = useState('30d');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async (rangeId) => {
        const r = RANGES.find(x => x.id === rangeId) || RANGES[1];
        setLoading(true);
        setError('');
        try {
            setData(await new PosDashboardQuery().execute(r.from(), iso(new Date())));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(range); }, [range, load]);

    const quickActions = [
        { screen: 'pos',        icon: ShoppingCart, label: 'New Sale',     primary: true },
        { screen: 'purchase',   icon: Package,      label: 'New Purchase' },
        { screen: 'itemmaster', icon: Plus,         label: 'Add Product' },
        { screen: 'customers',  icon: UserPlus,     label: 'Add Customer' },
    ].filter(a => canOpenScreen(perms, a.screen));

    const money = data ? Math.max(1, Math.abs(data.cashIn) + Math.abs(data.cashOut)) : 1;

    return (
        <Page className="!border-0 !rounded-none !shadow-none">
            <PageHeader
                icon={LayoutDashboard}
                title="Dashboard"
                subtitle="Here's what's happening with your business today."
                actions={
                    <div className="flex items-center gap-2">
                        <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-[var(--pos-r-sm)] bg-[var(--pos-sunk)] border border-[var(--pos-line)]">
                            {RANGES.map(r => (
                                <button key={r.id} type="button" onClick={() => setRange(r.id)}
                                    className={`pos-focusable px-2.5 h-[26px] rounded-[3px] text-[12px] font-semibold transition-colors ${
                                        range === r.id
                                            ? 'bg-[var(--pos-surface)] text-[var(--pos-ink)] shadow-[var(--pos-shadow)]'
                                            : 'text-[var(--pos-ink-3)] hover:text-[var(--pos-ink-2)]'}`}>
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        <Button variant="ghost" icon={RefreshCw} title="Refresh"
                                onClick={() => load(range)} disabled={loading} />
                    </div>
                }
            />

            {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}

            <PageBody className="!p-5">
                {loading && !data ? <Spinner label="Loading your business…" /> : !data ? (
                    <EmptyState icon={LayoutDashboard} title="No data yet"
                        hint="Record a sale or a purchase and this screen fills in."
                        action={<Button variant="primary" icon={ShoppingCart} onClick={() => go('pos')}>New Sale</Button>} />
                ) : (
                    <div className="flex flex-col gap-3.5 max-w-[1440px] mx-auto w-full">

                        {/* ── 1 · four numbers, no more ── */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
                            <Kpi icon={TrendingUp} label="Sales" value={compact(data.salesValue)}
                                 changePct={data.salesChangePct}
                                 sub={`${data.billCount} bill${data.billCount === 1 ? '' : 's'} · vs previous period`}
                                 onClick={() => go('report')} />
                            <Kpi icon={Wallet} label="Gross Profit" value={compact(data.grossProfit)}
                                 changePct={data.grossProfitChangePct}
                                 sub="vs previous period"
                                 onClick={() => go('report')} />
                            <Kpi icon={ArrowDownLeft} label="Receivables" value={compact(data.receivable)}
                                 sub={data.receivableOverdue > 0 ? `${compact(data.receivableOverdue)} overdue` : 'Due from customers'}
                                 onClick={() => go('ledger')} />
                            <Kpi icon={ArrowUpRight} label="Payables" value={compact(data.payable)}
                                 sub={data.payableDue > 0 ? `${compact(data.payableDue)} due now` : 'Owed to suppliers'}
                                 onClick={() => go('payment')} />
                        </div>

                        {/* ── 2 · trend + cash position ── */}
                        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] gap-3.5">
                            <Card title="Sales & Profit"
                                  action={<span className="text-[11.5px] text-[var(--pos-ink-3)]">Hover for a day</span>}>
                                <SalesProfitChart series={data.series} height={250}
                                    onPointClick={() => go('report')} />
                                {data.costBasis === 'CURRENT_PURCHASE_RATE' && (
                                    <p className="text-[11px] text-[var(--pos-ink-3)] mt-3 pt-3 border-t border-[var(--pos-line-soft)]">
                                        Profit is costed at each item's current purchase rate — sale lines do not yet
                                        store the cost at the time of sale.
                                    </p>
                                )}
                            </Card>

                            <Card title="Cash Flow">
                                <div className="flex flex-col gap-3.5">
                                    <div>
                                        <div className="flex items-baseline justify-between mb-1.5">
                                            <span className="text-[12.5px] text-[var(--pos-ink-2)]">Money In</span>
                                            <b className="text-[15px] tabular-nums" style={{ fontFamily: 'var(--pos-mono)', color: 'var(--pos-ok)' }}>{inr(data.cashIn)}</b>
                                        </div>
                                        <div className="h-2 rounded-full bg-[var(--pos-sunk)] overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${(data.cashIn / money) * 100}%`, background: 'var(--pos-ok)' }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-baseline justify-between mb-1.5">
                                            <span className="text-[12.5px] text-[var(--pos-ink-2)]">Money Out</span>
                                            <b className="text-[15px] tabular-nums" style={{ fontFamily: 'var(--pos-mono)', color: 'var(--pos-danger)' }}>{inr(data.cashOut)}</b>
                                        </div>
                                        <div className="h-2 rounded-full bg-[var(--pos-sunk)] overflow-hidden">
                                            <div className="h-full rounded-full" style={{ width: `${(data.cashOut / money) * 100}%`, background: 'var(--pos-danger)' }} />
                                        </div>
                                    </div>

                                    <div className="flex items-baseline justify-between pt-3 border-t border-[var(--pos-line-soft)]">
                                        <span className="text-[12.5px] font-semibold text-[var(--pos-ink-2)]">Net Cash Flow</span>
                                        <b className="text-[19px] tabular-nums" style={{ fontFamily: 'var(--pos-mono)' }}>{inr(data.netCashFlow)}</b>
                                    </div>

                                    <dl className="flex flex-col gap-2 pt-3 border-t border-[var(--pos-line-soft)] text-[12.5px]">
                                        {[
                                            ['Available cash', inr(data.availableCash), null],
                                            ['Receivable', inr(data.receivable), 'ledger'],
                                            ['Payable', inr(data.payable), 'payment'],
                                        ].map(([k, v, screen]) => (
                                            <div key={k} className="flex items-baseline justify-between gap-3">
                                                <dt className="text-[var(--pos-ink-3)]">{k}</dt>
                                                <dd>
                                                    {screen
                                                        ? <button type="button" onClick={() => go(screen)}
                                                              className="pos-focusable tabular-nums font-semibold text-[var(--pos-ink)] hover:underline rounded"
                                                              style={{ fontFamily: 'var(--pos-mono)' }}>{v}</button>
                                                        : <span className="tabular-nums font-semibold" style={{ fontFamily: 'var(--pos-mono)' }}>{v}</span>}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </div>
                            </Card>
                        </div>

                        {/* ── 3 · act now, and what stock needs me ── */}
                        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)] gap-3.5">
                            <Card title="Quick Actions">
                                <div className="flex flex-col gap-2.5">
                                    {quickActions.map(a => (
                                        <button key={a.screen} type="button" onClick={() => go(a.screen)}
                                            className={`pos-focusable flex items-center gap-3 h-[42px] px-4 rounded-[var(--pos-r)] text-[13.5px] font-semibold transition-colors ${
                                                a.primary
                                                    ? 'text-white'
                                                    : 'border border-[var(--pos-line)] text-[var(--pos-ink)] hover:bg-[var(--pos-sunk)]'}`}
                                            style={a.primary ? { background: 'var(--pos-accent-solid)' } : undefined}>
                                            <a.icon size={16} strokeWidth={2.1} />
                                            <span className="flex-1 text-left">{a.label}</span>
                                            <ArrowRight size={14} className={a.primary ? 'opacity-80' : 'text-[var(--pos-ink-3)]'} />
                                        </button>
                                    ))}
                                </div>
                            </Card>

                            <Card title="Inventory" action={<LinkAction onClick={() => go('inventory')}>View Inventory</LinkAction>}>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                    {[
                                        ['Total Products', data.productCount, null],
                                        ['Low Stock', data.lowStockCount, data.lowStockCount ? 'var(--pos-warn)' : null],
                                        ['Out of Stock', data.outOfStockCount, data.outOfStockCount ? 'var(--pos-danger)' : null],
                                        ['Stock Value', compact(data.stockValue), null],
                                    ].map(([k, v, color]) => (
                                        <div key={k}>
                                            <div className="text-[11.5px] text-[var(--pos-ink-3)]">{k}</div>
                                            <div className="text-[19px] font-semibold tabular-nums mt-0.5"
                                                 style={{ fontFamily: 'var(--pos-mono)', color: color || 'var(--pos-ink)' }}>{v}</div>
                                        </div>
                                    ))}
                                </div>

                                {data.lowStockItems.length === 0 ? (
                                    <p className="text-[12.5px] text-[var(--pos-ink-3)] pt-3 border-t border-[var(--pos-line-soft)]">
                                        Every tracked item is above its reorder level.
                                    </p>
                                ) : (
                                    <div className="pt-3 border-t border-[var(--pos-line-soft)]">
                                        <h3 className="text-[12px] font-semibold text-[var(--pos-ink-2)] mb-2">Low Stock Items</h3>
                                        <div className="overflow-x-auto pos-scroll">
                                            <table className="pos-table !text-[12.5px]">
                                                <thead><tr>
                                                    <th>Product</th>
                                                    <th style={{ width: 110 }} className="text-right">Current</th>
                                                    <th style={{ width: 110 }} className="text-right">Reorder</th>
                                                </tr></thead>
                                                <tbody>
                                                    {data.lowStockItems.slice(0, 5).map(it => (
                                                        <tr key={it.itemCode} className="cursor-pointer" onClick={() => go('itemmaster')}>
                                                            <td className="truncate">{it.itemName}</td>
                                                            <td className="num font-semibold"
                                                                style={{ color: it.currentStock <= 0 ? 'var(--pos-danger)' : 'var(--pos-warn)' }}>
                                                                {it.currentStock}
                                                            </td>
                                                            <td className="num text-[var(--pos-ink-3)]">{it.reorderLevel}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        </div>

                        {/* ── 4 · what happened, what needs me ── */}
                        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)] gap-3.5">
                            <Card title="Recent Transactions" pad={false}
                                  action={<LinkAction onClick={() => go('report')}>View All</LinkAction>}>
                                {data.recentTransactions.length === 0 ? (
                                    <p className="p-5 text-[12.5px] text-[var(--pos-ink-3)]">Nothing recorded yet.</p>
                                ) : (
                                    <div className="overflow-x-auto pos-scroll">
                                        <table className="pos-table !text-[12.5px]">
                                            <thead><tr>
                                                <th style={{ width: 92 }}>Type</th>
                                                <th style={{ width: 118 }}>Reference</th>
                                                <th>Party</th>
                                                <th style={{ width: 108 }} className="text-right">Amount</th>
                                                <th style={{ width: 84 }}>Payment</th>
                                                <th style={{ width: 84 }}>Status</th>
                                            </tr></thead>
                                            <tbody>
                                                {data.recentTransactions.map(t => {
                                                    const tone = KIND_TONE[t.kind] || KIND_TONE.SALE;
                                                    return (
                                                        <tr key={t.kind + t.recordId} className="cursor-pointer" onClick={() => go(t.screen)}>
                                                            <td>
                                                                <span className="inline-flex px-1.5 py-0.5 rounded text-[10.5px] font-bold uppercase tracking-[.05em]"
                                                                      style={{ color: tone.color, background: tone.bg }}>
                                                                    {tone.label}
                                                                </span>
                                                            </td>
                                                            <td className="font-medium text-[var(--pos-ink)]" style={{ fontFamily: 'var(--pos-mono)' }}>{t.refNo || '—'}</td>
                                                            <td className="truncate">{t.party || '—'}</td>
                                                            <td className="num font-semibold">{inr(t.amount, 2)}</td>
                                                            <td className="text-[var(--pos-ink-2)]">{t.paymentMode || '—'}</td>
                                                            <td>
                                                                <span className="text-[11.5px] font-semibold"
                                                                      style={{ color: t.status === 'Due' ? 'var(--pos-warn)' : 'var(--pos-ok)' }}>
                                                                    {t.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </Card>

                            <div className="flex flex-col gap-4 min-w-0">
                                <Card title="Needs Attention">
                                    {data.alerts.length === 0 ? (
                                        <p className="text-[12.5px] text-[var(--pos-ink-3)]">Nothing needs you right now.</p>
                                    ) : (
                                        <ul className="flex flex-col gap-2">
                                            {data.alerts.map(a => {
                                                const s = SEVERITY[a.severity] || SEVERITY.INFO;
                                                const Icon = s.icon;
                                                return (
                                                    <li key={a.code}>
                                                        <button type="button" onClick={() => go(a.screen)}
                                                            className="pos-focusable w-full flex items-start gap-2.5 px-3 py-2.5 rounded-[var(--pos-r)] text-left hover:bg-[var(--pos-sunk)] transition-colors">
                                                            <span className="grid place-items-center w-6 h-6 rounded shrink-0 mt-px"
                                                                  style={{ background: s.bg, color: s.color }}>
                                                                <Icon size={13} />
                                                            </span>
                                                            <span className="flex-1 min-w-0">
                                                                <span className="block text-[12.5px] text-[var(--pos-ink)] leading-snug">{a.message}</span>
                                                                {a.amount != null && (
                                                                    <span className="block text-[12.5px] font-semibold tabular-nums mt-0.5"
                                                                          style={{ fontFamily: 'var(--pos-mono)', color: s.color }}>
                                                                        {inr(a.amount)}
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <ArrowRight size={13} className="text-[var(--pos-ink-3)] shrink-0 mt-1" />
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </Card>

                                <Card title="Top Selling Products">
                                    {data.topProducts.length === 0 ? (
                                        <p className="text-[12.5px] text-[var(--pos-ink-3)]">No sales in this period.</p>
                                    ) : (
                                        <ol className="flex flex-col gap-2.5">
                                            {data.topProducts.map((p, i) => (
                                                <li key={p.itemCode} className="flex items-center gap-3">
                                                    <span className="grid place-items-center w-5 h-5 rounded text-[11px] font-bold shrink-0 bg-[var(--pos-sunk)] text-[var(--pos-ink-3)]">{i + 1}</span>
                                                    <span className="flex-1 min-w-0">
                                                        <span className="block text-[12.5px] text-[var(--pos-ink)] truncate">{p.itemName}</span>
                                                        <span className="block text-[11px] text-[var(--pos-ink-3)]">{p.qtySold} sold</span>
                                                    </span>
                                                    <span className="text-[12.5px] font-semibold tabular-nums shrink-0" style={{ fontFamily: 'var(--pos-mono)' }}>
                                                        {compact(p.salesValue)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ol>
                                    )}
                                </Card>
                            </div>
                        </div>
                    </div>
                )}
            </PageBody>
        </Page>
    );
}
