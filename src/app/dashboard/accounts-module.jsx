"use client";
/**
 * The books — Trial Balance, Profit and Loss, Balance Sheet, Day Book, and the
 * chart of accounts behind them.
 *
 * All five read the same journal lines. They are one screen rather than five
 * because that is how they are used: a figure that looks wrong in the Profit
 * and Loss is chased into the Trial Balance and then into the Day Book, and
 * making that a navigation exercise is how people stop checking.
 *
 * Nothing here is computed in the browser. Every total comes from the server,
 * so the screen cannot quietly disagree with the books.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, RefreshCw, AlertTriangle } from 'lucide-react';
import {
    PosTrialBalanceQuery, PosProfitAndLossQuery, PosBalanceSheetQuery,
    PosDayBookQuery, PosAccountsQuery,
} from '../../core/queries/pos.query';
import {
    Page, PageHeader, PageBody, Card, Field, Input, Select, Button, Banner,
    DataTable, EmptyState, Tabs, money, useFormFlow,
} from '../../components/pos';

const VIEWS = [
    { value: 'trial', label: 'Trial Balance' },
    { value: 'pnl', label: 'Profit & Loss' },
    { value: 'bs', label: 'Balance Sheet' },
    { value: 'daybook', label: 'Day Book' },
    { value: 'chart', label: 'Chart of Accounts' },
];

const DOC_TYPES = [
    { value: '', label: 'All documents' },
    { value: 'SALE', label: 'Sales' },
    { value: 'PURCHASE', label: 'Purchases' },
    { value: 'RECEIPT', label: 'Receipts' },
    { value: 'PAYMENT', label: 'Payments' },
    { value: 'SALES_RETURN', label: 'Sales Returns' },
    { value: 'PURCHASE_RETURN', label: 'Purchase Returns' },
    { value: 'EXPENSE', label: 'Expenses' },
];

const firstOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};
const todayStr = () => new Date().toISOString().split('T')[0];

/** Right-aligned rupees, blank rather than 0.00 so a column reads as a column. */
const amt = (v) => (Number(v) ? money(v) : <span className="text-[var(--pos-ink-3)]">—</span>);

export default function AccountsModule() {
    const [view, setView] = useState('trial');
    const [fromDate, setFromDate] = useState(firstOfMonth());
    const [toDate, setToDate] = useState(todayStr());
    const [docType, setDocType] = useState('');

    const [trial, setTrial] = useState(null);
    const [pnl, setPnl] = useState(null);
    const [bs, setBs] = useState(null);
    const [dayBook, setDayBook] = useState([]);
    const [accounts, setAccounts] = useState([]);

    const [loading, setLoading] = useState(false);
    const [banner, setBanner] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const range = { fromDate, toDate };
            const [t, p, b, d, a] = await Promise.all([
                new PosTrialBalanceQuery().execute(range),
                new PosProfitAndLossQuery().execute(range),
                new PosBalanceSheetQuery().execute({ asOn: toDate }),
                new PosDayBookQuery().execute({ ...range, docType }),
                new PosAccountsQuery().execute(),
            ]);
            setTrial(t); setPnl(p); setBs(b); setDayBook(d); setAccounts(a);
            setBanner(null);
        } catch (e) {
            setBanner({ tone: 'danger', text: `Could not load the books: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate, docType]);

    useEffect(() => { load(); }, [load]);

    // The dates are the controls of this screen, so that is where the cursor
    // starts, and Enter past the last one runs the report.
    const flow = useFormFlow(() => load());

    /* ── Trial Balance ── */
    const trialColumns = [
        { key: 'accountCode', header: 'Code', width: 110,
          render: (r) => <span style={{ fontFamily: 'var(--pos-mono)' }}>{r.accountCode}</span> },
        { key: 'accountName', header: 'Account' },
        { key: 'groupName', header: 'Group', width: 170,
          render: (r) => <span className="text-[var(--pos-ink-2)]">{r.groupName}</span> },
        { key: 'debit', header: 'Debit', width: 130, align: 'right', render: (r) => amt(r.debit) },
        { key: 'credit', header: 'Credit', width: 130, align: 'right', render: (r) => amt(r.credit) },
        { key: 'closing', header: 'Closing', width: 150, align: 'right',
          render: (r) => (Number(r.closingDebit)
            ? <span>{money(r.closingDebit)} <span className="text-[var(--pos-ink-3)]">Dr</span></span>
            : Number(r.closingCredit)
              ? <span>{money(r.closingCredit)} <span className="text-[var(--pos-ink-3)]">Cr</span></span>
              : amt(0)) },
    ];

    const totalsRow = (label, debit, credit) => (
        <tr className="font-semibold border-t-2 border-[var(--pos-line)]">
            <td colSpan={3} className="text-[var(--pos-ink)]">{label}</td>
            <td className="num">{money(debit)}</td>
            <td className="num">{money(credit)}</td>
            <td />
        </tr>
    );

    /* ── Day Book, flattened so one table shows document and lines ── */
    const dayBookRows = useMemo(() => {
        const out = [];
        for (const e of dayBook) {
            e.lines.forEach((l, i) => out.push({
                key: `${e.id}-${i}`,
                first: i === 0,
                entryDate: e.entryDate,
                docType: e.docType,
                docNo: e.docNo,
                isReversal: e.isReversal,
                narration: e.narration,
                ...l,
            }));
        }
        return out;
    }, [dayBook]);

    const dayBookColumns = [
        { key: 'entryDate', header: 'Date', width: 110,
          render: (r) => (r.first ? r.entryDate : '') },
        { key: 'docNo', header: 'Document', width: 190,
          render: (r) => (r.first ? (
            <span>
                <span style={{ fontFamily: 'var(--pos-mono)' }}>{r.docNo || '—'}</span>
                {r.isReversal && <span className="ml-1.5 text-[10.5px] font-bold text-[var(--pos-danger)]">REVERSAL</span>}
            </span>
          ) : '') },
        { key: 'docType', header: 'Type', width: 130,
          render: (r) => (r.first ? <span className="text-[var(--pos-ink-2)]">{r.docType.replace('_', ' ').toLowerCase()}</span> : '') },
        { key: 'accountName', header: 'Account',
          render: (r) => (
            <span>
                {r.accountName}
                {r.partyName ? <span className="text-[var(--pos-ink-3)]"> — {r.partyName}</span> : null}
            </span>
          ) },
        { key: 'debit', header: 'Debit', width: 120, align: 'right', render: (r) => amt(r.debit) },
        { key: 'credit', header: 'Credit', width: 120, align: 'right', render: (r) => amt(r.credit) },
    ];

    /* ── Chart of Accounts ── */
    const chartColumns = [
        { key: 'code', header: 'Code', width: 120,
          render: (a) => <span style={{ fontFamily: 'var(--pos-mono)' }}>{a.code}</span> },
        { key: 'name', header: 'Account' },
        { key: 'groupName', header: 'Group', width: 180,
          render: (a) => <span className="text-[var(--pos-ink-2)]">{a.groupName}</span> },
        { key: 'groupType', header: 'Statement', width: 130,
          render: (a) => ({ B: 'Balance Sheet', T: 'Trading', P: 'Profit & Loss' }[a.groupType] || a.groupType) },
        { key: 'roles', header: 'Posts as', width: 220,
          render: (a) => (a.roles.length
            ? <span className="text-[11.5px] text-[var(--pos-ink-2)]">{a.roles.join(', ').toLowerCase()}</span>
            : <span className="text-[var(--pos-ink-3)]">—</span>) },
    ];

    const rangeControls = (
        <div className="flex flex-wrap items-end gap-3">
            <Field label={view === 'bs' ? 'As on' : 'From'}>
                {view === 'bs'
                    ? <Input type="date" className="!w-40" value={toDate} onChange={e => setToDate(e.target.value)} />
                    : <Input type="date" className="!w-40" value={fromDate} onChange={e => setFromDate(e.target.value)} />}
            </Field>
            {view !== 'bs' && (
                <Field label="To">
                    <Input type="date" className="!w-40" value={toDate} onChange={e => setToDate(e.target.value)} />
                </Field>
            )}
            {view === 'daybook' && (
                <Field label="Document type">
                    <Select className="!w-52" value={docType} onChange={e => setDocType(e.target.value)}>
                        {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </Select>
                </Field>
            )}
            <Button variant="default" icon={RefreshCw} onClick={load} loading={loading}>Refresh</Button>
        </div>
    );

    return (
        <Page>
            <PageHeader
                icon={BookOpen}
                title="Accounts"
                subtitle="Every figure is the sum of the journal entries behind it — nothing is stored separately."
            />
            <Tabs value={view} onChange={setView} items={VIEWS} />
            <PageBody>
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                {trial && trial.balanced === false && (
                    <Banner tone="danger">
                        <AlertTriangle size={14} className="inline mr-1" />
                        The trial balance does not tally — debit {money(trial.totalDebit)} against credit{' '}
                        {money(trial.totalCredit)}. Every entry is checked before it is written, so this should be
                        impossible; treat it as a fault to investigate, not a rounding difference.
                    </Banner>
                )}

                {view !== 'chart' && <Card ref={flow.ref} className="shrink-0">{rangeControls}</Card>}

                {view === 'trial' && (
                    <Card className="shrink-0" title="Trial Balance"
                        subtitle={trial ? `${trial.rows.length} accounts with movement in this period` : undefined}>
                        <DataTable
                            columns={trialColumns}
                            rows={trial?.rows || []}
                            rowKey={(r) => r.accountId}
                            loading={loading}
                            empty={<EmptyState icon={BookOpen} title="Nothing posted yet"
                                message="Entries appear here as soon as a bill, purchase, receipt or payment is saved." />}
                            footer={trial ? totalsRow('Total', trial.totalDebit, trial.totalCredit) : null}
                        />
                    </Card>
                )}

                {view === 'pnl' && pnl && (
                    <>
                        <Card className="shrink-0" title="Trading Account"
                            subtitle="Sales against the cost of what was sold — this gives gross profit.">
                            <DataTable columns={trialColumns} rows={pnl.trading} rowKey={(r) => r.accountId}
                                loading={loading}
                                empty={<EmptyState icon={BookOpen} title="No trading entries in this period" />} />
                            <div className="flex justify-between items-baseline pt-3 mt-2 border-t border-[var(--pos-line)]">
                                <span className="text-[13px] font-semibold text-[var(--pos-ink)]">Gross Profit</span>
                                <span className={`text-[15px] font-bold ${Number(pnl.grossProfit) < 0 ? 'text-[var(--pos-danger)]' : 'text-[var(--pos-ok)]'}`}
                                    style={{ fontFamily: 'var(--pos-mono)' }}>
                                    {money(pnl.grossProfit)}
                                </span>
                            </div>
                        </Card>

                        <Card className="shrink-0" title="Profit and Loss Account"
                            subtitle="Indirect income and expenses — rent, wages, discounts, round-off.">
                            <DataTable columns={trialColumns} rows={pnl.indirect} rowKey={(r) => r.accountId}
                                loading={loading}
                                empty={<EmptyState icon={BookOpen} title="No indirect entries in this period" />} />
                            <div className="flex justify-between items-baseline pt-3 mt-2 border-t-2 border-[var(--pos-line)]">
                                <span className="text-[14px] font-bold text-[var(--pos-ink)]">Net Profit</span>
                                <span className={`text-[17px] font-bold ${Number(pnl.netProfit) < 0 ? 'text-[var(--pos-danger)]' : 'text-[var(--pos-ok)]'}`}
                                    style={{ fontFamily: 'var(--pos-mono)' }}>
                                    {money(pnl.netProfit)}
                                </span>
                            </div>
                        </Card>
                    </>
                )}

                {view === 'bs' && bs && (
                    <>
                        <Card className="shrink-0" title="Assets">
                            <DataTable
                                columns={[
                                    chartColumns[0], chartColumns[1],
                                    { key: 'closingDebit', header: 'Amount', width: 160, align: 'right',
                                      render: (r) => money(r.closingDebit) },
                                ]}
                                rows={bs.assets} rowKey={(r) => r.accountId} loading={loading}
                                empty={<EmptyState icon={BookOpen} title="No assets recorded" />}
                                footer={
                                    <tr className="font-semibold border-t-2 border-[var(--pos-line)]">
                                        <td colSpan={2}>Total Assets</td>
                                        <td className="num">{money(bs.totalAssets)}</td>
                                    </tr>
                                } />
                        </Card>

                        <Card className="shrink-0" title="Liabilities and Capital"
                            subtitle="Profit for the period belongs to the owner, so it sits on this side.">
                            <DataTable
                                columns={[
                                    chartColumns[0], chartColumns[1],
                                    { key: 'closingCredit', header: 'Amount', width: 160, align: 'right',
                                      render: (r) => money(r.closingCredit) },
                                ]}
                                rows={bs.liabilities} rowKey={(r) => r.accountId} loading={loading}
                                empty={<EmptyState icon={BookOpen} title="No liabilities recorded" />}
                                footer={
                                    <>
                                        <tr>
                                            <td colSpan={2} className="text-[var(--pos-ink-2)]">Profit for the period</td>
                                            <td className="num">{money(bs.netProfit)}</td>
                                        </tr>
                                        <tr className="font-semibold border-t-2 border-[var(--pos-line)]">
                                            <td colSpan={2}>Total Liabilities and Capital</td>
                                            <td className="num">{money(Number(bs.totalLiabilities) + Number(bs.netProfit))}</td>
                                        </tr>
                                    </>
                                } />
                        </Card>

                        <Card className="shrink-0">
                            <div className="flex items-center justify-between">
                                <span className="text-[13px] text-[var(--pos-ink-2)]">
                                    Assets against liabilities plus profit
                                </span>
                                <span className={`text-[13px] font-bold ${bs.balanced ? 'text-[var(--pos-ok)]' : 'text-[var(--pos-danger)]'}`}>
                                    {bs.balanced ? 'Balanced' : 'Does not balance — investigate'}
                                </span>
                            </div>
                        </Card>
                    </>
                )}

                {view === 'daybook' && (
                    <Card className="shrink-0" title="Day Book"
                        subtitle={`${dayBook.length} entries. A reversal is the entry posted when a document was cancelled.`}>
                        <DataTable columns={dayBookColumns} rows={dayBookRows} rowKey={(r) => r.key}
                            loading={loading}
                            empty={<EmptyState icon={BookOpen} title="No entries in this period"
                                message="Change the dates, or save a document to see it appear here." />} />
                    </Card>
                )}

                {view === 'chart' && (
                    <Card className="shrink-0" title="Chart of Accounts"
                        subtitle="Which account each kind of posting uses. Created automatically on the first entry.">
                        <DataTable columns={chartColumns} rows={accounts} rowKey={(a) => a.id} loading={loading}
                            empty={<EmptyState icon={BookOpen} title="No accounts yet"
                                message="The chart is created the first time a document is posted." />} />
                    </Card>
                )}
            </PageBody>
        </Page>
    );
}
