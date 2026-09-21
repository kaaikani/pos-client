"use client";
/**
 * Ledger — who owes us, whom we owe, and how late.
 *
 * LIST      every party of one type, rolled up, with ageing.
 * STATEMENT one party's open bills, oldest first, with days overdue per bill.
 *
 * Ageing is bucketed on DAYS OVERDUE — invoiceDate + creditDays — not on invoice
 * age. A bill on 30-day terms raised 40 days ago is 10 days late, not 40. Bucketing
 * on invoice age is the usual reason an ageing report disagrees with the shop.
 *
 * The server does the roll-up and the bucketing (`ledgerParties`), so this screen
 * costs one call for the list and one more when a party is opened.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    BookOpen, RefreshCw, Search, ChevronLeft, Receipt, Wallet,
    AlertTriangle, Users, Truck,
} from 'lucide-react';
import { LedgerPartiesQuery, LedgerOpenBillsQuery } from '../../core/queries/ledger.query';
import {
    Page, PageHeader, PageBody, HeaderStat, ListToolbar, Button, DataTable,
    Banner, EmptyState, Spinner, money,
} from '../../components/pos';
import { canOpenScreen, readSession } from '../../components/pos/permissions';

/**
 * The Ledger stores RUPEES, not minor units — writeLedger sets
 * ledger.amount = Math.round(sale.grandTotal). An earlier /100 here showed
 * every figure on this screen at 1/100th of the real amount.
 */
const rupees = (v) => Number(v) || 0;
const fmt = (v) => money(rupees(v));

const TYPES = [
    { id: 'CUSTOMER', label: 'Customers', icon: Users, owes: 'Receivable' },
    { id: 'SUPPLIER', label: 'Suppliers', icon: Truck, owes: 'Payable' },
];

/** Bucket a party falls into, by its worst overdue bill. */
function ageBand(days) {
    if (days <= 0) return { label: 'Current', color: 'var(--pos-ok)', bg: 'var(--pos-ok-soft)' };
    if (days <= 30) return { label: `${days}d`, color: 'var(--pos-warn)', bg: 'var(--pos-warn-soft)' };
    if (days <= 60) return { label: `${days}d`, color: 'var(--pos-warn)', bg: 'var(--pos-warn-soft)' };
    return { label: `${days}d`, color: 'var(--pos-danger)', bg: 'var(--pos-danger-soft)' };
}

function Band({ days }) {
    const b = ageBand(days);
    return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[10.5px] font-semibold"
              style={{ color: b.color, background: b.bg }}>
            {b.label}
        </span>
    );
}

export default function LedgerModule({ setActiveTab }) {
    const session = useMemo(() => readSession(), []);
    const perms = session?.permissions;
    const go = useCallback((s) => {
        if (s && setActiveTab && canOpenScreen(perms, s)) setActiveTab(s);
    }, [setActiveTab, perms]);

    const [type, setType] = useState('CUSTOMER');
    const [parties, setParties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [onlyDue, setOnlyDue] = useState(false);

    const [party, setParty] = useState(null);      // opened statement
    const [bills, setBills] = useState([]);
    const [billsLoading, setBillsLoading] = useState(false);

    const load = useCallback(async (t) => {
        setLoading(true);
        setError('');
        try {
            setParties(await new LedgerPartiesQuery().execute(t));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(type); }, [type, load]);

    const openParty = useCallback(async (p) => {
        setParty(p);
        setBills([]);
        setBillsLoading(true);
        try {
            setBills(await new LedgerOpenBillsQuery().execute(type, p.partyName, p.contactNumber));
        } catch (e) {
            setError(e.message);
        } finally {
            setBillsLoading(false);
        }
    }, [type]);

    /* ── totals ─────────────────────────────────────────── */
    const totals = useMemo(() => parties.reduce((a, p) => ({
        balance: a.balance + (Number(p.balance) || 0),
        overdue: a.overdue + (Number(p.bucket1_30) || 0) + (Number(p.bucket31_60) || 0)
                           + (Number(p.bucket61_90) || 0) + (Number(p.bucket90plus) || 0),
        open: a.open + (Number(p.openBillCount) || 0),
    }), { balance: 0, overdue: 0, open: 0 }), [parties]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return parties.filter(p => {
            if (onlyDue && (Number(p.balance) || 0) <= 0) return false;
            if (!q) return true;
            return [p.partyName, p.contactNumber, p.gstNumber]
                .some(f => String(f || '').toLowerCase().includes(q));
        });
    }, [parties, search, onlyDue]);

    /* ── list columns ───────────────────────────────────── */
    const columns = useMemo(() => [
        {
            key: 'partyName', header: 'Party',
            render: (p) => (
                <div className="min-w-0">
                    <div className="font-semibold text-[var(--pos-ink)] truncate">{p.partyName}</div>
                    {(p.contactNumber || p.gstNumber) && (
                        <div className="text-[11.5px] text-[var(--pos-ink-3)] truncate">
                            {[p.contactNumber, p.gstNumber].filter(Boolean).join(' · ')}
                        </div>
                    )}
                </div>
            ),
        },
        { key: 'openBillCount', header: 'Open bills', width: 96, align: 'right',
          render: (p) => p.openBillCount || <span className="text-[var(--pos-ink-3)]">—</span> },
        { key: 'totalAmount', header: 'Billed', width: 116, align: 'right',
          render: (p) => <span className="text-[var(--pos-ink-2)]">{fmt(p.totalAmount)}</span> },
        { key: 'paidAmount', header: 'Settled', width: 116, align: 'right',
          render: (p) => <span className="text-[var(--pos-ink-2)]">{fmt(p.paidAmount)}</span> },
        { key: 'balance', header: 'Outstanding', width: 126, align: 'right',
          render: (p) => {
            const bal = Number(p.balance) || 0;
            if (bal <= 0) return <span className="text-[var(--pos-ink-3)]">Clear</span>;
            const late = (Number(p.maxDaysOverdue) || 0) > 0;
            return <span className="font-semibold" style={{ color: late ? 'var(--pos-danger)' : 'var(--pos-ink)' }}>{fmt(bal)}</span>;
          } },
        { key: 'age', header: 'Oldest', width: 84, align: 'center',
          render: (p) => (Number(p.balance) || 0) > 0
            ? <Band days={Number(p.maxDaysOverdue) || 0} />
            : <span className="text-[var(--pos-ink-3)]">—</span> },
    ], []);

    /* ── statement ──────────────────────────────────────── */
    if (party) {
        const buckets = [
            ['Current', party.bucketCurrent],
            ['1–30 days', party.bucket1_30],
            ['31–60 days', party.bucket31_60],
            ['61–90 days', party.bucket61_90],
            ['90+ days', party.bucket90plus],
        ];
        const worst = Number(party.maxDaysOverdue) || 0;

        return (
            <Page>
                <header className="shrink-0 flex items-center gap-3 px-4 h-[58px] bg-[var(--pos-surface)] border-b border-[var(--pos-line)]">
                    <button type="button" onClick={() => { setParty(null); setBills([]); }} aria-label="Back to ledger"
                        className="pos-focusable grid place-items-center w-8 h-8 rounded-[6px] text-[var(--pos-ink-2)] hover:bg-[var(--pos-sunk)] shrink-0">
                        <ChevronLeft size={19} />
                    </button>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-[15px] font-semibold text-[var(--pos-ink)] truncate">{party.partyName}</h1>
                        <p className="text-[12px] text-[var(--pos-ink-3)] truncate">
                            {[party.contactNumber, party.gstNumber, party.address].filter(Boolean).join(' · ') || 'No contact details'}
                        </p>
                    </div>
                    <div className="hidden md:flex items-center gap-5 shrink-0">
                        <HeaderStat label="Outstanding" value={fmt(party.balance)} tone={worst > 0 ? 'danger' : 'default'} />
                        <HeaderStat label="Open bills" value={party.openBillCount} />
                    </div>
                    {type === 'CUSTOMER'
                        ? <Button variant="primary" icon={Receipt} onClick={() => go('receipt')}>Receive</Button>
                        : <Button variant="primary" icon={Wallet} onClick={() => go('payment')}>Pay</Button>}
                </header>

                {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}

                <PageBody className="!p-4">
                    <div className="max-w-[1240px] mx-auto flex flex-col gap-3.5">

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                            {buckets.map(([label, v]) => {
                                const amount = rupees(v);
                                const isLate = label !== 'Current' && amount > 0;
                                return (
                                    <div key={label}
                                         className="bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[8px] px-4 py-3">
                                        <div className="text-[11.5px] text-[var(--pos-ink-3)]">{label}</div>
                                        <div className="text-[17px] font-semibold tabular-nums mt-1"
                                             style={{ color: isLate ? 'var(--pos-danger)' : 'var(--pos-ink)' }}>
                                            {money(amount)}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <section className="bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[8px] overflow-hidden">
                            <header className="flex items-center gap-3 px-4 h-[44px] border-b border-[var(--pos-line-soft)]">
                                <h2 className="flex-1 text-[14px] font-semibold text-[var(--pos-ink)]">Open bills</h2>
                                <span className="text-[12px] text-[var(--pos-ink-3)]">Oldest first</span>
                            </header>

                            {billsLoading ? <Spinner label="Loading bills…" /> : bills.length === 0 ? (
                                <EmptyState icon={BookOpen} title="Nothing outstanding"
                                    hint={`${party.partyName} has no open bills.`} />
                            ) : (
                                <div className="pos-scroll">
                                    <table className="pos-table">
                                        <thead><tr>
                                            <th>Bill</th>
                                            <th style={{ width: 118 }}>Date</th>
                                            <th style={{ width: 118 }}>Due</th>
                                            <th style={{ width: 116 }} className="text-right">Amount</th>
                                            <th style={{ width: 116 }} className="text-right">Settled</th>
                                            <th style={{ width: 126 }} className="text-right">Outstanding</th>
                                            <th style={{ width: 92 }} className="text-center">Overdue</th>
                                        </tr></thead>
                                        <tbody>
                                            {bills.map(b => (
                                                <tr key={b.id}>
                                                    <td><b>{b.invoiceNumber}</b></td>
                                                    <td>{new Date(b.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                                    <td className={b.daysOverdue > 0 ? 'text-[var(--pos-danger)]' : undefined}>
                                                        {new Date(b.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="num">{fmt(b.amount)}</td>
                                                    <td className="num text-[var(--pos-ink-2)]">{fmt(b.paidAmount)}</td>
                                                    <td className="num font-semibold">{fmt(b.balance)}</td>
                                                    <td className="text-center"><Band days={b.daysOverdue} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr>
                                                <td colSpan={5} className="text-right">Total outstanding</td>
                                                <td className="num">{fmt(bills.reduce((a, b) => a + (Number(b.balance) || 0), 0))}</td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>
                </PageBody>
            </Page>
        );
    }

    /* ── list ───────────────────────────────────────────── */
    const active = TYPES.find(t => t.id === type);

    return (
        <Page>
            <PageHeader
                icon={BookOpen}
                title="Ledger"
                subtitle="Outstanding by party, aged on days overdue"
                meta={<>
                    <HeaderStat label={active.owes} value={money(rupees(totals.balance), 0)} />
                    <HeaderStat label="Overdue" value={money(rupees(totals.overdue), 0)}
                                tone={totals.overdue > 0 ? 'danger' : 'default'} />
                    <HeaderStat label="Open bills" value={totals.open} />
                </>}
                actions={<Button variant="ghost" icon={RefreshCw} title="Refresh"
                                 onClick={() => load(type)} disabled={loading} />}
            />

            {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}

            <ListToolbar
                autoFocus
                search={search}
                onSearch={setSearch}
                placeholder="Search party, mobile or GSTIN…"
                count={filtered.length}
                countLabel={filtered.length === 1 ? 'party' : 'parties'}
                filters={
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-0.5 p-0.5 rounded-[6px] bg-[var(--pos-sunk)] border border-[var(--pos-line)]">
                            {TYPES.map(t => (
                                <button key={t.id} type="button" onClick={() => setType(t.id)}
                                    className={`pos-focusable px-3 h-[26px] rounded-[4px] text-[12px] font-semibold transition-colors ${
                                        type === t.id
                                            ? 'bg-[var(--pos-surface)] text-[var(--pos-ink)] shadow-[var(--pos-shadow)]'
                                            : 'text-[var(--pos-ink-3)] hover:text-[var(--pos-ink-2)]'}`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <label className="inline-flex items-center gap-2 text-[12.5px] text-[var(--pos-ink-2)] cursor-pointer">
                            <input type="checkbox" checked={onlyDue} onChange={e => setOnlyDue(e.target.checked)}
                                className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                            With dues only
                        </label>
                    </div>
                }
                actions={<span className="text-[11.5px] text-[var(--pos-ink-3)]">Click a party for its statement</span>}
            />

            <PageBody padded={false}>
                <DataTable
                    className="!border-0 !rounded-none h-full"
                    columns={columns}
                    rows={filtered}
                    loading={loading}
                    rowKey={(p) => `${p.partyName}||${p.contactNumber || ''}`}
                    onActivate={openParty}
                    onSelect={openParty}
                    empty={
                        search || onlyDue
                            ? <EmptyState icon={Search} title="No party matches"
                                action={<Button variant="default" onClick={() => { setSearch(''); setOnlyDue(false); }}>Clear filters</Button>} />
                            : <EmptyState icon={BookOpen} title={`No ${active.label.toLowerCase()} on the ledger`}
                                hint="A credit sale or a credit purchase creates the first entry automatically." />
                    }
                />
            </PageBody>

            {totals.overdue > 0 && (
                <footer className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-[var(--pos-warn-soft)] border-t border-[var(--pos-line)]">
                    <AlertTriangle size={14} style={{ color: 'var(--pos-warn)' }} />
                    <span className="text-[12.5px] font-medium" style={{ color: 'var(--pos-warn)' }}>
                        {money(rupees(totals.overdue))} is past its due date
                    </span>
                </footer>
            )}
        </Page>
    );
}
