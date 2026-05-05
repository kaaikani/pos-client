import { gql } from './gql';
import { cachedFetch, invalidateCache } from './cache';

const TTL = 60_000; // 1 min cache

// ══════════════════════════════════════════════════════════════
// ITEMS
// ══════════════════════════════════════════════════════════════
const ITEM_FIELDS = `id createdAt updatedAt code itemName tamilName category groupName brand hsnCode barcode upcCode unit packingUnit size taxName mfr purchaseRate salesRate mrpRate costRate cRate rateA rateB rateC rateD lastPurchaseRate lastSaleRate gstPercent discount profitMargin incentivePct batchNo mfgDate expiryDate serialNo minStock maxStock minStkQty maxStkQty isWeightBased isExpiryEnabled allowExpiry sizesJson`;

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

// Sync a PharmaItem to Vendure catalog (creates Product + ProductVariant)
export class SyncItemToVendureCommand {
    async execute(item) {
        const slug = String(item.itemName || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || `item-${item.code}`;

        // Step 1: create Product
        const productMutation = `
            mutation CreateProduct($input: CreateProductInput!) {
                createProduct(input: $input) { id name slug }
            }`;
        const productInput = {
            enabled: true,
            translations: [{
                languageCode: 'en',
                name: item.itemName,
                slug: `${slug}-${item.code}`,
                description: `${item.brand || ''} ${item.category || ''}`.trim(),
            }],
        };
        const productData = await gql(productMutation, { useAdmin: true, variables: { input: productInput } });
        const productId = productData?.createProduct?.id;
        if (!productId) throw new Error('Vendure product creation failed');

        // Step 2: create ProductVariant
        const variantMutation = `
            mutation CreateVariants($input: [CreateProductVariantInput!]!) {
                createProductVariants(input: $input) { id sku price }
            }`;
        const priceInMinor = Math.round((parseFloat(item.salesRate) || 0) * 100); // paise
        const variantInput = [{
            productId,
            sku: String(item.barcode || item.upcCode || item.code || `SKU-${Date.now()}`),
            price: priceInMinor,
            stockOnHand: parseInt(item.minStock || 0, 10) || 0,
            trackInventory: 'TRUE',
            translations: [{ languageCode: 'en', name: item.itemName }],
        }];
        await gql(variantMutation, { useAdmin: true, variables: { input: variantInput } });
        invalidateCache('pharma:items');
        return productId;
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

export class DeleteItemCommand {
    async execute(id) {
        const data = await gql(`mutation DelItem($id: ID!) { deletePharmaItem(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pharma:items');
        return data.deletePharmaItem;
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

export class DeletePurchaseCommand {
    async execute(id) {
        const data = await gql(`mutation DelPurchase($id: ID!) { deletePharmaPurchase(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pharma:purchases');
        return data.deletePharmaPurchase;
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

export class CreatePaymentCommand {
    async execute(input) {
        const data = await gql(`mutation CreatePay($input: PharmaPaymentInput!) { createPharmaPayment(input: $input) { ${PAYMENT_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pharma:payments');
        return data.createPharmaPayment;
    }
}

export class DeletePaymentCommand {
    async execute(id) {
        const data = await gql(`mutation DelPay($id: ID!) { deletePharmaPayment(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pharma:payments');
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

export class CreateReceiptCommand {
    async execute(input) {
        const data = await gql(`mutation CreateRcpt($input: PharmaReceiptInput!) { createPharmaReceipt(input: $input) { ${RECEIPT_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pharma:receipts');
        return data.createPharmaReceipt;
    }
}

export class DeleteReceiptCommand {
    async execute(id) {
        const data = await gql(`mutation DelRcpt($id: ID!) { deletePharmaReceipt(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pharma:receipts');
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

export class DeleteSaleCommand {
    async execute(id) {
        const data = await gql(`mutation DelSale($id: ID!) { deletePharmaSale(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pharma:sales');
        return data.deletePharmaSale;
    }
}
