"use client";
/**
 * Repacking — breaking a bag into packets.
 *
 * The shop buys a 50 KG bag of sugar and sells 1 KG packets, 500 GM packets and
 * loose sugar by weight. Before this screen the system held one pool of sugar
 * and could only say there were 50 KG of it; it could not say how many packets
 * had been made, or how much was still unpacked in the bag.
 *
 * The answer needs the packets to be their own items, each with its own barcode
 * and rate, and one document that takes from the bag and adds to the packets at
 * the same moment. The server does both movements in a single transaction, so
 * there is no instant at which the sugar is counted twice or not at all.
 *
 * The operator enters what they actually did — the packets they made — and the
 * bag quantity follows. Typing the bag quantity as well is allowed, and then
 * the two must agree: a bag that empties by more than the packets account for
 * is either a mis-key or spillage, and the operator is asked which.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Plus, Trash2, RotateCcw, Save } from 'lucide-react';
import {
    Page, PageHeader, PageBody, Card, FormGrid, Field, Input, Select, Button,
    Banner, DataTable, EmptyState, Badge, useConfirm, useFormFlow,
} from '../../components/pos';
import {
    ListItemsQuery, PosRepacksQuery, CreatePosRepackCommand, CancelPosRepackCommand,
} from '../../core/queries/pos.query';

const today = () => new Date().toISOString().slice(0, 10);
const blankLine = () => ({ itemCode: '', qty: '', bulkPerUnit: '' });

/** Trailing zeros make a stock figure hard to scan; 0.5 reads better than 0.500. */
const qty = (v) => {
    const n = Number(v) || 0;
    return String(Math.round(n * 1000) / 1000);
};

export default function RepackModule() {
    const confirm = useConfirm();

    // The bag, the date, then straight into the packet lines.
    const flow = useFormFlow();

    const [items, setItems] = useState([]);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [fromItemCode, setFromItemCode] = useState('');
    const [repackDate, setRepackDate] = useState(today());
    const [fromQty, setFromQty] = useState('');
    const [wastageQty, setWastageQty] = useState('');
    const [remarks, setRemarks] = useState('');
    const [lines, setLines] = useState([blankLine()]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [i, r] = await Promise.all([
                new ListItemsQuery().execute(),
                new PosRepacksQuery().execute(),
            ]);
            setItems(i || []);
            setRows(r || []);
            setError('');
        } catch (e) {
            setError(e?.message || 'Could not load repacks.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const byCode = useMemo(() => {
        const m = new Map();
        for (const i of items) m.set(i.code, i);
        return m;
    }, [items]);

    const bulk = fromItemCode ? byCode.get(fromItemCode) : null;
    const bulkUnit = bulk?.unit || '';

    /* What the packets and the spillage add up to, in the bag's own unit. This
       is the figure the bag will actually go down by when nothing is typed into
       "Taken from bag". */
    const accounted = useMemo(() => {
        const packed = lines.reduce(
            (sum, l) => sum + (Number(l.qty) || 0) * (Number(l.bulkPerUnit) || 0),
            0,
        );
        return packed + Math.abs(Number(wastageQty) || 0);
    }, [lines, wastageQty]);

    const typedFrom = Number(fromQty) || 0;
    const mismatch = typedFrom > 0 && Math.abs(typedFrom - accounted) > 1e-6
        ? Math.round((typedFrom - accounted) * 1000) / 1000
        : 0;

    const setLine = (idx, key, value) =>
        setLines(ls => ls.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));

    const reset = () => {
        setFromItemCode('');
        setFromQty('');
        setWastageQty('');
        setRemarks('');
        setLines([blankLine()]);
    };

    const save = async () => {
        setError('');
        setNotice('');

        if (!fromItemCode) { setError('Choose the bag or bulk item being broken up.'); return; }
        const filled = lines.filter(l => l.itemCode && Number(l.qty) > 0);
        if (filled.length === 0) { setError('Add at least one packet line.'); return; }
        const missingRate = filled.find(l => !(Number(l.bulkPerUnit) > 0));
        if (missingRate) {
            setError(
                `Enter how much ${bulkUnit || 'bulk'} goes into one ` +
                `"${byCode.get(missingRate.itemCode)?.itemName || missingRate.itemCode}".`,
            );
            return;
        }

        setSaving(true);
        try {
            const saved = await new CreatePosRepackCommand().execute({
                repackDate,
                fromItemCode,
                // 0 tells the server to derive it from the lines plus wastage,
                // which is what the operator means when they leave it blank.
                fromQty: typedFrom > 0 ? typedFrom : 0,
                fromUnit: bulkUnit,
                wastageQty: Math.abs(Number(wastageQty) || 0),
                remarks,
                lines: filled.map(l => ({
                    itemCode: l.itemCode,
                    qty: Number(l.qty),
                    bulkPerUnit: Number(l.bulkPerUnit),
                })),
            });
            setNotice(`Repack ${saved.repackNo} saved. ${qty(saved.fromBaseQty)} ${bulkUnit} taken from ${saved.fromItemName}.`);
            reset();
            await load();
        } catch (e) {
            setError(e?.message || 'Could not save the repack.');
        } finally {
            setSaving(false);
        }
    };

    const cancel = async (row) => {
        const ok = await confirm({
            title: `Cancel repack ${row.repackNo}?`,
            message:
                `The packets go back into ${row.fromItemName}. ` +
                'If any of them have already been sold there is not enough packet stock to reverse, ' +
                'and the cancel will be refused — correct that with a stock adjustment instead.',
            confirmLabel: 'Cancel repack',
            tone: 'danger',
        });
        if (!ok) return;
        setError('');
        setNotice('');
        try {
            await new CancelPosRepackCommand().execute(row.id, 'Cancelled by operator');
            setNotice(`Repack ${row.repackNo} cancelled.`);
            await load();
        } catch (e) {
            setError(e?.message || 'Could not cancel the repack.');
        }
    };

    const columns = [
        { key: 'repackNo', header: 'Repack No', width: 150 },
        { key: 'repackDate', header: 'Date', width: 110 },
        { key: 'from', header: 'Broken up', render: r => `${r.fromItemName} — ${qty(r.fromBaseQty)} ${r.fromUnit}` },
        {
            key: 'made', header: 'Packets made',
            render: r => (r.lines || []).map(l => `${qty(l.qty)} × ${l.itemName}`).join(', ') || '—',
        },
        {
            key: 'wastage', header: 'Wastage', align: 'right', width: 100,
            render: r => (Number(r.wastageBaseQty) > 0
                ? <Badge tone="warn">{qty(r.wastageBaseQty)}</Badge>
                : '—'),
        },
        {
            key: 'act', header: '', width: 110, align: 'center',
            render: r => (
                <Button size="sm" variant="ghost" icon={RotateCcw}
                    onClick={e => { e.stopPropagation(); cancel(r); }}>
                    Cancel
                </Button>
            ),
        },
    ];

    return (
        <Page>
            <PageHeader
                icon={Package}
                title="Repacking"
                subtitle="Break a bag into packets. Both stocks move together."
            />
            <PageBody className="flex flex-col gap-3">
                {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}
                {notice && <Banner tone="ok" onClose={() => setNotice('')}>{notice}</Banner>}

                <Card ref={flow.ref} className="shrink-0" title="New repack">
                    <FormGrid cols={4}>
                        <Field label="Broken up from" required span={2}>
                            <Select value={fromItemCode} onChange={e => setFromItemCode(e.target.value)}>
                                <option value="">— choose the bag or bulk item —</option>
                                {items.map(i => (
                                    <option key={i.code} value={i.code}>
                                        {i.itemName} ({i.code}) — {qty(i.currentStock)} {i.unit}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        <Field label="Date">
                            <Input type="date" value={repackDate} onChange={e => setRepackDate(e.target.value)} />
                        </Field>
                        <Field
                            label={`Taken from bag${bulkUnit ? ` (${bulkUnit})` : ''}`}
                            hint="Leave blank to take exactly what the packets and wastage come to."
                        >
                            <Input numeric inputMode="decimal" value={fromQty}
                                placeholder={accounted > 0 ? qty(accounted) : ''}
                                onChange={e => setFromQty(e.target.value)} />
                        </Field>
                    </FormGrid>

                    <div className="mt-3">
                        <DataTable
                            columns={[
                                {
                                    key: 'item', header: 'Packet item', render: (l, i) => (
                                        <Select value={l.itemCode} onChange={e => setLine(i, 'itemCode', e.target.value)}>
                                            <option value="">— choose —</option>
                                            {items
                                                .filter(it => it.code !== fromItemCode)
                                                .map(it => (
                                                    <option key={it.code} value={it.code}>
                                                        {it.itemName} ({it.code})
                                                    </option>
                                                ))}
                                        </Select>
                                    ),
                                },
                                {
                                    key: 'qty', header: 'Packets made', width: 150, align: 'right',
                                    render: (l, i) => (
                                        <Input numeric inputMode="decimal" value={l.qty}
                                            onChange={e => setLine(i, 'qty', e.target.value)} />
                                    ),
                                },
                                {
                                    key: 'per', header: `${bulkUnit || 'Bulk'} per packet`, width: 170, align: 'right',
                                    render: (l, i) => (
                                        <Input numeric inputMode="decimal" value={l.bulkPerUnit}
                                            placeholder="1 KG packet = 1"
                                            onChange={e => setLine(i, 'bulkPerUnit', e.target.value)} />
                                    ),
                                },
                                {
                                    key: 'uses', header: `Uses${bulkUnit ? ` (${bulkUnit})` : ''}`, width: 110, align: 'right',
                                    render: l => qty((Number(l.qty) || 0) * (Number(l.bulkPerUnit) || 0)),
                                },
                                {
                                    key: 'x', header: '', width: 50, align: 'center',
                                    render: (l, i) => (
                                        <Button size="sm" variant="ghost" icon={Trash2}
                                            disabled={lines.length === 1}
                                            onClick={() => setLines(ls => ls.filter((_, k) => k !== i))} />
                                    ),
                                },
                            ]}
                            rows={lines}
                            rowKey={(l, i) => i}
                            stickyHeader={false}
                        />
                    </div>

                    <FormGrid cols={4} className="mt-3">
                        <Field label={`Wastage${bulkUnit ? ` (${bulkUnit})` : ''}`}
                               hint="Spillage or dust. Leaves stock, makes no packet.">
                            <Input numeric inputMode="decimal" value={wastageQty}
                                onChange={e => setWastageQty(e.target.value)} />
                        </Field>
                        <Field label="Remarks" span={2}>
                            <Input value={remarks} onChange={e => setRemarks(e.target.value)} />
                        </Field>
                        <Field label="Bag goes down by">
                            <div className="pos-input flex items-center font-bold cursor-default">
                                {qty(typedFrom > 0 ? typedFrom : accounted)} {bulkUnit}
                            </div>
                        </Field>
                    </FormGrid>

                    {mismatch !== 0 && (
                        <Banner tone="warn">
                            {qty(typedFrom)} {bulkUnit} taken, but the packets and wastage come to {qty(accounted)}.
                            Record the difference of {qty(Math.abs(mismatch))} {bulkUnit} as wastage, or correct the quantity.
                        </Banner>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                        <Button icon={Plus} onClick={() => setLines(ls => [...ls, blankLine()])}>
                            Add packet line
                        </Button>
                        <div className="flex-1" />
                        <Button onClick={reset}>Clear</Button>
                        <Button variant="primary" icon={Save} loading={saving} onClick={save}>
                            Save repack
                        </Button>
                    </div>
                </Card>

                <Card title="Recent repacks" flush className="flex-1 min-h-0">
                    <DataTable
                        columns={columns}
                        rows={rows}
                        loading={loading}
                        empty={<EmptyState icon={Package} title="No repacks yet"
                            hint="Break a bag into packets above and it will appear here." />}
                    />
                </Card>
            </PageBody>
        </Page>
    );
}
