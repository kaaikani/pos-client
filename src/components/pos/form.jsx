"use client";
/**
 * Dense business-form primitives, matching the layout conventions used by
 * Zoho Books / Billing / Inventory.
 *
 * The key difference from the generic grid form: labels sit to the LEFT of the
 * control in a fixed column, not stacked above it. On a long business form that
 * is what makes the page scannable — the eye runs down a single label column
 * instead of zig-zagging through a grid.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

const cx = (...a) => a.filter(Boolean).join(' ');

/** One label + control row. `wide` doubles the control width for names/addresses. */
export function FormRow({ label, required, hint, error, children, wide, labelWidth = 170 }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 py-2">
            {label && (
                <label className="shrink-0 pt-1.5 text-[12.5px] leading-tight text-[var(--pos-ink-2)]"
                       style={{ width: labelWidth }}>
                    {label}{required && <span className="text-[var(--pos-danger)] ml-0.5">*</span>}
                </label>
            )}
            <div className={cx('min-w-0', wide ? 'w-full sm:max-w-[560px]' : 'w-full sm:max-w-[340px]')}>
                {children}
                {error
                    ? <p className="mt-1 text-[11.5px] font-medium text-[var(--pos-danger)]">{error}</p>
                    : hint ? <p className="mt-1 text-[11.5px] text-[var(--pos-ink-3)]">{hint}</p> : null}
            </div>
        </div>
    );
}

/** Two independent columns of FormRows — how Zoho splits Sales / Purchase info. */
export function FormColumns({ children, className }) {
    return <div className={cx('grid grid-cols-1 lg:grid-cols-2 gap-x-10', className)}>{children}</div>;
}

/** A block that can be switched off entirely, like Zoho's "Sales Information". */
export function ToggleSection({ label, checked, onChange, children }) {
    return (
        <div className="py-4">
            <label className="inline-flex items-center gap-2 mb-2.5 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
                    className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                <span className="text-[14px] font-semibold text-[var(--pos-ink)]">{label}</span>
            </label>
            {checked && <div className="sm:pl-[23px]">{children}</div>}
        </div>
    );
}

/** Radio row — Zoho's Goods / Service selector. */
export function RadioRow({ value, onChange, options, name }) {
    return (
        <div role="radiogroup" aria-label={name} className="flex flex-wrap items-center gap-5 h-[32px]">
            {options.map(o => {
                const v = typeof o === 'string' ? o : o.value;
                const l = typeof o === 'string' ? o : o.label;
                return (
                    <label key={v} className="inline-flex items-center gap-1.5 cursor-pointer text-[13px] font-medium text-[var(--pos-ink)]">
                        <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)}
                            className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                        {l}
                    </label>
                );
            })}
        </div>
    );
}

/** Currency-prefixed money input — Zoho's "INR [____]". */
export const MoneyInput = React.forwardRef(function MoneyInput({ currency = 'INR', className, ...p }, ref) {
    return (
        <div className={cx('flex', className)}>
            <span className="grid place-items-center h-[var(--pos-h)] px-2.5 text-[12px] font-semibold text-[var(--pos-ink-2)] bg-[var(--pos-sunk)] border border-r-0 border-[var(--pos-line)] rounded-l-[var(--pos-r-sm)]">
                {currency}
            </span>
            <input ref={ref} type="number" step="any" className="pos-input pos-input--num !rounded-l-none" {...p} />
        </div>
    );
});

/**
 * Dropdown with a search box inside and an optional action link at the bottom
 * ("Configure Units"). A plain select cannot search, so any list longer than
 * roughly ten entries should use this instead.
 */
export function SearchSelect({ value, onChange, options, placeholder = 'Select', footer, disabled, invalid }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const boxRef = useRef(null);
    const inputRef = useRef(null);

    const norm = useMemo(
        () => (options || []).map(o => (typeof o === 'string' ? { value: o, label: o } : o)),
        [options],
    );
    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s ? norm.filter(o => String(o.label).toLowerCase().includes(s)) : norm;
    }, [norm, q]);
    const current = norm.find(o => o.value === value);

    useEffect(() => {
        if (!open) return;
        inputRef.current?.focus();
        const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const pick = (o) => { onChange(o.value); setOpen(false); setQ(''); };

    return (
        <div ref={boxRef} className="relative">
            <button type="button" disabled={disabled}
                onClick={() => setOpen(v => !v)}
                onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); setOpen(true); } }}
                className={cx('pos-input flex items-center justify-between gap-2 text-left', invalid && 'is-invalid')}>
                <span className={cx('truncate', !current && 'text-[var(--pos-ink-3)] font-normal')}>
                    {current ? current.label : placeholder}
                </span>
                <ChevronDown size={14} className={cx('shrink-0 text-[var(--pos-ink-3)] transition-transform', open && 'rotate-180')} />
            </button>

            {open && (
                <div className="absolute z-40 left-0 right-0 mt-1 bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[var(--pos-r)] shadow-[var(--pos-shadow-lg)] overflow-hidden">
                    <div className="p-1.5 border-b border-[var(--pos-line-soft)]">
                        <input ref={inputRef} value={q}
                            onChange={e => { setQ(e.target.value); setSel(0); }}
                            onKeyDown={e => {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(shown.length - 1, s + 1)); }
                                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
                                else if (e.key === 'Enter') { e.preventDefault(); if (shown[sel]) pick(shown[sel]); }
                                else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
                            }}
                            placeholder="Search"
                            className="pos-input !h-[28px] !text-[12.5px]" />
                    </div>
                    <div className="pos-scroll max-h-[220px]">
                        {shown.length === 0 && <p className="px-3 py-3 text-[12px] text-[var(--pos-ink-3)]">No match</p>}
                        {shown.map((o, i) => (
                            <button key={o.value} type="button"
                                onMouseEnter={() => setSel(i)} onClick={() => pick(o)}
                                className={cx('w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] font-medium',
                                    i === sel ? 'bg-[var(--pos-select)] text-[var(--pos-ink)]' : 'text-[var(--pos-ink)] hover:bg-[var(--pos-hover)]')}>
                                <span className="truncate">{o.label}</span>
                                {o.value === value && <Check size={13} className="shrink-0" />}
                            </button>
                        ))}
                    </div>
                    {footer && <div className="border-t border-[var(--pos-line-soft)] px-3 py-2 bg-[var(--pos-sunk)]">{footer}</div>}
                </div>
            )}
        </div>
    );
}

/**
 * Full-page form overlay — Zoho opens "New Item" this way: title left, X right,
 * the form scrolling between, Save / Cancel pinned to the bottom.
 */
export function FormOverlay({ title, onClose, children, footer }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[var(--pos-surface)]">
            <header className="shrink-0 flex items-center gap-4 px-6 h-[56px] border-b border-[var(--pos-line)]">
                <h1 className="flex-1 text-[19px] font-semibold text-[var(--pos-ink)] truncate">{title}</h1>
                <button type="button" onClick={onClose} aria-label="Close"
                    className="pos-focusable grid place-items-center w-8 h-8 rounded text-[var(--pos-ink-3)] hover:bg-[var(--pos-sunk)] hover:text-[var(--pos-ink)]">
                    <X size={20} />
                </button>
            </header>
            <div className="pos-scroll flex-1 min-h-0 px-6 py-4">{children}</div>
            <footer className="shrink-0 flex items-center gap-2 px-6 py-3 border-t border-[var(--pos-line)]">{footer}</footer>
        </div>
    );
}

/** Rule between form blocks. */
export function FormDivider() {
    return <hr className="my-2 border-0 border-t border-[var(--pos-line-soft)]" />;
}

/** Section heading inside a form, e.g. "Default Tax Rates". */
export function FormBlockTitle({ children }) {
    return <h3 className="text-[15px] font-semibold text-[var(--pos-ink)] mt-5 mb-2">{children}</h3>;
}
