import JsBarcode from 'jsbarcode';
import qrcode from 'qrcode-generator';

/**
 * Resolve a requested per-item barcode TYPE to a concrete jsbarcode symbology,
 * validating the value's digit length and falling back to Code128 when it does
 * not fit (e.g. a 7-digit value requested as EAN-13 → Code128).
 *   AUTO    → EAN13 (13 digits) / EAN8 (8 digits) / else Code128
 *   EAN13   → EAN13 if 13 digits, else Code128
 *   EAN8    → EAN8 if 8 digits, else Code128
 *   CODE128 → Code128
 *   CUSTOM  → Code128 (free-form value)
 */
export function resolveBarcodeFormat(type, value) {
    const v = String(value || '').trim();
    const t = String(type || 'AUTO').toUpperCase();
    if (t === 'EAN13') return /^\d{13}$/.test(v) ? 'EAN13' : 'CODE128';
    if (t === 'EAN8') return /^\d{8}$/.test(v) ? 'EAN8' : 'CODE128';
    if (t === 'CODE128' || t === 'CUSTOM') return 'CODE128';
    // AUTO
    if (/^\d{13}$/.test(v)) return 'EAN13';
    if (/^\d{8}$/.test(v)) return 'EAN8';
    return 'CODE128';
}

/**
 * Render a barcode value to an SVG string (browser). `opts.format` is the
 * requested per-item type (AUTO/EAN13/EAN8/CODE128/CUSTOM); the actual symbology
 * is resolved (with Code128 fallback) by resolveBarcodeFormat. Vector → crisp on
 * thermal printers and embeddable in pdfmake.
 */
export function renderBarcodeSvg(value, opts = {}) {
    const v = String(value || '').trim();
    if (!v || typeof document === 'undefined') return '';
    const format = resolveBarcodeFormat(opts.format, v);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const common = {
        height: Math.max(20, (opts.heightMm || 9) * 3.78),
        width: opts.moduleWidth || 1.2,
        displayValue: opts.showText !== false,
        margin: 2,
        fontSize: opts.fontSize || 12,
        textMargin: 1,
    };
    try {
        JsBarcode(svg, v, { format, ...common });
    } catch {
        try {
            JsBarcode(svg, v, { format: 'CODE128', ...common });
        } catch {
            return '';
        }
    }
    let out = new XMLSerializer().serializeToString(svg);
    // Inject a viewBox + "meet" so the SVG scales to CONTAIN (fit + centre, aspect
    // ratio preserved) whenever a consumer sizes it with width/height. This gives the
    // designer canvas and the printed PDF identical barcode geometry (no stretch).
    const open = /<svg[^>]*>/i.exec(out);
    if (open && !/viewBox=/i.test(open[0])) {
        const w = /\bwidth="([\d.]+)/i.exec(open[0]);
        const h = /\bheight="([\d.]+)/i.exec(open[0]);
        if (w && h) {
            out = out.replace(
                open[0],
                open[0].replace('<svg ', `<svg viewBox="0 0 ${w[1]} ${h[1]}" preserveAspectRatio="xMidYMid meet" `),
            );
        }
    }
    return out;
}

/**
 * Render a QR code value to an SVG string. The QR is always square; the SVG carries
 * width/height + a viewBox + "xMidYMid meet" so consumers can size it to CONTAIN
 * (fit-center, aspect preserved) — identical geometry on the designer canvas and the
 * printed PDF. `opts.ecLevel` = L | M | Q | H (error correction; default M).
 */
export function renderQrSvg(value, opts = {}) {
    const v = String(value || '').trim();
    if (!v) return '';
    try {
        const ec = ['L', 'M', 'Q', 'H'].includes(opts.ecLevel) ? opts.ecLevel : 'M';
        const qr = qrcode(0, ec); // typeNumber 0 = auto-fit to the data length
        qr.addData(v);
        qr.make();
        let svg = qr.createSvgTag({ cellSize: 4, margin: opts.margin != null ? opts.margin : 1 });
        // The lib centers with xMinYMin; switch to xMidYMid so it centers in its box.
        return svg.replace(/preserveAspectRatio="[^"]*"/i, 'preserveAspectRatio="xMidYMid meet"');
    } catch {
        return '';
    }
}
