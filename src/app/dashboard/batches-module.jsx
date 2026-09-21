"use client";
/**
 * Batches and expiry.
 *
 * A pharmacy's most expensive recurring mistake is stock that quietly expires on
 * the shelf. The system now holds stock per batch, each with its own expiry, so
 * that loss is visible before it happens rather than at the annual count.
 *
 * The window defaults to 90 days because that is roughly the point at which a
 * supplier will still take goods back. Shorter than that and the report only
 * tells you what you have already lost.
 *
 * Blocking a batch is not a stock movement. A recalled batch is still
 * physically in the shop and must still reconcile; blocking only stops it being
 * issued. Writing it off is a separate, deliberate stock adjustment, which is
 * what leaves the audit trail an inspector will ask for.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Ban, Undo2, Search } from 'lucide-react';
import {
    Page, PageHeader, PageBody, Card, Button, Banner, DataTable, EmptyState,
    Badge, Select, SearchInput, useConfirm, money, HeaderStat, usePageFocus,
} from '../../components/pos';
import {
    PosExpiringBatchesQuery, SetPosBatchBlockedCommand,
} from '../../core/queries/pos.query';

const WINDOWS = [
    { days: 0, label: 'Already expired' },
    { days: 30, label: 'Within 30 days' },
    { days: 60, label: 'Within 60 days' },
    { days: 90, label: 'Within 90 days' },
    { days: 180, label: 'Within 6 months' },
    { days: 365, label: 'Within a year' },
];

const qty = (v) => String(Math.round((Number(v) || 0) * 1000) / 1000);

export default function BatchesModule() {
    const confirm = useConfirm();

    // The operator opens this screen to look something up, so that is where
    // the cursor goes.
    const searchRef = usePageFocus();

    const [days, setDays] = useState(90);
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setRows(await new PosExpiringBatchesQuery().execute(days, true));
            setError('');
        } catch (e) {
            setError(e?.message || 'Could not load batches.');
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => { load(); }, [load]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r =>
            (r.itemName || '').toLowerCase().includes(q)
            || (r.itemCode || '').toLowerCase().includes(q)
            || (r.batchNo || '').toLowerCase().includes(q)
            || (r.supplier || '').toLowerCase().includes(q));
    }, [rows, search]);

    const totals = useMemo(() => ({
        expired: shown.filter(r => r.daysLeft < 0).length,
        value: shown.reduce((s, r) => s + (Number(r.stockValue) || 0), 0),
    }), [shown]);

    const toggleBlock = async (row) => {
        const blocking = row.status !== 'BLOCKED';
        if (blocking) {
            const ok = await confirm({
                title: `Hold back batch ${row.batchNo}?`,
                message:
                    `${qty(row.currentQty)} of ${row.itemName} stops being issued at the till and stops being `
                    + 'picked by first-expiry-first-out. The stock stays on the books — this is not a write-off. '
                    + 'To remove it from stock, make a stock adjustment.',
                confirmLabel: 'Hold it back',
            });
            if (!ok) return;
        }
        setError('');
        setNotice('');
        try {
            await new SetPosBatchBlockedCommand().execute(row.id, blocking, blocking ? 'Held back from issue' : '');
            setNotice(`Batch ${row.batchNo} ${blocking ? 'held back' : 'released'}.`);
            await load();
        } catch (e) {
            setError(e?.message || 'Could not change the batch.');
        }
    };

    const columns = [
        {
            key: 'expiryDate', header: 'Expires', width: 190,
            render: r => (
                <span className="flex items-center gap-2">
                    <span>{r.expiryDate}</span>
                    {r.daysLeft < 0
                        ? <Badge tone="danger">{Math.abs(r.daysLeft)} days ago</Badge>
                        : r.daysLeft <= 30
                            ? <Badge tone="warn">{r.daysLeft} days</Badge>
                            : <Badge tone="neutral">{r.daysLeft} days</Badge>}
                </span>
            ),
        },
        { key: 'itemName', header: 'Item', render: r => `${r.itemName} (${r.itemCode})` },
        { key: 'batchNo', header: 'Batch', width: 140 },
        { key: 'currentQty', header: 'Stock', width: 90, align: 'right', render: r => qty(r.currentQty) },
        { key: 'stockValue', header: 'Value', width: 110, align: 'right', render: r => money(r.stockValue) },
        { key: 'supplier', header: 'From', width: 160, render: r => r.supplier || '—' },
        {
            key: 'status', header: 'Status', width: 110, align: 'center',
            render: r => (r.status === 'BLOCKED'
                ? <Badge tone="danger">Held back</Badge>
                : <Badge tone="ok">In stock</Badge>),
        },
        {
            key: 'act', header: '', width: 130, align: 'center',
            render: r => (
                <Button size="sm" variant="ghost"
                    icon={r.status === 'BLOCKED' ? Undo2 : Ban}
                    onClick={e => { e.stopPropagation(); toggleBlock(r); }}>
                    {r.status === 'BLOCKED' ? 'Release' : 'Hold'}
                </Button>
            ),
        },
    ];

    return (
        <Page>
            <PageHeader
                icon={CalendarClock}
                title="Batches & Expiry"
                subtitle="What is closest to expiring, and what it is worth."
                meta={
                    <>
                        <HeaderStat label="Batches" value={String(shown.length)} />
                        <HeaderStat label="Already expired" value={String(totals.expired)}
                            tone={totals.expired > 0 ? 'danger' : 'default'} />
                        <HeaderStat label="Value at risk" value={money(totals.value)} />
                    </>
                }
            />
            <PageBody className="flex flex-col gap-3">
                {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}
                {notice && <Banner tone="ok" onClose={() => setNotice('')}>{notice}</Banner>}

                <div className="shrink-0 flex items-center gap-2">
                    <Select value={String(days)} onChange={e => setDays(Number(e.target.value))}
                        className="w-48">
                        {WINDOWS.map(w => (
                            <option key={w.days} value={w.days}>{w.label}</option>
                        ))}
                    </Select>
                    <SearchInput ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                        onClear={() => setSearch('')}
                        placeholder="Item, batch or supplier…" className="max-w-xs" />
                </div>

                <Card flush className="flex-1 min-h-0">
                    <DataTable
                        columns={columns}
                        rows={shown}
                        loading={loading}
                        empty={
                            <EmptyState
                                icon={Search}
                                title="Nothing expiring in this window"
                                hint={
                                    'Only batches that still have stock appear here. '
                                    + 'A batch is created when an item marked "track by batch" is purchased.'
                                }
                            />
                        }
                    />
                </Card>
            </PageBody>
        </Page>
    );
}
