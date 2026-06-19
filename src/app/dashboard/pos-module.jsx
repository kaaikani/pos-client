"use client";
import React, { useState, useEffect, useRef } from 'react';
import { LookupBarcodeQuery } from '../../core/queries/PosQueries';
import { CreateLedgerCommand } from '../../core/queries/ledger.query';
import { ListItemsQuery, CreateSaleCommand, ListSalesQuery, DeleteSaleCommand, PosTaxMastersQuery } from '../../core/queries/pharma.query';
import { invalidateCache } from '../../core/queries/cache';
import { gql } from '../../core/queries/gql';
import InvoicePreviewModal from '../../components/invoice/InvoicePreviewModal';
import { computeCartTotals } from '../../core/pos/cart-tax';

// Common unit presets — covers weight (fruits/vegetables), count (biscuits/choc), volume (milk)
const COMMON_UNITS = [
    '1 Pc', '1 Pack', '1 Box', '1 Dozen',
    '50 g', '100 g', '200 g', '250 g', '500 g', '750 g',
    '1 kg', '1.5 kg', '2 kg', '5 kg',
    '1/4 kg', '1/2 kg', '3/4 kg',
    '100 ml', '250 ml', '500 ml', '1 L', '2 L', '5 L',
];

// Detect if an item is weight-based to pick a sensible default unit
function defaultUnitFor(item) {
    if (!item) return '1 Pc';
    if (item.isWeightBased) return '1 kg';
    const cat = (item.category || '').toLowerCase();
    if (/fruit|vegetable|veg|pulse|grain|rice|atta|flour|sugar|salt/i.test(cat)) return '1 kg';
    if (/milk|oil|water|juice|drink/i.test(cat)) return '1 L';
    return '1 Pc';
}
const BILL_SIZES = {
    '3inch': { label: '3"', width: '76mm', css: '@page{size:76mm auto;margin:2mm}' },
    '4inch': { label: '4"', width: '104mm', css: '@page{size:104mm auto;margin:3mm}' },
    '6inch': { label: '6"', width: '152mm', css: '@page{size:152mm auto;margin:4mm}' },
    'A4': { label: 'A4', width: '210mm', css: '@page{size:A4;margin:10mm}' },
    'A5': { label: 'A5', width: '148mm', css: '@page{size:A5;margin:8mm}' },
    'A6': { label: 'A6', width: '105mm', css: '@page{size:A6;margin:5mm}' },
};

function saveToReport(order) { try { const e = JSON.parse(localStorage.getItem('pos_reports') || '[]'); e.unshift({ ...order, timestamp: new Date().toISOString() }); localStorage.setItem('pos_reports', JSON.stringify(e)); } catch {} }

export default function PosModule() {
    const [pharmaItems, setPharmaItems] = useState([]);
    const [billNo, setBillNo] = useState('');
    const [lastBillNo, setLastBillNo] = useState('3');
    const [date, setDate] = useState(new Date().toLocaleDateString('en-GB'));
    const [mode, setMode] = useState('CASH');
    const [book, setBook] = useState('NA');
    const [billRef, setBillRef] = useState('');
    const [customerEnabled, setCustomerEnabled] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [salesMan, setSalesMan] = useState('');
    const [customerRef, setCustomerRef] = useState('');
    const [quotation, setQuotation] = useState('');
    const [bundleNo, setBundleNo] = useState('');
    const [igst, setIgst] = useState(false);
    const [nonAcc, setNonAcc] = useState(false);
    // GST compliance inputs (sent to backend on save; printed on the tax invoice).
    const [customerGstin, setCustomerGstin] = useState('');
    const [placeOfSupply, setPlaceOfSupply] = useState('');
    const [reverseCharge, setReverseCharge] = useState(false);
    const [taxMasters, setTaxMasters] = useState([]);
    const [header, setHeader] = useState(false);
    const [taxType, setTaxType] = useState('WTax');
    const [rateType, setRateType] = useState('ARate');
    const [rows, setRows] = useState([{ sno: 1, code: '', itemName: '', qty: '', rate: '', amount: '', total: '' }]);
    const [receivedAmt, setReceivedAmt] = useState('');
    const [discount, setDiscount] = useState('0');
    const [transportCharges, setTransportCharges] = useState('0');
    const [debitPoint, setDebitPoint] = useState('0');
    const [remarks, setRemarks] = useState('');

    const [showSearch, setShowSearch] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [searchRowIdx, setSearchRowIdx] = useState(-1);
    const [searchSelIdx, setSearchSelIdx] = useState(0);
    const [selectedProduct, setSelectedProduct] = useState(null); // For stock display
    const searchRef = useRef(null);

    // Inline row autocomplete (item name / code)
    const [suggestRow, setSuggestRow] = useState(-1);   // which row's input is active
    const [suggestField, setSuggestField] = useState(''); // 'itemName' | 'code'
    const [suggestSelIdx, setSuggestSelIdx] = useState(0);

    // Per-row size variant dropdown (Unit cell shows kg list when product has variants)
    const [unitDropdownRow, setUnitDropdownRow] = useState(-1);
    const [unitDropdownSelIdx, setUnitDropdownSelIdx] = useState(0);

    // Checkout flow — split payment (Cash + UPI + Card combined for one bill)
    const [showCheckout, setShowCheckout] = useState(false);
    const [payCash, setPayCash] = useState('');
    const [payUpi, setPayUpi] = useState('');
    const [payCard, setPayCard] = useState('');
    const [payCredit, setPayCredit] = useState('');

    const [lastOrder, setLastOrder] = useState(null);
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
    const [invoiceTarget, setInvoiceTarget] = useState({ saleId: null, billNo: '' });
    const [showToast, setShowToast] = useState(false);

    // Parked/Hold bills
    const [parkedBills, setParkedBills] = useState([]);
    const [showParkedModal, setShowParkedModal] = useState(false);
    const [parkedSelIdx, setParkedSelIdx] = useState(0);

    // Keyboard navigation
    const [focusedRow, setFocusedRow] = useState(-1); // cart row index under arrow focus

    // Last Bills viewer (recent finalized bills from localStorage)
    const [showLastBills, setShowLastBills] = useState(false);
    const [lastBills, setLastBills] = useState([]);
    const [lastBillsFilter, setLastBillsFilter] = useState('');
    const lastBillsSearchRef = useRef(null);

    // Per-customer last sale rate: Map<itemCode, { rate, billNo, billDate }>
    const [customerLastRates, setCustomerLastRates] = useState({});

    // New: sales tabs, bill-size, counter & rate-type label, customer autocomplete
    const [activeSalesTab, setActiveSalesTab] = useState('Sales1');
    const [counterName, setCounterName] = useState('COUNTER A');
    const [billSize, setBillSize] = useState('3inch');
    const [customerSuggestions, setCustomerSuggestions] = useState([]);
    const [showCustSuggest, setShowCustSuggest] = useState(false);
    const [custSuggestSelIdx, setCustSuggestSelIdx] = useState(0);
    const [nameSuggestions, setNameSuggestions] = useState([]);
    const [showNameSuggest, setShowNameSuggest] = useState(false);
    const [nameSuggestSelIdx, setNameSuggestSelIdx] = useState(0);
    const [pickedCustomerId, setPickedCustomerId] = useState(null);
    const itemNameInputsRef = useRef({});

    useEffect(() => {
        setDate(new Date().toLocaleDateString('en-GB'));
        // Force fresh fetch on POS open so newly-added items / size variants are picked up
        invalidateCache('pharma:items');
        new ListItemsQuery().execute().then(setPharmaItems).catch(e => console.error(e));
        new PosTaxMastersQuery().execute().then(setTaxMasters).catch(() => {});
        // Load parked bills
        try { setParkedBills(JSON.parse(localStorage.getItem('pos_parked_bills') || '[]')); } catch {}

        // Sync Bill No: new bill = max existing + 1.
        // Deleted bill numbers are NOT reused — existing bills keep their original numbers,
        // so a deletion never affects other bills' identity.
        // e.g. 1,2,3,4,5,6,7,8,9,10 exist → delete 5 → remaining 1,2,3,4,6,7,8,9,10 → next = 11.
        (async () => {
            let maxBillNo = 0;
            try {
                const reports = JSON.parse(localStorage.getItem('pos_reports') || '[]');
                for (const r of reports) {
                    const n = parseInt(r.billNo, 10);
                    if (!isNaN(n) && n > maxBillNo) maxBillNo = n;
                }
            } catch {}
            try {
                const dbSales = await new ListSalesQuery().execute();
                for (const s of (dbSales || [])) {
                    const n = parseInt(s.billNo, 10);
                    if (!isNaN(n) && n > maxBillNo) maxBillNo = n;
                }
            } catch {}
            // Also remember the highest-ever bill number seen, so that deleting the latest
            // bill does NOT cause the counter to roll back.
            try {
                const seen = parseInt(localStorage.getItem('pos_max_billno_ever') || '0', 10);
                if (!isNaN(seen) && seen > maxBillNo) maxBillNo = seen;
            } catch {}
            setLastBillNo(String(maxBillNo));
            setBillNo(String(maxBillNo + 1));
        })();

        // Auto-focus the first ItemName input on load
        setTimeout(() => { itemNameInputsRef.current[0]?.focus(); }, 200);
    }, []);

    // Persist parked bills
    useEffect(() => {
        localStorage.setItem('pos_parked_bills', JSON.stringify(parkedBills));
    }, [parkedBills]);

    const totalItems = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
    const subTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const discAmt = parseFloat(discount) || 0;
    const transportAmt = parseFloat(transportCharges) || 0;

    // Live GST — mirrors the backend per-item tax (gstPercent + priceIncludesTax +
    // optional PosTaxMaster), NOT a flat 18%. Keeps the preview and the saved bill
    // identical and within the server's ±₹1 grand-total tolerance.
    const itemsByCode = React.useMemo(() => {
        const m = new Map();
        for (const it of pharmaItems) m.set(String(it.code), it);
        return m;
    }, [pharmaItems]);
    const taxMastersById = React.useMemo(() => {
        const m = new Map();
        for (const t of taxMasters) m.set(Number(t.id), t);
        return m;
    }, [taxMasters]);
    const cartTax = React.useMemo(
        () => computeCartTotals(rows, itemsByCode, taxMastersById, { otherState: nonAcc, discount: discAmt, transport: transportAmt }),
        [rows, itemsByCode, taxMastersById, nonAcc, discAmt, transportAmt],
    );
    const taxAmount = taxType === 'WTax' ? cartTax.taxAmount : 0;
    const grandTotal = taxType === 'WTax'
        ? cartTax.grandTotal
        : Math.round((subTotal + transportAmt - discAmt) * 100) / 100;
    const receivedA = parseFloat(receivedAmt) || 0;
    const balance = Math.round((grandTotal - receivedA) * 100) / 100;

    const addRow = () => setRows(prev => [...prev, { sno: prev.length + 1, code: '', itemName: '', qty: '', rate: '', amount: '', total: '' }]);

    const updateRow = (idx, field, val) => {
        // Stock guard: only enforced when item has isStockBased = true
        if (field === 'qty') {
            const r = rows[idx];
            if (r && r.itemName) {
                const prod = pharmaItems.find(p => p.code === r.code || p.itemName === r.itemName);
                if (prod && prod.isStockBased === true) {
                    const stock = prod.minStkQty != null && prod.minStkQty !== '' ? parseFloat(prod.minStkQty)
                                : prod.minStock != null && prod.minStock !== '' ? parseFloat(prod.minStock)
                                : null;
                    const newQty = parseFloat(val) || 0;
                    // sum qty of same product in OTHER rows
                    const otherRowsQty = rows.reduce((s, x, i) =>
                        i !== idx && x.code === r.code && x.itemName === r.itemName ? s + (parseFloat(x.qty) || 0) : s, 0);
                    if (stock != null && newQty + otherRowsQty > stock) {
                        alert(`❌ INSUFFICIENT STOCK\n\n"${r.itemName}" — only ${stock} available.\n(Other rows: ${otherRowsQty}, you typed: ${newQty})`);
                        return; // don't update
                    }
                }
            }
        }
        setRows(prev => prev.map((r, i) => {
            if (i !== idx) return r;
            const u = { ...r, [field]: val };
            const qty = parseFloat(u.qty) || 0;
            const rate = parseFloat(u.rate) || 0;
            const amt = qty * rate;
            u.amount = amt.toFixed(2);
            u.total = amt.toFixed(2);
            return u;
        }));
    };

    const openSearch = (rowIdx) => {
        setSearchRowIdx(rowIdx); setSearchText(''); setSearchSelIdx(0); setShowSearch(true);
        setTimeout(() => searchRef.current?.focus(), 50);
    };

    // Returns valid weight/size variants from the item (excludes "NA" placeholders)
    const getItemVariants = (item) => {
        const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
        return sizes.filter(s => s && s.size && s.size !== 'NA' && (parseFloat(s.rate) || 0) > 0);
    };

    // Lookup variants for a cart row by matching code/itemName against pharmaItems master
    const getRowVariants = (row) => {
        if (!row?.itemName) return [];
        const prod = pharmaItems.find(p => p.code === row.code || p.itemName === row.itemName);
        return prod ? getItemVariants(prod) : [];
    };

    // Apply a variant pick to a cart row — updates unit, rate, amount instantly
    const applyVariantToRow = (rowIdx, variant) => {
        if (!variant) return;
        setRows(prev => prev.map((r, i) => {
            if (i !== rowIdx) return r;
            const rate = parseFloat(variant.rate) || 0;
            const qty = parseFloat(r.qty) || 1;
            const amt = qty * rate;
            return { ...r, unit: variant.size, rate: String(rate), amount: amt.toFixed(2), total: amt.toFixed(2) };
        }));
        setUnitDropdownRow(-1);
    };

    // Read available stock from a pharma item (minStkQty preferred, else minStock)
    const getItemStock = (item) => {
        if (!item) return null;
        if (item.minStkQty != null && item.minStkQty !== '') return parseFloat(item.minStkQty);
        if (item.minStock != null && item.minStock !== '') return parseFloat(item.minStock);
        return null; // unknown — don't block
    };

    // How much of this item is already in the cart (sum of qty across rows)
    const cartQtyForItem = (item) => {
        if (!item) return 0;
        return rows.reduce((s, r) => {
            if (r.code === item.code && r.itemName === item.itemName) {
                return s + (parseFloat(r.qty) || 0);
            }
            return s;
        }, 0);
    };

    const pickItem = (item) => {
        if (!item) return;
        setSelectedProduct(item);

        // Stock validation — ONLY enforced when item has isStockBased = true
        if (item.isStockBased === true) {
            const stock = getItemStock(item);
            if (stock != null && stock <= 0) {
                alert(`❌ OUT OF STOCK\n\n"${item.itemName}" (Code: ${item.code}) is out of stock and cannot be added to the bill.\n\nPlease restock the item from Item Master / Purchase first.`);
                return;
            }
            if (stock != null) {
                const alreadyInCart = cartQtyForItem(item);
                if (alreadyInCart + 1 > stock) {
                    alert(`❌ INSUFFICIENT STOCK\n\n"${item.itemName}" — only ${stock} available, but you've already added ${alreadyInCart} to the cart.`);
                    return;
                }
            }
        }

        // Default to first size variant if available, else item's base rate
        const variants = getItemVariants(item);
        const defaultVariant = variants.length > 0 ? variants[0] : null;
        finalizePickItem(item, defaultVariant);
    };

    // Final cart-row insertion (with optional size variant override)
    const finalizePickItem = (item, variant) => {
        if (!item) return;
        let idx = searchRowIdx;
        let focusTarget = null; // { row, cell }
        const overrideUnit = variant?.size;
        const overrideRate = variant ? parseFloat(variant.rate) : null;
        setRows(prev => {
            let nr = [...prev];
            // DUPLICATE DETECTION: same product + same variant (unit) → bump qty
            const dupUnit = overrideUnit || item.unit || defaultUnitFor(item);
            const existingIdx = nr.findIndex(r => r.itemName && r.code === item.code && r.itemName === item.itemName && (r.unit || '') === dupUnit);
            let filledRowIdx = idx;
            if (existingIdx >= 0 && existingIdx !== idx) {
                // Bump existing row's qty
                const er = { ...nr[existingIdx] };
                const newQty = (parseFloat(er.qty) || 0) + 1;
                const rate = parseFloat(er.rate) || 0;
                er.qty = String(newQty);
                er.amount = (newQty * rate).toFixed(2);
                er.total = er.amount;
                nr[existingIdx] = er;
                filledRowIdx = existingIdx;
            } else {
                // New product → fill the row at idx (or append if idx out of range)
                while (nr.length <= idx) nr.push({ sno: nr.length + 1, code: '', itemName: '', qty: '', rate: '', amount: '', total: '' });
                const rate = overrideRate != null ? overrideRate : (parseFloat(item.salesRate || item.mrpRate || 0) || 0);
                nr[idx] = {
                    ...nr[idx], code: item.code, itemName: item.itemName,
                    unit: dupUnit,
                    qty: '1', rate: String(rate),
                    amount: rate.toFixed(2), total: rate.toFixed(2),
                };
            }
            // Clean up: keep only rows that have itemName (filled rows)
            nr = nr.filter(r => r.itemName);
            // Ensure exactly ONE trailing blank row for continuous entry
            nr.push({ sno: nr.length + 1, code: '', itemName: '', qty: '', rate: '', amount: '', total: '' });
            // After pick: focus the Qty cell of the row we just filled, so user can adjust qty → Enter → Rate → Enter → next row.
            focusTarget = { row: filledRowIdx, cell: 'qty' };
            return nr.map((r, i) => ({ ...r, sno: i + 1 }));
        });
        setTimeout(() => {
            if (focusTarget) {
                const el = document.querySelector(`input[data-row="${focusTarget.row}"][data-cell="${focusTarget.cell}"]`);
                el?.focus();
                el?.select?.();
            }
        }, 50);
    };

    // When clicking a row in the cart, show that product's stock
    const selectRowForStock = (row) => {
        const prod = pharmaItems.find(p => p.code === row.code || p.itemName === row.itemName);
        if (prod) setSelectedProduct(prod);
    };

    const filteredSearchItems = pharmaItems.filter(it => {
        if (!searchText) return true;
        const s = searchText.toLowerCase();
        return (it.itemName || '').toLowerCase().includes(s) || String(it.code).includes(s);
    });

    // Inline suggestions for a typed value (matches itemName OR code)
    // Sorted: exact match → starts-with → contains, code priority when typing in code field
    const getRowSuggestions = (text) => {
        const s = String(text || '').trim().toLowerCase();
        if (!s) return [];
        const codeFirst = suggestField === 'code';
        const matches = pharmaItems.filter(it =>
            (it.itemName || '').toLowerCase().includes(s) || String(it.code || '').toLowerCase().includes(s)
        );
        const score = (it) => {
            const code = String(it.code || '').toLowerCase();
            const name = (it.itemName || '').toLowerCase();
            // Lower score = higher priority. Code priority when typing in code field.
            if (codeFirst) {
                if (code === s) return 0;          // exact code match
                if (code.startsWith(s)) return 1;  // code starts-with
                if (name === s) return 2;          // exact name match
                if (name.startsWith(s)) return 3;  // name starts-with
                if (code.includes(s)) return 4;    // code contains
                return 5;                          // name contains
            } else {
                if (name === s) return 0;          // exact name match
                if (name.startsWith(s)) return 1;  // name starts-with
                if (code === s) return 2;          // exact code match
                if (code.startsWith(s)) return 3;  // code starts-with
                if (name.includes(s)) return 4;    // name contains
                return 5;                          // code contains
            }
        };
        matches.sort((a, b) => score(a) - score(b));
        return matches.slice(0, 50);
    };
    const activeSuggestions = suggestRow >= 0
        ? getRowSuggestions(rows[suggestRow]?.[suggestField] || '')
        : [];

    // Open checkout panel — validates cart has items
    const openCheckout = () => {
        const validRows = rows.filter(r => r.itemName && parseFloat(r.qty) > 0);
        if (validRows.length === 0) return alert('Add at least one item before checkout.');
        // Start fresh — let cashier type amounts. Balance Amount will show what's due.
        setPayCash(''); setPayUpi(''); setPayCard(''); setPayCredit('');
        setShowCheckout(true);
    };

    // Live totals for the checkout panel
    const splitTotal = (parseFloat(payCash) || 0) + (parseFloat(payUpi) || 0) + (parseFloat(payCard) || 0) + (parseFloat(payCredit) || 0);
    const splitBalance = grandTotal - splitTotal;

    // Confirm payment — applies split amounts and saves
    const confirmCheckout = async () => {
        if (splitTotal <= 0) return alert('Enter at least one payment amount.');
        if (Math.abs(splitBalance) > 0.01 && (parseFloat(payCredit) || 0) === 0) {
            if (splitBalance > 0) {
                if (!confirm(`Balance ₹${splitBalance.toFixed(2)} unpaid. Save remaining as Credit (customer ledger)?`)) return;
                setPayCredit(String(splitBalance.toFixed(2)));
            } else {
                if (!confirm(`Received ₹${(-splitBalance).toFixed(2)} extra. Confirm save (extra returned as change)?`)) return;
            }
        }
        setShowCheckout(false);
        setTimeout(() => handleSave(), 50);
    };

    const handleSave = async () => {
        const validRows = rows.filter(r => r.itemName && parseFloat(r.qty) > 0);
        if (validRows.length === 0) return alert('Add at least one item.');

        // Credit mode → customer name, phone & address are mandatory (we need to track who owes us)
        // Split-payment amounts (from Checkout panel). Falls back to single-mode legacy values.
        const cashA = parseFloat(payCash) || 0;
        const upiA = parseFloat(payUpi) || 0;
        const cardA = parseFloat(payCard) || 0;
        const creditA = parseFloat(payCredit) || 0;
        const totalReceived = cashA + upiA + cardA;
        const isCredit = creditA > 0 || (totalReceived === 0 && String(mode).toUpperCase() === 'CREDIT');

        if (isCredit) {
            const missing = [];
            if (!customerName.trim() || customerName.trim().toUpperCase() === 'COUNTER SALES') missing.push('Customer Name');
            if (!customerPhone.trim() || customerPhone.replace(/\D/g,'').length < 10) missing.push('Mobile Number (10 digits)');
            if (!customerAddress.trim()) missing.push('Address');
            if (missing.length > 0) {
                alert(`CREDIT bill requires customer details:\n\n• ${missing.join('\n• ')}\n\nFill these and try again.`);
                if (missing[0] === 'Customer Name') document.getElementById('cust-input')?.focus();
                else if (missing[0].startsWith('Mobile')) document.getElementById('phone-input')?.focus();
                return;
            }
        }

        const balanceDue = creditA > 0 ? creditA : (isCredit ? grandTotal : Math.max(0, grandTotal - totalReceived));
        const changeReturned = !isCredit && totalReceived > grandTotal ? totalReceived - grandTotal : 0;
        // Determine primary saleType for legacy reporting (highest contributor wins)
        const primaryMode = creditA > 0 ? 'CREDIT'
            : cashA >= upiA && cashA >= cardA ? 'CASH'
            : upiA >= cardA ? 'UPI' : 'CARD';
        const now = new Date();
        const saleInput = {
            billNo: String(billNo), billDate: new Date().toISOString().split('T')[0],
            billTime: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
            saleType: primaryMode, bookNo: book, billRef,
            customerName: customerName || 'Walk-in', customerPhone, customerAddress, salesMan,
            // GST compliance — backend stores these, derives invoiceType, and uses
            // placeOfSupply/otherState to decide intra vs inter-state.
            otherState: nonAcc,
            customerGstin: customerGstin.trim().toUpperCase(),
            placeOfSupply: placeOfSupply.trim(),
            reverseCharge,
            items: validRows.map(r => ({ code: r.code, name: r.itemName, qty: parseFloat(r.qty), rate: parseFloat(r.rate), amount: parseFloat(r.amount) })),
            subtotal: subTotal, taxAmount, discount: discAmt, transportCharges: transportAmt, grandTotal,
            cashAmount: cashA, upiAmount: upiA, cardAmount: cardA,
            receivedAmount: totalReceived, balanceDue, changeReturned,
            remarks: header ? `[HOME DELIVERY] ${remarks || ''}`.trim() : remarks,
        };
        try {
            // Auto-save customer to Vendure for future lookup (find-or-create by phone)
            await ensureCustomer();

            // ⭐ SAVE TO DATABASE via GraphQL mutation
            const savedSale = await new CreateSaleCommand().execute(saleInput);

            // Also save to local pos_reports (for legacy report module)
            const legacyPayload = {
                invoiceId: 'BILL-' + billNo, billNo, date, mode: primaryMode, book, billRef,
                customer: { name: customerName || 'Walk-in', phone: customerPhone, address: customerAddress },
                salesMan, items: validRows.map(r => ({ id: r.code, name: r.itemName, barcode: r.code, price: parseFloat(r.rate), qty: parseFloat(r.qty), total: parseFloat(r.amount), quantityStr: '1 Pc' })),
                saleType: primaryMode === 'CASH' ? 'OFFLINE' : primaryMode === 'CREDIT' ? 'CREDIT' : 'ONLINE',
                subtotal: subTotal, taxAmount, discount: discAmt, transport: transportAmt,
                grandTotal, receivedAmount: totalReceived, balance: balanceDue,
                gstAmount: taxAmount, cashAmount: saleInput.cashAmount, upiAmount: saleInput.upiAmount, cardAmount: saleInput.cardAmount,
                dbId: savedSale?.id,
                homeDelivery: !!header,
            };
            saveToReport(legacyPayload);

            // For CREDIT sales → create customer ledger entry
            if (creditA > 0 && customerName) {
                try {
                    await new CreateLedgerCommand().execute({
                        type: 'CUSTOMER',
                        partyName: customerName,
                        invoiceNumber: String(billNo),
                        invoiceDate: new Date().toISOString(),
                        amount: Math.round(creditA),
                        creditDays: 30,
                        contactNumber: customerPhone || '',
                        address: customerAddress || '',
                    });
                } catch (err) { console.warn('Ledger entry failed:', err.message); }
            }

            setLastOrder(legacyPayload);
            setShowToast(true); setTimeout(() => setShowToast(false), 5000);

            // Ask if user wants to print this bill
            const wantPrint = window.confirm(`✓ Bill ${billNo} saved!\n\nDo you want to print it?\n\n• OK = Print\n• Cancel = Continue to next bill`);

            const justSavedBillNo = parseInt(billNo) || 0;

            // Reset entire form to a clean state (Home Delivery, GST, etc.)
            handleCancel();

            // Next bill = max + 1. Deleting old bills doesn't roll back the counter,
            // because we also persist the highest-ever number to localStorage.
            try {
                let maxBillNo = justSavedBillNo;
                try {
                    const reports = JSON.parse(localStorage.getItem('pos_reports') || '[]');
                    for (const r of reports) {
                        const n = parseInt(r.billNo, 10);
                        if (!isNaN(n) && n > maxBillNo) maxBillNo = n;
                    }
                } catch {}
                try {
                    const dbSales = await new ListSalesQuery().execute();
                    for (const s of (dbSales || [])) {
                        const n = parseInt(s.billNo, 10);
                        if (!isNaN(n) && n > maxBillNo) maxBillNo = n;
                    }
                } catch {}
                try {
                    const seen = parseInt(localStorage.getItem('pos_max_billno_ever') || '0', 10);
                    if (!isNaN(seen) && seen > maxBillNo) maxBillNo = seen;
                } catch {}
                // Remember this so future loads never roll back even after deletions
                try { localStorage.setItem('pos_max_billno_ever', String(maxBillNo)); } catch {}
                setLastBillNo(String(maxBillNo));
                setBillNo(String(maxBillNo + 1));
            } catch {
                setLastBillNo(String(justSavedBillNo));
                setBillNo(String(justSavedBillNo + 1));
            }

            if (wantPrint) {
                // Slight delay so React can settle before opening print window
                setTimeout(() => handlePrint(), 100);
            }
        } catch (err) {
            console.error('Save failed:', err);
            alert('❌ Failed to save bill: ' + err.message);
        }
    };

    const handleCancel = () => {
        setRows([{ sno: 1, code: '', itemName: '', qty: '', rate: '', amount: '', total: '' }]);
        setReceivedAmt(''); setDiscount('0'); setTransportCharges('0');
        setCustomerName(''); setCustomerPhone(''); setCustomerAddress(''); setBillRef(''); setRemarks('');
        setSelectedProduct(null);
        setPickedCustomerId(null);
        setShowCustSuggest(false); setShowNameSuggest(false);
        setPayCash(''); setPayUpi(''); setPayCard(''); setPayCredit('');
        setShowCheckout(false);
        // Reset bill-level toggles so each new bill starts fresh
        setHeader(false);          // Home Delivery
        setIgst(false);            // GST No
        setNonAcc(false);          // Other State
        setCustomerGstin(''); setPlaceOfSupply(''); setReverseCharge(false);
        setMode('CASH');           // Default payment mode
        setCustomerLastRates({});  // Customer-specific last rates
        setDate(new Date().toLocaleDateString('en-GB'));
        // Focus first ItemName input for next bill entry
        setTimeout(() => { itemNameInputsRef.current[0]?.focus(); }, 100);
    };

    // Open the GST-compliant invoice preview (Preview → Open PDF → Save PDF → Print).
    // The invoice is rendered ENTIRELY from the persisted backend sale + active
    // PosCompany — see InvoicePreviewModal / invoice-data / invoice-pdf. The POS
    // screen no longer builds the invoice HTML (which used a flat 18% + hardcoded
    // seller); it only points the modal at the saved bill.
    const handlePrint = () => {
        if (!lastOrder) return alert('No bill to print. Save a bill first (F1).');
        setInvoiceTarget({ saleId: lastOrder.dbId || null, billNo: lastOrder.billNo });
        setInvoiceModalOpen(true);
    };

    const handlePdf = () => handlePrint();

    // ── HOLD / PARKED BILLS ──
    const handleHold = () => {
        const validRows = rows.filter(r => r.itemName && parseFloat(r.qty) > 0);
        if (validRows.length === 0) { alert('Cart is empty. Nothing to hold.'); return; }
        const parked = {
            id: 'PARK-' + Date.now(),
            billNo, date, mode, book, billRef,
            customerName: customerName || 'Walk-in', customerPhone, customerAddress,
            rows: [...rows], discount, transportCharges, receivedAmt,
            total: grandTotal, itemCount: validRows.length,
            parkedAt: new Date().toISOString(),
        };
        setParkedBills(prev => [parked, ...prev]);
        handleCancel();
        setBillNo(String(Math.floor(Math.random() * 900 + 100)));
        alert(`Bill held successfully. Press F8 or click Parked to resume.`);
    };

    const handleResumeParked = (p) => {
        if (rows.some(r => r.itemName)) {
            if (!confirm('Current cart has items. Hold current bill and resume this one?')) return;
            handleHold();
        }
        setRows(p.rows);
        setCustomerName(p.customerName === 'Walk-in' ? '' : p.customerName);
        setCustomerPhone(p.customerPhone); setCustomerAddress(p.customerAddress);
        setBillNo(p.billNo); setDate(p.date); setMode(p.mode); setBook(p.book); setBillRef(p.billRef);
        setDiscount(p.discount); setTransportCharges(p.transportCharges); setReceivedAmt(p.receivedAmt);
        setParkedBills(prev => prev.filter(b => b.id !== p.id));
        setShowParkedModal(false);
    };

    const handleDeleteParked = (id) => {
        if (!confirm('Delete this parked bill permanently?')) return;
        setParkedBills(prev => prev.filter(b => b.id !== id));
    };

    // ── KEYBOARD: Arrows + Enter driven workflow ──
    useEffect(() => {
        const handler = (e) => {
            // F-key shortcuts (work even when inputs are focused)
            if (e.key === 'F1') { e.preventDefault(); handleSave(); return; }
            if (e.key === 'F2') { e.preventDefault(); handlePrint(); return; }
            if (e.key === 'F3') { e.preventDefault(); document.getElementById('disc-input')?.focus(); return; }
            if (e.key === 'F4') { e.preventDefault(); document.getElementById('disc-input')?.focus(); return; }
            if (e.key === 'F6') { e.preventDefault(); setCustomerEnabled(true); setTimeout(()=>document.getElementById('cust-input')?.focus(),30); return; }
            if (e.key === 'F7') { e.preventDefault(); handleHold(); return; }
            if (e.key === 'F8') { e.preventDefault(); setShowParkedModal(true); setParkedSelIdx(0); return; }
            if (e.key === 'F9') { e.preventDefault(); if (!showCheckout) openCheckout(); return; }
            if (e.key === 'F10') { e.preventDefault(); openCheckout(); return; }
            if (e.key === 'F11') { e.preventDefault(); document.getElementById('phone-input')?.focus(); return; }
            if (e.key === 'F12') { e.preventDefault(); openLastBills(); return; }

            // Alt-key shortcuts for fast Customer / Mobile field jumps
            if (e.altKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                document.getElementById('cust-input')?.focus();
                document.getElementById('cust-input')?.select?.();
                return;
            }
            if (e.altKey && (e.key === 'm' || e.key === 'M')) {
                e.preventDefault();
                document.getElementById('phone-input')?.focus();
                document.getElementById('phone-input')?.select?.();
                return;
            }
            if (e.altKey && (e.key === 'i' || e.key === 'I')) {
                e.preventDefault();
                itemNameInputsRef.current[0]?.focus();
                return;
            }

            // ── Checkout modal: Esc to close, Enter to confirm ──
            if (showCheckout) {
                if (e.key === 'Escape') { e.preventDefault(); setShowCheckout(false); return; }
                if (e.key === 'Enter' && (e.target.tagName !== 'INPUT' || e.target.type === 'number')) {
                    e.preventDefault(); confirmCheckout(); return;
                }
                return;
            }

            // ── Last Bills modal: Esc to close ──
            if (showLastBills) {
                if (e.key === 'Escape') { e.preventDefault(); setShowLastBills(false); return; }
                return;
            }

            // ── Parked Bills modal navigation: Arrows + Enter ──
            if (showParkedModal) {
                if (e.key === 'Escape') { e.preventDefault(); setShowParkedModal(false); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setParkedSelIdx(p => Math.min(p+1, parkedBills.length-1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setParkedSelIdx(p => Math.max(p-1, 0)); return; }
                if (e.key === 'Enter') { e.preventDefault(); if (parkedBills[parkedSelIdx]) handleResumeParked(parkedBills[parkedSelIdx]); return; }
                if (e.key === 'Delete') { e.preventDefault(); if (parkedBills[parkedSelIdx]) handleDeleteParked(parkedBills[parkedSelIdx].id); return; }
                return;
            }

            // ── Product Search popup navigation: Arrows + Enter ──
            if (showSearch) {
                if (e.key === 'Escape') { e.preventDefault(); setShowSearch(false); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setSearchSelIdx(p => Math.min(p+1, filteredSearchItems.length-1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSearchSelIdx(p => Math.max(p-1, 0)); return; }
                if (e.key === 'Enter') { e.preventDefault(); pickItem(filteredSearchItems[searchSelIdx]); return; }
                return;
            }

            // ── Unit dropdown navigation (size variants — kg list inside Unit cell) ──
            if (unitDropdownRow >= 0) {
                const row = rows[unitDropdownRow];
                const variants = row ? getRowVariants(row) : [];
                if (variants.length > 0) {
                    if (e.key === 'Escape') { e.preventDefault(); setUnitDropdownRow(-1); return; }
                    if (e.key === 'ArrowDown') { e.preventDefault(); setUnitDropdownSelIdx(p => Math.min(p+1, variants.length-1)); return; }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setUnitDropdownSelIdx(p => Math.max(p-1, 0)); return; }
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        applyVariantToRow(unitDropdownRow, variants[unitDropdownSelIdx]);
                        return;
                    }
                    const n = parseInt(e.key, 10);
                    if (!isNaN(n) && n >= 1 && n <= variants.length) {
                        e.preventDefault();
                        applyVariantToRow(unitDropdownRow, variants[n - 1]);
                        return;
                    }
                }
            }

            // ── Inline row suggestions navigation (item name / code dropdown) ──
            if (suggestRow >= 0 && activeSuggestions.length > 0) {
                if (e.key === 'Escape') { e.preventDefault(); setSuggestRow(-1); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestSelIdx(p => Math.min(p+1, activeSuggestions.length-1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestSelIdx(p => Math.max(p-1, 0)); return; }
                if (e.key === 'Enter') { e.preventDefault(); pickItem(activeSuggestions[suggestSelIdx]); setSuggestRow(-1); return; }
            }

            // ── Customer phone dropdown navigation (Cell No field) ──
            if (showCustSuggest && customerSuggestions.length > 0 && document.activeElement?.id === 'phone-input') {
                if (e.key === 'Escape') { e.preventDefault(); setShowCustSuggest(false); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setCustSuggestSelIdx(p => Math.min(p+1, customerSuggestions.length-1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setCustSuggestSelIdx(p => Math.max(p-1, 0)); return; }
                if (e.key === 'Enter') { e.preventDefault(); pickCustomer(customerSuggestions[custSuggestSelIdx]); return; }
            }

            // ── Customer name dropdown navigation ──
            if (showNameSuggest && nameSuggestions.length > 0 && document.activeElement?.id === 'cust-input') {
                if (e.key === 'Escape') { e.preventDefault(); setShowNameSuggest(false); return; }
                if (e.key === 'ArrowDown') { e.preventDefault(); setNameSuggestSelIdx(p => Math.min(p+1, nameSuggestions.length-1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setNameSuggestSelIdx(p => Math.max(p-1, 0)); return; }
                if (e.key === 'Enter') { e.preventDefault(); pickCustomer(nameSuggestions[nameSuggestSelIdx]); return; }
            }

            // ── Cart row navigation: Arrows for row, Enter to advance to next ──
            const tag = (e.target.tagName || '').toUpperCase();
            const inInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

            // Cell-to-cell navigation inside cart rows using Enter / ↑ / ↓
            const el = e.target;
            const rowAttr = el?.dataset?.row;
            const cellAttr = el?.dataset?.cell;
            if (rowAttr !== undefined && cellAttr !== undefined) {
                const curRow = parseInt(rowAttr, 10);
                const cellOrder = ['code', 'itemName', 'qty', 'rate'];
                const cellIdx = cellOrder.indexOf(cellAttr);
                const focusCell = (rIdx, cell) => {
                    const target = document.querySelector(`input[data-row="${rIdx}"][data-cell="${cell}"]`);
                    target?.focus(); target?.select?.();
                };
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (cellIdx < cellOrder.length - 1) {
                        // Move to next cell in same row
                        focusCell(curRow, cellOrder[cellIdx + 1]);
                    } else {
                        // Last cell → jump to next row's first editable cell (itemName)
                        focusCell(curRow + 1, 'itemName');
                    }
                    return;
                }
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    focusCell(curRow + 1, cellAttr);
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    focusCell(Math.max(0, curRow - 1), cellAttr);
                    return;
                }
                // Smart ArrowLeft / ArrowRight — only jump to adjacent cell when cursor is at edge
                if (e.key === 'ArrowLeft') {
                    const isNumeric = el.type === 'number';
                    const atStart = isNumeric || (el.selectionStart === 0 && el.selectionEnd === 0);
                    if (atStart && cellIdx > 0) {
                        e.preventDefault();
                        focusCell(curRow, cellOrder[cellIdx - 1]);
                        return;
                    }
                }
                if (e.key === 'ArrowRight') {
                    const isNumeric = el.type === 'number';
                    const valLen = (el.value || '').length;
                    const atEnd = isNumeric || (el.selectionStart === valLen && el.selectionEnd === valLen);
                    if (atEnd && cellIdx < cellOrder.length - 1) {
                        e.preventDefault();
                        focusCell(curRow, cellOrder[cellIdx + 1]);
                        return;
                    }
                }
            }

            // ── Global ESC: if there's an in-progress bill (any field filled), confirm cancel ──
            if (e.key === 'Escape') {
                const hasItems = rows.some(r => r.itemName);
                const hasCustomer = customerName.trim() || customerPhone.trim() || customerAddress.trim();
                if (hasItems || hasCustomer) {
                    e.preventDefault();
                    if (window.confirm('Do you want to cancel this bill?\n\n• OK = clear and start fresh\n• Cancel = keep working on it')) {
                        handleCancel();
                    }
                    return;
                }
            }

            // Arrow keys only navigate cart when NOT inside an input (except when at end of input or using Ctrl)
            if (!inInput || e.ctrlKey) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setFocusedRow(p => Math.min(p+1, rows.length-1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setFocusedRow(p => Math.max(p-1, 0)); return; }
                if (e.key === 'Delete' && focusedRow >= 0) { e.preventDefault(); removeRow(focusedRow); return; }
                // Block default browser scroll for these keys when focus is outside an input
                if (['ArrowLeft','ArrowRight',' ','Spacebar','PageUp','PageDown','Home','End'].includes(e.key)) {
                    e.preventDefault();
                    return;
                }
                // Enter outside input — prevent any accidental form submit/scroll
                if (e.key === 'Enter') {
                    e.preventDefault();
                    return;
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showSearch, searchSelIdx, filteredSearchItems, rows, showParkedModal, parkedSelIdx, parkedBills, focusedRow, suggestRow, suggestField, suggestSelIdx, activeSuggestions, showCustSuggest, customerSuggestions, custSuggestSelIdx, showNameSuggest, nameSuggestions, nameSuggestSelIdx, unitDropdownRow, unitDropdownSelIdx, pharmaItems, showCheckout, payCash, payUpi, payCard, payCredit, mode, grandTotal, showLastBills, customerName, customerPhone, customerAddress]);

    const removeRow = (idx) => {
        setRows(prev => {
            const newRows = prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sno: i + 1 }));
            return newRows.length > 0 ? newRows : [{ sno: 1, code: '', itemName: '', qty: '', rate: '', amount: '', total: '' }];
        });
    };

    // Auto-scroll: keep the highlighted suggestion centered in the dropdown.
    // Down arrow → list moves UP, the next product slides into the highlight position
    // Up arrow → list moves DOWN, the previous product slides into the highlight position
    useEffect(() => {
        if (suggestRow < 0 || activeSuggestions.length === 0) return;
        const el = document.querySelector(`[data-suggest-idx="${suggestSelIdx}"]`);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [suggestSelIdx, suggestRow]);

    // Customer lookup by phone (3+ digits) — fetch from Vendure customers
    useEffect(() => {
        const phone = customerPhone.trim();
        if (phone.length < 3) { setCustomerSuggestions([]); setShowCustSuggest(false); return; }
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const query = `query FindCustomers($term: String!) {
                    customers(options: { filter: { phoneNumber: { contains: $term } }, take: 8 }) {
                        items { id firstName lastName phoneNumber emailAddress addresses { streetLine1 city postalCode } }
                    }
                }`;
                const data = await gql(query, { useAdmin: true, variables: { term: phone } });
                if (cancelled) return;
                const items = data?.customers?.items || [];
                setCustomerSuggestions(items);
                setCustSuggestSelIdx(0);
                setShowCustSuggest(items.length > 0);
            } catch (err) { console.warn('Customer lookup failed:', err.message); }
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [customerPhone]);

    // Customer lookup by name — empty (show recent 10) OR 1+ chars (filter)
    useEffect(() => {
        const name = customerName.trim();
        if (name.toUpperCase() === 'COUNTER SALES') {
            setNameSuggestions([]); setShowNameSuggest(false); return;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                let query, vars;
                if (name.length === 0) {
                    // Show most recent customers (no filter)
                    query = `query AllCustomers {
                        customers(options: { take: 10, sort: { createdAt: DESC } }) {
                            items { id firstName lastName phoneNumber emailAddress addresses { streetLine1 city postalCode } }
                        }
                    }`;
                    vars = {};
                } else {
                    query = `query FindCustByName($term: String!) {
                        customers(options: {
                            filter: { firstName: { contains: $term }, lastName: { contains: $term } },
                            filterOperator: OR,
                            take: 10
                        }) {
                            items { id firstName lastName phoneNumber emailAddress addresses { streetLine1 city postalCode } }
                        }
                    }`;
                    vars = { term: name };
                }
                const data = await gql(query, { useAdmin: true, variables: vars });
                if (cancelled) return;
                const items = data?.customers?.items || [];
                setNameSuggestions(items);
                setNameSuggestSelIdx(0);
                // Only show dropdown automatically when user is typing (1+ char).
                // For empty field, we'll trigger show via onFocus instead.
                if (name.length > 0) setShowNameSuggest(items.length > 0);
            } catch (err) { console.warn('Customer name lookup failed:', err.message); }
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [customerName]);

    const pickCustomer = (c) => {
        setCustomerName(`${c.firstName || ''} ${c.lastName || ''}`.trim());
        setCustomerPhone(c.phoneNumber || '');
        const addr = c.addresses?.[0];
        if (addr) setCustomerAddress([addr.streetLine1, addr.city, addr.postalCode].filter(Boolean).join(', '));
        setPickedCustomerId(c.id || null);
        setShowCustSuggest(false);
        setShowNameSuggest(false);
    };

    // Load this customer's previous purchase rates (per item) from recent bills.
    // Keyed by item code → { rate, billNo, billDate } showing the most recent rate paid.
    useEffect(() => {
        const phone = (customerPhone || '').trim();
        if (!phone || phone.replace(/\D/g, '').length < 4) {
            setCustomerLastRates({});
            return;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const list = await new ListSalesQuery().execute();
                if (cancelled) return;
                const mine = (list || [])
                    .filter(s => (s.customerPhone || '').trim() === phone)
                    .sort((a, b) => (b.billDate + b.billTime).localeCompare(a.billDate + a.billTime));
                const rates = {};
                for (const sale of mine) {
                    let items = [];
                    try { items = JSON.parse(sale.itemsJson || '[]'); } catch {}
                    for (const it of items) {
                        const code = String(it.code || it.itemCode || '');
                        if (!code || rates[code]) continue; // keep first (most recent)
                        const rate = parseFloat(it.rate);
                        if (!isNaN(rate) && rate > 0) {
                            rates[code] = { rate, billNo: sale.billNo, billDate: sale.billDate };
                        }
                    }
                }
                setCustomerLastRates(rates);
            } catch (err) { console.warn('Last rates lookup failed:', err.message); }
        }, 400);
        return () => { cancelled = true; clearTimeout(t); };
    }, [customerPhone]);

    // Load Last Bills modal data: combine pos_reports (legacy) + DB sales for completeness
    const openLastBills = async () => {
        try {
            const dbSales = await new ListSalesQuery().execute().catch(() => []);
            const local = JSON.parse(localStorage.getItem('pos_reports') || '[]');
            // Merge by billNo: prefer DB record over local
            const map = new Map();
            for (const l of local) {
                if (l.billNo) map.set(String(l.billNo), {
                    source: 'local',
                    billNo: l.billNo,
                    billDate: l.date || '',
                    billTime: '',
                    customerName: l.customer?.name || '-',
                    customerPhone: l.customer?.phone || '',
                    saleType: l.saleType || l.mode || '',
                    grandTotal: l.grandTotal || 0,
                    payload: l,
                });
            }
            for (const s of (dbSales || [])) {
                map.set(String(s.billNo), {
                    source: 'db',
                    billNo: s.billNo,
                    billDate: s.billDate,
                    billTime: s.billTime,
                    customerName: s.customerName,
                    customerPhone: s.customerPhone,
                    saleType: s.saleType,
                    grandTotal: s.grandTotal,
                    raw: s,
                });
            }
            const arr = [...map.values()].sort((a, b) =>
                (b.billDate + ' ' + (b.billTime || '')).localeCompare(a.billDate + ' ' + (a.billTime || ''))
            );
            setLastBills(arr.slice(0, 200));
            setLastBillsFilter('');
            setShowLastBills(true);
            setTimeout(() => lastBillsSearchRef.current?.focus(), 50);
        } catch (err) {
            alert('Failed to load bills: ' + err.message);
        }
    };

    // Load a bill into the sales screen for editing (does NOT print).
    const loadBillForEdit = (b) => {
        if (rows.some(r => r.itemName)) {
            if (!confirm('Current cart has items. Hold current bill and load selected bill for edit?')) return;
            handleHold();
        }
        const r = b.raw;
        const l = b.payload;
        let items = [];
        if (r) {
            try { items = JSON.parse(r.itemsJson || '[]'); } catch {}
        } else if (l) {
            items = l.items || [];
        }
        // Build cart rows from items
        const newRows = items.map((it, i) => {
            const qty = parseFloat(it.qty) || 0;
            const rate = parseFloat(it.rate || it.price) || 0;
            return {
                sno: i + 1,
                code: String(it.code || it.id || it.barcode || ''),
                itemName: it.name || it.itemName || '',
                unit: it.unit || '1 Pc',
                qty: String(qty),
                rate: String(rate),
                amount: (qty * rate).toFixed(2),
                total: (qty * rate).toFixed(2),
            };
        });
        // Trailing empty row for continuous entry
        newRows.push({ sno: newRows.length + 1, code: '', itemName: '', qty: '', rate: '', amount: '', total: '' });
        setRows(newRows);
        setBillNo(String(r?.billNo || l?.billNo || ''));
        setCustomerName(r?.customerName || l?.customer?.name || '');
        setCustomerPhone(r?.customerPhone || l?.customer?.phone || '');
        setCustomerAddress(r?.customerAddress || l?.customer?.address || '');
        setSalesMan(r?.salesMan || l?.salesMan || '');
        setMode((r?.saleType || l?.saleType || 'CASH').toUpperCase());
        setDiscount(String(r?.discount ?? l?.discount ?? 0));
        setTransportCharges(String(r?.transportCharges ?? l?.transport ?? 0));
        const remarksText = r?.remarks || '';
        setHeader(remarksText.includes('[HOME DELIVERY]'));
        setRemarks(remarksText.replace(/^\[HOME DELIVERY\]\s*/, ''));
        setShowLastBills(false);
        setTimeout(() => { itemNameInputsRef.current[0]?.focus(); }, 100);
    };

    // Permanently delete a bill from DB + local history. Does not affect other bills.
    const deleteBill = async (b) => {
        const ok = window.confirm(
            `Delete bill ${b.billNo}?\n\n` +
            `Customer: ${b.customerName || 'Walk-in'}\n` +
            `Total: ₹${(b.grandTotal || 0).toFixed(2)}\n\n` +
            `This cannot be undone. Other bill numbers will NOT change.\n` +
            `OK = Delete · Cancel = Keep`
        );
        if (!ok) return;
        try {
            // Delete from DB if we have its DB id
            const dbId = b.raw?.id || b.payload?.dbId;
            if (dbId) {
                try { await new DeleteSaleCommand().execute(dbId); }
                catch (e) { console.warn('DB delete failed:', e.message); }
            }
            // Always remove from local pos_reports as well
            try {
                const reports = JSON.parse(localStorage.getItem('pos_reports') || '[]');
                const filtered = reports.filter(r => String(r.billNo) !== String(b.billNo));
                localStorage.setItem('pos_reports', JSON.stringify(filtered));
            } catch {}
            // Refresh the modal list
            await openLastBills();
        } catch (err) {
            alert('Failed to delete bill: ' + err.message);
        }
    };

    const reprintBill = (b) => {
        // Use legacy payload if available, else build minimal one from DB row
        let payload = b.payload;
        if (!payload && b.raw) {
            const r = b.raw;
            let items = [];
            try { items = JSON.parse(r.itemsJson || '[]'); } catch {}
            payload = {
                billNo: r.billNo, date: r.billDate,
                customer: { name: r.customerName, phone: r.customerPhone, address: r.customerAddress },
                salesMan: r.salesMan, saleType: r.saleType,
                items: items.map(it => ({ name: it.name || it.itemName, qty: it.qty, price: it.rate, total: (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0) })),
                subtotal: r.subtotal, taxAmount: r.taxAmount, discount: r.discount, transport: r.transportCharges,
                grandTotal: r.grandTotal, receivedAmount: r.receivedAmount, balance: r.balanceDue,
                cashAmount: r.cashAmount, upiAmount: r.upiAmount, cardAmount: r.cardAmount,
                homeDelivery: (r.remarks || '').includes('[HOME DELIVERY]'),
            };
        }
        if (!payload) return alert('Could not reconstruct bill for reprint.');
        setLastOrder(payload);
        setShowLastBills(false);
        setTimeout(() => handlePrint(), 50);
    };

    // Find or create a Vendure customer for this bill (so next time mobile/name search works)
    const ensureCustomer = async () => {
        const name = customerName.trim();
        const phone = customerPhone.trim();
        if (!name || !phone || name.toUpperCase() === 'WALK-IN' || name.toUpperCase() === 'COUNTER SALES') return;
        if (pickedCustomerId) return; // already linked to existing customer
        try {
            // 1) Phone exact-match lookup — avoid duplicates
            const findQ = `query FindByPhone($p: String!) {
                customers(options: { filter: { phoneNumber: { eq: $p } }, take: 1 }) {
                    items { id }
                }
            }`;
            const found = await gql(findQ, { useAdmin: true, variables: { p: phone } });
            if (found?.customers?.items?.length) { setPickedCustomerId(found.customers.items[0].id); return; }

            // 2) Create new customer
            const [firstName, ...rest] = name.split(/\s+/);
            const lastName = rest.join(' ') || '-';
            const email = `pos+${phone.replace(/\D/g,'')}@avs.local`;
            const createQ = `mutation CreateCust($input: CreateCustomerInput!) {
                createCustomer(input: $input) {
                    ... on Customer { id }
                    ... on ErrorResult { errorCode message }
                }
            }`;
            const created = await gql(createQ, { useAdmin: true, variables: { input: {
                firstName: firstName || name,
                lastName,
                phoneNumber: phone,
                emailAddress: email,
            } } });
            if (created?.createCustomer?.id) setPickedCustomerId(created.createCustomer.id);
        } catch (err) { console.warn('ensureCustomer failed:', err.message); }
    };

    const inp = "bg-white border border-slate-300 h-[24px] px-2 text-[11px] font-bold text-slate-900 outline-none rounded-sm focus:bg-yellow-50 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-300 transition";
    const lbl = "text-[10px] font-bold text-slate-600 uppercase tracking-wider";

    return (<div className="relative w-full h-full flex flex-col overflow-hidden font-sans text-[11px] select-none bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100">
        {/* Hide number input spinners */}
        <style>{`
            .no-spin::-webkit-outer-spin-button,
            .no-spin::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
            .no-spin { -moz-appearance: textfield; }
        `}</style>

        {/* Shared unit suggestions for cart Unit cell */}
        <datalist id="unit-options">
            {COMMON_UNITS.map(u => <option key={u} value={u}/>)}
        </datalist>

        {/* ── Title bar ── modern dark gradient with branding */}
        <div className="h-9 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 flex items-center px-4 justify-between shrink-0 shadow-sm border-b border-slate-700">
            <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                    <span className="text-white font-black text-[12px]">A</span>
                </div>
                <div>
                    <div className="text-white font-black text-[12px] tracking-wide leading-none">Retail Sales</div>
                    <div className="text-slate-400 text-[9px] font-medium leading-none mt-0.5">பேர் டிபார்ட்மென்டல் ஸ்டோர் · 2026-2027 · admin</div>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => {
                        // Find the row to delete: focused row first, else last filled row
                        let idx = focusedRow;
                        if (idx < 0 || !rows[idx]?.itemName) {
                            // No focus → use last filled row
                            for (let j = rows.length - 1; j >= 0; j--) {
                                if (rows[j].itemName) { idx = j; break; }
                            }
                        }
                        if (idx < 0 || !rows[idx]?.itemName) {
                            alert('No item to delete. Click on a row first or add an item.');
                            return;
                        }
                        if (confirm(`Delete "${rows[idx].itemName}" from the bill?`)) {
                            removeRow(idx);
                            setFocusedRow(-1);
                        }
                    }}
                    title="Delete the selected row (click a row first, or press Delete key)"
                    className="px-3 py-1 rounded-md bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider transition shadow-sm">🗑 Delete Row</button>
                <button onClick={openLastBills} className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider transition">🧾 Last Bills (F12)</button>
                <button onClick={()=>setShowParkedModal(true)} className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider transition">🅿 Parked ({parkedBills.length})</button>
            </div>
        </div>

        {/* ── Sales1/2/3/4 tabs ── modern pill-style */}
        <div className="shrink-0 flex bg-slate-100 px-3 pt-2 pb-0 gap-1 border-b border-slate-200">
            {['Sales1'].map(t => (
                <button key={t} onClick={()=>setActiveSalesTab(t)}
                    className={`px-4 py-1 text-[11px] font-bold rounded-t-md transition ${activeSalesTab===t ? 'bg-white text-slate-900 shadow-sm border border-slate-200 border-b-white -mb-px' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>{t}</button>
            ))}
        </div>

        {/* ── Header form — modern light card with subtle tint ── */}
        <div className="shrink-0 bg-gradient-to-b from-white to-blue-50/40 border-b border-slate-200 shadow-sm">
            {/* Row A: Book | Type | Bill No | Date | Customer | Last BillNo */}
            <div className="flex items-center px-3 py-1.5 gap-2 border-b border-slate-200/60">
                <label className={`${lbl} w-10 text-slate-900`}>Book</label>
                <select value={counterName} onChange={e=>setCounterName(e.target.value)} className={`${inp} w-28 font-black`}>
                    <option>COUNTER A</option><option>COUNTER B</option><option>COUNTER C</option>
                </select>
                <label className={`${lbl} ml-3`}>Type</label>
                <select value={mode} onChange={e=>setMode(e.target.value)} className={`${inp} w-20 font-bold`}>
                    <option value="CASH">Cash</option>
                    <option value="CREDIT">Credit</option>
                    <option value="CARD">Card</option>
                    <option value="UPI">UPI</option>
                </select>
                <label className={`${lbl} ml-3 text-slate-900`}>Bill No</label>
                <input type="text" value={billNo} onChange={e=>setBillNo(e.target.value)} className={`${inp} w-16 text-right font-bold`}/>
                <label className={`${lbl} ml-3`}>Date</label>
                <input type="text" value={date} onChange={e=>setDate(e.target.value)} className={`${inp} w-24 text-center font-bold`}/>
                <label className={`${lbl} ml-4 text-slate-900`}>Customer <span className="text-[9px] text-blue-700 font-black">(Alt+C)</span>{mode === 'CREDIT' && <span className="text-red-600 font-black ml-1">*</span>}</label>
                <div className="relative flex-1">
                    <input id="cust-input" type="text" value={customerName}
                        onChange={e=>{ setCustomerName(e.target.value); setPickedCustomerId(null); }}
                        onBlur={()=>setTimeout(()=>setShowNameSuggest(false), 200)}
                        onFocus={async ()=>{
                            // Always show suggestions on focus. If list is empty, fetch recent 10 first.
                            if (nameSuggestions.length === 0) {
                                try {
                                    const query = `query AllCustomers { customers(options: { take: 10, sort: { createdAt: DESC } }) { items { id firstName lastName phoneNumber emailAddress addresses { streetLine1 city postalCode } } } }`;
                                    const data = await gql(query, { useAdmin: true });
                                    setNameSuggestions(data?.customers?.items || []);
                                } catch {}
                            }
                            setNameSuggestSelIdx(0);
                            setShowNameSuggest(true);
                        }}
                        placeholder="Click to see customers · Type to search" className={`${inp} w-full font-bold`}/>
                    {showNameSuggest && nameSuggestions.length > 0 && (
                        <div className="absolute top-[22px] left-0 bg-white border border-[#1a5276] shadow-2xl z-40 w-72 max-h-56 overflow-auto">
                            {nameSuggestions.map((c, idx) => (
                                <div key={c.id} onMouseDown={(e)=>{ e.preventDefault(); pickCustomer(c); }}
                                    className={`px-2 py-1 border-b border-slate-200 cursor-pointer text-[11px] font-bold ${nameSuggestSelIdx === idx ? 'bg-yellow-200' : 'hover:bg-blue-100'}`}>
                                    <div className="text-slate-900">{c.firstName} {c.lastName}</div>
                                    <div className="text-emerald-700">{c.phoneNumber}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="ml-2 w-3 h-3 rounded-full border border-slate-500 bg-white"/>
                <label className="text-red-600 font-bold text-[11px] ml-3">Last BillNo</label>
                <input type="text" value={lastBillNo} readOnly className={`${inp} w-10 text-center bg-[#f5f5f5] font-bold`}/>
            </div>

            {/* Row B: Rate Type | GSTNo | OtherState | Home Delivery | -11.510 | Cell No */}
            <div className="flex items-center px-3 py-1.5 gap-2 border-b border-slate-200/60">
                <label className={`${lbl} w-16`}>Rate Type -</label>
                <select value={rateType} onChange={e=>setRateType(e.target.value)} className={`${inp} w-28 font-bold`}>
                    <option>wholsale</option><option>retail</option><option>ARate</option><option>BRate</option><option>CRate</option><option>DRate</option>
                </select>
                <label className="flex items-center gap-1.5 ml-2 cursor-pointer"><input type="checkbox" checked={igst} onChange={e=>setIgst(e.target.checked)} className="accent-emerald-600 w-3.5 h-3.5"/><span className={`${lbl} text-slate-800`}>GST No</span></label>
                <label className="flex items-center gap-1.5 ml-2 cursor-pointer"><input type="checkbox" checked={nonAcc} onChange={e=>setNonAcc(e.target.checked)} className="accent-emerald-600 w-3.5 h-3.5"/><span className={lbl}>Other State</span></label>
                <label className={`flex items-center gap-1.5 ml-2 cursor-pointer px-2 py-0.5 rounded-md transition ${header ? 'bg-amber-100 border border-amber-300' : 'border border-transparent hover:bg-slate-50'}`}><input type="checkbox" checked={header} onChange={e=>setHeader(e.target.checked)} className="accent-amber-600 w-3.5 h-3.5"/><span className={`text-[10px] font-black uppercase tracking-wider ${header ? 'text-amber-800' : 'text-slate-600'}`}>🚚 Home Delivery</span></label>
                <span className="ml-2 text-red-600 font-bold text-[12px]">-11.510</span>
                <label className={`${lbl} ml-6`}>Cell No <span className="text-[9px] text-blue-700 font-black">(Alt+M)</span>{mode === 'CREDIT' && <span className="text-red-600 font-black ml-1">*</span>}</label>
                <div className="relative flex-1">
                    <input id="phone-input" type="text" value={customerPhone}
                        onChange={e=>{ setCustomerPhone(e.target.value); setPickedCustomerId(null); }}
                        onBlur={()=>setTimeout(()=>setShowCustSuggest(false), 150)}
                        onFocus={()=>{ if (customerSuggestions.length > 0) setShowCustSuggest(true); }}
                        placeholder="Type 3+ digits to lookup" className={`${inp} w-full font-bold`}/>
                    {showCustSuggest && customerSuggestions.length > 0 && (
                        <div className="absolute top-[22px] left-0 bg-white border border-[#1a5276] shadow-lg z-40 w-72 max-h-56 overflow-auto">
                            {customerSuggestions.map((c, idx) => (
                                <div key={c.id} onMouseDown={(e)=>{ e.preventDefault(); pickCustomer(c); }}
                                    className={`px-2 py-1 border-b border-slate-200 cursor-pointer text-[11px] font-bold ${custSuggestSelIdx === idx ? 'bg-yellow-200' : 'hover:bg-blue-100'}`}>
                                    <div className="text-slate-900">{c.firstName} {c.lastName}</div>
                                    <div className="text-emerald-700">{c.phoneNumber}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Row B2: GST compliance — Customer GSTIN | Place of Supply | Reverse Charge */}
            <div className="flex items-center px-3 py-1.5 gap-2 border-b border-slate-200/60 bg-emerald-50/30">
                <label className={`${lbl} w-16`}>Cust GSTIN</label>
                <input type="text" value={customerGstin} maxLength={15}
                    onChange={e=>setCustomerGstin(e.target.value.toUpperCase())}
                    placeholder="15-char GSTIN (B2B)" className={`${inp} w-44 font-mono tracking-wide`}/>
                <label className={`${lbl} ml-3`}>Place of Supply</label>
                <input type="text" value={placeOfSupply} maxLength={2}
                    onChange={e=>setPlaceOfSupply(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="State code (e.g. 33)" className={`${inp} w-28`} title="2-digit GST state code"/>
                <label className="flex items-center gap-1.5 ml-3 cursor-pointer"><input type="checkbox" checked={reverseCharge} onChange={e=>setReverseCharge(e.target.checked)} className="accent-emerald-600 w-3.5 h-3.5"/><span className={`${lbl} text-slate-800`}>Reverse Charge</span></label>
                {customerGstin.trim() && <span className="ml-2 text-[10px] font-black text-emerald-700 uppercase">B2B</span>}
            </div>

            {/* Address + summary info bar (compact) — soft gradient */}
            <div className="flex items-stretch bg-gradient-to-r from-blue-50 to-emerald-50/40 border-b border-slate-200">
                <label className={`${lbl} px-3 flex items-center border-r border-slate-200 bg-slate-100/80 text-slate-700`}>Address{mode === 'CREDIT' && <span className="text-red-600 font-black ml-1">*</span>}</label>
                <input type="text" value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} placeholder="Customer / delivery address" className="flex-1 h-[22px] px-2 text-[11px] font-bold outline-none border-r border-[#d0d0d0]"/>
                <div className="px-3 h-[22px] flex items-center text-[11px] font-bold border-r border-[#d0d0d0] bg-[#eaf3f8] text-slate-900">No. of Units: <span className="ml-1 font-black">{totalItems.toFixed(2)}</span></div>
                <div className="px-3 h-[22px] flex items-center text-[11px] font-bold bg-[#eaf3f8] text-slate-900">Cost: <span className="ml-1 font-black">₹{subTotal.toFixed(2)}</span></div>
            </div>
        </div>

        {/* ── Main items grid ── modern dark header with subtle row striping */}
        <div className="flex-1 overflow-auto bg-gradient-to-b from-slate-50 to-white relative">
            <table className="w-full text-[11px] border-collapse">
                <thead className="bg-gradient-to-b from-slate-800 to-slate-700 text-white sticky top-0 z-10 shadow-sm">
                    <tr>
                        <th className="border-r border-slate-600 w-10 py-1.5 font-bold uppercase tracking-wider text-[9px]">Sl</th>
                        <th className="border-r border-slate-600 w-20 py-1.5 font-bold uppercase tracking-wider text-[9px]">Code</th>
                        <th className="border-r border-slate-600 py-1.5 font-bold uppercase tracking-wider text-[9px] text-left pl-3">Item Name</th>
                        <th className="border-r border-slate-600 w-20 py-1.5 font-bold uppercase tracking-wider text-[9px]">Unit</th>
                        <th className="border-r border-slate-600 w-20 py-1.5 font-bold uppercase tracking-wider text-[9px]">Qty</th>
                        <th className="border-r border-slate-600 w-20 py-1.5 font-bold uppercase tracking-wider text-[9px]">Rate</th>
                        <th className="border-r border-slate-600 w-20 py-1.5 font-bold uppercase tracking-wider text-[9px]">MRP</th>
                        <th className="border-r border-slate-600 w-20 py-1.5 font-bold uppercase tracking-wider text-[9px] bg-emerald-700">Stock</th>
                        <th className="border-r border-slate-600 w-24 py-1.5 font-bold uppercase tracking-wider text-[9px] bg-amber-600">Amount</th>
                        <th className="w-8 py-1.5 font-bold text-center">✕</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => {
                        const isFocused = selectedProduct && selectedProduct.code === r.code;
                        const isLast = i === rows.length - 1;
                        return (
                        <tr key={i} onClick={() => { if (r.itemName) { setFocusedRow(i); selectRowForStock(r); } }}
                            className={`border-b border-slate-200 cursor-pointer hover:bg-blue-50 transition ${focusedRow === i ? 'ring-2 ring-inset ring-emerald-400' : ''}`}
                            style={{background: focusedRow === i ? '#d1fae5' : isFocused ? '#fef9c3' : (i % 2 === 0 ? 'white' : '#fafbfc')}}>
                            <td className="text-center border-r border-[#e0e0e0] font-bold py-0.5">
                                {isLast ? <span className="text-blue-700">▶</span> : r.sno}
                            </td>
                            <td className="p-0 border-r border-[#e0e0e0] relative">
                                <input data-row={i} data-cell="code" type="text" value={r.code || ''}
                                    onChange={e=>{ updateRow(i,'code',e.target.value); setSuggestRow(i); setSuggestField('code'); setSuggestSelIdx(0); setSearchRowIdx(i); }}
                                    onFocus={()=>{ if (r.code) { setSuggestRow(i); setSuggestField('code'); setSuggestSelIdx(0); setSearchRowIdx(i); selectRowForStock(r); } }}
                                    onBlur={()=>setTimeout(()=>setSuggestRow(p => p===i && suggestField==='code' ? -1 : p), 150)}
                                    className="w-full h-[22px] px-1 text-[11px] font-bold outline-none text-center"/>
                                {suggestRow === i && suggestField === 'code' && activeSuggestions.length > 0 && (
                                    <div className="absolute z-50 left-0 top-[22px] bg-white border border-[#1a5276] shadow-2xl w-[460px] max-h-60 overflow-auto">
                                        {activeSuggestions.map((p, sIdx) => (
                                            <div key={p.code+'-'+sIdx}
                                                data-suggest-idx={sIdx}
                                                onMouseDown={(e)=>{ e.preventDefault(); pickItem(p); setSuggestRow(-1); }}
                                                className={`flex items-center gap-3 px-3 py-1 text-[11px] cursor-pointer border-b border-slate-100 ${suggestSelIdx === sIdx ? 'bg-yellow-200' : 'hover:bg-blue-50'}`}>
                                                <span className="font-black text-slate-500 w-12">{p.code}</span>
                                                <span className="font-black text-slate-900 flex-1 truncate">{p.itemName}</span>
                                                {(() => {
                                                    const last = customerLastRates[String(p.code)];
                                                    return last ? <span className="font-bold text-indigo-700 text-[9px]" title={`Last bill ${last.billNo}, ${last.billDate}`}>Last: ₹{last.rate}</span> : null;
                                                })()}
                                                {(() => { const s = getItemStock(p); return p.isStockBased === true && s != null && s <= 0
                                                    ? <span className="font-black text-red-600 text-[9px] uppercase">⚠ Out of Stock</span>
                                                    : <span className="font-black text-emerald-700 text-right">₹{p.salesRate || p.mrpRate || 0}</span>; })()}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </td>
                            <td className="p-0 border-r border-[#e0e0e0] relative">
                                <input ref={el=>{ itemNameInputsRef.current[i] = el; }} data-row={i} data-cell="itemName"
                                    type="text" value={r.itemName || ''}
                                    onChange={e=>{ updateRow(i,'itemName',e.target.value); setSuggestRow(i); setSuggestField('itemName'); setSuggestSelIdx(0); setSearchRowIdx(i); }}
                                    onFocus={()=>{ if (r.itemName) { setSuggestRow(i); setSuggestField('itemName'); setSuggestSelIdx(0); setSearchRowIdx(i); selectRowForStock(r); } }}
                                    onBlur={()=>setTimeout(()=>setSuggestRow(p => p===i && suggestField==='itemName' ? -1 : p), 150)}
                                    className="w-full h-[22px] px-2 text-[11px] font-bold outline-none focus:bg-[#6ce87a]"
                                    style={{background: isFocused && !isLast ? '#6ce87a' : undefined}}/>
                                {suggestRow === i && suggestField === 'itemName' && activeSuggestions.length > 0 && (
                                    <div id="suggest-dropdown" className="absolute z-50 left-0 top-[22px] bg-white border border-[#1a5276] shadow-2xl w-[460px] max-h-60 overflow-auto">
                                        {activeSuggestions.map((p, sIdx) => (
                                            <div key={p.code+'-'+sIdx}
                                                data-suggest-idx={sIdx}
                                                onMouseDown={(e)=>{ e.preventDefault(); pickItem(p); setSuggestRow(-1); }}
                                                className={`flex items-center gap-3 px-3 py-1 text-[11px] cursor-pointer border-b border-slate-100 ${suggestSelIdx === sIdx ? 'bg-yellow-200' : 'hover:bg-blue-50'}`}>
                                                <span className="font-black text-slate-500 w-12">{p.code}</span>
                                                <span className="font-black text-slate-900 flex-1 truncate">{p.itemName}</span>
                                                {(() => {
                                                    const last = customerLastRates[String(p.code)];
                                                    return last ? <span className="font-bold text-indigo-700 text-[9px]" title={`Last bill ${last.billNo}, ${last.billDate}`}>Last: ₹{last.rate}</span> : null;
                                                })()}
                                                {(() => { const s = getItemStock(p); return p.isStockBased === true && s != null && s <= 0
                                                    ? <span className="font-black text-red-600 text-[9px] uppercase">⚠ Out of Stock</span>
                                                    : <span className="font-black text-emerald-700 text-right">₹{p.salesRate || p.mrpRate || 0}</span>; })()}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </td>
                            <td className="p-0 border-r border-[#e0e0e0] relative">
                                <input type="text" list="unit-options" value={r.unit || ''}
                                    data-row={i} data-cell="unit"
                                    onChange={e=>{ updateRow(i,'unit',e.target.value); setUnitDropdownRow(-1); }}
                                    onFocus={()=>{ const vs = getRowVariants(r); if (vs.length > 0) { setUnitDropdownRow(i); setUnitDropdownSelIdx(0); } }}
                                    onBlur={()=>setTimeout(()=>setUnitDropdownRow(p => p === i ? -1 : p), 150)}
                                    className="w-full h-[16px] px-2 text-[11px] font-bold outline-none focus:bg-yellow-50"/>
                                {unitDropdownRow === i && (() => {
                                    const variants = getRowVariants(r);
                                    if (variants.length === 0) return null;
                                    return (
                                        <div className="absolute z-50 left-0 top-[22px] bg-white border border-[#1a5276] shadow-2xl w-56 max-h-60 overflow-auto">
                                            <div className="bg-[#1a5276] text-white text-[10px] font-black uppercase tracking-widest px-2 py-1">Pick Size</div>
                                            {variants.map((v, idx) => (
                                                <div key={idx}
                                                    onMouseDown={(e)=>{ e.preventDefault(); applyVariantToRow(i, v); }}
                                                    className={`flex items-center justify-between px-2 py-1.5 cursor-pointer border-b border-slate-100 ${unitDropdownSelIdx === idx ? 'bg-yellow-200' : 'hover:bg-blue-50'}`}>
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-5 h-5 rounded bg-[#1a5276] text-white flex items-center justify-center font-black text-[10px]">{idx+1}</span>
                                                        <span className="font-black text-slate-900 text-[12px]">{v.size}</span>
                                                    </div>
                                                    <span className="font-black text-emerald-700 text-[13px]">₹{parseFloat(v.rate).toFixed(2)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </td>
                            <td className="p-0 border-r border-[#e0e0e0]">
                                <input data-row={i} data-cell="qty" type="number" value={r.qty || ''}
                                    onChange={e=>updateRow(i,'qty',e.target.value)}
                                    onFocus={()=>{ if (r.itemName) selectRowForStock(r); }}
                                    className="no-spin w-full h-[22px] pr-2 text-[11px] font-bold outline-none focus:bg-yellow-50 text-right"/>
                            </td>
                            <td className="p-0 border-r border-[#e0e0e0]">
                                <input data-row={i} data-cell="rate" type="number" value={r.rate || ''}
                                    onChange={e=>updateRow(i,'rate',e.target.value)}
                                    onFocus={()=>{ if (r.itemName) selectRowForStock(r); }}
                                    className="no-spin w-full h-[22px] pr-2 text-[11px] font-bold outline-none focus:bg-yellow-50 text-right"/>
                            </td>
                            <td className="border-r border-[#e0e0e0] pr-2 text-right font-bold">{r.mrpRate ? parseFloat(r.mrpRate).toFixed(2) : '0.00'}</td>
                            <td className="border-r border-[#e0e0e0] text-center font-black">
                                {(() => {
                                    if (!r.itemName) return <span className="text-slate-400">—</span>;
                                    const prod = pharmaItems.find(p => p.code === r.code || p.itemName === r.itemName);
                                    if (!prod) return <span className="text-slate-400">—</span>;
                                    const stk = prod.minStkQty != null ? prod.minStkQty : prod.minStock;
                                    if (stk == null) return <span className="text-slate-400">—</span>;
                                    const qtyUsed = parseFloat(r.qty) || 0;
                                    const remaining = stk - qtyUsed;
                                    const cls = remaining <= 0 ? 'text-red-700 bg-red-100' : remaining <= 5 ? 'text-orange-700 bg-orange-100' : 'text-emerald-700 bg-emerald-100';
                                    return <span className={`px-2 py-0.5 rounded ${cls}`}>{remaining}{remaining <= 0 ? ' ⚠' : ''}</span>;
                                })()}
                            </td>
                            <td className="border-r border-[#e0e0e0] pr-2 text-right font-bold">{r.amount || '0.00'}</td>
                            <td className="text-center">
                                {r.itemName ? (
                                    <button onClick={(e) => { e.stopPropagation(); removeRow(i); }}
                                        className="w-6 h-[22px] flex items-center justify-center bg-red-500 hover:bg-red-600 text-white font-black text-[12px]"
                                        title="Delete">✕</button>
                                ) : null}
                            </td>
                        </tr>);
                    })}
                </tbody>
            </table>

        </div>

        {/* ── Selected Product info bar (shows when a row is clicked / item picked) ── */}
        {selectedProduct && (() => {
            const sp = selectedProduct;
            const stockQty = sp.minStkQty != null ? sp.minStkQty : (sp.minStock != null ? sp.minStock : null);
            const maxStock = sp.maxStkQty != null ? sp.maxStkQty : sp.maxStock;
            const lowStock = stockQty != null && stockQty <= 5;
            const lastForCustomer = customerLastRates[String(sp.code)] || null;
            return (
                <div className="shrink-0 flex items-center gap-3 px-3 py-0.5 border-t border-[#888] text-[10px] font-bold" style={{background:'#fef9c3'}}>
                    <span className="px-2 py-0.5 bg-[#1a5276] text-white font-black uppercase tracking-wider text-[10px] rounded">Selected</span>
                    <span className="text-slate-900 font-black">{sp.itemName}</span>
                    <span className="text-slate-700">Code: <span className="font-black text-slate-900">{sp.code}</span></span>
                    {sp.brand && <span className="text-slate-700">Brand: <span className="font-black text-slate-900">{sp.brand}</span></span>}
                    {sp.unit && <span className="text-slate-700">Unit: <span className="font-black text-slate-900">{sp.unit}</span></span>}
                    <span className={`px-2 py-0.5 rounded font-black ${lowStock ? 'bg-red-100 text-red-700 border border-red-300' : 'bg-emerald-100 text-emerald-700 border border-emerald-300'}`}>
                        Stock: {stockQty != null ? stockQty : '—'}{maxStock ? ` / ${maxStock}` : ''}
                        {lowStock && ' ⚠ LOW'}
                    </span>
                    <span className="text-slate-700">Sales: <span className="font-black text-emerald-700">₹{sp.salesRate || 0}</span></span>
                    <span className="text-slate-700">MRP: <span className="font-black text-slate-900">₹{sp.mrpRate || 0}</span></span>
                    {sp.gstPercent != null && <span className="text-slate-700">GST: <span className="font-black text-slate-900">{sp.gstPercent}%</span></span>}
                    {sp.hsnCode && <span className="text-slate-700">HSN: <span className="font-black text-slate-900">{sp.hsnCode}</span></span>}
                    {sp.expiryDate && <span className="text-slate-700">Expiry: <span className="font-black text-slate-900">{new Date(sp.expiryDate).toLocaleDateString('en-IN', {month:'short', year:'numeric'})}</span></span>}
                    {lastForCustomer && (
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-300 font-black" title={`Bill ${lastForCustomer.billNo} on ${lastForCustomer.billDate}`}>
                            Last for this customer: ₹{lastForCustomer.rate} ({lastForCustomer.billDate})
                        </span>
                    )}
                    <button onClick={()=>setSelectedProduct(null)} className="ml-auto text-slate-700 hover:text-red-600 font-black">✕</button>
                </div>
            );
        })()}

        {/* ── Compact bottom: Summary (left) | Total + Checkout (center) | Payment Detail (right) ── */}
        <div className="shrink-0 flex border-t-2 border-slate-300 bg-gradient-to-b from-slate-50 to-slate-100 shadow-inner">
            {/* LEFT: Hotkeys + Summary table below */}
            <div className="w-[320px] border-r border-slate-300 text-[10px] bg-gradient-to-br from-slate-50 to-blue-50/30 flex flex-col">
                {/* Hotkeys */}
                <div className="text-[9px] font-bold m-1">
                    <div className="bg-slate-800 text-white px-2 py-1 text-[9px] uppercase tracking-[2px] font-black rounded-t-md">⌨ Hotkeys</div>
                    <div className="grid grid-cols-3 border border-slate-300 border-t-0 rounded-b-md bg-white">
                        <span className="px-2 py-1 border-r border-b border-slate-200 text-slate-700 hover:bg-slate-50">F1 · <u>S</u>ave</span>
                        <span className="px-2 py-1 border-r border-b border-slate-200 text-slate-700 hover:bg-slate-50">F2 · <u>P</u>rint</span>
                        <span className="px-2 py-1 border-b border-slate-200 text-slate-700 hover:bg-slate-50">F3 · Discount</span>
                        <span className="px-2 py-1 border-r border-b border-slate-200 text-slate-700 hover:bg-slate-50">Alt+<u>C</u> · Customer</span>
                        <span className="px-2 py-1 border-r border-b border-slate-200 text-slate-700 hover:bg-slate-50">Alt+<u>M</u> · Mobile</span>
                        <span className="px-2 py-1 border-b border-slate-200 text-slate-700 hover:bg-slate-50">Alt+<u>I</u> · Item</span>
                        <span className="px-2 py-1 border-r border-b border-slate-200 text-slate-700 hover:bg-slate-50">F6 · New Cust.</span>
                        <span className="px-2 py-1 border-r border-b border-slate-200 text-slate-700 hover:bg-slate-50">F7 · Hold</span>
                        <span className="px-2 py-1 border-b border-slate-200 text-slate-700 hover:bg-slate-50">F8 · Parked</span>
                        <span className="px-2 py-1 border-r border-b border-slate-200 bg-emerald-50 text-emerald-800 font-black">F10 · Checkout</span>
                        <span className="px-2 py-1 border-r border-b border-slate-200 text-slate-700 hover:bg-slate-50">F11 · Cell No</span>
                        <span className="px-2 py-1 border-b border-slate-200 bg-indigo-50 text-indigo-800 font-black">F12 · Last Bills</span>
                        <span className="px-2 py-1 text-slate-600 col-span-3 text-center bg-slate-50">Esc · Close any modal / dropdown</span>
                    </div>
                </div>
                {/* Summary table — moved here from right panel */}
                <table className="w-full border-collapse text-[10px] shrink-0 border-t border-[#888]">
                    <tbody>
                        <tr className="border-b border-[#ccc]">
                            <td className="font-bold px-2 py-0">Total Items</td>
                            <td className="text-right px-2 py-0 border-l border-[#ccc] font-black">{rows.filter(r=>r.itemName).length}</td>
                        </tr>
                        <tr className="border-b border-[#ccc]">
                            <td className="font-bold px-2 py-0">Sub Total</td>
                            <td className="text-right px-2 py-0 border-l border-[#ccc] font-bold">₹{subTotal.toFixed(2)}</td>
                        </tr>
                        <tr className="border-b border-[#ccc]">
                            <td className="font-bold px-2 py-0">Discount</td>
                            <td className="p-0 border-l border-[#ccc]"><input id="disc-input" type="number" value={discount} onChange={e=>setDiscount(e.target.value)} className="no-spin w-full h-[16px] px-2 text-right font-bold outline-none focus:bg-yellow-50"/></td>
                        </tr>
                        <tr className="border-b border-[#ccc]">
                            <td className="font-bold px-2 py-0">GST / Tax</td>
                            <td className="text-right px-2 py-0 border-l border-[#ccc] font-bold">₹{taxAmount.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td className="font-bold px-2 py-0">Remarks</td>
                            <td className="p-0 border-l border-[#ccc]"><input type="text" value={remarks} onChange={e=>setRemarks(e.target.value)} className="w-full h-[16px] px-2 text-[10px] font-bold outline-none focus:bg-yellow-50"/></td>
                        </tr>
                    </tbody>
                </table>
                {/* Bill size selector */}
                <div className="flex items-center px-1 py-0 gap-1 text-[9px] border-t border-[#ccc] mt-auto">
                    <label className="font-black text-slate-900">Bill:</label>
                    <select value={billSize} onChange={e=>setBillSize(e.target.value)} className="flex-1 bg-white border border-[#888] h-[16px] px-1 text-[9px] font-bold outline-none">
                        {Object.entries(BILL_SIZES).map(([k,v]) => <option key={k} value={k}>{v.label} ({v.width})</option>)}
                    </select>
                </div>
            </div>

            {/* CENTER: Total + Checkout button — modern gradient */}
            <div className="flex-1 flex flex-col items-center justify-center py-4 px-4 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 border-l border-r border-slate-200">
                <span className="text-slate-500 font-bold text-[10px] uppercase tracking-[4px] leading-none">Grand Total</span>
                <span className="text-slate-900 font-black text-[36px] leading-none mt-2 tracking-tight">₹{grandTotal.toFixed(2)}</span>
                <button onClick={showCheckout ? confirmCheckout : openCheckout}
                    className={`mt-3 px-8 py-3 ${showCheckout ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600' : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500'} text-white font-black text-[13px] uppercase tracking-widest shadow-lg shadow-emerald-500/30 rounded-lg transition-all active:scale-95`}>
                    {showCheckout ? '✓ CONFIRM & SAVE' : '💰 CHECKOUT (F10)'}
                </button>
                {showCheckout && (
                    <button onClick={()=>setShowCheckout(false)} className="mt-2 text-[10px] text-slate-600 hover:text-red-600 font-bold underline transition">✕ Cancel</button>
                )}
            </div>

            {/* RIGHT: Payment Detail only (Summary moved to LEFT panel) */}
            <div className="w-[340px] border-l border-slate-300 bg-gradient-to-br from-indigo-50/50 to-violet-50/30 flex flex-col">
                {/* Payment Detail — modern indigo gradient header */}
                <div className={`bg-gradient-to-r from-indigo-600 to-violet-600 py-1.5 text-center transition shadow-sm`}>
                    <h3 className="text-white font-black text-[11px] uppercase tracking-[3px]">Payment Detail {!showCheckout && <span className="text-indigo-200 text-[9px] normal-case ml-1 tracking-normal">(Click CHECKOUT to enable)</span>}</h3>
                </div>
                <table className="w-full text-[12px]">
                    <tbody>
                        <tr className="border-b border-slate-300 bg-[#f5f5f5]">
                            <td className="font-black px-2 py-0.5 uppercase tracking-wider text-slate-900 text-[11px]">Bill Amount</td>
                            <td className="text-right px-2 py-0.5 font-black text-[#1a5276] text-[13px]">₹{grandTotal.toFixed(2)}</td>
                        </tr>
                        <tr className="border-b border-slate-200">
                            <td className="font-bold px-2 py-0 text-slate-900 text-[11px]">💵 Cash</td>
                            <td className="p-0 border-l border-slate-200">
                                <input type="number" value={payCash} onChange={e=>setPayCash(e.target.value)} disabled={!showCheckout}
                                    placeholder="0.00" className={`no-spin w-full h-[16px] px-2 text-right font-black text-[13px] outline-none ${showCheckout ? 'focus:bg-yellow-50 bg-white' : 'bg-slate-100 text-slate-400'}`}/>
                            </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                            <td className="font-bold px-2 py-0 text-slate-900 text-[11px]">📱 UPI / GPay</td>
                            <td className="p-0 border-l border-slate-200">
                                <input type="number" value={payUpi} onChange={e=>setPayUpi(e.target.value)} disabled={!showCheckout}
                                    placeholder="0.00" className={`no-spin w-full h-[16px] px-2 text-right font-black text-[13px] outline-none ${showCheckout ? 'focus:bg-yellow-50 bg-white' : 'bg-slate-100 text-slate-400'}`}/>
                            </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                            <td className="font-bold px-2 py-0 text-slate-900 text-[11px]">💳 Card</td>
                            <td className="p-0 border-l border-slate-200">
                                <input type="number" value={payCard} onChange={e=>setPayCard(e.target.value)} disabled={!showCheckout}
                                    placeholder="0.00" className={`no-spin w-full h-[16px] px-2 text-right font-black text-[13px] outline-none ${showCheckout ? 'focus:bg-yellow-50 bg-white' : 'bg-slate-100 text-slate-400'}`}/>
                            </td>
                        </tr>
                        <tr className="border-b border-slate-200">
                            <td className="font-bold px-2 py-0 text-slate-900 text-[11px]">📋 Credit</td>
                            <td className="p-0 border-l border-slate-200">
                                <input type="number" value={payCredit} onChange={e=>setPayCredit(e.target.value)} disabled={!showCheckout}
                                    placeholder="0.00" className={`no-spin w-full h-[16px] px-2 text-right font-black text-[13px] outline-none ${showCheckout ? 'focus:bg-yellow-50 bg-white' : 'bg-slate-100 text-slate-400'}`}/>
                            </td>
                        </tr>
                        <tr className={`${!showCheckout ? 'bg-slate-50' : Math.abs(splitBalance) < 0.01 ? 'bg-emerald-50' : splitBalance > 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
                            <td className="font-black px-2 py-0.5 uppercase tracking-wider text-slate-900 text-[11px]">Balance</td>
                            <td className={`text-right px-2 py-0.5 font-black text-[13px] ${!showCheckout ? 'text-slate-400' : Math.abs(splitBalance) < 0.01 ? 'text-emerald-700' : splitBalance > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                                {showCheckout ? (
                                    <>{splitBalance < 0 ? '+ ' : ''}₹{Math.abs(splitBalance).toFixed(2)}{Math.abs(splitBalance) < 0.01 && ' ✓'}{splitBalance < -0.01 && ' (Change)'}</>
                                ) : <>₹{grandTotal.toFixed(2)}</>}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        {showToast && (<div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white px-6 py-3 rounded-lg shadow-2xl font-bold text-sm z-50 flex items-center gap-4 border-2 border-emerald-400">
            <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-300 animate-pulse"/>
                <span>✅ Bill <span className="text-yellow-300 font-black">#{lastOrder?.billNo}</span> saved to <span className="text-yellow-300 font-black">Database</span></span>
            </div>
            <span className="text-[10px] opacity-90">Grand Total: ₹{lastOrder?.grandTotal.toFixed(2)} | {lastOrder?.saleType}</span>
            <button onClick={handlePrint} className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-[11px] font-black uppercase">🖨 Print (F2)</button>
            <button onClick={()=>setShowToast(false)} className="text-white hover:text-yellow-300">✕</button>
        </div>)}


        {/* ═══ PARKED BILLS MODAL ═══ */}
        {showParkedModal && (<div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white max-w-3xl w-full max-h-[80vh] rounded shadow-2xl overflow-hidden flex flex-col border-2 border-[#1a5276]">
                <div className="bg-gradient-to-r from-[#1a5276] to-[#2980b9] px-4 py-2 flex items-center justify-between">
                    <div>
                        <h2 className="text-white font-black text-[14px] uppercase tracking-wider">🅿 Parked Bills ({parkedBills.length})</h2>
                        <p className="text-cyan-200 text-[10px] font-bold mt-0.5">Use ↑↓ arrows | Enter = Resume | Delete key = Remove | Esc = Close</p>
                    </div>
                    <button onClick={()=>setShowParkedModal(false)} className="text-white hover:bg-red-500 px-2 py-1 font-black">✕</button>
                </div>
                <div className="flex-1 overflow-auto bg-[#eaf3f8]">
                    {parkedBills.length === 0 ? (
                        <div className="text-center py-16">
                            <div className="text-6xl mb-3">🅿</div>
                            <p className="text-slate-900 font-bold text-[14px]">No parked bills</p>
                            <p className="text-slate-700 text-[11px] font-bold mt-1">Press F7 or click Hold to park current bill</p>
                        </div>
                    ) : (
                        <table className="w-full text-[12px] border-collapse">
                            <thead className="bg-[#d4e6f1] sticky top-0">
                                <tr>
                                    <th className="py-1.5 px-2 text-left border-b border-[#7a9ca8] font-black text-slate-900 w-12">#</th>
                                    <th className="py-1.5 px-2 text-left border-b border-[#7a9ca8] font-black text-slate-900 w-24">Bill No</th>
                                    <th className="py-1.5 px-2 text-left border-b border-[#7a9ca8] font-black text-slate-900">Customer</th>
                                    <th className="py-1.5 px-2 text-left border-b border-[#7a9ca8] font-black text-slate-900 w-28">Phone</th>
                                    <th className="py-1.5 px-2 text-center border-b border-[#7a9ca8] font-black text-slate-900 w-16">Items</th>
                                    <th className="py-1.5 px-2 text-right border-b border-[#7a9ca8] font-black text-slate-900 w-24">Total</th>
                                    <th className="py-1.5 px-2 text-left border-b border-[#7a9ca8] font-black text-slate-900 w-32">Time</th>
                                    <th className="py-1.5 px-2 text-center border-b border-[#7a9ca8] font-black text-slate-900 w-36">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parkedBills.map((p, i) => (<tr key={p.id} onClick={()=>setParkedSelIdx(i)} className={`cursor-pointer border-b border-[#c0d0d8] h-[30px] ${parkedSelIdx === i ? 'bg-yellow-200' : 'bg-white hover:bg-blue-50'}`}>
                                    <td className="py-1 px-2 font-black text-slate-900">{i + 1}</td>
                                    <td className="py-1 px-2 font-black text-blue-700">{p.billNo}</td>
                                    <td className="py-1 px-2 font-bold text-slate-900">{p.customerName}</td>
                                    <td className="py-1 px-2 font-bold text-slate-900">{p.customerPhone || '-'}</td>
                                    <td className="py-1 px-2 text-center font-black text-slate-900">{p.itemCount}</td>
                                    <td className="py-1 px-2 text-right font-black text-[#1a5276]">₹{p.total.toFixed(2)}</td>
                                    <td className="py-1 px-2 text-slate-900 font-bold">{new Date(p.parkedAt).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit', hour12:true})}</td>
                                    <td className="py-1 px-2 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={(e)=>{e.stopPropagation(); handleResumeParked(p);}} className="px-3 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase">Resume</button>
                                            <button onClick={(e)=>{e.stopPropagation(); handleDeleteParked(p.id);}} className="px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white font-black text-[10px]">✕</button>
                                        </div>
                                    </td>
                                </tr>))}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="bg-[#d4e6f1] px-4 py-2 border-t border-[#7a9ca8] text-[11px] font-bold text-slate-900 flex items-center justify-between">
                    <span>↑↓ Navigate | Enter = Resume | Del = Delete | Esc = Close</span>
                    {parkedBills.length > 0 && parkedSelIdx < parkedBills.length && (
                        <span className="text-blue-700 font-black">Selected: {parkedBills[parkedSelIdx]?.billNo} — {parkedBills[parkedSelIdx]?.customerName}</span>
                    )}
                </div>
            </div>
        </div>)}

        {/* ═══ LAST BILLS MODAL (F12) — with filter search ═══ */}
        {showLastBills && (() => {
            const q = (lastBillsFilter || '').toLowerCase().trim();
            const filtered = !q ? lastBills : lastBills.filter(b =>
                (b.customerName || '').toLowerCase().includes(q) ||
                (b.customerPhone || '').toLowerCase().includes(q) ||
                (b.billDate || '').toLowerCase().includes(q) ||
                (b.billTime || '').toLowerCase().includes(q) ||
                String(b.billNo || '').toLowerCase().includes(q) ||
                String(b.grandTotal || '').toLowerCase().includes(q) ||
                (b.saleType || '').toLowerCase().includes(q)
            );
            return (
            <div className="fixed inset-0 z-[200] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white max-w-6xl w-full max-h-[88vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border-2 border-emerald-600">
                    <div className="bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-600 px-6 py-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-white font-black text-[16px] uppercase tracking-[2px] flex items-center gap-2">🧾 Last Bills <span className="px-2 py-0.5 bg-white/20 rounded-full text-[11px]">{filtered.length} / {lastBills.length}</span></h2>
                            <p className="text-emerald-50 text-[10px] font-bold mt-1 tracking-wide">Double-click row to EDIT in sales screen · Click Reprint button to print</p>
                        </div>
                        <button onClick={()=>setShowLastBills(false)} className="text-white hover:bg-red-500 w-8 h-8 rounded-full flex items-center justify-center font-black text-lg transition">✕</button>
                    </div>
                    {/* Search bar */}
                    <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center gap-3">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                            <input
                                ref={lastBillsSearchRef}
                                type="text"
                                value={lastBillsFilter}
                                onChange={e => setLastBillsFilter(e.target.value)}
                                placeholder="Search by customer name, mobile, bill no, date, time, amount..."
                                className="w-full h-10 pl-10 pr-4 text-[13px] font-bold text-slate-900 bg-white border-2 border-slate-200 rounded-lg outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 transition"
                            />
                            {lastBillsFilter && (
                                <button onClick={()=>setLastBillsFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 font-black">✕</button>
                            )}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Tip: type any field — name / phone / date / time / bill no / amount
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto bg-slate-50">
                        {filtered.length === 0 ? (
                            <div className="text-center py-20">
                                <div className="text-6xl mb-3">{lastBills.length === 0 ? '📭' : '🔍'}</div>
                                <p className="text-slate-900 font-bold text-[14px]">{lastBills.length === 0 ? 'No bills yet' : 'No bills match your filter'}</p>
                                <p className="text-slate-600 text-[11px] font-bold mt-1">{lastBills.length === 0 ? 'Save a bill (F1) and it\'ll appear here.' : 'Try a different search term or clear the filter.'}</p>
                            </div>
                        ) : (
                            <table className="w-full text-[12px] border-collapse">
                                <thead className="bg-gradient-to-b from-slate-100 to-slate-200 sticky top-0">
                                    <tr>
                                        <th className="py-2.5 px-3 text-left border-b border-slate-300 font-black text-slate-700 uppercase tracking-wider text-[9px] w-12">#</th>
                                        <th className="py-2.5 px-3 text-left border-b border-slate-300 font-black text-slate-700 uppercase tracking-wider text-[9px] w-24">Bill No</th>
                                        <th className="py-2.5 px-3 text-left border-b border-slate-300 font-black text-slate-700 uppercase tracking-wider text-[9px] w-28">Date</th>
                                        <th className="py-2.5 px-3 text-left border-b border-slate-300 font-black text-slate-700 uppercase tracking-wider text-[9px] w-20">Time</th>
                                        <th className="py-2.5 px-3 text-left border-b border-slate-300 font-black text-slate-700 uppercase tracking-wider text-[9px]">Customer</th>
                                        <th className="py-2.5 px-3 text-left border-b border-slate-300 font-black text-slate-700 uppercase tracking-wider text-[9px] w-32">Mobile</th>
                                        <th className="py-2.5 px-3 text-center border-b border-slate-300 font-black text-slate-700 uppercase tracking-wider text-[9px] w-20">Mode</th>
                                        <th className="py-2.5 px-3 text-right border-b border-slate-300 font-black text-slate-700 uppercase tracking-wider text-[9px] w-28">Total</th>
                                        <th className="py-2.5 px-3 text-center border-b border-slate-300 font-black text-slate-700 uppercase tracking-wider text-[9px] w-56">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((b, i) => (
                                    <tr key={`${b.source}-${b.billNo}-${i}`}
                                        onDoubleClick={()=>loadBillForEdit(b)}
                                        className="border-b border-slate-200 hover:bg-emerald-50 cursor-pointer transition"
                                        title="Double-click to edit in sales screen">
                                        <td className="py-2 px-3 font-bold text-slate-700">{i + 1}</td>
                                        <td className="py-2 px-3 font-black text-emerald-700">{b.billNo}</td>
                                        <td className="py-2 px-3 font-bold text-slate-900">{b.billDate}</td>
                                        <td className="py-2 px-3 font-bold text-slate-600">{b.billTime || '-'}</td>
                                        <td className="py-2 px-3 font-bold text-slate-900">{b.customerName || 'Walk-in'}</td>
                                        <td className="py-2 px-3 font-bold text-slate-700">{b.customerPhone || '-'}</td>
                                        <td className="py-2 px-3 text-center"><span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${b.saleType === 'CREDIT' ? 'bg-orange-100 text-orange-700' : b.saleType === 'CASH' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{b.saleType || 'CASH'}</span></td>
                                        <td className="py-2 px-3 text-right font-black text-slate-900">₹{(b.grandTotal || 0).toFixed(2)}</td>
                                        <td className="py-2 px-3 text-center">
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button onClick={(e)=>{e.stopPropagation(); loadBillForEdit(b);}} className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] uppercase rounded shadow-sm transition" title="Load to sales screen for editing">✎ Edit</button>
                                                <button onClick={(e)=>{e.stopPropagation(); reprintBill(b);}} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] uppercase rounded shadow-sm transition" title="Print bill">🖨 Print</button>
                                                <button onClick={(e)=>{e.stopPropagation(); deleteBill(b);}} className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white font-black text-[10px] uppercase rounded shadow-sm transition" title="Delete bill permanently">🗑 Delete</button>
                                            </div>
                                        </td>
                                    </tr>))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-6 py-3 border-t border-slate-200 text-[11px] font-bold text-slate-700 flex items-center justify-between">
                        <span className="flex items-center gap-3">
                            <span className="flex items-center gap-1.5"><kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-black shadow-sm">Double-click</kbd> Edit</span>
                            <span className="flex items-center gap-1.5"><kbd className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-black shadow-sm">Esc</kbd> Close</span>
                        </span>
                        <span className="text-emerald-700 font-black uppercase tracking-wider text-[10px]">Showing {filtered.length} of {lastBills.length} bills</span>
                    </div>
                </div>
            </div>
            );
        })()}

        {/* ═══ GST TAX INVOICE — preview / open / save / print (backend-sourced) ═══ */}
        <InvoicePreviewModal
            open={invoiceModalOpen}
            onOpenChange={setInvoiceModalOpen}
            saleId={invoiceTarget.saleId}
            billNo={invoiceTarget.billNo}
            sizeMode={billSize}
        />
    </div>);
}
