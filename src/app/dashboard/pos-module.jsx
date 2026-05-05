"use client";
import React, { useState, useEffect, useRef } from 'react';
import { LookupBarcodeQuery } from '../../core/queries/PosQueries';
import { CreateLedgerCommand } from '../../core/queries/ledger.query';
import { ListItemsQuery, CreateSaleCommand, ListSalesQuery } from '../../core/queries/pharma.query';
import { invalidateCache } from '../../core/queries/cache';
import { gql } from '../../core/queries/gql';

const GST_RATE = 0.18;

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
    const [showToast, setShowToast] = useState(false);

    // Parked/Hold bills
    const [parkedBills, setParkedBills] = useState([]);
    const [showParkedModal, setShowParkedModal] = useState(false);
    const [parkedSelIdx, setParkedSelIdx] = useState(0);

    // Keyboard navigation
    const [focusedRow, setFocusedRow] = useState(-1); // cart row index under arrow focus

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
        setBillNo(String(Math.floor(Math.random() * 900 + 100)));
        setDate(new Date().toLocaleDateString('en-GB'));
        const reports = JSON.parse(localStorage.getItem('pos_reports') || '[]');
        setLastBillNo(String(reports.length || 3));
        // Force fresh fetch on POS open so newly-added items / size variants are picked up
        invalidateCache('pharma:items');
        new ListItemsQuery().execute().then(setPharmaItems).catch(e => console.error(e));
        // Load parked bills
        try { setParkedBills(JSON.parse(localStorage.getItem('pos_parked_bills') || '[]')); } catch {}
        // Auto-focus the first ItemName input on load
        setTimeout(() => { itemNameInputsRef.current[0]?.focus(); }, 200);
    }, []);

    // Persist parked bills
    useEffect(() => {
        localStorage.setItem('pos_parked_bills', JSON.stringify(parkedBills));
    }, [parkedBills]);

    const totalItems = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
    const subTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const taxAmount = taxType === 'WTax' ? Math.round(subTotal * GST_RATE * 100) / 100 : 0;
    const discAmt = parseFloat(discount) || 0;
    const transportAmt = parseFloat(transportCharges) || 0;
    const grandTotal = Math.round((subTotal + taxAmount + transportAmt - discAmt) * 100) / 100;
    const receivedA = parseFloat(receivedAmt) || 0;
    const balance = Math.round((grandTotal - receivedA) * 100) / 100;

    const addRow = () => setRows(prev => [...prev, { sno: prev.length + 1, code: '', itemName: '', qty: '', rate: '', amount: '', total: '' }]);

    const updateRow = (idx, field, val) => {
        // Stock guard: when user types qty manually, block exceeding available stock
        if (field === 'qty') {
            const r = rows[idx];
            if (r && r.itemName) {
                const prod = pharmaItems.find(p => p.code === r.code || p.itemName === r.itemName);
                if (prod) {
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

        // Stock validation — block if item is out of stock
        const stock = getItemStock(item);
        if (stock != null && stock <= 0) {
            alert(`❌ OUT OF STOCK\n\n"${item.itemName}" (Code: ${item.code}) is out of stock and cannot be added to the bill.\n\nPlease restock the item from Item Master / Purchase first.`);
            return;
        }
        // If adding this would exceed available stock, block too
        if (stock != null) {
            const alreadyInCart = cartQtyForItem(item);
            if (alreadyInCart + 1 > stock) {
                alert(`❌ INSUFFICIENT STOCK\n\n"${item.itemName}" — only ${stock} available, but you've already added ${alreadyInCart} to the cart.`);
                return;
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
        let nextFocusIdx = 0;
        const overrideUnit = variant?.size;
        const overrideRate = variant ? parseFloat(variant.rate) : null;
        setRows(prev => {
            let nr = [...prev];
            // DUPLICATE DETECTION: same product + same variant (unit) → bump qty
            const dupUnit = overrideUnit || item.unit || defaultUnitFor(item);
            const existingIdx = nr.findIndex(r => r.itemName && r.code === item.code && r.itemName === item.itemName && (r.unit || '') === dupUnit);
            if (existingIdx >= 0 && existingIdx !== idx) {
                // Bump existing row's qty
                const er = { ...nr[existingIdx] };
                const newQty = (parseFloat(er.qty) || 0) + 1;
                const rate = parseFloat(er.rate) || 0;
                er.qty = String(newQty);
                er.amount = (newQty * rate).toFixed(2);
                er.total = er.amount;
                nr[existingIdx] = er;
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
            // Focus the trailing empty row
            nextFocusIdx = nr.length - 1;
            return nr.map((r, i) => ({ ...r, sno: i + 1 }));
        });
        // Move focus to trailing empty row's ItemName for continuous entry
        setTimeout(() => { itemNameInputsRef.current[nextFocusIdx]?.focus(); }, 50);
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
            items: validRows.map(r => ({ code: r.code, name: r.itemName, qty: parseFloat(r.qty), rate: parseFloat(r.rate), amount: parseFloat(r.amount) })),
            subtotal: subTotal, taxAmount, discount: discAmt, transportCharges: transportAmt, grandTotal,
            cashAmount: cashA, upiAmount: upiA, cardAmount: cardA,
            receivedAmount: totalReceived, balanceDue, changeReturned,
            remarks,
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
            handleCancel();
            setBillNo(String(parseInt(billNo) + 1));
            setLastBillNo(String((parseInt(lastBillNo) || 0) + 1));
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
        // Focus first ItemName input for next bill entry
        setTimeout(() => { itemNameInputsRef.current[0]?.focus(); }, 100);
    };

    const handlePrint = () => {
        if (!lastOrder) return alert('No bill to print. Save a bill first (F1).');
        const size = BILL_SIZES[billSize] || BILL_SIZES['3inch'];
        const winWidth = parseInt(size.width) * 4 || 420;
        const w = window.open('', '_blank', `width=${winWidth},height=800`);
        if (!w) return alert('Allow popups to print invoice.');
        const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const totalQty = lastOrder.items.reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
        const itemsHTML = lastOrder.items.map((it, i) => `<tr>
<td style="padding:5px 4px;border-bottom:1px dotted #ccc;text-align:center;font-size:11px;color:#666">${i+1}</td>
<td style="padding:5px 4px;border-bottom:1px dotted #ccc;font-weight:700;font-size:12px">${it.name}</td>
<td style="padding:5px 4px;border-bottom:1px dotted #ccc;text-align:center;font-size:12px">${it.qty}</td>
<td style="padding:5px 4px;border-bottom:1px dotted #ccc;text-align:right;font-size:12px">${parseFloat(it.price).toFixed(2)}</td>
<td style="padding:5px 4px;border-bottom:1px dotted #ccc;text-align:right;font-weight:700;font-size:12px">${parseFloat(it.total).toFixed(2)}</td>
</tr>`).join('');

        const html = `<!DOCTYPE html><html><head><title>Invoice ${lastOrder.billNo}</title>
<style>
${size.css}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI','Arial',sans-serif;padding:10px;color:#1e293b;width:${size.width};max-width:${size.width};margin:0 auto;background:#fff;font-size:${size.width.includes('76') ? '10px' : size.width.includes('104') ? '11px' : '12px'}}
@media print{body{padding:4px;width:100%;max-width:100%}}
.center{text-align:center}
.right{text-align:right}
hr{border:none;border-top:2px dashed #94a3b8;margin:10px 0}
table{width:100%;border-collapse:collapse}
</style></head>
<body onload="window.print()">

<div class="center" style="border-bottom:2px dashed #94a3b8;padding-bottom:12px;margin-bottom:10px">
  <h1 style="font-size:24px;font-weight:900;letter-spacing:3px">AVS ECOM</h1>
  <p style="font-size:10px;color:#64748b;letter-spacing:3px;text-transform:uppercase;margin-top:2px">MEDICAL & PHARMACY</p>
  <p style="font-size:11px;color:#475569;margin-top:6px">123, Main Road, Your City - 600001</p>
  <p style="font-size:11px;color:#475569">Ph: +91 98765 43210 | GSTIN: 33XXXXX1234X1ZX</p>
  <p style="font-size:11px;color:#475569">DL No: TN-CHN-20/1234/2026</p>
</div>

<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #e2e8f0">
  <div>
    <div style="color:#64748b;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Invoice</div>
    <div style="font-weight:800;color:#0f172a;font-size:14px">${lastOrder.billNo}</div>
  </div>
  <div class="center">
    <div style="color:#64748b;font-size:9px;font-weight:700;text-transform:uppercase">Date</div>
    <div style="font-weight:700">${lastOrder.date}</div>
  </div>
  <div class="right">
    <div style="color:#64748b;font-size:9px;font-weight:700;text-transform:uppercase">Time</div>
    <div style="font-weight:700">${time}</div>
  </div>
</div>

<div style="font-size:11px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #e2e8f0">
  <div style="display:flex;justify-content:space-between;margin-bottom:2px">
    <div><span style="color:#64748b">Customer:</span> <strong>${lastOrder.customer?.name || 'Walk-in'}</strong></div>
    <div><span style="color:#64748b">Mode:</span> <strong style="color:${lastOrder.saleType==='CREDIT'?'#ea580c':'#059669'}">${lastOrder.saleType}</strong></div>
  </div>
  ${lastOrder.customer?.phone ? `<div style="margin-top:2px"><span style="color:#64748b">Phone:</span> ${lastOrder.customer.phone}</div>` : ''}
  ${lastOrder.customer?.address ? `<div style="margin-top:2px"><span style="color:#64748b">Address:</span> ${lastOrder.customer.address}</div>` : ''}
  ${lastOrder.salesMan ? `<div style="margin-top:2px"><span style="color:#64748b">Sales Man:</span> ${lastOrder.salesMan}</div>` : ''}
</div>

<table style="margin-bottom:10px">
  <thead>
    <tr style="background:#f1f5f9">
      <th style="padding:7px 4px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#475569;border-bottom:2px solid #cbd5e1;width:25px">#</th>
      <th style="padding:7px 4px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#475569;border-bottom:2px solid #cbd5e1">Item Description</th>
      <th style="padding:7px 4px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#475569;border-bottom:2px solid #cbd5e1;width:35px">Qty</th>
      <th style="padding:7px 4px;text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#475569;border-bottom:2px solid #cbd5e1;width:55px">Rate</th>
      <th style="padding:7px 4px;text-align:right;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#475569;border-bottom:2px solid #cbd5e1;width:65px">Amount</th>
    </tr>
  </thead>
  <tbody>${itemsHTML}</tbody>
</table>

<div style="border-top:2px dashed #94a3b8;padding-top:10px;font-size:12px">
  <div style="display:flex;justify-content:space-between;margin-bottom:3px">
    <span style="color:#64748b">Sub Total (${lastOrder.items.length} items, ${totalQty} qty)</span>
    <strong>₹${lastOrder.subtotal.toFixed(2)}</strong>
  </div>
  ${lastOrder.discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px">
    <span style="color:#64748b">Discount</span><strong style="color:#ef4444">-₹${lastOrder.discount.toFixed(2)}</strong>
  </div>` : ''}
  <div style="display:flex;justify-content:space-between;margin-bottom:3px">
    <span style="color:#64748b">GST / Tax</span><strong>₹${lastOrder.taxAmount.toFixed(2)}</strong>
  </div>
  ${lastOrder.transport > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:3px">
    <span style="color:#64748b">Transport</span><strong>₹${lastOrder.transport.toFixed(2)}</strong>
  </div>` : ''}
  <div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:2px solid #0f172a;font-size:18px;font-weight:900">
    <span>GRAND TOTAL</span><span>₹${lastOrder.grandTotal.toFixed(2)}</span>
  </div>
  ${lastOrder.receivedAmount > 0 ? `
  <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px">
    <span style="color:#059669;font-weight:700">Paid</span>
    <strong style="color:#059669">₹${lastOrder.receivedAmount.toFixed(2)}</strong>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:12px">
    <span style="color:${lastOrder.balance > 0 ? '#ef4444' : '#64748b'};font-weight:700">${lastOrder.balance > 0 ? 'Balance Due' : 'Change'}</span>
    <strong style="color:${lastOrder.balance > 0 ? '#ef4444' : '#0f172a'}">₹${Math.abs(lastOrder.balance).toFixed(2)}</strong>
  </div>` : ''}
</div>

<div class="center" style="margin-top:20px;padding-top:12px;border-top:2px dashed #94a3b8;font-size:11px;color:#94a3b8">
  <p style="font-weight:700;color:#475569;margin-bottom:4px">🙏 Thank You! Visit Again 🙏</p>
  <p style="margin-top:4px">Items: ${lastOrder.items.length} | Total Qty: ${totalQty}</p>
  <p style="margin-top:6px;font-size:9px;letter-spacing:1px">Powered by AVS ECOM Medical POS</p>
</div>

</body></html>`;

        w.document.open();
        w.document.write(html);
        w.document.close();
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
    }, [showSearch, searchSelIdx, filteredSearchItems, rows, showParkedModal, parkedSelIdx, parkedBills, focusedRow, suggestRow, suggestField, suggestSelIdx, activeSuggestions, showCustSuggest, customerSuggestions, custSuggestSelIdx, showNameSuggest, nameSuggestions, nameSuggestSelIdx, unitDropdownRow, unitDropdownSelIdx, pharmaItems, showCheckout, payCash, payUpi, payCard, payCredit, mode, grandTotal]);

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

    // Customer lookup by name (2+ chars) — match against firstName OR lastName
    useEffect(() => {
        const name = customerName.trim();
        if (name.length < 2 || name.toUpperCase() === 'COUNTER SALES') {
            setNameSuggestions([]); setShowNameSuggest(false); return;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const query = `query FindCustByName($term: String!) {
                    customers(options: {
                        filter: { firstName: { contains: $term }, lastName: { contains: $term } },
                        filterOperator: OR,
                        take: 8
                    }) {
                        items { id firstName lastName phoneNumber emailAddress addresses { streetLine1 city postalCode } }
                    }
                }`;
                const data = await gql(query, { useAdmin: true, variables: { term: name } });
                if (cancelled) return;
                const items = data?.customers?.items || [];
                setNameSuggestions(items);
                setNameSuggestSelIdx(0);
                setShowNameSuggest(items.length > 0);
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

    const inp = "bg-white border border-[#888] h-[22px] px-1 text-[11px] font-bold text-slate-900 outline-none focus:bg-yellow-50 focus:border-[#1a5276]";
    const lbl = "text-[11px] font-bold text-slate-900";

    return (<div className="relative w-full h-full flex flex-col overflow-hidden font-sans text-[11px] select-none" style={{background:'#f4f4f4'}}>
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

        {/* ── Title bar ── */}
        <div className="h-[22px] bg-[#7cb8c0] flex items-center px-2 justify-between shrink-0 border-b border-[#5a9da5]">
            <h1 className="text-slate-900 font-bold text-[12px]">Retail Sales - பேர் டிபார்ட்மென்டல் ஸ்டோர் 2026-2027 - admin</h1>
            <div className="flex items-center gap-1">
                <button className="w-5 h-4 bg-[#c0c0c0] border border-slate-600 text-[10px] leading-none">_</button>
                <button className="w-5 h-4 bg-[#c0c0c0] border border-slate-600 text-[10px] leading-none">□</button>
                <button className="w-5 h-4 bg-[#c0c0c0] border border-slate-600 text-[10px] leading-none">✕</button>
            </div>
        </div>

        {/* ── Sales1/2/3/4 tabs ── */}
        <div className="shrink-0 flex bg-white pl-2 pt-1 border-b border-[#888]">
            {['Sales1'].map(t => (
                <button key={t} onClick={()=>setActiveSalesTab(t)}
                    className={`px-4 py-0.5 text-[11px] font-bold border-t border-l border-r border-[#888] ${activeSalesTab===t ? 'bg-white text-slate-900' : 'bg-[#e0e0e0] text-slate-700 hover:bg-[#ececec]'}`}>{t}</button>
            ))}
        </div>

        {/* ── Header form (matching screenshot) ── */}
        <div className="shrink-0 bg-white border-b border-[#888]">
            {/* Row A: Book | Type | Bill No | Date | Customer | Last BillNo */}
            <div className="flex items-center px-2 py-1 gap-2 border-b border-[#d0d0d0]">
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
                        onBlur={()=>setTimeout(()=>setShowNameSuggest(false), 150)}
                        onFocus={()=>{ if (nameSuggestions.length > 0) setShowNameSuggest(true); }}
                        placeholder="COUNTER SALES" className={`${inp} w-full font-bold`}/>
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
            <div className="flex items-center px-2 py-1 gap-2 border-b border-[#d0d0d0]">
                <label className={`${lbl} w-16`}>Rate Type -</label>
                <select value={rateType} onChange={e=>setRateType(e.target.value)} className={`${inp} w-28 font-bold`}>
                    <option>wholsale</option><option>retail</option><option>ARate</option><option>BRate</option><option>CRate</option><option>DRate</option>
                </select>
                <label className="flex items-center gap-1 ml-2 cursor-pointer"><input type="checkbox" checked={igst} onChange={e=>setIgst(e.target.checked)} className="accent-emerald-600"/><span className={`${lbl} text-blue-900`}>GSTNo</span></label>
                <label className="flex items-center gap-1 ml-2 cursor-pointer"><input type="checkbox" checked={nonAcc} onChange={e=>setNonAcc(e.target.checked)}/><span className={lbl}>OtherState</span></label>
                <label className="flex items-center gap-1 ml-2 cursor-pointer"><input type="checkbox" checked={header} onChange={e=>setHeader(e.target.checked)}/><span className={lbl}>Home Delivery</span></label>
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

            {/* Address + summary info bar (compact) */}
            <div className="flex items-stretch bg-white border-b border-[#d0d0d0]">
                <label className={`${lbl} px-2 flex items-center border-r border-[#d0d0d0] bg-[#eaf3f8] text-slate-900`}>Address{mode === 'CREDIT' && <span className="text-red-600 font-black ml-1">*</span>}</label>
                <input type="text" value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} placeholder="Customer / delivery address" className="flex-1 h-[22px] px-2 text-[11px] font-bold outline-none border-r border-[#d0d0d0]"/>
                <div className="px-3 h-[22px] flex items-center text-[11px] font-bold border-r border-[#d0d0d0] bg-[#eaf3f8] text-slate-900">No. of Units: <span className="ml-1 font-black">{totalItems.toFixed(2)}</span></div>
                <div className="px-3 h-[22px] flex items-center text-[11px] font-bold bg-[#eaf3f8] text-slate-900">Cost: <span className="ml-1 font-black">₹{subTotal.toFixed(2)}</span></div>
            </div>
        </div>

        {/* ── Main items grid ── */}
        <div className="flex-1 overflow-auto bg-white relative">
            <table className="w-full text-[11px] border-collapse">
                <thead className="bg-[#6cc2ca] text-white sticky top-0 z-10">
                    <tr>
                        <th className="border border-[#3aa8b0] w-10 py-0.5 font-bold">Sl...</th>
                        <th className="border border-[#3aa8b0] w-20 py-0.5 font-bold">Code</th>
                        <th className="border border-[#3aa8b0] py-0.5 font-bold">ItemName</th>
                        <th className="border border-[#3aa8b0] w-20 py-0.5 font-bold">Unit</th>
                        <th className="border border-[#3aa8b0] w-20 py-0.5 font-bold">Qty</th>
                        <th className="border border-[#3aa8b0] w-20 py-0.5 font-bold">Rate</th>
                        <th className="border border-[#3aa8b0] w-20 py-0.5 font-bold">MrpRate</th>
                        <th className="border border-[#3aa8b0] w-20 py-0.5 font-bold bg-[#16a085] text-white">Stock</th>
                        <th className="border border-[#3aa8b0] w-24 py-0.5 font-bold bg-[#e8b84a] text-slate-900">Amount</th>
                        <th className="border border-[#3aa8b0] w-8 py-0.5 font-bold text-center">✕</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => {
                        const isFocused = selectedProduct && selectedProduct.code === r.code;
                        const isLast = i === rows.length - 1;
                        return (
                        <tr key={i} onClick={() => r.itemName && selectRowForStock(r)}
                            className="border-b border-[#e0e0e0] cursor-pointer hover:bg-blue-50"
                            style={{background: isFocused ? '#fef9c3' : 'white'}}>
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
                                                {(() => { const s = getItemStock(p); return s != null && s <= 0
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
                                                {(() => { const s = getItemStock(p); return s != null && s <= 0
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
                    <button onClick={()=>setSelectedProduct(null)} className="ml-auto text-slate-700 hover:text-red-600 font-black">✕</button>
                </div>
            );
        })()}

        {/* ── Compact bottom: Summary (left) | Total + Checkout (center) | Payment Detail (right) ── */}
        <div className="shrink-0 flex border-t border-[#888] bg-white">
            {/* LEFT: Hotkeys + Summary table below */}
            <div className="w-[320px] border-r border-[#888] text-[10px] bg-white flex flex-col">
                {/* Hotkeys */}
                <div className="text-[9px] font-bold text-slate-900 m-0.5">
                    <div className="bg-[#1a5276] text-white px-2 py-0 text-[9px] uppercase tracking-widest font-black">⌨ Hotkeys</div>
                    <div className="grid grid-cols-3 border border-[#aaa] border-t-0">
                        <span className="px-2 py-0 border-r border-b border-[#aaa]">F1 - <u>S</u>ave</span>
                        <span className="px-2 py-0 border-r border-b border-[#aaa]">F2 - <u>P</u>rint</span>
                        <span className="px-2 py-0 border-b border-[#aaa]">F3 - Discount</span>
                        <span className="px-2 py-0 border-r border-b border-[#aaa]">Alt+<u>C</u> - Customer</span>
                        <span className="px-2 py-0 border-r border-b border-[#aaa]">Alt+<u>M</u> - Mobile</span>
                        <span className="px-2 py-0 border-b border-[#aaa]">Alt+<u>I</u> - Item</span>
                        <span className="px-2 py-0 border-r border-b border-[#aaa]">F6 - New Cust.</span>
                        <span className="px-2 py-0 border-r border-b border-[#aaa]">F7 - Hold</span>
                        <span className="px-2 py-0 border-b border-[#aaa]">F8 - Parked</span>
                        <span className="px-2 py-0 border-r border-[#aaa] bg-emerald-100">F10 - <b>Checkout</b></span>
                        <span className="px-2 py-0 border-r border-[#aaa]">F11 - Cell No</span>
                        <span className="px-2 py-0">Esc - Close</span>
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

            {/* CENTER: Total + Checkout button */}
            <div className="flex-1 flex flex-col items-center justify-center py-3 px-3" style={{background:'#6cc2ca'}}>
                <span className="text-red-600 font-bold text-[12px] italic leading-none">TOTAL</span>
                <span className="text-[#1a1a7e] font-black text-[28px] leading-none mt-1">₹{grandTotal.toFixed(2)}</span>
                <button onClick={showCheckout ? confirmCheckout : openCheckout}
                    className={`mt-2 px-6 py-2 ${showCheckout ? 'bg-emerald-700 hover:bg-emerald-600 border-emerald-900' : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-800'} border-2 text-white font-black text-[13px] uppercase tracking-widest shadow-lg rounded transition active:scale-95`}>
                    {showCheckout ? '✓ CONFIRM & SAVE' : '💰 CHECKOUT (F10)'}
                </button>
                {showCheckout && (
                    <button onClick={()=>setShowCheckout(false)} className="mt-1 text-[10px] text-slate-700 hover:text-red-600 font-bold underline">✕ Cancel</button>
                )}
            </div>

            {/* RIGHT: Payment Detail only (Summary moved to LEFT panel) */}
            <div className="w-[340px] border-l border-[#888] bg-white flex flex-col">
                {/* Payment Detail — always rendered, fields disabled until Checkout clicked */}
                <div className={`bg-gradient-to-r from-[#5b3f8f] to-[#7c5cb5] py-1 text-center transition`}>
                    <h3 className="text-white font-black text-[12px] uppercase tracking-widest">Payment Detail {!showCheckout && <span className="text-cyan-200 text-[9px] normal-case ml-1">(Click CHECKOUT to enable)</span>}</h3>
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
    </div>);
}
