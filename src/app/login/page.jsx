"use client";
import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, LogIn, AlertCircle, User } from 'lucide-react';
import { VendureLoginCommand, MeQuery } from '../../core/queries/auth.query';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Auto-redirect ONLY if saved session is still valid on the server (Me query check)
    useEffect(() => {
        (async () => {
            const raw = localStorage.getItem('pos_session');
            if (!raw) return;
            const me = await new MeQuery().execute();
            if (me?.id) {
                window.location.href = '/dashboard';
            } else {
                localStorage.removeItem('pos_session');
            }
        })();
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            setError('Please enter both username and password.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            // Single GraphQL login hit — role auto-detected from returned permissions
            const result = await new VendureLoginCommand().execute(username.trim(), password);
            localStorage.setItem('pos_session', JSON.stringify({
                token: result.token,
                userId: result.userId,
                username: result.username,
                role: result.role,
                displayName: result.displayName,
            }));
            window.location.href = '/dashboard';
        } catch (err) {
            setError(err.message || 'Login failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <span className="text-4xl font-black text-white tracking-widest block mb-2">AVS ECOM</span>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Billing Solutions</p>
                </div>

                <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
                    <div className="px-8 py-6 text-center bg-gradient-to-r from-teal-600/20 to-emerald-500/10 border-b border-teal-500/20">
                        <div className="inline-flex p-3 rounded-full mb-3 bg-teal-500/20">
                            <User size={28} className="text-teal-400"/>
                        </div>
                        <h2 className="text-lg font-black uppercase tracking-widest text-teal-400">Sign In</h2>
                        <p className="text-slate-500 text-xs font-bold mt-1">Role detected automatically from account</p>
                    </div>

                    <form onSubmit={handleLogin} className="p-8 space-y-5">
                        {error && (
                            <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-bold">
                                <AlertCircle size={18}/> {error}
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Username / Email</label>
                            <input
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="admin@avsecom.com"
                                autoFocus
                                autoComplete="username"
                                className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white text-sm font-bold placeholder:text-slate-600 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    autoComplete="current-password"
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-xl p-3.5 text-white text-sm font-bold placeholder:text-slate-600 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 pr-12 transition"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                                >
                                    {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 rounded-xl font-black uppercase tracking-widest text-sm text-white transition shadow-lg active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 bg-gradient-to-r from-teal-600 to-emerald-500 hover:from-teal-500 hover:to-emerald-400 shadow-teal-500/30"
                        >
                            {loading ? <span className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"/> : <><LogIn size={18}/> Sign In</>}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
