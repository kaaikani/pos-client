/**
 * Dynamic label field registry. Each field separates `raw(ctx)` (the underlying
 * value from item/company) from `fmt(value)` (display string), so a print-time
 * OVERRIDE entered on the Assign page can be formatted identically to the master
 * value. Resolution priority: Manual override > Item-master value > default.
 *
 * Overrides are temporary print-time values (ctx.overrides) — they never mutate
 * item-master data and are not part of the saved template (which is layout only).
 */

// Tolerant numeric parse — extracts the number from values like "150", "₹150", "MRP 150".
const num = (v) => { const t = String(v ?? '').trim(); if (!t) return NaN; const n = Number(t.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? NaN : n; };
const money = (v) => { const n = num(v); return isNaN(n) ? '' : '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const s = (v) => (v == null ? '' : String(v));
// Prepend `p` unless the value already starts with it (case-insensitive) — avoids double prefixes.
const pre = (p, v) => { const t = String(v ?? '').trim(); if (!t) return ''; return t.toLowerCase().startsWith(p.trim().toLowerCase()) ? t : p + t; };

export const FIELD_REGISTRY = [
    { key: 'companyName', label: 'Company Name', mandatory: true, editable: true, raw: (c) => c.company?.name || c.company?.companyName || '', fmt: s },
    { key: 'itemName', label: 'Item Name', raw: (c) => c.item?.itemName, fmt: s },
    { key: 'salesRate', label: 'Sales Rate', editable: true, raw: (c) => c.item?.salesRate, fmt: money },
    { key: 'mrpRate', label: 'MRP Rate', editable: true, raw: (c) => c.item?.mrpRate, fmt: (v) => { const m = money(v); return m ? 'MRP ' + m : ''; } },
    { key: 'costRate', label: 'Cost Rate', editable: true, raw: (c) => c.item?.costRate, fmt: (v) => { const m = money(v); return m ? 'Cost ' + m : ''; } },
    { key: 'batchNo', label: 'Batch No', editable: true, raw: (c) => c.item?.batchNo, fmt: (v) => pre('B.No: ', v) },
    { key: 'expiryDate', label: 'Expiry Date', editable: true, raw: (c) => c.item?.expiryDate, fmt: (v) => pre('Exp: ', v) },
    { key: 'hsnCode', label: 'HSN Code', editable: true, raw: (c) => c.item?.hsnCode, fmt: (v) => pre('HSN: ', v) },
    { key: 'code', label: 'SKU / Item Code', raw: (c) => c.item?.code, fmt: (v) => pre('SKU: ', v) },
    { key: 'unit', label: 'Unit', editable: true, raw: (c) => c.item?.unit, fmt: s },
    { key: 'gstPercent', label: 'Tax %', editable: true, raw: (c) => c.item?.gstPercent, fmt: (v) => { const n = num(v); return isNaN(n) ? '' : 'GST ' + n + '%'; } },
    { key: 'category', label: 'Category', editable: true, raw: (c) => c.item?.category, fmt: s },
    { key: 'brand', label: 'Brand', editable: true, raw: (c) => c.item?.brand, fmt: s },
    { key: 'weight', label: 'Weight / Size', editable: true, raw: (c) => c.item?.size || c.item?.packingUnit, fmt: s },
    { key: 'supplier', label: 'Supplier Name', editable: true, raw: (c) => c.item?.mfr, fmt: s },
    { key: 'barcodeValue', label: 'Barcode Value', type: 'barcode', raw: (c) => c.item?.barcode, fmt: s },
];

export const FIELD_MAP = FIELD_REGISTRY.reduce((m, f) => { m[f.key] = f; return m; }, {});

/** Editable field keys (used to build the Assign-page override columns). */
export const EDITABLE_KEYS = FIELD_REGISTRY.filter((f) => f.editable).map((f) => f.key);

/** Stable override key for a custom field. */
export function customKey(fieldCfg) {
    return 'custom:' + (fieldCfg.cid || fieldCfg.label || '');
}

/**
 * Resolve a field config's display value within an { item, company, overrides }
 * context. Priority: manual override > master value > default.
 */
export function resolveFieldText(fieldCfg, ctx) {
    const ov = ctx?.overrides || {};
    if (fieldCfg.custom) {
        const v = ov[customKey(fieldCfg)];
        return v != null && v !== '' ? String(v) : fieldCfg.value || '';
    }
    const def = FIELD_MAP[fieldCfg.key];
    if (!def) return '';
    const o = ov[fieldCfg.key];
    const hasOverride = o != null && String(o).trim() !== '';
    const raw = hasOverride ? o : def.raw(ctx);
    const out = def.fmt ? def.fmt(raw) : s(raw);
    // On a manual override, never blank the user's input just because the formatter
    // rejected it (e.g. a non-numeric price) — fall back to the typed text.
    if (hasOverride && !out) return String(o).trim();
    return out;
}

/** Raw master value (for showing as an editable-cell placeholder). */
export function masterRaw(key, item, company) {
    const def = FIELD_MAP[key];
    return def ? def.raw({ item, company }) : '';
}

export function isBarcodeField(fieldCfg) {
    return !fieldCfg.custom && !fieldCfg.qr && FIELD_MAP[fieldCfg.key]?.type === 'barcode';
}

/** A QR field (carries `qr: true`). Its encoded content is chosen via `qrSource`. */
export function isQrField(fieldCfg) {
    return !!fieldCfg?.qr;
}

/** Selectable QR content sources shown in the Label Designer. */
export const QR_SOURCES = [
    { key: 'barcodeValue', label: 'Barcode Number' },
    { key: 'itemName', label: 'Item Name' },
    { key: 'code', label: 'SKU' },
    { key: 'salesRate', label: 'Price' },
    { key: 'batchNo', label: 'Batch' },
    { key: 'expiryDate', label: 'Expiry' },
    { key: 'custom', label: 'Custom Text' },
];

/**
 * Resolve the RAW string a QR field encodes (the data, not the display label).
 * Honors print-time overrides for the chosen source; 'custom' uses fieldCfg.qrText.
 */
export function resolveQrText(fieldCfg, ctx) {
    const src = fieldCfg.qrSource || 'barcodeValue';
    if (src === 'custom') return String(fieldCfg.qrText || '');
    const def = FIELD_MAP[src];
    if (!def) return '';
    const ov = ctx?.overrides || {};
    const o = ov[src];
    const raw = o != null && String(o).trim() !== '' ? o : def.raw(ctx);
    return s(raw);
}
