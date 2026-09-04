"use client";
/**
 * Application sidebar.
 *
 * Grouped navigation, not a flat list of twenty buttons. The groups match how a
 * business is actually organised — Sales, Purchase, Inventory, Contacts, Accounts,
 * Reports — so a cashier finds billing without reading past stock adjustment.
 *
 * Restrained on purpose: one surface, one accent, solid text colours. The previous
 * sidebar gave every item its own gradient and set labels with opacity — that is
 * what made it read as a toy and left the group headers unreadable.
 *
 * Every entry is permission-gated; a group with nothing visible disappears.
 */
import React, { useMemo } from 'react';
import {
    LayoutDashboard, ShoppingBag, Undo2, FileText as Quote, ShoppingCart, Package,
    Boxes, Sliders, ArrowLeftRight, Users, Truck, BookOpen, Wallet, Receipt,
    BarChart3, Settings, Hash, ScanLine, Grid, Percent, LogOut, PanelLeftClose, PanelLeft,
} from 'lucide-react';
import { canOpenScreen, roleLabel } from './permissions';
import { Brand, Mark } from './brand';

/**
 * `planned: true` marks a screen with no backend yet — it renders greyed with a
 * reason rather than pretending to work.
 */
export const NAV_GROUPS = [
    {
        group: null,                       // ungrouped, sits at the top
        items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
        group: 'Sales',
        items: [
            { id: 'pos',            label: 'POS / New Sale', icon: ShoppingBag },
            { id: 'token',          label: 'Token Entry',    icon: Hash },
            { id: 'sales-return',   label: 'Sales Return',   icon: Undo2,  planned: 'Server is ready — screen not built yet' },
            { id: 'quotation',      label: 'Quotations',     icon: Quote,  planned: 'Needs a server backend' },
        ],
    },
    {
        group: 'Purchase',
        items: [
            { id: 'purchase',        label: 'Purchase',        icon: ShoppingCart },
            { id: 'purchase-return', label: 'Purchase Return', icon: Undo2 },
        ],
    },
    {
        group: 'Inventory',
        items: [
            { id: 'itemmaster',       label: 'Items',            icon: Package },
            { id: 'category',         label: 'Categories',       icon: Grid },
            { id: 'inventory',        label: 'Stock',            icon: Boxes },
            { id: 'stock-adjustment', label: 'Stock Adjustment', icon: Sliders },
            { id: 'stock-transfer',   label: 'Stock Transfer',   icon: ArrowLeftRight, planned: 'Needs a server backend' },
            { id: 'barcode',          label: 'Barcode',          icon: ScanLine },
            { id: 'tax-master',       label: 'Tax Master',       icon: Percent },
        ],
    },
    {
        group: 'Contacts',
        items: [
            { id: 'customers', label: 'Customers', icon: Users },
            { id: 'suppliers', label: 'Suppliers', icon: Truck, planned: 'Suppliers live inside Ledger today' },
        ],
    },
    {
        group: 'Accounts',
        items: [
            { id: 'ledger',  label: 'Ledger',   icon: BookOpen },
            { id: 'receipt', label: 'Receipts', icon: Receipt },
            { id: 'payment', label: 'Payments', icon: Wallet },
        ],
    },
    {
        group: 'Reports',
        items: [{ id: 'report', label: 'Reports', icon: BarChart3 }],
    },
    {
        group: null,
        items: [
            { id: 'users',    label: 'Users & Roles', icon: Users },
            { id: 'settings', label: 'Settings',      icon: Settings },
        ],
    },
];

export default function Sidebar({
    activeTab, onNavigate, permissions, session,
    financialYear, collapsed, onToggleCollapse, onLogout, onOpenProfile,
}) {
    const groups = useMemo(() => NAV_GROUPS
        .map(g => ({ ...g, items: g.items.filter(i => i.planned || canOpenScreen(permissions, i.id)) }))
        .filter(g => g.items.length > 0), [permissions]);

    const initials = (session?.displayName || session?.username || 'A')
        .split(/[\s@.]+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase();

    return (
        <aside
            className={`shrink-0 flex flex-col h-full border-r overflow-hidden transition-[width] duration-200 ease-out ${collapsed ? 'w-[62px]' : 'w-[228px]'}`}
            style={{ background: 'var(--pos-nav)', borderColor: 'var(--pos-nav-line)', fontFamily: 'var(--pos-font)' }}
        >
            {/* brand */}
            <div className="shrink-0 flex items-center gap-2 h-[58px] px-3 border-b" style={{ borderColor: 'var(--pos-nav-line)' }}>
                {collapsed ? (
                    <Mark size={26} tone="dark" className="mx-auto" />
                ) : (
                    <div className="min-w-0 flex-1">
                        <Brand layout="row" tone="dark" markSize={26} wordSize={14} />
                        <div className="text-[9px] tracking-[.16em] uppercase mt-0.5 pl-[34px]" style={{ color: 'var(--pos-nav-ink-2)' }}>
                            {financialYear || ''}
                        </div>
                    </div>
                )}
            </div>

            {/* navigation */}
            <nav className="pos-scroll flex-1 min-h-0 py-2.5 px-2.5">
                {groups.map((g, gi) => {
                    return (
                        <div key={g.group || `g${gi}`} className={gi ? '' : ''}>
                            {g.group && gi > 0 && (
                                <div className="my-2 mx-2.5 border-t" style={{ borderColor: 'var(--pos-nav-line)' }} />
                            )}

                            {g.items.map(item => {
                                const Icon = item.icon;
                                const active = activeTab === item.id;
                                const disabled = !!item.planned;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        disabled={disabled}
                                        title={collapsed ? (item.planned ? `${item.label} — ${item.planned}` : item.label) : item.planned || undefined}
                                        onClick={() => !disabled && onNavigate(item.id)}
                                        className={`pos-focusable w-full flex items-center gap-2.5 h-[36px] rounded-[6px] text-[13px] transition-colors ${
                                            collapsed ? 'justify-center px-0' : 'px-2.5'
                                        } ${disabled ? 'cursor-not-allowed' : ''}`}
                                        style={{
                                            background: active ? 'var(--pos-nav-active-bg)' : 'transparent',
                                            color: active ? 'var(--pos-nav-active)' : disabled ? 'var(--pos-muted)' : 'var(--pos-nav-ink)',
                                            fontWeight: active ? 600 : 450,
                                            boxShadow: active ? 'inset 2px 0 0 var(--pos-nav-rail)' : 'none',
                                        }}
                                        onMouseEnter={e => { if (!active && !disabled) e.currentTarget.style.background = 'var(--pos-hover)'; }}
                                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                                    >
                                        <Icon size={17} strokeWidth={active ? 2.1 : 1.7}
                                              style={{ color: active ? 'var(--pos-nav-active)' : 'inherit', flexShrink: 0 }} />
                                        {!collapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                                        {!collapsed && disabled && (
                                            <span className="text-[8.5px] font-semibold tracking-[.06em] uppercase px-1 py-px rounded"
                                                  style={{ background: 'var(--pos-sunk)', color: 'var(--pos-ink-3)' }}>
                                                Soon
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </nav>

            {/* footer: user + collapse */}
            <div className="shrink-0 border-t px-2 py-2" style={{ borderColor: 'var(--pos-nav-line)' }}>
                <div className={`flex items-center gap-2 rounded-[6px] p-1.5 ${collapsed ? 'justify-center' : ''}`}
                     style={{ background: 'var(--pos-nav-sunk)' }}>
                    <button type="button" onClick={onOpenProfile} title="Account settings"
                        className="pos-focusable grid place-items-center w-8 h-8 rounded-full text-[11px] font-bold text-white shrink-0"
                        style={{ background: 'var(--pos-ink-2)' }}>
                        {initials}
                    </button>
                    {!collapsed && (
                        <>
                            <button type="button" onClick={onOpenProfile}
                                className="pos-focusable flex-1 min-w-0 text-left rounded">
                                <span className="block text-[12px] font-semibold truncate" style={{ color: 'var(--pos-nav-active)' }}>{session?.displayName || session?.username}</span>
                                <span className="block text-[10px] truncate" style={{ color: 'var(--pos-nav-ink-2)' }}>{roleLabel(session)}</span>
                            </button>
                            <button type="button" onClick={onLogout} title="Sign out"
                                className="pos-focusable grid place-items-center w-7 h-7 rounded shrink-0"
                                style={{ color: 'var(--pos-ink-3)' }}
                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--pos-danger)'; e.currentTarget.style.background = 'var(--pos-danger-soft)'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--pos-ink-3)'; e.currentTarget.style.background = 'transparent'; }}>
                                <LogOut size={14} />
                            </button>
                        </>
                    )}
                </div>

                <button type="button" onClick={onToggleCollapse}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className={`pos-focusable mt-1.5 w-full flex items-center gap-2 h-[28px] rounded-[5px] text-[11.5px] ${collapsed ? 'justify-center px-0' : 'px-2.5'}`}
                    style={{ color: 'var(--pos-ink-3)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--pos-hover)'; e.currentTarget.style.color = 'var(--pos-ink)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--pos-ink-3)'; }}>
                    {collapsed ? <PanelLeft size={14} /> : <><PanelLeftClose size={14} /> <span>Collapse</span></>}
                </button>
            </div>
        </aside>
    );
}
