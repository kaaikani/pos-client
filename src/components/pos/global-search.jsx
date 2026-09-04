"use client";
/**
 * Global search — items, bills and customers from one box.
 *
 * The top bar used to render a search input whose `onSearch` prop was never
 * passed by the dashboard, so typing in it did nothing at all. A control that
 * looks live and isn't is worse than no control: the operator types, nothing
 * happens, and they stop trusting the rest of the screen.
 *
 * Search runs against data the app already caches (items, sales, ledger parties),
 * so a keystroke costs nothing on the server. Enter or click opens the record's
 * screen; Escape closes.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Package, Receipt, Users, Truck, CornerDownLeft } from 'lucide-react';
import { ListItemsQuery, ListSalesQuery } from '../../core/queries/pharma.query';
import { LedgerPartiesQuery } from '../../core/queries/ledger.query';

const cx = (...a) => a.filter(Boolean).join(' ');
const MAX_PER_GROUP = 4;

const KINDS = {
    item: { icon: Package, label: 'Item', screen: 'itemmaster' },
    bill: { icon: Receipt, label: 'Bill', screen: 'pos' },
    party: { icon: Users, label: 'Customer', screen: 'ledger' },
    supplier: { icon: Truck, label: 'Supplier', screen: 'ledger' },
};

export default function GlobalSearch({ onNavigate }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [data, setData] = useState({ items: [], bills: [], parties: [], suppliers: [] });
    const [sel, setSel] = useState(0);
    const inputRef = useRef(null);
    const boxRef = useRef(null);

    /* Ctrl/Cmd+K focuses search — the shortcut every operator already knows. */
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
                inputRef.current?.select();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    /* Loaded once on first use, then served from the query cache. */
    const ensureData = useCallback(async () => {
        if (data.items.length || data.bills.length || data.parties.length || data.suppliers.length) return;
        const [items, bills, parties, suppliers] = await Promise.all([
            new ListItemsQuery().execute().catch(() => []),
            new ListSalesQuery().execute().catch(() => []),
            new LedgerPartiesQuery().execute('CUSTOMER').catch(() => []),
            new LedgerPartiesQuery().execute('SUPPLIER').catch(() => []),
        ]);
        setData({ items: items || [], bills: bills || [], parties: parties || [], suppliers: suppliers || [] });
    }, [data]);

    const results = useMemo(() => {
        const s = q.trim().toLowerCase();
        if (s.length < 2) return [];
        const hit = (v) => String(v ?? '').toLowerCase().includes(s);
        const out = [];
        for (const it of data.items) {
            if (out.filter(r => r.kind === 'item').length >= MAX_PER_GROUP) break;
            if (hit(it.itemName) || hit(it.code) || hit(it.barcode)) {
                out.push({ kind: 'item', id: it.id, title: it.itemName, sub: it.code || it.barcode || '' });
            }
        }
        for (const b of data.bills) {
            if (out.filter(r => r.kind === 'bill').length >= MAX_PER_GROUP) break;
            if (hit(b.billNo) || hit(b.customerName)) {
                out.push({ kind: 'bill', id: b.id, title: `Bill ${b.billNo}`, sub: b.customerName || 'Walk-in' });
            }
        }
        for (const p of data.parties) {
            if (out.filter(r => r.kind === 'party').length >= MAX_PER_GROUP) break;
            if (hit(p.partyName) || hit(p.contactNumber)) {
                out.push({ kind: 'party', id: p.partyName, title: p.partyName, sub: p.contactNumber || '' });
            }
        }
        for (const p of data.suppliers) {
            if (out.filter(r => r.kind === 'supplier').length >= MAX_PER_GROUP) break;
            if (hit(p.partyName) || hit(p.contactNumber)) {
                out.push({ kind: 'supplier', id: p.partyName, title: p.partyName, sub: p.contactNumber || '' });
            }
        }
        return out;
    }, [q, data]);

    const go = useCallback((r) => {
        if (!r) return;
        setOpen(false);
        setQ('');
        onNavigate?.(KINDS[r.kind].screen);
    }, [onNavigate]);

    const onKeyDown = (e) => {
        if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
        if (!results.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(results.length - 1, s + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); go(results[sel]); }
    };

    return (
        <div ref={boxRef} className="relative max-w-[440px] mx-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pos-ink-3)] pointer-events-none" />
            <input
                ref={inputRef}
                id="global-search"
                name="globalSearch"
                type="search"
                autoComplete="off"
                placeholder="Search items, bills, customers…"
                value={q}
                onFocus={() => { ensureData(); setOpen(true); }}
                onChange={e => { setQ(e.target.value); setSel(0); setOpen(true); }}
                onKeyDown={onKeyDown}
                className="pos-input !h-[38px] !pl-9 !pr-[52px] !rounded-[8px] !bg-[var(--pos-sunk)]"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-[var(--pos-line)] bg-[var(--pos-surface)] text-[10px] font-semibold text-[var(--pos-ink-3)] pointer-events-none"
                 style={{ fontFamily: 'var(--pos-mono)' }}>
                Ctrl K
            </kbd>

            {open && q.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-[10px] border border-[var(--pos-line)] bg-[var(--pos-surface)] shadow-[var(--pos-shadow-lg)] overflow-hidden">
                    {results.length === 0 ? (
                        <p className="px-3.5 py-3 text-[12.5px] text-[var(--pos-ink-3)]">
                            Nothing matches “{q.trim()}”.
                        </p>
                    ) : (
                        <div className="pos-scroll max-h-[320px]">
                            {results.map((r, i) => {
                                const K = KINDS[r.kind];
                                const Icon = K.icon;
                                return (
                                    <button
                                        key={`${r.kind}-${r.id}-${i}`}
                                        type="button"
                                        onMouseEnter={() => setSel(i)}
                                        onClick={() => go(r)}
                                        className={cx(
                                            'w-full flex items-center gap-2.5 px-3.5 py-2 text-left border-b border-[var(--pos-line-soft)] last:border-b-0',
                                            i === sel ? 'bg-[var(--pos-select)]' : 'hover:bg-[var(--pos-hover)]',
                                        )}
                                    >
                                        <Icon size={14} className="shrink-0 text-[var(--pos-ink-3)]" />
                                        <span className="flex-1 min-w-0">
                                            <span className="block truncate text-[13px] font-medium text-[var(--pos-ink)]">{r.title}</span>
                                            {r.sub && (
                                                <span className="block truncate text-[11.5px] text-[var(--pos-ink-3)]">{r.sub}</span>
                                            )}
                                        </span>
                                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[.05em] text-[var(--pos-ink-3)]">
                                            {K.label}
                                        </span>
                                        {i === sel && <CornerDownLeft size={12} className="shrink-0 text-[var(--pos-ink-3)]" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
