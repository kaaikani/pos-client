"use client";
/**
 * Print template designer.
 *
 * The bill layout used to live in code, so adding a vehicle number or moving
 * the GSTIN meant a release. Here the shop decides what appears on its own
 * documents, per paper size, and sees the result before saving.
 *
 * The editor follows the paper:
 *
 *   FLOW   3 inch and 4 inch rolls — an ordered list. Move a block up or down,
 *          switch it off, change its size and alignment. There are no
 *          coordinates because a roll has no bottom edge to measure from.
 *   FIXED  A6 / A5 / A4 — every element carries millimetre coordinates, and
 *          the item table has a region it may not grow past.
 *
 * The preview renders through exactly the same code the printer uses, so what
 * is on screen is what comes out of the machine.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Printer, Save, RefreshCw, RotateCcw, Plus, Trash2, ArrowUp, ArrowDown, Eye, GripVertical } from 'lucide-react';
import {
    PosPrintTemplatesQuery, PosPrintCatalogueQuery,
    SavePosPrintTemplateCommand, DeletePosPrintTemplateCommand, ResetPosPrintTemplateCommand,
} from '../../core/queries/pos.query';
import { templatePdfDataUrl, sampleContext } from '../../core/print/template-print';
import {
    Page, PageHeader, PageBody, Card, Field, Input, Select, Button, Banner,
    EmptyState, useConfirm,
} from '../../components/pos';

const DOC_TYPES = [
    { value: 'SALE', label: 'Sales Bill' },
    { value: 'PURCHASE', label: 'Purchase' },
    { value: 'RECEIPT', label: 'Receipt' },
    { value: 'PAYMENT', label: 'Payment Voucher' },
    { value: 'SALES_RETURN', label: 'Sales Return' },
    { value: 'PURCHASE_RETURN', label: 'Purchase Return' },
];

const BLOCK_TYPES = [
    { value: 'field', label: 'Field' },
    { value: 'text', label: 'Fixed text' },
    { value: 'row', label: 'Two columns (label + value)' },
    { value: 'table', label: 'Item table' },
    { value: 'line', label: 'Horizontal line' },
    { value: 'spacer', label: 'Blank space' },
];

const ALIGNS = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Centre' },
    { value: 'right', label: 'Right' },
];

/**
 * The paper, drawn to scale, with every field as a box you can drag.
 *
 * The millimetre boxes below the canvas are not going anywhere — they are how
 * you put a field at exactly 148.5mm when the buyer's software insists on it.
 * Dragging is for the other ninety per cent of the work, where "a bit further
 * left" is the whole requirement and typing numbers to find it is absurd.
 *
 * Positions stay in millimetres throughout. The canvas scales millimetres to
 * pixels for drawing and converts straight back on release, so what is dragged
 * is the same number that gets printed — there is no second coordinate system
 * to drift out of step.
 */
function FixedCanvas({ meta, fields, onPatch, selected, onSelect, labelFor }) {
    const ref = useRef(null);
    /* what is being dragged, in the units the paper is measured in */
    const drag = useRef(null);

    const paperW = Math.max(1, Number(meta?.widthMm) || 210);
    const paperH = Math.max(1, Number(meta?.heightMm) || 297);

    /* Scale the paper to fit the panel. A4 at 2.4 px/mm is 504px wide, which
       sits comfortably beside the field list without needing a scrollbar. */
    const scale = Math.min(2.4, 520 / paperW);
    const toPx = (mm) => mm * scale;
    const toMm = (px) => px / scale;

    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    const onPointerDown = (e, i, mode) => {
        e.preventDefault();
        e.stopPropagation();
        const f = fields[i];
        const rect = ref.current.getBoundingClientRect();
        drag.current = {
            i,
            mode,
            // Where inside the box the pointer grabbed, so it does not jump.
            grabX: toMm(e.clientX - rect.left) - (Number(f.x) || 0),
            grabY: toMm(e.clientY - rect.top) - (Number(f.y) || 0),
            startW: Number(f.w) || 20,
        };
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onSelect?.(i);
    };

    const onPointerMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const rect = ref.current.getBoundingClientRect();
        const mmX = toMm(e.clientX - rect.left);
        const mmY = toMm(e.clientY - rect.top);
        const f = fields[d.i];
        if (!f) return;

        if (d.mode === 'move') {
            // Snapped to whole millimetres: a bill laid out on 0.37mm offsets
            // is one nobody can tidy up later, and no printer resolves it.
            const w = Number(f.w) || 20;
            const h = Number(f.h) || 6;
            onPatch(d.i, {
                x: Math.round(clamp(mmX - d.grabX, 0, paperW - w)),
                y: Math.round(clamp(mmY - d.grabY, 0, Math.max(0, paperH - h))),
            });
        } else {
            const x = Number(f.x) || 0;
            onPatch(d.i, { w: Math.round(clamp(mmX - x, 4, paperW - x)) });
        }
    };

    const endDrag = (e) => {
        if (!drag.current) return;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
        drag.current = null;
    };

    const ml = Number(meta?.marginLeftMm) || 0;
    const mt = Number(meta?.marginTopMm) || 0;
    const mr = Number(meta?.marginRightMm) || 0;
    const mb = Number(meta?.marginBottomMm) || 0;

    return (
        <div className="flex flex-col gap-2">
            <div
                ref={ref}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerDown={() => onSelect?.(-1)}
                style={{
                    width: toPx(paperW),
                    height: toPx(paperH),
                    position: 'relative',
                    background: '#fff',
                    border: '1px solid var(--pos-line)',
                    boxShadow: 'var(--pos-shadow)',
                    touchAction: 'none',
                }}
            >
                {/* The printable area. A field dragged outside it will be cut
                    off by the printer, and seeing that while dragging is worth
                    more than being told about it afterwards. */}
                <div style={{
                    position: 'absolute',
                    left: toPx(ml), top: toPx(mt),
                    width: toPx(Math.max(0, paperW - ml - mr)),
                    height: toPx(Math.max(0, paperH - mt - mb)),
                    border: '1px dashed var(--pos-line)',
                    pointerEvents: 'none',
                }} />

                {fields.map((f, i) => {
                    if (f.visible === false) return null;
                    const w = Number(f.w) || 20;
                    const h = Number(f.h) || 6;
                    const isSel = selected === i;
                    const align = f.font?.align || 'left';
                    return (
                        <div
                            key={i}
                            onPointerDown={e => onPointerDown(e, i, 'move')}
                            title={labelFor(f)}
                            style={{
                                position: 'absolute',
                                left: toPx(Number(f.x) || 0),
                                top: toPx(Number(f.y) || 0),
                                width: toPx(w),
                                height: toPx(h),
                                border: isSel ? '1.5px solid var(--pos-accent)' : '1px solid var(--pos-line)',
                                background: isSel ? 'var(--pos-select)' : 'rgba(0,0,0,0.02)',
                                cursor: 'move',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
                                padding: '0 2px',
                                overflow: 'hidden',
                                touchAction: 'none',
                            }}
                        >
                            <span style={{
                                fontSize: Math.max(6, Math.min(11, (f.font?.size || 9) * scale * 0.42)),
                                fontWeight: f.font?.bold ? 700 : 400,
                                color: 'var(--pos-ink)',
                                whiteSpace: 'nowrap',
                            }}>
                                {labelFor(f)}
                            </span>
                            {/* Drag the right edge to set the width — which is
                                what decides where a right-aligned figure lands. */}
                            <span
                                onPointerDown={e => onPointerDown(e, i, 'resize')}
                                style={{
                                    position: 'absolute', right: -3, top: 0, width: 7, height: '100%',
                                    cursor: 'ew-resize', touchAction: 'none',
                                }}
                            />
                        </div>
                    );
                })}
            </div>
            <p className="text-[11px] text-[var(--pos-ink-3)]">
                Drag a box to move it, or its right edge to set the width. Positions snap to whole
                millimetres. The dashed line is the printable area.
            </p>
        </div>
    );
}

export default function PrintTemplateModule() {
    const confirm = useConfirm();

    const [templates, setTemplates] = useState([]);
    const [catalogue, setCatalogue] = useState({ fields: [], papers: [] });
    const [selectedId, setSelectedId] = useState(null);
    const [draft, setDraft] = useState(null);          // the layout being edited
    const [meta, setMeta] = useState(null);            // name, size, margins
    const [preview, setPreview] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    /* The field the canvas and the list are both pointing at. -1 is none. */
    const [selectedField, setSelectedField] = useState(-1);
    /* Reordering the roll blocks by dragging. The arrows stay for keyboards. */
    const dragBlockFrom = useRef(-1);
    const [dragBlockOver, setDragBlockOver] = useState(-1);
    const [banner, setBanner] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [list, cat] = await Promise.all([
                new PosPrintTemplatesQuery().execute(),
                new PosPrintCatalogueQuery().execute(),
            ]);
            setTemplates(list);
            setCatalogue(cat || { fields: [], papers: [] });
            if (!selectedId && list.length) setSelectedId(list[0].id);
            setBanner(null);
        } catch (e) {
            setBanner({ tone: 'danger', text: `Could not load templates: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }, [selectedId]);

    useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    const current = useMemo(
        () => templates.find(t => String(t.id) === String(selectedId)) || null,
        [templates, selectedId],
    );

    /* Load the selected template into the editor. */
    useEffect(() => {
        if (!current) { setDraft(null); setMeta(null); return; }
        let layout = {};
        try { layout = JSON.parse(current.layoutJson || '{}'); } catch { layout = {}; }
        setDraft(layout);
        setMeta({
            name: current.name,
            widthMm: current.widthMm,
            heightMm: current.heightMm,
            marginLeftMm: current.marginLeftMm,
            marginTopMm: current.marginTopMm,
            marginRightMm: current.marginRightMm,
            marginBottomMm: current.marginBottomMm,
            isDefault: current.isDefault,
        });
    }, [current]);

    /* Redraw the preview whenever the layout changes. */
    useEffect(() => {
        if (!current || !draft || !meta) { setPreview(''); return; }
        let cancelled = false;
        (async () => {
            try {
                const url = await templatePdfDataUrl(
                    { ...current, ...meta, layoutJson: JSON.stringify(draft) },
                    sampleContext(),
                );
                if (!cancelled) setPreview(url);
            } catch (e) {
                if (!cancelled) {
                    setPreview('');
                    setBanner({ tone: 'warn', text: `Preview could not be drawn: ${e.message}` });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [current, draft, meta]);

    const fieldOptions = useMemo(() => {
        const groups = {};
        for (const f of catalogue.fields || []) {
            if (f.itemColumn) continue;               // those belong to the table only
            (groups[f.group] = groups[f.group] || []).push(f);
        }
        return groups;
    }, [catalogue]);

    const itemColumns = useMemo(
        () => (catalogue.fields || []).filter(f => f.itemColumn),
        [catalogue],
    );

    /* ── FLOW block editing ── */
    const blocks = draft?.blocks || [];
    const setBlocks = (next) => setDraft(d => ({ ...d, blocks: next }));
    const patchBlock = (i, p) => setBlocks(blocks.map((b, idx) => (idx === i ? { ...b, ...p } : b)));
    const moveBlock = (i, dir) => {
        const j = i + dir;
        if (j < 0 || j >= blocks.length) return;
        const next = [...blocks];
        [next[i], next[j]] = [next[j], next[i]];
        setBlocks(next);
    };
    /**
     * Moves a block to where it was dropped.
     *
     * A roll has no coordinates — a block is simply printed after the one above
     * it — so on this kind of paper "arranging the bill" IS reordering the list.
     * Dragging says that more directly than pressing an arrow four times.
     */
    const dropBlock = (to) => {
        const from = dragBlockFrom.current;
        dragBlockFrom.current = -1;
        setDragBlockOver(-1);
        if (from < 0 || to < 0 || from === to) return;
        const next = [...blocks];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        setBlocks(next);
    };

    const addBlock = () => setBlocks([
        ...blocks,
        { type: 'field', source: 'doc.remarks', align: 'left', fontSize: 8, bold: false, visible: true },
    ]);

    /* ── FIXED field editing ── */
    const fields = draft?.fields || [];
    const setFields = (next) => setDraft(d => ({ ...d, fields: next }));
    const patchField = (i, p) => setFields(fields.map((f, idx) => (idx === i ? { ...f, ...p } : f)));
    const patchFieldFont = (i, p) =>
        setFields(fields.map((f, idx) => (idx === i ? { ...f, font: { ...(f.font || {}), ...p } } : f)));
    const addField = () => setFields([
        ...fields,
        { source: 'doc.remarks', x: 12, y: 40, w: 60, h: 6, font: { size: 9, align: 'left' }, visible: true },
    ]);

    const save = useCallback(async () => {
        if (!current || !draft || !meta) return;
        setSaving(true);
        try {
            const saved = await new SavePosPrintTemplateCommand().execute({
                id: current.id,
                docType: current.docType,
                paperSize: current.paperSize,
                name: meta.name,
                widthMm: Number(meta.widthMm),
                heightMm: Number(meta.heightMm),
                marginLeftMm: Number(meta.marginLeftMm),
                marginTopMm: Number(meta.marginTopMm),
                marginRightMm: Number(meta.marginRightMm),
                marginBottomMm: Number(meta.marginBottomMm),
                layoutJson: JSON.stringify(draft),
                isDefault: !!meta.isDefault,
            });
            setTemplates(prev => prev.map(t => (String(t.id) === String(saved.id) ? saved : t)));
            setBanner({ tone: 'ok', text: `${saved.name} saved.` });
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        } finally {
            setSaving(false);
        }
    }, [current, draft, meta]);

    const duplicate = useCallback(async () => {
        if (!current || !draft || !meta) return;
        setSaving(true);
        try {
            const copy = await new SavePosPrintTemplateCommand().execute({
                docType: current.docType,
                paperSize: current.paperSize,
                name: `${meta.name} (copy)`,
                widthMm: Number(meta.widthMm),
                heightMm: Number(meta.heightMm),
                marginLeftMm: Number(meta.marginLeftMm),
                marginTopMm: Number(meta.marginTopMm),
                marginRightMm: Number(meta.marginRightMm),
                marginBottomMm: Number(meta.marginBottomMm),
                layoutJson: JSON.stringify(draft),
                isDefault: false,
            });
            await load();
            setSelectedId(copy.id);
            setBanner({ tone: 'ok', text: 'Copy created. Edit it and make it the default when ready.' });
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        } finally {
            setSaving(false);
        }
    }, [current, draft, meta, load]);

    const remove = useCallback(async () => {
        if (!current) return;
        const ok = await confirm({
            title: `Remove ${current.name}?`,
            message: 'The template is cancelled and kept, so documents already printed are unaffected.',
            confirmLabel: 'Remove', tone: 'danger',
        });
        if (!ok) return;
        try {
            await new DeletePosPrintTemplateCommand().execute(current.id);
            setSelectedId(null);
            await load();
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        }
    }, [current, confirm, load]);

    /**
     * Back to the built-in layout for this paper.
     *
     * Needed because a built-in template cannot be removed — it is the
     * fallback when nothing else is set — so a layout edited into a mess had
     * no way back except fixing it block by block. The server rebuilds it from
     * the same function that seeds a new installation, and returns the result,
     * so the canvas redraws without a reload.
     */
    const resetLayout = useCallback(async () => {
        if (!current) return;
        const ok = await confirm({
            title: `Reset "${current.name}" to the built-in layout?`,
            message:
                'Every block and position in this layout goes back to what a new installation starts with. '
                + 'The template keeps its name, its paper size and whether it is the default. '
                + 'Documents already printed are unaffected.',
            confirmLabel: 'Reset layout',
            tone: 'danger',
        });
        if (!ok) return;
        setSaving(true);
        try {
            const fresh = await new ResetPosPrintTemplateCommand().execute(current.id);
            setBanner({ tone: 'ok', text: `"${fresh.name}" is back to the built-in layout.` });
            await load();
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        } finally {
            setSaving(false);
        }
    }, [current, confirm, load]);

    /**
     * What a box on the canvas says.
     *
     * The field's own text for a fixed label, otherwise the catalogue's name
     * for it — "Document number", not "doc.number". The person arranging a bill
     * is thinking about the bill, not about our field paths.
     */
    const labelForField = (f) => {
        if (f.source === 'text') return f.text || 'text';
        const hit = (catalogue.fields || []).find(c => c.source === f.source);
        return hit ? hit.label : f.source;
    };

    const sourceSelect = (value, onChange, width = '!w-64') => (
        <Select className={width} value={value || ''} onChange={e => onChange(e.target.value)}>
            {Object.entries(fieldOptions).map(([group, list]) => (
                <optgroup key={group} label={group}>
                    {list.map(f => <option key={f.source} value={f.source}>{f.label}</option>)}
                </optgroup>
            ))}
        </Select>
    );

    return (
        <Page>
            <PageHeader
                icon={Printer}
                title="Print Templates"
                subtitle="What appears on each document, and where. The preview uses the same code as the printer."
                actions={
                    <>
                        <Button variant="default" icon={RefreshCw} onClick={load} loading={loading}>Reload</Button>
                        <Button variant="default" onClick={duplicate} disabled={!current}>Duplicate</Button>
                        <Button variant="default" icon={RotateCcw} onClick={resetLayout} disabled={!current}>Reset layout</Button>
                        <Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!current}>Save</Button>
                    </>
                }
            />
            <PageBody>
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                <Card className="shrink-0">
                    <div className="flex flex-wrap items-end gap-3">
                        <Field label="Template">
                            <Select className="!w-72" value={selectedId || ''}
                                onChange={e => setSelectedId(e.target.value)}>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}{t.isDefault ? '  •  default' : ''}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                        {meta && (
                            <>
                                <Field label="Name">
                                    <Input className="!w-56" value={meta.name}
                                        onChange={e => setMeta(m => ({ ...m, name: e.target.value }))} />
                                </Field>
                                <Field label="Width mm">
                                    <Input className="!w-24" type="number" step="any" value={meta.widthMm}
                                        onChange={e => setMeta(m => ({ ...m, widthMm: e.target.value }))} />
                                </Field>
                                <Field label="Height mm" hint={current?.mode === 'FLOW' ? '0 = continuous roll' : undefined}>
                                    <Input className="!w-24" type="number" step="any" value={meta.heightMm}
                                        disabled={current?.mode === 'FLOW'}
                                        onChange={e => setMeta(m => ({ ...m, heightMm: e.target.value }))} />
                                </Field>
                                <Field label="Default">
                                    <label className="flex items-center gap-2 h-[32px] text-[12.5px] cursor-pointer text-[var(--pos-ink-2)]">
                                        <input type="checkbox" checked={!!meta.isDefault}
                                            onChange={e => setMeta(m => ({ ...m, isDefault: e.target.checked }))}
                                            className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                        use this one
                                    </label>
                                </Field>
                                {!current?.isSystem && (
                                    <Button variant="danger" icon={Trash2} onClick={remove}>Remove</Button>
                                )}
                            </>
                        )}
                    </div>
                    {current && (
                        <p className="text-[12px] text-[var(--pos-ink-3)] mt-2">
                            {current.mode === 'FLOW'
                                ? 'A roll has no bottom edge, so blocks print one after another. Move them up or down to reorder.'
                                : 'A sheet has a known height, so every element has a position in millimetres.'}
                        </p>
                    )}
                </Card>

                {!loading && !current && (
                    <EmptyState icon={Printer} title="No template selected"
                        message="Choose one above, or reload." />
                )}

                <div className="flex gap-4 items-start">
                    {/* ── editor ── */}
                    <div className="flex-1 min-w-0 flex flex-col gap-4">
                        {current?.mode === 'FLOW' && draft && (
                            <Card className="shrink-0" title="Blocks"
                                subtitle="Printed top to bottom. Drag a block to move it."
                                actions={<Button variant="default" size="sm" icon={Plus} onClick={addBlock}>Add block</Button>}>
                                <div className="flex flex-col gap-2">
                                    {blocks.map((b, i) => (
                                        <div key={i}
                                            draggable
                                            onDragStart={() => { dragBlockFrom.current = i; }}
                                            onDragOver={e => { e.preventDefault(); setDragBlockOver(i); }}
                                            onDragLeave={() => setDragBlockOver(o => (o === i ? -1 : o))}
                                            onDrop={e => { e.preventDefault(); dropBlock(i); }}
                                            onDragEnd={() => { dragBlockFrom.current = -1; setDragBlockOver(-1); }}
                                            className={`flex flex-wrap items-end gap-2 p-2 rounded border ${
                                                dragBlockOver === i
                                                    ? 'border-[var(--pos-accent)] bg-[var(--pos-select)]'
                                                    : 'border-[var(--pos-line-soft)]'
                                            }`}>
                                            <span className="flex items-center h-[32px] text-[var(--pos-ink-3)] cursor-move"
                                                title="Drag to move this block up or down">
                                                <GripVertical size={14} />
                                            </span>
                                            <Field label="Type">
                                                <Select className="!w-44" value={b.type}
                                                    onChange={e => patchBlock(i, { type: e.target.value })}>
                                                    {BLOCK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                </Select>
                                            </Field>

                                            {b.type === 'field' && (
                                                <Field label="Shows">
                                                    {sourceSelect(b.source, v => patchBlock(i, { source: v }))}
                                                </Field>
                                            )}
                                            {b.type === 'text' && (
                                                <Field label="Text">
                                                    <Input className="!w-72" value={b.text || ''}
                                                        onChange={e => patchBlock(i, { text: e.target.value })} />
                                                </Field>
                                            )}
                                            {b.type === 'row' && (
                                                <>
                                                    <Field label="Left label">
                                                        <Input className="!w-36" value={b.left?.text || ''}
                                                            placeholder="or leave blank"
                                                            onChange={e => patchBlock(i, { left: { ...(b.left || {}), text: e.target.value } })} />
                                                    </Field>
                                                    <Field label="Right value">
                                                        {sourceSelect(b.right?.source,
                                                            v => patchBlock(i, { right: { ...(b.right || {}), source: v } }), '!w-56')}
                                                    </Field>
                                                </>
                                            )}
                                            {b.type === 'spacer' && (
                                                <Field label="Height mm">
                                                    <Input className="!w-24" type="number" step="any" value={b.heightMm ?? 2}
                                                        onChange={e => patchBlock(i, { heightMm: e.target.value })} />
                                                </Field>
                                            )}
                                            {b.type === 'table' && (
                                                <Field label="Columns" hint="Width is a percentage of the paper">
                                                    <div className="flex flex-col gap-1">
                                                        {(b.columns || []).map((c, ci) => (
                                                            <div key={ci} className="flex items-center gap-1.5">
                                                                <Select className="!w-44" value={c.source}
                                                                    onChange={e => patchBlock(i, {
                                                                        columns: b.columns.map((x, xi) => xi === ci ? { ...x, source: e.target.value } : x),
                                                                    })}>
                                                                    {itemColumns.map(f => <option key={f.source} value={f.source}>{f.label}</option>)}
                                                                </Select>
                                                                <Input className="!w-28" value={c.header || ''} placeholder="Heading"
                                                                    onChange={e => patchBlock(i, {
                                                                        columns: b.columns.map((x, xi) => xi === ci ? { ...x, header: e.target.value } : x),
                                                                    })} />
                                                                <Input className="!w-20" type="number" value={c.width}
                                                                    onChange={e => patchBlock(i, {
                                                                        columns: b.columns.map((x, xi) => xi === ci ? { ...x, width: Number(e.target.value) } : x),
                                                                    })} />
                                                                <Select className="!w-24" value={c.align || 'left'}
                                                                    onChange={e => patchBlock(i, {
                                                                        columns: b.columns.map((x, xi) => xi === ci ? { ...x, align: e.target.value } : x),
                                                                    })}>
                                                                    {ALIGNS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                                                </Select>
                                                                <Button variant="ghost" size="sm"
                                                                    onClick={() => patchBlock(i, { columns: b.columns.filter((_, xi) => xi !== ci) })}>
                                                                    <Trash2 size={12} />
                                                                </Button>
                                                            </div>
                                                        ))}
                                                        <div>
                                                            <Button variant="default" size="sm"
                                                                onClick={() => patchBlock(i, {
                                                                    columns: [...(b.columns || []),
                                                                        { source: 'item.name', header: 'Item', width: 20, align: 'left' }],
                                                                })}>
                                                                <Plus size={12} /> Column
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </Field>
                                            )}

                                            {b.type !== 'line' && b.type !== 'spacer' && (
                                                <>
                                                    <Field label="Size">
                                                        <Input className="!w-20" type="number" step="0.5" value={b.fontSize ?? 8}
                                                            onChange={e => patchBlock(i, { fontSize: Number(e.target.value) })} />
                                                    </Field>
                                                    {b.type !== 'table' && (
                                                        <Field label="Align">
                                                            <Select className="!w-28" value={b.align || 'left'}
                                                                onChange={e => patchBlock(i, { align: e.target.value })}>
                                                                {ALIGNS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                                            </Select>
                                                        </Field>
                                                    )}
                                                    <Field label="Bold">
                                                        <label className="flex items-center h-[32px]">
                                                            <input type="checkbox" checked={!!b.bold}
                                                                onChange={e => patchBlock(i, { bold: e.target.checked })}
                                                                className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                                        </label>
                                                    </Field>
                                                </>
                                            )}

                                            <Field label="Show">
                                                <label className="flex items-center h-[32px]">
                                                    <input type="checkbox" checked={b.visible !== false}
                                                        onChange={e => patchBlock(i, { visible: e.target.checked })}
                                                        className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                                </label>
                                            </Field>

                                            <div className="flex gap-1 ml-auto">
                                                <Button variant="ghost" size="sm" onClick={() => moveBlock(i, -1)}><ArrowUp size={13} /></Button>
                                                <Button variant="ghost" size="sm" onClick={() => moveBlock(i, 1)}><ArrowDown size={13} /></Button>
                                                <Button variant="ghost" size="sm"
                                                    onClick={() => setBlocks(blocks.filter((_, x) => x !== i))}><Trash2 size={13} /></Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {current?.mode === 'FIXED' && draft && (
                            <Card className="shrink-0" title="Positioned fields"
                                subtitle="Drag on the page, or type the millimetres. Both edit the same thing."
                                actions={<Button variant="default" size="sm" icon={Plus} onClick={addField}>Add field</Button>}>
                                <div className="mb-3">
                                    <FixedCanvas
                                        meta={meta}
                                        fields={fields}
                                        onPatch={patchField}
                                        selected={selectedField}
                                        onSelect={setSelectedField}
                                        labelFor={labelForField}
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    {fields.map((f, i) => (
                                        <div key={i}
                                            onPointerDown={() => setSelectedField(i)}
                                            className={`flex flex-wrap items-end gap-2 p-2 rounded border ${
                                                selectedField === i
                                                    ? 'border-[var(--pos-accent)] bg-[var(--pos-select)]'
                                                    : 'border-[var(--pos-line-soft)]'
                                            }`}>
                                            <Field label="Shows">
                                                {sourceSelect(f.source, v => patchField(i, { source: v }))}
                                            </Field>
                                            {f.source === 'text' && (
                                                <Field label="Text">
                                                    <Input className="!w-56" value={f.text || ''}
                                                        onChange={e => patchField(i, { text: e.target.value })} />
                                                </Field>
                                            )}
                                            <Field label="Prefix">
                                                <Input className="!w-24" value={f.prefix || ''}
                                                    onChange={e => patchField(i, { prefix: e.target.value })} />
                                            </Field>
                                            {['x', 'y', 'w', 'h'].map(k => (
                                                <Field key={k} label={k.toUpperCase()}>
                                                    <Input className="!w-[70px]" type="number" step="any" value={f[k] ?? 0}
                                                        onChange={e => patchField(i, { [k]: Number(e.target.value) })} />
                                                </Field>
                                            ))}
                                            <Field label="Size">
                                                <Input className="!w-20" type="number" step="0.5" value={f.font?.size ?? 9}
                                                    onChange={e => patchFieldFont(i, { size: Number(e.target.value) })} />
                                            </Field>
                                            <Field label="Align">
                                                <Select className="!w-24" value={f.font?.align || 'left'}
                                                    onChange={e => patchFieldFont(i, { align: e.target.value })}>
                                                    {ALIGNS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                                                </Select>
                                            </Field>
                                            <Field label="Bold">
                                                <label className="flex items-center h-[32px]">
                                                    <input type="checkbox" checked={!!f.font?.bold}
                                                        onChange={e => patchFieldFont(i, { bold: e.target.checked })}
                                                        className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                                </label>
                                            </Field>
                                            <Field label="Show">
                                                <label className="flex items-center h-[32px]">
                                                    <input type="checkbox" checked={f.visible !== false}
                                                        onChange={e => patchField(i, { visible: e.target.checked })}
                                                        className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px]" />
                                                </label>
                                            </Field>
                                            <Button variant="ghost" size="sm" className="ml-auto"
                                                onClick={() => setFields(fields.filter((_, x) => x !== i))}>
                                                <Trash2 size={13} />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* ── preview ── */}
                    <Card className="shrink-0 w-[420px]" title="Preview"
                        subtitle="Sample data, drawn by the same code the printer uses.">
                        {preview ? (
                            <iframe title="Print preview" src={preview}
                                className="w-full h-[620px] border border-[var(--pos-line)] rounded bg-white" />
                        ) : (
                            <div className="h-[620px] flex items-center justify-center text-[var(--pos-ink-3)] text-[12.5px]">
                                <Eye size={14} className="mr-2" /> Nothing to preview yet
                            </div>
                        )}
                    </Card>
                </div>
            </PageBody>
        </Page>
    );
}
