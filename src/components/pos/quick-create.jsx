"use client";
/**
 * Global quick-create menu — the "+" in the top bar.
 *
 * Replaces the fixed "+ New Sale" button. A single hard-coded CTA is wrong on a
 * multi-module product: on the Item screen it offered to start a sale, which is
 * not what anyone standing on that screen wants. Zoho Books solves this with one
 * global "+" that lists every record you can create, grouped by area, and that is
 * what this is.
 *
 * Entries are filtered by the signed-in user's permissions, and entries whose
 * backend does not exist yet are marked `planned` — they render disabled with a
 * reason instead of silently doing nothing.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { canOpenScreen } from './permissions';

const cx = (...a) => a.filter(Boolean).join(' ');

/**
 * screen  — the dashboard tab to open
 * planned — no server backend yet; shown disabled with `why`
 */
export const QUICK_CREATE = [
    {
        group: 'Sales',
        items: [
            { label: 'Sale / Bill',      screen: 'pos' },
            { label: 'Token',            screen: 'token' },
            { label: 'Customer',         screen: 'customers' },
            { label: 'Receipt',          screen: 'receipt' },
            { label: 'Quotation',        screen: 'pos', planned: true, why: 'Needs a server backend — not built yet' },
            { label: 'Delivery Challan', screen: 'pos', planned: true, why: 'Needs a server backend — not built yet' },
            { label: 'Sales Return',     screen: 'pos', planned: true, why: 'Server is ready; the screen is not built yet' },
        ],
    },
    {
        group: 'Purchases',
        items: [
            { label: 'Purchase Bill',    screen: 'purchase' },
            { label: 'Purchase Return',  screen: 'purchase-return' },
            { label: 'Payment',          screen: 'payment' },
            { label: 'Purchase Order',   screen: 'purchase', planned: true, why: 'Server is ready; the screen is not built yet' },
            { label: 'Goods Receipt',    screen: 'purchase', planned: true, why: 'Needs a server backend — not built yet' },
        ],
    },
    {
        group: 'Inventory',
        items: [
            { label: 'Item',             screen: 'itemmaster' },
            { label: 'Category',         screen: 'category' },
            { label: 'Stock Adjustment', screen: 'stock-adjustment' },
            { label: 'Barcode Label',    screen: 'barcode' },
        ],
    },
    {
        group: 'General',
        items: [
            { label: 'User',             screen: 'users' },
            { label: 'Ledger Account',   screen: 'ledger' },
        ],
    },
];

export default function QuickCreate({ permissions, onNavigate }) {
    const [open, setOpen] = useState(false);
    const boxRef = useRef(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        window.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
    }, [open]);

    // Hide anything the role cannot reach, then drop groups left empty.
    const groups = useMemo(() => QUICK_CREATE
        .map(g => ({ ...g, items: g.items.filter(i => canOpenScreen(permissions, i.screen)) }))
        .filter(g => g.items.length > 0), [permissions]);

    const go = (item) => {
        if (item.planned) return;
        setOpen(false);
        onNavigate(item.screen);
    };

    return (
        <div ref={boxRef} className="relative">
            <button type="button" onClick={() => setOpen(v => !v)}
                aria-haspopup="menu" aria-expanded={open} title="Create new (N)"
                className="pos-focusable grid place-items-center w-9 h-9 rounded-lg border border-[var(--pos-line)] bg-[var(--pos-surface)] text-[var(--pos-ink-2)] hover:bg-[var(--pos-hover)] hover:text-[var(--pos-ink)] transition">
                {open ? <X size={17} /> : <Plus size={17} />}
            </button>

            {open && (
                <div role="menu"
                     className="absolute right-0 top-full mt-2 z-50 w-[min(560px,calc(100vw-32px))] bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[var(--pos-r-lg)] shadow-[var(--pos-shadow-lg)] overflow-hidden"
                     style={{ fontFamily: 'var(--pos-font)' }}>
                    <div className="pos-scroll max-h-[70vh] p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        {groups.map(g => (
                            <div key={g.group}>
                                <h3 className="text-[10.5px] font-bold uppercase tracking-[.09em] text-[var(--pos-ink-3)] mb-1.5">{g.group}</h3>
                                <ul className="flex flex-col">
                                    {g.items.map(i => (
                                        <li key={g.group + i.label}>
                                            <button type="button" role="menuitem"
                                                disabled={i.planned}
                                                title={i.planned ? i.why : undefined}
                                                onClick={() => go(i)}
                                                className={cx(
                                                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[13px]',
                                                    i.planned
                                                        ? 'text-[var(--pos-ink-3)] cursor-not-allowed'
                                                        : 'pos-focusable text-[var(--pos-ink)] hover:bg-[var(--pos-hover)]',
                                                )}>
                                                <Plus size={13} className={i.planned ? 'opacity-40' : 'text-[var(--pos-ink-3)]'} />
                                                <span className="flex-1 min-w-0 truncate">{i.label}</span>
                                                {i.planned && (
                                                    <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-[.07em] px-1.5 py-0.5 rounded bg-[var(--pos-sunk)] text-[var(--pos-ink-3)]">
                                                        Planned
                                                    </span>
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                    <p className="px-4 py-2 border-t border-[var(--pos-line-soft)] bg-[var(--pos-sunk)] text-[11px] text-[var(--pos-ink-3)]">
                        Entries marked <b className="text-[var(--pos-ink-2)]">Planned</b> have no screen yet — see docs/PAGE_SPEC.md.
                    </p>
                </div>
            )}
        </div>
    );
}
