"use client";
import React, { useState, useEffect } from 'react';
import { Search, Download, Plus, ChevronRight, Activity, ArrowUpRight, ArrowDownRight, CreditCard, Clock, CheckCircle, XCircle, ArrowLeft, Wallet, Smartphone, Landmark, FileText, DollarSign, Receipt, AlertTriangle, Phone, MapPin, Building2, User, Hash, IndianRupee, CalendarDays } from 'lucide-react';
import { GetLedgersQuery, GetLedgerSummaryQuery, AddPaymentCommand, GetLedgerByIdQuery, CreateLedgerCommand } from '../../core/queries/ledger.query';

// ── Helpers ──
const PaymentModeIcon = ({ mode, size = 16 }) => {
    switch (mode) {
        case 'CASH': return <Wallet size={size}/>;
        case 'UPI': return <Smartphone size={size}/>;
        case 'BANK': return <Landmark size={size}/>;
        case 'CREDIT': return <CreditCard size={size}/>;
        default: return <DollarSign size={size}/>;
    }
};
const paymentModeLabel = (m) => ({ CASH:'Cash', UPI:'UPI / QR', BANK:'Bank Transfer', CREDIT:'Credit Card' }[m] || m);
const paymentModeColor = (m) => ({ CASH:'bg-emerald-50 text-emerald-700 border-emerald-200', UPI:'bg-blue-50 text-blue-700 border-blue-200', BANK:'bg-indigo-50 text-indigo-700 border-indigo-200', CREDIT:'bg-purple-50 text-purple-700 border-purple-200' }[m] || 'bg-slate-50 text-slate-700 border-slate-200');

function getDaysRemaining(invoiceDate, creditDays) {
    const deadline = new Date(invoiceDate);
    deadline.setDate(deadline.getDate() + creditDays);
    return Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24));
}

// ── Group ledgers into suppliers by contactNumber ──
function groupBySupplier(ledgers) {
    const map = {};
    ledgers.forEach(l => {
        const key = l.contactNumber || `_no_phone_${l.id}`;
        if (!map[key]) {
            map[key] = {
                name: l.partyName,
                contactNumber: l.contactNumber || '',
                gstNumber: l.gstNumber || '',
                address: l.address || '',
                invoices: [],
                totalAmount: 0,
                totalPaid: 0,
                totalBalance: 0,
            };
        }
        map[key].invoices.push(l);
        map[key].totalAmount += l.amount;
        map[key].totalPaid += l.paidAmount;
        map[key].totalBalance += l.balance;
    });
    return Object.values(map);
}

// ══════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════
export default function LedgerModule() {
    const [activeTab, setActiveTab] = useState('CUSTOMER');
    const [summary, setSummary] = useState({ totalSales: 0, totalPurchase: 0, totalReceivable: 0, totalPayable: 0 });
    const [ledgers, setLedgers] = useState([]);
    const [search, setSearch] = useState('');

    // Navigation: 'list' | 'supplier-detail' | 'invoice-detail'
    const [view, setView] = useState('list');
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    // Add Supplier Modal — now also captures the first invoice in same flow
    const [addSupplierOpen, setAddSupplierOpen] = useState(false);
    const [supplierForm, setSupplierForm] = useState({ name:'', contact:'', gst:'', address:'', invoiceNumber:'', amount:'', creditDays:'30', date:'' });

    // Add Invoice Modal (used for adding subsequent invoices to existing supplier)
    const [addInvoiceOpen, setAddInvoiceOpen] = useState(false);
    const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber:'', amount:'', creditDays:'30', date:'' });
    const [invoiceFromCard, setInvoiceFromCard] = useState(null); // supplier obj when adding from list card

    // Add Payment Modal
    const [payModalOpen, setPayModalOpen] = useState(false);
    const [payForm, setPayForm] = useState({ amount:'', mode:'CASH', date:'', time:'' });

    // Deadline alerts
    const [dismissedAlerts, setDismissedAlerts] = useState([]);

    useEffect(() => { fetchData(); }, [activeTab]);

    const fetchData = async () => {
        const [s, l] = await Promise.all([
            new GetLedgerSummaryQuery().execute(),
            new GetLedgersQuery().execute(activeTab),
        ]);
        setSummary(s);
        setLedgers(l);
    };

    // ── Navigation helpers ──
    const goToSupplierDetail = (supplier) => {
        setSelectedSupplier(supplier);
        setSelectedInvoice(null);
        setView('supplier-detail');
    };
    const goToInvoiceDetail = (invoice) => {
        setSelectedInvoice(invoice);
        setView('invoice-detail');
    };
    const goBack = () => {
        if (view === 'invoice-detail') {
            setSelectedInvoice(null);
            // Refresh supplier's invoices
            const refreshed = groupBySupplier(ledgers).find(s => s.contactNumber === selectedSupplier?.contactNumber);
            if (refreshed) setSelectedSupplier(refreshed);
            setView('supplier-detail');
        } else if (view === 'supplier-detail') {
            setSelectedSupplier(null);
            setView('list');
        }
    };

    // ── Supplier form ──
    const openAddSupplier = () => {
        setSupplierForm({ name:'', contact:'', gst:'', address:'', invoiceNumber:'', amount:'', creditDays:'30', date: new Date().toISOString().split('T')[0] });
        setAddSupplierOpen(true);
    };
    const submitNewSupplier = async () => {
        const { name, contact, gst, address, invoiceNumber, amount, creditDays, date } = supplierForm;
        if (!name.trim() || !contact.trim()) return alert('Supplier Name and Mobile Number are required.');

        const existing = ledgers.find(l => l.contactNumber === contact.trim());
        // Also check local registry (suppliers with no invoices yet, stored in localStorage)
        const localRegistry = JSON.parse(localStorage.getItem('supplier_registry') || '[]');
        const localExisting = localRegistry.find(s => s.contactNumber === contact.trim());

        // Mobile uniqueness — block if same number is registered to a DIFFERENT name.
        const existingName = (existing?.partyName || localExisting?.name || '').trim().toLowerCase();
        if (existingName && existingName !== name.trim().toLowerCase()) {
            return alert(`Mobile "${contact}" is already registered to "${existing?.partyName || localExisting?.name}".\n\nOne mobile can belong to only one supplier. Use a different mobile, or update the existing supplier instead of creating a new one.`);
        }

        const amt = parseFloat(amount);
        const hasInvoice = invoiceNumber.trim() && amt > 0;

        // Same supplier (same mobile + same name) — adding a NEW invoice flow
        if (existing && !hasInvoice) {
            const goNow = confirm(`Supplier "${existing.partyName}" already exists with this mobile.\n\nClick OK to open their page and add a new invoice.`);
            setAddSupplierOpen(false);
            if (goNow) {
                const supplierObj = groupBySupplier(ledgers).find(s => s.contactNumber === contact.trim());
                if (supplierObj) goToSupplierDetail(supplierObj);
            }
            return;
        }

        // Optional duplicate-invoice check — same supplier + same invoice number
        if (existing && hasInvoice) {
            const dupInv = ledgers.find(l => l.contactNumber === contact.trim() && l.invoiceNumber.toLowerCase() === invoiceNumber.trim().toLowerCase());
            if (dupInv) return alert(`Invoice "${invoiceNumber}" already exists for this supplier. Use a different invoice number.`);
        }

        // Update local registry only for brand-new suppliers
        if (!existing) {
            const suppliers = JSON.parse(localStorage.getItem('supplier_registry') || '[]');
            const dup = suppliers.find(s => s.contactNumber === contact.trim());
            if (!dup) {
                suppliers.push({ name: name.trim(), contactNumber: contact.trim(), gstNumber: gst.trim(), address: address.trim() });
                localStorage.setItem('supplier_registry', JSON.stringify(suppliers));
            }
        }

        // Create the invoice (ledger entry) if details provided
        if (hasInvoice) {
            try {
                await new CreateLedgerCommand().execute({
                    type: 'SUPPLIER',
                    partyName: existing ? existing.partyName : name.trim(),
                    contactNumber: contact.trim(),
                    gstNumber: existing ? (existing.gstNumber || gst.trim()) : gst.trim(),
                    address: existing ? (existing.address || address.trim()) : address.trim(),
                    invoiceNumber: invoiceNumber.trim(),
                    invoiceDate: new Date(date).toISOString(),
                    amount: Math.round(amt),
                    creditDays: parseInt(creditDays) || 30,
                });
                await fetchData();
            } catch (err) {
                alert('Failed to save invoice: ' + err.message);
                return;
            }
        }

        setAddSupplierOpen(false);
        // Navigate to supplier detail (reuse existing data when supplier was already there)
        const updatedLedgers = await new GetLedgersQuery().execute('SUPPLIER');
        setLedgers(updatedLedgers);
        const refreshed = groupBySupplier(updatedLedgers).find(s => s.contactNumber === contact.trim());
        goToSupplierDetail(refreshed || { name: name.trim(), contactNumber: contact.trim(), gstNumber: gst.trim(), address: address.trim(), invoices: [], totalAmount: 0, totalPaid: 0, totalBalance: 0 });
    };

    // Quick add invoice from supplier card (without opening detail page)
    const openQuickInvoice = (supplier, e) => {
        e?.stopPropagation();
        setInvoiceFromCard(supplier);
        setInvoiceForm({ invoiceNumber:'', amount:'', creditDays:'30', date: new Date().toISOString().split('T')[0] });
        setAddInvoiceOpen(true);
    };
    const submitQuickInvoice = async () => {
        const { invoiceNumber, amount, creditDays, date } = invoiceForm;
        if (!invoiceNumber.trim() || !amount) return alert('Invoice Number and Amount are required.');
        const amt = parseFloat(amount);
        if (!amt || amt <= 0) return alert('Invalid amount.');
        const supplier = invoiceFromCard || selectedSupplier;
        if (!supplier) return alert('Supplier missing.');
        // Block ONLY same supplier + same invoice number (different invoices for same supplier are allowed)
        const dupInv = ledgers.find(l => l.contactNumber === supplier.contactNumber && l.invoiceNumber.toLowerCase() === invoiceNumber.trim().toLowerCase());
        if (dupInv) return alert(`Invoice "${invoiceNumber}" already exists for ${supplier.name}. Use a different invoice number.`);
        try {
            await new CreateLedgerCommand().execute({
                type: 'SUPPLIER',
                partyName: supplier.name,
                contactNumber: supplier.contactNumber,
                gstNumber: supplier.gstNumber,
                address: supplier.address,
                invoiceNumber: invoiceNumber.trim(),
                invoiceDate: new Date(date).toISOString(),
                amount: Math.round(amt),
                creditDays: parseInt(creditDays) || 30,
            });
            setAddInvoiceOpen(false);
            setInvoiceFromCard(null);
            await fetchData();
            if (selectedSupplier?.contactNumber === supplier.contactNumber) {
                const updatedLedgers = await new GetLedgersQuery().execute('SUPPLIER');
                setLedgers(updatedLedgers);
                const refreshed = groupBySupplier(updatedLedgers).find(s => s.contactNumber === supplier.contactNumber);
                if (refreshed) setSelectedSupplier(refreshed);
            }
        } catch (err) { alert(err.message); }
    };

    // ── Invoice form (used inside supplier-detail view) ──
    const openAddInvoice = () => {
        setInvoiceFromCard(null); // detail-view path uses selectedSupplier
        setInvoiceForm({ invoiceNumber:'', amount:'', creditDays:'30', date: new Date().toISOString().split('T')[0] });
        setAddInvoiceOpen(true);
    };
    const submitNewInvoice = submitQuickInvoice;

    // ── Payment form ──
    const openAddPayment = () => {
        const now = new Date();
        setPayForm({ amount: selectedInvoice?.balance?.toString() || '', mode:'CASH', date: now.toISOString().split('T')[0], time: now.toTimeString().slice(0,5) });
        setPayModalOpen(true);
    };
    const submitPayment = async () => {
        if (!selectedInvoice) return;
        const amt = parseFloat(payForm.amount);
        if (!amt || amt <= 0) return alert('Invalid amount.');
        const dateTime = new Date(`${payForm.date}T${payForm.time}:00`).toISOString();
        try {
            const updated = await new AddPaymentCommand().execute(selectedInvoice.id, { amount: amt, paymentMode: payForm.mode, paymentDate: dateTime });
            setSelectedInvoice(updated);
            setPayModalOpen(false);
            await fetchData();
            // Refresh supplier
            const updatedLedgers = await new GetLedgersQuery().execute('SUPPLIER');
            setLedgers(updatedLedgers);
            const refreshed = groupBySupplier(updatedLedgers).find(s => s.contactNumber === selectedSupplier?.contactNumber);
            if (refreshed) setSelectedSupplier(refreshed);
        } catch (err) { alert(err.message); }
    };

    // ── Build supplier list (from ledgers + localStorage registry) ──
    const suppliersFromLedgers = activeTab === 'SUPPLIER' ? groupBySupplier(ledgers) : [];
    const registeredSuppliers = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('supplier_registry') || '[]') : [];
    // Merge: add registered suppliers that have no invoices yet
    const allSuppliers = [...suppliersFromLedgers];
    registeredSuppliers.forEach(rs => {
        if (!allSuppliers.find(s => s.contactNumber === rs.contactNumber)) {
            allSuppliers.push({ ...rs, name: rs.name, invoices: [], totalAmount: 0, totalPaid: 0, totalBalance: 0 });
        }
    });

    const filteredSuppliers = allSuppliers.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.contactNumber.includes(search) ||
        (s.gstNumber && s.gstNumber.toLowerCase().includes(search.toLowerCase()))
    );

    const filteredCustomerLedgers = ledgers.filter(l =>
        l.partyName.toLowerCase().includes(search.toLowerCase()) || l.invoiceNumber.toLowerCase().includes(search.toLowerCase())
    );

    // Deadline alerts for supplier invoices
    const deadlineAlerts = ledgers.filter(l => {
        if (l.status === 'FULLY_PAID') return false;
        return getDaysRemaining(l.invoiceDate, l.creditDays) <= 3;
    }).filter(a => !dismissedAlerts.includes(a.id));

    const exportCSV = () => {
        const headers = "Party Name,Contact,GST,Invoice,Date,Amount,Paid,Balance,Status\n";
        const rows = ledgers.map(l => `${l.partyName},${l.contactNumber},${l.gstNumber},${l.invoiceNumber},${l.invoiceDate},${l.amount},${l.paidAmount},${l.balance},${l.status}`).join("\n");
        const blob = new Blob([headers + rows], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${activeTab}_Ledger.csv`; a.click();
    };

    // ══════════════════════════════════════════════════
    // VIEW: INVOICE DETAIL (payments)
    // ══════════════════════════════════════════════════
    if (view === 'invoice-detail' && selectedInvoice) {
        const payments = [...(selectedInvoice.payments || [])].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        const paidPct = Math.min(100, Math.round((selectedInvoice.paidAmount / selectedInvoice.amount) * 100));
        const daysLeft = getDaysRemaining(selectedInvoice.invoiceDate, selectedInvoice.creditDays);

        return (<div className="flex flex-col h-[85vh] text-slate-800 bg-slate-50 w-full rounded-2xl overflow-hidden font-sans border border-slate-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={goBack} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"><ArrowLeft size={20}/></button>
                    <div>
                        <p className="text-slate-700 text-[10px] font-black uppercase tracking-widest">{selectedSupplier?.name}</p>
                        <h1 className="text-xl font-black text-white tracking-wide flex items-center gap-2"><Receipt size={20}/> {selectedInvoice.invoiceNumber}</h1>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-slate-700 text-xs font-bold">{new Date(selectedInvoice.invoiceDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
                            <span className="text-slate-900">|</span>
                            <span className="text-slate-700 text-xs font-bold">Credit: {selectedInvoice.creditDays} days</span>
                            {selectedInvoice.status !== 'FULLY_PAID' && (<>
                                <span className="text-slate-900">|</span>
                                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${daysLeft <= 0 ? 'bg-red-500/20 text-red-400' : daysLeft <= 3 ? 'bg-orange-500/20 text-orange-400' : 'text-slate-700'}`}>
                                    {daysLeft <= 0 ? `OVERDUE ${Math.abs(daysLeft)}d` : `${daysLeft}d remaining`}
                                </span>
                            </>)}
                        </div>
                    </div>
                </div>
                <button onClick={openAddPayment} disabled={selectedInvoice.status === 'FULLY_PAID'} className="flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-white rounded-xl font-black text-sm uppercase tracking-widest transition shadow-lg shadow-teal-500/30 disabled:opacity-30 active:scale-95">
                    <Plus size={18}/> Add Payment
                </button>
            </div>

            {/* Invoice Summary Cards */}
            <div className="p-6 bg-white border-b border-slate-200 shrink-0">
                <div className="grid grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 rounded-xl border border-blue-200">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 block mb-1">Total Amount</span>
                        <h3 className="text-2xl font-black text-blue-700">₹{selectedInvoice.amount.toLocaleString()}</h3>
                    </div>
                    <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 p-5 rounded-xl border border-teal-200">
                        <span className="text-[10px] font-black uppercase tracking-widest text-teal-400 block mb-1">Paid Amount</span>
                        <h3 className="text-2xl font-black text-teal-700">₹{selectedInvoice.paidAmount.toLocaleString()}</h3>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 p-5 rounded-xl border border-orange-200">
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 block mb-1">Remaining Balance</span>
                        <h3 className="text-2xl font-black text-orange-700">₹{selectedInvoice.balance.toLocaleString()}</h3>
                    </div>
                    <div className={`p-5 rounded-xl border ${selectedInvoice.status === 'FULLY_PAID' ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200' : selectedInvoice.status === 'PARTIALLY_PAID' ? 'bg-gradient-to-br from-amber-50 to-amber-100/50 border-amber-200' : 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-200'}`}>
                        <span className={`text-[10px] font-black uppercase tracking-widest block mb-1 ${selectedInvoice.status === 'FULLY_PAID' ? 'text-emerald-400' : selectedInvoice.status === 'PARTIALLY_PAID' ? 'text-amber-400' : 'text-red-400'}`}>Status</span>
                        <h3 className={`text-xl font-black ${selectedInvoice.status === 'FULLY_PAID' ? 'text-emerald-700' : selectedInvoice.status === 'PARTIALLY_PAID' ? 'text-amber-700' : 'text-red-700'}`}>
                            {selectedInvoice.status === 'FULLY_PAID' ? 'Fully Paid' : selectedInvoice.status === 'PARTIALLY_PAID' ? 'Partially Paid' : 'Pending'}
                        </h3>
                    </div>
                </div>
                {/* Progress Bar */}
                <div className="mt-4">
                    <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Payment Progress</span>
                        <span className="text-xs font-black text-slate-900">{paidPct}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <div className={`h-full rounded-full transition-all duration-700 ${paidPct >= 100 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : paidPct > 0 ? 'bg-gradient-to-r from-teal-500 to-teal-400' : 'bg-slate-200'}`} style={{ width: `${paidPct}%` }}/>
                    </div>
                </div>
            </div>

            {/* Payment History */}
            <div className="flex-1 overflow-auto p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2"><FileText size={16}/> Payment History</h3>
                    <span className="text-xs font-bold text-slate-700">{payments.length} payment{payments.length !== 1 ? 's' : ''}</span>
                </div>
                {payments.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                        <Receipt size={40} className="text-slate-900 mx-auto mb-3"/>
                        <p className="text-lg font-bold text-slate-700">No payments yet</p>
                        <p className="text-sm text-slate-900 mt-1">Click "Add Payment" to record a payment</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {payments.map((p, i) => (
                            <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition p-4 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-black text-slate-800">#{payments.length - i}</div>
                                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider ${paymentModeColor(p.paymentMode)}`}>
                                        <PaymentModeIcon mode={p.paymentMode} size={14}/> {paymentModeLabel(p.paymentMode)}
                                    </div>
                                    <span className="font-bold text-slate-700 text-sm">
                                        {new Date(p.paymentDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}
                                    </span>
                                </div>
                                <span className="text-lg font-black text-teal-600">₹{p.amount.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Payment Modal */}
            {payModalOpen && renderPaymentModal()}
        </div>);
    }

    // ══════════════════════════════════════════════════
    // VIEW: SUPPLIER DETAIL (invoices list)
    // ══════════════════════════════════════════════════
    if (view === 'supplier-detail' && selectedSupplier) {
        // Refresh invoices from current ledgers state
        const supplierInvoices = ledgers.filter(l => l.contactNumber === selectedSupplier.contactNumber)
            .sort((a,b) => new Date(b.invoiceDate) - new Date(a.invoiceDate));
        const totalAmt = supplierInvoices.reduce((s,l) => s + l.amount, 0);
        const totalPaid = supplierInvoices.reduce((s,l) => s + l.paidAmount, 0);
        const totalBal = supplierInvoices.reduce((s,l) => s + l.balance, 0);

        return (<div className="flex flex-col h-[85vh] text-slate-800 bg-slate-50 w-full rounded-2xl overflow-hidden font-sans border border-slate-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5 shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={goBack} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition"><ArrowLeft size={20}/></button>
                    <div>
                        <h1 className="text-xl font-black text-white tracking-wide">{selectedSupplier.name}</h1>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-slate-700 text-xs font-bold flex items-center gap-1"><Phone size={10}/> {selectedSupplier.contactNumber}</span>
                            {selectedSupplier.gstNumber && <><span className="text-slate-900">|</span><span className="text-slate-700 text-xs font-bold flex items-center gap-1"><Building2 size={10}/> GST: {selectedSupplier.gstNumber}</span></>}
                            {selectedSupplier.address && <><span className="text-slate-900">|</span><span className="text-slate-700 text-xs font-bold flex items-center gap-1"><MapPin size={10}/> {selectedSupplier.address}</span></>}
                        </div>
                    </div>
                </div>
                <button onClick={openAddInvoice} className="flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-white rounded-xl font-black text-sm uppercase tracking-widest transition shadow-lg shadow-teal-500/30 active:scale-95">
                    <Plus size={18}/> Add Invoice
                </button>
            </div>

            {/* Supplier Summary */}
            <div className="p-6 bg-white border-b border-slate-200 shrink-0 grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 rounded-xl border border-blue-200">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 block mb-1">Total Invoiced</span>
                    <h3 className="text-2xl font-black text-blue-700">₹{totalAmt.toLocaleString()}</h3>
                    <p className="text-[10px] text-blue-500 font-bold mt-1">{supplierInvoices.length} invoice{supplierInvoices.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="bg-gradient-to-br from-teal-50 to-teal-100/50 p-5 rounded-xl border border-teal-200">
                    <span className="text-[10px] font-black uppercase tracking-widest text-teal-400 block mb-1">Total Paid</span>
                    <h3 className="text-2xl font-black text-teal-700">₹{totalPaid.toLocaleString()}</h3>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 p-5 rounded-xl border border-orange-200">
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 block mb-1">Total Balance</span>
                    <h3 className="text-2xl font-black text-orange-700">₹{totalBal.toLocaleString()}</h3>
                </div>
            </div>

            {/* Invoice List */}
            <div className="flex-1 overflow-auto p-6">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2 mb-4"><FileText size={16}/> Invoices</h3>
                {supplierInvoices.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                        <Receipt size={40} className="text-slate-900 mx-auto mb-3"/>
                        <p className="text-lg font-bold text-slate-700">No invoices yet</p>
                        <p className="text-sm text-slate-900 mt-1">Click "Add Invoice" to create the first invoice</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {supplierInvoices.map(inv => {
                            const dLeft = getDaysRemaining(inv.invoiceDate, inv.creditDays);
                            const paidPct = Math.min(100, Math.round((inv.paidAmount / inv.amount) * 100));
                            return (
                                <div key={inv.id} onClick={() => goToInvoiceDetail(inv)} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-300 transition cursor-pointer p-5 group">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-slate-100 group-hover:bg-teal-50 flex items-center justify-center transition">
                                                <Receipt size={22} className="text-slate-700 group-hover:text-teal-600 transition"/>
                                            </div>
                                            <div>
                                                <h4 className="font-black text-slate-800 group-hover:text-teal-700 transition">{inv.invoiceNumber}</h4>
                                                <div className="flex items-center gap-3 mt-0.5">
                                                    <span className="text-xs text-slate-700 font-bold">{new Date(inv.invoiceDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</span>
                                                    <span className="text-slate-900">|</span>
                                                    <span className="text-xs text-slate-700 font-bold">{inv.creditDays}d credit</span>
                                                    {inv.status !== 'FULLY_PAID' && dLeft <= 0 && <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black uppercase">OVERDUE</span>}
                                                    {inv.status !== 'FULLY_PAID' && dLeft > 0 && dLeft <= 3 && <span className="px-2 py-0.5 rounded-full bg-orange-500 text-white text-[9px] font-black uppercase">{dLeft}d LEFT</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <p className="text-lg font-black text-slate-800">₹{inv.amount.toLocaleString()}</p>
                                                {inv.balance > 0 ? <p className="text-xs font-black text-red-500">Bal: ₹{inv.balance.toLocaleString()}</p> : <p className="text-xs font-black text-emerald-500">Fully Paid</p>}
                                            </div>
                                            {/* Mini progress */}
                                            <div className="w-16 flex flex-col items-center gap-1">
                                                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full ${paidPct >= 100 ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: `${paidPct}%` }}/>
                                                </div>
                                                <span className="text-[10px] font-black text-slate-700">{paidPct}%</span>
                                            </div>
                                            <ChevronRight size={20} className="text-slate-900 group-hover:text-teal-500 transition"/>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add Invoice Modal */}
            {addInvoiceOpen && renderAddInvoiceModal()}
        </div>);
    }

    function renderAddInvoiceModal() {
        const supplier = invoiceFromCard || selectedSupplier;
        if (!supplier) return null;
        return (<div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-center text-white relative">
                    <button onClick={() => { setAddInvoiceOpen(false); setInvoiceFromCard(null); }} className="absolute top-4 right-4 text-slate-700 hover:text-white transition"><XCircle size={22}/></button>
                    <div className="inline-flex p-3 rounded-full bg-teal-500/20 mb-3"><Receipt size={24} className="text-teal-400"/></div>
                    <h2 className="text-lg font-black uppercase tracking-widest text-teal-400">Add Invoice</h2>
                    <p className="font-bold text-sm mt-1 text-slate-900">{supplier.name}</p>
                    <p className="text-xs text-slate-700 mt-0.5">📞 {supplier.contactNumber}{supplier.gstNumber ? ` • GST: ${supplier.gstNumber}` : ''}</p>
                </div>
                <div className="p-6 bg-slate-50 space-y-4">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Supplier's Invoice Number *</label>
                        <input autoFocus type="text" value={invoiceForm.invoiceNumber} onChange={e => setInvoiceForm({...invoiceForm, invoiceNumber: e.target.value})} placeholder="e.g. DT-INV-2026-001" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                        <p className="text-[10px] text-slate-700 mt-1 font-bold">Type the bill number printed on supplier's invoice slip.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Amount (₹) *</label>
                            <input type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm({...invoiceForm, amount: e.target.value})} placeholder="25000" className="w-full border border-slate-300 rounded-xl p-3.5 text-lg font-black outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                        </div>
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Credit Days</label>
                            <input type="number" value={invoiceForm.creditDays} onChange={e => setInvoiceForm({...invoiceForm, creditDays: e.target.value})} className="w-full border border-slate-300 rounded-xl p-3.5 text-lg font-black outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Invoice Date</label>
                        <input type="date" value={invoiceForm.date} onChange={e => setInvoiceForm({...invoiceForm, date: e.target.value})} className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                    </div>
                    <button onClick={submitQuickInvoice} className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-xl font-black uppercase tracking-widest text-sm transition shadow-lg shadow-teal-500/30 active:scale-[0.98]">
                        Create Invoice
                    </button>
                </div>
            </div>
        </div>);
    }

    // ══════════════════════════════════════════════════
    // PAYMENT MODAL (shared)
    // ══════════════════════════════════════════════════
    function renderPaymentModal() {
        return (<div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-center text-white relative">
                    <button onClick={() => setPayModalOpen(false)} className="absolute top-4 right-4 text-slate-700 hover:text-white transition"><XCircle size={22}/></button>
                    <div className="inline-flex p-3 rounded-full bg-teal-500/20 mb-3"><IndianRupee size={24} className="text-teal-400"/></div>
                    <h2 className="text-lg font-black uppercase tracking-widest text-teal-400">Add Payment</h2>
                    <p className="font-bold text-sm mt-1 text-slate-900">{selectedInvoice?.invoiceNumber}</p>
                </div>
                <div className="p-6 bg-slate-50 space-y-4">
                    <div className="flex justify-between bg-white p-3 rounded-xl border border-slate-200">
                        <div><span className="text-[10px] font-black uppercase tracking-widest text-slate-700 block">Total</span><span className="text-sm font-bold text-slate-700">₹{selectedInvoice?.amount?.toLocaleString()}</span></div>
                        <div className="text-right"><span className="text-[10px] font-black uppercase tracking-widest text-red-400 block">Balance</span><span className="text-sm font-black text-red-600">₹{selectedInvoice?.balance?.toLocaleString()}</span></div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Payment Amount (₹)</label>
                        <input type="number" value={payForm.amount} onChange={e => setPayForm({...payForm, amount: e.target.value})} max={selectedInvoice?.balance} min="1" className="w-full border border-slate-300 rounded-xl p-3.5 text-lg font-black outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Payment Method</label>
                        <div className="grid grid-cols-4 gap-2">
                            {['CASH','UPI','BANK','CREDIT'].map(mode => (
                                <button key={mode} onClick={() => setPayForm({...payForm, mode})} className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-xs font-black uppercase tracking-wider ${payForm.mode === mode ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
                                    <PaymentModeIcon mode={mode} size={20}/>{mode === 'BANK' ? 'Bank' : mode === 'CREDIT' ? 'Card' : mode}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Date</label><input type="date" value={payForm.date} onChange={e => setPayForm({...payForm, date: e.target.value})} className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/></div>
                        <div><label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Time</label><input type="time" value={payForm.time} onChange={e => setPayForm({...payForm, time: e.target.value})} className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/></div>
                    </div>
                    <button onClick={submitPayment} className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-xl font-black uppercase tracking-widest text-sm transition shadow-lg shadow-teal-500/30 active:scale-[0.98]">Confirm Payment</button>
                </div>
            </div>
        </div>);
    }

    // ══════════════════════════════════════════════════
    // VIEW: MAIN LIST (Customer table / Supplier cards)
    // ══════════════════════════════════════════════════
    return (<div className="flex h-[85vh] text-slate-800 bg-slate-50 w-full rounded-2xl overflow-hidden font-sans border border-slate-200">
      <div className="flex flex-col flex-1 overflow-hidden">

      {/* Summary Cards */}
      <div className="p-6 bg-white border-b border-slate-200 shadow-sm shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-4 z-10">
        <div className="bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-4 right-4 text-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity"><ArrowUpRight size={32}/></div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-700 mb-1">Total Sales</p>
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">₹{summary.totalSales.toLocaleString()}</h3>
        </div>
        <div className="bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-4 right-4 text-red-400 opacity-50 group-hover:opacity-100 transition-opacity"><ArrowDownRight size={32}/></div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-700 mb-1">Total Purchase</p>
          <h3 className="text-2xl font-black text-slate-800 tracking-tight">₹{summary.totalPurchase.toLocaleString()}</h3>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4 rounded-xl border border-emerald-200 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 mb-1">Total Receivable</p>
          <h3 className="text-2xl font-black text-emerald-700 tracking-tight">₹{summary.totalReceivable.toLocaleString()}</h3>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100/50 p-4 rounded-xl border border-red-200 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-widest text-red-600 mb-1">Total Payable</p>
          <h3 className="text-2xl font-black text-red-700 tracking-tight">₹{summary.totalPayable.toLocaleString()}</h3>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0 flex flex-col md:flex-row justify-between items-center gap-4 z-10">
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 h-10 w-full md:w-auto">
          <button onClick={() => { setActiveTab('CUSTOMER'); setView('list'); }} className={`flex-1 md:w-48 text-xs font-black uppercase tracking-widest transition-all rounded-md flex justify-center items-center gap-2 ${activeTab === 'CUSTOMER' ? 'bg-white shadow-sm text-emerald-600 border border-slate-200' : 'text-slate-700 hover:text-slate-900'}`}>
            <Activity size={14}/> Customer Ledger
          </button>
          <button onClick={() => { setActiveTab('SUPPLIER'); setView('list'); }} className={`flex-1 md:w-48 text-xs font-black uppercase tracking-widest transition-all rounded-md flex justify-center items-center gap-2 ${activeTab === 'SUPPLIER' ? 'bg-slate-800 shadow-sm text-white' : 'text-slate-700 hover:text-slate-900'}`}>
            <CreditCard size={14}/> Supplier Ledger
          </button>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-2.5 text-slate-700" size={16}/>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={activeTab === 'SUPPLIER' ? "Search supplier, phone, GST..." : "Search name, invoice..."} className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none font-bold"/>
          </div>
          <button onClick={exportCSV} className="h-10 px-4 border-2 border-slate-800 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition flex items-center gap-2 shadow-sm font-bold text-sm">
            <Download size={16}/> <span className="hidden lg:inline">CSV</span>
          </button>
          {activeTab === 'SUPPLIER' && (
            <button onClick={openAddSupplier} className="h-10 px-4 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition flex items-center gap-2 shadow-sm font-bold text-sm">
              <Plus size={16}/> <span className="hidden lg:inline">Add Supplier</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto bg-slate-50 p-6">
        {activeTab === 'SUPPLIER' ? (
          /* ── SUPPLIER CARDS ── */
          filteredSuppliers.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
              <User size={40} className="text-slate-900 mx-auto mb-3"/>
              <p className="text-lg font-bold text-slate-700">No suppliers yet</p>
              <p className="text-sm text-slate-900 mt-1">Click "Add Supplier" to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredSuppliers.map((s, i) => (
                <div key={s.contactNumber || i} onClick={() => goToSupplierDetail(s)} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-lg hover:border-teal-300 transition cursor-pointer p-5 group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-black text-lg shadow-md">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 group-hover:text-teal-700 transition">{s.name}</h4>
                        <span className="text-xs text-slate-700 font-bold flex items-center gap-1"><Phone size={10}/> {s.contactNumber}</span>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-slate-900 group-hover:text-teal-500 transition mt-1"/>
                  </div>
                  {s.gstNumber && <p className="text-[10px] font-bold text-slate-700 mb-1 flex items-center gap-1"><Building2 size={10}/> GST: {s.gstNumber}</p>}
                  {s.address && <p className="text-[10px] font-bold text-slate-700 mb-3 flex items-center gap-1 truncate"><MapPin size={10}/> {s.address}</p>}
                  <div className="border-t border-slate-100 pt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-700">Invoices</p>
                      <p className="text-lg font-black text-slate-800">{s.invoices.length}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-700">Total</p>
                      <p className="text-sm font-black text-slate-700">₹{s.totalAmount.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-700">Balance</p>
                      <p className={`text-sm font-black ${s.totalBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>₹{s.totalBalance.toLocaleString()}</p>
                    </div>
                  </div>
                  <button onClick={(e) => openQuickInvoice(s, e)}
                    className="mt-3 w-full py-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 hover:border-teal-400 text-teal-700 rounded-lg font-black text-xs uppercase tracking-widest transition flex items-center justify-center gap-1">
                    <Plus size={14}/> Add Invoice
                  </button>
                </div>
              ))}
            </div>
          )
        ) : (
          /* ── CUSTOMER TABLE (unchanged) ── */
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left whitespace-nowrap text-sm border-collapse">
              <thead className="bg-[#f8fafc] sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="p-4 px-6 text-xs uppercase font-black tracking-widest text-slate-700">Customer</th>
                  <th className="p-4 text-xs uppercase font-black tracking-widest text-slate-700">Invoice</th>
                  <th className="p-4 text-xs uppercase font-black tracking-widest text-slate-700">Status</th>
                  <th className="p-4 text-right text-xs uppercase font-black tracking-widest text-slate-700">Amount</th>
                  <th className="p-4 text-right text-xs uppercase font-black tracking-widest text-slate-700">Paid</th>
                  <th className="p-4 text-right text-xs uppercase font-black tracking-widest text-slate-700">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCustomerLedgers.map(l => (
                  <tr key={l.id} className="hover:bg-teal-50/30 transition-colors">
                    <td className="p-4 px-6"><p className="font-bold text-slate-800">{l.partyName}</p></td>
                    <td className="p-4"><p className="font-bold text-slate-700">{l.invoiceNumber}</p><p className="text-xs text-slate-700">{new Date(l.invoiceDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</p></td>
                    <td className="p-4">
                      {l.status === 'FULLY_PAID' && <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase border border-emerald-200"><CheckCircle size={12}/> Paid</span>}
                      {l.status === 'PARTIALLY_PAID' && <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-[10px] font-black uppercase border border-orange-200"><Clock size={12}/> Partial</span>}
                      {l.status === 'PENDING' && <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-black uppercase border border-red-200"><Activity size={12}/> Pending</span>}
                    </td>
                    <td className="p-4 text-right font-black text-slate-800">₹{l.amount.toLocaleString()}</td>
                    <td className="p-4 text-right font-black text-emerald-600">₹{l.paidAmount.toLocaleString()}</td>
                    <td className="p-4 text-right">{l.balance === 0 ? <span className="text-slate-900 font-bold">₹0</span> : <span className="font-black text-red-600">₹{l.balance.toLocaleString()}</span>}</td>
                  </tr>
                ))}
                {filteredCustomerLedgers.length === 0 && <tr><td colSpan={6} className="py-20 text-center text-slate-700 font-bold">No entries found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </div>

      {/* ── Right Side: Deadline Alerts ── */}
      {activeTab === 'SUPPLIER' && deadlineAlerts.length > 0 && (
        <div className="w-72 bg-white border-l border-slate-200 shrink-0 flex flex-col overflow-hidden">
          <div className="px-4 py-4 bg-gradient-to-r from-red-500 to-orange-500 shrink-0">
            <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2"><AlertTriangle size={16}/> Deadline Alerts</h3>
            <p className="text-[10px] font-bold text-white/70 mt-1">{deadlineAlerts.length} pending</p>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-3">
            {deadlineAlerts.map(a => {
              const dLeft = getDaysRemaining(a.invoiceDate, a.creditDays);
              const dl = new Date(a.invoiceDate); dl.setDate(dl.getDate() + a.creditDays);
              return (
                <div key={a.id} className={`p-4 rounded-xl border shadow-sm relative ${dLeft <= 0 ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'}`}>
                  <button onClick={() => setDismissedAlerts(p => [...p, a.id])} className="absolute top-2 right-2 text-slate-900 hover:text-slate-800"><XCircle size={14}/></button>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase mb-2 ${dLeft <= 0 ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
                    <AlertTriangle size={9}/> {dLeft <= 0 ? `OVERDUE ${Math.abs(dLeft)}d` : `${dLeft}d LEFT`}
                  </span>
                  <p className="font-black text-slate-800 text-sm">{a.partyName}</p>
                  <p className="text-[10px] font-bold text-slate-700">{a.invoiceNumber}</p>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs font-bold text-slate-800">{dl.toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</span>
                    <span className={`text-sm font-black ${dLeft <= 0 ? 'text-red-600' : 'text-orange-600'}`}>₹{a.balance.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Supplier Modal — captures supplier details + (optional) first invoice */}
      {addSupplierOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl overflow-hidden my-4">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-center text-white relative">
              <button onClick={() => setAddSupplierOpen(false)} className="absolute top-4 right-4 text-slate-700 hover:text-white transition"><XCircle size={22}/></button>
              <div className="inline-flex p-3 rounded-full bg-teal-500/20 mb-3"><User size={24} className="text-teal-400"/></div>
              <h2 className="text-lg font-black uppercase tracking-widest text-teal-400">Create Supplier</h2>
              <p className="text-[10px] text-slate-700 mt-1 font-bold">Mobile is the unique identifier — same supplier = same mobile</p>
            </div>
            <div className="p-6 bg-slate-50 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Supplier Name *</label>
                <input type="text" value={supplierForm.name} onChange={e => setSupplierForm({...supplierForm, name: e.target.value})} placeholder="e.g., Durga Traders" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Mobile Number *</label>
                <input type="tel" value={supplierForm.contact} onChange={e => setSupplierForm({...supplierForm, contact: e.target.value})} placeholder="e.g., 9876543210" maxLength={15} className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Default GST Number</label>
                <input type="text" value={supplierForm.gst} onChange={e => setSupplierForm({...supplierForm, gst: e.target.value.toUpperCase()})} placeholder="e.g., 33AABCT1332L1ZZ" maxLength={15} className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-700 block mb-1.5">Address</label>
                <textarea value={supplierForm.address} onChange={e => setSupplierForm({...supplierForm, address: e.target.value})} placeholder="e.g., 12, Anna Nagar, Chennai" rows={2} className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white resize-none"/>
              </div>
              {/* First invoice section — optional */}
              <div className="border-t-2 border-dashed border-slate-300 pt-4 mt-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-teal-700 mb-1">First Invoice (optional)</p>
                <p className="text-[10px] text-slate-700 font-bold mb-3">If supplier already gave you a bill, type it here. Else skip — add later.</p>
                <div className="space-y-3">
                    <input type="text" value={supplierForm.invoiceNumber} onChange={e => setSupplierForm({...supplierForm, invoiceNumber: e.target.value})} placeholder="Supplier's invoice number" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                    <div className="grid grid-cols-2 gap-3">
                        <input type="number" value={supplierForm.amount} onChange={e => setSupplierForm({...supplierForm, amount: e.target.value})} placeholder="Amount ₹" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                        <input type="number" value={supplierForm.creditDays} onChange={e => setSupplierForm({...supplierForm, creditDays: e.target.value})} placeholder="Credit days" className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                    </div>
                    <input type="date" value={supplierForm.date} onChange={e => setSupplierForm({...supplierForm, date: e.target.value})} className="w-full border border-slate-300 rounded-xl p-3 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 bg-white"/>
                </div>
              </div>
              <button onClick={submitNewSupplier} className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-xl font-black uppercase tracking-widest text-sm transition shadow-lg shadow-teal-500/30 active:scale-[0.98]">
                Save Supplier{supplierForm.invoiceNumber.trim() && supplierForm.amount ? ' + Invoice' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Invoice Modal — shown from supplier card in list view */}
      {addInvoiceOpen && invoiceFromCard && renderAddInvoiceModal()}
    </div>);
}
