import { gql } from './gql';

/**
 * Barcode backend operations. The backend owns generation / validation / dedup /
 * persistence (EAN-13, PosItemBarcode). The frontend never invents codes.
 */

const BARCODE_FIELDS = `id itemId barcode isPrimary status`;

export class ItemBarcodesQuery {
    async execute(itemId) {
        const data = await gql(`query ItemBarcodes($id: ID!) { posItemBarcodes(itemId: $id) { ${BARCODE_FIELDS} } }`, { useAdmin: true, variables: { id: String(itemId) } });
        return data?.posItemBarcodes || [];
    }
}

/** Server generates + validates + persists a unique EAN-13 for one item. */
export class GenerateItemBarcodeCommand {
    async execute(itemId) {
        const data = await gql(`mutation GenBarcode($id: ID!) { generatePosItemBarcode(itemId: $id) { ${BARCODE_FIELDS} } }`, { useAdmin: true, variables: { id: String(itemId) } });
        return data?.generatePosItemBarcode;
    }
}

/** Bulk: server generates EAN-13s for all active items lacking a barcode. */
export class GenerateMissingBarcodesCommand {
    async execute() {
        const data = await gql(`mutation GenMissing { generateMissingPosItemBarcodes { ${BARCODE_FIELDS} } }`, { useAdmin: true });
        return data?.generateMissingPosItemBarcodes || [];
    }
}

/** Assign a manual barcode (server validates EAN-13 check digit + dedups). */
export class AddItemBarcodeCommand {
    async execute(input) {
        const data = await gql(`mutation AddBarcode($input: PosItemBarcodeInput!) { addPosItemBarcode(input: $input) { ${BARCODE_FIELDS} } }`, { useAdmin: true, variables: { input } });
        return data?.addPosItemBarcode;
    }
}

export class RemoveItemBarcodeCommand {
    async execute(id) {
        const data = await gql(`mutation RemoveBarcode($id: ID!) { removePosItemBarcode(id: $id) }`, { useAdmin: true, variables: { id: String(id) } });
        return data?.removePosItemBarcode;
    }
}
