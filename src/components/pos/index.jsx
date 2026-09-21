"use client";
/**
 * POS UI primitives.
 *
 * Every dashboard module builds from these. The rule: a module composes these
 * components and never invents its own header, table, field or button styling.
 * That is what makes twenty screens read as one product.
 *
 * Styling lives in ./tokens.css — import it once in the dashboard layout.
 */
import React, { createContext, useContext, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Loader2, Search, X, Check, AlertTriangle, Info, Inbox, ChevronLeft } from 'lucide-react';

const cx = (...a) => a.filter(Boolean).join(' ');

/* ══════════════════════════════════════════════════════════
   PAGE SHELL
   ══════════════════════════════════════════════════════════ */

/**
 * Full-height page: header, optional toolbar, scrolling body, optional footer.
 * Sits inside the dashboard's padded content well, so it renders as a panel and
 * owns its own scrolling — the body scrolls, the header and action bar do not.
 */
export function Page({ children, className }) {
    return (
        <div className={cx(
            'flex flex-col h-full min-h-0 overflow-hidden bg-[var(--pos-canvas)]',
            'border border-[var(--pos-line)] rounded-[var(--pos-r-lg)] shadow-[var(--pos-shadow)]',
            className,
        )} style={{ fontFamily: 'var(--pos-font)' }}>
            {children}
        </div>
    );
}

/** Title bar. `meta` is for counts/status, `actions` for buttons. */
export function PageHeader({ icon: Icon, title, subtitle, meta, actions }) {
    return (
        <header className="shrink-0 flex items-center gap-4 px-5 h-[58px] bg-[var(--pos-surface)] border-b border-[var(--pos-line)]">
            {Icon && (
                <span className="grid place-items-center w-9 h-9 rounded-[var(--pos-r)] bg-[var(--pos-sunk)] text-[var(--pos-ink-2)] shrink-0">
                    <Icon size={18} strokeWidth={2.2} />
                </span>
            )}
            <div className="min-w-0 flex-1">
                <h1 className="text-[15px] font-bold text-[var(--pos-ink)] leading-tight truncate">{title}</h1>
                {subtitle && <p className="text-[12px] text-[var(--pos-ink-3)] leading-tight mt-0.5 truncate">{subtitle}</p>}
            </div>
            {meta && <div className="hidden md:flex items-center gap-4 shrink-0">{meta}</div>}
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
    );
}

/** A labelled number beside the page title. */
export function HeaderStat({ label, value, tone = 'default' }) {
    const tones = {
        default: 'text-[var(--pos-ink)]',
        ok: 'text-[var(--pos-ok)]',
        warn: 'text-[var(--pos-warn)]',
        danger: 'text-[var(--pos-danger)]',
    };
    // Mono at 15px was the same weight as the label beside it, so nothing in
    // the header read as the answer. The number is the answer: it gets the
    // size, and the label shrinks to a caption.
    return (
        <div className="text-right">
            <div className="text-[9.5px] font-bold uppercase tracking-[.09em] text-[var(--pos-ink-3)] leading-none">{label}</div>
            <div className={cx('pos-figure text-[19px] leading-none mt-1.5', tones[tone])}>{value}</div>
        </div>
    );
}

/** Secondary bar under the header — filters, search, view switches. */
export function Toolbar({ children, className }) {
    return (
        <div className={cx('shrink-0 flex flex-wrap items-center gap-2 px-5 py-2.5 bg-[var(--pos-surface)] border-b border-[var(--pos-line)]', className)}>
            {children}
        </div>
    );
}

/** Scrolling content region. */
export function PageBody({ children, className, padded = true }) {
    return <div className={cx('pos-scroll flex-1 min-h-0', padded && 'p-5', className)}>{children}</div>;
}

/** Sticky action bar at the bottom — where Save lives. */
export function ActionBar({ children, left }) {
    return (
        <footer className="shrink-0 flex items-center gap-2 px-5 py-3 bg-[var(--pos-surface)] border-t border-[var(--pos-line)]">
            <div className="flex-1 min-w-0 flex items-center gap-3">{left}</div>
            {children}
        </footer>
    );
}

/* ══════════════════════════════════════════════════════════
   CARD
   ══════════════════════════════════════════════════════════ */

/*
 * Takes a ref so a form flow can own the whole card — see useFormFlow. The
 * ref lands on the <section>, which is the element the keydown listener needs.
 */
export const Card = React.forwardRef(function Card(
    { title, subtitle, actions, children, className, bodyClassName, flush }, ref,
) {
    return (
        <section ref={ref} className={cx('bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[var(--pos-r-lg)] shadow-[var(--pos-shadow)] overflow-hidden', className)}>
            {(title || actions) && (
                <div className="flex items-center gap-3 px-4 min-h-[44px] py-2 border-b border-[var(--pos-line-soft)]">
                    <div className="min-w-0 flex-1">
                        <h2 className="text-[13px] font-semibold text-[var(--pos-ink)] truncate">{title}</h2>
                        {subtitle && <p className="text-[11.5px] text-[var(--pos-ink-3)] truncate mt-0.5">{subtitle}</p>}
                    </div>
                    {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
                </div>
            )}
            <div className={cx(!flush && 'p-4', bodyClassName)}>{children}</div>
        </section>
    );
});

/* ══════════════════════════════════════════════════════════
   FORM
   ══════════════════════════════════════════════════════════ */

/** Responsive field grid. `cols` is the count at the widest breakpoint. */
export function FormGrid({ cols = 4, children, className }) {
    const map = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 6: 'md:grid-cols-6' };
    return <div className={cx('grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5', map[cols], className)}>{children}</div>;
}

/** Label + control + hint/error. Pass `span` to widen inside a FormGrid. */
export function Field({ label, required, hint, error, span, children, htmlFor }) {
    const spans = { 2: 'sm:col-span-2', 3: 'sm:col-span-2 md:col-span-3', 4: 'sm:col-span-2 md:col-span-4' };
    return (
        <div className={cx('flex flex-col gap-1.5 min-w-0', span && spans[span])}>
            {label && (
                <label htmlFor={htmlFor} className="text-[11px] font-semibold text-[var(--pos-ink-2)] leading-none">
                    {label}{required && <span className="text-[var(--pos-danger)] ml-0.5">*</span>}
                </label>
            )}
            {children}
            {error
                ? <p className="text-[11px] font-medium text-[var(--pos-danger)] leading-tight">{error}</p>
                : hint ? <p className="text-[11px] text-[var(--pos-ink-3)] leading-tight">{hint}</p> : null}
        </div>
    );
}

export const Input = React.forwardRef(function Input({ invalid, numeric, className, ...p }, ref) {
    return <input ref={ref} className={cx('pos-input', numeric && 'pos-input--num', invalid && 'is-invalid', className)} {...p} />;
});

export const Select = React.forwardRef(function Select({ invalid, className, children, ...p }, ref) {
    return <select ref={ref} className={cx('pos-input', invalid && 'is-invalid', className)} {...p}>{children}</select>;
});

export const Textarea = React.forwardRef(function Textarea({ invalid, className, rows = 3, ...p }, ref) {
    return <textarea ref={ref} rows={rows} className={cx('pos-input', invalid && 'is-invalid', className)} {...p} />;
});

export const SearchInput = React.forwardRef(function SearchInput({ value, onChange, onClear, className, ...p }, ref) {
    return (
        <div className={cx('relative', className)}>
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--pos-ink-3)] pointer-events-none" />
            <input ref={ref} name="search" type="search" value={value} onChange={onChange} className="pos-input !pl-8 !pr-8" {...p} />
            {value ? (
                <button type="button" onClick={onClear} aria-label="Clear search"
                    className="pos-focusable absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-5 h-5 rounded text-[var(--pos-ink-3)] hover:text-[var(--pos-ink)] hover:bg-[var(--pos-sunk)]">
                    <X size={13} />
                </button>
            ) : null}
        </div>
    );
});

/** Segmented single-choice control — replaces a select when options are few. */
export function ChoiceGroup({ value, onChange, options, name }) {
    return (
        <div role="radiogroup" aria-label={name} className="inline-flex flex-wrap gap-1.5">
            {options.map(o => {
                const v = typeof o === 'string' ? o : o.value;
                const l = typeof o === 'string' ? o : o.label;
                const on = value === v;
                return (
                    <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
                        className={cx('pos-btn pos-btn--sm', on ? 'pos-btn--primary' : 'pos-btn--default')}>
                        {on && <Check size={12} strokeWidth={3} />}{l}
                    </button>
                );
            })}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════
   BUTTON
   ══════════════════════════════════════════════════════════ */

export const Button = React.forwardRef(function Button(
    { variant = 'default', size, icon: Icon, loading, children, className, ...p }, ref,
) {
    return (
        <button ref={ref} className={cx('pos-btn', `pos-btn--${variant}`, size === 'sm' && 'pos-btn--sm', className)}
            disabled={p.disabled || loading} {...p}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : Icon ? <Icon size={14} strokeWidth={2.2} /> : null}
            {children}
        </button>
    );
});

/* ══════════════════════════════════════════════════════════
   STATUS
   ══════════════════════════════════════════════════════════ */

export function Badge({ tone = 'neutral', children }) {
    const tones = {
        neutral: 'bg-[var(--pos-sunk)] text-[var(--pos-ink-2)] border-[var(--pos-line)]',
        accent:  'bg-[var(--pos-select)] text-[var(--pos-ink)] border-[var(--pos-select-line)]',
        ok:      'bg-[var(--pos-ok-soft)] text-[var(--pos-ok)] border-[var(--pos-ok-line)]',
        warn:    'bg-[var(--pos-warn-soft)] text-[var(--pos-warn)] border-[var(--pos-warn-line)]',
        danger:  'bg-[var(--pos-danger-soft)] text-[var(--pos-danger)] border-[var(--pos-danger-line)]',
        info:    'bg-[var(--pos-info-soft)] text-[var(--pos-info)] border-[var(--pos-info-line)]',
    };
    return (
        <span className={cx('inline-flex items-center gap-1 h-[20px] px-2 rounded-full text-[10.5px] font-bold tracking-[.01em] border', tones[tone])}>
            {children}
        </span>
    );
}

/** Inline message. Dismissible when `onClose` is given. */
export function Banner({ tone = 'info', children, onClose }) {
    const cfg = {
        info:   { icon: Info,          cls: 'bg-[var(--pos-info-soft)] text-[var(--pos-info)]' },
        ok:     { icon: Check,         cls: 'bg-[var(--pos-ok-soft)] text-[var(--pos-ok)]' },
        warn:   { icon: AlertTriangle, cls: 'bg-[var(--pos-warn-soft)] text-[var(--pos-warn)]' },
        danger: { icon: AlertTriangle, cls: 'bg-[var(--pos-danger-soft)] text-[var(--pos-danger)]' },
    };
    // An unknown tone used to read `undefined.icon` and take the whole screen
    // down with it. A wrong colour is a far better outcome than a blank page.
    const style = cfg[tone] || cfg.info;
    const Icon = style.icon;
    return (
        <div role={tone === 'danger' ? 'alert' : 'status'}
             className={cx('flex items-start gap-2.5 px-4 py-2.5 text-[12.5px] font-medium', style.cls)}>
            <Icon size={15} className="shrink-0 mt-px" />
            <span className="flex-1 min-w-0">{children}</span>
            {onClose && (
                <button type="button" onClick={onClose} aria-label="Dismiss"
                    className="pos-focusable shrink-0 rounded opacity-60 hover:opacity-100"><X size={14} /></button>
            )}
        </div>
    );
}

export function EmptyState({ icon: Icon = Inbox, title, hint, action }) {
    return (
        <div className="flex flex-col items-center justify-center gap-2 py-14 px-6 text-center">
            <span className="grid place-items-center w-11 h-11 rounded-full bg-[var(--pos-sunk)] text-[var(--pos-ink-3)] mb-1">
                <Icon size={20} />
            </span>
            <p className="text-[13.5px] font-semibold text-[var(--pos-ink-2)]">{title}</p>
            {hint && <p className="text-[12px] text-[var(--pos-ink-3)] max-w-[46ch]">{hint}</p>}
            {action && <div className="mt-2">{action}</div>}
        </div>
    );
}

export function Spinner({ label = 'Loading…' }) {
    return (
        <div className="flex items-center justify-center gap-2 py-12 text-[13px] font-medium text-[var(--pos-ink-3)]">
            <Loader2 size={16} className="animate-spin" /> {label}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════
   DATA TABLE
   ══════════════════════════════════════════════════════════
   columns: [{ key, header, width, align, render?(row, i), className? }]
   Rows are keyboard-navigable when onSelect is provided.
   ══════════════════════════════════════════════════════════ */

export function DataTable({
    columns, rows, rowKey = (r, i) => r.id ?? i,
    selectedKey, onSelect, onActivate,
    loading, empty, footer, stickyHeader = true, className,
}) {
    const bodyRef = useRef(null);

    const onKeyDown = useCallback((e) => {
        if (!onSelect || !rows.length) return;
        const idx = rows.findIndex((r, i) => rowKey(r, i) === selectedKey);
        if (e.key === 'ArrowDown') { e.preventDefault(); const n = Math.min(rows.length - 1, idx + 1); onSelect(rows[n], n); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); const n = Math.max(0, idx - 1); onSelect(rows[n], n); }
        else if (e.key === 'Home') { e.preventDefault(); onSelect(rows[0], 0); }
        else if (e.key === 'End') { e.preventDefault(); onSelect(rows[rows.length - 1], rows.length - 1); }
        else if (e.key === 'Enter' && idx >= 0 && onActivate) { e.preventDefault(); onActivate(rows[idx], idx); }
    }, [rows, rowKey, selectedKey, onSelect, onActivate]);

    if (loading) return <Spinner />;
    if (!rows.length && empty) return empty;

    return (
        <div ref={bodyRef} tabIndex={onSelect ? 0 : -1} onKeyDown={onKeyDown}
             className={cx('pos-scroll pos-focusable rounded-[var(--pos-r)] border border-[var(--pos-line)] bg-[var(--pos-surface)]', className)}>
            <table className="pos-table">
                <thead className={stickyHeader ? undefined : 'static'}>
                    <tr>{columns.map(c => (
                        <th key={c.key} style={{ width: c.width }} className={c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : undefined}>
                            {c.header}
                        </th>
                    ))}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => {
                        const k = rowKey(r, i);
                        return (
                            <tr key={k} data-selected={selectedKey !== undefined && k === selectedKey}
                                onClick={onSelect ? () => onSelect(r, i) : undefined}
                                onDoubleClick={onActivate ? () => onActivate(r, i) : undefined}
                                className={onSelect ? 'cursor-pointer' : undefined}>
                                {columns.map(c => (
                                    <td key={c.key}
                                        className={cx(c.align === 'right' && 'num', c.align === 'center' && 'text-center', c.className)}>
                                        {c.render ? c.render(r, i) : r[c.key]}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
                {footer && <tfoot>{footer}</tfoot>}
            </table>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════
   CONFIRM DIALOG  — replaces window.confirm
   ══════════════════════════════════════════════════════════ */

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
    const [req, setReq] = useState(null);
    const resolver = useRef(null);
    const okRef = useRef(null);

    const confirm = useCallback((opts) => {
        setReq(typeof opts === 'string' ? { message: opts } : opts);
        return new Promise(res => { resolver.current = res; });
    }, []);

    const close = useCallback((ok) => { setReq(null); resolver.current?.(ok); resolver.current = null; }, []);

    useEffect(() => {
        if (!req) return;
        okRef.current?.focus();
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(false); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [req, close]);

    return (
        <ConfirmCtx.Provider value={confirm}>
            {children}
            {req && (
                <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(16,28,33,.5)] p-4"
                     role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
                    <div className="w-full max-w-[420px] bg-[var(--pos-surface)] rounded-[var(--pos-r-lg)] shadow-[var(--pos-shadow-lg)] overflow-hidden"
                         style={{ fontFamily: 'var(--pos-font)' }}>
                        <div className="flex items-start gap-3 p-5">
                            <span className={cx('grid place-items-center w-9 h-9 rounded-full shrink-0',
                                req.tone === 'danger' ? 'bg-[var(--pos-danger-soft)] text-[var(--pos-danger)]' : 'bg-[var(--pos-sunk)] text-[var(--pos-ink-2)]')}>
                                <AlertTriangle size={17} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-[14px] font-bold text-[var(--pos-ink)]">{req.title || 'Are you sure?'}</h3>
                                <p className="text-[12.5px] text-[var(--pos-ink-2)] mt-1 leading-relaxed whitespace-pre-line">{req.message}</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 px-5 py-3 bg-[var(--pos-sunk)] border-t border-[var(--pos-line)]">
                            <Button variant="default" onClick={() => close(false)}>{req.cancelLabel || 'Cancel'}</Button>
                            <Button ref={okRef} variant={req.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)}>
                                {req.confirmLabel || 'Confirm'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmCtx.Provider>
    );
}

/** `const confirm = useConfirm(); if (await confirm({ ... })) { ... }` */
export function useConfirm() {
    const ctx = useContext(ConfirmCtx);
    if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
    return ctx;
}

/* ══════════════════════════════════════════════════════════
   FIELD FLOW  — Enter moves to the next field, never submits
   ══════════════════════════════════════════════════════════
     const flow = useFieldFlow(['name', 'phone', 'amount'], onLast);
     <Input {...flow.field('name')} />

   The hook has existed for a while and does the right thing. It was used on
   two screens out of twenty-nine, and on one of those the operator still had
   to click into the first box before typing. Both of those are fixed below:
   the flow now lands focus by itself, and the rest of the application can
   adopt it a screen at a time without any of them re-inventing the keys.
   ══════════════════════════════════════════════════════════ */

export function useFieldFlow(order, onComplete, opts = {}) {
    const refs = useRef({});
    const seq = useMemo(() => order, [order.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
    const { autoFocus = true } = opts;

    const focus = useCallback((name) => {
        const el = refs.current[name];
        if (!el) return false;
        el.focus();
        if (typeof el.select === 'function') el.select();
        return true;
    }, []);

    const step = useCallback((name, dir) => {
        const i = seq.indexOf(name);
        if (i < 0) return;
        for (let n = i + dir; n >= 0 && n < seq.length; n += dir) {
            if (focus(seq[n])) return;
        }
        if (dir > 0) onComplete?.();
    }, [seq, focus, onComplete]);

    const first = useCallback(() => {
        for (const name of seq) if (focus(name)) return true;
        return false;
    }, [seq, focus]);

    /**
     * Land on the first field by itself.
     *
     * A form that opens with nothing focused makes the operator reach for the
     * mouse to type the first character — every time, on every bill. That one
     * reach is the difference between a keyboard till and a slow one.
     *
     * Deferred by a frame because the inputs are not in the DOM on the render
     * that runs this effect. `focus()` returns false for a field that is not
     * mounted, so a form still hidden behind a list simply does nothing, and
     * the screen's own call to `first()` takes over when it appears.
     */
    useEffect(() => {
        if (!autoFocus) return;
        const id = requestAnimationFrame(() => { first(); });
        return () => cancelAnimationFrame(id);
    }, [autoFocus, first]);

    const field = useCallback((name) => ({
        ref: (el) => { if (el) refs.current[name] = el; else delete refs.current[name]; },
        onFocus: (e) => { if (typeof e.target.select === 'function') e.target.select(); },
        onKeyDown: (e) => {
            if (e.key !== 'Enter') return;
            // Let a textarea keep Enter for newlines.
            if (e.target.tagName === 'TEXTAREA' && !e.ctrlKey) return;
            e.preventDefault();          // never submit the form on Enter
            step(name, e.shiftKey ? -1 : 1);
        },
    }), [step]);

    return { field, focus, first };
}

/**
 * Enter moves to the next field, for a whole form at once.
 *
 *   const form = useFormFlow(onLastField);
 *   <Card ref={form.ref}> … any number of Inputs … </Card>
 *
 * `useFieldFlow` above asks the screen to name its fields in order. That is
 * exact, and it is the right tool when the order is not the order on screen.
 * It is also a list that has to be kept in step with the markup, and a field
 * added to the form but forgotten in the list is silently skipped — which is
 * worse than no flow at all, because the operator cannot see why the cursor
 * jumped over a box.
 *
 * This takes the order from the DOM instead. What you see is the order you get,
 * a new field joins the flow by existing, and a screen adopts the whole thing
 * in two lines.
 *
 * Skipped deliberately: anything disabled, read-only or hidden, buttons, and
 * checkboxes — a checkbox answers to Space, and stealing Enter from it would
 * make ticking a box move the cursor away from it.
 */
export function useFormFlow(onComplete, opts = {}) {
    const { autoFocus = true, enabled = true } = opts;

    // A callback ref, not a plain one, because the form is usually not on
    // screen when the screen first mounts — a record module renders its list
    // first and the form only when the operator opens one. A plain ref is
    // still null when the effects run, the listener attaches to nothing, and
    // Enter silently does nothing forever after. Holding the node in state
    // re-runs the effects at the moment the form actually appears, and again
    // when it goes away.
    const node = useRef(null);
    const [root, setRoot] = useState(null);
    const ref = useCallback((el) => { node.current = el; setRoot(el); }, []);

    // Screens pass an inline arrow, which is a new function on every render.
    // Kept in a ref so the listener attaches when the form appears and not
    // again on every keystroke.
    const done = useRef(onComplete);
    done.current = onComplete;

    const fields = useCallback(() => {
        if (!root) return [];
        return [...root.querySelectorAll('input, select, textarea')].filter(el => {
            if (el.disabled || el.readOnly) return false;
            if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'hidden') return false;
            // offsetParent is null for anything display:none — a field inside a
            // collapsed section is not somewhere the cursor should land.
            return el.offsetParent !== null;
        });
    }, [root]);

    const first = useCallback(() => {
        const f = fields();
        if (f.length === 0) return false;
        f[0].focus();
        if (typeof f[0].select === 'function') f[0].select();
        return true;
    }, [fields]);

    useEffect(() => {
        if (!autoFocus || !enabled) return undefined;
        const id = requestAnimationFrame(() => { first(); });
        return () => cancelAnimationFrame(id);
    }, [autoFocus, enabled, first]);

    useEffect(() => {
        if (!root || !enabled) return undefined;

        const onKey = (e) => {
            if (e.key !== 'Enter') return;
            // The listener sits on the form root, so a field's own handler has
            // already run. If it called preventDefault, Enter meant something
            // there — pick the highlighted option, add the row — and moving the
            // cursor on top of that would undo what the operator just did.
            if (e.defaultPrevented) return;
            const el = e.target;
            // A textarea keeps Enter for newlines; Ctrl+Enter moves on.
            if (el.tagName === 'TEXTAREA' && !e.ctrlKey) return;
            if (el.tagName === 'BUTTON') return;

            const f = fields();
            const i = f.indexOf(el);
            if (i < 0) return;

            e.preventDefault();               // never submit the form on Enter
            const next = f[i + (e.shiftKey ? -1 : 1)];
            if (next) {
                next.focus();
                if (typeof next.select === 'function') next.select();
            } else if (!e.shiftKey) {
                // Past the last field is the operator saying "that is the lot".
                done.current?.();
            }
        };

        root.addEventListener('keydown', onKey);
        return () => root.removeEventListener('keydown', onKey);
    }, [root, fields, enabled]);

    return { ref, first, fields };
}

/**
 * Puts the cursor where the work starts, on any screen.
 *
 * For the screens that are not a form — a list with a search box, a floor plan,
 * a report with a date range. The operator should be able to open the screen
 * and type.
 *
 *   const search = usePageFocus();
 *   <SearchInput ref={search} … />
 *
 * `when` re-lands focus whenever it changes, which is how a screen returns the
 * cursor after closing a dialog or switching tabs.
 */
export function usePageFocus(when, opts = {}) {
    // `ref` lets a component that already owns the element hand it in, so the
    // landing focus is decided in one place instead of every caller writing
    // the same requestAnimationFrame again. `enabled` off returns the ref
    // untouched — a screen that must not steal focus keeps the same shape.
    const { enabled = true, ref: given } = opts;
    const own = useRef(null);
    const ref = given || own;
    useEffect(() => {
        if (!enabled) return undefined;
        const id = requestAnimationFrame(() => {
            const el = ref.current;
            if (!el) return;
            el.focus();
            if (typeof el.select === 'function') el.select();
        });
        return () => cancelAnimationFrame(id);
    }, [when, enabled, ref]);
    return ref;
}

/**
 * One keyboard map for a screen.
 *
 *   useShortcuts({ F2: openPayment, F4: search, Escape: close });
 *
 * Replaces the pattern this project grew into on the sales page: a single
 * `window.keydown` listener holding every piece of screen state, re-registered
 * on every keystroke because its dependency array has thirty entries. That is
 * both slow and impossible to reason about — nobody can say what F4 does
 * without reading nine hundred lines.
 *
 * Here the handlers live in a ref, so the listener is attached once and never
 * re-registered, and each key says plainly what it does.
 *
 * A key is ignored while the operator is typing into a field, unless it is a
 * function key or Escape — those are commands, and a till operator expects F2
 * to work without leaving the quantity box first.
 */
export function useShortcuts(map, enabled = true) {
    const latest = useRef(map);
    latest.current = map;

    useEffect(() => {
        if (!enabled) return undefined;
        const onKey = (e) => {
            const handlers = latest.current || {};
            const key = e.key;
            const fn = handlers[key];
            if (typeof fn !== 'function') return;

            const tag = (e.target?.tagName || '').toUpperCase();
            const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
                || e.target?.isContentEditable;
            const isCommand = /^F\d{1,2}$/.test(key) || key === 'Escape';
            if (typing && !isCommand) return;

            e.preventDefault();
            fn(e);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [enabled]);
}

/* ══════════════════════════════════════════════════════════
   KEYBOARD HINT BAR
   ══════════════════════════════════════════════════════════ */

export function ShortcutHints({ items }) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--pos-ink-3)]">
            {items.map(([k, label]) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                    <kbd className="px-1.5 py-0.5 rounded border border-[var(--pos-line)] bg-[var(--pos-sunk)] font-semibold text-[10px] text-[var(--pos-ink-2)]"
                         style={{ fontFamily: 'var(--pos-mono)' }}>{k}</kbd>
                    {label}
                </span>
            ))}
        </div>
    );
}

/** ₹ with Indian digit grouping and fixed decimals. */
export const money = (v, dp = 2) =>
    '₹' + (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/* ══════════════════════════════════════════════════════════
   RECORD PAGE  — the list-first pattern
   ══════════════════════════════════════════════════════════
   Every master and transaction screen uses this shape, the way Zoho Books,
   Xero and QuickBooks do:

       LIST  →  you land on all records: search, filter, sort, totals, "+ New"
       FORM  →  "+ New" or a row opens the entry form as a full view
       Back  →  returns to the list, list refreshes

   The mistake to avoid is the opposite (form-first): showing a blank 40-field
   form on arrival and hiding the records behind it. Users come to a master
   screen to FIND something far more often than to add something.
   ══════════════════════════════════════════════════════════ */

/** Toolbar row for a list view: search on the left, filters + New on the right. */
export function ListToolbar({
    search, onSearch, placeholder = 'Search…', count, countLabel = 'records', filters, actions,
    autoFocus = false, searchRef,
}) {
    // `autoFocus` is opt-in rather than always on: on a screen where a form and
    // a list share one render, the form owns the cursor, and a toolbar that
    // grabbed it on mount would quietly undo that.
    const ref = usePageFocus(undefined, { enabled: autoFocus, ref: searchRef });
    return (
        <Toolbar>
            <SearchInput
                ref={ref}
                className="w-full max-w-[300px]"
                value={search}
                onChange={e => onSearch(e.target.value)}
                onClear={() => onSearch('')}
                placeholder={placeholder}
            />
            {count !== undefined && (
                <span className="text-[12px] text-[var(--pos-ink-3)] whitespace-nowrap">
                    <b className="text-[var(--pos-ink-2)] tabular-nums">{count}</b> {countLabel}
                </span>
            )}
            {filters}
            <div className="flex-1" />
            {actions}
        </Toolbar>
    );
}

/** Header for a form view — back arrow, title, and the record's identity. */
export function FormHeader({ onBack, title, subtitle, badge, actions }) {
    return (
        <header className="shrink-0 flex items-center gap-3 px-4 h-[58px] bg-[var(--pos-surface)] border-b border-[var(--pos-line)]">
            <button type="button" onClick={onBack} aria-label="Back to list"
                className="pos-focusable grid place-items-center w-8 h-8 rounded-[var(--pos-r-sm)] text-[var(--pos-ink-2)] hover:bg-[var(--pos-sunk)] hover:text-[var(--pos-ink)] shrink-0">
                <ChevronLeft size={19} />
            </button>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <h1 className="text-[15px] font-bold text-[var(--pos-ink)] leading-tight truncate">{title}</h1>
                    {badge}
                </div>
                {subtitle && <p className="text-[12px] text-[var(--pos-ink-3)] leading-tight mt-0.5 truncate">{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
    );
}

/** A titled block of fields inside a form. Keeps long forms scannable. */
export function FormSection({ title, description, children, className }) {
    return (
        <section className={cx('py-5 first:pt-0 border-b border-[var(--pos-line-soft)] last:border-b-0', className)}>
            <div className="mb-3.5">
                <h3 className="text-[12px] font-bold uppercase tracking-[.05em] text-[var(--pos-ink-2)]">{title}</h3>
                {description && <p className="text-[11.5px] text-[var(--pos-ink-3)] mt-0.5">{description}</p>}
            </div>
            {children}
        </section>
    );
}

/** Horizontal tab strip — for splitting a long form or a list by status. */
export {
    BusinessConfigProvider, useBusinessConfig, useModule, SCREEN_MODULE,
} from './business-config';

export function Tabs({ value, onChange, items }) {
    return (
        <div role="tablist" className="flex items-end gap-1 px-4 bg-[var(--pos-surface)] border-b border-[var(--pos-line)] overflow-x-auto pos-scroll">
            {items.map(t => {
                const on = t.value === value;
                return (
                    <button key={t.value} role="tab" aria-selected={on} type="button" onClick={() => onChange(t.value)}
                        className={cx(
                            'pos-focusable relative px-3.5 h-[38px] text-[12.5px] font-semibold whitespace-nowrap rounded-t-[var(--pos-r-sm)] transition-colors',
                            on ? 'text-[var(--pos-ink)]' : 'text-[var(--pos-ink-3)] hover:text-[var(--pos-ink-2)]',
                        )}>
                        {t.label}
                        {t.count !== undefined && (
                            <span className={cx('ml-1.5 px-1.5 py-px rounded text-[10.5px] font-bold tabular-nums',
                                on ? 'bg-[var(--pos-select)] text-[var(--pos-ink)]' : 'bg-[var(--pos-sunk)] text-[var(--pos-ink-3)]')}>
                                {t.count}
                            </span>
                        )}
                        {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[var(--pos-ink)] rounded-full" />}
                    </button>
                );
            })}
        </div>
    );
}

/** Read-only label/value pair — for detail panels and summaries. */
export function DetailRow({ label, value, mono }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-1.5">
            <span className="text-[11.5px] text-[var(--pos-ink-3)] shrink-0">{label}</span>
            <span className={cx('text-[12.5px] font-semibold text-[var(--pos-ink)] text-right min-w-0 truncate',
                mono && 'tabular-nums')} style={mono ? { fontFamily: 'var(--pos-mono)' } : undefined}>
                {value}
            </span>
        </div>
    );
}

/** Totals block that sits at the bottom-right of an entry form. */
export function TotalsPanel({ rows, grand }) {
    return (
        <div className="w-full sm:max-w-[300px] ml-auto bg-[var(--pos-sunk)] border border-[var(--pos-line)] rounded-[var(--pos-r)] px-4 py-3">
            {rows.map(r => <DetailRow key={r.label} label={r.label} value={r.value} mono />)}
            {grand && (
                <div className="flex items-baseline justify-between gap-4 pt-2.5 mt-1.5 border-t border-[var(--pos-line)]">
                    <span className="text-[11.5px] font-bold uppercase tracking-[.05em] text-[var(--pos-ink-2)]">{grand.label}</span>
                    <span className="text-[19px] font-bold text-[var(--pos-ink)] tabular-nums" style={{ fontFamily: 'var(--pos-mono)' }}>
                        {grand.value}
                    </span>
                </div>
            )}
        </div>
    );
}
