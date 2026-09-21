"use client";
/**
 * Restaurant — the floor, and the order pad.
 *
 * One screen with two views, because that is how the work actually goes: a
 * waiter looks at the room, taps a table, adds two dishes, and is back looking
 * at the room. Splitting that across two menu entries would add a navigation
 * step to the most repeated action in the building.
 *
 * The floor is the default view. A table is a colour: grey is free, amber is
 * occupied, and the running total sits under the number so the cashier can see
 * where the money is without opening anything.
 *
 * ── Kitchen printing ──
 *
 * The ticket prints from THIS computer, through QZ Tray, to whichever printer
 * is chosen in the strip at the top. That covers the common case — the kitchen
 * printer shared on, or networked to, the billing machine. A kitchen with its
 * own computer would need a helper running there; the chosen-printer setting is
 * where that would plug in, so nothing else has to change.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    UtensilsCrossed, Plus, Minus, Send, Receipt, X, ArrowRightLeft, Trash2, Printer, Search,
} from 'lucide-react';
import {
    Page, PageHeader, PageBody, Card, Button, Banner, EmptyState, Badge,
    Select, Input, SearchInput, useConfirm, money, HeaderStat, Spinner,
} from '../../components/pos';
import {
    PosTablesQuery, SavePosTableCommand, RemovePosTableCommand,
    PosOrdersQuery, PosOrderQuery, OpenPosOrderCommand, UpdatePosOrderLinesCommand,
    SendPosOrderToKitchenCommand, BillPosOrderCommand, CancelPosOrderCommand,
    MovePosOrderCommand, ListItemsQuery,
} from '../../core/queries/pos.query';
import { kotPdfBase64, openKotPdf } from '../../core/print/kot-print';
import { qzIsAvailable, qzListPrinters, qzPrintPdfBase64 } from '../../core/barcode/qz-print';

const KITCHEN_PRINTER_KEY = 'pos.kitchenPrinter';

/** Reads the remembered kitchen printer. Storage can throw in a private window. */
function readKitchenPrinter() {
    try { return localStorage.getItem(KITCHEN_PRINTER_KEY) || ''; } catch { return ''; }
}
function writeKitchenPrinter(name) {
    try { localStorage.setItem(KITCHEN_PRINTER_KEY, name || ''); } catch { /* not fatal */ }
}

export default function RestaurantModule() {
    const confirm = useConfirm();

    const [view, setView] = useState('FLOOR');
    const [tables, setTables] = useState([]);
    const [orders, setOrders] = useState([]);
    const [items, setItems] = useState([]);
    const [order, setOrder] = useState(null);
    const [lines, setLines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const [search, setSearch] = useState('');
    const [splitMode, setSplitMode] = useState(false);
    const [splitQty, setSplitQty] = useState({});

    // The room is set up once and then hardly ever touched, so the form stays
    // out of the way until it is asked for. The area and seat count persist
    // between adds — a dining room is entered a section at a time.
    const [addingTable, setAddingTable] = useState(false);
    const [newTable, setNewTable] = useState({ code: '', area: '', seats: '4' });

    const [printers, setPrinters] = useState([]);
    const [kitchenPrinter, setKitchenPrinter] = useState('');
    const searchRef = useRef(null);

    /* ── data ─────────────────────────────────────────────── */

    const loadFloor = useCallback(async () => {
        setLoading(true);
        try {
            const [t, o, i] = await Promise.all([
                new PosTablesQuery().execute(),
                new PosOrdersQuery().execute('OPEN'),
                new ListItemsQuery().execute(),
            ]);
            setTables(t);
            setOrders(o);
            setItems(i);
            setError('');
        } catch (e) {
            setError(e?.message || 'Could not load the floor.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadFloor(); }, [loadFloor]);

    useEffect(() => {
        setKitchenPrinter(readKitchenPrinter());
        (async () => {
            try {
                if (await qzIsAvailable()) setPrinters(await qzListPrinters());
            } catch {
                // No QZ Tray: the ticket falls back to the browser print dialog,
                // which still reaches a printer, just with one more click.
                setPrinters([]);
            }
        })();
    }, []);

    const orderByTable = useMemo(() => {
        const m = new Map();
        for (const o of orders) if (o.tableId != null) m.set(Number(o.tableId), o);
        return m;
    }, [orders]);

    const areas = useMemo(() => {
        const m = new Map();
        for (const t of tables) {
            const key = t.area || 'Dining';
            if (!m.has(key)) m.set(key, []);
            m.get(key).push(t);
        }
        return [...m.entries()];
    }, [tables]);

    /* ── opening a table ──────────────────────────────────── */

    const openTable = async (table) => {
        setError('');
        setNotice('');
        setBusy(true);
        try {
            const existing = orderByTable.get(Number(table.id));
            const o = existing
                ? await new PosOrderQuery().execute(existing.id)
                : await new OpenPosOrderCommand().execute({
                    orderType: 'DINE_IN',
                    tableId: Number(table.id),
                    orderDate: new Date().toISOString().slice(0, 10),
                });
            setOrder(o);
            setLines(o.lines.map(l => ({ ...l })));
            setSplitMode(false);
            setSplitQty({});
            setView('ORDER');
            setTimeout(() => searchRef.current?.focus(), 50);
        } catch (e) {
            setError(e?.message || 'Could not open the table.');
            await loadFloor();
        } finally {
            setBusy(false);
        }
    };

    const backToFloor = async () => {
        setView('FLOOR');
        setOrder(null);
        setLines([]);
        setSearch('');
        await loadFloor();
    };

    /* ── the order pad ────────────────────────────────────── */

    const matches = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        return items
            .filter(i => (i.itemName || '').toLowerCase().includes(q)
                || (i.code || '').toLowerCase().includes(q))
            .slice(0, 8);
    }, [items, search]);

    const addItem = (item) => {
        setLines(prev => {
            // The same dish ordered twice is one line with a bigger number —
            // two identical lines on a ticket reads as a mistake to the kitchen.
            const at = prev.findIndex(l => l.itemCode === item.code && !l.notes && (l.modifiers || []).length === 0);
            if (at >= 0) {
                const next = [...prev];
                next[at] = { ...next[at], qty: Number(next[at].qty) + 1 };
                return next;
            }
            return [...prev, {
                lineId: '',
                itemCode: item.code,
                itemName: item.itemName,
                qty: 1,
                sentQty: 0,
                billedQty: 0,
                unit: item.unit || '',
                rate: Number(item.salesRate) || 0,
                notes: '',
                modifiers: [],
            }];
        });
        setSearch('');
        searchRef.current?.focus();
    };

    const bump = (idx, by) => setLines(prev => prev.map((l, i) => {
        if (i !== idx) return l;
        const next = Math.max(0, Number(l.qty) + by);
        return { ...l, qty: next };
    }));

    const setNote = (idx, notes) => setLines(prev => prev.map((l, i) => (i === idx ? { ...l, notes } : l)));

    const dropLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx));

    const dirty = useMemo(() => {
        if (!order) return false;
        if (order.lines.length !== lines.filter(l => l.qty > 0 || l.sentQty > 0).length) return true;
        return lines.some(l => {
            const was = order.lines.find(x => x.lineId === l.lineId);
            if (!was) return true;
            return was.qty !== l.qty || was.notes !== l.notes;
        });
    }, [order, lines]);

    const runningTotal = useMemo(
        () => lines.reduce((s, l) => s + Number(l.qty) * Number(l.rate)
            + (l.modifiers || []).reduce((m, x) => m + (Number(x.priceDelta) || 0) * Number(l.qty), 0), 0),
        [lines],
    );

    const saveLines = useCallback(async () => {
        if (!order) return null;
        const saved = await new UpdatePosOrderLinesCommand().execute({
            orderId: String(order.id),
            lines: lines
                .filter(l => l.qty > 0 || l.sentQty > 0)
                .map(l => ({
                    ...(l.lineId ? { lineId: l.lineId } : {}),
                    itemCode: l.itemCode,
                    qty: Number(l.qty),
                    unit: l.unit || undefined,
                    rate: Number(l.rate),
                    notes: l.notes || '',
                    modifiers: (l.modifiers || []).map(m => ({
                        name: m.name, itemCode: m.itemCode || undefined, priceDelta: m.priceDelta || undefined,
                    })),
                })),
        });
        setOrder(saved);
        setLines(saved.lines.map(l => ({ ...l })));
        return saved;
    }, [order, lines]);

    /* ── kitchen ──────────────────────────────────────────── */

    const printTicket = async (ticket) => {
        const b64 = await kotPdfBase64(ticket);
        if (kitchenPrinter) {
            await qzPrintPdfBase64(kitchenPrinter, b64);
            return true;
        }
        // No printer chosen: the browser dialog still gets it there.
        await openKotPdf(ticket);
        return false;
    };

    const sendToKitchen = async () => {
        setError('');
        setNotice('');
        setBusy(true);
        try {
            if (dirty) await saveLines();
            const tickets = await new SendPosOrderToKitchenCommand().execute(order.id);
            if (tickets.length === 0) {
                setNotice('Nothing new since the last ticket — the kitchen already has it all.');
                return;
            }
            let printed = 0;
            for (const t of tickets) {
                try {
                    await printTicket(t);
                    printed++;
                } catch (e) {
                    // The ticket EXISTS on the server whether or not it printed.
                    // Saying so matters: the alternative is a waiter who thinks
                    // the order never went and sends it again.
                    setError(
                        `Ticket ${t.ticketNo} was recorded but could not be printed (${e?.message || 'printer error'}). `
                        + 'The kitchen has not seen it — tell them, or reprint from the order.',
                    );
                }
            }
            if (printed > 0) {
                setNotice(`${printed} ticket${printed > 1 ? 's' : ''} sent to the kitchen.`);
            }
            const fresh = await new PosOrderQuery().execute(order.id);
            setOrder(fresh);
            setLines(fresh.lines.map(l => ({ ...l })));
        } catch (e) {
            setError(e?.message || 'Could not send to the kitchen.');
        } finally {
            setBusy(false);
        }
    };

    /* ── billing ──────────────────────────────────────────── */

    const bill = async () => {
        setError('');
        setNotice('');
        setBusy(true);
        try {
            if (dirty) await saveLines();

            const chosen = splitMode
                ? Object.entries(splitQty)
                    .map(([lineId, qty]) => ({ lineId, qty: Number(qty) || 0 }))
                    .filter(l => l.qty > 0)
                : undefined;
            if (splitMode && (!chosen || chosen.length === 0)) {
                setError('Choose what goes on this bill first.');
                return;
            }

            const sale = await new BillPosOrderCommand().execute({
                orderId: String(order.id),
                ...(chosen ? { lines: chosen } : {}),
                sale: {
                    billDate: new Date().toISOString().slice(0, 10),
                    saleType: 'CASH',
                    customerName: order.customerName || 'Walk-in',
                },
            });
            setNotice(`Bill ${sale.billNo} — ${money(sale.grandTotal)}.`);

            const fresh = await new PosOrderQuery().execute(order.id);
            if (fresh.status === 'OPEN') {
                setOrder(fresh);
                setLines(fresh.lines.map(l => ({ ...l })));
                setSplitQty({});
            } else {
                await backToFloor();
            }
        } catch (e) {
            setError(e?.message || 'Could not make the bill.');
        } finally {
            setBusy(false);
        }
    };

    const cancelOrder = async () => {
        const ok = await confirm({
            title: `Cancel order ${order.orderNo}?`,
            message: 'The table is freed and nothing is billed. Anything already sent to the kitchen '
                + 'is not automatically cancelled — tell them.',
            confirmLabel: 'Cancel order',
            tone: 'danger',
        });
        if (!ok) return;
        setBusy(true);
        try {
            await new CancelPosOrderCommand().execute(order.id, 'Cancelled at the till');
            await backToFloor();
        } catch (e) {
            setError(e?.message || 'Could not cancel the order.');
        } finally {
            setBusy(false);
        }
    };

    const moveTo = async (tableId) => {
        setBusy(true);
        setError('');
        try {
            const moved = await new MovePosOrderCommand().execute(order.id, Number(tableId));
            setOrder(moved);
            setNotice(`Moved to table ${moved.tableCode}.`);
        } catch (e) {
            setError(e?.message || 'Could not move the order.');
        } finally {
            setBusy(false);
        }
    };

    /* ── table master ─────────────────────────────────────── */

    const addTable = async () => {
        const code = newTable.code.trim();
        if (!code) { setError('Give the table a number first.'); return; }
        setError('');
        try {
            await new SavePosTableCommand().execute({
                code,
                area: newTable.area.trim(),
                seats: Number(newTable.seats) || 4,
            });
            setNewTable({ code: '', area: newTable.area, seats: newTable.seats });
            setAddingTable(false);
            await loadFloor();
        } catch (e) {
            setError(e?.message || 'Could not add the table.');
        }
    };

    /* ── render ───────────────────────────────────────────── */

    const printerStrip = (
        <div className="shrink-0 flex items-center gap-2 text-[12px]">
            <Printer size={14} className="text-[var(--pos-ink-3)]" />
            <span className="text-[var(--pos-ink-3)]">Kitchen printer</span>
            <Select
                value={kitchenPrinter}
                onChange={e => { setKitchenPrinter(e.target.value); writeKitchenPrinter(e.target.value); }}
                className="w-56">
                <option value="">Ask each time (browser dialog)</option>
                {printers.map(p => <option key={p} value={p}>{p}</option>)}
            </Select>
            {printers.length === 0 && (
                <span className="text-[11px] text-[var(--pos-ink-3)]">
                    QZ Tray not running — tickets will open the print dialog.
                </span>
            )}
        </div>
    );

    if (view === 'FLOOR') {
        const occupied = tables.filter(t => t.status === 'OCCUPIED').length;
        return (
            <Page>
                <PageHeader
                    icon={UtensilsCrossed}
                    title="Restaurant"
                    subtitle="Tap a table to open it, or to add to what is already there."
                    meta={
                        <>
                            <HeaderStat label="Tables" value={String(tables.length)} />
                            <HeaderStat label="Occupied" value={String(occupied)}
                                tone={occupied > 0 ? 'warn' : 'default'} />
                            <HeaderStat label="On the floor"
                                value={money(orders.reduce((s, o) => s + Number(o.runningTotal || 0), 0))} />
                        </>
                    }
                    actions={<Button icon={Plus} onClick={() => setAddingTable(v => !v)}>Add table</Button>}
                />
                <PageBody className="flex flex-col gap-3">
                    {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}
                    {notice && <Banner tone="ok" onClose={() => setNotice('')}>{notice}</Banner>}
                    {printerStrip}

                    {addingTable && (
                        <Card className="shrink-0" title="Add a table">
                            <div className="flex items-end gap-2 flex-wrap">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-semibold text-[var(--pos-ink-3)]">Number</span>
                                    <Input autoFocus value={newTable.code} className="!w-28"
                                        onChange={e => setNewTable(p => ({ ...p, code: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') addTable(); }} />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-semibold text-[var(--pos-ink-3)]">Area</span>
                                    <Input value={newTable.area} className="!w-40" placeholder="Ground, AC, Terrace"
                                        onChange={e => setNewTable(p => ({ ...p, area: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') addTable(); }} />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[11px] font-semibold text-[var(--pos-ink-3)]">Seats</span>
                                    <Input numeric inputMode="numeric" value={newTable.seats} className="!w-20"
                                        onChange={e => setNewTable(p => ({ ...p, seats: e.target.value }))}
                                        onKeyDown={e => { if (e.key === 'Enter') addTable(); }} />
                                </label>
                                <Button variant="primary" icon={Plus} onClick={addTable}>Add</Button>
                                <Button onClick={() => setAddingTable(false)}>Done</Button>
                            </div>
                        </Card>
                    )}

                    {loading ? <Spinner /> : tables.length === 0 ? (
                        <EmptyState icon={UtensilsCrossed} title="No tables yet"
                            hint="Add the tables in your dining room and they will appear here."
                            action={<Button icon={Plus} onClick={() => setAddingTable(true)}>Add table</Button>} />
                    ) : (
                        <div className="flex-1 min-h-0 overflow-auto pos-scroll flex flex-col gap-4">
                            {areas.map(([area, list]) => (
                                <div key={area}>
                                    <h3 className="text-[11px] font-bold uppercase tracking-[.08em] text-[var(--pos-ink-3)] mb-2">
                                        {area}
                                    </h3>
                                    <div className="grid gap-2"
                                        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                                        {list.map(t => {
                                            const o = orderByTable.get(Number(t.id));
                                            const busyTable = t.status === 'OCCUPIED';
                                            return (
                                                <button key={t.id} type="button"
                                                    onClick={() => openTable(t)}
                                                    className={`pos-focusable rounded-[var(--pos-r)] border p-3 text-left transition ${
                                                        busyTable
                                                            ? 'bg-[var(--pos-warn-soft)] border-[var(--pos-warn)]'
                                                            : 'bg-[var(--pos-surface)] border-[var(--pos-line)] hover:border-[var(--pos-ink-3)]'
                                                    }`}>
                                                    <div className="text-[17px] font-black text-[var(--pos-ink)] leading-tight">
                                                        {t.code}
                                                    </div>
                                                    <div className="text-[10.5px] text-[var(--pos-ink-3)] mt-0.5">
                                                        {t.seats} seats
                                                    </div>
                                                    {busyTable && o ? (
                                                        <div className="mt-2">
                                                            <div className="text-[13px] font-bold text-[var(--pos-ink)]">
                                                                {money(o.runningTotal)}
                                                            </div>
                                                            <div className="text-[10px] text-[var(--pos-ink-3)]">
                                                                {o.orderTime}{o.waiter ? ` · ${o.waiter}` : ''}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="mt-2 text-[11px] font-semibold text-[var(--pos-ink-3)]">
                                                            Free
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </PageBody>
            </Page>
        );
    }

    /* ── the order pad ────────────────────────────────────── */

    const freeTables = tables.filter(t => t.status === 'FREE');
    const billable = lines.filter(l => Number(l.qty) - Number(l.billedQty) > 0);

    return (
        <Page>
            <PageHeader
                icon={UtensilsCrossed}
                title={order?.tableCode ? `Table ${order.tableCode}` : 'Order'}
                subtitle={`${order?.orderNo || ''}${order?.waiter ? ` · ${order.waiter}` : ''}`}
                meta={<HeaderStat label="Running total" value={money(runningTotal)} />}
                actions={
                    <>
                        <Button icon={X} onClick={backToFloor}>Back to floor</Button>
                        <Button variant="primary" icon={Send} loading={busy} onClick={sendToKitchen}>
                            Send to kitchen
                        </Button>
                    </>
                }
            />
            <PageBody className="flex flex-col gap-3">
                {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}
                {notice && <Banner tone="ok" onClose={() => setNotice('')}>{notice}</Banner>}

                <Card className="shrink-0" bodyClassName="!py-2">
                    <div className="relative">
                        <SearchInput ref={searchRef} value={search}
                            onChange={e => setSearch(e.target.value)}
                            onClear={() => setSearch('')}
                            placeholder="Type a dish name or code…" />
                        {matches.length > 0 && (
                            <div className="absolute z-40 left-0 right-0 top-[38px] bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[var(--pos-r)] shadow-[var(--pos-shadow-lg)] max-h-72 overflow-auto">
                                {matches.map(m => (
                                    <button key={m.code} type="button"
                                        onMouseDown={e => { e.preventDefault(); addItem(m); }}
                                        className="w-full flex items-center justify-between px-3 py-2 text-left border-b border-[var(--pos-line)] hover:bg-[var(--pos-sunk)]">
                                        <span className="font-semibold text-[13px] text-[var(--pos-ink)]">{m.itemName}</span>
                                        <span className="font-bold text-[13px] text-[var(--pos-ink-2)]">{money(m.salesRate)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </Card>

                <Card flush className="flex-1 min-h-0 overflow-auto pos-scroll">
                    {lines.length === 0 ? (
                        <EmptyState icon={Search} title="Nothing ordered yet"
                            hint="Search for a dish above to start the order." />
                    ) : (
                        <div className="divide-y divide-[var(--pos-line)]">
                            {lines.map((l, i) => {
                                const left = Number(l.qty) - Number(l.billedQty);
                                return (
                                    <div key={l.lineId || `n${i}`} className="flex items-start gap-3 px-3 py-2">
                                        {splitMode && (
                                            <Input numeric inputMode="decimal"
                                                className="!w-16 shrink-0"
                                                value={splitQty[l.lineId] ?? ''}
                                                placeholder={String(left)}
                                                disabled={!l.lineId || left <= 0}
                                                onChange={e => setSplitQty(p => ({ ...p, [l.lineId]: e.target.value }))} />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-[13px] text-[var(--pos-ink)] truncate">
                                                    {l.itemName}
                                                </span>
                                                {Number(l.sentQty) > 0 && (
                                                    <Badge tone="ok">{l.sentQty} in kitchen</Badge>
                                                )}
                                                {Number(l.billedQty) > 0 && (
                                                    <Badge tone="neutral">{l.billedQty} billed</Badge>
                                                )}
                                            </div>
                                            <Input value={l.notes || ''}
                                                placeholder="No onion, less spicy…"
                                                className="!h-7 !text-[11.5px] mt-1"
                                                onChange={e => setNote(i, e.target.value)} />
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button size="sm" variant="ghost" icon={Minus}
                                                disabled={Number(l.qty) <= Number(l.billedQty)}
                                                onClick={() => bump(i, -1)} />
                                            <span className="w-8 text-center font-black text-[15px] text-[var(--pos-ink)]">
                                                {l.qty}
                                            </span>
                                            <Button size="sm" variant="ghost" icon={Plus} onClick={() => bump(i, +1)} />
                                        </div>
                                        <div className="w-20 text-right font-bold text-[13px] text-[var(--pos-ink)] shrink-0">
                                            {money(Number(l.qty) * Number(l.rate))}
                                        </div>
                                        <Button size="sm" variant="ghost" icon={Trash2}
                                            disabled={Number(l.billedQty) > 0}
                                            onClick={() => dropLine(i)} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>

                <div className="shrink-0 flex items-center gap-2 flex-wrap">
                    {freeTables.length > 0 && (
                        <>
                            <ArrowRightLeft size={14} className="text-[var(--pos-ink-3)]" />
                            <Select value="" onChange={e => e.target.value && moveTo(e.target.value)} className="w-40">
                                <option value="">Move to table…</option>
                                {freeTables.map(t => <option key={t.id} value={t.id}>{t.code}</option>)}
                            </Select>
                        </>
                    )}
                    <Button onClick={cancelOrder} disabled={busy}>Cancel order</Button>
                    <div className="flex-1" />
                    <Button onClick={() => { setSplitMode(v => !v); setSplitQty({}); }}
                        disabled={billable.length === 0}>
                        {splitMode ? 'Bill everything instead' : 'Split bill'}
                    </Button>
                    <Button variant="primary" icon={Receipt} loading={busy}
                        disabled={billable.length === 0} onClick={bill}>
                        {splitMode ? 'Bill selected' : `Bill ${money(runningTotal)}`}
                    </Button>
                </div>
            </PageBody>
        </Page>
    );
}
