"use client";
import React, { useState, useEffect, Suspense } from 'react';
import { BarChart, BookOpen, Grid, Box, ShoppingBag, ScanLine, FileText, LogOut, Users, ShieldCheck, User, Plus, XCircle, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff, KeyRound, Package, ShoppingCart, Hash, Wallet, Receipt, Settings, ClipboardList, Search, Bell, Calendar, Sparkles, ChevronDown, HelpCircle, Truck, TrendingUp } from 'lucide-react';
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
import { TaxMasterModule, RateMasterModule, SizeMasterModule, BrandMasterModule, BrandwiseRateUpdateModule, CategorywiseRateUpdateModule, SalesManModule } from './master-modules';
import { PosListUsersQuery, PosCreateUserCommand, PosUpdateUserCommand, PosDeleteUserCommand } from '../../core/queries/auth.query';

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
            if (!activeTab || activeTab === 'home') return;
            // If any visible modal/popup is on screen, let it handle Esc first (don't close section).
            // We detect this by looking for elements with z-[200] / z-[210] (our modal layers) or role="dialog".
            const hasOpenModal = !!document.querySelector('[role="dialog"], .fixed.z-\\[200\\], .fixed.z-\\[210\\], .fixed.inset-0.bg-black\\/60, .fixed.inset-0.bg-slate-900\\/50, .fixed.inset-0.bg-slate-900\\/60, .fixed.inset-0.bg-black\\/70');
            if (hasOpenModal) return;
            // Blur any focused input first so the user clearly leaves the field, then close the section
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
            setActiveTab('home');
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
            setActiveTab(s.role === 'admin' ? 'home' : 'pos');
            setChecking(false);
        } catch {
            window.location.href = '/login';
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('pos_session');
        window.location.href = '/login';
    };

    if (checking || !session) {
        return <div className="flex items-center justify-center h-screen bg-slate-100 text-slate-700 font-bold">Loading...</div>;
    }

    const isAdmin = session.role === 'admin';

    // Menu items based on role
    const adminMenuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart },
        { id: 'token', label: 'Token Entry', icon: Hash },
        { id: 'itemmaster', label: 'Item Master', icon: Package },
        { id: 'purchase', label: 'Purchase', icon: ShoppingCart },
        { id: 'payment', label: 'Payment', icon: Wallet },
        { id: 'receipt', label: 'Receipt', icon: Receipt },
        { id: 'pos', label: 'Sales', icon: ShoppingBag },
        { id: 'inventory', label: 'Stock / Inventory', icon: Box },
        { id: 'category', label: 'Products (Vendure)', icon: Grid },
        { id: 'barcode', label: 'Barcode', icon: ScanLine },
        { id: 'ledger', label: 'Ledger', icon: BookOpen },
        { id: 'customers', label: 'Customers', icon: User },
        { id: 'report', label: 'Reports', icon: FileText },
        { id: 'users', label: 'User Management', icon: Users },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    const menuItems = isAdmin ? adminMenuItems : [];

    const renderContent = () => {
        const content = (() => {
            switch (activeTab) {
                case 'dashboard': return isAdmin ? <DashboardModule /> : null;
                case 'token': return isAdmin ? <TokenEntryModule /> : null;
                case 'itemmaster': return isAdmin ? <ItemMasterModule /> : null;
                case 'purchase': return isAdmin ? <PurchaseModule /> : null;
                case 'stock-updation': return isAdmin ? <StockUpdationModule /> : null;
                case 'purchase-return': return isAdmin ? <PurchaseReturnModule /> : null;
                case 'stock-adjustment': return isAdmin ? <StockAdjustmentModule /> : null;
                case 'inward': return isAdmin ? <InwardModule /> : null;
                case 'purchase-list': return isAdmin ? <PurchaseListModule /> : null;
                case 'tax-master': return isAdmin ? <TaxMasterModule /> : null;
                case 'rate-master': return isAdmin ? <RateMasterModule /> : null;
                case 'size-master': return isAdmin ? <SizeMasterModule /> : null;
                case 'brand-master': return isAdmin ? <BrandMasterModule /> : null;
                case 'brandwise-rate': return isAdmin ? <BrandwiseRateUpdateModule /> : null;
                case 'categorywise-rate': return isAdmin ? <CategorywiseRateUpdateModule /> : null;
                case 'salesman': return isAdmin ? <SalesManModule /> : null;
                case 'payment': return isAdmin ? <PaymentModule /> : null;
                case 'receipt': return isAdmin ? <ReceiptModule /> : null;
                case 'pos': return <PosModule />;
                case 'inventory': return isAdmin ? <InventoryModule /> : null;
                case 'category': return isAdmin ? <ProductsModule /> : null;
                case 'barcode': return isAdmin ? <BarcodeModule /> : null;
                case 'ledger': return isAdmin ? <LedgerModule /> : null;
                case 'customers': return isAdmin ? <CustomerModule /> : null;
                case 'report': return isAdmin ? <StandardReportScreen reportId={reportSection} key={reportSection}/> : null;
                case 'users': return isAdmin ? <UserManagementModule /> : null;
                case 'settings': return isAdmin ? <SettingsModule section={settingsSection} onChangeSection={setSettingsSection}/> : null;
                default: return null;
            }
        })();
        return <Suspense fallback={<div className="flex items-center justify-center h-[80vh] text-slate-700">Loading...</div>}>{content}</Suspense>;
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
        { id: 'itemmaster', label: 'Item Master', icon: Package, bg: '#3498db', cfg: 'Show Item Master' },
        { id: 'purchase', label: 'Purchase', icon: ShoppingCart, bg: '#1abc9c', cfg: 'Show Purchase' },
        { id: 'pos', label: 'Sales', icon: ShoppingBag, bg: '#2ecc71', cfg: 'Show Sales' },
        { id: 'payment', label: 'Payment', icon: Wallet, bg: '#27ae60', cfg: 'Show Payment' },
        { id: 'receipt', label: 'Receipt', icon: Receipt, bg: '#16a085', cfg: 'Show Receipt' },
        { id: 'ledger', label: 'Ledger', icon: BookOpen, bg: '#2980b9', cfg: 'Show Customer Ledger' },
        { id: 'report', label: 'Reports', icon: FileText, bg: '#8e44ad', cfg: 'Show Reports' },
    ];
    const sidebarItems = allSidebarItems.filter(it => !it.cfg || isSectionEnabled(it.cfg));

    // Home/welcome screen
    const showHome = activeTab === 'home' || activeTab === null;

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

      {/* ═══ LEFT SIDEBAR (dark) — slides out on POS page ═══ */}
      <aside
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
        className={`shrink-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-slate-200 flex flex-col border-r border-slate-700/50 transition-all duration-300 ease-in-out overflow-hidden ${
          sidebarCollapsed ? 'w-0 -ml-1 opacity-0' : 'w-[220px] opacity-100 shadow-xl shadow-slate-900/30'
        } ${isPosOpen && sidebarHover ? 'fixed inset-y-0 left-0 z-50' : ''}`}>
        {/* Brand */}
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-slate-700/40">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <ShoppingBag size={18} className="text-white"/>
          </div>
          <div>
            <div className="text-white font-black text-[15px] tracking-tight leading-none">AVS ECOM</div>
            <div className="text-slate-400 text-[9px] font-bold tracking-widest uppercase mt-1">POS · {activeCompany.financialYear}</div>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-0.5">
          {adminMenuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const isReports = item.id === 'report';
            const reportSubitems = [
                { id: 'purchase', label: 'Purchase Report', icon: ShoppingCart, num: 1 },
                { id: 'sales',    label: 'Sales Report',    icon: ShoppingBag, num: 2 },
                { id: 'stock',    label: 'Stock Report',    icon: Box,         num: 3 },
                { id: 'expense',  label: 'Expense Report',  icon: Wallet,      num: 4 },
                { id: 'daybook',  label: 'Day Book',        icon: BookOpen,    num: 5 },
            ];

            if (isReports) {
                return (
                <div key={item.id}>
                    <button onClick={() => setReportsExpanded(p => !p)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-bold transition group ${
                          isActive
                            ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/10 text-white border border-indigo-400/30 shadow-md'
                            : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}>
                        <Icon size={16} className={isActive ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-300'}/>
                        <span className="flex-1 text-left">{item.label}</span>
                        <ChevronDown size={14} className={`transition-transform duration-200 ${reportsExpanded ? 'rotate-180' : ''} ${isActive ? 'text-indigo-300' : 'text-slate-500'}`}/>
                    </button>
                    {/* Smooth expand/collapse submenu */}
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${reportsExpanded ? 'max-h-80 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                        <div className="ml-3 pl-3 border-l border-slate-700/50 space-y-0.5 py-1">
                            {reportSubitems.map(sub => {
                                const SubIcon = sub.icon;
                                const subActive = activeTab === 'report' && reportSection === sub.id;
                                return (
                                    <button key={sub.id} onClick={() => { setReportSection(sub.id); setActiveTab('report'); }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-bold transition ${
                                          subActive
                                            ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30'
                                            : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                                        }`}>
                                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ${subActive ? 'bg-indigo-400 text-white' : 'bg-slate-700 text-slate-300'}`}>{sub.num}</span>
                                        <SubIcon size={13} className={subActive ? 'text-indigo-300' : 'text-slate-500'}/>
                                        <span className="flex-1 text-left">{sub.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                );
            }

            return (
              <button key={item.id} onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[12px] font-bold transition group ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-500/20 to-violet-500/10 text-white border border-indigo-400/30 shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}>
                <Icon size={16} className={isActive ? 'text-indigo-300' : 'text-slate-500 group-hover:text-slate-300'}/>
                <span className="flex-1 text-left">{item.label}</span>
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"/>}
              </button>
            );
          })}
        </nav>

        {/* Help promo card */}
        <div className="mx-3 mb-3 p-3 rounded-xl bg-gradient-to-br from-indigo-600/30 via-violet-600/20 to-purple-600/30 border border-indigo-400/30 backdrop-blur">
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/40 flex items-center justify-center shrink-0">
              <HelpCircle size={16} className="text-indigo-200"/>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-[11px] font-black">Need Help?</div>
              <div className="text-indigo-200 text-[9px] font-medium leading-tight mt-0.5">Read docs or contact support</div>
              <button onClick={()=>setActiveTab('settings')} className="mt-2 px-3 py-1 bg-white text-indigo-700 rounded-md text-[10px] font-black uppercase tracking-wider hover:bg-indigo-50 transition">Open</button>
            </div>
          </div>
        </div>

        {/* User profile footer */}
        <div className="px-3 pb-3 pt-2 border-t border-slate-700/40">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white/5 hover:bg-white/10 transition">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black text-[12px] shadow-md shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-[12px] font-black truncate">{session.displayName}</div>
              <div className="text-slate-400 text-[9px] font-bold truncate">{session.role === 'admin' ? 'Administrator' : 'POS User'}</div>
            </div>
            <button onClick={handleLogout} title="Logout" className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition">
              <LogOut size={14}/>
            </button>
          </div>
        </div>
      </aside>

      {/* ═══ MAIN AREA ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top header */}
        <header className="h-16 shrink-0 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <h1 className="text-[18px] font-black text-slate-900 tracking-tight flex items-center gap-2">
                {activeMenu && <activeMenu.icon size={20} className="text-indigo-500"/>}
                {sectionTitle}
              </h1>
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase">{activeCompany.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative hidden md:block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input
                type="text"
                placeholder="Search anything..."
                className="w-72 h-9 pl-9 pr-3 text-[12px] font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200 transition"
              />
            </div>
            {/* Calendar */}
            <button title="Calendar" className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition">
              <Calendar size={15}/>
            </button>
            {/* Notifications */}
            <button title="Notifications" className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition relative">
              <Bell size={15}/>
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"/>
            </button>
            {/* New Sale CTA */}
            <button onClick={()=>setActiveTab('pos')} className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-[12px] font-black uppercase tracking-wider shadow-lg shadow-indigo-500/30 transition active:scale-95">
              <Plus size={14}/> New Sale
            </button>
          </div>
        </header>

        {/* Content area — home scrolls, modules manage their own overflow */}
        <main className={`flex-1 bg-slate-100 ${showHome ? 'overflow-auto' : 'overflow-hidden'}`}>
          {showHome ? <HomeDashboard session={session} setActiveTab={setActiveTab} activeCompany={activeCompany}/> : (
            <div className="h-full overflow-auto p-4">{renderContent()}</div>
          )}
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
    </div>
    );
}

// ────────────────────────────────────────────────────────────
// MODERN HOME DASHBOARD with stat cards + quick actions
// ────────────────────────────────────────────────────────────
function HomeDashboard({ session, setActiveTab, activeCompany }) {
    const [stats, setStats] = useState({ revenue: 0, sales: 0, orders: 0, customers: 0, recentSales: [], topProducts: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                // Use ListSalesQuery + ListCustomersQuery via dynamic import to avoid circular deps
                const { ListSalesQuery } = await import('../../core/queries/pharma.query');
                const sales = await new ListSalesQuery().execute().catch(() => []);
                if (cancelled) return;
                const total = (sales || []).reduce((s, x) => s + (parseFloat(x.grandTotal) || 0), 0);
                const recent = (sales || []).slice(0, 5);

                // Aggregate top products by qty from itemsJson
                const productMap = {};
                for (const sale of (sales || [])) {
                    let items = [];
                    try { items = JSON.parse(sale.itemsJson || '[]'); } catch {}
                    for (const it of items) {
                        const name = it.name || it.itemName || 'Unknown';
                        const qty = parseFloat(it.qty) || 0;
                        const revenue = qty * (parseFloat(it.rate) || 0);
                        if (!productMap[name]) productMap[name] = { name, qty: 0, revenue: 0 };
                        productMap[name].qty += qty;
                        productMap[name].revenue += revenue;
                    }
                }
                const topProducts = Object.values(productMap).sort((a,b) => b.revenue - a.revenue).slice(0, 5);

                setStats({
                    revenue: total,
                    sales: (sales || []).length,
                    orders: (sales || []).length,
                    customers: new Set((sales || []).map(s => s.customerPhone).filter(Boolean)).size,
                    recentSales: recent,
                    topProducts,
                });
                setLoading(false);
            } catch (err) {
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const fmt = v => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

    const statCards = [
        { label: 'Total Revenue', value: fmt(stats.revenue), trend: '+12.5%', trendUp: true, color: 'indigo', icon: TrendingUp },
        { label: 'Total Sales', value: stats.sales.toLocaleString('en-IN'), trend: '+8.3%', trendUp: true, color: 'emerald', icon: ShoppingBag },
        { label: 'Total Orders', value: stats.orders.toLocaleString('en-IN'), trend: '+15.2%', trendUp: true, color: 'amber', icon: ClipboardList },
        { label: 'Total Customers', value: stats.customers.toLocaleString('en-IN'), trend: '+11.5%', trendUp: true, color: 'rose', icon: Users },
    ];

    const quickActions = [
        { id: 'pos', label: 'New Sale', icon: ShoppingBag, color: 'from-emerald-500 to-teal-600' },
        { id: 'purchase', label: 'New Purchase', icon: ShoppingCart, color: 'from-blue-500 to-indigo-600' },
        { id: 'itemmaster', label: 'Item Master', icon: Package, color: 'from-amber-500 to-orange-600' },
        { id: 'customers', label: 'Customers', icon: Users, color: 'from-rose-500 to-pink-600' },
        { id: 'inventory', label: 'Inventory', icon: Box, color: 'from-violet-500 to-purple-600' },
        { id: 'report', label: 'Reports', icon: FileText, color: 'from-cyan-500 to-blue-600' },
    ];

    return (
        <div className="p-6 space-y-6">
            {/* Welcome banner */}
            <div className="rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-700 p-6 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden">
                <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-white/10 blur-3xl"/>
                <div className="absolute -right-4 -bottom-12 w-64 h-64 rounded-full bg-violet-300/10 blur-3xl"/>
                <div className="relative flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-black tracking-tight">Welcome back, {(session.displayName || 'Admin').split(' ')[0]} 👋</h2>
                        <p className="text-indigo-200 text-[12px] font-bold mt-1.5">Here's what's happening with {activeCompany.name} today.</p>
                        <button onClick={()=>setActiveTab('pos')} className="mt-4 px-5 py-2.5 bg-white text-indigo-700 rounded-xl font-black text-[12px] uppercase tracking-wider hover:bg-indigo-50 transition shadow-lg active:scale-95">
                            <span className="flex items-center gap-2"><Sparkles size={14}/> Start a New Sale</span>
                        </button>
                    </div>
                    <div className="hidden md:block">
                        <div className="text-right">
                            <div className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest">Today</div>
                            <div className="text-white text-[20px] font-black">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((c, i) => {
                    const colorMap = {
                        indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600',  ring: 'ring-indigo-100',  badge: 'bg-indigo-100 text-indigo-700' },
                        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', ring: 'ring-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
                        amber:   { bg: 'bg-amber-50',   text: 'text-amber-600',   ring: 'ring-amber-100',   badge: 'bg-amber-100 text-amber-700' },
                        rose:    { bg: 'bg-rose-50',    text: 'text-rose-600',    ring: 'ring-rose-100',    badge: 'bg-rose-100 text-rose-700' },
                    }[c.color];
                    const Icon = c.icon;
                    return (
                        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition group">
                            <div className="flex items-start justify-between">
                                <div className={`w-11 h-11 rounded-xl ${colorMap.bg} flex items-center justify-center ring-4 ${colorMap.ring}`}>
                                    <Icon size={18} className={colorMap.text}/>
                                </div>
                                <span className={`text-[10px] font-black px-2 py-1 rounded-full ${colorMap.badge}`}>{c.trend}</span>
                            </div>
                            <div className="mt-4">
                                <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{c.label}</div>
                                <div className="text-2xl font-black text-slate-900 mt-1 tracking-tight">{c.value}</div>
                                <div className="text-[10px] font-bold text-slate-400 mt-1">vs last month</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Quick actions */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-[14px] font-black text-slate-900 mb-4 flex items-center gap-2">
                    <Sparkles size={16} className="text-indigo-500"/> Quick Actions
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {quickActions.map(a => {
                        const Icon = a.icon;
                        return (
                            <button key={a.id} onClick={()=>setActiveTab(a.id)} className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md transition">
                                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${a.color} flex items-center justify-center shadow-md group-hover:scale-110 transition`}>
                                    <Icon size={18} className="text-white"/>
                                </div>
                                <span className="text-[11px] font-black text-slate-700">{a.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Two-column: Recent Sales + Top Products */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recent Sales */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-[14px] font-black text-slate-900 flex items-center gap-2"><Receipt size={16} className="text-emerald-500"/> Recent Sales</h3>
                        <button onClick={()=>setActiveTab('report')} className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-wider">View All</button>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {loading ? <div className="p-8 text-center text-slate-400 text-[12px] font-bold">Loading...</div>
                          : stats.recentSales.length === 0 ? <div className="p-8 text-center text-slate-400 text-[12px] font-bold">No sales yet</div>
                          : stats.recentSales.map((s, i) => (
                            <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-700 font-black text-[12px]">
                                        {(s.customerName || 'W').slice(0,1).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="text-[12px] font-black text-slate-900">{s.customerName || 'Walk-in'}</div>
                                        <div className="text-[10px] font-bold text-slate-500">Bill {s.billNo} · {s.billDate}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[13px] font-black text-slate-900">{fmt(s.grandTotal)}</div>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${s.saleType==='CREDIT'?'bg-orange-100 text-orange-700':'bg-emerald-100 text-emerald-700'}`}>{s.saleType || 'CASH'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Top Products */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-[14px] font-black text-slate-900 flex items-center gap-2"><Package size={16} className="text-amber-500"/> Top Products</h3>
                        <button onClick={()=>setActiveTab('itemmaster')} className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-wider">View All</button>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {loading ? <div className="p-8 text-center text-slate-400 text-[12px] font-bold">Loading...</div>
                          : stats.topProducts.length === 0 ? <div className="p-8 text-center text-slate-400 text-[12px] font-bold">No data yet</div>
                          : stats.topProducts.map((p, i) => (
                            <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-amber-700 font-black text-[11px]">
                                        {i + 1}
                                    </div>
                                    <div>
                                        <div className="text-[12px] font-black text-slate-900 truncate max-w-[220px]">{p.name}</div>
                                        <div className="text-[10px] font-bold text-slate-500">{p.qty} sold</div>
                                    </div>
                                </div>
                                <div className="text-[13px] font-black text-slate-900">{fmt(p.revenue)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
