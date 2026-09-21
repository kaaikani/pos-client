"use client";
/**
 * Tax Master — the GST rates every item and bill is taxed with.
 *
 * The screen this replaces saved to `localStorage` under the key `master_tax`,
 * so the rates lived in one browser: clearing the cache lost them, and no other
 * terminal or user could see them. Meanwhile a complete server API had existed
 * all along, unused. This screen uses it.
 *
 * The server owns the rules and this screen only surfaces them:
 *   - a duplicate ACTIVE code is refused
 *   - a rate referenced by any active item cannot be edited or removed
 *   - "delete" cancels the row (status CANCELLED); bills already taxed with it
 *     keep their tax, which is why nothing is ever hard-deleted here
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Percent, RefreshCw, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import {
    ListTaxMastersQuery, CreateTaxMasterCommand,
    UpdateTaxMasterCommand, DeleteTaxMasterCommand,
} from '../../core/queries/pos.query';
import {
    Page, PageHeader, PageBody, HeaderStat, ListToolbar, Button, DataTable,
    Banner, EmptyState, Card, Field, Input, Select, FormGrid, Badge,
    useConfirm, useFieldFlow,
} from '../../components/pos';
import { canDo, readSession } from '../../components/pos/permissions';

/** Mirrors the taxType union on the server entity. */
const TAX_TYPES = [
    { value: 'GST_EXCLUSIVE', label: 'GST — added to rate' },
    { value: 'GST_INCLUSIVE', label: 'GST — included in rate' },
    { value: 'IGST', label: 'IGST — inter-state' },
    { value: 'EXEMPT', label: 'Exempt / nil rated' },
    { value: 'CUSTOM', label: 'Custom' },
];
const TYPE_LABEL = Object.fromEntries(TAX_TYPES.map(t => [t.value, t.label]));

const BLANK = { code: '', name: '', ratePercent: '', taxType: 'GST_EXCLUSIVE', isDefault: false };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export default function TaxMasterModule() {
    const session = useMemo(() => readSession(), []);
    const perms = session?.permissions;
    const mayEdit = canDo(perms, 'settings.update');
    const confirm = useConfirm();

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [banner, setBanner] = useState(null);

    const [form, setForm] = useState(BLANK);
    const [editId, setEditId] = useState(null);
    const [saving, setSaving] = useState(false);
    const codeRef = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await new ListTaxMastersQuery().execute();
            setRows((list || []).filter(r => r.status !== 'CANCELLED'));
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message || 'Could not load tax rates.' });
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const reset = useCallback(() => { setForm(BLANK); setEditId(null); }, []);

    const problem = useMemo(() => {
        if (!form.code.trim()) return 'Code is required.';
        if (!form.name.trim()) return 'Name is required.';
        if (form.ratePercent === '' || num(form.ratePercent) < 0) return 'Enter a rate of 0 or more.';
        if (num(form.ratePercent) > 100) return 'A tax rate cannot be above 100%.';
        const clash = rows.find(r =>
            r.code.trim().toLowerCase() === form.code.trim().toLowerCase() && String(r.id) !== String(editId));
        if (clash) return `Code "${form.code.trim()}" is already used by ${clash.name}.`;
        return null;
    }, [form, rows, editId]);

    const save = useCallback(async () => {
        if (problem) { setBanner({ tone: 'warn', text: problem }); return; }
        const payload = {
            code: form.code.trim(),
            name: form.name.trim(),
            ratePercent: num(form.ratePercent),
            taxType: form.taxType,
            isDefault: !!form.isDefault,
        };
        setSaving(true);
        try {
            if (editId) {
                await new UpdateTaxMasterCommand().execute(editId, payload);
                setBanner({ tone: 'ok', text: `${payload.name} updated.` });
            } else {
                await new CreateTaxMasterCommand().execute(payload);
                setBanner({ tone: 'ok', text: `${payload.name} added.` });
            }
            reset();
            await load();
            setTimeout(() => codeRef.current?.focus(), 0);
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message || 'Could not save the tax rate.' });
        }
        setSaving(false);
    }, [problem, form, editId, reset, load]);

    const flow = useFieldFlow(['code', 'name', 'ratePercent', 'taxType'], save);

    const edit = useCallback((r) => {
        setEditId(r.id);
        setForm({
            code: r.code || '',
            name: r.name || '',
            ratePercent: String(r.ratePercent ?? ''),
            taxType: r.taxType || 'GST_EXCLUSIVE',
            isDefault: !!r.isDefault,
        });
        setTimeout(() => codeRef.current?.focus(), 0);
    }, []);

    const remove = useCallback(async (r) => {
        const ok = await confirm({
            title: `Remove ${r.name}?`,
            message: 'The rate stops being offered on new items. Bills already taxed with it keep '
                   + 'their tax. The server refuses this if any active item still uses the rate.',
            confirmLabel: 'Remove',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await new DeleteTaxMasterCommand().execute(r.id);
            setBanner({ tone: 'ok', text: `${r.name} removed.` });
            if (String(editId) === String(r.id)) reset();
            await load();
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message || 'Could not remove the tax rate.' });
        }
    }, [confirm, editId, reset, load]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = q
            ? rows.filter(r => `${r.code} ${r.name} ${r.ratePercent}`.toLowerCase().includes(q))
            : rows;
        return [...list].sort((a, b) => num(a.ratePercent) - num(b.ratePercent));
    }, [rows, search]);

    const columns = [
        { key: 'code', header: 'Code', width: 110,
          render: (r) => <span className="code">{r.code}</span> },
        { key: 'name', header: 'Name', render: (r) => <strong>{r.name}</strong> },
        { key: 'ratePercent', header: 'Rate', width: 90, align: 'right', className: 'num',
          render: (r) => `${num(r.ratePercent)}%` },
        { key: 'taxType', header: 'Type', width: 200,
          render: (r) => TYPE_LABEL[r.taxType] || r.taxType },
        { key: 'isDefault', header: 'Default', width: 90,
          render: (r) => (r.isDefault ? <Badge tone="accent">Default</Badge> : null) },
        {
            key: 'actions', header: '', width: 90, align: 'right',
            render: (r) => (
                <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" icon={Pencil}
                            onClick={() => edit(r)} title={`Edit ${r.name}`} disabled={!mayEdit} />
                    <Button size="sm" variant="ghost" icon={Trash2}
                            onClick={() => remove(r)} title={`Remove ${r.name}`} disabled={!mayEdit} />
                </div>
            ),
        },
    ];

    return (
        <Page>
            <PageHeader
                icon={Percent}
                title="Tax Master"
                subtitle="GST rates available to items and bills"
                meta={<HeaderStat label="Rates" value={rows.length} />}
                actions={<Button variant="ghost" icon={RefreshCw} onClick={load} title="Refresh" />}
            />
            <PageBody className="flex flex-col gap-4">
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                <Card className="shrink-0" title={editId ? 'Edit rate' : 'Add rate'}>
                    <FormGrid cols={4}>
                        <Field label="Code" required hint="Short, unique — e.g. GST18">
                            <Input {...flow.field('code')} ref={codeRef}
                                   value={form.code}
                                   onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                                   placeholder="GST18" disabled={!mayEdit} />
                        </Field>
                        <Field label="Name" required>
                            <Input {...flow.field('name')} value={form.name}
                                   onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                   placeholder="GST 18%" disabled={!mayEdit} />
                        </Field>
                        <Field label="Rate %" required>
                            <Input {...flow.field('ratePercent')} numeric type="number"
                                   min="0" max="100" step="0.01"
                                   value={form.ratePercent}
                                   onChange={e => setForm(f => ({ ...f, ratePercent: e.target.value }))}
                                   placeholder="18" disabled={!mayEdit} />
                        </Field>
                        <Field label="Type" required>
                            <Select {...flow.field('taxType')} value={form.taxType}
                                    onChange={e => setForm(f => ({ ...f, taxType: e.target.value }))}
                                    disabled={!mayEdit}>
                                {TAX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </Select>
                        </Field>
                    </FormGrid>

                    <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                        <label className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--pos-ink-2)]">
                            <input type="checkbox" name="isDefaultTax" checked={form.isDefault}
                                   disabled={!mayEdit}
                                   onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                                   className="pos-focusable accent-[var(--pos-ink-2)] w-[14px] h-[14px]" />
                            Use as the default rate for new items
                        </label>
                        <div className="flex items-center gap-2">
                            {problem && form.code && (
                                <span className="text-[12px] font-medium text-[var(--pos-warn)]">{problem}</span>
                            )}
                            {editId && (
                                <Button variant="default" icon={X} onClick={reset}>Cancel</Button>
                            )}
                            <Button variant="primary" icon={editId ? Check : Plus}
                                    loading={saving} disabled={!!problem || !mayEdit} onClick={save}>
                                {editId ? 'Update rate' : 'Add rate'}
                            </Button>
                        </div>
                    </div>
                </Card>

                <ListToolbar
                    search={search}
                    onSearch={setSearch}
                    placeholder="Search code, name or rate…"
                    count={shown.length}
                    countLabel="rates"
                />

                <DataTable
                    columns={columns}
                    rows={shown}
                    loading={loading}
                    onActivate={mayEdit ? edit : undefined}
                    empty={
                        <EmptyState
                            icon={Percent}
                            title="No tax rates yet"
                            hint="Add the rates this business bills at — GST 0%, 5%, 12%, 18%, 28%."
                        />
                    }
                />

            </PageBody>
        </Page>
    );
}
