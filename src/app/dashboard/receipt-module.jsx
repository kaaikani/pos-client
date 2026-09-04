"use client";
/**
 * Receipt — collecting money from a customer against their open bills.
 *
 * PARTIES  customers with something outstanding, worst-overdue first.
 * COLLECT  one party's open bills with an Allocate column, oldest first.
 *
 * The screen this replaces asked the operator to TYPE the bill number, bill
 * amount and balance by hand, then ignored all of it: the server settled FIFO
 * regardless. So a customer paying against one specific invoice had their money
 * applied to different bills, and the operator had no way to tell.
 *
 * Now the open bills are fetched, the allocation is what the operator actually
 * chose, and the server applies exactly that under a row lock. One mutation
 * records the receipt voucher AND settles the bills, so the collection shows up
 * in the Day Book and in dashboard Money In.
 *
 * Money is in RUPEES throughout — the Ledger stores rupees, not minor units.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Receipt as ReceiptIcon, RefreshCw, ChevronLeft, Users, AlertTriangle,
    Wallet, Check, Zap, Eraser, Printer,
} from 'lucide-react';
import { LedgerPartiesQuery, LedgerOpenBillsQuery } from '../../core/queries/ledger.query';
import { CreateReceiptCommand } from '../../core/queries/pharma.query';
import { invalidateDashboard } from '../../core/queries/dashboard.query';
import {
    Page, PageHeader, PageBody, HeaderStat, ListToolbar, Button, DataTable,
    Banner, EmptyState, Spinner, Card, Field, Input, Select, Textarea,
    FormGrid, money, useConfirm, ShortcutHints,
} from '../../components/pos';
import { canDo, readSession } from '../../components/pos/permissions';
import { printVoucher, VOUCHER_SIZES } from '../../components/pos/voucher-print';

const MODES = ['CASH', 'BANK', 'UPI', 'CHEQUE'];

/* The print size the operator last used, per browser. The business config will
   own this once it exists; until then remembering the choice is enough. */
const SIZE_KEY = 'pos_receipt_print_size';

const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

/** Days overdue drives the colour, the same way the Ledger screen bands it. */
function Band({ days }) {
    const d = num(days);
    const tone = d <= 0
        ? { c: 'var(--pos-ok)', b: 'var(--pos-ok-soft)', t: 'Current' }
        : d <= 30
            ? { c: 'var(--pos-warn)', b: 'var(--pos-warn-soft)', t: `${d}d` }
            : { c: 'var(--pos-danger)', b: 'var(--pos-danger-soft)', t: `${d}d` };
    return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[10.5px] font-semibold"
              style={{ color: tone.c, background: tone.b }}>
            {tone.t}
        </span>
    );
}

export default function ReceiptModule() {
    const session = useMemo(() => readSession(), []);
    const perms = session?.permissions;
    const mayCollect = canDo(perms, 'receipt.create');
    const confirm = useConfirm();

    const [parties, setParties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [banner, setBanner] = useState(null);

    // Selected party + its open bills
    const [party, setParty] = useState(null);
    const [bills, setBills] = useState([]);
    const [billsLoading, setBillsLoading] = useState(false);

    // Receipt header
    const [docNo, setDocNo] = useState('');
    const [docDate, setDocDate] = useState(today());
    const [mode, setMode] = useState('CASH');
    const [narration, setNarration] = useState('');
    const [received, setReceived] = useState('');

    // ledgerId -> allocated amount (string, as typed)
    const [alloc, setAlloc] = useState({});
    const [saving, setSaving] = useState(false);
    const receivedRef = useRef(null);

    // Printing
    const [printSize, setPrintSize] = useState('A5');
    const [autoPrint, setAutoPrint] = useState(true);
    const [lastVoucher, setLastVoucher] = useState(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(SIZE_KEY);
            if (saved && VOUCHER_SIZES.some(s => s.id === saved)) setPrintSize(saved);
        } catch { /* private mode */ }
    }, []);

    const chooseSize = useCallback((id) => {
        setPrintSize(id);
        try { localStorage.setItem(SIZE_KEY, id); } catch { /* private mode */ }
    }, []);

    const loadParties = useCallback(async () => {
        setLoading(true);
        try {
            const list = await new LedgerPartiesQuery().execute('CUSTOMER');
            setParties((list || []).filter(p => num(p.balance) > 0));
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message || 'Could not load customers.' });
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadParties(); }, [loadParties]);

    const openParty = useCallback(async (p) => {
        setParty(p);
        setBills([]);
        setAlloc({});
        setNarration('');
        setReceived('');
        setDocDate(today());
        setDocNo(`RCP-${Date.now().toString().slice(-8)}`);
        setBillsLoading(true);
        try {
            const list = await new LedgerOpenBillsQuery().execute('CUSTOMER', p.partyName, p.contactNumber);
            setBills(list || []);
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message || 'Could not load open bills.' });
        }
        setBillsLoading(false);
        setTimeout(() => receivedRef.current?.focus(), 0);
    }, []);

    const backToList = useCallback(() => { setParty(null); setBills([]); setAlloc({}); }, []);

    /* ── derived totals ───────────────────────────────────── */
    const totalOpen = useMemo(() => bills.reduce((a, b) => a + num(b.balance), 0), [bills]);
    const allocated = useMemo(
        () => r2(Object.values(alloc).reduce((a, v) => a + num(v), 0)),
        [alloc],
    );
    const receivedAmt = r2(received);
    const unapplied = r2(receivedAmt - allocated);

    /* The server refuses these too — saying so here saves the round trip. */
    const problem = useMemo(() => {
        if (receivedAmt <= 0) return 'Enter the amount received.';
        if (allocated <= 0) return 'Allocate the receipt against at least one bill.';
        if (allocated > receivedAmt) {
            return `Allocated ${money(allocated)} is more than the ${money(receivedAmt)} received.`;
        }
        const over = bills.find(b => num(alloc[b.id]) > num(b.balance) + 0.001);
        if (over) {
            return `Bill ${over.invoiceNumber} has only ${money(num(over.balance))} outstanding.`;
        }
        return null;
    }, [receivedAmt, allocated, alloc, bills]);

    const setLine = useCallback((id, v) => {
        setAlloc(prev => ({ ...prev, [id]: v }));
    }, []);

    /** Spread whatever was received across the bills, oldest first. */
    const autoAllocate = useCallback(() => {
        let left = r2(received);
        if (left <= 0) { setBanner({ tone: 'warn', text: 'Enter the amount received first.' }); return; }
        const next = {};
        for (const b of bills) {
            if (left <= 0) break;
            const take = Math.min(left, num(b.balance));
            if (take > 0) { next[b.id] = String(r2(take)); left = r2(left - take); }
        }
        setAlloc(next);
        if (left > 0) {
            setBanner({
                tone: 'info',
                text: `${money(left)} could not be allocated — it is more than the total outstanding. It will be held on account.`,
            });
        }
    }, [received, bills]);

    const clearAllocation = useCallback(() => setAlloc({}), []);

    const save = useCallback(async () => {
        if (problem) { setBanner({ tone: 'warn', text: problem }); return; }

        if (unapplied > 0) {
            const ok = await confirm({
                title: 'Leave part of the receipt unapplied?',
                message: `${money(unapplied)} of the ${money(receivedAmt)} received is not allocated to any bill. `
                       + 'It will be recorded on the receipt but will not reduce any invoice.',
                confirmLabel: 'Save anyway',
            });
            if (!ok) return;
        }

        const lines = bills
            .filter(b => num(alloc[b.id]) > 0)
            .map(b => ({
                ledgerId: Number(b.id),
                amount: r2(alloc[b.id]),
                invoiceNumber: b.invoiceNumber,
                invoiceDate: b.invoiceDate,
                billAmount: num(b.amount),
            }));

        setSaving(true);
        try {
            await new CreateReceiptCommand().execute({
                docNo,
                docDate,
                billRefNo: lines.map(l => l.invoiceNumber).join(', ').slice(0, 190),
                docType: 'Against Ref.',
                refType: 'Auto',
                accHead: party.partyName,
                payMode: mode,
                narration1: narration,
                narration2: '',
                cashDisc: 0,
                amount: receivedAmt,
                recAmount: receivedAmt,
                rows: lines,
            });
            invalidateDashboard();

            // Keep everything the voucher needs BEFORE the state is cleared —
            // openBefore has to be the balance as it stood when the money was
            // taken, not what the bill reads after the server settled it.
            const voucher = {
                kind: 'RECEIPT',
                company: { name: 'AVS ECOM PRIVATE LIMITED' },
                docNo,
                docDate,
                partyName: party.partyName,
                mode,
                narration,
                total: receivedAmt,
                unapplied,
                partyBalanceAfter: r2(totalOpen - allocated),
                lines: bills
                    .filter(b => num(alloc[b.id]) > 0)
                    .map(b => ({
                        invoiceNumber: b.invoiceNumber,
                        invoiceDate: b.invoiceDate,
                        billAmount: num(b.amount),
                        openBefore: num(b.balance),
                        paidNow: r2(alloc[b.id]),
                    })),
            };
            setLastVoucher(voucher);

            setBanner({
                tone: 'ok',
                text: `Receipt ${docNo} saved — ${money(receivedAmt)} collected from ${party.partyName}`
                    + `${unapplied > 0 ? `, ${money(unapplied)} on account` : ''}.`
                    + ` ${money(voucher.partyBalanceAfter)} still due.`,
            });

            if (autoPrint) printVoucher(voucher, printSize);

            await loadParties();
            backToList();
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message || 'Could not save the receipt.' });
        }
        setSaving(false);
    }, [problem, unapplied, receivedAmt, allocated, totalOpen, bills, alloc, docNo, docDate, party, mode,
        narration, autoPrint, printSize, confirm, loadParties, backToList]);

    /* ── party list ───────────────────────────────────────── */
    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q
            ? parties.filter(p =>
                `${p.partyName} ${p.contactNumber || ''} ${p.gstNumber || ''}`.toLowerCase().includes(q))
            : parties;
        return [...list].sort((a, b) => num(b.maxDaysOverdue) - num(a.maxDaysOverdue));
    }, [parties, search]);

    const totals = useMemo(() => ({
        balance: parties.reduce((a, p) => a + num(p.balance), 0),
        bills: parties.reduce((a, p) => a + num(p.openBillCount), 0),
    }), [parties]);

    const partyColumns = [
        {
            key: 'partyName', header: 'Customer',
            render: (p) => (
                <div className="min-w-0">
                    <strong>{p.partyName}</strong>
                    {p.contactNumber && (
                        <div className="text-[11.5px] text-[var(--pos-ink-3)]">{p.contactNumber}</div>
                    )}
                </div>
            ),
        },
        { key: 'openBillCount', header: 'Open bills', width: 100, align: 'right', className: 'num',
          render: (p) => num(p.openBillCount) },
        { key: 'balance', header: 'Outstanding', width: 140, align: 'right', className: 'num',
          render: (p) => <span className="font-semibold">{money(num(p.balance))}</span> },
        { key: 'maxDaysOverdue', header: 'Oldest', width: 90, align: 'right',
          render: (p) => <Band days={p.maxDaysOverdue} /> },
    ];

    if (!party) {
        return (
            <Page>
                <PageHeader
                    icon={ReceiptIcon}
                    title="Receipt"
                    subtitle="Collect against a customer's open bills"
                    meta={<>
                        <HeaderStat label="Receivable" value={money(totals.balance, 0)} />
                        <HeaderStat label="Open bills" value={totals.bills} />
                    </>}
                    actions={<>
                        {/* A jammed printer should not mean a lost voucher. */}
                        {lastVoucher && (
                            <Button variant="default" icon={Printer} size="sm"
                                    onClick={() => printVoucher(lastVoucher, printSize)}
                                    title={`Reprint receipt ${lastVoucher.docNo}`}>
                                Reprint {lastVoucher.docNo}
                            </Button>
                        )}
                        <Button variant="ghost" icon={RefreshCw} onClick={loadParties} title="Refresh" />
                    </>}
                />
                <PageBody className="flex flex-col gap-4">
                    {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}
                    <ListToolbar
                        search={search}
                        onSearch={setSearch}
                        placeholder="Search customer, mobile or GSTIN…"
                        count={shown.length}
                        countLabel="customers"
                        actions={<span className="text-[12px] text-[var(--pos-ink-3)]">Click a customer to collect</span>}
                    />
                    <DataTable
                        columns={partyColumns}
                        rows={shown}
                        rowKey={(p) => `${p.partyName}|${p.contactNumber || ''}`}
                        onActivate={openParty}
                        onSelect={() => {}}
                        loading={loading}
                        empty={
                            <EmptyState
                                icon={Users}
                                title="Nothing outstanding"
                                hint="Every customer bill is settled. A receipt is only raised against an open bill."
                            />
                        }
                    />
                </PageBody>
            </Page>
        );
    }

    /* ── collection view ──────────────────────────────────── */
    const billColumns = [
        { key: 'invoiceNumber', header: 'Bill No', width: 130,
          render: (b) => <span className="code">{b.invoiceNumber}</span> },
        { key: 'invoiceDate', header: 'Date', width: 110,
          render: (b) => String(b.invoiceDate || '').slice(0, 10) },
        { key: 'dueDate', header: 'Due', width: 110,
          render: (b) => String(b.dueDate || '').slice(0, 10) },
        { key: 'daysOverdue', header: 'Age', width: 80, align: 'right',
          render: (b) => <Band days={b.daysOverdue} /> },
        { key: 'amount', header: 'Bill Amt', width: 120, align: 'right', className: 'num',
          render: (b) => money(num(b.amount)) },
        { key: 'paidAmount', header: 'Settled', width: 120, align: 'right', className: 'num',
          render: (b) => <span className="text-[var(--pos-ink-2)]">{money(num(b.paidAmount))}</span> },
        { key: 'balance', header: 'Outstanding', width: 130, align: 'right', className: 'num',
          render: (b) => <span className="font-semibold">{money(num(b.balance))}</span> },
        {
            key: 'alloc', header: 'Allocate', width: 140, align: 'right',
            render: (b) => {
                const v = alloc[b.id] ?? '';
                const over = num(v) > num(b.balance) + 0.001;
                return (
                    <Input
                        numeric
                        type="number"
                        min="0"
                        step="0.01"
                        value={v}
                        invalid={over}
                        aria-label={`Allocate to bill ${b.invoiceNumber}`}
                        onChange={(e) => setLine(b.id, e.target.value)}
                        className="!h-[28px] !text-[12.5px]"
                        placeholder="0.00"
                    />
                );
            },
        },
        {
            // What the customer still owes on THIS bill once the receipt is
            // saved. Without it the operator has to do the subtraction in their
            // head for every line, which is where collection mistakes come from.
            key: 'after', header: 'Balance after', width: 130, align: 'right', className: 'num',
            render: (b) => {
                const after = r2(num(b.balance) - num(alloc[b.id]));
                const cleared = after <= 0 && num(alloc[b.id]) > 0;
                return (
                    <span className="font-semibold"
                          style={{ color: cleared ? 'var(--pos-ok)' : 'var(--pos-ink)' }}>
                        {cleared ? 'Settled' : money(after)}
                    </span>
                );
            },
        },
    ];

    return (
        <Page>
            <PageHeader
                icon={ReceiptIcon}
                title={party.partyName}
                subtitle={`${bills.length} open bill${bills.length === 1 ? '' : 's'} · ${money(totalOpen)} outstanding`}
                meta={<>
                    <HeaderStat label="Received" value={money(receivedAmt)} />
                    <HeaderStat label="Allocated" value={money(allocated)} />
                    <HeaderStat label="Unapplied" value={money(unapplied)}
                                tone={unapplied > 0 ? 'warn' : 'default'} />
                </>}
                actions={
                    <Button variant="ghost" icon={ChevronLeft} onClick={backToList}>Back</Button>
                }
            />
            <PageBody className="flex flex-col gap-4">
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                <Card className="shrink-0" title="Receipt">
                    <FormGrid cols={4}>
                        <Field label="Receipt No">
                            <Input value={docNo} onChange={e => setDocNo(e.target.value)} />
                        </Field>
                        <Field label="Date" required>
                            <Input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} />
                        </Field>
                        <Field label="Mode" required>
                            <Select value={mode} onChange={e => setMode(e.target.value)}>
                                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </Select>
                        </Field>
                        <Field label="Amount received" required
                               hint={totalOpen > 0 ? `Total outstanding ${money(totalOpen)}` : undefined}>
                            <Input
                                ref={receivedRef}
                                numeric type="number" min="0" step="0.01"
                                value={received}
                                onChange={e => setReceived(e.target.value)}
                                placeholder="0.00"
                            />
                        </Field>
                        <Field label="Narration" span={4}>
                            <Textarea rows={2} value={narration}
                                      onChange={e => setNarration(e.target.value)}
                                      placeholder="Cheque number, reference, or why this receipt was taken" />
                        </Field>
                    </FormGrid>
                </Card>

                <Card className="shrink-0"
                    title="Open bills"
                    subtitle="Oldest first — allocate the receipt across the bills it settles"
                    flush
                    actions={<>
                        <Button size="sm" variant="default" icon={Zap} onClick={autoAllocate}>
                            Auto allocate
                        </Button>
                        <Button size="sm" variant="ghost" icon={Eraser} onClick={clearAllocation}>
                            Clear
                        </Button>
                    </>}
                >
                    <DataTable
                        columns={billColumns}
                        rows={bills}
                        loading={billsLoading}
                        empty={
                            <EmptyState
                                icon={Wallet}
                                title="No open bills"
                                hint={`${party.partyName} has nothing outstanding.`}
                            />
                        }
                        footer={
                            <tr>
                                <td colSpan={6}>Total</td>
                                <td className="num">{money(totalOpen)}</td>
                                <td className="num">{money(allocated)}</td>
                                <td className="num">{money(r2(totalOpen - allocated))}</td>
                            </tr>
                        }
                    />
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
                    <div className="flex flex-wrap items-center gap-3">
                        <ShortcutHints items={[['Enter', 'next field'], ['Esc', 'back to list']]} />
                        <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--pos-ink-2)]">
                            <input type="checkbox" name="autoPrint" checked={autoPrint}
                                   onChange={e => setAutoPrint(e.target.checked)}
                                   className="pos-focusable accent-[var(--pos-ink-2)] w-[14px] h-[14px]" />
                            Print receipt
                        </label>
                        <Select value={printSize} onChange={e => chooseSize(e.target.value)}
                                aria-label="Receipt print size"
                                className="!h-[28px] !text-[12px] !w-[110px]">
                            {VOUCHER_SIZES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </Select>
                    </div>
                    <div className="flex items-center gap-3">
                        {problem && (
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--pos-warn)]">
                                <AlertTriangle size={13} /> {problem}
                            </span>
                        )}
                        {!problem && unapplied > 0 && (
                            <span className="text-[12px] text-[var(--pos-ink-3)]">
                                {money(unapplied)} will be held on account
                            </span>
                        )}
                        <Button
                            variant="primary"
                            icon={Check}
                            loading={saving}
                            disabled={!!problem || !mayCollect}
                            onClick={save}
                        >
                            Save receipt
                        </Button>
                    </div>
                </div>
            </PageBody>
        </Page>
    );
}
