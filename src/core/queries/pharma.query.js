import { gql } from './gql';
import { cachedFetch, invalidateCache } from './cache';

const TTL = 60_000; // 1 min cache

// ══════════════════════════════════════════════════════════════
// ITEMS
// ══════════════════════════════════════════════════════════════
// `currentStock` is the server-maintained mirror of PosItemStockSnapshot.currentStock,
// written inside writeLedger(). Read it for on-hand stock. `minStkQty` is a legacy
// mirror of the same value and `minStock` is the REORDER LEVEL — never use either as
// on-hand stock (that confusion was BUG-003).
const ITEM_FIELDS = `id createdAt updatedAt code itemName tamilName category groupName brand hsnCode barcode upcCode unit packingUnit size taxName mfr purchaseRate salesRate mrpRate costRate cRate rateA rateB rateC rateD lastPurchaseRate lastSaleRate gstPercent priceIncludesTax taxMasterId discount profitMargin incentivePct batchNo mfgDate expiryDate serialNo minStock maxStock currentStock minStkQty maxStkQty isWeightBased isExpiryEnabled allowExpiry isStockBased sizesJson`;

// POS GST tax masters (id → ratePercent/taxType) for live-cart tax resolution.
export class PosTaxMastersQuery {
    async execute() {
        return cachedFetch('pos:taxMasters', async () => {
            const data = await gql(`query PosTaxMasters { posTaxMasters { id ratePercent taxType } }`, { useAdmin: true });
            return data?.posTaxMasters || [];
        }, 60_000);
    }
}

const TAX_FIELDS = 'id code name ratePercent taxType isDefault status';

/** Full rows for the Tax Master screen — not the trimmed set the cart uses. */
export class ListTaxMastersQuery {
    async execute() {
        return cachedFetch('pos:taxMasters:full', async () => {
            const data = await gql(`query TaxMasters { posTaxMasters { ${TAX_FIELDS} } }`, { useAdmin: true });
            return data?.posTaxMasters || [];
        }, 30_000);
    }
}

/* Both caches are dropped on write: the screen reads the full set, the POS cart
   reads the trimmed one, and a stale rate in the cart would mis-tax a bill. */
const invalidateTax = () => { invalidateCache('pos:taxMasters'); };

export class CreateTaxMasterCommand {
    async execute(input) {
        const data = await gql(
            `mutation CreateTax($input: PosTaxMasterInput!) { createPosTaxMaster(input: $input) { ${TAX_FIELDS} } }`,
            { useAdmin: true, variables: { input } },
        );
        invalidateTax();
        return data.createPosTaxMaster;
    }
}

export class UpdateTaxMasterCommand {
    async execute(id, input) {
        const data = await gql(
            `mutation UpdateTax($id: ID!, $input: PosTaxMasterUpdateInput!) { updatePosTaxMaster(id: $id, input: $input) { ${TAX_FIELDS} } }`,
            { useAdmin: true, variables: { id, input } },
        );
        invalidateTax();
        return data.updatePosTaxMaster;
    }
}

/** Cancels the rate (status CANCELLED); bills that already used it keep their tax. */
export class DeleteTaxMasterCommand {
    async execute(id) {
        const data = await gql(
            `mutation DeleteTax($id: ID!) { deletePosTaxMaster(id: $id) { id status } }`,
            { useAdmin: true, variables: { id } },
        );
        invalidateTax();
        return data.deletePosTaxMaster;
    }
}

export class ListItemsQuery {
    async execute() {
        return cachedFetch('pharma:items', async () => {
            const data = await gql(`query Items { pharmaItems { ${ITEM_FIELDS} } }`, { useAdmin: true });
            return (data.pharmaItems || []).map(i => ({ ...i, sizes: JSON.parse(i.sizesJson || '[]') }));
        }, TTL);
    }
}

export class CreateItemCommand {
    async execute(input) {
        const data = await gql(`mutation CreateItem($input: PharmaItemInput!) { createPharmaItem(input: $input) { ${ITEM_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pharma:items');
        return data.createPharmaItem;
    }
}

export class UpdateItemCommand {
    async execute(id, input) {
        const data = await gql(`mutation UpdateItem($id: ID!, $input: PharmaItemInput!) { updatePharmaItem(id: $id, input: $input) { ${ITEM_FIELDS} } }`, { useAdmin: true, variables: { id, input } });
        invalidateCache('pharma:items');
        return data.updatePharmaItem;
    }
}

// Fetch tax rates from Vendure Admin API
export class ListTaxRatesQuery {
    async execute() {
        return cachedFetch('vendure:taxRates', async () => {
            const data = await gql(`query TaxRates { taxRates { items { id name value enabled } } }`, { useAdmin: true });
            return data?.taxRates?.items || [];
        }, TTL);
    }
}

/**
 * Nothing is hard-deleted — the record is cancelled and kept.
 *
 * This used to call `deletePharmaItem`, which was a one-line shim that called
 * `cancelPharmaItem` with the reason "Legacy delete call". Two API names for one
 * operation, and the audit trail recorded a useless reason. It now calls cancel
 * directly and passes a real reason.
 */
export class DeleteItemCommand {
    async execute(id, reason) {
        const data = await gql(
            `mutation CancelItem($id: ID!, $reason: String) { cancelPharmaItem(id: $id, reason: $reason) { id } }`,
            { useAdmin: true, variables: { id, reason: reason || 'Removed by user' } },
        );
        invalidateCache('pharma:items');
        return !!data.cancelPharmaItem;
    }
}

/**
 * Delete a PharmaItem AND its matching Vendure variant/product (matched by SKU = item.code).
 * Silent on Vendure failures (returns whether each side succeeded).
 */
export class DeleteItemEverywhereCommand {
    async execute(item) {
        const result = { pharma: false, vendureVariant: false, vendureProduct: false };

        // 1) Delete PharmaItem (local)
        try {
            await new DeleteItemCommand().execute(item.id);
            result.pharma = true;
        } catch (e) {
            console.warn('PharmaItem delete failed:', e.message);
        }

        // 2) Find matching Vendure variant by SKU and delete it (+ parent product if empty)
        const sku = String(item.code || '').trim();
        if (sku) {
            try {
                const lookup = await gql(`
                    query FindVariantBySku($sku: String!) {
                        productVariants(options: { filter: { sku: { eq: $sku } }, take: 1 }) {
                            items { id productId product { id variantList(options: { take: 5 }) { totalItems } } }
                        }
                    }
                `, { useAdmin: true, variables: { sku } });
                const variant = lookup?.productVariants?.items?.[0];
                if (variant?.id) {
                    try {
                        await gql(`
                            mutation DelVariants($ids: [ID!]!) {
                                deleteProductVariants(ids: $ids) { result message }
                            }
                        `, { useAdmin: true, variables: { ids: [variant.id] } });
                        result.vendureVariant = true;
                    } catch (e) {
                        console.warn('Vendure variant delete failed:', e.message);
                    }
                    // If the parent product only had this one variant, remove the product too
                    if (variant.product?.variantList?.totalItems <= 1 && variant.productId) {
                        try {
                            await gql(`
                                mutation DelProduct($id: ID!) {
                                    deleteProduct(id: $id) { result message }
                                }
                            `, { useAdmin: true, variables: { id: variant.productId } });
                            result.vendureProduct = true;
                        } catch (e) {
                            console.warn('Vendure product delete failed:', e.message);
                        }
                    }
                }
            } catch (e) {
                console.warn('Vendure variant lookup failed:', e.message);
            }
        }

        return result;
    }
}

// ══════════════════════════════════════════════════════════════
// PURCHASES
// ══════════════════════════════════════════════════════════════
const PURCHASE_FIELDS = `id createdAt updatedAt purNo purDate invNo invDate taxMode payType otherState supplier orderRef transMode address transportName rowsJson totalAmount totalDiscA totalTax netAmount`;

export class ListPurchasesQuery {
    async execute() {
        return cachedFetch('pharma:purchases', async () => {
            const data = await gql(`query Purchases { pharmaPurchases { ${PURCHASE_FIELDS} } }`, { useAdmin: true });
            return (data.pharmaPurchases || []).map(p => ({ ...p, rows: JSON.parse(p.rowsJson || '[]') }));
        }, TTL);
    }
}

export class CreatePurchaseCommand {
    async execute(input) {
        const data = await gql(`mutation CreatePurchase($input: PharmaPurchaseInput!) { createPharmaPurchase(input: $input) { ${PURCHASE_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pharma:purchases');
        return data.createPharmaPurchase;
    }
}

/** Cancels the purchase and reverses its stock — see DeleteItemCommand. */
export class DeletePurchaseCommand {
    async execute(id, reason) {
        const data = await gql(
            `mutation CancelPurchase($id: ID!, $reason: String) { cancelPharmaPurchase(id: $id, reason: $reason) { id } }`,
            { useAdmin: true, variables: { id, reason: reason || 'Removed by user' } },
        );
        invalidateCache('pharma:purchases');
        invalidateCache('ledger:');
        return !!data.cancelPharmaPurchase;
    }
}

// ══════════════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════════════
const PAYMENT_FIELDS = `id createdAt updatedAt payNo payDate refNo payType otherState supplierName supplierGST orderRef transMode address chequeNo bankName narration rowsJson totalPaying totalDisc totalNet`;

export class ListPaymentsQuery {
    async execute() {
        return cachedFetch('pharma:payments', async () => {
            const data = await gql(`query Payments { pharmaPayments { ${PAYMENT_FIELDS} } }`, { useAdmin: true });
            return (data.pharmaPayments || []).map(p => ({ ...p, rows: JSON.parse(p.rowsJson || '[]') }));
        }, TTL);
    }
}

/** Settles supplier bills, so the ledger cache is stale the moment this returns. */
export class CreatePaymentCommand {
    async execute(input) {
        const data = await gql(`mutation CreatePay($input: PharmaPaymentInput!) { createPharmaPayment(input: $input) { ${PAYMENT_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pharma:payments');
        invalidateCache('ledger:');
        return data.createPharmaPayment;
    }
}

/** Deleting a payment puts the supplier's outstanding back — see reverseVoucherSettlement. */
export class DeletePaymentCommand {
    async execute(id) {
        const data = await gql(`mutation DelPay($id: ID!) { deletePharmaPayment(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pharma:payments');
        invalidateCache('ledger:');
        return data.deletePharmaPayment;
    }
}

// ══════════════════════════════════════════════════════════════
// RECEIPTS
// ══════════════════════════════════════════════════════════════
const RECEIPT_FIELDS = `id createdAt updatedAt docNo docDate billRefNo docType refType accHead payMode narration1 narration2 cashDisc amount recAmount rowsJson`;

export class ListReceiptsQuery {
    async execute() {
        return cachedFetch('pharma:receipts', async () => {
            const data = await gql(`query Receipts { pharmaReceipts { ${RECEIPT_FIELDS} } }`, { useAdmin: true });
            return (data.pharmaReceipts || []).map(r => ({ ...r, rows: JSON.parse(r.rowsJson || '[]') }));
        }, TTL);
    }
}

/**
 * Creating a receipt SETTLES customer ledger bills, so the `ledger:` cache is
 * stale the moment this returns. Without dropping it the collection screen
 * re-read a 30s-old party roll-up and still showed the bill as fully open —
 * the operator saw their own receipt have no effect.
 */
export class CreateReceiptCommand {
    async execute(input) {
        const data = await gql(`mutation CreateRcpt($input: PharmaReceiptInput!) { createPharmaReceipt(input: $input) { ${RECEIPT_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pharma:receipts');
        invalidateCache('ledger:');
        return data.createPharmaReceipt;
    }
}

export class DeleteReceiptCommand {
    async execute(id) {
        const data = await gql(`mutation DelRcpt($id: ID!) { deletePharmaReceipt(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pharma:receipts');
        invalidateCache('ledger:');
        return data.deletePharmaReceipt;
    }
}

// ══════════════════════════════════════════════════════════════
// TOKENS
// ══════════════════════════════════════════════════════════════
const TOKEN_FIELDS = `id createdAt updatedAt tokenNo tokenDate tokenTime patientName address cellNo amount injAmt total`;

export class ListTokensQuery {
    async execute(tokenDate) {
        const key = tokenDate ? `pharma:tokens:${tokenDate}` : 'pharma:tokens';
        return cachedFetch(key, async () => {
            const data = await gql(`query Tokens($d: String) { pharmaTokens(tokenDate: $d) { ${TOKEN_FIELDS} } }`, { useAdmin: true, variables: { d: tokenDate || null } });
            return data.pharmaTokens || [];
        }, TTL);
    }
}

export class CreateTokenCommand {
    async execute(input) {
        const data = await gql(`mutation CreateTkn($input: PharmaTokenInput!) { createPharmaToken(input: $input) { ${TOKEN_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pharma:tokens');
        return data.createPharmaToken;
    }
}

export class DeleteTokenCommand {
    async execute(id) {
        const data = await gql(`mutation DelTkn($id: ID!) { deletePharmaToken(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pharma:tokens');
        return data.deletePharmaToken;
    }
}

// ══════════════════════════════════════════════════════════════
// SALES (Bills)
// ══════════════════════════════════════════════════════════════
const SALE_FIELDS = `id createdAt updatedAt billNo billDate billTime saleType bookNo billRef customerName customerPhone customerAddress salesMan itemsJson subtotal taxAmount discount transportCharges grandTotal cashAmount upiAmount cardAmount receivedAmount balanceDue changeReturned remarks`;

export class ListSalesQuery {
    async execute(fromDate, toDate) {
        const key = `pharma:sales:${fromDate||'all'}:${toDate||'all'}`;
        return cachedFetch(key, async () => {
            const data = await gql(`query Sales($f: String, $t: String) { pharmaSales(fromDate: $f, toDate: $t) { ${SALE_FIELDS} } }`, { useAdmin: true, variables: { f: fromDate || null, t: toDate || null } });
            return (data.pharmaSales || []).map(s => ({ ...s, items: JSON.parse(s.itemsJson || '[]') }));
        }, 30_000);
    }
}

export class GetSaleQuery {
    async execute(id) {
        const data = await gql(`query Sale($id: ID!) { pharmaSale(id: $id) { ${SALE_FIELDS} } }`, { useAdmin: true, variables: { id } });
        if (!data.pharmaSale) return null;
        return { ...data.pharmaSale, items: JSON.parse(data.pharmaSale.itemsJson || '[]') };
    }
}

export class CreateSaleCommand {
    async execute(input) {
        const data = await gql(`mutation CreateSale($input: PharmaSaleInput!) { createPharmaSale(input: $input) { ${SALE_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pharma:sales');
        return data.createPharmaSale;
    }
}

/** Cancels the bill and reverses stock and the receivable — see DeleteItemCommand. */
export class DeleteSaleCommand {
    async execute(id, reason) {
        const data = await gql(
            `mutation CancelSale($id: ID!, $reason: String) { cancelPharmaSale(id: $id, reason: $reason) { id } }`,
            { useAdmin: true, variables: { id, reason: reason || 'Removed by user' } },
        );
        invalidateCache('pharma:sales');
        invalidateCache('ledger:');
        invalidateCache('pos:dashboard');
        return !!data.cancelPharmaSale;
    }
}

// ══════════════════════════════════════════════════════════════
// STOCK ADJUSTMENT  (server-backed — replaces the localStorage stub)
// ══════════════════════════════════════════════════════════════
// Server contract: pharma.api.ts `PosStockAdjustmentInput`
//   adjNo!, adjDate!, itemCode!, adjustQty!, adjType! (ADD|REDUCE),
//   atPrice?, reason?, details?
// createPosStockAdjustment runs writeLedger() inside a transaction, so it
// moves real stock and fills previousQty/resultingQty server-side.
const STOCK_ADJ_FIELDS = `id createdAt adjNo adjDate itemCode previousQty adjustQty resultingQty adjType atPrice reason details status`;

export class ListStockAdjustmentsQuery {
    async execute() {
        return cachedFetch('pos:stockAdjustments', async () => {
            const data = await gql(`query PosStockAdjustments { posStockAdjustments { ${STOCK_ADJ_FIELDS} } }`, { useAdmin: true });
            return data?.posStockAdjustments || [];
        }, 30_000);
    }
}

export class CreateStockAdjustmentCommand {
    async execute(input) {
        const data = await gql(
            `mutation CreatePosStockAdjustment($input: PosStockAdjustmentInput!) { createPosStockAdjustment(input: $input) { ${STOCK_ADJ_FIELDS} } }`,
            { useAdmin: true, variables: { input } },
        );
        // Stock moved → item snapshots and stock reports are stale.
        invalidateCache('pos:stockAdjustments');
        invalidateCache('pharma:items');
        return data.createPosStockAdjustment;
    }
}

// ══════════════════════════════════════════════════════════════
// PURCHASE RETURN  (server-backed — replaces the localStorage stub)
// ══════════════════════════════════════════════════════════════
// Server contract: pharma.api.ts `PosPurchaseReturnInput`.
// IMPORTANT: pharma.service.ts `createPurchaseReturn` REJECTS free-form
// returns — `originalPurchaseId` is mandatory. It also overwrites puRate
// from the source purchase and caps qty at (original - already returned),
// so the UI must always start from a source bill.
const PURCHASE_RETURN_FIELDS = `id createdAt retNo retDate originalPurchaseId supplier supplierGstin placeOfSupply address rowsJson totalAmount totalDisc totalTax netAmount reason status`;

export class ListPurchaseReturnsQuery {
    async execute() {
        return cachedFetch('pos:purchaseReturns', async () => {
            const data = await gql(`query PosPurchaseReturns { posPurchaseReturns { ${PURCHASE_RETURN_FIELDS} } }`, { useAdmin: true });
            return (data?.posPurchaseReturns || []).map(r => ({
                ...r,
                rows: (() => { try { return JSON.parse(r.rowsJson || '[]') || []; } catch { return []; } })(),
            }));
        }, 30_000);
    }
}

export class CreatePurchaseReturnCommand {
    async execute(input) {
        const data = await gql(
            `mutation CreatePosPurchaseReturn($input: PosPurchaseReturnInput!) { createPosPurchaseReturn(input: $input) { ${PURCHASE_RETURN_FIELDS} } }`,
            { useAdmin: true, variables: { input } },
        );
        // Stock decremented → items and the source purchase list are stale.
        invalidateCache('pos:purchaseReturns');
        invalidateCache('pharma:items');
        invalidateCache('pharma:purchases');
        return data.createPosPurchaseReturn;
    }
}

/** Find source purchases to return against. Not cached — it is a live search. */
export class SearchPurchasesForReturnQuery {
    async execute({ supplier, itemCode, fromDate, toDate, limit = 25 } = {}) {
        const data = await gql(
            `query SearchPurchasesForReturn($supplier: String, $itemCode: String, $fromDate: String, $toDate: String, $limit: Int) {
                searchPurchasesForReturn(supplier: $supplier, itemCode: $itemCode, fromDate: $fromDate, toDate: $toDate, limit: $limit) {
                    id purNo purDate invNo supplier supplierGstin address rowsJson netAmount
                }
            }`,
            { useAdmin: true, variables: { supplier: supplier || null, itemCode: itemCode || null, fromDate: fromDate || null, toDate: toDate || null, limit } },
        );
        return (data?.searchPurchasesForReturn || []).map(p => ({
            ...p,
            rows: (() => { try { return JSON.parse(p.rowsJson || '[]') || []; } catch { return []; } })(),
        }));
    }
}
