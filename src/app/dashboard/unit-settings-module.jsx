"use client";
/**
 * Unit master and weighing-scale barcode settings.
 *
 * Two things live together here because they are the same subject: what a
 * quantity means.
 *
 *  - The unit master decides how units convert. For weight, volume and length
 *    the conversion is universal — one kilogram is a thousand grams for sugar,
 *    for cement and for anything else — so the factor lives here and an item
 *    cannot contradict it. Packaging units carry no factor: how much a box
 *    holds differs per item and stays on the item.
 *
 *  - The scale settings decode the sticker a weighing scale prints. Those
 *    barcodes carry the weight inside them, so every sticker differs and an
 *    exact lookup can never resolve one.
 *
 * Both are off-by-default and safe: scale decoding is only tried after every
 * ordinary barcode lookup has failed, so switching it on cannot change what an
 * existing code means.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Ruler, Save, RefreshCw, Plus, ScanLine } from 'lucide-react';
import {
    PosUnitsQuery, CreatePosUnitCommand, CancelPosUnitCommand,
    PosSettingQuery, UpdatePosSettingCommand,
} from '../../core/queries/pos.query';
import {
    Page, PageHeader, PageBody, Card, Field, Input, Select, Button, Banner,
    DataTable, useConfirm, useModule, useFormFlow,
} from '../../components/pos';

const KINDS = [
    { value: 'WEIGHT', label: 'Weight — conversion fixed by the master' },
    { value: 'VOLUME', label: 'Volume — conversion fixed by the master' },
    { value: 'LENGTH', label: 'Length — conversion fixed by the master' },
    { value: 'COUNT', label: 'Count — whole pieces' },
    { value: 'PACK', label: 'Packaging — how much it holds is set per item' },
];

const blankUnit = () => ({ code: '', name: '', symbol: '', kind: 'PACK', factor: '1', decimals: '0' });

export default function UnitSettingsModule() {
    const confirm = useConfirm();

    // A business that never weighs anything has no use for scale settings, and
    // the server ignores them for it in any case.
    const scaleOn = useModule('scaleBarcode');

    const [units, setUnits] = useState([]);
    const [setting, setSetting] = useState(null);
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [banner, setBanner] = useState(null);
    const [probe, setProbe] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [u, s] = await Promise.all([
                new PosUnitsQuery().execute(),
                new PosSettingQuery().execute(),
            ]);
            setUnits(u);
            setSetting(s);
            setBanner(null);
        } catch (e) {
            setBanner({ tone: 'danger', text: `Could not load: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const setS = (k, v) => setSetting(p => ({ ...p, [k]: v }));

    const saveSetting = useCallback(async () => {
        if (!setting) return;
        setSaving(true);
        try {
            const saved = await new UpdatePosSettingCommand().execute({
                scaleBarcodeEnabled: !!setting.scaleBarcodeEnabled,
                scaleBarcodePrefixes: String(setting.scaleBarcodePrefixes || ''),
                scaleBarcodeValueType: String(setting.scaleBarcodeValueType || 'WEIGHT'),
                scaleBarcodePluDigits: Number(setting.scaleBarcodePluDigits) || 0,
                scaleBarcodeValueDigits: Number(setting.scaleBarcodeValueDigits) || 0,
                scaleBarcodeDivisor: Number(setting.scaleBarcodeDivisor) || 1,
                allowRateEdit: !!setting.allowRateEdit,
                rateEditTolerancePaise: Number(setting.rateEditTolerancePaise) || 0,
            });
            setSetting(saved);
            setBanner({ tone: 'ok', text: 'Settings saved.' });
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        } finally {
            setSaving(false);
        }
    }, [setting]);

    // The draft row appears only after "Add unit", and the cursor follows it
    // there. Enter past the last box saves the unit.
    const unitFlow = useFormFlow(() => addUnit());

    const addUnit = useCallback(async () => {
        if (!draft) return;
        if (!String(draft.code).trim() || !String(draft.name).trim()) {
            setBanner({ tone: 'warn', text: 'Code and name are both required.' });
            return;
        }
        setSaving(true);
        try {
            const created = await new CreatePosUnitCommand().execute({
                code: String(draft.code).trim().toUpperCase(),
                name: String(draft.name).trim(),
                symbol: String(draft.symbol || '').trim(),
                kind: draft.kind,
                factor: Number(draft.factor) || 1,
                decimals: Number(draft.decimals) || 0,
            });
            setUnits(prev => [...prev, created]);
            setDraft(null);
            setBanner({ tone: 'ok', text: `Unit ${created.code} added.` });
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        } finally {
            setSaving(false);
        }
    }, [draft]);

    const removeUnit = useCallback(async (u) => {
        const ok = await confirm({
            title: `Remove unit ${u.code}?`,
            message: 'The unit is cancelled and kept, so documents that already use it still read correctly. '
                + 'It stops being offered on new entries.',
            confirmLabel: 'Remove', tone: 'danger',
        });
        if (!ok) return;
        try {
            await new CancelPosUnitCommand().execute(u.id);
            setUnits(prev => prev.filter(x => String(x.id) !== String(u.id)));
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        }
    }, [confirm]);

    /**
     * Decodes a pasted barcode with the settings currently on screen, using the
     * same rules the server uses, so the operator can check a real sticker
     * before switching the feature on.
     */
    const probeResult = (() => {
        const code = String(probe || '').trim();
        if (!code || !setting) return null;
        if (!/^\d{13}$/.test(code)) return { ok: false, text: 'Not a 13-digit barcode.' };
        const prefixes = String(setting.scaleBarcodePrefixes || '')
            .split(/[,\s]+/).map(p => p.trim()).filter(p => /^\d{1,3}$/.test(p));
        const prefix = prefixes.find(p => code.startsWith(p));
        if (!prefix) return { ok: false, text: `Prefix does not match ${prefixes.join(', ') || '(none set)'}.` };
        const plu = Number(setting.scaleBarcodePluDigits) || 0;
        const val = Number(setting.scaleBarcodeValueDigits) || 0;
        if (prefix.length + plu + val + 1 !== 13) {
            return { ok: false, text: `Digits do not add up: ${prefix.length} prefix + ${plu} PLU + ${val} value + 1 check must be 13.` };
        }
        const pluNo = parseInt(code.slice(prefix.length, prefix.length + plu), 10);
        const raw = parseInt(code.slice(prefix.length + plu, prefix.length + plu + val), 10);
        const div = Number(setting.scaleBarcodeDivisor) || 1;
        const value = Math.round((raw / div) * 1000) / 1000;
        if (!(pluNo > 0)) return { ok: false, text: 'PLU reads as zero.' };
        if (!(raw > 0)) return { ok: false, text: 'Weight or price reads as zero.' };
        return {
            ok: true,
            text: `PLU ${pluNo} — ${value} ${setting.scaleBarcodeValueType === 'PRICE' ? '(amount)' : '(quantity)'}`,
        };
    })();

    const columns = [
        { key: 'code', header: 'Code', width: 90,
          render: (u) => <span className="font-semibold" style={{ fontFamily: 'var(--pos-mono)' }}>{u.code}</span> },
        { key: 'name', header: 'Name' },
        { key: 'kind', header: 'Measures', width: 130,
          render: (u) => <span className="text-[var(--pos-ink-2)]">{(u.kind || 'PACK').toLowerCase()}</span> },
        { key: 'factor', header: 'Factor', width: 100, align: 'right',
          render: (u) => (u.kind === 'PACK' ? <span className="text-[var(--pos-ink-3)]">per item</span>
            : <span style={{ fontFamily: 'var(--pos-mono)' }}>{u.factor}</span>) },
        { key: 'decimals', header: 'Decimals', width: 90, align: 'right',
          render: (u) => <span style={{ fontFamily: 'var(--pos-mono)' }}>{u.decimals}</span> },
        { key: 'act', header: '', width: 90,
          render: (u) => <Button variant="ghost" size="sm" onClick={() => removeUnit(u)}>Remove</Button> },
    ];

    return (
        <Page>
            <PageHeader
                icon={Ruler}
                title="Units & Weighing Scale"
                subtitle="How quantities convert, and how a scale sticker is read."
                actions={<Button variant="default" icon={RefreshCw} onClick={load} loading={loading}>Reload</Button>}
            />
            <PageBody>
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                <Card className="shrink-0" title="Unit Master"
                    subtitle="Weight, volume and length convert the same way for every item. Packaging is set per item."
                    actions={!draft && (
                        <Button variant="default" icon={Plus} onClick={() => setDraft(blankUnit())}>Add unit</Button>
                    )}>
                    {draft && (
                        <div ref={unitFlow.ref} className="flex flex-wrap items-end gap-3 mb-3">
                            <Field label="Code" required>
                                <Input className="!w-24" value={draft.code}
                                    onChange={e => setDraft(d => ({ ...d, code: e.target.value }))} />
                            </Field>
                            <Field label="Name" required>
                                <Input className="!w-44" value={draft.name}
                                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
                            </Field>
                            <Field label="Symbol">
                                <Input className="!w-24" value={draft.symbol}
                                    onChange={e => setDraft(d => ({ ...d, symbol: e.target.value }))} />
                            </Field>
                            <Field label="Measures">
                                <Select className="!w-72" value={draft.kind}
                                    onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}>
                                    {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                                </Select>
                            </Field>
                            <Field label="Factor"
                                hint={draft.kind === 'PACK' ? 'Not used for packaging' : 'How many of the smallest unit — GM 1, KG 1000'}>
                                <Input className="!w-28" type="number" step="any" min="0"
                                    disabled={draft.kind === 'PACK'} value={draft.factor}
                                    onChange={e => setDraft(d => ({ ...d, factor: e.target.value }))} />
                            </Field>
                            <Field label="Decimals" hint="0 for whole numbers">
                                <Input className="!w-24" type="number" min="0" max="6" value={draft.decimals}
                                    onChange={e => setDraft(d => ({ ...d, decimals: e.target.value }))} />
                            </Field>
                            <div className="flex gap-2">
                                <Button variant="primary" icon={Save} loading={saving} onClick={addUnit}>Add</Button>
                                <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                            </div>
                        </div>
                    )}

                    <DataTable columns={columns} rows={units} loading={loading} rowKey={(u) => u.id}
                        empty="No units configured." />
                </Card>

                {scaleOn && (
                <Card className="shrink-0" title="Weighing Scale Barcode"
                    subtitle="Off by default. Tried only after an ordinary barcode lookup finds nothing.">
                    <div className="flex flex-wrap items-end gap-3">
                        <Field label="Enabled">
                            <label className="flex items-center gap-2 h-[32px] text-[12.5px] cursor-pointer text-[var(--pos-ink-2)]">
                                <input type="checkbox" checked={!!setting?.scaleBarcodeEnabled}
                                    onChange={e => setS('scaleBarcodeEnabled', e.target.checked)}
                                    className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                read scale stickers
                            </label>
                        </Field>
                        <Field label="Prefixes" hint="Comma separated, e.g. 21,22">
                            <Input className="!w-28" value={setting?.scaleBarcodePrefixes ?? ''}
                                onChange={e => setS('scaleBarcodePrefixes', e.target.value)} />
                        </Field>
                        <Field label="Value is">
                            <Select className="!w-40" value={setting?.scaleBarcodeValueType || 'WEIGHT'}
                                onChange={e => setS('scaleBarcodeValueType', e.target.value)}>
                                <option value="WEIGHT">Weight — fills quantity</option>
                                <option value="PRICE">Price — fills amount</option>
                            </Select>
                        </Field>
                        <Field label="PLU digits">
                            <Input className="!w-24" type="number" min="1" max="10"
                                value={setting?.scaleBarcodePluDigits ?? ''}
                                onChange={e => setS('scaleBarcodePluDigits', e.target.value)} />
                        </Field>
                        <Field label="Value digits">
                            <Input className="!w-24" type="number" min="1" max="10"
                                value={setting?.scaleBarcodeValueDigits ?? ''}
                                onChange={e => setS('scaleBarcodeValueDigits', e.target.value)} />
                        </Field>
                        <Field label="Divide by" hint="1000 for grams to KG, 100 for paise">
                            <Input className="!w-28" type="number" min="1"
                                value={setting?.scaleBarcodeDivisor ?? ''}
                                onChange={e => setS('scaleBarcodeDivisor', e.target.value)} />
                        </Field>
                        <Button variant="primary" icon={Save} loading={saving} onClick={saveSetting}>Save</Button>
                    </div>

                    <div className="mt-4 pt-3 border-t border-[var(--pos-line-soft)]">
                        <Field label="Test a sticker"
                            hint="Scan or paste a barcode from your scale to see how it would be read">
                            <div className="flex items-center gap-3">
                                <Input className="!w-56" placeholder="13 digits" value={probe}
                                    onChange={e => setProbe(e.target.value)} />
                                {probeResult && (
                                    <span className={`text-[12.5px] font-semibold ${probeResult.ok ? 'text-[var(--pos-ok)]' : 'text-[var(--pos-danger)]'}`}>
                                        <ScanLine size={13} className="inline mr-1" />
                                        {probeResult.text}
                                    </span>
                                )}
                            </div>
                        </Field>
                    </div>
                </Card>
                )}

                <Card className="shrink-0" title="Rate Editing"
                    subtitle="Whether the till may type over the price list. The server enforces this too.">
                    <div className="flex flex-wrap items-end gap-3">
                        <Field label="Allow editing">
                            <label className="flex items-center gap-2 h-[32px] text-[12.5px] cursor-pointer text-[var(--pos-ink-2)]">
                                <input type="checkbox" checked={setting?.allowRateEdit !== false}
                                    onChange={e => setS('allowRateEdit', e.target.checked)}
                                    className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                cashier may change the rate on a bill
                            </label>
                        </Field>
                        <Field label="Tolerance (paise)" hint="Allowed rounding difference when editing is off">
                            <Input className="!w-28" type="number" min="0"
                                value={setting?.rateEditTolerancePaise ?? ''}
                                onChange={e => setS('rateEditTolerancePaise', e.target.value)} />
                        </Field>
                        <Button variant="primary" icon={Save} loading={saving} onClick={saveSetting}>Save</Button>
                    </div>
                </Card>
            </PageBody>
        </Page>
    );
}
