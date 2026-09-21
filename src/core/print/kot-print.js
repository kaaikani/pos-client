/**
 * Printing a kitchen order ticket.
 *
 * A KOT is not a small bill, and rendering it through the bill template would
 * be wrong in every way that matters. It carries no prices — the kitchen has no
 * use for money, and a price on a ticket that reaches a customer's table by
 * accident is an embarrassment. It carries very large quantities and item names,
 * because it is read at arm's length, in a hurry, by someone with wet hands. And
 * it is thrown away in ten minutes, so it must be short.
 *
 * The layout is fixed rather than designed in the template editor. There is
 * nothing about a kitchen ticket a shop wants to rearrange, and every minute
 * spent designing one is a minute not spent on the bill that customers actually
 * see.
 */

/** Roll width in millimetres. Kitchen printers are nearly always 80mm. */
const DEFAULT_WIDTH_MM = 80;
const MM = 2.834645669; // 1mm in PDF points

/**
 * Builds the pdfmake document for one ticket.
 *
 * A VOID ticket is deliberately loud: reversed heading, the word CANCEL against
 * every line. A cancellation that reads like an order gets cooked.
 */
export function buildKotDocDefinition(ticket, opts = {}) {
    const widthMm = Number(opts.widthMm) || DEFAULT_WIDTH_MM;
    const pageWidth = widthMm * MM;
    const isVoid = String(ticket?.ticketType || 'KOT').toUpperCase() === 'VOID';
    const lines = Array.isArray(ticket?.lines) ? ticket.lines : [];

    const content = [];

    content.push({
        text: isVoid ? '*** CANCEL ***' : 'KITCHEN ORDER',
        alignment: 'center',
        bold: true,
        fontSize: isVoid ? 16 : 13,
        margin: [0, 0, 0, 4],
    });

    // Table first and biggest. It is the only thing the kitchen needs to match
    // a dish back to a customer, and on a busy pass it is read from a metre away.
    if (ticket?.tableCode) {
        content.push({
            text: `TABLE ${ticket.tableCode}`,
            alignment: 'center',
            bold: true,
            fontSize: 20,
            margin: [0, 0, 0, 4],
        });
    }

    content.push({
        columns: [
            { text: ticket?.ticketNo || '', fontSize: 9 },
            { text: ticket?.ticketTime || '', fontSize: 9, alignment: 'right' },
        ],
        margin: [0, 0, 0, 1],
    });
    if (ticket?.waiter) {
        content.push({ text: ticket.waiter, fontSize: 9, margin: [0, 0, 0, 2] });
    }
    content.push({
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: pageWidth - 16, y2: 0, lineWidth: 1 }],
        margin: [0, 2, 0, 4],
    });

    for (const l of lines) {
        content.push({
            columns: [
                { text: String(l.qty), width: 28, bold: true, fontSize: 16 },
                {
                    text: l.itemName || l.itemCode || '',
                    bold: true,
                    fontSize: 13,
                },
            ],
            margin: [0, 0, 0, 1],
        });
        // Modifiers and notes are indented under their dish. They change what
        // is cooked, so they are never allowed to run into the next line.
        const extras = [
            ...(Array.isArray(l.modifiers) ? l.modifiers.filter(Boolean) : []),
            ...(l.notes ? [l.notes] : []),
        ];
        if (extras.length > 0) {
            content.push({
                text: extras.join(' · '),
                fontSize: 10,
                italics: true,
                margin: [28, 0, 0, 2],
            });
        }
        if (isVoid) {
            content.push({
                text: 'CANCEL',
                fontSize: 10,
                bold: true,
                margin: [28, 0, 0, 2],
            });
        }
    }

    if (lines.length === 0) {
        content.push({ text: '(nothing on this ticket)', fontSize: 10, italics: true });
    }

    return {
        pageSize: { width: pageWidth, height: 'auto' },
        pageMargins: [8, 8, 8, 8],
        defaultStyle: { fontSize: 11 },
        content,
    };
}

async function pdfMake() {
    const pdfMakeMod = await import('pdfmake/build/pdfmake');
    const pdfFontsMod = await import('pdfmake/build/vfs_fonts');
    const pdf = pdfMakeMod.default || pdfMakeMod;
    const fonts = pdfFontsMod.default || pdfFontsMod;
    pdf.vfs = fonts.vfs || fonts.pdfMake?.vfs || pdf.vfs;
    return pdf;
}

/** The ticket as a base64 PDF, for QZ Tray. */
export function kotPdfBase64(ticket, opts) {
    return pdfMake().then(pdf => new Promise((resolve, reject) => {
        try {
            pdf.createPdf(buildKotDocDefinition(ticket, opts)).getBase64(resolve);
        } catch (e) {
            reject(e);
        }
    }));
}

/** Opens the ticket in a print dialog — the fallback when QZ Tray is absent. */
export async function openKotPdf(ticket, opts) {
    const pdf = await pdfMake();
    pdf.createPdf(buildKotDocDefinition(ticket, opts)).print();
}
