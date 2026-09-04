"use client";
/**
 * Top bar.
 *
 * Left to right: which outlet, global search, the one primary action, then the
 * quiet controls.
 *
 * There is deliberately NO business-type switcher here. Which kind of business
 * this installation serves is a setup decision made once in Settings, not a
 * control the operator flips at the counter.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import GlobalSearch from './global-search';
import { ChevronDown, Check, Store, Moon, Sun, Plus, LogOut, User as UserIcon } from 'lucide-react';
import { useBusinessProfile } from './profile';
import { roleLabel } from './permissions';

const cx = (...a) => a.filter(Boolean).join(' ');

/** Close on outside click and Escape — one hook so every menu behaves the same. */
function useDismiss(open, close) {
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('mousedown', onDoc);
        window.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('keydown', onKey); };
    }, [open, close]);
    return ref;
}

/* ── which outlet this terminal belongs to ── */
function OutletSwitcher({ outlets = [], activeCompany }) {
    const { outlet, setOutlet } = useBusinessProfile();
    const [open, setOpen] = useState(false);
    const ref = useDismiss(open, useCallback(() => setOpen(false), []));

    const list = outlets.length ? outlets : [{ id: 'main', name: activeCompany?.name || 'Main Outlet' }];
    const current = outlet || list[0];

    return (
        <div ref={ref} className="relative hidden lg:block">
            <button type="button" onClick={() => setOpen(v => !v)}
                aria-haspopup="listbox" aria-expanded={open}
                className="pos-focusable flex items-center gap-2 h-[42px] px-2.5 rounded-[8px] hover:bg-[var(--pos-sunk)] transition-colors max-w-[220px]">
                <Store size={15} className="text-[var(--pos-ink-3)] shrink-0" />
                <span className="text-[13px] font-medium text-[var(--pos-ink)] truncate">{current.name}</span>
                <ChevronDown size={14} className={cx('shrink-0 text-[var(--pos-ink-3)] transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
                <div role="listbox" className="absolute left-0 top-full mt-1.5 z-50 w-[250px] rounded-[10px] border border-[var(--pos-line)] bg-[var(--pos-surface)] shadow-[var(--pos-shadow-lg)] overflow-hidden">
                    {list.map(o => (
                        <button key={o.id} type="button" role="option" aria-selected={o.id === current.id}
                            onClick={() => { setOutlet(o); setOpen(false); }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] hover:bg-[var(--pos-hover)] border-b border-[var(--pos-line-soft)] last:border-b-0">
                            <Store size={14} className="text-[var(--pos-ink-3)] shrink-0" />
                            <span className="flex-1 truncate text-[var(--pos-ink)]">{o.name}</span>
                            {o.id === current.id && <Check size={14} className="text-[var(--pos-ink)] shrink-0" />}
                        </button>
                    ))}
                    {outlets.length === 0 && (
                        <p className="px-3.5 py-2 text-[11px] text-[var(--pos-ink-3)] bg-[var(--pos-sunk)]">
                            Multiple outlets arrive with branch support.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

/* ── user ── */
function UserMenu({ session, onLogout, onOpenProfile }) {
    const [open, setOpen] = useState(false);
    const ref = useDismiss(open, useCallback(() => setOpen(false), []));
    const initials = (session?.displayName || session?.username || 'A')
        .split(/[\s@.]+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase();

    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => setOpen(v => !v)}
                aria-haspopup="menu" aria-expanded={open}
                className="pos-focusable flex items-center gap-2.5 h-[42px] pl-1.5 pr-2 rounded-[8px] hover:bg-[var(--pos-sunk)] transition-colors">
                <span aria-hidden className="grid place-items-center w-[30px] h-[30px] rounded-full text-white text-[11px] font-bold shrink-0"
                      style={{ background: 'var(--pos-ink-2)' }}>
                    {initials}
                </span>
                <span className="hidden xl:block text-left min-w-0">
                    <span className="block text-[12.5px] font-semibold text-[var(--pos-ink)] leading-tight truncate max-w-[130px]">
                        {session?.displayName || session?.username}
                    </span>
                    <span className="block text-[10.5px] text-[var(--pos-ink-3)] leading-tight truncate">{roleLabel(session)}</span>
                </span>
                <ChevronDown size={14} className="hidden xl:block shrink-0 text-[var(--pos-ink-3)]" />
            </button>

            {open && (
                <div role="menu" className="absolute right-0 top-full mt-1.5 z-50 w-[220px] rounded-[10px] border border-[var(--pos-line)] bg-[var(--pos-surface)] shadow-[var(--pos-shadow-lg)] overflow-hidden">
                    <div className="px-3.5 py-2.5 border-b border-[var(--pos-line-soft)]">
                        <p className="text-[12.5px] font-semibold text-[var(--pos-ink)] truncate">{session?.displayName || session?.username}</p>
                        <p className="text-[11px] text-[var(--pos-ink-3)] truncate">{session?.username}</p>
                    </div>
                    <button type="button" role="menuitem" onClick={() => { setOpen(false); onOpenProfile(); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] text-[var(--pos-ink)] hover:bg-[var(--pos-hover)]">
                        <UserIcon size={14} className="text-[var(--pos-ink-3)]" /> My account &amp; password
                    </button>
                    <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout(); }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] border-t border-[var(--pos-line-soft)] hover:bg-[var(--pos-danger-soft)]"
                        style={{ color: 'var(--pos-danger)' }}>
                        <LogOut size={14} /> Sign out
                    </button>
                </div>
            )}
        </div>
    );
}

/* ── the bar ── */
export default function TopBar({
    session, activeCompany, outlets, onLogout, onOpenProfile,
    onPrimaryAction, onNavigate, quickCreate,
}) {
    const [dark, setDark] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('pos_theme');
            const isDark = saved ? saved === 'dark'
                : window.matchMedia('(prefers-color-scheme: dark)').matches;
            setDark(isDark);
            document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } catch { /* private mode */ }
    }, []);

    const toggleTheme = useCallback(() => {
        setDark(d => {
            const next = !d;
            document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
            try { localStorage.setItem('pos_theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
            return next;
        });
    }, []);

    return (
        <header className="h-[62px] shrink-0 flex items-center gap-2 px-3 bg-[var(--pos-surface)] border-b border-[var(--pos-line)]"
                style={{ fontFamily: 'var(--pos-font)' }}>

            <OutletSwitcher outlets={outlets} activeCompany={activeCompany} />

            <div className="flex-1 min-w-0 px-2 hidden md:block">
                <GlobalSearch onNavigate={onNavigate} />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto md:ml-0">
                <button type="button" onClick={onPrimaryAction}
                    className="pos-focusable flex items-center gap-2 h-[38px] px-3.5 rounded-[8px] border text-[13px] font-semibold transition-colors"
                    style={{ background: 'var(--pos-surface)', borderColor: 'var(--pos-line)', color: 'var(--pos-ink)' }}>
                    <Plus size={15} strokeWidth={2.4} />
                    <span className="hidden sm:inline">New sale</span>
                </button>

                {quickCreate}

                <button type="button" onClick={toggleTheme}
                    title={dark ? 'Switch to light' : 'Switch to dark'}
                    className="pos-focusable grid place-items-center w-9 h-9 rounded-[8px] text-[var(--pos-ink-2)] hover:bg-[var(--pos-sunk)]">
                    {dark ? <Sun size={16} /> : <Moon size={16} />}
                </button>

                <UserMenu session={session} onLogout={onLogout} onOpenProfile={onOpenProfile} />
            </div>
        </header>
    );
}
