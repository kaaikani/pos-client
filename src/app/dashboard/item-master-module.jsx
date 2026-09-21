"use client";
/**
 * Item — list-first record module, laid out the way Zoho Books does it.
 *
 * LIST   all items, checkbox column, name as a link, "+ New" top-right.
 * FORM   opens as a full-page overlay with an X, labels in a LEFT column,
 *        Sales / Purchase information as two switchable blocks side by side,
 *        and Save / Cancel pinned to the bottom.
 *
 * Access is permission-driven (see components/pos/permissions.js): a user without
 * CreateCatalog never sees "+ New", and one without DeleteCatalog never sees Delete.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Package, Plus, Trash2, RefreshCw, Search, AlertTriangle, MoreVertical } from 'lucide-react';
import {
    ListItemsQuery, CreateItemCommand, UpdateItemCommand,
    DeleteItemEverywhereCommand, ListTaxRatesQuery, PosItemUsageQuery,
    PosUnitsQuery, ItemForTransactionQuery,
    PosItemPriceTiersQuery, CreatePosItemPriceTierCommand, CancelPosItemPriceTierCommand,
} from '../../core/queries/pos.query';
import {
    Page, PageHeader, PageBody, ListToolbar, Button, DataTable, Banner,
    EmptyState, useConfirm, money, Input, Textarea, useModule, useFormFlow,
} from '../../components/pos';
// Imported from their own files rather than re-exported through index.jsx.
// A barrel that re-exports sibling modules makes Turbopack rebuild the whole
// barrel on every HMR edit, which intermittently leaves a module factory
// unavailable at runtime. Import leaf modules directly.
import {
    FormOverlay, FormRow, FormColumns, ToggleSection, RadioRow, MoneyInput,
    SearchSelect, FormDivider, FormBlockTitle,
} from '../../components/pos/form';
import { readSession, canDo } from '../../components/pos/permissions';

const DEFAULT_TAXES = [
    { id: 'exempt', name: 'Exempted', value: 0 },
    { id: 'gst5', name: 'GST 5%', value: 5 },
    { id: 'gst12', name: 'GST 12%', value: 12 },
    { id: 'gst18', name: 'GST 18%', value: 18 },
    { id: 'gst28', name: 'GST 28%', value: 28 },
];

/*
 * The unit list used to be hardcoded here as 'GRAMS', 'KILOGRAMS', 'DOZEN',
 * 'TABLETS'… none of which are codes in the unit master. An item saved with
 * unit "KILOGRAMS" has a base unit the server cannot resolve, so every
 * conversion for it silently does nothing. The list now comes from the master.
 */

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
/** On-hand stock. `minStock` is the reorder level — never use it as stock. */
const onHand = (it) => num(it?.currentStock ?? it?.minStkQty);

const blankItem = (nextCode) => ({
    type: 'GOODS',
    code: String(nextCode), itemName: '', tamilName: '', category: '', groupName: 'General',
    brand: '', hsnCode: '', barcode: '', upcCode: '', unit: 'PCS', packingUnit: '', size: '',
    taxName: 'GST 5%', gstPercent: 5, mfr: '',
    purchaseRate: '', salesRate: '', mrpRate: '', discount: '',
    salesDesc: '', purchaseDesc: '',
    minStock: '', maxStock: '',
    batchNo: '', mfgDate: '', expiryDate: '',
    isStockBased: true, isWeightBased: false, allowExpiry: false, isExpiryEnabled: true,
    sizes: [],
});

export default function ItemMasterModule() {
    const confirm = useConfirm();

    // A restaurant has no price lists and a trader has no batch numbers. The
    // server refuses these anyway; hiding them keeps the form to what this
    // business actually fills in.
    const priceListsOn = useModule('priceTiers');
    const barcodeOn = useModule('barcode');
    const batchOn = useModule('batchTracking');
    const session = useMemo(() => readSession(), []);
    const perms = session?.permissions;
    const mayCreate = canDo(perms, 'item.create');
    const mayUpdate = canDo(perms, 'item.update');
    const mayDelete = canDo(perms, 'item.delete');

    const [items, setItems] = useState([]);
    const [taxList, setTaxList] = useState(DEFAULT_TAXES);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [banner, setBanner] = useState(null);

    const [formOpen, setFormOpen] = useState(false);
    const [form, setForm] = useState({});
    const [editingId, setEditingId] = useState(null);
    const [checked, setChecked] = useState(() => new Set());
    const [search, setSearch] = useState('');
    const [stockFilter, setStockFilter] = useState('all');

    // form block switches, like Zoho's Sales / Purchase Information
    const [salesOn, setSalesOn] = useState(true);
    const [purchaseOn, setPurchaseOn] = useState(true);

    const set = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);

    // Enter moves down the form. The Name field keeps the landing focus it
    // already has, and a field that handles Enter itself (the unit pickers)
    // is left alone.
    const flow = useFormFlow(undefined, { autoFocus: false });

    /* ── data ───────────────────────────────────────────── */

    const [units, setUnits] = useState([]);

    /**
     * Units this item may transact in, beyond its base.
     *
     * Held as { unitCode, conversionRate } — "how many BASE units in one of
     * this". The base itself is never in this list; it is added at save time
     * from the item's Base Unit so exactly one row is ever marked as base.
     */
    const [extraUnits, setExtraUnits] = useState([]);

    /**
     * The price rows for this item: one per (price list x unit), plus optional
     * quantity breaks.
     *
     * Saved separately from the item itself. The item form writes the item and
     * its units in one call; prices are their own records with their own
     * server-side validation, and mixing them into the item payload would hide
     * which of the two failed.
     */
    const [tiers, setTiers] = useState([]);
    const [tierDraft, setTierDraft] = useState(null);
    const [tierBusy, setTierBusy] = useState(false);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [list, unitList] = await Promise.all([
                new ListItemsQuery().execute(),
                new PosUnitsQuery().execute().catch(() => []),
            ]);
            setItems(list);
            setUnits(unitList);
        } catch (e) {
            setBanner({ tone: 'danger', text: `Could not load items: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }, []);

    /**
     * Units offered as an item's base, labelled with what they measure so the
     * choice is obvious: picking KG rather than PCS is what lets the same item
     * later be sold in grams.
     */
    const unitOptions = useMemo(
        () => units.map(u => ({
            value: u.code,
            label: `${u.code} — ${u.name}${u.kind && u.kind !== 'PACK' ? ' (' + u.kind.toLowerCase() + ')' : ''}`,
        })),
        [units],
    );

    useEffect(() => {
        loadAll();
        new ListTaxRatesQuery().execute()
            .then(rates => setTaxList(prev => {
                const merged = [...prev];
                (rates || []).forEach(t => {
                    if (!merged.some(m => m.name.toLowerCase() === (t.name || '').toLowerCase())) {
                        merged.push({ id: t.id, name: t.name, value: t.value });
                    }
                });
                return merged;
            }))
            .catch(() => {});
    }, [loadAll]);

    /* ── list ───────────────────────────────────────────── */

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter(it => {
            if (stockFilter === 'out' && onHand(it) > 0) return false;
            if (stockFilter === 'low' && !(num(it.minStock) > 0 && onHand(it) <= num(it.minStock))) return false;
            if (!q) return true;
            return [it.itemName, it.code, it.barcode, it.brand, it.category]
                .some(f => String(f || '').toLowerCase().includes(q));
        });
    }, [items, search, stockFilter]);

    const lowCount = useMemo(
        () => items.filter(it => num(it.minStock) > 0 && onHand(it) <= num(it.minStock)).length, [items]);

    const allChecked = filtered.length > 0 && filtered.every(it => checked.has(it.id));
    const toggleAll = () => setChecked(allChecked ? new Set() : new Set(filtered.map(it => it.id)));
    const toggleOne = (id) => setChecked(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });

    const openEdit = useCallback((it) => {
        setForm({
            ...blankItem(it.code), ...it,
            type: it.isStockBased ? 'GOODS' : 'SERVICE',
            // An item batch-tracked by an earlier version, or by an import, may
            // not have the older flag set. Either one means the box is ticked.
            allowExpiry: !!(it.allowExpiry || it.isBatchTracked),
        });
        setExtraUnits([]);
        setTierDraft(null);
        new PosItemPriceTiersQuery().execute(it.id)
            .then(rows => setTiers((rows || []).filter(t => t.status === 'ACTIVE')))
            .catch(() => setTiers([]));
        // The item's non-base units come from the server; the row shown in the
        // list does not carry them.
        new ItemForTransactionQuery().execute({ code: it.code })
            .then(found => setExtraUnits(
                (found?.allowedUnits || [])
                    .filter(a => !a.isBase)
                    .map(a => ({ unitCode: a.unitCode, conversionRate: a.conversionRate })),
            ))
            .catch(() => { /* an item with no units configured simply has none */ });
        setEditingId(it.id);
        setSalesOn(true);
        setPurchaseOn(num(it.purchaseRate) > 0);
        setBanner(null);
        setFormOpen(true);
    }, []);

    const columns = useMemo(() => [
        {
            key: '_chk', width: 38, align: 'center',
            header: (
                <input type="checkbox" checked={allChecked} onChange={toggleAll}
                    aria-label="Select all"
                    className="pos-focusable accent-[var(--pos-ink-2)] w-[14px] h-[14px] align-middle" />
            ),
            render: (it) => (
                <input type="checkbox" checked={checked.has(it.id)}
                    onClick={e => e.stopPropagation()}
                    onChange={() => toggleOne(it.id)}
                    aria-label={`Select ${it.itemName}`}
                    className="pos-focusable accent-[var(--pos-ink-2)] w-[14px] h-[14px] align-middle" />
            ),
        },
        {
            key: 'itemName', header: 'Name',
            render: (it) => (
                <button type="button"
                    onClick={e => { e.stopPropagation(); openEdit(it); }}
                    className="pos-focusable text-left text-[var(--pos-ink)] hover:underline font-medium truncate max-w-full">
                    {it.itemName}
                </button>
            ),
        },
        { key: 'code', header: 'SKU', width: 110,
          render: (it) => <span className="text-[var(--pos-ink-2)]" style={{ fontFamily: 'var(--pos-mono)' }}>{it.code}</span> },
        { key: 'type', header: 'Type', width: 90,
          render: (it) => <span className="text-[var(--pos-ink-2)]">{it.isStockBased ? 'Goods' : 'Service'}</span> },
        { key: 'category', header: 'Category', width: 130,
          render: (it) => it.category && it.category !== 'Na'
            ? <span className="text-[var(--pos-ink-2)] truncate">{it.category}</span>
            : <span className="text-[var(--pos-ink-3)]">—</span> },
        { key: 'unit', header: 'Unit', width: 84,
          render: (it) => <span className="text-[var(--pos-ink-2)]">{it.unit && it.unit !== 'NA' ? it.unit : '—'}</span> },
        { key: 'stock', header: 'Stock', width: 90, align: 'right',
          render: (it) => {
            if (!it.isStockBased) return <span className="text-[var(--pos-ink-3)]">—</span>;
            const s = onHand(it), min = num(it.minStock);
            return <span className={s <= 0 ? 'text-[var(--pos-danger)] font-semibold'
                : (min > 0 && s <= min) ? 'text-[var(--pos-warn)] font-semibold' : ''}>{s}</span>;
          } },
        { key: 'purchaseRate', header: 'Purchase Rate', width: 120, align: 'right',
          render: (it) => <span className="text-[var(--pos-ink-2)]">{money(it.purchaseRate)}</span> },
        { key: 'salesRate', header: 'Rate', width: 110, align: 'right',
          render: (it) => <span className="font-semibold">{money(it.salesRate)}</span> },
    ], [allChecked, checked, openEdit]);

    /* ── form ───────────────────────────────────────────── */

    const openNew = useCallback(() => {
        const next = items.length ? Math.max(...items.map(i => parseInt(i.code, 10) || 0)) + 1 : 1;
        setForm(blankItem(next));
        setExtraUnits([]);
        setTiers([]);
        setTierDraft(null);
        setEditingId(null);
        setSalesOn(true);
        setPurchaseOn(true);
        setBanner(null);
        setFormOpen(true);
    }, [items]);

    const closeForm = useCallback(() => setFormOpen(false), []);

    /**
     * Adds one price row.
     *
     * The server decides whether the row is acceptable — a wholesale price with
     * neither a unit nor a minimum quantity is refused there, not here, so the
     * rule holds for the API as well as for this screen.
     */
    const addTier = useCallback(async () => {
        if (!editingId) {
            setBanner({ tone: 'warn', text: 'Save the item first, then add its prices.' });
            return;
        }
        const d = tierDraft;
        if (!d || !(num(d.rate) > 0)) {
            setBanner({ tone: 'warn', text: 'Enter a rate greater than zero.' });
            return;
        }
        setTierBusy(true);
        try {
            const created = await new CreatePosItemPriceTierCommand().execute({
                itemId: Number(editingId),
                tierType: d.tierType || 'SALE',
                unitCode: d.unitCode || '',
                rate: num(d.rate),
                minQty: num(d.minQty),
                label: '',
            });
            setTiers(prev => [...prev, created]);
            setTierDraft(null);
            setBanner(null);
        } catch (err) {
            setBanner({ tone: 'danger', text: err.message });
        } finally {
            setTierBusy(false);
        }
    }, [editingId, tierDraft]);

    const removeTier = useCallback(async (id) => {
        setTierBusy(true);
        try {
            await new CancelPosItemPriceTierCommand().execute(id);
            setTiers(prev => prev.filter(t => String(t.id) !== String(id)));
        } catch (err) {
            setBanner({ tone: 'danger', text: err.message });
        } finally {
            setTierBusy(false);
        }
    }, []);

    /** Units this item can be priced in: its base plus whatever was added. */
    const priceUnitOptions = useMemo(() => {
        const codes = [form.unit, ...extraUnits.map(u => u.unitCode)].filter(Boolean);
        const seen = new Set();
        const out = [{ value: '', label: 'Any unit (scaled by conversion)' }];
        for (const c of codes) {
            if (seen.has(c)) continue;
            seen.add(c);
            out.push({ value: c, label: c === form.unit ? c + ' (base)' : c });
        }
        return out;
    }, [form.unit, extraUnits]);

    const handleSave = useCallback(async () => {
        const miss = [];
        if (!String(form.itemName || '').trim()) miss.push('Name');
        if (!String(form.code || '').trim()) miss.push('SKU');
        if (salesOn && !(num(form.salesRate) > 0)) miss.push('Selling Price');
        if (purchaseOn && !(num(form.purchaseRate) > 0)) miss.push('Cost Price');
        if (miss.length) {
            setBanner({ tone: 'warn', text: `Fill these before saving: ${miss.join(', ')}.` });
            return;
        }

        const input = {
            code: String(form.code).trim(),
            itemName: String(form.itemName).trim(),
            tamilName: String(form.tamilName || ''),
            category: String(form.category || 'Na'),
            groupName: String(form.groupName || 'General'),
            brand: String(form.brand || ''),
            hsnCode: String(form.hsnCode || ''),
            barcode: String(form.barcode || ''),
            upcCode: String(form.upcCode || ''),
            unit: String(form.unit || 'NA'),
            // The server upserts the whole set in one call, so the base unit is
            // sent alongside the extras. Rates for weight, volume and length are
            // checked against the unit master and a contradicting one is refused.
            ...(form.unit
                ? {
                      allowedUnits: [
                          { unitCode: String(form.unit), conversionRate: 1, isBase: true },
                          ...extraUnits
                              .filter(u => u.unitCode && u.unitCode !== form.unit && num(u.conversionRate) > 0)
                              .map(u => ({
                                  unitCode: String(u.unitCode),
                                  conversionRate: num(u.conversionRate),
                                  isBase: false,
                              })),
                      ],
                  }
                : {}),
            packingUnit: String(form.packingUnit || ''),
            size: String(form.size || ''),
            taxName: String(form.taxName || 'GST 5%'),
            mfr: String(form.mfr || ''),
            purchaseRate: purchaseOn ? num(form.purchaseRate) : 0,
            salesRate: salesOn ? num(form.salesRate) : 0,
            mrpRate: num(form.mrpRate) || num(form.salesRate),
            gstPercent: num(form.gstPercent) || 5,
            discount: num(form.discount),
            batchNo: String(form.batchNo || ''),
            mfgDate: String(form.mfgDate || ''),
            expiryDate: String(form.expiryDate || ''),
            minStock: num(form.minStock),
            maxStock: num(form.maxStock),
            allowExpiry: !!form.allowExpiry,
            // The same switch. The label has always promised batch tracking;
            // until the batch table existed it only revealed three fields on
            // the item. Sent unconditionally rather than gated on the module,
            // so that turning batch tracking on later needs no re-editing of
            // every item — the server requires both before it takes effect.
            isBatchTracked: !!form.allowExpiry,
            isExpiryEnabled: form.isExpiryEnabled !== false,
            isWeightBased: !!form.isWeightBased,
            // Type radio drives stock tracking: goods are stocked, services are not.
            isStockBased: form.type !== 'SERVICE',
            sizes: [],
        };

        setSaving(true);
        try {
            // The SERVER mirrors the item into the Vendure catalog in the same
            // transaction (upsert by SKU). The client must never do that itself.
            if (editingId) await new UpdateItemCommand().execute(editingId, input);
            else await new CreateItemCommand().execute(input);
            await loadAll();
            setFormOpen(false);
            setBanner({ tone: 'ok', text: `"${input.itemName}" ${editingId ? 'updated' : 'created'}.` });
        } catch (err) {
            setBanner({ tone: 'danger', text: err.message });
        } finally {
            setSaving(false);
        }
    }, [form, salesOn, purchaseOn, editingId, loadAll]);

    const handleDelete = useCallback(async () => {
        const targets = items.filter(i => checked.has(i.id));
        if (!targets.length) { setBanner({ tone: 'warn', text: 'Tick the items you want to delete.' }); return; }
        // Ask the server what each item is actually used on before offering to
        // retire it. An item on 47 bills is not the same decision as one that
        // was created by mistake this morning, and the operator cannot tell them
        // apart from a list screen.
        let usedLines = [];
        try {
            const usages = await Promise.all(
                targets.map(t => new PosItemUsageQuery().execute(t.id).catch(() => null)),
            );
            usedLines = targets
                .map((t, i) => ({ t, u: usages[i] }))
                .filter(x => x.u && x.u.total > 0)
                .map(x => {
                    const parts = [
                        x.u.sales ? `${x.u.sales} sale(s)` : '',
                        x.u.purchases ? `${x.u.purchases} purchase(s)` : '',
                        x.u.returns ? `${x.u.returns} return(s)` : '',
                        x.u.adjustments ? `${x.u.adjustments} adjustment(s)` : '',
                    ].filter(Boolean).join(', ');
                    return `• ${x.t.itemName} — used on ${parts}`;
                });
        } catch { /* usage is advisory; the server still refuses on its own */ }

        const usedNote = usedLines.length
            ? '\n\nSTILL IN USE:\n' + usedLines.join('\n')
                + '\n\nThose documents keep working and nothing is deleted — the item is marked cancelled and old bills still print.'
            : '';

        const ok = await confirm({
            title: targets.length > 1 ? `Delete ${targets.length} items?` : 'Delete item?',
            message: `${targets.map(t => t.itemName).slice(0, 5).join('\n')}${targets.length > 5 ? `\n…and ${targets.length - 5} more` : ''}${usedNote}\n\nThis also removes the matching products from the Vendure catalog. It cannot be undone.`,
            confirmLabel: 'Delete', tone: 'danger',
        });
        if (!ok) return;
        try {
            // confirmUsed carries the operator's answer to the notice above.
            for (const t of targets) {
                await new DeleteItemEverywhereCommand().execute({ ...t, confirmUsed: true });
            }
            await loadAll();
            setChecked(new Set());
            setBanner({ tone: 'ok', text: `${targets.length} item${targets.length > 1 ? 's' : ''} deleted.` });
        } catch (err) {
            setBanner({ tone: 'danger', text: err.message });
        }
    }, [items, checked, confirm, loadAll]);

    const taxOptions = useMemo(() => taxList.map(t => ({ value: t.name, label: t.name })), [taxList]);
    const disabled = editingId ? !mayUpdate : !mayCreate;

    /* ── render ─────────────────────────────────────────── */

    return (
        <Page className="relative">
            {/* Deliberately quiet: no KPI band. A master list is for finding a
                record, and stat tiles here only add noise. Stock health is shown
                where it matters — in the Stock column and the strip below. */}
            <PageHeader
                title="All Items"
                actions={<>
                    <Button variant="ghost" icon={RefreshCw} onClick={loadAll} disabled={loading} title="Refresh" />
                    {mayCreate && <Button variant="primary" icon={Plus} onClick={openNew}>New</Button>}
                </>}
            />

            {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

            <ListToolbar
                autoFocus
                search={search}
                onSearch={setSearch}
                placeholder="Search by name, SKU, barcode or brand…"
                count={filtered.length}
                countLabel={filtered.length === 1 ? 'item' : 'items'}
                filters={
                    <SearchSelect
                        value={stockFilter}
                        onChange={setStockFilter}
                        options={[
                            { value: 'all', label: 'All items' },
                            { value: 'low', label: 'Low stock' },
                            { value: 'out', label: 'Out of stock' },
                        ]}
                    />
                }
                actions={
                    checked.size > 0
                        ? <>
                            <span className="text-[12px] font-medium text-[var(--pos-ink-2)]">{checked.size} selected</span>
                            {mayDelete && <Button variant="danger" size="sm" icon={Trash2} onClick={handleDelete}>Delete</Button>}
                            <Button variant="ghost" size="sm" onClick={() => setChecked(new Set())}>Clear</Button>
                          </>
                        : <span className="text-[11.5px] text-[var(--pos-ink-3)]">Click a name to open it</span>
                }
            />

            <PageBody padded={false}>
                <DataTable
                    className="!border-0 !rounded-none h-full"
                    columns={columns}
                    rows={filtered}
                    loading={loading}
                    onActivate={openEdit}
                    empty={
                        search || stockFilter !== 'all'
                            ? <EmptyState icon={Search} title="No items match"
                                action={<Button variant="default" onClick={() => { setSearch(''); setStockFilter('all'); }}>Clear filters</Button>} />
                            : <EmptyState icon={Package} title="No items yet"
                                hint="Add your first product to start billing."
                                action={mayCreate && <Button variant="primary" icon={Plus} onClick={openNew}>New Item</Button>} />
                    }
                />
                {lowCount > 0 && (
                    <div className="px-5 py-2 border-t border-[var(--pos-line)] bg-[var(--pos-warn-soft)]">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--pos-warn)]">
                            <AlertTriangle size={13} /> {lowCount} item{lowCount > 1 ? 's' : ''} at or below the reorder level
                        </span>
                    </div>
                )}
            </PageBody>

            {/* ── FORM OVERLAY ── */}
            {formOpen && (
                <FormOverlay
                    ref={flow.ref}
                    title={editingId ? form.itemName || 'Edit Item' : 'New Item'}
                    onClose={closeForm}
                    footer={<>
                        <Button variant="primary" loading={saving} disabled={disabled} onClick={handleSave}>Save</Button>
                        <Button variant="default" onClick={closeForm}>Cancel</Button>
                        {disabled && (
                            <span className="ml-2 text-[11.5px] text-[var(--pos-ink-3)]">
                                Your role cannot {editingId ? 'edit' : 'create'} items.
                            </span>
                        )}
                    </>}
                >
                    <div className="max-w-[1080px]">
                        {banner && <div className="mb-3"><Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner></div>}

                        <FormRow label="Type">
                            <RadioRow name="type" value={form.type} onChange={v => set('type', v)}
                                options={[{ value: 'GOODS', label: 'Goods' }, { value: 'SERVICE', label: 'Service' }]} />
                        </FormRow>

                        <FormRow label="Name" required wide>
                            <Input value={form.itemName || ''} autoFocus autoComplete="off"
                                onChange={e => set('itemName', e.target.value)} />
                        </FormRow>

                        <FormRow label="SKU" required hint="Used on bills and barcodes">
                            <Input value={form.code || ''} onChange={e => set('code', e.target.value)} />
                        </FormRow>

                        <FormRow label="Base Unit" hint="Stock is held in this unit. Other units convert to it.">
                            <SearchSelect value={form.unit} onChange={v => set('unit', v)} options={unitOptions}
                                placeholder="Select or search" />
                        </FormRow>

                        {form.type !== 'SERVICE' && (
                            <FormRow label="Other Units"
                                hint={form.unit
                                    ? `How many ${form.unit} in one of each. A weight or volume rate is fixed by the unit master.`
                                    : 'Choose a base unit first.'}>
                                <div className="flex flex-col gap-1.5">
                                    {extraUnits.map((u, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5">
                                            <div className="w-40 shrink-0">
                                                <SearchSelect
                                                    value={u.unitCode}
                                                    onChange={v => setExtraUnits(prev =>
                                                        prev.map((x, i) => (i === idx ? { ...x, unitCode: v } : x)))}
                                                    options={unitOptions.filter(o => o.value !== form.unit)}
                                                    placeholder="Unit" />
                                            </div>
                                            <span className="text-[11px] text-[var(--pos-ink-3)] shrink-0">= </span>
                                            <Input type="number" step="any" min="0" className="!w-28"
                                                value={u.conversionRate ?? ''}
                                                onChange={e => setExtraUnits(prev =>
                                                    prev.map((x, i) => (i === idx ? { ...x, conversionRate: e.target.value } : x)))} />
                                            <span className="text-[11px] text-[var(--pos-ink-3)] shrink-0">{form.unit || 'base'}</span>
                                            <Button variant="ghost" size="sm"
                                                onClick={() => setExtraUnits(prev => prev.filter((_, i) => i !== idx))}>
                                                <Trash2 size={13} />
                                            </Button>
                                        </div>
                                    ))}
                                    <div>
                                        <Button variant="default" size="sm" disabled={!form.unit}
                                            onClick={() => setExtraUnits(prev => [...prev, { unitCode: '', conversionRate: '' }])}>
                                            <Plus size={13} /> Add unit
                                        </Button>
                                    </div>
                                </div>
                            </FormRow>
                        )}

                        {form.type !== 'SERVICE' && (
                            <FormRow label="HSN Code" hint="Required on GST invoices">
                                <Input value={form.hsnCode || ''} onChange={e => set('hsnCode', e.target.value)} />
                            </FormRow>
                        )}
                        {form.type === 'SERVICE' && (
                            <FormRow label="SAC">
                                <Input value={form.hsnCode || ''} onChange={e => set('hsnCode', e.target.value)} />
                            </FormRow>
                        )}

                        <FormRow label="Tax Preference" required>
                            <SearchSelect value={form.taxName} onChange={v => {
                                const t = taxList.find(x => x.name === v);
                                set('taxName', v);
                                if (t) set('gstPercent', t.value);
                            }} options={taxOptions} />
                        </FormRow>

                        <FormRow label="Category">
                            <Input value={form.category === 'Na' ? '' : form.category || ''}
                                onChange={e => set('category', e.target.value)} />
                        </FormRow>

                        <FormRow label="Brand">
                            <Input value={form.brand || ''} onChange={e => set('brand', e.target.value)} />
                        </FormRow>

                        <FormDivider />

                        <FormColumns>
                            <ToggleSection label="Sales Information" checked={salesOn} onChange={setSalesOn}>
                                <FormRow label="Selling Price" required labelWidth={130}>
                                    <MoneyInput value={form.salesRate ?? ''} onChange={e => set('salesRate', e.target.value)} />
                                </FormRow>
                                <FormRow label="MRP" labelWidth={130} hint="Printed on the bill">
                                    <MoneyInput value={form.mrpRate ?? ''} onChange={e => set('mrpRate', e.target.value)} />
                                </FormRow>
                                <FormRow label="Description" labelWidth={130}>
                                    <Textarea rows={3} value={form.salesDesc || ''} onChange={e => set('salesDesc', e.target.value)} />
                                </FormRow>
                            </ToggleSection>

                            <ToggleSection label="Purchase Information" checked={purchaseOn} onChange={setPurchaseOn}>
                                <FormRow label="Cost Price" required labelWidth={130}>
                                    <MoneyInput value={form.purchaseRate ?? ''} onChange={e => set('purchaseRate', e.target.value)} />
                                </FormRow>
                                <FormRow label="Discount %" labelWidth={130}>
                                    <Input numeric type="number" step="any" min="0"
                                        value={form.discount ?? ''} onChange={e => set('discount', e.target.value)} />
                                </FormRow>
                                <FormRow label="Description" labelWidth={130}>
                                    <Textarea rows={3} value={form.purchaseDesc || ''} onChange={e => set('purchaseDesc', e.target.value)} />
                                </FormRow>
                            </ToggleSection>
                        </FormColumns>

                        {form.type !== 'SERVICE' && priceListsOn && (<>
                            <FormDivider />
                            <FormBlockTitle>Price List</FormBlockTitle>
                            <div className="pb-2">
                                <p className="text-[12px] text-[var(--pos-ink-3)] mb-2">
                                    A price per unit, per list. A 25 KG bag is not 25 times the kilo rate — set what you
                                    actually charge. Leave the unit blank for a price that applies to any unit, scaled by
                                    the conversion. Add a minimum quantity for a bulk break.
                                </p>

                                {!editingId && (
                                    <p className="text-[12px] text-[var(--pos-ink-2)] mb-2">
                                        Save the item first, then its prices can be added.
                                    </p>
                                )}

                                {tiers.length > 0 && (
                                    <table className="w-full text-[12.5px] mb-2">
                                        <thead>
                                            <tr className="text-[10.5px] uppercase tracking-wide text-[var(--pos-ink-3)] text-left">
                                                <th className="py-1 font-semibold">List</th>
                                                <th className="py-1 font-semibold">Unit</th>
                                                <th className="py-1 font-semibold text-right">Rate</th>
                                                <th className="py-1 font-semibold text-right">Min Qty</th>
                                                <th />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tiers.map(t => (
                                                <tr key={t.id} className="border-t border-[var(--pos-line-soft)]">
                                                    <td className="py-1.5">{t.tierType === 'WHOLESALE' ? 'Wholesale' : 'Retail'}</td>
                                                    <td className="py-1.5">{t.unitCode || 'Any'}</td>
                                                    <td className="py-1.5 text-right" style={{ fontFamily: 'var(--pos-mono)' }}>{money(t.rate)}</td>
                                                    <td className="py-1.5 text-right" style={{ fontFamily: 'var(--pos-mono)' }}>{t.minQty > 0 ? t.minQty : '—'}</td>
                                                    <td className="py-1.5 text-right">
                                                        <Button variant="ghost" size="sm" disabled={tierBusy}
                                                            onClick={() => removeTier(t.id)}><Trash2 size={13} /></Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}

                                {tierDraft ? (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <div className="w-36">
                                            <SearchSelect value={tierDraft.tierType}
                                                onChange={v => setTierDraft(d => ({ ...d, tierType: v }))}
                                                options={[{ value: 'SALE', label: 'Retail' }, { value: 'WHOLESALE', label: 'Wholesale' }]} />
                                        </div>
                                        <div className="w-52">
                                            <SearchSelect value={tierDraft.unitCode}
                                                onChange={v => setTierDraft(d => ({ ...d, unitCode: v }))}
                                                options={priceUnitOptions} placeholder="Unit" />
                                        </div>
                                        <Input type="number" step="any" min="0" className="!w-28" placeholder="Rate"
                                            value={tierDraft.rate}
                                            onChange={e => setTierDraft(d => ({ ...d, rate: e.target.value }))} />
                                        <Input type="number" step="any" min="0" className="!w-28" placeholder="Min qty"
                                            value={tierDraft.minQty}
                                            onChange={e => setTierDraft(d => ({ ...d, minQty: e.target.value }))} />
                                        <Button variant="primary" size="sm" loading={tierBusy} onClick={addTier}>Add</Button>
                                        <Button variant="ghost" size="sm" onClick={() => setTierDraft(null)}>Cancel</Button>
                                    </div>
                                ) : (
                                    <Button variant="default" size="sm" disabled={!editingId}
                                        onClick={() => setTierDraft({ tierType: 'SALE', unitCode: form.unit || '', rate: '', minQty: '' })}>
                                        <Plus size={13} /> Add price
                                    </Button>
                                )}
                            </div>
                        </>)}

                        <FormDivider />

                        <FormBlockTitle>Default Tax Rate</FormBlockTitle>
                        <FormRow label="GST %">
                            <Input numeric type="number" step="any" min="0"
                                value={form.gstPercent ?? ''} onChange={e => set('gstPercent', e.target.value)} />
                        </FormRow>

                        {form.type !== 'SERVICE' && (<>
                            <FormDivider />
                            <div className="py-4">
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={!!form.isStockBased}
                                        onChange={e => set('isStockBased', e.target.checked)}
                                        className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                    <span className="text-[14px] font-semibold text-[var(--pos-ink)]">Track Inventory for this item</span>
                                </label>
                                <p className="text-[12px] text-[var(--pos-ink-3)] mt-1 sm:pl-[23px]">
                                    Stock is maintained through purchases, sales and adjustments.
                                </p>

                                {form.isStockBased && (
                                    <div className="sm:pl-[23px] mt-3">
                                        {barcodeOn && (
                                            <FormRow label="Barcode" labelWidth={150}>
                                                <Input value={form.barcode || ''} onChange={e => set('barcode', e.target.value)} />
                                            </FormRow>
                                        )}
                                        <FormRow label="Reorder Level" labelWidth={150} hint="Warn when stock falls to this">
                                            <Input numeric type="number" step="any" min="0"
                                                value={form.minStock ?? ''} onChange={e => set('minStock', e.target.value)} />
                                        </FormRow>
                                        <FormRow label="Sold by weight" labelWidth={150}>
                                            <label className="flex items-center gap-2 h-[32px] text-[12.5px] text-[var(--pos-ink-2)] cursor-pointer">
                                                <input type="checkbox" checked={!!form.isWeightBased}
                                                    onChange={e => set('isWeightBased', e.target.checked)}
                                                    className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                                Weighing-scale item
                                            </label>
                                        </FormRow>
                                        <FormRow label="Has expiry" labelWidth={150}>
                                            <label className="flex items-center gap-2 h-[32px] text-[12.5px] text-[var(--pos-ink-2)] cursor-pointer">
                                                <input type="checkbox" checked={!!form.allowExpiry}
                                                    onChange={e => set('allowExpiry', e.target.checked)}
                                                    className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                                Track batch and expiry
                                            </label>
                                        </FormRow>
                                        {form.allowExpiry && batchOn && (
                                            <FormRow label="" labelWidth={150}>
                                                <p className="text-[11.5px] text-[var(--pos-ink-3)] leading-relaxed py-1">
                                                    Stock is held per batch. Every purchase of this item needs a batch
                                                    number, and a sale takes the batch closest to expiring first.
                                                    The dates below are only the defaults offered on a new purchase.
                                                </p>
                                            </FormRow>
                                        )}
                                        {form.allowExpiry && (<>
                                            <FormRow label="Batch No" labelWidth={150}>
                                                <Input value={form.batchNo || ''} onChange={e => set('batchNo', e.target.value)} />
                                            </FormRow>
                                            <FormRow label="Expiry Date" labelWidth={150}>
                                                <Input type="date" value={form.expiryDate || ''} onChange={e => set('expiryDate', e.target.value)} />
                                            </FormRow>
                                        </>)}
                                    </div>
                                )}
                            </div>
                        </>)}
                    </div>
                </FormOverlay>
            )}
        </Page>
    );
}
