import { resolveFieldText, isBarcodeField, isQrField, resolveQrText } from './label-fields.js';
import { getPdfMake } from '../print/pdfmake';
import { renderBarcodeSvg, renderQrSvg } from './barcode-render.js';
import { DEFAULT_OUTER, DEFAULT_INNER } from './label-templates.js';

/**
 * pdfmake label builder. Render hierarchy:
 *   Page → OUTER margin → sticker grid → sticker cell → INNER (safe) margin → fields.
 *
 * Each field is clamped to the sticker's safe rect so nothing clips on the
 * edges; text wraps within its width (no horizontal cut) and the barcode width
 * stays inside the printable area. Barcode symbology is TEMPLATE-level
 * (template.barcode.format). Output uses pdfmake's embedded font + a vector SVG
 * barcode → driver-based, printer-font-independent (Citizen/Zebra/TSC/generic).
 */

const MM = 2.83465;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Intrinsic px size of a jsbarcode SVG, for aspect-correct fit-centering. */
function svgSize(svg) {
    const tag = /<svg[^>]*>/i.exec(svg || '');
    if (!tag) return null;
    const w = /\bwidth="([\d.]+)/i.exec(tag[0]);
    const h = /\bheight="([\d.]+)/i.exec(tag[0]);
    const W = w ? parseFloat(w[1]) : 0, H = h ? parseFloat(h[1]) : 0;
    if (W > 0 && H > 0) return { w: W, h: H };
    // Fall back to the viewBox ("minX minY width height") when width/height are absent.
    const vb = /viewBox="\s*[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)/i.exec(tag[0]);
    if (vb) { const vW = parseFloat(vb[1]), vH = parseFloat(vb[2]); if (vW > 0 && vH > 0) return { w: vW, h: vH }; }
    return null;
}

/** Rough wrapped-line count, to vertically centre multi-line text in its box. */
function estLines(text, boxWpt, fontSizePt) {
    const perLine = Math.max(1, Math.floor(boxWpt / (fontSizePt * 0.52)));
    let lines = 0;
    for (const seg of String(text).split('\n')) lines += Math.max(1, Math.ceil(seg.length / perLine));
    return Math.max(1, lines);
}



export function expandLabels(queue, company) {
    const out = [];
    for (const q of queue || []) {
        const copies = Math.max(1, parseInt(q.copies, 10) || 1);
        const item = q.item || q;
        const overrides = q.overrides || {};
        for (let i = 0; i < copies; i++) out.push({ item, company, overrides });
    }
    return out;
}

/** Absolute-positioned, safe-clamped pdfmake nodes for one label at (oxPt,oyPt). */
function fieldNodes(template, ctx, oxPt, oyPt, svgCache) {
    const inner = template.layout.inner || DEFAULT_INNER;
    const Wmm = template.size.widthMm, Hmm = template.size.heightMm;
    const sLeft = inner.left, sTop = inner.top;
    const sRight = Wmm - inner.right, sBottom = Hmm - inner.bottom;
    const fmt = template.barcode.format || 'AUTO';
    const nodes = [];
    for (const f of template.fields) {
        if (!f.visible) continue;
        // Clamp the WHOLE box (x, y, w AND h) into the safe area, so neither text nor
        // barcode can overflow the sticker edges into the neighbouring label.
        const minW = 1, minH = 1;
        const fx = clamp(Number(f.x) || 0, sLeft, Math.max(sLeft, sRight - minW));
        const fy = clamp(Number(f.y) || 0, sTop, Math.max(sTop, sBottom - minH));
        const fw = clamp(Number(f.w) || 10, minW, sRight - fx);
        const fh = clamp(Number(f.h) || 4, minH, sBottom - fy);
        const x = oxPt + fx * MM, y = oyPt + fy * MM, w = fw * MM, h = fh * MM;
        if (isBarcodeField(f)) {
            const val = resolveFieldText(f, ctx);
            const key = `${val}|${fmt}`;
            if (!svgCache.has(key)) svgCache.set(key, renderBarcodeSvg(val, { ...template.barcode, format: fmt }) || null);
            const svg = svgCache.get(key);
            if (!svg) continue;
            const sz = svgSize(svg);
            if (sz) {
                // Fit-center (contain): scale uniformly to fit the box, centre both axes.
                const scale = Math.min(w / sz.w, h / sz.h);
                const dw = sz.w * scale, dh = sz.h * scale;
                nodes.push({ svg, width: dw, height: dh, absolutePosition: { x: x + (w - dw) / 2, y: y + (h - dh) / 2 } });
            } else {
                nodes.push({ svg, width: w, absolutePosition: { x, y } });
            }
        } else if (isQrField(f)) {
            const val = resolveQrText(f, ctx);
            const key = `qr|${val}|${f.qrEc || 'M'}`;
            if (!svgCache.has(key)) svgCache.set(key, renderQrSvg(val, { ecLevel: f.qrEc }) || null);
            const svg = svgCache.get(key);
            if (!svg) continue;
            const sz = svgSize(svg) || { w: 1, h: 1 };
            // QR is square → fit-center (contain) keeps it square, centred, no stretch/clip.
            const scale = Math.min(w / sz.w, h / sz.h);
            const dw = sz.w * scale, dh = sz.h * scale;
            nodes.push({ svg, width: dw, height: dh, absolutePosition: { x: x + (w - dw) / 2, y: y + (h - dh) / 2 } });
        } else {
            const text = resolveFieldText(f, ctx);
            if (!text) continue;
            const fontSize = f.font?.size || 7;
            // Vertically centre the text within [y, y+h] — mirrors the designer canvas's
            // flex centering (was top-anchored before, ignoring field height).
            const textH = estLines(text, w, fontSize) * fontSize * 1.15;
            const ty = y + Math.max(0, (h - textH) / 2);
            // width set → pdfmake wraps instead of clipping horizontally.
            nodes.push({ text, absolutePosition: { x, y: ty }, width: w, fontSize, bold: !!f.font?.bold, alignment: f.font?.align || 'center' });
        }
    }
    return nodes;
}

export function buildLabelDoc(template, labels) {
    const W = template.size.widthMm * MM, H = template.size.heightMm * MM;

    /*
     * On a roll the page is the sticker. One per page, no grid, no outer
     * margin — the printer's gap sensor finds the next label, and any margin
     * we add here is margin the sticker does not have, which walks every
     * field off the edge.
     */
    const roll = template.output !== 'SHEET';
    const perRow = roll ? 1 : Math.max(1, template.layout.perRow || 1);
    const perCol = roll ? 1 : Math.max(1, template.layout.perColumn || 1);
    const gapX = roll ? 0 : (template.layout.gapXmm || 0) * MM;
    const gapY = roll ? 0 : (template.layout.gapYmm || 0) * MM;
    const outer = roll ? { top: 0, left: 0, right: 0, bottom: 0 } : (template.layout.outer || DEFAULT_OUTER);
    const oL = outer.left * MM, oR = outer.right * MM, oT = outer.top * MM, oB = outer.bottom * MM;

    const pageWidth = oL + oR + perRow * W + (perRow - 1) * gapX;
    const pageHeight = oT + oB + perCol * H + (perCol - 1) * gapY;
    const perPage = perRow * perCol;

    const svgCache = new Map();
    const content = [];
    for (let p = 0; p < labels.length; p += perPage) {
        const pageLabels = labels.slice(p, p + perPage);
        pageLabels.forEach((ctx, i) => {
            const col = i % perRow, row = Math.floor(i / perRow);
            const ox = oL + col * (W + gapX);
            const oy = oT + row * (H + gapY);
            for (const node of fieldNodes(template, ctx, ox, oy, svgCache)) content.push(node);
        });
        if (p + perPage < labels.length) content.push({ text: '', pageBreak: 'after' });
    }
    if (content.length === 0) content.push({ text: 'No labels selected.', absolutePosition: { x: 20, y: 20 } });

    return { pageSize: { width: pageWidth, height: pageHeight }, pageMargins: [0, 0, 0, 0], content, defaultStyle: { fontSize: 7, lineHeight: 1 } };
}

async function createLabelPdf(template, labels) {
    const pdfMake = await getPdfMake();
    return pdfMake.createPdf(buildLabelDoc(template, labels));
}
/** Base64 of the label PDF — for direct-to-printer sending via QZ Tray. */
export async function getLabelPdfBase64(template, labels) {
    const pdf = await createLabelPdf(template, labels);
    return new Promise((resolve, reject) => {
        try { Promise.resolve(pdf.getBase64()).then(resolve, reject); } catch (e) { reject(e); }
    });
}
/* Awaited: in pdfmake 0.3 these return promises, and an un-awaited failure
   would tell the operator the labels printed when nothing reached the printer. */
export async function openLabelPdf(template, labels) { await (await createLabelPdf(template, labels)).open(); }
export async function saveLabelPdf(template, labels) { await (await createLabelPdf(template, labels)).download(`labels-${template.name || 'sheet'}.pdf`); }
export async function printLabelPdf(template, labels) { await (await createLabelPdf(template, labels)).print(); }
