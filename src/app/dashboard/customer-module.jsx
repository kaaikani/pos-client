"use client";
import React, { useState, useEffect } from 'react';
import { Search, User, Phone, Mail, MapPin, Plus, Download, RefreshCw, X } from 'lucide-react';
import { gql } from '../../core/queries/gql';

const CUSTOMER_FIELDS = `id firstName lastName phoneNumber emailAddress
    addresses { streetLine1 streetLine2 city province postalCode country { name } }`;

async function fetchCustomers(term) {
    const t = (term || '').trim();
    const query = t
        ? `query CustomersByTerm($term: String!) {
            customers(options: {
                filter: { firstName: { contains: $term }, lastName: { contains: $term }, phoneNumber: { contains: $term }, emailAddress: { contains: $term } },
                filterOperator: OR,
                take: 100, sort: { createdAt: DESC }
            }) {
                totalItems
                items { ${CUSTOMER_FIELDS} }
            }
        }`
        : `query CustomersAll {
            customers(options: { take: 100, sort: { createdAt: DESC } }) {
                totalItems
                items { ${CUSTOMER_FIELDS} }
            }
        }`;
    const variables = t ? { term: t } : {};
    const data = await gql(query, { useAdmin: true, variables });
    return { items: data?.customers?.items || [], total: data?.customers?.totalItems || 0 };
}

export default function CustomerModule() {
    const [search, setSearch] = useState('');
    const [customers, setCustomers] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [form, setForm] = useState({ firstName: '', lastName: '', phoneNumber: '', emailAddress: '', streetLine1: '', city: '', postalCode: '' });

    const load = async (term) => {
        setLoading(true);
        try {
            const r = await fetchCustomers(term);
            setCustomers(r.items);
            setTotal(r.total);
        } catch (err) { console.error(err); alert('Failed to load customers: ' + err.message); }
        setLoading(false);
    };

    useEffect(() => { load(''); }, []);

    useEffect(() => {
        const t = setTimeout(() => load(search.trim()), 300);
        return () => clearTimeout(t);
    }, [search]);

    const openAdd = () => {
        setForm({ firstName: '', lastName: '', phoneNumber: '', emailAddress: '', streetLine1: '', city: '', postalCode: '' });
        setAddOpen(true);
    };

    const submitAdd = async () => {
        const { firstName, phoneNumber, emailAddress } = form;
        if (!firstName.trim() || !phoneNumber.trim()) return alert('First Name and Mobile Number are required.');
        const email = emailAddress.trim() || `pos+${phoneNumber.replace(/\D/g,'')}@avs.local`;
        try {
            const createQ = `mutation CreateCust($input: CreateCustomerInput!) {
                createCustomer(input: $input) {
                    ... on Customer { id firstName lastName phoneNumber emailAddress }
                    ... on ErrorResult { errorCode message }
                }
            }`;
            const data = await gql(createQ, { useAdmin: true, variables: { input: {
                firstName: firstName.trim(),
                lastName: form.lastName.trim() || '-',
                phoneNumber: phoneNumber.trim(),
                emailAddress: email,
            } } });
            if (data?.createCustomer?.errorCode) {
                return alert('Failed: ' + data.createCustomer.message);
            }
            const newId = data?.createCustomer?.id;
            // If address provided, save it too
            if (newId && form.streetLine1.trim()) {
                const addrQ = `mutation AddAddress($id: ID!, $input: CreateAddressInput!) {
                    createCustomerAddress(customerId: $id, input: $input) { id }
                }`;
                try {
                    await gql(addrQ, { useAdmin: true, variables: { id: newId, input: {
                        streetLine1: form.streetLine1.trim(),
                        city: form.city.trim() || '',
                        postalCode: form.postalCode.trim() || '',
                        countryCode: 'IN',
                    } } });
                } catch (e) { console.warn('Address save failed:', e.message); }
            }
            setAddOpen(false);
            await load(search);
        } catch (err) { alert(err.message); }
    };

    const exportCSV = () => {
        const headers = "Name,Phone,Email,Address\n";
        const rows = customers.map(c => {
            const addr = c.addresses?.[0];
            const a = addr ? [addr.streetLine1, addr.city, addr.postalCode].filter(Boolean).join(' ') : '';
            return `"${c.firstName} ${c.lastName || ''}","${c.phoneNumber || ''}","${c.emailAddress || ''}","${a}"`;
        }).join("\n");
        const blob = new Blob([headers + rows], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `customers.csv`; a.click();
    };

    return (
        <div className="flex flex-col h-[85vh] text-slate-800 bg-slate-50 w-full rounded-2xl overflow-hidden font-sans border border-slate-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5 shrink-0 flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-black text-white tracking-wide flex items-center gap-2"><User size={22}/> Customer Management</h1>
                    <p className="text-slate-300 text-xs font-bold mt-1">{total} customer{total !== 1 ? 's' : ''} registered</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => load(search)} className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition" title="Refresh"><RefreshCw size={16}/></button>
                    <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-black text-sm uppercase tracking-widest transition">
                        <Download size={16}/> CSV
                    </button>
                    <button onClick={openAdd} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-black text-sm uppercase tracking-widest transition shadow-lg shadow-emerald-500/30 active:scale-95">
                        <Plus size={18}/> Add Customer
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="px-6 py-3 bg-white border-b border-slate-200 shrink-0">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-2.5 text-slate-500" size={16}/>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search name, phone, email..."
                        className="w-full pl-9 pr-9 py-2 border border-slate-300 rounded-lg text-sm font-bold bg-slate-50 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none"/>
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2 top-2 text-slate-500 hover:text-slate-800"><X size={14}/></button>
                    )}
                </div>
            </div>

            {/* Customer Table */}
            <div className="flex-1 overflow-auto p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64 text-slate-700 font-bold">Loading customers...</div>
                ) : customers.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                        <User size={48} className="text-slate-400 mx-auto mb-3"/>
                        <p className="text-lg font-bold text-slate-700">{search ? 'No customers match your search' : 'No customers yet'}</p>
                        <p className="text-sm text-slate-500 mt-1">{search ? 'Try a different search term' : 'Add a customer or create a sale to register one automatically'}</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-100 border-b border-slate-200 sticky top-0">
                                <tr>
                                    <th className="p-4 px-6 text-xs uppercase font-black tracking-widest text-slate-700">Customer</th>
                                    <th className="p-4 text-xs uppercase font-black tracking-widest text-slate-700">Mobile</th>
                                    <th className="p-4 text-xs uppercase font-black tracking-widest text-slate-700">Email</th>
                                    <th className="p-4 text-xs uppercase font-black tracking-widest text-slate-700">Address</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {customers.map(c => {
                                    const addr = c.addresses?.[0];
                                    const fullName = `${c.firstName || ''} ${c.lastName && c.lastName !== '-' ? c.lastName : ''}`.trim();
                                    return (
                                        <tr key={c.id} className="hover:bg-emerald-50/40 transition">
                                            <td className="p-4 px-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-black">
                                                        {(c.firstName || '?').charAt(0).toUpperCase()}
                                                    </div>
                                                    <p className="font-black text-slate-800">{fullName || '—'}</p>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {c.phoneNumber ? (
                                                    <span className="inline-flex items-center gap-1.5 font-bold text-slate-700"><Phone size={12}/> {c.phoneNumber}</span>
                                                ) : <span className="text-slate-400">—</span>}
                                            </td>
                                            <td className="p-4">
                                                {c.emailAddress && !c.emailAddress.includes('@avs.local') ? (
                                                    <span className="inline-flex items-center gap-1.5 font-bold text-slate-700 text-xs"><Mail size={12}/> {c.emailAddress}</span>
                                                ) : <span className="text-slate-400 text-xs italic">—</span>}
                                            </td>
                                            <td className="p-4">
                                                {addr ? (
                                                    <span className="inline-flex items-center gap-1.5 font-bold text-slate-600 text-xs"><MapPin size={12}/> {[addr.streetLine1, addr.city, addr.postalCode].filter(Boolean).join(', ')}</span>
                                                ) : <span className="text-slate-400 text-xs">—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Add Customer Modal */}
            {addOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl overflow-hidden">
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-5 flex items-center justify-between">
                            <h2 className="text-lg font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2"><User size={20}/> New Customer</h2>
                            <button onClick={() => setAddOpen(false)} className="text-slate-300 hover:text-white"><X size={22}/></button>
                        </div>
                        <div className="p-6 bg-slate-50 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1">First Name *</label>
                                    <input autoFocus value={form.firstName} onChange={e=>setForm({...form, firstName: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1">Last Name</label>
                                    <input value={form.lastName} onChange={e=>setForm({...form, lastName: e.target.value})} className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"/>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1">Mobile Number *</label>
                                <input type="tel" value={form.phoneNumber} onChange={e=>setForm({...form, phoneNumber: e.target.value})} placeholder="9876543210" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1">Email (optional)</label>
                                <input type="email" value={form.emailAddress} onChange={e=>setForm({...form, emailAddress: e.target.value})} placeholder="leave blank for default" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1">Address</label>
                                <input value={form.streetLine1} onChange={e=>setForm({...form, streetLine1: e.target.value})} placeholder="Street / House" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 mb-2"/>
                                <div className="grid grid-cols-2 gap-3">
                                    <input value={form.city} onChange={e=>setForm({...form, city: e.target.value})} placeholder="City" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"/>
                                    <input value={form.postalCode} onChange={e=>setForm({...form, postalCode: e.target.value})} placeholder="PIN" className="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"/>
                                </div>
                            </div>
                            <button onClick={submitAdd} className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl font-black uppercase tracking-widest text-sm transition shadow-lg shadow-emerald-500/30 active:scale-[0.98]">
                                Save Customer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
