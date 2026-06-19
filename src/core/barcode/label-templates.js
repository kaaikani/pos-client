/**
 * Label template model + persistence (frontend-owned; localStorage). Saved
 * templates store DESIGN/LAYOUT ONLY — never item values (those are temporary
 * print-time overrides entered on the Assign page).
 *
 * Margin hierarchy:  Page → OUTER margin → sticker grid → sticker cell →
 *                    INNER (safe) margin → fields.
 *
 * Template shape:
 * {
 *   name, printer,
 *   size:   { preset, widthMm, heightMm },
 *   layout: { perRow, perColumn, gapXmm, gapYmm,
 *             outer:{ top,left,right,bottom },   // moves whole grid on paper
 *             inner:{ top,left,right,bottom } },  // safe area inside each sticker
 *   font:   { family, size, bold },
 *   barcode:{ format, heightMm, showText, moduleWidth },  // format = template-level type
 *   fields: [ { key|custom, cid?, label?, value?, visible, x, y, w, h, font } ]
 * }
 */
import { FIELD_REGISTRY, FIELD_MAP } from './label-fields.js';

export const SIZE_PRESETS = {
    '35x22': { label: '35 × 22 mm', widthMm: 35, heightMm: 22 },
    '50x25': { label: '50 × 25 mm', widthMm: 50, heightMm: 25 },
    '40x30': { label: '40 × 30 mm', widthMm: 40, heightMm: 30 },
    '65x35': { label: '65 × 35 mm', widthMm: 65, heightMm: 35 },
    custom: { label: 'Custom', widthMm: 50, heightMm: 30 },
};
export const FONT_FAMILIES = ['Helvetica', 'Roboto', 'Courier', 'Times'];
export const PRINTER_PRESETS = {
    generic: { label: 'Generic Thermal', widthMm: 50 },
    citizen: { label: 'Citizen', widthMm: 50 },
    zebra: { label: 'Zebra', widthMm: 57 },
    tsc: { label: 'TSC', widthMm: 50 },
};
export const BARCODE_FORMATS = ['AUTO', 'EAN13', 'EAN8', 'CODE128'];

export const DEFAULT_OUTER = { top: 4, left: 4, right: 4, bottom: 4 };
export const DEFAULT_INNER = { top: 1.5, left: 1.5, right: 1.5, bottom: 1.5 };

const DEFAULT_VISIBLE = new Set(['companyName', 'itemName', 'mrpRate', 'barcodeValue']);
const isBarcodeKey = (f) => !f.custom && FIELD_MAP[f.key]?.type === 'barcode';

/** Printable safe rect (mm) inside a sticker, after the inner margin. */
export function safeRect(template) {
    const i = template.layout.inner || DEFAULT_INNER;
    return {
        x: i.left, y: i.top,
        w: Math.max(2, template.size.widthMm - i.left - i.right),
        h: Math.max(2, template.size.heightMm - i.top - i.bottom),
    };
}

/** Auto-stack VISIBLE fields top-to-bottom INSIDE the safe area. */
export function autoLayoutFields(fields, size, barcode, inner = DEFAULT_INNER) {
    const x0 = inner.left, y0 = inner.top;
    const fullW = Math.max(6, size.widthMm - inner.left - inner.right);
    const bottom = size.heightMm - inner.bottom;
    let y = y0;
    return fields.map((f) => {
        // QR is square — keep its own size, just stack it; never stretch to full width.
        if (f.qr) {
            const h = Math.max(8, Math.min(f.h || fullW, fullW, bottom - y0));
            const w = Math.min(f.w || h, fullW);
            if (!f.visible) return { ...f, x: f.x ?? x0, y: f.y ?? y0, w: f.w ?? w, h: f.h ?? h };
            const placed = { ...f, x: x0, y: Math.min(y, Math.max(y0, bottom - h)), w, h };
            y = placed.y + h + 0.6;
            return placed;
        }
        const isBc = isBarcodeKey(f);
        const h = isBc ? (barcode?.heightMm || 9) + (barcode?.showText ? 3 : 0) : Math.max(3, (f.font?.size || 7) * 0.5);
        if (!f.visible) return { ...f, x: f.x ?? x0, y: f.y ?? y0, w: f.w ?? fullW, h: f.h ?? h };
        const placed = { ...f, x: x0, y: Math.min(y, Math.max(y0, bottom - h)), w: fullW, h };
        y = placed.y + h + 0.6;
        return placed;
    });
}

/** Reset both margin layers to defaults. */
export function resetMargins(template) {
    return { ...template, layout: { ...template.layout, outer: { ...DEFAULT_OUTER }, inner: { ...DEFAULT_INNER } } };
}

/** Horizontally center every visible field within the safe area (clamps width). */
export function autoCenterFields(template) {
    const r = safeRect(template);
    return {
        ...template,
        fields: template.fields.map((f) => {
            if (!f.visible) return f;
            const w = Math.min(f.w, r.w);
            return { ...f, w, x: Math.round((r.x + (r.w - w) / 2) * 10) / 10, font: { ...f.font, align: 'center' } };
        }),
    };
}

export function makeDefaultTemplate(name = 'Default') {
    const size = { preset: '50x25', widthMm: 50, heightMm: 25 };
    const barcode = { format: 'AUTO', heightMm: 9, showText: true, moduleWidth: 1.2 };
    const inner = { ...DEFAULT_INNER };
    const fields = FIELD_REGISTRY.map((f) => ({
        key: f.key,
        visible: f.mandatory || DEFAULT_VISIBLE.has(f.key),
        x: inner.left, y: inner.top, w: 47, h: 3,
        font: { family: 'Helvetica', size: f.key === 'itemName' ? 9 : 7, bold: f.key === 'companyName' || f.key === 'itemName', align: 'center' },
    }));
    return {
        name, printer: 'generic', size,
        layout: { perRow: 2, perColumn: 5, gapXmm: 2, gapYmm: 2, outer: { ...DEFAULT_OUTER }, inner },
        font: { family: 'Helvetica', size: 8, bold: false },
        barcode,
        fields: autoLayoutFields(fields, size, barcode, inner),
    };
}

export function cloneTemplate(t) { return JSON.parse(JSON.stringify(t)); }

const STORAGE_KEY = 'pos_label_templates';
const ACTIVE_KEY = 'pos_label_active_template';

export function listTemplates() {
    try { const a = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function saveTemplate(template) {
    const list = listTemplates().filter((t) => t.name !== template.name);
    list.push(cloneTemplate(template));
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); setActiveTemplate(template); } catch {}
    return list;
}
export function deleteTemplate(name) {
    const list = listTemplates().filter((t) => t.name !== name);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
    return list;
}
export function setActiveTemplate(template) { try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(template)); } catch {} }
export function getActiveTemplate() {
    try { const raw = localStorage.getItem(ACTIVE_KEY); if (raw) return normalizeTemplate(JSON.parse(raw)); } catch {}
    return null;
}

/** Migrate older templates: ensure margins (outer/inner), barcode.format, custom cid, field boxes. */
export function normalizeTemplate(t) {
    const base = makeDefaultTemplate(t.name || 'Template');
    const outer = t.layout?.outer || (t.layout?.marginMm != null ? { top: t.layout.marginMm, left: t.layout.marginMm, right: t.layout.marginMm, bottom: t.layout.marginMm } : { ...DEFAULT_OUTER });
    const inner = t.layout?.inner || { ...DEFAULT_INNER };
    const merged = {
        ...base, ...t,
        size: { ...base.size, ...t.size },
        layout: { ...base.layout, ...t.layout, outer, inner },
        font: { ...base.font, ...t.font },
        barcode: { ...base.barcode, ...t.barcode, format: t.barcode?.format || 'AUTO' },
        printer: t.printer || base.printer,
    };
    delete merged.layout.marginMm;
    const present = new Set((t.fields || []).filter((f) => !f.custom && !f.qr).map((f) => f.key));
    const missing = base.fields.filter((f) => !present.has(f.key)).map((f) => ({ ...f, visible: false }));
    merged.fields = [
        ...(t.fields || []).map((f, i) => ({ x: 1, y: 1, w: 47, h: 3, font: { family: 'Helvetica', size: 7, bold: false, align: 'center' }, ...f, cid: f.custom ? f.cid || 'c' + i : f.cid })),
        ...missing,
    ];
    return merged;
}
