"use client";
/**
 * Charges — the shop's own, named by the shop.
 *
 * There is no "service charge" screen in this system, because there is no
 * service charge. A restaurant creates one and calls it that; a trader creates
 * Transport, Packing and Loading; a supermarket creates Delivery; a pharmacy
 * creates none and never sees any of this. Whatever they type is what the till
 * shows and what the bill prints.
 *
 * ── Why the order can be dragged ──
 *
 * It is not decoration. The list order is also the calculation order, and a
 * percentage taken before another charge is added is a different number from
 * one taken after. Dragging is the only way to express that which does not
 * require explaining "sequence numbers" to a shopkeeper.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Receipt, Plus, Save, Trash2, GripVertical } from 'lucide-react';
import {
    Page, PageHeader, PageBody, Card, FormGrid, Field, Input, Select, Button,
    Banner, EmptyState, Badge, useConfirm, money, HeaderStat, Spinner, useFormFlow,
} from '../../components/pos';
import {
    PosChargesQuery, SavePosChargeCommand, RemovePosChargeCommand,
    ReorderPosChargesCommand,
} from '../../core/queries/pos.query';

const GST_SLABS = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 12, 18, 28];

const blank = () => ({
    id: null,
    code: '',
    name: '',
    calcType: 'FIXED',
    value: '',
    basis: 'NET_ITEMS',
    taxable: false,
    gstPercent: '18',
    mode: 'AUTO',
    editable: false,
    showOnSale: true,
    showOnPurchase: false,
    remarks: '',
});

/** A code the operator never has to think about, derived from what they typed. */
const codeFrom = (name) =>
    String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 20);

export default function ChargesModule() {
    const confirm = useConfirm();

    // Enter walks the form and saves at the end. Field order is the order on
    // screen, so adding a field to the card adds it to the flow.
    const flow = useFormFlow(() => save());

    const [rows, setRows] = useState([]);
    const [form, setForm] = useState(blank());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const dragFrom = useRef(-1);
    const [dragOver, setDragOver] = useState(-1);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setRows(await new PosChargesQuery().execute());
            setError('');
        } catch (e) {
            setError(e?.message || 'Could not load the charges.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const reset = () => setForm(blank());

    const edit = (r) => setForm({
        id: r.id,
        code: r.code,
        name: r.name,
        calcType: r.calcType,
        value: String(r.value ?? ''),
        basis: r.basis,
        taxable: !!r.taxable,
        gstPercent: String(r.gstPercent ?? 18),
        mode: r.mode,
        editable: !!r.editable,
        showOnSale: !!r.showOnSale,
        showOnPurchase: !!r.showOnPurchase,
        remarks: r.remarks || '',
    });

    const save = async () => {
        setError('');
        setNotice('');
        const name = form.name.trim();
        if (!name) { setError('Give the charge a name — it is what the bill will print.'); return; }
        const code = (form.code.trim() || codeFrom(name));
        if (!code) { setError('The name needs at least one letter or number.'); return; }

        setSaving(true);
        try {
            const saved = await new SavePosChargeCommand().execute({
                ...(form.id ? { id: String(form.id) } : {}),
                code,
                name,
                calcType: form.calcType,
                value: Number(form.value) || 0,
                basis: form.basis,
                taxable: !!form.taxable,
                gstPercent: form.taxable ? Number(form.gstPercent) || 0 : 0,
                mode: form.mode,
                editable: !!form.editable,
                showOnSale: !!form.showOnSale,
                showOnPurchase: !!form.showOnPurchase,
                remarks: form.remarks,
            });
            setNotice(`"${saved.name}" saved. It now appears on the bill and in the print designer.`);
            reset();
            await load();
        } catch (e) {
            setError(e?.message || 'Could not save the charge.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (r) => {
        const ok = await confirm({
            title: `Remove "${r.name}"?`,
            message:
                'It stops being offered on new bills. Bills that already carry it are untouched, '
                + 'and a reprint still shows the name it had.',
            confirmLabel: 'Remove charge',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await new RemovePosChargeCommand().execute(r.id);
            setNotice(`"${r.name}" removed.`);
            await load();
        } catch (e) {
            setError(e?.message || 'Could not remove the charge.');
        }
    };

    /* ── dragging ─────────────────────────────────────────── */

    const onDrop = async (to) => {
        const from = dragFrom.current;
        dragFrom.current = -1;
        setDragOver(-1);
        if (from < 0 || to < 0 || from === to) return;

        // Move locally first so the row lands where the finger let go, then
        // tell the server. A list that snaps back while the save is in flight
        // reads as "it did not work".
        const next = [...rows];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setRows(next);
        try {
            setRows(await new ReorderPosChargesCommand().execute(next.map(r => r.id)));
            setNotice('Order saved. Charges are calculated in this order too.');
        } catch (e) {
            setError(e?.message || 'Could not save the new order.');
            await load();
        }
    };

    const describe = (r) => {
        const amount = r.calcType === 'PERCENT'
            ? `${r.value}% of ${r.basis === 'ITEMS' ? 'items' : 'items after discount'}`
            : money(r.value);
        const tax = r.taxable ? ` + ${r.gstPercent}% GST` : '';
        return `${amount}${tax}`;
    };

    return (
        <Page>
            <PageHeader
                icon={Receipt}
                title="Charges"
                subtitle="Delivery, packing, service, freight — whatever this shop adds to a bill."
                meta={
                    <>
                        <HeaderStat label="Charges" value={String(rows.length)} />
                        <HeaderStat label="On the sale page"
                            value={String(rows.filter(r => r.showOnSale).length)} />
                    </>
                }
            />
            <PageBody className="flex flex-col gap-3">
                {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}
                {notice && <Banner tone="ok" onClose={() => setNotice('')}>{notice}</Banner>}

                <Card ref={flow.ref} className="shrink-0" title={form.id ? 'Edit charge' : 'New charge'}>
                    <FormGrid cols={4}>
                        <Field label="Name" required span={2}
                               hint="Exactly what the till and the printed bill will show.">
                            <Input value={form.name} placeholder="Delivery Charge"
                                onChange={e => set('name', e.target.value)} />
                        </Field>
                        <Field label="How it is worked out">
                            <Select value={form.calcType} onChange={e => set('calcType', e.target.value)}>
                                <option value="FIXED">Fixed amount</option>
                                <option value="PERCENT">Percentage</option>
                            </Select>
                        </Field>
                        <Field label={form.calcType === 'PERCENT' ? 'Percent' : 'Amount (₹)'}>
                            <Input numeric inputMode="decimal" value={form.value}
                                onChange={e => set('value', e.target.value)} />
                        </Field>

                        {form.calcType === 'PERCENT' && (
                            <Field label="Percentage of" span={2}
                                   hint="After discount is the fair default — a customer should not be charged a percentage of money they were not asked for.">
                                <Select value={form.basis} onChange={e => set('basis', e.target.value)}>
                                    <option value="NET_ITEMS">Items after discount</option>
                                    <option value="ITEMS">Items before discount</option>
                                </Select>
                            </Field>
                        )}

                        <Field label="Who sets the amount"
                               hint="Automatic works it out; typed leaves it to the operator.">
                            <Select value={form.mode} onChange={e => set('mode', e.target.value)}>
                                <option value="AUTO">Automatic</option>
                                <option value="MANUAL">Typed on each bill</option>
                            </Select>
                        </Field>
                        {form.mode === 'AUTO' && (
                            <Field label="Operator may change it">
                                <label className="flex items-center gap-2 h-[32px] text-[12.5px] cursor-pointer">
                                    <input type="checkbox" checked={form.editable}
                                        onChange={e => set('editable', e.target.checked)}
                                        className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                    Allow typing over the calculated amount
                                </label>
                            </Field>
                        )}

                        <Field label="GST on the charge">
                            <label className="flex items-center gap-2 h-[32px] text-[12.5px] cursor-pointer">
                                <input type="checkbox" checked={form.taxable}
                                    onChange={e => set('taxable', e.target.checked)}
                                    className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                This charge is taxable
                            </label>
                        </Field>
                        {form.taxable && (
                            <Field label="GST rate">
                                <Select value={form.gstPercent} onChange={e => set('gstPercent', e.target.value)}>
                                    {GST_SLABS.map(s => <option key={s} value={s}>{s}%</option>)}
                                </Select>
                            </Field>
                        )}

                        <Field label="Where it appears" span={2}>
                            <div className="flex items-center gap-4 h-[32px] text-[12.5px]">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={form.showOnSale}
                                        onChange={e => set('showOnSale', e.target.checked)}
                                        className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                    Sale bill
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={form.showOnPurchase}
                                        onChange={e => set('showOnPurchase', e.target.checked)}
                                        className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                    Purchase
                                </label>
                            </div>
                        </Field>
                        <Field label="Remarks" span={2}>
                            <Input value={form.remarks} onChange={e => set('remarks', e.target.value)} />
                        </Field>
                    </FormGrid>

                    <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1" />
                        {form.id && <Button onClick={reset}>Cancel</Button>}
                        <Button variant="primary" icon={form.id ? Save : Plus} loading={saving} onClick={save}>
                            {form.id ? 'Save charge' : 'Add charge'}
                        </Button>
                    </div>
                </Card>

                <Card flush className="flex-1 min-h-0 overflow-auto pos-scroll"
                      title="Order on the bill"
                      subtitle="Drag to reorder. This is also the order they are calculated in.">
                    {loading ? <Spinner /> : rows.length === 0 ? (
                        <EmptyState icon={Receipt} title="No charges yet"
                            hint="A shop with no charges bills only for the goods, which is exactly right for most." />
                    ) : (
                        <div className="divide-y divide-[var(--pos-line)]">
                            {rows.map((r, i) => (
                                <div key={r.id}
                                    draggable
                                    onDragStart={() => { dragFrom.current = i; }}
                                    onDragOver={e => { e.preventDefault(); setDragOver(i); }}
                                    onDragLeave={() => setDragOver(o => (o === i ? -1 : o))}
                                    onDrop={e => { e.preventDefault(); onDrop(i); }}
                                    onDragEnd={() => { dragFrom.current = -1; setDragOver(-1); }}
                                    className={`flex items-center gap-3 px-3 py-2 cursor-move ${
                                        dragOver === i ? 'bg-[var(--pos-select)]' : ''
                                    }`}>
                                    <GripVertical size={15} className="text-[var(--pos-ink-3)] shrink-0" />
                                    <span className="w-6 text-center text-[11px] font-bold text-[var(--pos-ink-3)]">
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-[13px] text-[var(--pos-ink)] truncate">
                                                {r.name}
                                            </span>
                                            {r.mode === 'MANUAL'
                                                ? <Badge tone="neutral">typed</Badge>
                                                : r.editable
                                                    ? <Badge tone="info">auto, changeable</Badge>
                                                    : <Badge tone="ok">auto</Badge>}
                                            {!r.showOnSale && <Badge tone="warn">not on sales</Badge>}
                                            {r.showOnPurchase && <Badge tone="neutral">purchase</Badge>}
                                        </div>
                                        <div className="text-[11px] text-[var(--pos-ink-3)] mt-0.5">
                                            {describe(r)} · prints as <span className="font-semibold">{r.name}</span>
                                        </div>
                                    </div>
                                    <Button size="sm" variant="ghost"
                                        onClick={e => { e.stopPropagation(); edit(r); }}>Edit</Button>
                                    <Button size="sm" variant="ghost" icon={Trash2}
                                        onClick={e => { e.stopPropagation(); remove(r); }} />
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </PageBody>
        </Page>
    );
}
