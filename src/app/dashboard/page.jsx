"use client";
import React, { useState, useEffect, Suspense } from 'react';
import { BarChart, BookOpen, Grid, Box, ShoppingBag, ScanLine, FileText, LogOut, Users, ShieldCheck, User, Plus, XCircle, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff, KeyRound, Package, ShoppingCart, Hash, Wallet, Receipt, Settings, ClipboardList } from 'lucide-react';
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
import ReportModule from './report-module';
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
                case 'report': return isAdmin ? <ReportModule initialReport={reportSection} key={reportSection}/> : null;
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

    // ── ALL SECTIONS open in FULL-SCREEN mode (Esc to close) ──
    const isFullScreenSection = activeTab && activeTab !== 'home' && activeTab !== null;
    if (isFullScreenSection) {
        const sectionTitle = (() => {
            const m = adminMenuItems.find(m => m.id === activeTab); return m ? m.label : activeTab;
        })();
        return (
            <div className="fixed inset-0 z-[100] bg-white flex flex-col">
                {/* Slim top bar with company name + section title + Close button */}
                <div className="h-7 flex items-center justify-between px-3 shrink-0" style={{background:'linear-gradient(90deg, #1a5276, #2980b9)'}}>
                    <div className="flex items-center gap-2">
                        <span className="text-white text-xs font-black tracking-[3px]">{activeCompany.name}</span>
                        <span className="text-cyan-100 text-[10px] font-bold ml-2">— {activeCompany.financialYear}</span>
                        <span className="text-cyan-100 text-[10px] font-bold ml-3">▸ {sectionTitle}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-cyan-100 font-bold">{session.displayName}</span>
                        <button onClick={() => setActiveTab('home')} title="Close (back to Dashboard, or press Esc)" className="px-3 py-0.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest rounded">✕ Close (Esc)</button>
                    </div>
                </div>
                <div className="flex-1 overflow-auto bg-[#ecf0f1]">
                    {renderContent()}
                </div>
            </div>
        );
    }

    // ── ADMIN ROLE: Classic POS Software Layout ──
    return (<div className="flex flex-col h-screen font-sans select-none" style={{background:'linear-gradient(135deg, #1a5276 0%, #2e86c1 30%, #85c1e9 60%, #d4e6f1 100%)'}}>

      {/* ═══ ROW 1: Blue title bar ═══ */}
      <div className="h-7 flex items-center justify-between px-3 shrink-0" style={{background:'linear-gradient(90deg, #1a5276, #2980b9)'}}>
        <div className="flex items-center gap-2">
          <span className="text-white text-xs font-black tracking-[3px]">{activeCompany.name}</span>
          <span className="text-cyan-100 text-[10px] font-bold ml-2">— {activeCompany.financialYear}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-cyan-100 font-bold">{session.displayName}</span>
          <span className="text-cyan-100">|</span>
          <span className="text-cyan-100 font-bold">{new Date().toLocaleDateString('en-IN')}</span>
        </div>
      </div>

      {/* ═══ ROW 2: Top toolbar with icon buttons ═══ */}
      <div className="h-[68px] flex items-center px-1.5 gap-[3px] shrink-0 border-b border-[#85c1e9]" style={{background:'linear-gradient(180deg, #f0f4f8 0%, #dce6f0 100%)'}}>
        {toolbarItems.map((item, i) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isSettings = item.hasDropdown;
          const isReport = item.hasReportDropdown;
          const isPurchase = item.hasPurchaseDropdown;
          const isCategory = item.hasCategoryDropdown;
          const closeAllMenus = () => { setSettingsMenuOpen(false); setReportMenuOpen(false); setPurchaseMenuOpen(false); setCategoryMenuOpen(false); };
          return (<div key={i} className="relative">
            <button onClick={() => {
              if (item.id === '_logout') { handleLogout(); return; }
              if (isSettings) { closeAllMenus(); setSettingsMenuOpen(p => !p); return; }
              if (isReport)   { closeAllMenus(); setReportMenuOpen(p => !p); return; }
              if (isPurchase) { closeAllMenus(); setPurchaseMenuOpen(p => !p); return; }
              if (isCategory) { closeAllMenus(); setCategoryMenuOpen(p => !p); return; }
              setActiveTab(item.id);
              closeAllMenus();
            }} className={`flex flex-col items-center justify-center rounded border transition-all min-w-[68px] h-[58px] px-1 ${isActive
              ? 'bg-blue-100 border-blue-400 shadow-inner'
              : 'bg-white border-[#c0c8d0] hover:bg-blue-50 hover:border-blue-300 shadow-sm'}`} style={{boxShadow: isActive ? 'inset 0 2px 4px rgba(0,0,0,0.15)' : '0 1px 3px rgba(0,0,0,0.1)'}}>
              <div className="w-8 h-8 rounded flex items-center justify-center mb-0.5" style={{background:item.bg}}>
                <Icon size={18} className="text-white"/>
              </div>
              <span className="text-[8px] font-bold text-[#2c3e50] leading-[10px] text-center whitespace-pre-line">{item.label}{(isSettings || isReport || isPurchase || isCategory) && ' ▾'}</span>
            </button>

            {/* Purchase dropdown menu */}
            {isPurchase && purchaseMenuOpen && (<>
              <div className="fixed inset-0 z-40" onClick={()=>setPurchaseMenuOpen(false)}/>
              <div className="absolute left-0 top-full mt-0.5 w-60 bg-white border-2 border-[#1a5276] shadow-2xl z-50" style={{color:'#000'}}>
                <div className="bg-[#1abc9c] text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest">🛒 Purchase</div>
                {[
                  { id: 'purchase',         label: 'Purchase' },
                  { id: 'stock-updation',   label: 'Stock Updation' },
                  { id: 'purchase-return',  label: 'Purchase Return' },
                  { id: 'stock-adjustment', label: 'Stock Adjustment' },
                  { id: 'inward',           label: 'Inward' },
                  { id: 'purchase-list',    label: 'Purchase List' },
                ].map(o => (
                  <button key={o.id} onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab(o.id);
                    setPurchaseMenuOpen(false);
                  }} style={{color:'#000', background:'#fff'}}
                    onMouseEnter={(e)=>{e.currentTarget.style.background='#1abc9c';e.currentTarget.style.color='#fff';}}
                    onMouseLeave={(e)=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#000';}}
                    className="w-full text-left px-4 py-2 text-[12px] font-black border-b border-slate-200 last:border-0 transition block">
                    {o.label}
                  </button>
                ))}
              </div>
            </>)}

            {/* Category dropdown menu */}
            {isCategory && categoryMenuOpen && (<>
              <div className="fixed inset-0 z-40" onClick={()=>setCategoryMenuOpen(false)}/>
              <div className="absolute left-0 top-full mt-0.5 w-64 bg-white border-2 border-[#1a5276] shadow-2xl z-50" style={{color:'#000'}}>
                <div className="bg-[#f39c12] text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest">📂 Category</div>
                {[
                  { id: 'tax-master',           label: 'Tax Master' },
                  { id: 'rate-master',          label: 'Rate Master' },
                  { id: 'size-master',          label: 'Size Master' },
                  { id: 'brand-master',         label: 'Brand Master' },
                  { id: 'category',             label: 'Category' },
                  { id: 'brandwise-rate',       label: 'Brandwise Rate Update' },
                  { id: 'categorywise-rate',    label: 'CategorywiseRate Update' },
                  { id: 'salesman',             label: 'SalesMan' },
                ].map(o => (
                  <button key={o.id} onClick={(e) => {
                    e.stopPropagation();
                    setActiveTab(o.id);
                    setCategoryMenuOpen(false);
                  }} style={{color:'#000', background:'#fff'}}
                    onMouseEnter={(e)=>{e.currentTarget.style.background='#f39c12';e.currentTarget.style.color='#fff';}}
                    onMouseLeave={(e)=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#000';}}
                    className="w-full text-left px-4 py-2 text-[12px] font-black border-b border-slate-200 last:border-0 transition block">
                    {o.label}
                  </button>
                ))}
              </div>
            </>)}

            {/* Reports dropdown menu */}
            {isReport && reportMenuOpen && (<>
              <div className="fixed inset-0 z-40" onClick={()=>setReportMenuOpen(false)}/>
              <div className="absolute left-0 top-full mt-0.5 w-64 bg-white border-2 border-[#1a5276] shadow-2xl z-50" style={{color:'#000'}}>
                <div className="bg-[#1a5276] text-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest">📊 Reports</div>
                {[
                  { id: 'purchase', label: 'Purchase Report', num: 1 },
                  { id: 'sales',    label: 'Sales Report',    num: 2 },
                  { id: 'stock',    label: 'Stock Report',    num: 3 },
                ].map(r => (
                  <button key={r.id} onClick={(e) => {
                    e.stopPropagation();
                    setReportSection(r.id);
                    setActiveTab('report');
                    setReportMenuOpen(false);
                  }} style={{color:'#000', background:'#fff'}}
                    onMouseEnter={(e)=>{e.currentTarget.style.background='#2980b9';e.currentTarget.style.color='#fff';}}
                    onMouseLeave={(e)=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#000';}}
                    className="w-full text-left px-4 py-2.5 text-[13px] font-black border-b border-slate-200 last:border-0 transition flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#1a5276] text-white flex items-center justify-center text-[11px] font-black">{r.num}</span>
                    {r.label}
                  </button>
                ))}
              </div>
            </>)}

            {/* Settings dropdown menu */}
            {isSettings && settingsMenuOpen && (<>
              <div className="fixed inset-0 z-40" onClick={()=>setSettingsMenuOpen(false)}/>
              <div className="absolute left-0 top-full mt-0.5 w-60 bg-white border-2 border-[#1a5276] shadow-2xl z-50" style={{color:'#000'}}>
                {[
                  { id: 'configuration', label: 'Configuration' },
                  { id: 'company', label: 'Company' },
                  { id: 'user-creation', label: 'User Creation' },
                  { id: 'barcode-design', label: 'Barcode Design' },
                ].map(s => (
                  <button key={s.id} onClick={(e) => {
                    e.stopPropagation();
                    setSettingsSection(s.id);
                    setActiveTab('settings');
                    setSettingsMenuOpen(false);
                  }} style={{color:'#000', background:'#fff'}} onMouseEnter={(e)=>{e.currentTarget.style.background='#2980b9';e.currentTarget.style.color='#fff';}} onMouseLeave={(e)=>{e.currentTarget.style.background='#fff';e.currentTarget.style.color='#000';}}
                  className="w-full text-left px-4 py-2.5 text-[13px] font-black border-b border-slate-200 last:border-0 transition block">
                    {s.label}
                  </button>
                ))}
              </div>
            </>)}
          </div>);
        })}
      </div>

      {/* ═══ ROW 3: Main area = Left sidebar + Content ═══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ── */}
        <div className="w-[110px] flex flex-col py-1.5 px-1.5 gap-[5px] shrink-0 overflow-y-auto" style={{background:'linear-gradient(180deg, #e8eff5 0%, #d0dce8 100%)', borderRight:'2px solid #a8c4d8'}}>
          {sidebarItems.map((item, i) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (<button key={i} onClick={() => setActiveTab(item.id)} className={`flex items-center gap-2 py-2 px-2 rounded border transition-all w-full text-left ${isActive
              ? 'bg-blue-100 border-blue-400 shadow-inner'
              : 'bg-white border-[#c0c8d0] hover:bg-blue-50 hover:border-blue-300 shadow-sm'}`}>
              <div className="w-8 h-8 rounded flex items-center justify-center shrink-0" style={{background:item.bg}}>
                <Icon size={16} className="text-white"/>
              </div>
              <span className="text-[9px] font-bold text-[#2c3e50] leading-[11px] whitespace-pre-line">{item.label}</span>
            </button>);
          })}
        </div>

        {/* ── CENTER CONTENT ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {showHome ? (
            /* ── Welcome / Home Screen with gradient background ── */
            <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden" style={{background:'linear-gradient(135deg, #1a5276 0%, #2e86c1 25%, #5dade2 50%, #85c1e9 75%, #aed6f1 100%)'}}>
              {/* Decorative wave overlay */}
              <div className="absolute inset-0 opacity-50" style={{backgroundImage:'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 1440 320\'%3E%3Cpath fill=\'%23ffffff\' d=\'M0,160L48,170.7C96,181,192,203,288,197.3C384,192,480,160,576,149.3C672,139,768,149,864,176C960,203,1056,245,1152,245.3C1248,245,1344,203,1392,181.3L1440,160L1440,320L0,320Z\'/%3E%3C/svg%3E")', backgroundSize:'cover', backgroundPosition:'bottom'}}/>
              <div className="relative z-10 text-center">
                <div className="text-6xl font-black text-white mb-2 tracking-[6px] drop-shadow-lg" style={{textShadow:'2px 3px 6px rgba(0,0,0,0.3)'}}>
                  AVS ECOM
                </div>
                <div className="text-white text-xl font-black tracking-[8px] uppercase mb-6" style={{textShadow:'1px 2px 4px rgba(0,0,0,0.3)'}}>
                  Medical POS System
                </div>
                <div className="text-cyan-100 text-sm font-bold tracking-widest">EASY STEP — SAVE YOUR TIME</div>
                <div className="mt-8 flex items-center gap-3">
                  <button onClick={() => setActiveTab('pos')} className="px-6 py-2.5 bg-white/20 backdrop-blur border border-white/30 text-white rounded-lg font-bold text-sm hover:bg-white/30 transition">Start Billing</button>
                  <button onClick={() => setActiveTab('itemmaster')} className="px-6 py-2.5 bg-white/20 backdrop-blur border border-white/30 text-white rounded-lg font-bold text-sm hover:bg-white/30 transition">Item Master</button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Module content ── */
            <>
              <div className="h-6 flex items-center justify-between px-3 shrink-0 border-b border-[#bdc3c7]" style={{background:'linear-gradient(90deg, #dce6f0, #eef2f7)'}}>
                <span className="text-[10px] font-black text-[#2c3e50] uppercase tracking-wider flex items-center gap-1">
                  {(() => { const m = adminMenuItems.find(m => m.id === activeTab); return m ? <><m.icon size={12}/> {m.label}</> : activeTab; })()}
                </span>
                <button onClick={() => setActiveTab('home')} className="text-[9px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1">✕ Close</button>
              </div>
              <main className="flex-1 overflow-auto p-2 bg-[#ecf0f1]">
                {renderContent()}
              </main>
            </>
          )}
        </div>
      </div>

      {/* ═══ BOTTOM STATUS BAR ═══ */}
      <div className="h-[22px] flex items-center justify-between px-3 shrink-0 border-t border-[#1a5276]" style={{background:'linear-gradient(90deg, #2c3e50, #34495e)'}}>
        <div className="flex items-center gap-2 text-[9px] text-[#34495e]">
          <span>Ready</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
        </div>
        <span className="text-[9px] text-[#2c3e50] font-bold">{activeCompany.name} ({activeCompany.financialYear})</span>
        <span className="text-[9px] text-[#34495e]">{new Date().toLocaleString('en-IN', {weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true})}</span>
      </div>
    </div>);
}
