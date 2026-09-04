"use client";
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { BarChart, BookOpen, Grid, Box, ShoppingBag, ScanLine, FileText, LogOut, Users, ShieldCheck, User, Plus, XCircle, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff, KeyRound, Package, ShoppingCart, Hash, Wallet, Receipt, Settings, ClipboardList, Search, Bell, Calendar, ChevronDown, HelpCircle, Truck, Sliders, Undo2 } from 'lucide-react';
import ItemMasterModule from './item-master-module';
import PurchaseModule from './purchase-module';
import PaymentModule from './payment-module';
import ReceiptModule from './receipt-module';
import SettingsModule from './settings-module';
import TokenEntryModule from './token-entry-module';
import InventoryModule from './inventory-module';
import LedgerModule from './ledger-module';
import ProductsModule from './category-module';
import PosModule from './pos-module';
import BarcodeModule from './barcode-module';
import DashboardModule from './dashboard-module';
import StandardReportScreen from '../../components/reports/StandardReportScreen';
import CustomerModule from './customer-module';
import StockUpdationModule from './stock-updation-module';
import PurchaseReturnModule from './purchase-return-module';
import StockAdjustmentModule from './stock-adjustment-module';
import InwardModule from './inward-module';
import PurchaseListModule from './purchase-list-module';
import { RateMasterModule, SizeMasterModule, BrandMasterModule, BrandwiseRateUpdateModule, CategorywiseRateUpdateModule, SalesManModule } from './master-modules';
import TaxMasterModule from './tax-master-module';
import { PosListUsersQuery, PosCreateUserCommand, PosUpdateUserCommand, PosDeleteUserCommand } from '../../core/queries/auth.query';
import { canOpenScreen, roleLabel } from '../../components/pos/permissions';
import QuickCreate from '../../components/pos/quick-create';
import Sidebar from '../../components/pos/sidebar';
import AccountPanel from '../../components/pos/account-panel';
import TopBar from '../../components/pos/topbar';
import { BusinessProfileProvider } from '../../components/pos/profile';
import '../../components/pos/tokens.css';

/**
 * Reached when the screen id in the URL matches no screen — a stale bookmark, a
 * renamed route, or a typed ?s= value. This used to render null, so the whole
 * body went blank with no error anywhere: the page looked broken, not wrong.
 */
function UnknownScreen({ screen, onHome }) {
    return (
        <div className="flex flex-col items-center justify-center h-[70vh] gap-3 text-center px-6">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--pos-ink)' }}>
                Screen not found
            </div>
            <div className="text-[13px] max-w-[380px]" style={{ color: 'var(--pos-ink-3)' }}>
                There is no screen called <span style={{ fontFamily: 'var(--pos-mono)' }}>{screen || '—'}</span>.
                The link may be out of date.
            </div>
            <button type="button" onClick={onHome} className="pos-btn pos-btn--default mt-1">
                Go to Dashboard
            </button>
        </div>
    );
}

/**
 * Auto-collapse the sidebar when the window cannot hold it plus a usable top bar.
 *
 * The sidebar held a fixed 228px at every width, so on a narrow window the top bar
 * ran out of room and the primary action, theme toggle, notifications and user menu
 * were pushed off screen entirely. Below 1180px the nav drops to icons, which frees
 * 166px — enough for the whole bar. An explicit collapse by the operator still wins.
 */
function useAutoCollapse(manual) {
    const [narrow, setNarrow] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1180px)');
        const apply = () => setNarrow(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);
    return narrow || manual;
}

/**
 * Shown when the signed-in role lacks the permission for a screen. A blank panel
 * reads as a bug; this says what happened and who can change it.
 */
function NoAccess({ screen }) {
    return (
        <div className="h-full grid place-items-center bg-white border border-slate-200 rounded-xl">
            <div className="text-center px-6 py-14 max-w-[420px]">
                <div className="mx-auto grid place-items-center w-11 h-11 rounded-full bg-slate-100 text-slate-400 mb-3">
                    <ShieldCheck size={20}/>
                </div>
                <p className="text-[14px] font-semibold text-slate-800">You do not have access to this screen</p>
                <p className="text-[12.5px] text-slate-500 mt-1.5">
                    Your role does not include the permission required for <b>{screen}</b>.
                    An administrator can grant it in Settings &rarr; Roles.
                </p>
            </div>
        </div>
    );
}

// ── User Management Module ──
function UserManagementModule() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [form, setForm] = useState({ username: '', password: '', displayName: '', role: 'user' });
    const [showPass, setShowPass] = useState(false);
    const [resetPassOpen, setResetPassOpen] = useState(null); // user id
    const [newPass, setNewPass] = useState('');

    useEffect(() => { fetchUsers(); }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const list = await new PosListUsersQuery().execute();
            setUsers(list);
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    const handleCreate = async () => {
        if (!form.username.trim() || !form.password.trim()) return alert('Username and password required.');
        try {
            await new PosCreateUserCommand().execute({
                username: form.username.trim(),
                password: form.password,
                role: form.role,
                displayName: form.displayName.trim() || form.username.trim(),
            });
            setAddOpen(false);
            setForm({ username: '', password: '', displayName: '', role: 'user' });
            fetchUsers();
        } catch (err) { alert(err.message); }
    };

    const handleToggleActive = async (u) => {
        if (u.role === 'admin') return;
        try {
            await new PosUpdateUserCommand().execute(u.id, { active: !u.active });
            fetchUsers();
        } catch (err) { alert(err.message); }
    };

    const handleDelete = async (u) => {
        if (u.role === 'admin') return;
        if (!confirm(`Delete user "${u.username}"?`)) return;
        try {
            await new PosDeleteUserCommand().execute(u.id);
            fetchUsers();
        } catch (err) { alert(err.message); }
    };

    const handleResetPassword = async () => {
        if (!newPass.trim()) return alert('Enter new password.');
        try {
            await new PosUpdateUserCommand().execute(resetPassOpen, { password: newPass });
            setResetPassOpen(null);
            setNewPass('');
            alert('Password reset successfully.');
        } catch (err) { alert(err.message); }
    };

    return (
        <div className="flex flex-col h-[85vh] text-slate-800 bg-slate-50 w-full rounded-2xl overflow-hidden font-sans border border-slate-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5 shrink-0 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-black text-white tracking-wide flex items-center gap-2"><Users size={22}/> User Management</h1>
                    <p className="text-slate-700 text-xs font-bold mt-1">Create and manage POS users</p>
                </div>
                <button onClick={() => { setForm({ username: '', password: '', displayName: '', role: 'user' }); setAddOpen(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-white rounded-xl font-black text-sm uppercase tracking-widest transition shadow-lg shadow-teal-500/30 active:scale-95">
                    <Plus size={18}/> Create User
                </button>
            </div>

            {/* Users Table */}
            <div className="flex-1 overflow-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64 text-slate-700">Loading...</div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-[#f8fafc] border-b border-slate-200">
                                <tr>
                                    <th className="p-4 px-6 text-xs uppercase font-black tracking-widest text-slate-700">User</th>
                                    <th className="p-4 text-xs uppercase font-black tracking-widest text-slate-700">Role</th>
                                    <th className="p-4 text-xs uppercase font-black tracking-widest text-slate-700">Status</th>
                                    <th className="p-4 text-xs uppercase font-black tracking-widest text-slate-700">Created</th>
                                    <th className="p-4 text-center text-xs uppercase font-black tracking-widest text-slate-700">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users.map(u => (
                                    <tr key={u.id} className="hover:bg-slate-50 transition">
                                        <td className="p-4 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-sm ${u.role === 'admin' ? 'bg-gradient-to-br from-teal-500 to-teal-600' : 'bg-gradient-to-br from-emerald-500 to-emerald-600'}`}>
                                                    {u.role === 'admin' ? <ShieldCheck size={18}/> : <User size={18}/>}
                                                </div>
                                                <div>
                                                    <p className="font-black text-slate-800">{u.displayName}</p>
                                                    <p className="text-[10px] font-bold text-slate-700">@{u.username}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${u.role === 'admin' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            {u.active ? (
                                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase border border-emerald-200">Active</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-black uppercase border border-red-200">Disabled</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-sm text-slate-800 font-bold">
                                            {new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="p-4">
                                            {u.role !== 'admin' ? (
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => { setResetPassOpen(u.id); setNewPass(''); }} className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-800 hover:text-blue-600 transition" title="Reset Password"><KeyRound size={16}/></button>
                                                    <button onClick={() => handleToggleActive(u)} className="p-2 rounded-lg bg-slate-100 hover:bg-amber-50 text-slate-800 hover:text-amber-600 transition" title={u.active ? 'Disable' : 'Enable'}>
                                                        {u.active ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                                                    </button>
                                                    <button onClick={() => handleDelete(u)} className="p-2 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-800 hover:text-red-600 transition" title="Delete"><Trash2 size={16}/></button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center">
                                                    <button onClick={() => { setResetPassOpen(u.id); setNewPass(''); }} className="p-2 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-800 hover:text-blue-600 transition" title="Reset Password"><KeyRound size={16}/></button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create User Modal */}
            {addOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl overflow-hidden">
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-center text-white relative">
                            <button onClick={() => setAddOpen(false)} className="absolute top-4 right-4 text-slate-700 hover:text-white transition"><XCircle size={22}/></button>
                            <div className="inline-flex p-3 rounded-full bg-teal-500/20 mb-3"><Users size={24} className="text-teal-400"/></div>
                            <h2 className="text-lg font-black uppercase tracking-widest text-teal-400">Create User</h2>
                        </div>
                        <div className="p-6 bg-slate-50 space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Display Name</label>
                                <input type="text" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} placeholder="e.g., Ravi Kumar" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Username *</label>
                                <input type="text" value={form.username} onChange={e => setForm({...form, username: e.target.value})} placeholder="e.g., ravi" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Password *</label>
                                <div className="relative">
                                    <input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="Min 4 characters" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white pr-10"/>
                                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-900">{showPass ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Role</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setForm({...form, role: 'user'})} className={`p-3 rounded-xl border-2 text-sm font-black uppercase tracking-wider transition flex items-center justify-center gap-2 ${form.role === 'user' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-700'}`}>
                                        <User size={16}/> User
                                    </button>
                                    <button type="button" onClick={() => setForm({...form, role: 'admin'})} className={`p-3 rounded-xl border-2 text-sm font-black uppercase tracking-wider transition flex items-center justify-center gap-2 ${form.role === 'admin' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-700'}`}>
                                        <ShieldCheck size={16}/> Admin
                                    </button>
                                </div>
                            </div>
                            <button onClick={handleCreate} className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-xl font-black uppercase tracking-widest text-sm transition shadow-lg shadow-teal-500/30 active:scale-[0.98]">
                                Create User
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {resetPassOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white max-w-sm w-full rounded-2xl shadow-2xl overflow-hidden">
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-center text-white relative">
                            <button onClick={() => setResetPassOpen(null)} className="absolute top-4 right-4 text-slate-700 hover:text-white transition"><XCircle size={22}/></button>
                            <KeyRound size={24} className="text-teal-400 mx-auto mb-2"/>
                            <h2 className="text-lg font-black uppercase tracking-widest text-teal-400">Reset Password</h2>
                        </div>
                        <div className="p-6 bg-slate-50 space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">New Password</label>
                                <input type="text" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Enter new password" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                            </div>
                            <button onClick={handleResetPassword} className="w-full py-3 bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-xl font-black uppercase tracking-widest text-sm transition active:scale-[0.98]">
                                Reset Password
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── MAIN DASHBOARD ──
export default function VendureDashboard() {
    const [session, setSession] = useState(null);
    const [checking, setChecking] = useState(true);
    const [activeTab, setActiveTab] = useState(null);
    const activeTabRef = useRef(null);
    const [settingsSection, setSettingsSection] = useState('configuration');
    const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
    const [reportSection, setReportSection] = useState('purchase');
    const [reportMenuOpen, setReportMenuOpen] = useState(false);
    const [purchaseMenuOpen, setPurchaseMenuOpen] = useState(false);
    const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
    const [activeCompany, setActiveCompany] = useState({ name: 'AVS ECOM PRIVATE LIMITED', financialYear: '2026-2027' });
    const [enabledSections, setEnabledSections] = useState({});

    // Sidebar hover-to-reveal when collapsed (auto-collapse on POS page)
    const [sidebarHover, setSidebarHover] = useState(false);
    // Reports submenu expanded state
    const [reportsExpanded, setReportsExpanded] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const [navCollapsed, setNavCollapsed] = useState(false);
    const autoCollapsed = useAutoCollapse(navCollapsed);

    // Read active company + section visibility from localStorage. Re-read on window focus and storage events.
    useEffect(() => {
        const refresh = () => {
            try {
                const list = JSON.parse(localStorage.getItem('pharma_companies') || '[]');
                const activeId = localStorage.getItem('pharma_active_company') || '';
                const active = list.find(c => c.id === activeId) || list[0];
                if (active && active.name) {
                    setActiveCompany({ name: active.name, financialYear: active.financialYear || '2026-2027' });
                }
            } catch {}
            try {
                const props = JSON.parse(localStorage.getItem('pharma_config_properties') || '[]');
                const map = {};
                props.forEach(p => { map[p.name] = !!p.bitValue; });
                setEnabledSections(map);
            } catch {}
        };
        refresh();
        window.addEventListener('focus', refresh);
        window.addEventListener('storage', refresh);
        return () => {
            window.removeEventListener('focus', refresh);
            window.removeEventListener('storage', refresh);
        };
    }, [activeTab]);

    // Section visibility helper — when no config saved, all visible by default
    const isSectionEnabled = (name) => enabledSections[name] !== false;

    // Esc key → close current section back to home (always works, even from inputs)
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            if (!activeTab) return;
            // If any visible modal/popup is on screen, let it handle Esc first (don't close section).
            // We detect this by looking for elements with z-[200] / z-[210] (our modal layers) or role="dialog".
            const hasOpenModal = !!document.querySelector('[role="dialog"], .fixed.z-\\[200\\], .fixed.z-\\[210\\], .fixed.inset-0.bg-black\\/60, .fixed.inset-0.bg-slate-900\\/50, .fixed.inset-0.bg-slate-900\\/60, .fixed.inset-0.bg-black\\/70');
            if (hasOpenModal) return;
            // Blur any focused input first so the user clearly leaves the field, then close the section
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
            setActiveTab('dashboard');
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [activeTab]);

    // Auth guard: check session on mount
    useEffect(() => {
        const raw = localStorage.getItem('pos_session');
        if (!raw) {
            window.location.href = '/login';
            return;
        }
        try {
            const s = JSON.parse(raw);
            if (!s.token || !s.role) {
                window.location.href = '/login';
                return;
            }
            setSession(s);
            // Set default tab based on role
            // Land on the real Dashboard module. The old inline 'home' screen was a
            // second, duplicate dashboard and has been removed. A cashier whose role
            // cannot open the dashboard goes straight to the billing counter.
            const startPerms = Array.isArray(s.permissions) && s.permissions.length
                ? s.permissions
                : (s.role === 'admin' ? ['SuperAdmin'] : ['CreateOrder']);
            const landing = canOpenScreen(startPerms, 'dashboard') ? 'dashboard' : 'pos';
            // Restore the screen from the URL so a reload — and a back/forward —
            // returns to where the operator was, not to the landing screen.
            const fromUrl = new URLSearchParams(window.location.search).get('s');
            const start = fromUrl && canOpenScreen(startPerms, fromUrl) ? fromUrl : landing;
            setActiveTab(start);
            window.history.replaceState({ tab: start }, '', '/dashboard?s=' + start);
            setChecking(false);
        } catch {
            window.location.href = '/login';
        }
    }, []);

    /**
     * Change screen AND record it in browser history.
     *
     * The dashboard is one route with the screen held in React state, so Back had
     * nothing to return to inside the app and landed on whatever preceded
     * /dashboard. Every screen change now pushes an entry, and `popstate` puts it
     * back — so Back walks the screens the operator actually visited.
     */
    const navigate = React.useCallback((tab) => {
        if (typeof window === 'undefined') return;
        // The comparison reads a ref, not state, so this stays a stable callback
        // without the push living inside a setState updater. React runs updaters
        // during render, and Next patches history.pushState to sync its Router —
        // pushing in there updated Router mid-render ("Cannot update a component
        // (`Router`) while rendering a different component") and double-pushed
        // under StrictMode, which put a phantom entry in the Back stack.
        if (activeTabRef.current === tab) return;
        activeTabRef.current = tab;
        window.history.pushState({ tab }, '', '/dashboard?s=' + tab);
        setActiveTab(tab);
    }, []);

    // Mirrors activeTab so navigate() can compare without depending on it. Every
    // path that changes the screen — popstate, the auth guard, Escape — flows
    // through here, so the ref never drifts from what is on screen.
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    useEffect(() => {
        const onPop = (e) => {
            const tab = e.state?.tab || new URLSearchParams(window.location.search).get('s');
            if (tab) setActiveTab(tab);
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    /**
     * Sign out.
     *
     * `replace` rather than `href`, so the dashboard is not left as the previous
     * history entry — pressing Back after signing out must not re-enter the app.
     * Older dashboard entries further back are harmless: with the session gone the
     * screen bounces straight to /login on mount.
     */
    const handleLogout = () => {
        try {
            localStorage.removeItem('pos_session');
            sessionStorage.clear();
        } catch { /* private mode */ }
        window.location.replace('/login');
    };

    if (checking || !session) {
        return <div className="flex items-center justify-center h-screen bg-slate-100 text-slate-700 font-bold">Loading...</div>;
    }

    // Access is decided by the Vendure permissions on the session, not by a
    // single admin flag. A session saved before RBAC existed falls back to the
    // coarse role inside readSession()/canOpenScreen so nobody is locked out.
    const perms = Array.isArray(session.permissions) && session.permissions.length
        ? session.permissions
        : (session.role === 'admin' ? ['SuperAdmin'] : ['CreateOrder', 'ReadCatalog', 'ReadCustomer']);
    const can = (screenId) => canOpenScreen(perms, screenId);
    const isAdmin = can('settings') || can('users');

    // Menu items based on role
    const adminMenuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart },
        { id: 'token', label: 'Token Entry', icon: Hash },
        { id: 'itemmaster', label: 'Item', icon: Package },
        { id: 'purchase', label: 'Purchase', icon: ShoppingCart },
        { id: 'payment', label: 'Payment', icon: Wallet },
        { id: 'receipt', label: 'Receipt', icon: Receipt },
        { id: 'pos', label: 'Sales', icon: ShoppingBag },
        { id: 'inventory', label: 'Stock / Inventory', icon: Box },
        { id: 'stock-adjustment', label: 'Stock Adjustment', icon: Sliders },
        { id: 'purchase-return', label: 'Purchase Return', icon: Undo2 },
        { id: 'category', label: 'Products (Vendure)', icon: Grid },
        { id: 'barcode', label: 'Barcode', icon: ScanLine },
        { id: 'ledger', label: 'Ledger', icon: BookOpen },
        { id: 'customers', label: 'Customers', icon: User },
        { id: 'report', label: 'Reports', icon: FileText },
        { id: 'users', label: 'User Management', icon: Users },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    const menuItems = adminMenuItems.filter(m => can(m.id));

    const renderContent = () => {
        const content = (() => {
            switch (activeTab) {
                case 'dashboard': return can('dashboard') ? <DashboardModule setActiveTab={navigate} /> : <NoAccess screen="dashboard" />;
                case 'token': return can('token') ? <TokenEntryModule /> : <NoAccess screen="token" />;
                case 'itemmaster': return can('itemmaster') ? <ItemMasterModule /> : <NoAccess screen="itemmaster" />;
                case 'purchase': return can('purchase') ? <PurchaseModule /> : <NoAccess screen="purchase" />;
                case 'stock-updation': return can('stock-updation') ? <StockUpdationModule /> : <NoAccess screen="stock-updation" />;
                case 'purchase-return': return can('purchase-return') ? <PurchaseReturnModule /> : <NoAccess screen="purchase-return" />;
                case 'stock-adjustment': return can('stock-adjustment') ? <StockAdjustmentModule /> : <NoAccess screen="stock-adjustment" />;
                case 'inward': return can('inward') ? <InwardModule /> : <NoAccess screen="inward" />;
                case 'purchase-list': return can('purchase-list') ? <PurchaseListModule /> : <NoAccess screen="purchase-list" />;
                case 'tax-master': return can('tax-master') ? <TaxMasterModule /> : <NoAccess screen="tax-master" />;
                case 'rate-master': return can('rate-master') ? <RateMasterModule /> : <NoAccess screen="rate-master" />;
                case 'size-master': return can('size-master') ? <SizeMasterModule /> : <NoAccess screen="size-master" />;
                case 'brand-master': return can('brand-master') ? <BrandMasterModule /> : <NoAccess screen="brand-master" />;
                case 'brandwise-rate': return can('brandwise-rate') ? <BrandwiseRateUpdateModule /> : <NoAccess screen="brandwise-rate" />;
                case 'categorywise-rate': return can('categorywise-rate') ? <CategorywiseRateUpdateModule /> : <NoAccess screen="categorywise-rate" />;
                case 'salesman': return can('salesman') ? <SalesManModule /> : <NoAccess screen="salesman" />;
                case 'payment': return can('payment') ? <PaymentModule /> : <NoAccess screen="payment" />;
                case 'receipt': return can('receipt') ? <ReceiptModule /> : <NoAccess screen="receipt" />;
                case 'pos': return <PosModule />;
                case 'inventory': return can('inventory') ? <InventoryModule /> : <NoAccess screen="inventory" />;
                case 'category': return can('category') ? <ProductsModule /> : <NoAccess screen="category" />;
                case 'barcode': return can('barcode') ? <BarcodeModule /> : <NoAccess screen="barcode" />;
                case 'ledger': return can('ledger') ? <LedgerModule setActiveTab={navigate} /> : <NoAccess screen="ledger" />;
                case 'customers': return can('customers') ? <CustomerModule /> : <NoAccess screen="customers" />;
                case 'report': return can('report') ? <StandardReportScreen reportId={reportSection} key={reportSection}/> : <NoAccess screen="report" />;
                case 'users': return can('users') ? <UserManagementModule /> : <NoAccess screen="users" />;
                case 'settings': return can('settings') ? <SettingsModule section={settingsSection} onChangeSection={setSettingsSection}/> : <NoAccess screen="settings" />;
                default: return <UnknownScreen screen={activeTab} onHome={() => navigate('dashboard')} />;
            }
        })();
        return (
            <Suspense fallback={
                <div className="flex items-center justify-center h-[80vh] text-[13px]"
                     style={{ color: 'var(--pos-ink-3)' }}>
                    Loading...
                </div>
            }>{content}</Suspense>
        );
    };

    // ── USER ROLE: POS Only (no sidebar) ──
    if (!isAdmin) {
        return (
            <div className="flex flex-col h-screen bg-slate-100 font-sans">
                {/* Minimal top bar */}
                <div className="h-14 bg-slate-900 flex items-center justify-between px-6 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-white tracking-widest">AVS ECOM</span>
                        <span className="text-[10px] text-slate-800 uppercase tracking-widest ml-2">POS Terminal</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                                <User size={16} className="text-white"/>
                            </div>
                            <span className="text-white text-sm font-bold">{session.displayName}</span>
                        </div>
                        <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-red-600 text-slate-700 hover:text-white rounded-lg text-xs font-bold uppercase tracking-widest transition">
                            <LogOut size={14}/> Logout
                        </button>
                    </div>
                </div>
                {/* POS Module Full Screen */}
                <main className="flex-1 overflow-hidden p-4">
                    <PosModule />
                </main>
            </div>
        );
    }

    // ── Top toolbar icons (horizontal bar) — filtered by Configuration toggles ──
    const allToolbarItems = [
        { id: 'dashboard', label: 'Account\nMaster', icon: ClipboardList, bg: '#e74c3c', cfg: 'Show Account Master' },
        { id: 'ledger', label: 'Supplier', icon: BookOpen, bg: '#3498db', cfg: 'Show Supplier' },
        { id: 'customers', label: 'Customer', icon: User, bg: '#2ecc71', cfg: 'Show Customer' },
        { id: 'category', label: 'Category', icon: Grid, bg: '#f39c12', cfg: 'Show Category', hasCategoryDropdown: true },
        { id: 'inventory', label: 'Inventory', icon: Box, bg: '#9b59b6', cfg: 'Show Inventory' },
        { id: 'purchase', label: 'Purchase', icon: ShoppingCart, bg: '#1abc9c', cfg: 'Show Purchase', hasPurchaseDropdown: true },
        { id: 'pos', label: 'Sales', icon: ShoppingBag, bg: '#e67e22', cfg: 'Show Sales' },
        { id: 'barcode', label: 'Barcode', icon: ScanLine, bg: '#34495e', cfg: 'Show Barcode' },
        { id: 'report', label: 'Reports', icon: FileText, bg: '#2980b9', cfg: 'Show Reports', hasReportDropdown: true },
        { id: 'dashboard', label: 'DayBook\nEntry', icon: ClipboardList, bg: '#8e44ad', cfg: 'Show DayBook Entry' },
        { id: 'settings', label: 'Settings', icon: Settings, bg: '#7f8c8d', hasDropdown: true },
        { id: '_logout', label: 'Logout', icon: LogOut, bg: '#c0392b' },
    ];
    const toolbarItems = allToolbarItems.filter(it => !it.cfg || isSectionEnabled(it.cfg));

    // ── Left sidebar buttons — filtered by Configuration toggles ──
    const allSidebarItems = [
        { id: 'token', label: 'Token Entry', icon: Hash, bg: '#e67e22', cfg: 'Show Token Entry' },
        { id: 'itemmaster', label: 'Item', icon: Package, bg: '#3498db', cfg: 'Show Item Master' },
        { id: 'purchase', label: 'Purchase', icon: ShoppingCart, bg: '#1abc9c', cfg: 'Show Purchase' },
        { id: 'pos', label: 'Sales', icon: ShoppingBag, bg: '#2ecc71', cfg: 'Show Sales' },
        { id: 'payment', label: 'Payment', icon: Wallet, bg: '#27ae60', cfg: 'Show Payment' },
        { id: 'receipt', label: 'Receipt', icon: Receipt, bg: '#16a085', cfg: 'Show Receipt' },
        { id: 'ledger', label: 'Ledger', icon: BookOpen, bg: '#2980b9', cfg: 'Show Customer Ledger' },
        { id: 'report', label: 'Reports', icon: FileText, bg: '#8e44ad', cfg: 'Show Reports' },
    ];
    const sidebarItems = allSidebarItems.filter(it => !it.cfg || isSectionEnabled(it.cfg));

    // Home/welcome screen


    // ── ADMIN ROLE: Modern Sidebar Dashboard Layout ──
    const initials = (session.displayName || session.username || 'A').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
    const activeMenu = adminMenuItems.find(m => m.id === activeTab);
    const sectionTitle = activeMenu ? activeMenu.label : 'Dashboard';

    // Auto-collapse sidebar when POS (Sales) is open. Hover left edge to peek.
    const isPosOpen = activeTab === 'pos';
    const sidebarCollapsed = isPosOpen && !sidebarHover;

    return (
    <div className="flex h-screen font-sans select-none bg-slate-100 overflow-hidden relative">

      {/* Invisible left-edge hover zone — wakes the sidebar when collapsed on Sales page */}
      {isPosOpen && (
        <div
          onMouseEnter={() => setSidebarHover(true)}
          className="fixed left-0 top-0 w-2 h-full z-[60]"
          aria-hidden="true"
        />
      )}

      {/* ═══ LEFT SIDEBAR ═══
          Grouped navigation lives in components/pos/sidebar.jsx. It used to be a
          flat list with a different gradient per item, which is what made the app
          look like a toy. On the billing screen it collapses to give the counter
          the full width. */}
      <Sidebar
        activeTab={activeTab}
        onNavigate={navigate}
        permissions={perms}
        session={session}
        financialYear={activeCompany.financialYear}
        collapsed={autoCollapsed || sidebarCollapsed}
        onToggleCollapse={() => setNavCollapsed(v => !v)}
        onLogout={handleLogout}
        onOpenProfile={() => setAccountOpen(true)}
      />

      {/* ═══ MAIN AREA ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar — business profile, outlet, search, primary action, user.
            The profile decides what every other screen means, so it comes first. */}
        <TopBar
          session={session}
          activeCompany={activeCompany}
          outlets={[]}
          onLogout={handleLogout}
          onOpenProfile={() => setAccountOpen(true)}
          onPrimaryAction={() => navigate('pos')}
          onNavigate={navigate}
          quickCreate={<QuickCreate permissions={perms} onNavigate={navigate} />}
        />

        {/* Content area — each module owns its own scrolling */}
        <main className="flex-1 overflow-hidden" style={{ background: 'var(--pos-canvas)' }}>
          <div className="h-full overflow-hidden">{renderContent()}</div>
        </main>

        {/* Bottom status bar */}
        <div className="h-7 shrink-0 bg-white border-t border-slate-200 px-6 flex items-center justify-between text-[10px] font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>
            <span>Ready</span>
          </div>
          <span>{activeCompany.name} · {activeCompany.financialYear}</span>
          <span>{new Date().toLocaleString('en-IN', {weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true})}</span>
        </div>
      </div>

      {/* Own profile and password. Opened from the sidebar footer — until now there
          was nowhere in the app for a user to change their own password. */}
      {accountOpen && <AccountPanel session={session} onClose={() => setAccountOpen(false)} />}
    </div>
    );
}