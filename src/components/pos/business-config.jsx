"use client";
/**
 * The business configuration, available to every screen.
 *
 * One installation serves five kinds of business. A screen should not have to
 * know which one it is running in — it asks whether a module is on and hides
 * what does not apply. A restaurant never sees batch and expiry; a trader never
 * sees a table plan.
 *
 * Hiding is a courtesy, not the rule. The server refuses a call for a module
 * that is off, so a bookmark or an old browser tab cannot reach a feature this
 * business has switched off. What happens here is only that the operator is not
 * shown controls that would fail.
 */
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { PosBusinessConfigQuery } from '../../core/queries/pos.query';

const BusinessConfigContext = createContext(null);

export function BusinessConfigProvider({ children }) {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            setConfig(await new PosBusinessConfigQuery().execute());
        } catch {
            // If the configuration cannot be read, show everything rather than
            // hide it. A shop that suddenly loses half its menu because of a
            // network blip is worse off than one that sees a control which then
            // reports honestly that the module is off.
            setConfig(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const value = useMemo(() => {
        const enabled = new Map((config?.modules || []).map(m => [m.key, !!m.enabled]));
        return {
            config,
            loading,
            reload: load,
            vertical: config?.vertical || 'GENERAL',
            verticalLabel: config?.verticalLabel || '',
            documents: config?.documents || [],
            /** Unknown module, or no configuration loaded, counts as ON. */
            isModuleOn: (key) => (enabled.has(key) ? enabled.get(key) : true),
        };
    }, [config, loading, load]);

    return (
        <BusinessConfigContext.Provider value={value}>
            {children}
        </BusinessConfigContext.Provider>
    );
}

/** The whole configuration — vertical, documents, and a reload. */
export function useBusinessConfig() {
    return useContext(BusinessConfigContext) || {
        config: null, loading: false, reload: () => {},
        vertical: 'GENERAL', verticalLabel: '', documents: [],
        isModuleOn: () => true,
    };
}

/**
 * Whether one module is on.
 *
 * Defaults to true when the provider is absent or the configuration failed to
 * load, so a screen used outside the dashboard still works.
 */
export function useModule(key) {
    return useBusinessConfig().isModuleOn(key);
}

/**
 * Which module a screen needs, if any.
 *
 * Screens not listed here are always available — most of the application is
 * common to every business, and only the parts below belong to one kind of shop
 * rather than all of them.
 */
export const SCREEN_MODULE = {
    token: 'queueToken',
    barcode: 'barcode',
    'unit-settings': 'scaleBarcode',
    repack: 'repacking',
    batches: 'batchTracking',
    restaurant: 'tables',
    'credit-limits': 'creditLimit',
    accounts: 'accounting',
};
