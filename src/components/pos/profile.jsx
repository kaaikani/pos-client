"use client";
/**
 * Business profile.
 *
 * One core, four products. The profile does not just relabel things — it changes
 * which screens exist, which fields appear on a bill, what the counter screen is
 * laid out for, and what the operator is called. A pharmacist and a restaurant
 * captain should each feel the software was built for them.
 *
 * The brand accent stays constant across profiles — it is the product's identity.
 * What varies is the profile TINT, used on the switcher badge and profile-specific
 * chrome, so the operator always knows which mode the terminal is in.
 *
 * STORAGE: the selection lives in localStorage for now. It moves to the server as
 * `PosBusinessProfile` + `PosCapability` in Stage C, at which point this file keeps
 * its shape and only `useBusinessProfile` changes where it reads from.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { UtensilsCrossed, ShoppingBasket, Pill, Briefcase } from 'lucide-react';

const KEY = 'pos_business_profile';

/**
 * `capabilities` gates screens and fields. `terms` renames things the operator
 * reads. `pos` decides how the counter screen is laid out.
 */
export const PROFILES = [
    {
        id: 'RESTAURANT',
        code: 'RS',
        name: 'Restaurant',
        tagline: 'Tables, KOT & kitchen flow',
        icon: UtensilsCrossed,
        tint: '#C2410C',
        capabilities: {
            tables: true, kot: true, waiter: true, recipe: true, modifiers: true,
            splitBill: true, orderTypes: true,
            batchTracking: false, expiryTracking: false, prescription: false,
            weighingScale: false, priceTiers: false, creditLimit: false, quotation: false,
        },
        terms: {
            customer: 'Guest', customerPlural: 'Guests',
            bill: 'Order', billPlural: 'Orders',
            item: 'Dish', itemPlural: 'Menu',
            operator: 'Captain', counter: 'Floor',
        },
        pos: {
            layout: 'TABLES',              // floor map first, then the order pad
            primaryAction: 'Send to Kitchen',
            search: 'Search dish or short code…',
            showScanBar: false,
            orderTypes: ['Dine-in', 'Takeaway', 'Delivery'],
        },
    },
    {
        id: 'SUPERMARKET',
        code: 'SM',
        name: 'Supermarket',
        tagline: 'Barcode-first, fast tender',
        icon: ShoppingBasket,
        tint: '#15803D',
        capabilities: {
            weighingScale: true, loyalty: true, rack: true, bundle: true,
            stockTransfer: true, multiTender: true, fastReturn: true,
            batchTracking: true, expiryTracking: true,
            tables: false, kot: false, prescription: false, quotation: false,
        },
        terms: {
            customer: 'Customer', customerPlural: 'Customers',
            bill: 'Bill', billPlural: 'Bills',
            item: 'Product', itemPlural: 'Products',
            operator: 'Cashier', counter: 'Counter',
        },
        pos: {
            layout: 'SCAN',                // the scan lane owns the screen
            primaryAction: 'Take payment',
            search: 'Scan barcode or type product name…',
            showScanBar: true,
            orderTypes: null,
        },
    },
    {
        id: 'PHARMACY',
        code: 'ME',
        name: 'Medical / Pharmacy',
        tagline: 'Batch, expiry & prescription control',
        icon: Pill,
        tint: '#0E7490',
        capabilities: {
            batchTracking: true, expiryTracking: true, prescription: true,
            saltSearch: true, drugSchedule: true, doctorMaster: true,
            nearExpiryAlert: true,
            tables: false, kot: false, weighingScale: false, quotation: false,
        },
        terms: {
            customer: 'Patient', customerPlural: 'Patients',
            bill: 'Bill', billPlural: 'Bills',
            item: 'Medicine', itemPlural: 'Medicines',
            operator: 'Pharmacist', counter: 'Counter',
        },
        pos: {
            layout: 'SCAN',
            primaryAction: 'Take payment',
            search: 'Search medicine, salt or SKU…',
            showScanBar: true,
            orderTypes: null,
        },
    },
    {
        id: 'TRADER',
        code: 'TR',
        name: 'Trader / B2B',
        tagline: 'Quotation, credit terms & GST',
        icon: Briefcase,
        tint: '#B45309',
        capabilities: {
            quotation: true, salesOrder: true, deliveryChallan: true,
            priceTiers: true, creditLimit: true, billWiseOutstanding: true,
            eWayBill: true, partyRates: true,
            tables: false, kot: false, prescription: false, weighingScale: false,
        },
        terms: {
            customer: 'Party', customerPlural: 'Parties',
            bill: 'Invoice', billPlural: 'Invoices',
            item: 'Item', itemPlural: 'Items',
            operator: 'Operator', counter: 'Desk',
        },
        pos: {
            layout: 'DOCUMENT',            // header-first: party, terms, then lines
            primaryAction: 'Save invoice',
            search: 'Search item or SKU…',
            showScanBar: true,
            orderTypes: null,
        },
    },
];

export const DEFAULT_PROFILE_ID = 'TRADER';

const Ctx = createContext(null);

export function BusinessProfileProvider({ children }) {
    const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
    const [outlet, setOutlet] = useState(null);

    // Read once on mount rather than during render, so server and client agree
    // on the first paint and React does not warn about a hydration mismatch.
    useEffect(() => {
        try {
            const saved = localStorage.getItem(KEY);
            if (saved && PROFILES.some(p => p.id === saved)) setProfileId(saved);
            const o = localStorage.getItem('pos_outlet');
            if (o) setOutlet(JSON.parse(o));
        } catch { /* private mode */ }
    }, []);

    const change = useCallback((id) => {
        if (!PROFILES.some(p => p.id === id)) return;
        setProfileId(id);
        try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
    }, []);

    const chooseOutlet = useCallback((o) => {
        setOutlet(o);
        try { localStorage.setItem('pos_outlet', JSON.stringify(o)); } catch { /* private mode */ }
    }, []);

    const profile = useMemo(
        () => PROFILES.find(p => p.id === profileId) || PROFILES[0],
        [profileId],
    );

    const value = useMemo(() => ({
        profile,
        profiles: PROFILES,
        setProfile: change,
        outlet,
        setOutlet: chooseOutlet,
        /** `can('kot')` — one call site, so gating never drifts between screens. */
        can: (cap) => !!profile.capabilities[cap],
        /** `t('customer')` — profile wording, e.g. Patient / Guest / Party. */
        t: (key) => profile.terms[key] || key,
    }), [profile, change, outlet, chooseOutlet]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBusinessProfile() {
    const ctx = useContext(Ctx);
    if (!ctx) {
        // A screen rendered outside the provider still works, on the default profile.
        const profile = PROFILES.find(p => p.id === DEFAULT_PROFILE_ID);
        return {
            profile, profiles: PROFILES, setProfile: () => {},
            outlet: null, setOutlet: () => {},
            can: (c) => !!profile.capabilities[c],
            t: (k) => profile.terms[k] || k,
        };
    }
    return ctx;
}
