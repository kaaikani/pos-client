"use client";
/**
 * My Account — the signed-in user's own profile and password.
 *
 * This did not exist: an operator could not change their own password anywhere in
 * the app, which meant either everyone kept the password an administrator handed
 * out, or somebody had to run a script on the server. Both are wrong.
 *
 * Password change goes through Vendure's own `updateActiveAdministrator`, so it is
 * hashed by the configured strategy and the current password is verified.
 */
import React, { useState, useCallback } from 'react';
import { X, Lock, Eye, EyeOff, ShieldCheck, Loader2, Check, AlertCircle } from 'lucide-react';
import { gql } from '../../core/queries/gql';
import { roleLabel } from './permissions';

const cx = (...a) => a.filter(Boolean).join(' ');

/** Minimum bar for a counter password. Deliberately modest, and stated up front. */
function strengthOf(pw) {
    const checks = [
        pw.length >= 8,
        /[a-z]/.test(pw) && /[A-Z]/.test(pw),
        /\d/.test(pw),
        /[^A-Za-z0-9]/.test(pw),
    ];
    const score = checks.filter(Boolean).length;
    return {
        score,
        checks,
        label: score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong',
        color: score <= 1 ? 'var(--pos-danger)' : score === 2 ? 'var(--pos-warn)' : 'var(--pos-ok)',
    };
}

export default function AccountPanel({ session, onClose }) {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);     // { tone, text }

    const st = strengthOf(next);
    const mismatch = confirm.length > 0 && next !== confirm;

    const submit = useCallback(async (e) => {
        e.preventDefault();
        if (!current) { setMsg({ tone: 'warn', text: 'Enter your current password.' }); return; }
        if (next.length < 8) { setMsg({ tone: 'warn', text: 'The new password must be at least 8 characters.' }); return; }
        if (next !== confirm) { setMsg({ tone: 'warn', text: 'The two new passwords do not match.' }); return; }
        if (next === current) { setMsg({ tone: 'warn', text: 'The new password must be different from the current one.' }); return; }

        setBusy(true);
        setMsg(null);
        try {
            // Vendure verifies `currentPassword` itself and hashes the new one with
            // the configured strategy — never write a hash from the client.
            const data = await gql(`
                mutation ChangeMyPassword($input: UpdateActiveAdministratorInput!) {
                    updateActiveAdministrator(input: $input) { id emailAddress }
                }
            `, {
                useAdmin: true,
                variables: { input: { password: next, currentPassword: current } },
            });
            if (!data?.updateActiveAdministrator?.id) throw new Error('The password was not changed.');
            setMsg({ tone: 'ok', text: 'Password changed. Use the new one next time you sign in.' });
            setCurrent(''); setNext(''); setConfirm('');
        } catch (err) {
            const m = /invalid|incorrect|credential/i.test(err.message)
                ? 'Your current password is not correct.'
                : err.message;
            setMsg({ tone: 'danger', text: m });
        } finally {
            setBusy(false);
        }
    }, [current, next, confirm]);

    const tone = {
        ok:     { bg: 'var(--pos-ok-soft)',     fg: 'var(--pos-ok)',     Icon: Check },
        warn:   { bg: 'var(--pos-warn-soft)',   fg: 'var(--pos-warn)',   Icon: AlertCircle },
        danger: { bg: 'var(--pos-danger-soft)', fg: 'var(--pos-danger)', Icon: AlertCircle },
    };

    return (
        <div className="fixed inset-0 z-[95] flex justify-end bg-[rgba(16,20,26,.45)]"
             role="dialog" aria-modal="true" aria-label="My account"
             onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
             style={{ fontFamily: 'var(--pos-font)' }}>
            <div className="w-full max-w-[400px] h-full bg-[var(--pos-surface)] shadow-[var(--pos-shadow-lg)] flex flex-col">

                <header className="shrink-0 flex items-center gap-3 px-5 h-[58px] border-b border-[var(--pos-line)]">
                    <h2 className="flex-1 text-[15px] font-semibold text-[var(--pos-ink)]">My Account</h2>
                    <button type="button" onClick={onClose} aria-label="Close"
                        className="pos-focusable grid place-items-center w-8 h-8 rounded text-[var(--pos-ink-3)] hover:bg-[var(--pos-sunk)] hover:text-[var(--pos-ink)]">
                        <X size={18} />
                    </button>
                </header>

                <div className="pos-scroll flex-1 min-h-0 px-5 py-5">
                    {/* identity */}
                    <div className="flex items-center gap-3 pb-5 border-b border-[var(--pos-line-soft)]">
                        <span className="grid place-items-center w-11 h-11 rounded-full text-white text-[14px] font-bold shrink-0"
                              style={{ background: 'var(--pos-ink-2)' }}>
                            {(session?.displayName || session?.username || 'A').split(/[\s@.]+/).filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                        </span>
                        <div className="min-w-0">
                            <div className="text-[14px] font-semibold text-[var(--pos-ink)] truncate">{session?.displayName || session?.username}</div>
                            <div className="text-[12px] text-[var(--pos-ink-3)] truncate">{session?.username}</div>
                            <span className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded text-[10.5px] font-bold uppercase tracking-[.05em]"
                                  style={{ background: 'var(--pos-sunk)', color: 'var(--pos-ink-2)' }}>
                                <ShieldCheck size={11} /> {roleLabel(session)}
                            </span>
                        </div>
                    </div>

                    {/* password */}
                    <form onSubmit={submit} className="pt-5 flex flex-col gap-3.5">
                        <div>
                            <h3 className="text-[13.5px] font-semibold text-[var(--pos-ink)]">Change Password</h3>
                            <p className="text-[12px] text-[var(--pos-ink-3)] mt-0.5">
                                At least 8 characters. You will stay signed in on this device.
                            </p>
                        </div>

                        {msg && (() => {
                            const t = tone[msg.tone] || tone.warn;
                            return (
                                <div role="alert" className="flex items-start gap-2.5 px-3 py-2.5 rounded-[var(--pos-r)]"
                                     style={{ background: t.bg, color: t.fg }}>
                                    <t.Icon size={15} className="shrink-0 mt-px" />
                                    <span className="text-[12.5px] font-medium">{msg.text}</span>
                                </div>
                            );
                        })()}

                        <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-[var(--pos-ink-2)]">Current password</span>
                            <div className="relative">
                                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pos-ink-3)] pointer-events-none" />
                                <input type={show ? 'text' : 'password'} value={current} autoComplete="current-password"
                                    onChange={e => setCurrent(e.target.value)}
                                    className="pos-input !h-[40px] !pl-9 !pr-10" />
                                <button type="button" onClick={() => setShow(v => !v)}
                                    aria-label={show ? 'Hide passwords' : 'Show passwords'}
                                    className="pos-focusable absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded text-[var(--pos-ink-3)] hover:bg-[var(--pos-sunk)]">
                                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </label>

                        <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-[var(--pos-ink-2)]">New password</span>
                            <input type={show ? 'text' : 'password'} value={next} autoComplete="new-password"
                                onChange={e => setNext(e.target.value)}
                                className="pos-input !h-[40px]" />
                            {next.length > 0 && (
                                <span className="flex items-center gap-2 mt-0.5">
                                    <span className="flex-1 h-1 rounded-full bg-[var(--pos-sunk)] overflow-hidden">
                                        <span className="block h-full rounded-full transition-[width]"
                                              style={{ width: `${(st.score / 4) * 100}%`, background: st.color }} />
                                    </span>
                                    <span className="text-[11px] font-semibold" style={{ color: st.color }}>{st.label}</span>
                                </span>
                            )}
                        </label>

                        <label className="flex flex-col gap-1.5">
                            <span className="text-[12.5px] font-semibold text-[var(--pos-ink-2)]">Confirm new password</span>
                            <input type={show ? 'text' : 'password'} value={confirm} autoComplete="new-password"
                                onChange={e => setConfirm(e.target.value)}
                                className={cx('pos-input !h-[40px]', mismatch && 'is-invalid')} />
                            {mismatch && <span className="text-[11.5px] text-[var(--pos-danger)]">The passwords do not match.</span>}
                        </label>

                        <button type="submit" disabled={busy}
                            className="pos-btn pos-btn--primary !h-[40px] mt-1">
                            {busy ? <Loader2 size={15} className="animate-spin" /> : <Lock size={14} />}
                            Change Password
                        </button>
                    </form>

                    <p className="text-[11.5px] text-[var(--pos-ink-3)] mt-6 pt-4 border-t border-[var(--pos-line-soft)] leading-relaxed">
                        Forgotten your current password? An administrator can reset it from
                        Users &amp; Roles. It cannot be recovered — only replaced.
                    </p>
                </div>
            </div>
        </div>
    );
}
