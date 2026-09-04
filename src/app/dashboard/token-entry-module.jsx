"use client";
/**
 * Token Entry — list-first record module.
 *
 * LIST is the landing view: today's tokens, searchable, with the day's totals in
 * the header. "+ New Token" opens the entry form. Clicking a row opens that token.
 *
 * The counter's real job here is watching the queue, not filling a form — so the
 * queue gets the screen and the form is one keystroke away.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Hash, Plus, Save, Printer, Trash2, RefreshCw, X, Users, CalendarDays } from 'lucide-react';
import { ListTokensQuery, CreateTokenCommand, DeleteTokenCommand } from '../../core/queries/pharma.query';
import {
    Page, PageHeader, PageBody, ActionBar, HeaderStat, ListToolbar, FormHeader, FormSection,
    FormGrid, Field, Input, Button, DataTable, Banner, EmptyState, Badge, TotalsPanel,
    ShortcutHints, useFieldFlow, useConfirm, money,
} from '../../components/pos';

const today = () => new Date().toISOString().split('T')[0];
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export default function TokenEntryModule() {
    const confirm = useConfirm();

    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [banner, setBanner] = useState(null);

    const [view, setView] = useState('list');           // 'list' | 'form'
    const [viewDate, setViewDate] = useState(today);
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);

    const [form, setForm] = useState({
        tokenDate: today(), tokenNo: '', patientName: '', cellNo: '', address: '', amount: '', injAmt: '',
    });
    const [editingId, setEditingId] = useState(null);

    const total = num(form.amount) + num(form.injAmt);
    const set = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);

    /* ── data ───────────────────────────────────────────── */

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            setTokens(await new ListTokensQuery().execute());
        } catch (e) {
            setBanner({ tone: 'danger', text: `Could not load tokens: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const dayTokens = useMemo(() => {
        const q = search.trim().toLowerCase();
        return tokens
            .filter(t => t.tokenDate === viewDate)
            .filter(t => !q || [t.patientName, t.cellNo, t.tokenNo].some(f => String(f || '').toLowerCase().includes(q)))
            .sort((a, b) => (b.tokenNo || 0) - (a.tokenNo || 0));
    }, [tokens, viewDate, search]);

    const dayTotal = useMemo(() => dayTokens.reduce((s, t) => s + num(t.total), 0), [dayTokens]);
    const nextTokenNo = useCallback(
        (forDate) => String(tokens.filter(t => t.tokenDate === forDate).length + 1),
        [tokens],
    );

    /* ── form ───────────────────────────────────────────── */

    const openNew = useCallback(() => {
        setForm({ tokenDate: viewDate, tokenNo: nextTokenNo(viewDate), patientName: '', cellNo: '', address: '', amount: '', injAmt: '' });
        setEditingId(null);
        setBanner(null);
        setView('form');
    }, [viewDate, nextTokenNo]);

    const openRecord = useCallback((t) => {
        setForm({
            tokenDate: t.tokenDate, tokenNo: String(t.tokenNo), patientName: t.patientName || '',
            cellNo: t.cellNo || '', address: t.address || '',
            amount: t.amount ? String(t.amount) : '', injAmt: t.injAmt ? String(t.injAmt) : '',
        });
        setEditingId(t.id);
        setBanner(null);
        setView('form');
    }, []);

    const backToList = useCallback(() => { setView('list'); setBanner(null); }, []);

    const handleSave = useCallback(async () => {
        if (editingId) {
            setBanner({ tone: 'warn', text: 'Saved tokens cannot be edited — delete it and issue a new one.' });
            return;
        }
        if (!String(form.patientName).trim()) {
            setBanner({ tone: 'warn', text: 'Customer name is required.' });
            flowRef.current?.focus('patientName');
            return;
        }
        setSaving(true);
        setBanner(null);
        try {
            await new CreateTokenCommand().execute({
                tokenNo: parseInt(form.tokenNo, 10) || 1,
                tokenDate: form.tokenDate,
                tokenTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
                patientName: String(form.patientName).trim(),
                address: String(form.address).trim(),
                cellNo: String(form.cellNo).trim(),
                amount: num(form.amount),
                injAmt: num(form.injAmt),
                total,
            });
            await loadAll();
            setViewDate(form.tokenDate);
            setView('list');
            setBanner({ tone: 'ok', text: `Token ${form.tokenNo} issued to ${String(form.patientName).trim()}.` });
        } catch (err) {
            setBanner({ tone: 'danger', text: err.message });
        } finally {
            setSaving(false);
        }
    }, [form, total, editingId, loadAll]);

    const flow = useFieldFlow(['patientName', 'cellNo', 'address', 'amount', 'injAmt'], handleSave);
    const flowRef = React.useRef(flow);
    flowRef.current = flow;
    useEffect(() => { if (view === 'form') flow.first(); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDelete = useCallback(async (rec) => {
        const t = rec || tokens.find(x => x.id === selectedId);
        if (!t) { setBanner({ tone: 'warn', text: 'Select a token first.' }); return; }
        const ok = await confirm({
            title: 'Delete token?',
            message: `Token ${t.tokenNo} — ${t.patientName}\n${money(t.total)}\n\nThis cannot be undone.`,
            confirmLabel: 'Delete', tone: 'danger',
        });
        if (!ok) return;
        try {
            await new DeleteTokenCommand().execute(t.id);
            await loadAll();
            setSelectedId(null);
            setView('list');
            setBanner({ tone: 'ok', text: `Token ${t.tokenNo} deleted.` });
        } catch (err) {
            setBanner({ tone: 'danger', text: err.message });
        }
    }, [tokens, selectedId, confirm, loadAll]);

    const printSlip = useCallback((src) => {
        const t = src || form;
        const name = String(t.patientName || '').trim();
        if (!name) { setBanner({ tone: 'warn', text: 'Enter the customer details before printing.' }); return; }
        const amt = num(t.amount) + num(t.injAmt);
        const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const w = window.open('', '', 'width=380,height=520');
        if (!w) { setBanner({ tone: 'warn', text: 'The print window was blocked. Allow pop-ups for this site.' }); return; }
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Token ${esc(t.tokenNo)}</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;padding:22px;text-align:center;max-width:300px;margin:0 auto;color:#16242B}
.b{font-weight:800;letter-spacing:.16em;font-size:18px}.s{font-size:9.5px;color:#7C8E96;letter-spacing:.18em;margin-top:3px}
hr{margin:13px 0;border:0;border-top:1px dashed #C8D2D6}
.t{font-size:52px;font-weight:800;line-height:1;color:#0A6E7A;margin:6px 0}
.n{font-size:13px;font-weight:700;margin-top:8px}.m{font-size:11px;color:#4A5C64;margin-top:2px}
.a{font-size:17px;font-weight:800;margin-top:12px}.f{font-size:9px;color:#7C8E96}
</style></head><body onload="window.print();window.close()">
<div class="b">AVS ECOM</div><div class="s">POINT OF SALE</div><hr>
<div class="s" style="letter-spacing:.14em">TOKEN</div><div class="t">${esc(t.tokenNo)}</div>
<div class="n">${esc(name)}</div>
${t.cellNo ? `<div class="m">${esc(t.cellNo)}</div>` : ''}
${t.address ? `<div class="m">${esc(t.address)}</div>` : ''}
<div class="m">${esc(t.tokenDate)}</div>
${amt > 0 ? `<div class="a">₹${amt.toFixed(2)}</div>` : ''}
<hr><div class="f">Thank You!</div></body></html>`);
        w.document.close();
    }, [form]);

    const columns = useMemo(() => [
        { key: 'tokenNo', header: 'Token', width: 76, align: 'right',
          render: (t) => <span className="font-bold text-[var(--pos-ink)]" style={{ fontFamily: 'var(--pos-mono)' }}>{t.tokenNo}</span> },
        { key: 'tokenTime', header: 'Time', width: 92,
          render: (t) => <span className="text-[var(--pos-ink-3)]">{t.tokenTime || '—'}</span> },
        { key: 'patientName', header: 'Customer',
          render: (t) => (
            <div className="min-w-0">
                <div className="font-semibold truncate">{t.patientName}</div>
                {t.address && <div className="text-[11px] text-[var(--pos-ink-3)] truncate">{t.address}</div>}
            </div>
          ) },
        { key: 'cellNo', header: 'Mobile', width: 125,
          render: (t) => t.cellNo || <span className="text-[var(--pos-ink-3)]">—</span> },
        { key: 'amount', header: 'Amount', width: 105, align: 'right',
          render: (t) => <span className="text-[var(--pos-ink-2)]">{money(t.amount)}</span> },
        { key: 'injAmt', header: 'Extra', width: 100, align: 'right',
          render: (t) => <span className="text-[var(--pos-ink-2)]">{money(t.injAmt)}</span> },
        { key: 'total', header: 'Total', width: 115, align: 'right',
          render: (t) => <span className="font-bold">{money(t.total)}</span> },
        { key: 'act', header: '', width: 44, align: 'center',
          render: (t) => (
            <button type="button" title="Print slip"
                onClick={(e) => { e.stopPropagation(); printSlip(t); }}
                className="pos-focusable grid place-items-center w-6 h-6 rounded text-[var(--pos-ink-3)] hover:text-[var(--pos-ink)] hover:bg-[var(--pos-hover)]">
                <Printer size={13} />
            </button>
          ) },
    ], [printSlip]);

    /* ── render: FORM ───────────────────────────────────── */

    if (view === 'form') {
        return (
            <Page>
                <FormHeader
                    onBack={backToList}
                    title={editingId ? `Token ${form.tokenNo}` : 'New Token'}
                    subtitle={editingId ? form.patientName : `Issuing token ${form.tokenNo} for ${form.tokenDate}`}
                    badge={editingId ? <Badge tone="neutral">Issued</Badge> : <Badge tone="ok">New</Badge>}
                    actions={<>
                        <Button variant="default" icon={Printer} onClick={() => printSlip()}>Print</Button>
                        {editingId
                            ? <Button variant="danger" icon={Trash2} onClick={() => handleDelete(tokens.find(x => x.id === editingId))}>Delete</Button>
                            : <Button variant="primary" icon={Save} loading={saving} onClick={handleSave}>Issue Token</Button>}
                    </>}
                />
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                <PageBody>
                    <div className="max-w-[760px] mx-auto bg-[var(--pos-surface)] border border-[var(--pos-line)] rounded-[var(--pos-r-lg)] shadow-[var(--pos-shadow)] px-6 py-5">
                        <FormSection title="Token">
                            <FormGrid cols={2}>
                                <Field label="Date">
                                    <Input type="date" value={form.tokenDate} disabled={!!editingId}
                                        onChange={e => { set('tokenDate', e.target.value); set('tokenNo', nextTokenNo(e.target.value)); }} />
                                </Field>
                                <Field label="Token No" hint="Auto-numbered per day">
                                    <Input numeric value={form.tokenNo} disabled={!!editingId}
                                        onChange={e => set('tokenNo', e.target.value)} />
                                </Field>
                            </FormGrid>
                        </FormSection>

                        <FormSection title="Customer">
                            <FormGrid cols={2}>
                                <Field label="Name" required span={2}>
                                    <Input {...flow.field('patientName')} value={form.patientName} disabled={!!editingId}
                                        onChange={e => set('patientName', e.target.value)} placeholder="Full name" autoComplete="off" />
                                </Field>
                                <Field label="Mobile">
                                    <Input {...flow.field('cellNo')} value={form.cellNo} inputMode="numeric" disabled={!!editingId}
                                        onChange={e => set('cellNo', e.target.value)} placeholder="10-digit number" autoComplete="off" />
                                </Field>
                                <Field label="Address">
                                    <Input {...flow.field('address')} value={form.address} disabled={!!editingId}
                                        onChange={e => set('address', e.target.value)} placeholder="Optional" autoComplete="off" />
                                </Field>
                            </FormGrid>
                        </FormSection>

                        <FormSection title="Charges">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                                <FormGrid cols={2}>
                                    <Field label="Amount">
                                        <Input {...flow.field('amount')} numeric type="number" step="any" min="0" disabled={!!editingId}
                                            value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" />
                                    </Field>
                                    <Field label="Extra Charge" hint={editingId ? undefined : 'Enter here issues the token'}>
                                        <Input {...flow.field('injAmt')} numeric type="number" step="any" min="0" disabled={!!editingId}
                                            value={form.injAmt} onChange={e => set('injAmt', e.target.value)} placeholder="0.00" />
                                    </Field>
                                </FormGrid>
                                <TotalsPanel
                                    rows={[
                                        { label: 'Amount', value: money(form.amount) },
                                        { label: 'Extra charge', value: money(form.injAmt) },
                                    ]}
                                    grand={{ label: 'Total', value: money(total) }}
                                />
                            </div>
                        </FormSection>
                    </div>
                </PageBody>

                <ActionBar left={<ShortcutHints items={[['Enter', 'next field'], ['Shift+Enter', 'previous'], ['Esc', 'close dialogs']]} />}>
                    <Button variant="default" icon={X} onClick={backToList}>Cancel</Button>
                    {!editingId && <Button variant="primary" icon={Save} loading={saving} onClick={handleSave}>Issue Token</Button>}
                </ActionBar>
            </Page>
        );
    }

    /* ── render: LIST ───────────────────────────────────── */

    return (
        <Page>
            <PageHeader
                icon={Hash}
                title="Token Entry"
                subtitle="Counter queue and token slips"
                meta={<>
                    <HeaderStat label="Tokens" value={dayTokens.length} />
                    <HeaderStat label="Collected" value={money(dayTotal)} tone="ok" />
                </>}
                actions={<>
                    <Button variant="default" icon={RefreshCw} onClick={loadAll} disabled={loading}>Refresh</Button>
                    <Button variant="primary" icon={Plus} onClick={openNew}>New Token</Button>
                </>}
            />

            {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

            <ListToolbar
                search={search}
                onSearch={setSearch}
                placeholder="Search by name, mobile or token no…"
                count={dayTokens.length}
                countLabel={dayTokens.length === 1 ? 'token' : 'tokens'}
                filters={
                    <div className="flex items-center gap-1.5">
                        <CalendarDays size={14} className="text-[var(--pos-ink-3)]" />
                        <Input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)} className="!w-[150px]" />
                    </div>
                }
                actions={
                    selectedId
                        ? <Button variant="danger" size="sm" icon={Trash2} onClick={() => handleDelete()}>Delete</Button>
                        : <span className="text-[11.5px] text-[var(--pos-ink-3)]">Select a row to delete</span>
                }
            />

            <PageBody padded={false}>
                <DataTable
                    className="!border-0 !rounded-none h-full"
                    columns={columns}
                    rows={dayTokens}
                    loading={loading}
                    selectedKey={selectedId}
                    onSelect={(t) => setSelectedId(t.id)}
                    onActivate={openRecord}
                    empty={
                        search
                            ? <EmptyState icon={Users} title="No tokens match this search"
                                action={<Button variant="default" onClick={() => setSearch('')}>Clear search</Button>} />
                            : <EmptyState icon={Users} title={`No tokens on ${viewDate}`}
                                hint="Issue the first token of the day, or pick another date."
                                action={<Button variant="primary" icon={Plus} onClick={openNew}>New Token</Button>} />
                    }
                    footer={dayTokens.length ? (
                        <tr>
                            <td colSpan={6} className="text-right">Day Total</td>
                            <td className="num">{money(dayTotal)}</td>
                            <td />
                        </tr>
                    ) : null}
                />
            </PageBody>

            <ActionBar left={<ShortcutHints items={[['↑ ↓', 'move'], ['Enter', 'open token'], ['Print icon', 'reprint slip']]} />}>
                <Button variant="primary" icon={Plus} onClick={openNew}>New Token</Button>
            </ActionBar>
        </Page>
    );
}
