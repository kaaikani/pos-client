"use client";
/**
 * Purchase — list-first record module with an item-entry grid.
 *
 * This screen defines the GRID pattern that Purchase Return, Sales Return and POS
 * billing all reuse:
 *   · a row is added by picking an item, never by typing a blank row first
 *   · Enter walks across the cells and creates the next row at the end
 *   · line maths (discount → taxable → tax → amount) lives in one function
 *   · totals are derived, never stored in component state
 *
 * It also absorbs the old separate "Purchase List" screen — a list of purchases is
 * this module's landing view, not a different page.
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    ShoppingCart, Plus, Save, Trash2, RefreshCw, X, Search, Package, FileText, ChevronDown,
} from 'lucide-react';
import {
    ListPurchasesQuery, CreatePurchaseCommand, DeletePurchaseCommand, ListItemsQuery,
} from '../../core/queries/pharma.query';
import {
    Page, PageHeader, PageBody, ActionBar, HeaderStat, ListToolbar, FormHeader, FormSection,
    FormGrid, Field, Input, Select, Button, DataTable, Banner, EmptyState, Badge, TotalsPanel,
    ShortcutHints, useConfirm, money,
} from '../../components/pos';

const today = () => new Date().toISOString().split('T')[0];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

const PAY_TYPES = ['Cash', 'Credit', 'UPI', 'Card', 'Cheque'];
const TAX_MODES = ['Exclusive', 'Inclusive'];

const blankRow = () => ({
    itemCode: '', itemName: '', batchNo: '', expiry: '',
    qty: '', free: '', puRate: '', mrp: '', saleRate: '', discPct: '', taxPct: '',
});

/** One place for line maths. Returns the derived numbers — never mutates. */
function lineMath(r, taxMode) {
    const sub = num(r.qty) * num(r.puRate);
    const discAmt = sub * num(r.discPct) / 100;
    const taxable = sub - discAmt;
    const tax = taxable * num(r.taxPct) / 100;
    // Inclusive means the purchase rate already carries the tax, so it is not added again.
    const amount = taxMode === 'Inclusive' ? taxable : taxable + tax;
    return { sub, discAmt, taxable, tax, amount };
}

export default function PurchaseModule() {
    const confirm = useConfirm();

    const [purchases, setPurchases] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [banner, setBanner] = useState(null);

    const [view, setView] = useState('list');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [readOnly, setReadOnly] = useState(false);   // viewing a saved purchase

    // header
    const [hdr, setHdr] = useState({
        purNo: '', purDate: today(), invNo: '', invDate: today(),
        taxMode: 'Exclusive', payType: 'Cash', otherState: false,
        supplier: '', address: '', orderRef: '', transMode: '', transportName: '',
    });
    const [rows, setRows] = useState([]);
    const [showMoreHdr, setShowMoreHdr] = useState(false);

    // item picker
    const [picker, setPicker] = useState(null);        // { rowIdx } | null
    const [pickerText, setPickerText] = useState('');
    const [pickerSel, setPickerSel] = useState(0);
    const pickerRef = useRef(null);
    const gridRef = useRef(null);

    const setH = useCallback((k, v) => setHdr(p => ({ ...p, [k]: v })), []);

    /* ── data ───────────────────────────────────────────── */

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [pl, il] = await Promise.all([
                new ListPurchasesQuery().execute(),
                new ListItemsQuery().execute().catch(() => []),
            ]);
            setPurchases(pl || []);
            setItems(il || []);
        } catch (e) {
            setBanner({ tone: 'danger', text: `Could not load purchases: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    /* ── list ───────────────────────────────────────────── */

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return purchases;
        return purchases.filter(p =>
            [p.purNo, p.invNo, p.supplier, p.orderRef].some(f => String(f || '').toLowerCase().includes(q)));
    }, [purchases, search]);

    const totals = useMemo(() => ({
        count: purchases.length,
        value: purchases.reduce((s, p) => s + num(p.netAmount || p.totalAmount), 0),
        tax: purchases.reduce((s, p) => s + num(p.totalTax), 0),
    }), [purchases]);

    const listColumns = useMemo(() => [
        { key: 'purNo', header: 'Pur No', width: 90,
          render: (p) => <span className="font-semibold text-[var(--pos-ink)]" style={{ fontFamily: 'var(--pos-mono)' }}>{p.purNo || '—'}</span> },
        { key: 'purDate', header: 'Date', width: 110,
          render: (p) => <span className="text-[var(--pos-ink-2)]">{p.purDate || '—'}</span> },
        { key: 'supplier', header: 'Supplier',
          render: (p) => (
            <div className="min-w-0">
                <div className="font-semibold truncate">{p.supplier || '—'}</div>
                {p.address && <div className="text-[11px] text-[var(--pos-ink-3)] truncate">{p.address}</div>}
            </div>
          ) },
        { key: 'invNo', header: 'Invoice', width: 120,
          render: (p) => p.invNo || <span className="text-[var(--pos-ink-3)]">—</span> },
        { key: 'lines', header: 'Items', width: 70, align: 'right',
          render: (p) => (p.rows || []).length },
        { key: 'totalTax', header: 'Tax', width: 105, align: 'right',
          render: (p) => <span className="text-[var(--pos-ink-2)]">{money(p.totalTax)}</span> },
        { key: 'netAmount', header: 'Net', width: 120, align: 'right',
          render: (p) => <span className="font-bold">{money(p.netAmount || p.totalAmount)}</span> },
        { key: 'payType', header: 'Payment', width: 100,
          render: (p) => <Badge tone={p.payType === 'Credit' ? 'warn' : 'neutral'}>{p.payType || '—'}</Badge> },
    ], []);

    /* ── grid ───────────────────────────────────────────── */

    const derived = useMemo(() => rows.map(r => lineMath(r, hdr.taxMode)), [rows, hdr.taxMode]);
    const grand = useMemo(() => derived.reduce((a, d) => ({
        sub: a.sub + d.sub, disc: a.disc + d.discAmt, taxable: a.taxable + d.taxable,
        tax: a.tax + d.tax, amount: a.amount + d.amount,
    }), { sub: 0, disc: 0, taxable: 0, tax: 0, amount: 0 }), [derived]);

    const setRow = useCallback((i, k, v) => {
        setRows(prev => prev.map((r, n) => (n === i ? { ...r, [k]: v } : r)));
    }, []);

    const removeRow = useCallback((i) => setRows(prev => prev.filter((_, n) => n !== i)), []);

    const openPicker = useCallback((rowIdx) => {
        setPicker({ rowIdx });
        setPickerText('');
        setPickerSel(0);
        setTimeout(() => pickerRef.current?.focus(), 30);
    }, []);

    const pickerResults = useMemo(() => {
        const q = pickerText.trim().toLowerCase();
        const base = q
            ? items.filter(it => [it.itemName, it.code, it.barcode, it.brand]
                .some(f => String(f || '').toLowerCase().includes(q)))
            : items;
        return base.slice(0, 60);
    }, [items, pickerText]);

    const choose = useCallback((it) => {
        if (!it || !picker) return;
        const line = {
            ...blankRow(),
            itemCode: it.code,
            itemName: it.itemName,
            puRate: it.purchaseRate ? String(it.purchaseRate) : '',
            mrp: it.mrpRate ? String(it.mrpRate) : '',
            saleRate: it.salesRate ? String(it.salesRate) : '',
            taxPct: String(num(it.gstPercent) || 5),
            qty: '1',
        };
        setRows(prev => {
            const next = [...prev];
            if (picker.rowIdx === null || picker.rowIdx >= next.length) next.push(line);
            else next[picker.rowIdx] = { ...next[picker.rowIdx], ...line };
            return next;
        });
        setPicker(null);
        // land on the qty cell of the row just filled
        setTimeout(() => {
            const idx = picker.rowIdx === null ? rows.length : picker.rowIdx;
            gridRef.current?.querySelector(`[data-cell="qty-${idx}"]`)?.focus();
        }, 30);
    }, [picker, rows.length]);

    // Enter/Tab across grid cells; Enter on the last cell of the last row adds a row.
    const CELL_ORDER = ['qty', 'free', 'puRate', 'discPct', 'taxPct', 'mrp', 'saleRate'];
    const cellKeyDown = useCallback((e, rowIdx, cell) => {
        if (e.key === 'Escape') { e.currentTarget.blur(); return; }
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const ci = CELL_ORDER.indexOf(cell);
        const dir = e.shiftKey ? -1 : 1;
        const nextCi = ci + dir;
        if (nextCi >= 0 && nextCi < CELL_ORDER.length) {
            gridRef.current?.querySelector(`[data-cell="${CELL_ORDER[nextCi]}-${rowIdx}"]`)?.focus();
            return;
        }
        if (dir > 0) {
            if (rowIdx + 1 < rows.length) {
                gridRef.current?.querySelector(`[data-cell="qty-${rowIdx + 1}"]`)?.focus();
            } else {
                openPicker(null);           // end of the last row → add the next item
            }
        } else if (rowIdx > 0) {
            gridRef.current?.querySelector(`[data-cell="${CELL_ORDER[CELL_ORDER.length - 1]}-${rowIdx - 1}"]`)?.focus();
        }
    }, [rows.length, openPicker]);

    /* ── open / save / delete ───────────────────────────── */

    const openNew = useCallback(() => {
        setHdr({
            purNo: String(purchases.length + 1), purDate: today(), invNo: '', invDate: today(),
            taxMode: 'Exclusive', payType: 'Cash', otherState: false,
            supplier: '', address: '', orderRef: '', transMode: '', transportName: '',
        });
        setRows([]);
        setReadOnly(false);
        setShowMoreHdr(false);
        setBanner(null);
        setView('form');
        setTimeout(() => openPicker(null), 60);
    }, [purchases.length, openPicker]);

    const openRecord = useCallback((p) => {
        setHdr({
            purNo: p.purNo || '', purDate: p.purDate || today(), invNo: p.invNo || '', invDate: p.invDate || today(),
            taxMode: p.taxMode || 'Exclusive', payType: p.payType || 'Cash', otherState: !!p.otherState,
            supplier: p.supplier || '', address: p.address || '', orderRef: p.orderRef || '',
            transMode: p.transMode || '', transportName: p.transportName || '',
        });
        setRows((p.rows || []).map(r => ({ ...blankRow(), ...r })));
        setReadOnly(true);
        setBanner(null);
        setView('form');
    }, []);

    const backToList = useCallback(() => { setView('list'); setBanner(null); }, []);

    const handleSave = useCallback(async () => {
        if (!hdr.supplier.trim()) { setBanner({ tone: 'warn', text: 'Supplier is required.' }); return; }
        const valid = rows.filter(r => r.itemCode && num(r.qty) > 0);
        if (!valid.length) { setBanner({ tone: 'warn', text: 'Add at least one item with a quantity above 0.' }); return; }
        const noRate = valid.find(r => !(num(r.puRate) > 0));
        if (noRate) { setBanner({ tone: 'warn', text: `"${noRate.itemName}" needs a purchase rate above 0.` }); return; }

        setSaving(true);
        try {
            await new CreatePurchaseCommand().execute({
                purNo: hdr.purNo, purDate: hdr.purDate, invNo: hdr.invNo, invDate: hdr.invDate,
                taxMode: hdr.taxMode, payType: hdr.payType, otherState: hdr.otherState,
                supplier: hdr.supplier.trim(), orderRef: hdr.orderRef,
                transMode: hdr.transMode, address: hdr.address, transportName: hdr.transportName,
                rows: valid.map(r => {
                    const d = lineMath(r, hdr.taxMode);
                    return {
                        itemCode: r.itemCode, itemName: r.itemName,
                        batchNo: r.batchNo || '', expiry: r.expiry || '',
                        qty: num(r.qty), freeQty: num(r.free),
                        puRate: num(r.puRate), mrpRate: num(r.mrp), sellingRate: num(r.saleRate),
                        discountPct: num(r.discPct), taxPct: num(r.taxPct),
                        amount: d.amount,
                    };
                }),
                totalAmount: grand.amount, totalDiscA: grand.disc, totalTax: grand.tax,
                netAmount: grand.amount,
            });
            await loadAll();
            setView('list');
            setBanner({ tone: 'ok', text: `Purchase ${hdr.purNo} saved — ${money(grand.amount)} from ${hdr.supplier.trim()}.` });
        } catch (err) {
            setBanner({ tone: 'danger', text: err.message });
        } finally {
            setSaving(false);
        }
    }, [hdr, rows, grand, loadAll]);

    const handleDelete = useCallback(async (rec) => {
        const p = rec || purchases.find(x => x.id === selectedId);
        if (!p) { setBanner({ tone: 'warn', text: 'Select a purchase first.' }); return; }
        const ok = await confirm({
            title: 'Delete purchase?',
            message: `${p.purNo} — ${p.supplier}\n${money(p.netAmount || p.totalAmount)}\n\nStock received on this bill will be reversed. This cannot be undone.`,
            confirmLabel: 'Delete', tone: 'danger',
        });
        if (!ok) return;
        try {
            await new DeletePurchaseCommand().execute(p.id);
            await loadAll();
            setSelectedId(null);
            setView('list');
            setBanner({ tone: 'ok', text: `Purchase ${p.purNo} deleted.` });
        } catch (err) {
            setBanner({ tone: 'danger', text: err.message });
        }
    }, [purchases, selectedId, confirm, loadAll]);

    /* ── item picker overlay ────────────────────────────── */

    const pickerOverlay = picker && (
        <div className="fixed inset-0 z-[90] grid place-items-start justify-center pt-[10vh] bg-[rgba(16,28,33,.45)] p-4"
             role="dialog" aria-modal="true"
             onMouseDown={(e) => { if (e.target === e.currentTarget) setPicker(null); }}>
            <div className="w-full max-w-[620px] bg-[var(--pos-surface)] rounded-[var(--pos-r-lg)] shadow-[var(--pos-shadow-lg)] overflow-hidden flex flex-col max-h-[70vh]">
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--pos-line)]">
                    <Search size={15} className="text-[var(--pos-ink-3)] shrink-0" />
                    <input
                        ref={pickerRef}
                        value={pickerText}
                        onChange={e => { setPickerText(e.target.value); setPickerSel(0); }}
                        onKeyDown={e => {
                            if (e.key === 'ArrowDown') { e.preventDefault(); setPickerSel(s => Math.min(pickerResults.length - 1, s + 1)); }
                            else if (e.key === 'ArrowUp') { e.preventDefault(); setPickerSel(s => Math.max(0, s - 1)); }
                            else if (e.key === 'Enter') { e.preventDefault(); choose(pickerResults[pickerSel]); }
                            else if (e.key === 'Escape') { e.preventDefault(); setPicker(null); }
                        }}
                        placeholder="Search item by name, code or barcode…"
                        className="flex-1 h-8 bg-transparent outline-none text-[13.5px] font-medium text-[var(--pos-ink)] placeholder:text-[var(--pos-ink-3)]"
                    />
                    <button onClick={() => setPicker(null)} aria-label="Close"
                        className="pos-focusable grid place-items-center w-6 h-6 rounded text-[var(--pos-ink-3)] hover:bg-[var(--pos-sunk)]"><X size={14} /></button>
                </div>
                <div className="pos-scroll flex-1 min-h-0">
                    {pickerResults.length === 0 ? (
                        <EmptyState icon={Package} title="No matching item" hint="Add it in Item first, then come back." />
                    ) : pickerResults.map((it, i) => (
                        <button key={it.id} type="button"
                            onMouseEnter={() => setPickerSel(i)}
                            onClick={() => choose(it)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-[var(--pos-line-soft)] ${i === pickerSel ? 'bg-[var(--pos-select)]' : 'hover:bg-[var(--pos-hover)]'}`}>
                            <span className="w-[70px] shrink-0 text-[11.5px] font-semibold text-[var(--pos-ink-2)]" style={{ fontFamily: 'var(--pos-mono)' }}>{it.code}</span>
                            <span className="flex-1 min-w-0">
                                <span className="block text-[13px] font-semibold text-[var(--pos-ink)] truncate">{it.itemName}</span>
                                {(it.brand || it.unit) && <span className="block text-[11px] text-[var(--pos-ink-3)] truncate">{[it.brand, it.unit].filter(Boolean).join(' · ')}</span>}
                            </span>
                            <span className="shrink-0 text-[12px] text-[var(--pos-ink-2)] tabular-nums" style={{ fontFamily: 'var(--pos-mono)' }}>{money(it.purchaseRate)}</span>
                        </button>
                    ))}
                </div>
                <div className="px-3 py-2 bg-[var(--pos-sunk)] border-t border-[var(--pos-line)]">
                    <ShortcutHints items={[['↑ ↓', 'move'], ['Enter', 'add to bill'], ['Esc', 'close']]} />
                </div>
            </div>
        </div>
    );

    /* ── render: FORM ───────────────────────────────────── */

    if (view === 'form') {
        const cellCls = 'w-full h-[26px] px-2 text-[12.5px] font-medium text-right tabular-nums bg-transparent outline-none focus:bg-[var(--pos-field-focus)] focus:ring-1 focus:ring-[var(--pos-ink-3)] rounded-sm disabled:text-[var(--pos-ink-3)]';

        return (
            <Page>
                <FormHeader
                    onBack={backToList}
                    title={readOnly ? `Purchase ${hdr.purNo}` : 'New Purchase'}
                    subtitle={readOnly ? `${hdr.supplier} · ${hdr.purDate}` : 'Record goods received from a supplier'}
                    badge={readOnly ? <Badge tone="neutral">Saved</Badge> : <Badge tone="ok">Draft</Badge>}
                    actions={<>
                        {readOnly
                            ? <Button variant="danger" icon={Trash2}
                                onClick={() => handleDelete(purchases.find(p => p.purNo === hdr.purNo))}>Delete</Button>
                            : <>
                                <Button variant="default" icon={X} onClick={backToList}>Cancel</Button>
                                <Button variant="primary" icon={Save} loading={saving} onClick={handleSave}>Save Purchase</Button>
                              </>}
                    </>}
                />
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                <PageBody>
                    <div className="max-w-[1240px] mx-auto flex flex-col gap-4">

                        <div className="bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[var(--pos-r-lg)] shadow-[var(--pos-shadow)] px-5 py-4">
                            <FormSection title="Supplier & Invoice">
                                <FormGrid cols={4}>
                                    <Field label="Supplier" required span={2}>
                                        <Input value={hdr.supplier} disabled={readOnly}
                                            onChange={e => setH('supplier', e.target.value)} placeholder="Supplier name" autoComplete="off" />
                                    </Field>
                                    <Field label="Purchase No">
                                        <Input value={hdr.purNo} disabled={readOnly} onChange={e => setH('purNo', e.target.value)} />
                                    </Field>
                                    <Field label="Purchase Date">
                                        <Input type="date" value={hdr.purDate} disabled={readOnly} onChange={e => setH('purDate', e.target.value)} />
                                    </Field>

                                    <Field label="Supplier Invoice No">
                                        <Input value={hdr.invNo} disabled={readOnly} onChange={e => setH('invNo', e.target.value)} autoComplete="off" />
                                    </Field>
                                    <Field label="Invoice Date">
                                        <Input type="date" value={hdr.invDate} disabled={readOnly} onChange={e => setH('invDate', e.target.value)} />
                                    </Field>
                                    <Field label="Tax Mode" hint="Inclusive = rate already has tax">
                                        <Select value={hdr.taxMode} disabled={readOnly} onChange={e => setH('taxMode', e.target.value)}>
                                            {TAX_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                        </Select>
                                    </Field>
                                    <Field label="Payment">
                                        <Select value={hdr.payType} disabled={readOnly} onChange={e => setH('payType', e.target.value)}>
                                            {PAY_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
                                        </Select>
                                    </Field>
                                </FormGrid>

                                <button type="button" onClick={() => setShowMoreHdr(v => !v)}
                                    className="pos-focusable mt-3.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--pos-ink-2)] hover:text-[var(--pos-ink)]">
                                    Address & transport
                                    <ChevronDown size={13} className={showMoreHdr ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                </button>
                                {showMoreHdr && (
                                    <FormGrid cols={4} className="mt-3">
                                        <Field label="Address" span={2}>
                                            <Input value={hdr.address} disabled={readOnly} onChange={e => setH('address', e.target.value)} />
                                        </Field>
                                        <Field label="Order Ref">
                                            <Input value={hdr.orderRef} disabled={readOnly} onChange={e => setH('orderRef', e.target.value)} />
                                        </Field>
                                        <Field label="Transporter">
                                            <Input value={hdr.transportName} disabled={readOnly} onChange={e => setH('transportName', e.target.value)} />
                                        </Field>
                                        <Field label="Transport Mode">
                                            <Input value={hdr.transMode} disabled={readOnly} onChange={e => setH('transMode', e.target.value)} />
                                        </Field>
                                        <Field label="Inter-state" hint="Charges IGST instead of CGST+SGST">
                                            <label className="flex items-center gap-2 h-[32px] text-[12.5px] font-medium text-[var(--pos-ink-2)] cursor-pointer">
                                                <input type="checkbox" className="pos-focusable accent-[var(--pos-ink-2)] w-3.5 h-3.5"
                                                    checked={hdr.otherState} disabled={readOnly}
                                                    onChange={e => setH('otherState', e.target.checked)} />
                                                Supplier is in another state
                                            </label>
                                        </Field>
                                    </FormGrid>
                                )}
                            </FormSection>
                        </div>

                        {/* ── item grid ── */}
                        <div className="bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[var(--pos-r-lg)] shadow-[var(--pos-shadow)] overflow-hidden">
                            <div className="flex items-center gap-3 px-4 h-[42px] border-b border-[var(--pos-line)] bg-[var(--pos-sunk)]">
                                <h2 className="text-[12px] font-bold uppercase tracking-[.05em] text-[var(--pos-ink-2)] flex-1">
                                    Items <span className="text-[var(--pos-ink-3)] normal-case font-medium">· {rows.length} line{rows.length === 1 ? '' : 's'}</span>
                                </h2>
                                {!readOnly && <Button variant="default" size="sm" icon={Plus} onClick={() => openPicker(null)}>Add Item</Button>}
                            </div>

                            <div ref={gridRef} className="pos-scroll max-h-[46vh]">
                                <table className="pos-table">
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }} className="text-center">#</th>
                                            <th style={{ width: 84 }}>Code</th>
                                            <th>Item</th>
                                            <th style={{ width: 96 }}>Batch</th>
                                            <th style={{ width: 118 }}>Expiry</th>
                                            <th style={{ width: 72 }} className="text-right">Qty</th>
                                            <th style={{ width: 62 }} className="text-right">Free</th>
                                            <th style={{ width: 92 }} className="text-right">Rate</th>
                                            <th style={{ width: 66 }} className="text-right">Disc%</th>
                                            <th style={{ width: 62 }} className="text-right">Tax%</th>
                                            <th style={{ width: 88 }} className="text-right">MRP</th>
                                            <th style={{ width: 92 }} className="text-right">Sale Rate</th>
                                            <th style={{ width: 104 }} className="text-right">Amount</th>
                                            {!readOnly && <th style={{ width: 38 }} />}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.length === 0 && (
                                            <tr><td colSpan={readOnly ? 13 : 14} className="!h-auto !p-0">
                                                <EmptyState icon={Package} title="No items on this purchase"
                                                    hint="Add the items the supplier delivered. Enter on the last cell adds the next item."
                                                    action={!readOnly && <Button variant="primary" icon={Plus} onClick={() => openPicker(null)}>Add Item</Button>} />
                                            </td></tr>
                                        )}
                                        {rows.map((r, i) => {
                                            const d = derived[i];
                                            return (
                                                <tr key={i}>
                                                    <td className="text-center text-[var(--pos-ink-3)]">{i + 1}</td>
                                                    <td><span className="text-[12px] font-semibold text-[var(--pos-ink)]" style={{ fontFamily: 'var(--pos-mono)' }}>{r.itemCode}</span></td>
                                                    <td className="font-semibold truncate">{r.itemName}</td>
                                                    <td className="!px-1">
                                                        <input value={r.batchNo} disabled={readOnly} onChange={e => setRow(i, 'batchNo', e.target.value)}
                                                            className={cellCls + ' !text-left'} />
                                                    </td>
                                                    <td className="!px-1">
                                                        <input type="date" value={r.expiry} disabled={readOnly} onChange={e => setRow(i, 'expiry', e.target.value)}
                                                            className={cellCls + ' !text-left'} />
                                                    </td>
                                                    {['qty', 'free', 'puRate', 'discPct', 'taxPct', 'mrp', 'saleRate'].map(cell => (
                                                        <td key={cell} className="!px-1">
                                                            <input data-cell={`${cell}-${i}`} type="number" step="any" min="0"
                                                                value={r[cell === 'mrp' ? 'mrp' : cell] ?? ''} disabled={readOnly}
                                                                onChange={e => setRow(i, cell, e.target.value)}
                                                                onFocus={e => e.target.select()}
                                                                onKeyDown={e => cellKeyDown(e, i, cell)}
                                                                className={cellCls} />
                                                        </td>
                                                    ))}
                                                    <td className="num font-bold">{money(d.amount)}</td>
                                                    {!readOnly && (
                                                        <td className="text-center">
                                                            <button type="button" onClick={() => removeRow(i)} aria-label="Remove line"
                                                                className="pos-focusable grid place-items-center w-6 h-6 mx-auto rounded text-[var(--pos-ink-3)] hover:text-[var(--pos-danger)] hover:bg-[var(--pos-danger-soft)]">
                                                                <X size={13} />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <TotalsPanel
                            rows={[
                                { label: 'Gross', value: money(grand.sub) },
                                { label: 'Discount', value: `− ${money(grand.disc)}` },
                                { label: 'Taxable', value: money(grand.taxable) },
                                { label: hdr.otherState ? 'IGST' : 'CGST + SGST', value: money(grand.tax) },
                            ]}
                            grand={{ label: 'Net Payable', value: money(grand.amount) }}
                        />
                    </div>
                </PageBody>

                <ActionBar left={
                    <ShortcutHints items={[['Enter', 'next cell'], ['Enter on last cell', 'add item'], ['Shift+Enter', 'back'], ['Esc', 'leave cell']]} />
                }>
                    {readOnly
                        ? <Button variant="default" onClick={backToList}>Close</Button>
                        : <>
                            <Button variant="default" onClick={backToList}>Cancel</Button>
                            <Button variant="primary" icon={Save} loading={saving} onClick={handleSave}>
                                Save Purchase · {money(grand.amount)}
                            </Button>
                          </>}
                </ActionBar>

                {pickerOverlay}
            </Page>
        );
    }

    /* ── render: LIST ───────────────────────────────────── */

    return (
        <Page>
            <PageHeader
                icon={ShoppingCart}
                title="Purchase"
                subtitle="Goods received from suppliers"
                meta={<>
                    <HeaderStat label="Purchases" value={totals.count} />
                    <HeaderStat label="Value" value={money(totals.value, 0)} />
                    <HeaderStat label="Input Tax" value={money(totals.tax, 0)} />
                </>}
                actions={<>
                    <Button variant="default" icon={RefreshCw} onClick={loadAll} disabled={loading}>Refresh</Button>
                    <Button variant="primary" icon={Plus} onClick={openNew}>New Purchase</Button>
                </>}
            />

            {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

            <ListToolbar
                search={search}
                onSearch={setSearch}
                placeholder="Search by purchase no, invoice, supplier…"
                count={filtered.length}
                countLabel={filtered.length === 1 ? 'purchase' : 'purchases'}
                actions={
                    selectedId
                        ? <>
                            <Button variant="default" size="sm" icon={FileText}
                                onClick={() => openRecord(purchases.find(p => p.id === selectedId))}>Open</Button>
                            <Button variant="danger" size="sm" icon={Trash2} onClick={() => handleDelete()}>Delete</Button>
                          </>
                        : <span className="text-[11.5px] text-[var(--pos-ink-3)]">Select a row to open or delete</span>
                }
            />

            <PageBody padded={false}>
                <DataTable
                    className="!border-0 !rounded-none h-full"
                    columns={listColumns}
                    rows={filtered}
                    loading={loading}
                    selectedKey={selectedId}
                    onSelect={(p) => setSelectedId(p.id)}
                    onActivate={openRecord}
                    empty={
                        search
                            ? <EmptyState icon={Search} title="No purchases match this search"
                                action={<Button variant="default" onClick={() => setSearch('')}>Clear search</Button>} />
                            : <EmptyState icon={ShoppingCart} title="No purchases yet"
                                hint="Record your first supplier bill to bring stock in."
                                action={<Button variant="primary" icon={Plus} onClick={openNew}>New Purchase</Button>} />
                    }
                />
            </PageBody>

            <ActionBar left={<ShortcutHints items={[['↑ ↓', 'move'], ['Enter', 'open purchase']]} />}>
                <Button variant="primary" icon={Plus} onClick={openNew}>New Purchase</Button>
            </ActionBar>
        </Page>
    );
}
