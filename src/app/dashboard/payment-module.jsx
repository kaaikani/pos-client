"use client";
/**
 * Payment — paying a supplier against their open bills.
 *
 * The supplier-side mirror of Receipt, on the same engine:
 *   PARTIES  suppliers we owe, worst overdue first.
 *   PAY      one supplier's open bills with an Allocate column, oldest first.
 *
 * The screen this replaces made the operator type the bill number and amounts by
 * hand, and the server then settled oldest-bill-first regardless — so paying
 * against one specific invoice cleared different ones. The server now applies
 * exactly the allocation chosen here, under a row lock.
 *
 * Payment carries a discount the receipt side does not: a bill can be settled by
 * cash plus a settlement discount. `Paying + Discount` is what clears the bill,
 * and that sum is what the allocation line sends.
 *
 * Money is in RUPEES — the Ledger stores rupees, not minor units.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Wallet, RefreshCw, ChevronLeft, Truck, AlertTriangle,
    Check, Zap, Eraser, Printer,
} from 'lucide-react';
import { LedgerPartiesQuery, LedgerOpenBillsQuery } from '../../core/queries/ledger.query';
import { CreatePaymentCommand } from '../../core/queries/pos.query';
import { invalidateDashboard } from '../../core/queries/dashboard.query';
import {
    Page, PageHeader, PageBody, HeaderStat, ListToolbar, Button, DataTable,
    Banner, EmptyState, Card, Field, Input, Select, Textarea,
    FormGrid, money, useConfirm, ShortcutHints, useFormFlow,
} from '../../components/pos';
import { canDo, readSession } from '../../components/pos/permissions';
import { printVoucher, VOUCHER_SIZES } from '../../components/pos/voucher-print';

const MODES = ['CASH', 'BANK', 'UPI', 'CHEQUE'];
const SIZE_KEY = 'pos_payment_print_size';

const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

/** Days overdue drives the colour, same banding as Ledger and Receipt. */
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

export default function PaymentModule() {
    const session = useMemo(() => readSession(), []);
    const perms = session?.permissions;
    const mayPay = canDo(perms, 'payment.create');
    const confirm = useConfirm();

    const [parties, setParties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [banner, setBanner] = useState(null);

    const [party, setParty] = useState(null);
    const [bills, setBills] = useState([]);
    const [billsLoading, setBillsLoading] = useState(false);

    // Voucher header
    const [docNo, setDocNo] = useState('');
    const [docDate, setDocDate] = useState(today());
    const [mode, setMode] = useState('CASH');
    const [refNo, setRefNo] = useState('');
    const [narration, setNarration] = useState('');
    const [paying, setPaying] = useState('');

    // ledgerId -> { pay, disc } as typed
    const [alloc, setAlloc] = useState({});
    const [saving, setSaving] = useState(false);
    const payingRef = useRef(null);

    // Same as the receipt screen: walk the header, leave saving to the button.
    const flow = useFormFlow(undefined, { autoFocus: false });

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
            const list = await new LedgerPartiesQuery().execute('SUPPLIER');
            setParties((list || []).filter(p => num(p.balance) > 0));
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message || 'Could not load suppliers.' });
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadParties(); }, [loadParties]);

    const openParty = useCallback(async (p) => {
        setParty(p);
        setBills([]);
        setAlloc({});
        setNarration('');
        setRefNo('');
        setPaying('');
        setDocDate(today());
        setDocNo(`PAY-${Date.now().toString().slice(-8)}`);
        setBillsLoading(true);
        try {
            const list = await new LedgerOpenBillsQuery().execute('SUPPLIER', p.partyName, p.contactNumber);
            setBills(list || []);
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message || 'Could not load open bills.' });
        }
        setBillsLoading(false);
        setTimeout(() => payingRef.current?.focus(), 0);
    }, []);

    const backToList = useCallback(() => { setParty(null); setBills([]); setAlloc({}); }, []);

    /* ── derived totals ───────────────────────────────────── */
    const totalOpen = useMemo(() => bills.reduce((a, b) => a + num(b.balance), 0), [bills]);
    const lineOf = useCallback((id) => alloc[id] || { pay: '', disc: '' }, [alloc]);

    const allocPay = useMemo(
        () => r2(Object.values(alloc).reduce((a, v) => a + num(v.pay), 0)),
        [alloc],
    );
    const allocDisc = useMemo(
        () => r2(Object.values(alloc).reduce((a, v) => a + num(v.disc), 0)),
        [alloc],
    );
    const allocTotal = r2(allocPay + allocDisc);
    const payingAmt = r2(paying);
    const unapplied = r2(payingAmt - allocPay);

    /* The server refuses these too — saying so here saves the round trip. */
    const problem = useMemo(() => {
        if (payingAmt <= 0 && allocDisc <= 0) return 'Enter the amount being paid.';
        if (allocTotal <= 0) return 'Allocate the payment against at least one bill.';
        if (allocPay > payingAmt) {
            return `Allocated ${money(allocPay)} is more than the ${money(payingAmt)} being paid.`;
        }
        const over = bills.find(b => {
            const l = alloc[b.id];
            return l && r2(num(l.pay) + num(l.disc)) > num(b.balance) + 0.001;
        });
        if (over) {
            return `Bill ${over.invoiceNumber} has only ${money(num(over.balance))} outstanding.`;
        }
        return null;
    }, [payingAmt, allocPay, allocDisc, allocTotal, alloc, bills]);

    const setLine = useCallback((id, field, v) => {
        setAlloc(prev => ({ ...prev, [id]: { ...(prev[id] || { pay: '', disc: '' }), [field]: v } }));
    }, []);

    /** Spread the cash across bills, oldest first. Existing discounts are kept. */
    const autoAllocate = useCallback(() => {
        let left = r2(paying);
        if (left <= 0) { setBanner({ tone: 'warn', text: 'Enter the amount being paid first.' }); return; }
        const next = {};
        for (const b of bills) {
            const disc = num(lineOf(b.id).disc);
            const room = r2(num(b.balance) - disc);
            if (room <= 0) { if (disc > 0) next[b.id] = { pay: '', disc: String(disc) }; continue; }
            if (left <= 0) { if (disc > 0) next[b.id] = { pay: '', disc: String(disc) }; continue; }
            const take = Math.min(left, room);
            next[b.id] = { pay: String(r2(take)), disc: disc > 0 ? String(disc) : '' };
            left = r2(left - take);
        }
        setAlloc(next);
        if (left > 0) {
            setBanner({
                tone: 'info',
                text: `${money(left)} could not be allocated — it is more than the total outstanding.`,
            });
        }
    }, [paying, bills, lineOf]);

    const clearAllocation = useCallback(() => setAlloc({}), []);

    const save = useCallback(async () => {
        if (problem) { setBanner({ tone: 'warn', text: problem }); return; }

        if (unapplied > 0) {
            const ok = await confirm({
                title: 'Leave part of the payment unapplied?',
                message: `${money(unapplied)} of the ${money(payingAmt)} being paid is not allocated to any bill. `
                       + 'It will be recorded on the voucher but will not reduce any invoice.',
                confirmLabel: 'Save anyway',
            });
            if (!ok) return;
        }

        // The server clears a bill by pay + discount, so that sum is the line amount.
        const lines = bills
            .filter(b => r2(num(lineOf(b.id).pay) + num(lineOf(b.id).disc)) > 0)
            .map(b => {
                const l = lineOf(b.id);
                return {
                    ledgerId: Number(b.id),
                    amount: r2(num(l.pay) + num(l.disc)),
                    paying: r2(l.pay),
                    discount: r2(l.disc),
                    invoiceNumber: b.invoiceNumber,
                    invoiceDate: b.invoiceDate,
                    billAmount: num(b.amount),
                };
            });

        setSaving(true);
        try {
            // payNo is left out when blank so the server issues it from the PAY
            // series. Sending an empty string would look like a deliberate
            // override and store a voucher with no number.
            const saved = await new CreatePaymentCommand().execute({
                ...(docNo ? { payNo: docNo } : {}),
                payDate: docDate,
                refNo,
                payType: 'Against Ref.',
                supplierName: party.partyName,
                supplierGST: party.gstNumber || '',
                transMode: mode,
                chequeNo: mode === 'CHEQUE' ? refNo : '',
                narration,
                rows: lines,
                totalPaying: payingAmt,
                totalDisc: allocDisc,
                totalNet: r2(payingAmt + allocDisc),
            });
            invalidateDashboard();

            // Capture the voucher BEFORE state is cleared — openBefore must be the
            // balance as it stood when the money went out.
            // The number the server actually issued. The printed voucher and the
            // database row must agree.
            const issuedNo = String(saved?.payNo || docNo || '');
            setDocNo(issuedNo);

            const voucher = {
                kind: 'PAYMENT',
                company: { name: 'AVS ECOM PRIVATE LIMITED' },
                docNo: issuedNo,
                docDate,
                partyName: party.partyName,
                mode,
                refNo,
                narration,
                total: payingAmt,
                unapplied,
                partyBalanceAfter: r2(totalOpen - allocTotal),
                lines: lines.map(l => {
                    const b = bills.find(x => Number(x.id) === l.ledgerId);
                    return {
                        invoiceNumber: l.invoiceNumber,
                        invoiceDate: l.invoiceDate,
                        billAmount: l.billAmount,
                        openBefore: num(b?.balance),
                        paidNow: l.amount,
                    };
                }),
            };
            setLastVoucher(voucher);

            setBanner({
                tone: 'ok',
                text: `Payment ${issuedNo} saved — ${money(payingAmt)} paid to ${party.partyName}`
                    + `${allocDisc > 0 ? `, ${money(allocDisc)} discount` : ''}.`
                    + ` ${money(voucher.partyBalanceAfter)} still payable.`,
            });

            if (autoPrint) printVoucher(voucher, printSize);

            await loadParties();
            backToList();
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message || 'Could not save the payment.' });
        }
        setSaving(false);
    }, [problem, unapplied, payingAmt, allocDisc, allocTotal, totalOpen, bills, lineOf,
        docNo, docDate, refNo, party, mode, narration, autoPrint, printSize,
        confirm, loadParties, backToList]);

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
            key: 'partyName', header: 'Supplier',
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
        { key: 'balance', header: 'Payable', width: 140, align: 'right', className: 'num',
          render: (p) => <span className="font-semibold">{money(num(p.balance))}</span> },
        { key: 'maxDaysOverdue', header: 'Oldest', width: 90, align: 'right',
          render: (p) => <Band days={p.maxDaysOverdue} /> },
    ];

    if (!party) {
        return (
            <Page>
                <PageHeader
                    icon={Wallet}
                    title="Payment"
                    subtitle="Pay a supplier against their open bills"
                    meta={<>
                        <HeaderStat label="Payable" value={money(totals.balance, 0)} />
                        <HeaderStat label="Open bills" value={totals.bills} />
                    </>}
                    actions={<>
                        {lastVoucher && (
                            <Button variant="default" icon={Printer} size="sm"
                                    onClick={() => printVoucher(lastVoucher, printSize)}
                                    title={`Reprint voucher ${lastVoucher.docNo}`}>
                                Reprint {lastVoucher.docNo}
                            </Button>
                        )}
                        <Button variant="ghost" icon={RefreshCw} onClick={loadParties} title="Refresh" />
                    </>}
                />
                <PageBody className="flex flex-col gap-4">
                    {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}
                    <ListToolbar
                        autoFocus
                        search={search}
                        onSearch={setSearch}
                        placeholder="Search supplier, mobile or GSTIN…"
                        count={shown.length}
                        countLabel="suppliers"
                        actions={<span className="text-[12px] text-[var(--pos-ink-3)]">Click a supplier to pay</span>}
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
                                icon={Truck}
                                title="Nothing payable"
                                hint="Every supplier bill is settled. A payment is only raised against an open bill."
                            />
                        }
                    />
                </PageBody>
            </Page>
        );
    }

    /* ── payment view ─────────────────────────────────────── */
    const billColumns = [
        { key: 'invoiceNumber', header: 'Bill No', width: 120,
          render: (b) => <span className="code">{b.invoiceNumber}</span> },
        { key: 'invoiceDate', header: 'Date', width: 105,
          render: (b) => String(b.invoiceDate || '').slice(0, 10) },
        { key: 'dueDate', header: 'Due', width: 105,
          render: (b) => String(b.dueDate || '').slice(0, 10) },
        { key: 'daysOverdue', header: 'Age', width: 75, align: 'right',
          render: (b) => <Band days={b.daysOverdue} /> },
        { key: 'amount', header: 'Bill Amt', width: 110, align: 'right', className: 'num',
          render: (b) => money(num(b.amount)) },
        { key: 'balance', header: 'Outstanding', width: 120, align: 'right', className: 'num',
          render: (b) => <span className="font-semibold">{money(num(b.balance))}</span> },
        {
            key: 'pay', header: 'Paying', width: 120, align: 'right',
            render: (b) => {
                const l = lineOf(b.id);
                const over = r2(num(l.pay) + num(l.disc)) > num(b.balance) + 0.001;
                return (
                    <Input
                        numeric type="number" min="0" step="0.01"
                        value={l.pay}
                        invalid={over}
                        aria-label={`Paying against bill ${b.invoiceNumber}`}
                        onChange={(e) => setLine(b.id, 'pay', e.target.value)}
                        className="!h-[28px] !text-[12.5px]"
                        placeholder="0.00"
                    />
                );
            },
        },
        {
            key: 'disc', header: 'Discount', width: 110, align: 'right',
            render: (b) => {
                const l = lineOf(b.id);
                return (
                    <Input
                        numeric type="number" min="0" step="0.01"
                        value={l.disc}
                        aria-label={`Settlement discount on bill ${b.invoiceNumber}`}
                        onChange={(e) => setLine(b.id, 'disc', e.target.value)}
                        className="!h-[28px] !text-[12.5px]"
                        placeholder="0.00"
                    />
                );
            },
        },
        {
            key: 'after', header: 'Balance after', width: 125, align: 'right', className: 'num',
            render: (b) => {
                const l = lineOf(b.id);
                const applied = r2(num(l.pay) + num(l.disc));
                const after = r2(num(b.balance) - applied);
                const cleared = after <= 0 && applied > 0;
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
                icon={Wallet}
                title={party.partyName}
                subtitle={`${bills.length} open bill${bills.length === 1 ? '' : 's'} · ${money(totalOpen)} payable`}
                meta={<>
                    <HeaderStat label="Paying" value={money(payingAmt)} />
                    <HeaderStat label="Discount" value={money(allocDisc)} />
                    <HeaderStat label="Unapplied" value={money(unapplied)}
                                tone={unapplied > 0 ? 'warn' : 'default'} />
                </>}
                actions={<Button variant="ghost" icon={ChevronLeft} onClick={backToList}>Back</Button>}
            />
            <PageBody className="flex flex-col gap-4">
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                <Card ref={flow.ref} className="shrink-0" title="Payment">
                    <FormGrid cols={4}>
                        <Field label="Voucher No" hint="Issued on save">
                            <Input readOnly placeholder="Auto" value={docNo}
                                title="Issued by the server when the voucher is saved" />
                        </Field>
                        <Field label="Date" required>
                            <Input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} />
                        </Field>
                        <Field label="Mode" required>
                            <Select value={mode} onChange={e => setMode(e.target.value)}>
                                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </Select>
                        </Field>
                        <Field label="Amount paying" required
                               hint={totalOpen > 0 ? `Total payable ${money(totalOpen)}` : undefined}>
                            <Input
                                ref={payingRef}
                                numeric type="number" min="0" step="0.01"
                                value={paying}
                                onChange={e => setPaying(e.target.value)}
                                placeholder="0.00"
                            />
                        </Field>
                        <Field label={mode === 'CHEQUE' ? 'Cheque number' : 'Reference'} span={2}>
                            <Input value={refNo} onChange={e => setRefNo(e.target.value)}
                                   placeholder={mode === 'CHEQUE' ? 'Cheque no.' : 'UPI / transfer reference'} />
                        </Field>
                        <Field label="Narration" span={2}>
                            <Textarea rows={2} value={narration}
                                      onChange={e => setNarration(e.target.value)}
                                      placeholder="Why this payment was made" />
                        </Field>
                    </FormGrid>
                </Card>

                <Card className="shrink-0"
                    title="Open bills"
                    subtitle="Oldest first — a bill clears by Paying plus Discount"
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
                                <td colSpan={5}>Total</td>
                                <td className="num">{money(totalOpen)}</td>
                                <td className="num">{money(allocPay)}</td>
                                <td className="num">{money(allocDisc)}</td>
                                <td className="num">{money(r2(totalOpen - allocTotal))}</td>
                            </tr>
                        }
                    />
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
                    <div className="flex flex-wrap items-center gap-3">
                        <ShortcutHints items={[['Enter', 'next field'], ['Esc', 'back to list']]} />
                        <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--pos-ink-2)]">
                            <input type="checkbox" name="autoPrintPayment" checked={autoPrint}
                                   onChange={e => setAutoPrint(e.target.checked)}
                                   className="pos-focusable accent-[var(--pos-ink-2)] w-[14px] h-[14px]" />
                            Print voucher
                        </label>
                        <Select value={printSize} onChange={e => chooseSize(e.target.value)}
                                aria-label="Voucher print size"
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
                                {money(unapplied)} not applied to any bill
                            </span>
                        )}
                        <Button
                            variant="primary"
                            icon={Check}
                            loading={saving}
                            disabled={!!problem || !mayPay}
                            onClick={save}
                        >
                            Save payment
                        </Button>
                    </div>
                </div>
            </PageBody>
        </Page>
    );
}
