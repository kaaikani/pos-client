/**
 * QZ Tray bridge — direct-to-printer printing for the billing PC.
 *
 * QZ Tray (https://qz.io) is a small free app the operator installs once. It runs
 * locally and exposes the OS's installed printers to the browser over a local
 * WebSocket, then prints WITHOUT the browser print dialog. Unsigned/dev mode shows
 * a one-time "Allow" prompt. If QZ Tray isn't running, callers fall back to the
 * normal browser print path.
 *
 * qz-tray is imported dynamically (client-only) so it never runs during SSR/build.
 */

let _qzPromise = null;

async function getQz() {
    if (!_qzPromise) {
        _qzPromise = (async () => {
            const mod = await import('qz-tray');
            const qz = mod.default || mod;
            // Unsigned (dev): no certificate / no signature → QZ asks the user to allow.
            // For production, replace these with a real signed cert + signature.
            qz.security.setCertificatePromise((resolve) => resolve(null));
            qz.security.setSignaturePromise(() => (resolve) => resolve(null));
            return qz;
        })();
    }
    return _qzPromise;
}

/** Connect to a running QZ Tray instance (reuses an active socket). Throws if not running. */
export async function qzConnect() {
    const qz = await getQz();
    if (!qz.websocket.isActive()) {
        await qz.websocket.connect({ retries: 1, delay: 1 });
    }
    return qz;
}

/** True if QZ Tray is installed + running and we can talk to it. */
export async function qzIsAvailable() {
    try { await qzConnect(); return true; } catch { return false; }
}

/** List installed printers + the OS default. Throws if QZ Tray isn't running. */
export async function qzListPrinters() {
    const qz = await qzConnect();
    const found = await qz.printers.find();
    const printers = (Array.isArray(found) ? found : found ? [found] : []).filter(Boolean);
    let osDefault = '';
    try { osDefault = (await qz.printers.getDefault()) || ''; } catch { osDefault = ''; }
    return { printers, osDefault };
}

/** Send a base64 PDF straight to the named printer (no browser dialog). */
export async function qzPrintPdfBase64(printerName, base64) {
    const qz = await qzConnect();
    const cfg = qz.configs.create(printerName, { units: 'mm' });
    await qz.print(cfg, [{ type: 'pixel', format: 'pdf', flavor: 'base64', data: base64 }]);
}
