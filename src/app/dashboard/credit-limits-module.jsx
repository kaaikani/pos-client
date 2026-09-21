"use client";
/**
 * Credit limits.
 *
 * A B2B shop sells on credit to a few dozen regular buyers. What each is allowed
 * has always lived in the owner's head, which means the person actually ringing
 * the bill cannot see it — and by the time anyone notices, the money is out.
 *
 * The outstanding shown here is not stored twice. It is read from the ledger,
 * the same place the outstanding report reads, so the two can never disagree.
 *
 * Two rules worth knowing, because they read backwards otherwise:
 *
 *   A limit of 0 means NO CEILING, not no credit. A shop turning this on must
 *   not have every credit bill refused until someone has been round every buyer
 *   setting limits.
 *
 *   Blocking is how you actually stop a party's credit. It works whatever the
 *   limit says, and it still lets them buy for cash.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, Plus, Ban, Undo2, Save, Trash2 } from 'lucide-react';
import {
    Page, PageHeader, PageBody, Card, FormGrid, Field, Input, Button, Banner,
    DataTable, EmptyState, Badge, SearchInput, useConfirm, money, HeaderStat, usePageFocus, useFormFlow,
} from '../../components/pos';
import {
    PosPartyCreditsQuery, PosPartyCreditStatusQuery,
    SavePosPartyCreditCommand, RemovePosPartyCreditCommand,
} from '../../core/queries/pos.query';

const blank = () => ({
    partyName: '', contactNumber: '', creditLimit: '', creditDays: '30',
    blocked: false, blockReason: '', remarks: '',
});

export default function CreditLimitsModule() {
    const confirm = useConfirm();

    // Landing in the party box: this screen is opened to check one buyer.
    const searchRef = usePageFocus();
    // The form below still walks on Enter, but it does not steal the landing
    // focus — looking a party up is the commoner reason to be here.
    const flow = useFormFlow(() => save(), { autoFocus: false });

    const [rows, setRows] = useState([]);
    const [status, setStatus] = useState({});
    const [form, setForm] = useState(blank());
    const [editingId, setEditingId] = useState(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const list = await new PosPartyCreditsQuery().execute('CUSTOMER');
            setRows(list);
            setError('');
            // What each party actually owes right now. Read one at a time
            // because the ledger is the authority and there is no bulk read for
            // it; the list is a few dozen rows, not a few thousand.
            const out = {};
            await Promise.all(list.map(async r => {
                try {
                    out[r.id] = await new PosPartyCreditStatusQuery().execute(r.partyName, 'CUSTOMER');
                } catch { /* one party failing must not blank the whole screen */ }
            }));
            setStatus(out);
        } catch (e) {
            setError(e?.message || 'Could not load credit limits.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const edit = (r) => {
        setEditingId(r.id);
        setForm({
            partyName: r.partyName,
            contactNumber: r.contactNumber || '',
            creditLimit: String(r.creditLimit || ''),
            creditDays: String(r.creditDays ?? 30),
            blocked: !!r.blocked,
            blockReason: r.blockReason || '',
            remarks: r.remarks || '',
        });
    };

    const reset = () => { setEditingId(null); setForm(blank()); };

    const save = async () => {
        setError('');
        setNotice('');
        if (!form.partyName.trim()) { setError('Enter the party name, exactly as it appears on their bills.'); return; }
        setSaving(true);
        try {
            const saved = await new SavePosPartyCreditCommand().execute({
                type: 'CUSTOMER',
                partyName: form.partyName.trim(),
                contactNumber: form.contactNumber.trim(),
                creditLimit: Number(form.creditLimit) || 0,
                creditDays: Number(form.creditDays) || 0,
                blocked: !!form.blocked,
                blockReason: form.blockReason,
                remarks: form.remarks,
            });
            setNotice(
                Number(saved.creditLimit) > 0
                    ? `${saved.partyName} may owe up to ${money(saved.creditLimit)}.`
                    : `${saved.partyName} saved with no ceiling. Use Block to stop their credit.`,
            );
            reset();
            await load();
        } catch (e) {
            setError(e?.message || 'Could not save the credit limit.');
        } finally {
            setSaving(false);
        }
    };

    const toggleBlock = async (r) => {
        const blocking = !r.blocked;
        if (blocking) {
            const ok = await confirm({
                title: `Block credit for ${r.partyName}?`,
                message: 'Every credit bill for this party is refused until the block is released. Cash bills still go through.',
                confirmLabel: 'Block credit',
                tone: 'danger',
            });
            if (!ok) return;
        }
        try {
            await new SavePosPartyCreditCommand().execute({
                type: 'CUSTOMER',
                partyName: r.partyName,
                creditLimit: r.creditLimit,
                creditDays: r.creditDays,
                blocked: blocking,
                blockReason: blocking ? 'Blocked by operator' : '',
            });
            setNotice(`Credit ${blocking ? 'blocked' : 'released'} for ${r.partyName}.`);
            await load();
        } catch (e) {
            setError(e?.message || 'Could not change the block.');
        }
    };

    const remove = async (r) => {
        const ok = await confirm({
            title: `Remove the limit for ${r.partyName}?`,
            message: 'Their outstanding bills are untouched — only the ceiling goes. Without a rule they have no limit at all.',
            confirmLabel: 'Remove limit',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await new RemovePosPartyCreditCommand().execute(r.id);
            setNotice(`Limit removed for ${r.partyName}.`);
            await load();
        } catch (e) {
            setError(e?.message || 'Could not remove the limit.');
        }
    };

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r => (r.partyName || '').toLowerCase().includes(q));
    }, [rows, search]);

    const overCount = useMemo(
        () => shown.filter(r => {
            const st = status[r.id];
            return st && st.creditLimit > 0 && st.outstanding > st.creditLimit;
        }).length,
        [shown, status],
    );

    const columns = [
        { key: 'partyName', header: 'Party' },
        {
            key: 'creditLimit', header: 'Limit', width: 120, align: 'right',
            render: r => (Number(r.creditLimit) > 0 ? money(r.creditLimit) : 'No ceiling'),
        },
        {
            key: 'outstanding', header: 'Owes now', width: 120, align: 'right',
            render: r => money(status[r.id]?.outstanding ?? 0),
        },
        {
            key: 'available', header: 'Room left', width: 130, align: 'right',
            render: r => {
                const st = status[r.id];
                if (!st || st.available < 0) return <span className="text-[var(--pos-ink-3)]">—</span>;
                return st.available <= 0
                    ? <Badge tone="danger">{money(st.available)}</Badge>
                    : money(st.available);
            },
        },
        { key: 'creditDays', header: 'Days', width: 70, align: 'right' },
        {
            key: 'blocked', header: 'Status', width: 110, align: 'center',
            render: r => (r.blocked
                ? <Badge tone="danger">Blocked</Badge>
                : <Badge tone="ok">Allowed</Badge>),
        },
        {
            key: 'act', header: '', width: 200, align: 'center',
            render: r => (
                <span className="flex items-center justify-center gap-1">
                    <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); edit(r); }}>Edit</Button>
                    <Button size="sm" variant="ghost" icon={r.blocked ? Undo2 : Ban}
                        onClick={e => { e.stopPropagation(); toggleBlock(r); }}>
                        {r.blocked ? 'Release' : 'Block'}
                    </Button>
                    <Button size="sm" variant="ghost" icon={Trash2}
                        onClick={e => { e.stopPropagation(); remove(r); }} />
                </span>
            ),
        },
    ];

    return (
        <Page>
            <PageHeader
                icon={CreditCard}
                title="Credit Limits"
                subtitle="How far each buyer may go, checked before the bill is saved."
                meta={
                    <>
                        <HeaderStat label="Parties" value={String(shown.length)} />
                        <HeaderStat label="Over their limit" value={String(overCount)}
                            tone={overCount > 0 ? 'danger' : 'default'} />
                    </>
                }
            />
            <PageBody className="flex flex-col gap-3">
                {error && <Banner tone="danger" onClose={() => setError('')}>{error}</Banner>}
                {notice && <Banner tone="ok" onClose={() => setNotice('')}>{notice}</Banner>}

                <Card ref={flow.ref} className="shrink-0" title={editingId ? 'Edit limit' : 'New limit'}>
                    <FormGrid cols={4}>
                        <Field label="Party name" required span={2}
                               hint="Exactly as it is typed on their bills. Case and spacing do not matter.">
                            <Input value={form.partyName} onChange={e => set('partyName', e.target.value)} />
                        </Field>
                        <Field label="Phone">
                            <Input value={form.contactNumber} onChange={e => set('contactNumber', e.target.value)} />
                        </Field>
                        <Field label="Credit limit (₹)" hint="0 means no ceiling. Use Block to stop credit.">
                            <Input numeric inputMode="decimal" value={form.creditLimit}
                                onChange={e => set('creditLimit', e.target.value)} />
                        </Field>
                        <Field label="Credit days">
                            <Input numeric inputMode="numeric" value={form.creditDays}
                                onChange={e => set('creditDays', e.target.value)} />
                        </Field>
                        <Field label="Remarks" span={2}>
                            <Input value={form.remarks} onChange={e => set('remarks', e.target.value)} />
                        </Field>
                    </FormGrid>
                    <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1" />
                        {editingId && <Button onClick={reset}>Cancel</Button>}
                        <Button variant="primary" icon={editingId ? Save : Plus} loading={saving} onClick={save}>
                            {editingId ? 'Save limit' : 'Add limit'}
                        </Button>
                    </div>
                </Card>

                <div className="shrink-0">
                    <SearchInput ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
                        onClear={() => setSearch('')} placeholder="Party name…" className="max-w-xs" />
                </div>

                <Card flush className="flex-1 min-h-0">
                    <DataTable
                        columns={columns}
                        rows={shown}
                        loading={loading}
                        onActivate={edit}
                        empty={
                            <EmptyState
                                icon={CreditCard}
                                title="No credit limits set"
                                hint="Without a limit a party has no ceiling. Add the buyers you want to cap."
                            />
                        }
                    />
                </Card>
            </PageBody>
        </Page>
    );
}
