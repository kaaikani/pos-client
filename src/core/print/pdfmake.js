/**
 * pdfmake, loaded once, with its fonts actually attached.
 *
 * This exists because the same eleven lines were copied into the bill printer
 * and the label printer, and both copies were wrong in the same way — so every
 * PDF in the application silently failed to draw.
 *
 * What went wrong: the loader looked for the font table at four paths
 *
 *     mod.vfs · mod.default.vfs · mod.pdfMake.vfs · mod.default.pdfMake.vfs
 *
 * and pdfmake 0.3 puts it at none of them. Its `vfs_fonts.js` ends with
 * `module.exports = vfs`, so through ESM interop the font table IS
 * `mod.default` — the object itself, not a `.vfs` property of anything. All
 * four lookups returned undefined, and the line that used the result read
 *
 *     if (vfs) pdfMake.vfs = vfs;
 *
 * so nothing was assigned and nothing was reported. pdfmake then waited for a
 * font it would never be given: `getBase64` never called its callback, the
 * promise awaiting it never settled, and the preview pane sat empty with no
 * error anywhere. A silent `if` around a required step is what turned a
 * one-line version difference into an invisible failure.
 *
 * So this module does two things differently. It RECOGNISES the font table
 * instead of guessing where it lives — a vfs is a flat map of font filenames
 * to base64, and that is checkable — and it THROWS when it cannot find one,
 * because a printer with no fonts is not a degraded printer, it is a broken
 * one, and the operator needs to be told rather than left watching nothing
 * happen.
 */

let _promise = null;

/** The shared pdfmake instance, fonts attached. Throws if fonts are missing. */
export async function getPdfMake() {
    if (!_promise) {
        _promise = load().catch((e) => {
            // Don't cache a failure: a reload, or a fixed dependency, should be
            // able to succeed without a page refresh.
            _promise = null;
            throw e;
        });
    }
    return _promise;
}

async function load() {
    const [makeMod, fontsMod] = await Promise.all([
        import('pdfmake/build/pdfmake'),
        import('pdfmake/build/vfs_fonts'),
    ]);
    const pdfMake = makeMod.default || makeMod;

    const vfs = resolveVfs(fontsMod);
    if (!vfs) {
        throw new Error(
            'The PDF fonts could not be loaded, so nothing can be printed. '
            + 'This is a problem with the pdfmake package, not with your template.',
        );
    }

    // 0.3 prefers addVirtualFileSystem, which merges rather than replaces;
    // older builds only have the plain property.
    if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
    else pdfMake.vfs = vfs;

    /*
     * And the font descriptor, which 0.2 had built into the browser bundle and
     * 0.3 does not. The virtual file system only says "here are some bytes
     * called Roboto-Regular.ttf"; this is what tells pdfmake that the family
     * named "Roboto" — the default every document asks for — is made of those
     * four files. Without it the engine has the bytes and no idea what to do
     * with them, and a document asking for Roboto simply never finishes.
     */
    const family = {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf',
    };
    const present = (f) => Object.keys(vfs).includes(f);
    if (!present(family.normal)) {
        throw new Error(
            `The PDF font "${family.normal}" is not in the font package, so nothing can be printed.`,
        );
    }
    // A build that ships only the regular weight still prints — bold falls back
    // to regular rather than failing the whole document.
    for (const key of ['bold', 'italics', 'bolditalics']) {
        if (!present(family[key])) family[key] = family.normal;
    }
    if (typeof pdfMake.addFonts === 'function') pdfMake.addFonts({ Roboto: family });
    else pdfMake.fonts = { ...(pdfMake.fonts || {}), Roboto: family };

    return pdfMake;
}

/**
 * The font table, wherever this version of pdfmake happens to keep it.
 *
 * Every candidate is checked against what a font table actually looks like, so
 * a future version that moves it again is found rather than silently missed.
 */
function resolveVfs(mod) {
    const candidates = [
        mod?.vfs,
        mod?.default?.vfs,
        mod?.pdfMake?.vfs,
        mod?.default?.pdfMake?.vfs,
        mod?.default,          // pdfmake 0.3: module.exports = vfs
        mod,
    ];
    for (const c of candidates) if (looksLikeVfs(c)) return c;
    return null;
}

/** A vfs is a flat map of font file name to base64 — "Roboto-Regular.ttf": "AAEA…". */
function looksLikeVfs(v) {
    if (!v || typeof v !== 'object') return false;
    for (const k of Object.keys(v)) {
        if (/\.(ttf|otf|ttc|woff2?)$/i.test(k) && typeof v[k] === 'string') return true;
    }
    return false;
}
