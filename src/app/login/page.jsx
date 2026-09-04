"use client";
/**
 * Sign in.
 *
 * Two panels: a dark product panel carrying the brand and the value proposition,
 * and a light sign-in panel. Colours come from the logo through the tokens in
 * components/pos/tokens.css, so the rest of the product matches automatically.
 *
 * HEIGHT: the page is locked to the viewport (`h-screen overflow-hidden`) — a
 * sign-in screen must never scroll. Vertical spacing and type sizes use clamp()
 * so the left panel compresses on short screens instead of pushing the form off.
 * Below 700px tall only the left panel scrolls; the form never moves.
 *
 * Auth uses Vendure's native `login` mutation and stores the returned channel
 * permissions on the session, which drives role-based access in the dashboard.
 */
import React, { useState, useEffect } from 'react';
import {
    Eye, EyeOff, ArrowRight, AlertCircle, Loader2, Lock, User,
    ShoppingCart, Boxes, BookOpen, Wallet, ShieldCheck, CloudUpload, TrendingUp, Users,
} from 'lucide-react';
import { VendureLoginCommand, MeQuery } from '../../core/queries/auth.query';
import { Brand } from '../../components/pos/brand';
import '../../components/pos/tokens.css';

const FEATURES = [
    { icon: ShoppingCart, tint: '#E9541F', title: 'SALES',     sub: 'Fast billing & order management' },
    { icon: Boxes,        tint: '#1E7A4C', title: 'INVENTORY', sub: 'Stock control & warehouse' },
    { icon: BookOpen,     tint: '#7C4DBE', title: 'LEDGER',    sub: 'Customer & supplier transactions' },
    { icon: Wallet,       tint: '#C98A08', title: 'ACCOUNTS',  sub: 'Expenses, income & reports' },
];

const TRUST = [
    { icon: ShieldCheck, title: 'Secure',       sub: 'Your data is safe' },
    { icon: CloudUpload, title: 'Cloud Backup', sub: 'Backed up daily' },
    { icon: TrendingUp,  title: 'Live Reports', sub: 'Real-time insight' },
    { icon: Users,       title: 'Multi User',   sub: 'Work as a team' },
];

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        (async () => {
            if (!localStorage.getItem('pos_session')) { setChecking(false); return; }
            const me = await new MeQuery().execute();
            if (me?.id) window.location.href = '/dashboard';
            else { localStorage.removeItem('pos_session'); setChecking(false); }
        })();
    }, []);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('pos_last_user');
            if (saved) setUsername(saved);
        } catch { /* private mode */ }
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password) {
            setError('Enter your username and password.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            const r = await new VendureLoginCommand().execute(username.trim(), password);
            localStorage.setItem('pos_session', JSON.stringify({
                token: r.token, userId: r.userId, username: r.username,
                role: r.role, displayName: r.displayName,
                permissions: r.permissions || [],
            }));
            try {
                if (remember) localStorage.setItem('pos_last_user', username.trim());
                else localStorage.removeItem('pos_last_user');
            } catch { /* private mode */ }
            window.location.href = '/dashboard';
        } catch (err) {
            setError(err.message || 'Sign in failed.');
        } finally {
            setLoading(false);
        }
    };

    if (checking) {
        return (
            <div className="h-screen grid place-items-center bg-[var(--pos-canvas)]" style={{ fontFamily: 'var(--pos-font)' }}>
                <Loader2 size={22} className="animate-spin text-[var(--pos-ink-3)]" />
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden grid lg:grid-cols-[1.12fr_1fr] bg-[var(--pos-surface)]"
             style={{ fontFamily: 'var(--pos-font)' }}>

            {/* ───────────── product panel ───────────── */}
            <aside className="relative hidden lg:flex flex-col overflow-y-auto text-white"
                   style={{
                       background: 'linear-gradient(165deg, #191C24 0%, #111419 55%, #0B0D12 100%)',
                       padding: 'clamp(28px, 4.2vh, 52px) clamp(36px, 4vw, 60px)',
                   }}>

                <div aria-hidden className="absolute -top-40 -left-28 w-[600px] h-[600px] rounded-full pointer-events-none"
                     style={{ background: 'radial-gradient(circle, rgba(233,84,31,.22), transparent 62%)' }} />
                <div aria-hidden className="absolute inset-0 opacity-[.04] pointer-events-none"
                     style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '58px 58px' }} />

                {/* brand */}
                <div className="relative shrink-0">
                    <Brand layout="row" tone="light" markSize={34} wordSize={17} />
                </div>

                {/* headline + features */}
                <div className="relative flex-1 flex flex-col justify-center" style={{ gap: 'clamp(20px, 3.4vh, 40px)', paddingBlock: 'clamp(20px, 3vh, 40px)' }}>
                    <div>
                        <h1 className="font-bold leading-[1.13] tracking-tight max-w-[13ch]"
                            style={{ fontSize: 'clamp(26px, 3.4vw, 40px)' }}>
                            Manage Your Business
                            <span className="block">
                                <span style={{ background: 'linear-gradient(90deg, var(--pos-brand-from), var(--pos-brand-to))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Smarter</span>
                                , Faster, Better
                            </span>
                        </h1>
                        <p className="text-white/45 mt-3 max-w-[40ch] leading-relaxed" style={{ fontSize: 'clamp(13px, 1.05vw, 15px)' }}>
                            All your Sales, Inventory, Accounts and Reports in one place.
                        </p>
                    </div>

                    <ul className="flex flex-col max-w-[40ch]" style={{ gap: 'clamp(12px, 2.1vh, 22px)' }}>
                        {FEATURES.map(({ icon: Icon, tint, title, sub }) => (
                            <li key={title} className="flex items-center gap-3.5">
                                <span aria-hidden className="grid place-items-center rounded-[10px] shrink-0"
                                      style={{ background: tint, width: 'clamp(34px,3.6vh,42px)', height: 'clamp(34px,3.6vh,42px)' }}>
                                    <Icon size={19} className="text-white" strokeWidth={2.1} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-[12.5px] font-bold tracking-[.09em]" style={{ color: tint }}>{title}</span>
                                    <span className="block text-[12px] text-white/40 leading-snug">{sub}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* trust strip */}
                <div className="relative shrink-0">
                    <div className="rounded-[13px] border border-white/10 bg-white/[.04] grid grid-cols-4 gap-x-4"
                         style={{ padding: 'clamp(12px,1.9vh,20px) clamp(14px,1.6vw,22px)' }}>
                        {TRUST.map(({ icon: Icon, title, sub }) => (
                            <div key={title} className="text-center min-w-0">
                                <Icon size={17} className="mx-auto text-white/70" strokeWidth={1.9} />
                                <div className="text-[11px] font-semibold mt-1.5 truncate">{title}</div>
                                <div className="text-[10px] text-white/35 leading-snug truncate">{sub}</div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10.5px] text-white/25 mt-3.5">
                        © {new Date().getFullYear()} AVS ECOM Private Limited
                    </p>
                </div>
            </aside>

            {/* ───────────── sign-in panel ───────────── */}
            <main className="relative flex items-center justify-center overflow-y-auto bg-[var(--pos-canvas)] px-6 py-8">
                <div className="w-full max-w-[382px]">

                    <Brand layout="stack" markSize={54} wordSize={23} tagline="Billing, Inventory & Accounts" />

                    <div className="text-center" style={{ marginTop: 'clamp(20px, 4vh, 38px)' }}>
                        <h2 className="text-[22px] font-bold text-[var(--pos-ink)] tracking-tight">Welcome Back</h2>
                        <p className="text-[13px] text-[var(--pos-ink-3)] mt-1">Sign in to continue to your account</p>
                    </div>

                    {error && (
                        <div role="alert" className="flex items-start gap-2.5 mt-5 px-3.5 py-2.5 rounded-[var(--pos-r)] bg-[var(--pos-danger-soft)] text-[var(--pos-danger)]">
                            <AlertCircle size={15} className="shrink-0 mt-px" />
                            <span className="text-[12.5px] font-medium">{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="flex flex-col gap-3.5" style={{ marginTop: 'clamp(16px, 3vh, 26px)' }}>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="u" className="text-[12.5px] font-semibold text-[var(--pos-ink-2)]">Username</label>
                            <div className="relative">
                                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pos-ink-3)] pointer-events-none" />
                                <input id="u" type="text" value={username} autoFocus autoComplete="username"
                                    onChange={e => setUsername(e.target.value)}
                                    placeholder="Enter your username"
                                    className="pos-input !h-[43px] !pl-10 !text-[13.5px] !rounded-[var(--pos-r)]" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="p" className="text-[12.5px] font-semibold text-[var(--pos-ink-2)]">Password</label>
                            <div className="relative">
                                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--pos-ink-3)] pointer-events-none" />
                                <input id="p" type={showPassword ? 'text' : 'password'} value={password}
                                    autoComplete="current-password"
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    className="pos-input !h-[43px] !pl-10 !pr-11 !text-[13.5px] !rounded-[var(--pos-r)]" />
                                <button type="button" onClick={() => setShowPassword(v => !v)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className="pos-focusable absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center w-8 h-8 rounded text-[var(--pos-ink-3)] hover:text-[var(--pos-ink-2)] hover:bg-[var(--pos-sunk)]">
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <label className="inline-flex items-center gap-2 cursor-pointer text-[12.5px] text-[var(--pos-ink-2)]">
                                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                                    className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                Remember me
                            </label>
                            <button type="button"
                                onClick={() => setError('Ask an administrator to reset your password from Settings → Users.')}
                                className="pos-focusable text-[12.5px] font-semibold text-[var(--pos-ink-2)] hover:text-[var(--pos-ink)] rounded">
                                Forgot Password?
                            </button>
                        </div>

                        <button type="submit" disabled={loading}
                            className="pos-focusable group flex items-center justify-center gap-2 h-[45px] w-full mt-1 rounded-[var(--pos-r)] text-white text-[14.5px] font-semibold disabled:opacity-60 transition-[filter] hover:brightness-[1.06]"
                            style={{ background: 'linear-gradient(95deg, var(--pos-brand-from), var(--pos-brand-to))' }}>
                            {loading
                                ? <Loader2 size={18} className="animate-spin" />
                                : <>Sign In <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" /></>}
                        </button>
                    </form>

                    <p className="flex items-center justify-center gap-1.5 text-[11.5px] text-[var(--pos-ink-3)]"
                       style={{ marginTop: 'clamp(16px, 3.4vh, 30px)' }}>
                        <Lock size={12} /> Secure sign-in · your session is encrypted
                    </p>
                </div>
            </main>
        </div>
    );
}
