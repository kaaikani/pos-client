"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ScanLine, Printer, Search, RefreshCw, CheckCircle, FileText, Download, AlertTriangle, Plus, Trash2, Eye, EyeOff, Save, Wand2, Loader2, AlignLeft, AlignCenter, AlignRight, LayoutGrid, Columns3, X, Crosshair, RotateCcw, QrCode } from 'lucide-react';
import { ListItemsQuery } from '../../core/queries/pharma.query';
import { PosActiveCompanyQuery } from '../../core/queries/company.query';
import { GenerateItemBarcodeCommand, GenerateMissingBarcodesCommand, AddItemBarcodeCommand } from '../../core/queries/barcode.query';
import { FIELD_MAP, resolveFieldText, isBarcodeField, isQrField, resolveQrText, QR_SOURCES, masterRaw } from '../../core/barcode/label-fields';
import { makeDefaultTemplate, cloneTemplate, SIZE_PRESETS, FONT_FAMILIES, PRINTER_PRESETS, BARCODE_FORMATS, autoLayoutFields, resetMargins, autoCenterFields, safeRect, listTemplates, saveTemplate, deleteTemplate, normalizeTemplate, getActiveTemplate, setActiveTemplate } from '../../core/barcode/label-templates';
import { renderBarcodeSvg, renderQrSvg } from '../../core/barcode/barcode-render';
import { expandLabels, openLabelPdf, printLabelPdf, saveLabelPdf, getLabelPdfBase64 } from '../../core/barcode/label-pdf';
import { qzListPrinters, qzPrintPdfBase64 } from '../../core/barcode/qz-print';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;
const COLS_KEY = 'pos_bc_assign_cols';
const PRINTER_KEY = 'pos_label_printer';
const FMT_LABEL = { AUTO: 'Auto', EAN13: 'EAN-13', EAN8: 'EAN-8', CODE128: 'Code128' };

// Assign columns. itemName/qty/action always on; the rest toggleable; editable
// columns carry an `ov` (override key). Custom-field columns are appended live.
const CORE_COLS = [
    { key: 'code', label: 'SKU', ro: true },
    { key: 'barcode', label: 'Barcode', special: 'barcode' },
    { key: 'companyName', label: 'Company', ov: 'companyName' },
    { key: 'salesRate', label: 'Price', ov: 'salesRate', align: 'right' },
    { key: 'mrpRate', label: 'MRP', ov: 'mrpRate', align: 'right' },
    { key: 'costRate', label: 'Cost', ov: 'costRate', align: 'right' },
    { key: 'batchNo', label: 'Batch', ov: 'batchNo' },
    { key: 'expiryDate', label: 'Expiry', ov: 'expiryDate' },
    { key: 'hsnCode', label: 'HSN', ov: 'hsnCode' },
    { key: 'category', label: 'Category', ov: 'category' },
    { key: 'brand', label: 'Brand', ov: 'brand' },
    { key: 'supplier', label: 'Supplier', ov: 'supplier' },
    { key: 'gstPercent', label: 'Tax %', ov: 'gstPercent' },
    { key: 'weight', label: 'Weight', ov: 'weight' },
    { key: 'unit', label: 'Unit', ov: 'unit' },
];
const DEFAULT_COLS = ['code', 'barcode', 'salesRate', 'mrpRate'];

export default function BarcodeModule() {
    const [activeTab, setActiveTab] = useState('assign');
    const [items, setItems] = useState([]);
    const [company, setCompany] = useState(null);
    const [search, setSearch] = useState('');
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState('');
    const [qtyById, setQtyById] = useState({});
    const [overridesById, setOverridesById] = useState({}); // temporary print-time overrides
    const [visibleCols, setVisibleCols] = useState(DEFAULT_COLS);
    const [showCols, setShowCols] = useState(false);

    const [queue, setQueue] = useState([]);
    const [template, setTemplate] = useState(() => makeDefaultTemplate());
    const [templates, setTemplates] = useState([]);
    const [tplName, setTplName] = useState('Default');
    const [pdfBusy, setPdfBusy] = useState('');
    const [newField, setNewField] = useState({ label: '', value: '' });
    const [previewMode, setPreviewMode] = useState('sticker');
    const [selectedIdx, setSelectedIdx] = useState(-1);

    // ── QZ Tray printer state ──
    const [printers, setPrinters] = useState([]);
    const [qzReady, setQzReady] = useState(false);
    const [selectedPrinter, setSelectedPrinter] = useState('');

    useEffect(() => {
        new ListItemsQuery().execute().then(setItems).catch((e) => setError(e.message));
        new PosActiveCompanyQuery().execute().then(setCompany).catch(() => {});
        setTemplates(listTemplates());
        const active = getActiveTemplate();
        if (active) { setTemplate(active); setTplName(active.name); }
        try { const c = JSON.parse(localStorage.getItem(COLS_KEY) || 'null'); if (Array.isArray(c)) setVisibleCols(c); } catch {}
        try { const p = localStorage.getItem(PRINTER_KEY); if (p) setSelectedPrinter(p); } catch {}
    }, []);

    // Detect installed printers via QZ Tray (falls back to browser print if absent).
    const loadPrinters = useCallback(async () => {
        try {
            const { printers: list, osDefault } = await qzListPrinters();
            setPrinters(list); setQzReady(true);
            setSelectedPrinter((cur) => (cur && list.includes(cur)) ? cur : (osDefault || list[0] || ''));
        } catch { setQzReady(false); setPrinters([]); }
    }, []);
    useEffect(() => { loadPrinters(); }, [loadPrinters]);
    const choosePrinter = (name) => { setSelectedPrinter(name); try { localStorage.setItem(PRINTER_KEY, name); } catch {} };

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        if (!s) return items;
        return items.filter((p) => (p.itemName || '').toLowerCase().includes(s) || String(p.code || '').toLowerCase().includes(s) || String(p.barcode || '').includes(s));
    }, [items, search]);

    const qtyOf = (id) => Math.max(1, parseInt(qtyById[id], 10) || 1);
    const setQty = (id, v) => setQtyById((m) => ({ ...m, [id]: Math.max(1, parseInt(v, 10) || 1) }));
    const setOverride = (id, key, val) => setOverridesById((m) => ({ ...m, [id]: { ...(m[id] || {}), [key]: val } }));
    const toggleCol = (key) => setVisibleCols((c) => { const next = c.includes(key) ? c.filter((x) => x !== key) : [...c, key]; try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch {} return next; });

    const customCols = useMemo(() => template.fields.filter((f) => f.custom).map((f) => ({ key: 'custom:' + f.cid, label: f.label, ov: 'custom:' + f.cid, defVal: f.value || '' })), [template.fields]);
    const cols = useMemo(() => {
        const core = CORE_COLS.filter((c) => visibleCols.includes(c.key));
        return [{ key: 'itemName', label: 'Item Name', always: true, ro: true }, ...core, ...customCols, { key: 'qty', label: 'Qty', special: 'qty', align: 'center' }, { key: 'action', label: 'Action', special: 'action', align: 'right' }];
    }, [visibleCols, customCols]);

    // ── Backend barcode ops ──
    const refreshItem = (id, barcode) => setItems((prev) => prev.map((p) => (String(p.id) === String(id) ? { ...p, barcode } : p)));
    const handleGenerate = async (item) => { setBusyId(item.id); setError(''); try { const bc = await new GenerateItemBarcodeCommand().execute(item.id); refreshItem(item.id, bc.barcode); } catch (e) { setError(e.message); } finally { setBusyId(null); } };
    const handleGenerateMissing = async () => { setBusyId('all'); setError(''); try { await new GenerateMissingBarcodesCommand().execute(); setItems(await new ListItemsQuery().execute()); } catch (e) { setError(e.message); } finally { setBusyId(null); } };
    const handleManual = async (item) => { const code = window.prompt(`Barcode for "${item.itemName}" (server validates EAN-13):`, ''); if (!code) return; setBusyId(item.id); setError(''); try { const bc = await new AddItemBarcodeCommand().execute({ itemId: Number(item.id), barcode: code.trim(), isPrimary: !item.barcode }); refreshItem(item.id, bc.barcode); } catch (e) { setError(e.message); } finally { setBusyId(null); } };

    // ── Queue (snapshots the current overrides for that item) ──
    const addToQueue = (item) => {
        if (!item.barcode) { setError(`"${item.itemName}" has no barcode. Generate one first.`); return; }
        const copies = qtyOf(item.id);
        const overrides = { ...(overridesById[item.id] || {}) };
        setQueue((q) => (q.find((x) => x.item.id === item.id) ? q.map((x) => (x.item.id === item.id ? { ...x, copies, overrides } : x)) : [...q, { item, copies, overrides }]));
    };
    const setCopies = (id, n) => setQueue((q) => q.map((x) => (x.item.id === id ? { ...x, copies: Math.max(1, n) } : x)));
    const removeFromQueue = (id) => setQueue((q) => q.filter((x) => x.item.id !== id));
    const totalLabels = queue.reduce((s, q) => s + (parseInt(q.copies, 10) || 0), 0);

    const printNow = async () => {
        if (!queue.length) return;
        setPdfBusy('print'); setError('');
        try {
            const labels = expandLabels(queue, company);
            if (qzReady && selectedPrinter) {
                // Direct to the chosen printer via QZ Tray — no browser dialog.
                const b64 = await getLabelPdfBase64(template, labels);
                await qzPrintPdfBase64(selectedPrinter, b64);
            } else {
                // Fallback: browser print dialog (QZ Tray not running).
                await printLabelPdf(template, labels);
            }
            setQueue([]); setQtyById({});
        } catch (e) { setError(e.message || 'Print failed.'); } finally { setPdfBusy(''); }
    };
    const previewPdf = async () => { if (!queue.length) return; setPdfBusy('preview'); setError(''); try { await openLabelPdf(template, expandLabels(queue, company)); } catch (e) { setError(e.message || 'Preview failed.'); } finally { setPdfBusy(''); } };

    // ── Template editing (Designer) ──
    const patchTemplate = (patch) => setTemplate((t) => ({ ...t, ...patch }));
    const patchLayout = (patch) => setTemplate((t) => ({ ...t, layout: { ...t.layout, ...patch } }));
    const patchOuter = (side, v) => setTemplate((t) => ({ ...t, layout: { ...t.layout, outer: { ...t.layout.outer, [side]: v } } }));
    const patchInner = (side, v) => setTemplate((t) => ({ ...t, layout: { ...t.layout, inner: { ...t.layout.inner, [side]: v } } }));
    const patchField = useCallback((idx, patch) => setTemplate((t) => ({ ...t, fields: t.fields.map((f, i) => (i === idx ? { ...f, ...patch, font: { ...f.font, ...(patch.font || {}) } } : f)) })), []);
    const applyPreset = (key) => { const p = SIZE_PRESETS[key]; setTemplate((t) => ({ ...t, size: { preset: key, widthMm: p.widthMm, heightMm: p.heightMm } })); };
    const applyPrinter = (key) => { const p = PRINTER_PRESETS[key]; setTemplate((t) => ({ ...t, printer: key, size: { ...t.size, preset: 'custom', widthMm: p.widthMm } })); };
    const autoArrange = () => setTemplate((t) => ({ ...t, fields: autoLayoutFields(t.fields, t.size, t.barcode, t.layout.inner) }));
    const addCustomField = () => { if (!newField.label.trim()) return; setTemplate((t) => { const cid = 'c' + Date.now().toString(36); const r = safeRect(t); return { ...t, fields: [...t.fields, { custom: true, cid, label: newField.label.trim(), value: newField.value, visible: true, x: r.x, y: r.y, w: r.w, h: 4, font: { ...t.font, align: 'center' } }] }; }); setNewField({ label: '', value: '' }); };
    const addQrField = () => setTemplate((t) => {
        const qid = 'q' + Date.now().toString(36);
        const r = safeRect(t);
        const side = Math.max(8, Math.min(r.w, r.h, 18)); // square, fits the safe area
        return { ...t, fields: [...t.fields, { qr: true, qid, label: 'QR Code', qrSource: 'barcodeValue', qrText: '', qrEc: 'M', visible: true, x: r.x, y: r.y, w: side, h: side, font: { ...t.font, align: 'center' } }] };
    });
    const removeField = (idx) => setTemplate((t) => ({ ...t, fields: t.fields.filter((_, i) => i !== idx) }));
    const doSaveTemplate = () => { const t = cloneTemplate({ ...template, name: tplName.trim() || 'Template' }); setTemplates(saveTemplate(t)); setTemplate(t); };
    const doLoadTemplate = (name) => { const t = templates.find((x) => x.name === name); if (t) { const norm = normalizeTemplate(cloneTemplate(t)); setTemplate(norm); setTplName(norm.name); setActiveTemplate(norm); setSelectedIdx(-1); } };
    const doDeleteTemplate = (name) => setTemplates(deleteTemplate(name));

    const sampleItem = queue[0]?.item || filtered[0] || items[0] || {};
    const sampleCtx = { item: sampleItem, company, overrides: overridesById[sampleItem.id] || {} };
    const perPage = Math.max(1, (template.layout.perRow || 1) * (template.layout.perColumn || 1));
    const sheetLabels = useMemo(() => { const real = expandLabels(queue, company); const src = real.length ? real : [sampleCtx]; return Array.from({ length: perPage }, (_, i) => src[i % src.length]); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [queue, company, perPage, sampleCtx.item, template.fields, overridesById]);
    const selField = selectedIdx >= 0 ? template.fields[selectedIdx] : null;

    const editableCell = (p, col) => {
        const val = overridesById[p.id]?.[col.ov] ?? '';
        const placeholder = col.ov.startsWith('custom:') ? col.defVal || '' : String(masterRaw(col.ov, p, company) ?? '');
        return <input value={val} placeholder={placeholder} onChange={(e) => setOverride(p.id, col.ov, e.target.value)} className="w-full min-w-[70px] px-2 py-1 border border-slate-200 rounded text-xs focus:border-emerald-400 outline-none" />;
    };

    return (
        <div className="flex flex-col h-[85vh] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden font-sans">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex justify-between items-center shrink-0">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><ScanLine className="text-emerald-600" /> Barcode &amp; Label Designer</h2>
                <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-slate-500">Template: <span className="text-emerald-700">{template.name}</span> · <span className="text-slate-600">{FMT_LABEL[template.barcode.format] || 'Auto'}</span></span>
                    <div className="flex gap-2 bg-slate-200/50 p-1 rounded-lg border border-slate-200">
                        <button onClick={() => setActiveTab('assign')} className={`px-4 py-1.5 text-sm font-bold rounded-md flex items-center gap-2 ${activeTab === 'assign' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-700'}`}><Printer size={16} /> Assign &amp; Print {totalLabels > 0 && <span className="bg-emerald-800 text-white text-xs px-1.5 rounded-full">{totalLabels}</span>}</button>
                        <button onClick={() => setActiveTab('design')} className={`px-4 py-1.5 text-sm font-bold rounded-md ${activeTab === 'design' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-700'}`}>Label Designer</button>
                    </div>
                </div>
            </div>

            {error && <div className="px-6 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs font-bold flex items-center gap-2"><AlertTriangle size={14} /> {error} <button onClick={() => setError('')} className="ml-auto underline">dismiss</button></div>}

            {/* ───────── ASSIGN + PRINT ───────── */}
            {activeTab === 'assign' && (
                <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
                    <div className="p-4 bg-white border-b border-slate-200 flex gap-3 items-center shrink-0">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items by name / code / barcode…" className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white outline-none" />
                        </div>
                        <button onClick={handleGenerateMissing} disabled={busyId === 'all'} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">{busyId === 'all' ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Auto-Generate Missing</button>
                        <div className="relative ml-auto">
                            <button onClick={() => setShowCols((s) => !s)} className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-50"><Columns3 size={16} /> Columns</button>
                            {showCols && (
                                <div className="absolute right-0 mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-xl z-30 p-2 max-h-80 overflow-auto">
                                    <div className="flex justify-between items-center mb-1 px-1"><span className="text-[11px] font-black uppercase text-slate-500">Show columns</span><button onClick={() => setShowCols(false)}><X size={14} className="text-slate-400" /></button></div>
                                    {CORE_COLS.map((c) => (
                                        <label key={c.key} className="flex items-center gap-2 px-1 py-1 text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 rounded"><input type="checkbox" checked={visibleCols.includes(c.key)} onChange={() => toggleCol(c.key)} className="accent-emerald-600" /> {c.label}</label>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 sticky top-0 z-10">
                                <tr className="text-[11px] font-black uppercase tracking-wider text-slate-500">{cols.map((c) => <th key={c.key} className={`px-3 py-2 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>{c.label}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map((p) => (
                                    <tr key={p.id} className="bg-white hover:bg-blue-50/30">
                                        {cols.map((c) => (
                                            <td key={c.key} className={`px-3 py-1.5 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>
                                                {c.key === 'itemName' ? <span className="font-bold text-slate-800">{p.itemName}</span>
                                                    : c.key === 'code' ? <span className="font-mono text-xs text-slate-500">{p.code}</span>
                                                    : c.key === 'barcode' ? (p.barcode ? <span className="inline-flex items-center gap-1.5 text-emerald-700 font-mono text-xs font-black"><CheckCircle size={13} /> {p.barcode}</span> : <span className="inline-flex items-center gap-1.5 text-amber-600 text-xs font-bold"><AlertTriangle size={13} /> none</span>)
                                                    : c.key === 'qty' ? <input type="number" min={1} value={qtyById[p.id] ?? 1} onChange={(e) => setQty(p.id, e.target.value)} className="w-16 px-2 py-1 border border-slate-300 rounded text-center font-bold text-sm" />
                                                    : c.key === 'action' ? (
                                                        <div className="flex justify-end gap-1.5">
                                                            {!p.barcode ? <button onClick={() => handleGenerate(p)} disabled={busyId === p.id} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold flex items-center gap-1 disabled:opacity-50">{busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Generate</button>
                                                                : <button onClick={() => addToQueue(p)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold flex items-center gap-1"><Printer size={12} /> Add to Print</button>}
                                                            <button onClick={() => handleManual(p)} className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-bold">Manual…</button>
                                                        </div>)
                                                    : c.ov ? editableCell(p, c)
                                                    : <span className="text-slate-600">{p[c.key] ?? '—'}</span>}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {filtered.length === 0 && <tr><td colSpan={cols.length} className="text-center py-12 text-slate-400 font-bold">No items.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    {queue.length > 0 && (
                        <div className="border-t border-slate-200 bg-white max-h-[28%] overflow-auto shrink-0">
                            <div className="px-4 py-2 text-xs font-bold text-slate-600 sticky top-0 bg-white border-b border-slate-100">Print Queue (overrides snapshotted at add)</div>
                            <div className="divide-y divide-slate-100">
                                {queue.map((q) => (
                                    <div key={q.item.id} className="px-4 py-1.5 flex items-center gap-2 text-xs">
                                        <span className="flex-1 font-bold text-slate-800 truncate">{q.item.itemName}{Object.keys(q.overrides || {}).length > 0 && <span className="ml-2 text-[10px] text-indigo-500 font-bold">edited</span>}</span>
                                        <span className="font-mono text-slate-400">{q.item.barcode}</span>
                                        <div className="flex items-center gap-1"><button onClick={() => setCopies(q.item.id, q.copies - 1)} className="w-5 h-5 bg-slate-100 rounded font-black">-</button><span className="w-8 text-center font-black">{q.copies}</span><button onClick={() => setCopies(q.item.id, q.copies + 1)} className="w-5 h-5 bg-slate-100 rounded font-black">+</button></div>
                                        <button onClick={() => removeFromQueue(q.item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="border-t border-slate-200 bg-white px-4 py-3 flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold text-slate-600">{queue.length} item(s) · <span className="text-emerald-700">{totalLabels} labels</span> · template <b>{template.name}</b></span>
                        <div className="ml-auto flex items-center gap-2">
                            <div className="flex items-center gap-1.5 mr-1">
                                <Printer size={14} className="text-slate-400" />
                                {qzReady ? (
                                    <select value={selectedPrinter} onChange={(e) => choosePrinter(e.target.value)} title="Output printer (saved as default)" className="px-2 py-1.5 border border-slate-300 rounded text-xs font-bold max-w-[180px]">
                                        {printers.map((p) => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                ) : (
                                    <span className="text-[11px] text-amber-600 font-bold" title="Install/run QZ Tray to print directly to a chosen printer">QZ Tray off — browser print</span>
                                )}
                                <button onClick={loadPrinters} title="Detect printers (QZ Tray)" className="p-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50"><RefreshCw size={13} /></button>
                            </div>
                            <button onClick={previewPdf} disabled={!queue.length || !!pdfBusy} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">{pdfBusy === 'preview' ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} Preview</button>
                            <button onClick={printNow} disabled={!queue.length || !!pdfBusy} className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2">{pdfBusy === 'print' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} Print Now</button>
                            <button onClick={() => setQueue([])} disabled={!queue.length} className="px-4 py-2 rounded-lg border border-red-300 text-red-600 font-bold text-sm hover:bg-red-50 disabled:opacity-40 flex items-center gap-2"><Trash2 size={16} /> Clear Queue</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ───────── DESIGNER ───────── */}
            {activeTab === 'design' && (
                <div className="flex-1 overflow-hidden flex">
                    <div className="w-[440px] border-r border-slate-200 overflow-auto p-4 space-y-3 bg-slate-50 shrink-0">
                        <Section title="Template">
                            <div className="flex gap-2">
                                <input value={tplName} onChange={(e) => setTplName(e.target.value)} className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm font-bold" placeholder="Template name" />
                                <button onClick={doSaveTemplate} className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-bold flex items-center gap-1"><Save size={13} /> Save</button>
                            </div>
                            {templates.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">{templates.map((t) => (<span key={t.name} className={`inline-flex items-center gap-1 border rounded px-2 py-0.5 text-xs font-bold ${t.name === template.name ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-300'}`}><button onClick={() => doLoadTemplate(t.name)} className="text-slate-700 hover:text-emerald-600">{t.name}</button><button onClick={() => doDeleteTemplate(t.name)} className="text-red-400 hover:text-red-600"><Trash2 size={11} /></button></span>))}</div>}
                            <p className="text-[10px] text-slate-400 mt-1">Saves layout/design only — item values stay as print-time overrides.</p>
                        </Section>

                        <Section title="Output Printer (QZ Tray)">
                            {qzReady ? (
                                <div className="flex items-center gap-2">
                                    <select value={selectedPrinter} onChange={(e) => choosePrinter(e.target.value)} className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm font-bold">{printers.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                                    <button onClick={loadPrinters} title="Refresh printers" className="p-1.5 rounded border border-slate-300 text-slate-600 hover:bg-white"><RefreshCw size={14} /></button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className="flex-1 text-[11px] text-amber-600 font-bold">QZ Tray not detected — Print Now will use the browser dialog. Install/run QZ Tray to select a printer here.</span>
                                    <button onClick={loadPrinters} className="px-2 py-1 rounded border border-slate-300 text-slate-600 text-xs font-bold hover:bg-white">Retry</button>
                                </div>
                            )}
                            <p className="text-[10px] text-slate-400 mt-1">Lists printers installed on this PC. The chosen one is saved as default and used by Print Now.</p>
                        </Section>

                        <Section title="Sticker width preset (size only — not a device)"><div className="flex flex-wrap gap-1.5">{Object.entries(PRINTER_PRESETS).map(([k, p]) => <button key={k} onClick={() => applyPrinter(k)} className={`px-2 py-1 rounded text-xs font-bold border ${template.printer === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-300 text-slate-700'}`}>{p.label} <span className="opacity-60">{p.widthMm}mm</span></button>)}</div></Section>

                        <Section title="Sticker Size">
                            <div className="flex flex-wrap gap-1.5 mb-2">{Object.entries(SIZE_PRESETS).map(([k, p]) => <button key={k} onClick={() => applyPreset(k)} className={`px-2 py-1 rounded text-xs font-bold border ${template.size.preset === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-300 text-slate-700'}`}>{p.label}</button>)}</div>
                            <div className="grid grid-cols-2 gap-2"><NumField label="Width (mm)" value={template.size.widthMm} onChange={(v) => patchTemplate({ size: { ...template.size, preset: 'custom', widthMm: v } })} /><NumField label="Height (mm)" value={template.size.heightMm} onChange={(v) => patchTemplate({ size: { ...template.size, preset: 'custom', heightMm: v } })} /></div>
                            <button onClick={autoArrange} className="mt-2 w-full px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center justify-center gap-1"><LayoutGrid size={13} /> Auto-arrange fields</button>
                        </Section>

                        <Section title="Sheet Layout">
                            <div className="grid grid-cols-2 gap-2"><NumField label="Stickers / row" value={template.layout.perRow} onChange={(v) => patchLayout({ perRow: v })} /><NumField label="Rows / page" value={template.layout.perColumn} onChange={(v) => patchLayout({ perColumn: v })} /><NumField label="Gap X (mm)" value={template.layout.gapXmm} onChange={(v) => patchLayout({ gapXmm: v })} step={0.5} /><NumField label="Gap Y (mm)" value={template.layout.gapYmm} onChange={(v) => patchLayout({ gapYmm: v })} step={0.5} /></div>
                        </Section>

                        <Section title="Margins">
                            <p className="text-[10px] font-bold text-slate-400 mb-1">Outer page margin (moves whole grid on paper)</p>
                            <div className="grid grid-cols-4 gap-1.5"><NumField label="Top" value={template.layout.outer.top} step={0.5} onChange={(v) => patchOuter('top', v)} /><NumField label="Left" value={template.layout.outer.left} step={0.5} onChange={(v) => patchOuter('left', v)} /><NumField label="Right" value={template.layout.outer.right} step={0.5} onChange={(v) => patchOuter('right', v)} /><NumField label="Bottom" value={template.layout.outer.bottom} step={0.5} onChange={(v) => patchOuter('bottom', v)} /></div>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 mb-1">Inner safe margin (prevents clipping inside sticker)</p>
                            <div className="grid grid-cols-4 gap-1.5"><NumField label="Top" value={template.layout.inner.top} step={0.5} onChange={(v) => patchInner('top', v)} /><NumField label="Left" value={template.layout.inner.left} step={0.5} onChange={(v) => patchInner('left', v)} /><NumField label="Right" value={template.layout.inner.right} step={0.5} onChange={(v) => patchInner('right', v)} /><NumField label="Bottom" value={template.layout.inner.bottom} step={0.5} onChange={(v) => patchInner('bottom', v)} /></div>
                            <div className="flex gap-1.5 mt-2">
                                <button onClick={() => setTemplate((t) => resetMargins(t))} className="flex-1 px-2 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-bold flex items-center justify-center gap-1"><RotateCcw size={13} /> Reset Margins</button>
                                <button onClick={() => setTemplate((t) => autoCenterFields(t))} className="flex-1 px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold flex items-center justify-center gap-1"><Crosshair size={13} /> Auto Center</button>
                            </div>
                        </Section>

                        <Section title="Barcode">
                            <div className="grid grid-cols-2 gap-2 items-end">
                                <label className="block col-span-2"><span className="text-[10px] font-bold text-slate-500">Type</span>
                                    <select value={template.barcode.format} onChange={(e) => patchTemplate({ barcode: { ...template.barcode, format: e.target.value } })} className="w-full px-2 py-1 border border-slate-300 rounded text-sm font-bold">{BARCODE_FORMATS.map((f) => <option key={f} value={f}>{FMT_LABEL[f]}</option>)}</select>
                                </label>
                                <NumField label="Height (mm)" value={template.barcode.heightMm} onChange={(v) => patchTemplate({ barcode: { ...template.barcode, heightMm: v } })} step={0.5} />
                                <NumField label="Bar width" value={template.barcode.moduleWidth} onChange={(v) => patchTemplate({ barcode: { ...template.barcode, moduleWidth: v } })} step={0.1} />
                                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 col-span-2"><input type="checkbox" checked={template.barcode.showText} onChange={(e) => patchTemplate({ barcode: { ...template.barcode, showText: e.target.checked } })} className="accent-emerald-600" /> Show digits</label>
                            </div>
                        </Section>

                        {selField && (
                            <Section title={`Selected: ${selField.qr ? (selField.label || 'QR Code') : selField.custom ? selField.label : FIELD_MAP[selField.key]?.label || selField.key}`}>
                                <div className="grid grid-cols-4 gap-1.5 mb-2"><NumField label="X" value={selField.x} step={0.5} onChange={(v) => patchField(selectedIdx, { x: v })} /><NumField label="Y" value={selField.y} step={0.5} onChange={(v) => patchField(selectedIdx, { y: v })} /><NumField label="W" value={selField.w} step={0.5} onChange={(v) => patchField(selectedIdx, { w: v })} /><NumField label="H" value={selField.h} step={0.5} onChange={(v) => patchField(selectedIdx, { h: v })} /></div>
                                {selField.qr && (
                                    <div className="mb-2 space-y-1.5 bg-white rounded border border-slate-200 p-2">
                                        <label className="block"><span className="text-[10px] font-bold text-slate-500">QR encodes</span>
                                            <select value={selField.qrSource || 'barcodeValue'} onChange={(e) => patchField(selectedIdx, { qrSource: e.target.value })} className="w-full px-2 py-1 border border-slate-300 rounded text-sm font-bold">{QR_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                                        </label>
                                        {selField.qrSource === 'custom' && <input value={selField.qrText || ''} onChange={(e) => patchField(selectedIdx, { qrText: e.target.value })} placeholder="Custom QR text / URL" className="w-full px-2 py-1 border border-slate-300 rounded text-xs" />}
                                        <label className="block"><span className="text-[10px] font-bold text-slate-500">Error correction</span>
                                            <select value={selField.qrEc || 'M'} onChange={(e) => patchField(selectedIdx, { qrEc: e.target.value })} className="w-full px-2 py-1 border border-slate-300 rounded text-sm font-bold">{[['L', 'L — Low (7%)'], ['M', 'M — Medium (15%)'], ['Q', 'Q — Quartile (25%)'], ['H', 'H — High (30%)']].map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}</select>
                                        </label>
                                        <p className="text-[10px] text-slate-400">QR stays square — drag the W/H box to size it; it fit-centers without stretching.</p>
                                    </div>
                                )}
                                <div className={`flex items-center gap-2 ${selField.qr || isBarcodeField(selField) ? 'opacity-40 pointer-events-none' : ''}`}>
                                    <select value={selField.font?.size || 7} onChange={(e) => patchField(selectedIdx, { font: { size: Number(e.target.value) } })} className="border border-slate-300 rounded text-xs px-1 py-1">{[5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18].map((s) => <option key={s} value={s}>{s}pt</option>)}</select>
                                    <select value={selField.font?.family || 'Helvetica'} onChange={(e) => patchField(selectedIdx, { font: { family: e.target.value } })} className="border border-slate-300 rounded text-xs px-1 py-1">{FONT_FAMILIES.map((ff) => <option key={ff} value={ff}>{ff}</option>)}</select>
                                    <button onClick={() => patchField(selectedIdx, { font: { bold: !selField.font?.bold } })} className={`px-2 py-1 rounded text-xs font-black ${selField.font?.bold ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>B</button>
                                    <div className="flex gap-0.5 ml-auto">{[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, I]) => <button key={a} onClick={() => patchField(selectedIdx, { font: { align: a } })} className={`p-1 rounded ${selField.font?.align === a ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}><I size={13} /></button>)}</div>
                                </div>
                            </Section>
                        )}

                        <Section title="Fields (click to select on canvas)">
                            <div className="space-y-1">
                                {template.fields.map((f, idx) => {
                                    const def = (f.custom || f.qr) ? null : FIELD_MAP[f.key];
                                    const name = f.qr ? (f.label || 'QR Code') : f.custom ? f.label : def?.label || f.key;
                                    const mandatory = def?.mandatory;
                                    return (
                                        <div key={(f.key || f.qid || 'c') + idx} onClick={() => setSelectedIdx(idx)} className={`border rounded p-1.5 flex items-center gap-2 text-xs cursor-pointer ${idx === selectedIdx ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                                            <button onClick={(e) => { e.stopPropagation(); if (!mandatory) patchField(idx, { visible: !f.visible }); }} disabled={mandatory} className={`shrink-0 ${f.visible ? 'text-emerald-600' : 'text-slate-300'}`}>{f.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                                            <span className={`flex-1 font-bold truncate flex items-center gap-1 ${f.visible ? 'text-slate-800' : 'text-slate-400'}`}>{f.qr && <QrCode size={12} className="text-slate-500" />}{name}{mandatory && <span className="text-[9px] text-red-500 ml-1">*</span>}{f.custom && <span className="text-[9px] text-indigo-500 ml-1">custom</span>}{f.qr && <span className="text-[9px] text-slate-500 ml-1">QR</span>}</span>
                                            {(f.custom || f.qr) && <button onClick={(e) => { e.stopPropagation(); removeField(idx); }} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex gap-1.5 mt-2"><input value={newField.label} onChange={(e) => setNewField((s) => ({ ...s, label: e.target.value }))} placeholder="Custom label" className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs" /><input value={newField.value} onChange={(e) => setNewField((s) => ({ ...s, value: e.target.value }))} placeholder="Default text" className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs" /><button onClick={addCustomField} title="Add custom text field" className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-bold"><Plus size={12} /></button></div>
                            <button onClick={addQrField} className="mt-1.5 w-full px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold flex items-center justify-center gap-1"><QrCode size={13} /> Add QR Code</button>
                        </Section>
                    </div>

                    <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">
                        <div className="flex-1 overflow-auto p-6 flex flex-col items-center">
                            <div className="self-stretch flex items-center justify-between mb-3">
                                <h3 className="font-black text-slate-600 text-sm flex items-center gap-2"><FileText size={16} /> {previewMode === 'sticker' ? 'Editable Sticker — drag inside the safe area' : 'Full Sheet Preview'}</h3>
                                <div className="flex gap-1 bg-slate-200/60 p-0.5 rounded-lg border border-slate-300"><button onClick={() => setPreviewMode('sticker')} className={`px-3 py-1 text-xs font-bold rounded-md ${previewMode === 'sticker' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600'}`}>Edit Sticker</button><button onClick={() => setPreviewMode('sheet')} className={`px-3 py-1 text-xs font-bold rounded-md ${previewMode === 'sheet' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600'}`}>Full Sheet</button></div>
                            </div>
                            {previewMode === 'sticker' ? <StickerCanvas template={template} ctx={sampleCtx} selectedIdx={selectedIdx} onSelect={setSelectedIdx} onChangeField={patchField} /> : <SheetPreview template={template} labels={sheetLabels} />}
                            <p className="text-[11px] text-slate-500 mt-3 text-center">{template.size.widthMm}×{template.size.heightMm}mm · {template.layout.perRow}×{template.layout.perColumn}/page · outer {template.layout.outer.top}/{template.layout.outer.left}/{template.layout.outer.right}/{template.layout.outer.bottom} · safe {template.layout.inner.top}/{template.layout.inner.left}/{template.layout.inner.right}/{template.layout.inner.bottom}mm</p>
                            <div className="mt-2 flex gap-2"><button onClick={async () => { try { await saveLabelPdf(template, sheetLabels); } catch (e) { setError(e.message); } }} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 flex items-center gap-1"><Download size={14} /> Save sample PDF</button></div>
                        </div>
                        <div className="px-4 py-2 border-t border-slate-200 bg-white text-[11px] text-slate-500 font-bold">Designer is for template creation/editing. Use <button onClick={() => setActiveTab('assign')} className="text-emerald-700 underline">Assign &amp; Print</button> to enter values, queue and print.</div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Section({ title, children }) { return <div className="bg-white rounded-lg border border-slate-200 p-3"><h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">{title}</h4>{children}</div>; }
function NumField({ label, value, onChange, step = 1 }) { return <label className="block"><span className="text-[10px] font-bold text-slate-500">{label}</span><input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="w-full px-2 py-1 border border-slate-300 rounded text-sm font-bold" /></label>; }

const MM_PT = 2.83465; // pt per mm — the PDF's unit; used to size on-screen fonts to match print 1:1

/** Read-only field rendering (text wraps — no horizontal clip — or vector barcode).
 *  `zoom` is the view's px-per-mm so the font renders at the same physical size as the PDF. */
function FieldContent({ template, f, ctx, zoom = 3.78 }) {
    if (isBarcodeField(f)) {
        let svg = renderBarcodeSvg(resolveFieldText(f, ctx), { ...template.barcode, format: template.barcode.format }) || '';
        // height:100% + the SVG's viewBox/meet ⇒ contain (fit-center, aspect preserved) — matches the PDF.
        svg = svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ');
        return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: svg }} />;
    }
    if (isQrField(f)) {
        let svg = renderQrSvg(resolveQrText(f, ctx), { ecLevel: f.qrEc }) || '';
        svg = svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" ');
        return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: svg }} />;
    }
    const t = resolveFieldText(f, ctx);
    const justify = f.font?.align === 'left' ? 'flex-start' : f.font?.align === 'right' ? 'flex-end' : 'center';
    // px = size(pt) × (px/mm) ÷ (pt/mm) → identical physical size to the printed PDF (no ×1.2 fudge).
    const fontPx = (f.font?.size || 7) * zoom / MM_PT;
    return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: justify, textAlign: f.font?.align || 'center', fontFamily: f.font?.family || 'Helvetica', fontSize: fontPx, fontWeight: f.font?.bold ? 800 : 400, lineHeight: 1.05, overflow: 'hidden', whiteSpace: 'normal', wordBreak: 'break-word' }}>{t}</div>;
}

const EDIT_Z = 6;
/** Editable canvas with a visible inner safe-area; dragging/resizing is clamped to it. */
function StickerCanvas({ template, ctx, selectedIdx, onSelect, onChangeField }) {
    const drag = useRef(null);
    const inner = template.layout.inner;
    const Wmm = template.size.widthMm, Hmm = template.size.heightMm;
    useEffect(() => {
        function move(e) {
            const d = drag.current; if (!d) return;
            const dx = (e.clientX - d.sx) / EDIT_Z, dy = (e.clientY - d.sy) / EDIT_Z;
            const f = template.fields[d.idx]; if (!f) return;
            if (d.mode === 'move') onChangeField(d.idx, { x: round1(clamp(d.ox + dx, inner.left, Wmm - inner.right - f.w)), y: round1(clamp(d.oy + dy, inner.top, Hmm - inner.bottom - f.h)) });
            else onChangeField(d.idx, { w: round1(clamp(d.ow + dx, 4, Wmm - inner.right - f.x)), h: round1(clamp(d.oh + dy, 2.5, Hmm - inner.bottom - f.y)) });
        }
        function up() { drag.current = null; }
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
        return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    }, [template, onChangeField, inner, Wmm, Hmm]);
    const startMove = (e, idx) => { e.preventDefault(); onSelect(idx); const f = template.fields[idx]; drag.current = { mode: 'move', idx, sx: e.clientX, sy: e.clientY, ox: f.x, oy: f.y }; };
    const startResize = (e, idx) => { e.stopPropagation(); e.preventDefault(); onSelect(idx); const f = template.fields[idx]; drag.current = { mode: 'resize', idx, sx: e.clientX, sy: e.clientY, ow: f.w, oh: f.h }; };
    return (
        <div className="relative bg-white border-2 border-dashed border-slate-400 shadow-md select-none" style={{ width: Wmm * EDIT_Z, height: Hmm * EDIT_Z }} onMouseDown={() => onSelect(-1)}>
            {/* inner safe-area guide */}
            <div className="absolute pointer-events-none border border-dashed border-emerald-300" style={{ left: inner.left * EDIT_Z, top: inner.top * EDIT_Z, width: (Wmm - inner.left - inner.right) * EDIT_Z, height: (Hmm - inner.top - inner.bottom) * EDIT_Z }} />
            {template.fields.map((f, idx) => {
                if (!f.visible) return null;
                const sel = idx === selectedIdx;
                return (
                    <div key={idx} onMouseDown={(e) => { e.stopPropagation(); startMove(e, idx); }} style={{ position: 'absolute', left: f.x * EDIT_Z, top: f.y * EDIT_Z, width: f.w * EDIT_Z, height: f.h * EDIT_Z, overflow: 'hidden', cursor: 'move', boxSizing: 'border-box', outline: sel ? '1.5px solid #10b981' : '1px dashed #cbd5e1' }}>
                        <FieldContent template={template} f={f} ctx={ctx} zoom={EDIT_Z} />
                        {sel && <div onMouseDown={(e) => startResize(e, idx)} style={{ position: 'absolute', right: -4, bottom: -4, width: 9, height: 9, background: '#10b981', cursor: 'nwse-resize', borderRadius: 2 }} />}
                    </div>
                );
            })}
        </div>
    );
}

const PXMM = 3.78;
function SheetPreview({ template, labels }) {
    const W = template.size.widthMm * PXMM, H = template.size.heightMm * PXMM;
    const perRow = Math.max(1, template.layout.perRow || 1), perCol = Math.max(1, template.layout.perColumn || 1);
    const gx = (template.layout.gapXmm || 0) * PXMM, gy = (template.layout.gapYmm || 0) * PXMM;
    const o = template.layout.outer, i = template.layout.inner;
    const pageW = (o.left + o.right) * PXMM + perRow * W + (perRow - 1) * gx, pageH = (o.top + o.bottom) * PXMM + perCol * H + (perCol - 1) * gy;
    const scale = Math.min(1, 520 / pageW, 560 / pageH);
    const cells = Array.from({ length: perRow * perCol }, (_, k) => labels[k] || null);
    const sRight = template.size.widthMm - i.right, sBottom = template.size.heightMm - i.bottom;
    return (
        <div style={{ width: pageW * scale, height: pageH * scale }}>
            <div className="bg-white shadow-md ring-1 ring-slate-300" style={{ width: pageW, height: pageH, paddingLeft: o.left * PXMM, paddingTop: o.top * PXMM, paddingRight: o.right * PXMM, paddingBottom: o.bottom * PXMM, boxSizing: 'border-box', transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${perRow}, ${W}px)`, gridAutoRows: `${H}px`, columnGap: gx, rowGap: gy }}>
                    {cells.map((ctx, k) => (
                        <div key={k} className="relative border border-dashed border-slate-300 bg-white overflow-hidden" style={{ width: W, height: H }}>
                            {ctx && template.fields.filter((f) => f.visible).map((f, j) => {
                                const fx = clamp(f.x, i.left, Math.max(i.left, sRight - 1)), fy = clamp(f.y, i.top, Math.max(i.top, sBottom - 1));
                                const fw = clamp(f.w, 1, sRight - fx), fh = clamp(f.h, 1, sBottom - fy);
                                return <div key={j} style={{ position: 'absolute', left: fx * PXMM, top: fy * PXMM, width: fw * PXMM, height: fh * PXMM, overflow: 'hidden' }}><FieldContent template={template} f={f} ctx={ctx} zoom={PXMM} /></div>;
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
