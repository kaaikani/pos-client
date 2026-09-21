"use client";
/**
 * Document numbering settings.
 *
 * Every document series — sale, purchase, receipt, payment, returns, orders,
 * expenses, adjustments, tokens — is numbered by the server from a counter held
 * under a row lock. This screen decides what those numbers look like.
 *
 * Shops want visibly different numbers from the same software: a counter shop
 * wants a plain 1, 2, 3 on a thermal slip, a distributor issuing A4 tax invoices
 * wants INV/2627/000001. Hard-coding one shape means a fork per customer, so
 * every part of the format lives here.
 *
 * Changing a format never renumbers anything already issued — documents keep
 * the number they were printed with. The preview shows the number that will
 * actually be issued next, read from the live counter, so it cannot promise
 * something different from what the till produces.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Hash, Save, RefreshCw } from 'lucide-react';
import { PosDocSeriesQuery, UpdatePosDocSeriesCommand } from '../../core/queries/pos.query';
import {
    Page, PageHeader, PageBody, Card, Field, Input, Select, Button, Banner, EmptyState,
} from '../../components/pos';

/** Plain names for the series keys the server uses. */
const LABELS = {
    SALE: 'Sales Bill',
    PURCHASE: 'Purchase',
    RECEIPT: 'Receipt',
    PAYMENT: 'Payment Voucher',
    PURCHASE_RETURN: 'Purchase Return',
    SALES_RETURN: 'Sales Return',
    PURCHASE_ORDER: 'Purchase Order',
    EXPENSE: 'Expense',
    STOCK_ADJUSTMENT: 'Stock Adjustment',
    TOKEN: 'Token',
};

const RESET_OPTIONS = [
    { value: 'CONTINUOUS', label: 'Never restarts' },
    { value: 'FY', label: 'Restarts every financial year' },
    { value: 'DAILY', label: 'Restarts every day' },
];

const PAD_OPTIONS = [
    { value: '0', label: 'No padding — 1' },
    { value: '3', label: '3 digits — 001' },
    { value: '4', label: '4 digits — 0001' },
    { value: '5', label: '5 digits — 00001' },
    { value: '6', label: '6 digits — 000001' },
];

const SEP_OPTIONS = [
    { value: '/', label: 'Slash  /' },
    { value: '-', label: 'Dash  -' },
    { value: '', label: 'None' },
];

export default function NumberingSettingsModule() {
    const [series, setSeries] = useState([]);
    const [draft, setDraft] = useState({});
    const [loading, setLoading] = useState(true);
    const [savingType, setSavingType] = useState('');
    const [banner, setBanner] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const rows = await new PosDocSeriesQuery().execute();
            setSeries(rows);
            setDraft(Object.fromEntries(rows.map(r => [r.docType, { ...r }])));
            setBanner(null);
        } catch (e) {
            setBanner({ tone: 'danger', text: `Could not load numbering settings: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const set = (docType, key, value) =>
        setDraft(d => ({ ...d, [docType]: { ...d[docType], [key]: value } }));

    /**
     * What the number would look like with the settings currently on screen.
     *
     * Built locally so it updates as the operator types. The authoritative
     * preview is the `example` the server returns after saving, which is why
     * that one replaces this the moment a row is saved.
     */
    const previewOf = (d) => {
        if (!d) return '';
        const period = d.includePeriod
            ? (d.resetMode === 'DAILY' ? 'YYYYMMDD' : d.resetMode === 'FY' ? 'YYYY' : '')
            : '';
        const pad = Math.max(0, Number(d.padding) || 0);
        const serial = pad > 0 ? '1'.padStart(pad, '0') : '1';
        return [d.prefix, period, serial].filter(Boolean).join(d.separator || '') + (d.suffix || '');
    };

    const dirty = (docType) => {
        const a = series.find(s => s.docType === docType);
        const b = draft[docType];
        if (!a || !b) return false;
        return ['prefix', 'separator', 'includePeriod', 'resetMode', 'padding', 'suffix']
            .some(k => String(a[k]) !== String(b[k]));
    };

    const save = useCallback(async (docType) => {
        const d = draft[docType];
        if (!d) return;
        setSavingType(docType);
        try {
            const updated = await new UpdatePosDocSeriesCommand().execute(docType, {
                prefix: String(d.prefix || ''),
                separator: String(d.separator ?? ''),
                includePeriod: !!d.includePeriod,
                resetMode: String(d.resetMode || 'CONTINUOUS'),
                padding: Number(d.padding) || 0,
                suffix: String(d.suffix || ''),
            });
            setSeries(prev => prev.map(s => (s.docType === docType ? updated : s)));
            setDraft(prev => ({ ...prev, [docType]: { ...updated } }));
            setBanner({
                tone: 'ok',
                text: `${LABELS[docType] || docType} saved. Next number will be ${updated.example}.`,
            });
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        } finally {
            setSavingType('');
        }
    }, [draft]);

    const ordered = useMemo(
        () => [...series].sort((a, b) =>
            Object.keys(LABELS).indexOf(a.docType) - Object.keys(LABELS).indexOf(b.docType)),
        [series],
    );

    return (
        <Page>
            <PageHeader
                icon={Hash}
                title="Document Numbering"
                subtitle="How each document series is numbered. Numbers already issued are never changed."
                actions={<Button variant="default" icon={RefreshCw} onClick={load} loading={loading}>Reload</Button>}
            />
            <PageBody>
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                {!loading && ordered.length === 0 && (
                    <EmptyState icon={Hash} title="No series found"
                        message="The server had no numbering series to return." />
                )}

                {ordered.map(s => {
                    const d = draft[s.docType] || s;
                    const changed = dirty(s.docType);
                    return (
                        <Card key={s.docType} className="shrink-0" title={LABELS[s.docType] || s.docType}>
                            <div className="flex flex-wrap items-end gap-3">
                                <Field label="Prefix" hint="Leave blank for a bare number">
                                    <Input className="!w-28" value={d.prefix || ''}
                                        onChange={e => set(s.docType, 'prefix', e.target.value)} />
                                </Field>

                                <Field label="Separator">
                                    <Select className="!w-32" value={d.separator ?? ''}
                                        onChange={e => set(s.docType, 'separator', e.target.value)}>
                                        {SEP_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
                                    </Select>
                                </Field>

                                <Field label="Restarts">
                                    <Select className="!w-56" value={d.resetMode || 'CONTINUOUS'}
                                        onChange={e => set(s.docType, 'resetMode', e.target.value)}>
                                        {RESET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </Select>
                                </Field>

                                <Field label="Digits">
                                    <Select className="!w-44" value={String(d.padding ?? 0)}
                                        onChange={e => set(s.docType, 'padding', e.target.value)}>
                                        {PAD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </Select>
                                </Field>

                                <Field label="Show period"
                                    hint={d.resetMode === 'CONTINUOUS' ? 'Not used when the series never restarts' : undefined}>
                                    <label className="flex items-center gap-2 h-[32px] text-[12.5px] cursor-pointer text-[var(--pos-ink-2)]">
                                        <input type="checkbox"
                                            disabled={d.resetMode === 'CONTINUOUS'}
                                            checked={!!d.includePeriod}
                                            onChange={e => set(s.docType, 'includePeriod', e.target.checked)}
                                            className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                        in the number
                                    </label>
                                </Field>

                                <div className="ml-auto flex items-end gap-3">
                                    <div>
                                        <div className="text-[10.5px] uppercase tracking-wide text-[var(--pos-ink-3)] mb-1">
                                            {changed ? 'Will look like' : 'Next number'}
                                        </div>
                                        <div className="text-[15px] font-bold text-[var(--pos-ink)]"
                                            style={{ fontFamily: 'var(--pos-mono)' }}>
                                            {changed ? previewOf(d) : s.example}
                                        </div>
                                    </div>
                                    <Button variant="primary" icon={Save} disabled={!changed}
                                        loading={savingType === s.docType}
                                        onClick={() => save(s.docType)}>Save</Button>
                                </div>
                            </div>
                        </Card>
                    );
                })}
            </PageBody>
        </Page>
    );
}
