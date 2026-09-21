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
const ITEM_FIELDS = `id createdAt updatedAt code itemName tamilName category groupName brand hsnCode barcode upcCode unit packingUnit size taxName mfr purchaseRate salesRate mrpRate costRate cRate rateA rateB rateC rateD lastPurchaseRate lastSaleRate gstPercent priceIncludesTax taxMasterId discount profitMargin incentivePct batchNo mfgDate expiryDate serialNo minStock maxStock currentStock minStkQty maxStkQty isWeightBased isExpiryEnabled allowExpiry isStockBased isBatchTracked sizesJson`;

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
        return cachedFetch('pos:items', async () => {
            const data = await gql(`query Items { posItems { ${ITEM_FIELDS} } }`, { useAdmin: true });
            return (data.posItems || []).map(i => ({ ...i, sizes: JSON.parse(i.sizesJson || '[]') }));
        }, TTL);
    }
}

export class CreateItemCommand {
    async execute(input) {
        const data = await gql(`mutation CreateItem($input: PosItemInput!) { createPosItem(input: $input) { ${ITEM_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pos:items');
        return data.createPosItem;
    }
}

export class UpdateItemCommand {
    async execute(id, input) {
        const data = await gql(`mutation UpdateItem($id: ID!, $input: PosItemInput!) { updatePosItem(id: $id, input: $input) { ${ITEM_FIELDS} } }`, { useAdmin: true, variables: { id, input } });
        invalidateCache('pos:items');
        return data.updatePosItem;
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
 * This used to call `deletePosItem`, which was a one-line shim that called
 * `cancelPosItem` with the reason "Legacy delete call". Two API names for one
 * operation, and the audit trail recorded a useless reason. It now calls cancel
 * directly and passes a real reason.
 */
export class DeleteItemCommand {
    /**
     * `confirmUsed` is the operator agreeing to retire an item that documents
     * already reference. The server refuses without it, so the caller must ask
     * first — see PosItemUsageQuery.
     */
    async execute(id, reason, confirmUsed = false) {
        const data = await gql(
            `mutation CancelItem($id: ID!, $reason: String, $confirmUsed: Boolean) {
                cancelPosItem(id: $id, reason: $reason, confirmUsed: $confirmUsed) { id }
            }`,
            { useAdmin: true, variables: { id, reason: reason || 'Removed by user', confirmUsed } },
        );
        invalidateCache('pos:items');
        return !!data.cancelPosItem;
    }
}

/**
 * The unit master, with the registry values that decide which units may be used
 * together and how many decimals each is counted in.
 *
 * Cached: it changes about once a year, and every item form and every bill row
 * needs it.
 */
export class PosUnitsQuery {
    async execute() {
        return cachedFetch('pos:units', async () => {
            const data = await gql(
                `query PosUnits { posUnits { id code name symbol status kind factor decimals } }`,
                { useAdmin: true },
            );
            return (data.posUnits || []).filter(u => u.status === 'ACTIVE');
        });
    }
}

const TIER_FIELDS = `id itemId tierType unitCode label rate minQty taxMode discountPct discountFlat discountType status`;

/** Every price row for an item — retail and wholesale, per unit, with quantity breaks. */
export class PosItemPriceTiersQuery {
    async execute(itemId) {
        const data = await gql(
            `query ItemTiers($itemId: ID!) { posItemPriceTiers(itemId: $itemId) { ${TIER_FIELDS} } }`,
            { useAdmin: true, variables: { itemId } },
        );
        return data.posItemPriceTiers || [];
    }
}

export class CreatePosItemPriceTierCommand {
    async execute(input) {
        const data = await gql(
            `mutation AddTier($input: PosItemPriceTierInput!) { createPosItemPriceTier(input: $input) { ${TIER_FIELDS} } }`,
            { useAdmin: true, variables: { input } },
        );
        invalidateCache('pos:items');
        return data.createPosItemPriceTier;
    }
}

export class UpdatePosItemPriceTierCommand {
    async execute(id, input) {
        const data = await gql(
            `mutation EditTier($id: ID!, $input: PosItemPriceTierInput!) { updatePosItemPriceTier(id: $id, input: $input) { ${TIER_FIELDS} } }`,
            { useAdmin: true, variables: { id, input } },
        );
        invalidateCache('pos:items');
        return data.updatePosItemPriceTier;
    }
}

/** Nothing is deleted — the row is cancelled and kept. */
export class CancelPosItemPriceTierCommand {
    async execute(id) {
        const data = await gql(
            `mutation CancelTier($id: ID!) { cancelPosItemPriceTier(id: $id) { id status } }`,
            { useAdmin: true, variables: { id } },
        );
        invalidateCache('pos:items');
        return data.cancelPosItemPriceTier;
    }
}

/**
 * The price the server would actually charge for one unit and price list.
 *
 * The till asks rather than calculating, so the screen can never disagree with
 * the bill — a bag is priced as a bag, not as 25 times the kilo rate.
 */
export class PosResolveRateQuery {
    async execute({ itemCode, unitCode, tierType, qty }) {
        const data = await gql(
            `query ResolveRate($c: String!, $u: String, $t: PriceTierType, $q: Float) {
                posResolveRate(itemCode: $c, unitCode: $u, tierType: $t, qty: $q) {
                    itemCode rate source unitCode tierType
                }
            }`,
            { useAdmin: true, variables: { c: itemCode, u: unitCode || null, t: tierType || null, q: qty ?? null } },
        );
        return data.posResolveRate;
    }
}

/* ── business configuration ── */
const CONFIG_FIELDS = `id vertical verticalLabel documents chosenBy
    modules { key label description enabled }
    verticals { code label description modules documents }`;

/**
 * What kind of business this is, and which modules are on.
 *
 * Not cached: switching a module changes what the whole application offers, and
 * a stale answer would leave a screen visible that the server now refuses.
 */
export class PosBusinessConfigQuery {
    async execute() {
        const data = await gql(
            `query BusinessConfig { posBusinessConfig { ${CONFIG_FIELDS} } }`,
            { useAdmin: true },
        );
        return data.posBusinessConfig;
    }
}

export class UpdatePosBusinessConfigCommand {
    async execute(input) {
        const data = await gql(
            `mutation UpdateBusinessConfig($i: PosBusinessConfigInput!) {
                updatePosBusinessConfig(input: $i) { ${CONFIG_FIELDS} }
            }`,
            { useAdmin: true, variables: { i: input } },
        );
        return data.updatePosBusinessConfig;
    }
}

/* ── print templates ── */
const PRINT_TEMPLATE_FIELDS = `id docType paperSize mode name widthMm heightMm
    marginLeftMm marginTopMm marginRightMm marginBottomMm layoutJson isDefault isSystem status`;

export class PosPrintTemplatesQuery {
    async execute(docType) {
        const data = await gql(
            `query PrintTemplates($d: String) { posPrintTemplates(docType: $d) { ${PRINT_TEMPLATE_FIELDS} } }`,
            { useAdmin: true, variables: { d: docType || null } },
        );
        return data.posPrintTemplates || [];
    }
}

/** The layout a document should print with — used by the till, not the designer. */
export class PosPrintTemplateQuery {
    async execute(docType, paperSize) {
        const data = await gql(
            `query PrintTemplate($d: String!, $p: String!) {
                posPrintTemplate(docType: $d, paperSize: $p) { ${PRINT_TEMPLATE_FIELDS} }
            }`,
            { useAdmin: true, variables: { d: docType, p: paperSize } },
        );
        return data.posPrintTemplate;
    }
}

/** What a template may print, and the paper sizes available. */
export class PosPrintCatalogueQuery {
    async execute() {
        return cachedFetch('pos:print-catalogue', async () => {
            const data = await gql(
                `query PrintCatalogue {
                    posPrintCatalogue {
                        fields { source label group money itemColumn }
                        papers { code label widthMm heightMm mode }
                    }
                }`,
                { useAdmin: true },
            );
            return data.posPrintCatalogue;
        });
    }
}

export class SavePosPrintTemplateCommand {
    async execute(input) {
        const data = await gql(
            `mutation SaveTemplate($i: PosPrintTemplateInput!) {
                savePosPrintTemplate(input: $i) { ${PRINT_TEMPLATE_FIELDS} }
            }`,
            { useAdmin: true, variables: { i: input } },
        );
        return data.savePosPrintTemplate;
    }
}

export class DeletePosPrintTemplateCommand {
    async execute(id) {
        const data = await gql(
            `mutation DeleteTemplate($id: ID!) { deletePosPrintTemplate(id: $id) }`,
            { useAdmin: true, variables: { id } },
        );
        return !!data.deletePosPrintTemplate;
    }
}

/**
 * Puts one template's layout back to the built-in one.
 *
 * The way out of a layout that has been edited into a mess. A built-in
 * template cannot be deleted — it is the fallback when nothing else is set —
 * so this is the only way back, and it returns the reset template so the
 * designer can redraw from it without another round trip.
 */
export class ResetPosPrintTemplateCommand {
    async execute(id) {
        const data = await gql(
            `mutation ResetTemplate($id: ID!) {
                resetPosPrintTemplate(id: $id) { ${PRINT_TEMPLATE_FIELDS} }
            }`,
            { useAdmin: true, variables: { id } },
        );
        return data.resetPosPrintTemplate;
    }
}

/* ── accounting ──
 *
 * Every figure below is the sum of journal lines, computed on the server. None
 * of it is cached here: a stale trial balance is worse than a slow one.
 */
const TB_ROW = `accountId accountCode accountName groupCode groupName groupType
    debit credit closingDebit closingCredit`;

export class PosTrialBalanceQuery {
    async execute({ fromDate, toDate } = {}) {
        const data = await gql(
            `query TrialBalance($f: String, $t: String) {
                posTrialBalance(fromDate: $f, toDate: $t) {
                    rows { ${TB_ROW} } totalDebit totalCredit balanced
                }
            }`,
            { useAdmin: true, variables: { f: fromDate || null, t: toDate || null } },
        );
        return data.posTrialBalance;
    }
}

export class PosProfitAndLossQuery {
    async execute({ fromDate, toDate } = {}) {
        const data = await gql(
            `query ProfitAndLoss($f: String, $t: String) {
                posProfitAndLoss(fromDate: $f, toDate: $t) {
                    fromDate toDate grossProfit indirectNet netProfit
                    trading { ${TB_ROW} } indirect { ${TB_ROW} }
                }
            }`,
            { useAdmin: true, variables: { f: fromDate || null, t: toDate || null } },
        );
        return data.posProfitAndLoss;
    }
}

export class PosBalanceSheetQuery {
    async execute({ asOn } = {}) {
        const data = await gql(
            `query BalanceSheet($d: String) {
                posBalanceSheet(asOn: $d) {
                    asOn totalAssets totalLiabilities netProfit balanced
                    assets { ${TB_ROW} } liabilities { ${TB_ROW} }
                }
            }`,
            { useAdmin: true, variables: { d: asOn || null } },
        );
        return data.posBalanceSheet;
    }
}

export class PosDayBookQuery {
    async execute({ fromDate, toDate, docType } = {}) {
        const data = await gql(
            `query DayBook($f: String, $t: String, $d: String) {
                posDayBook(fromDate: $f, toDate: $t, docType: $d) {
                    id docType docId docNo entryDate narration isReversal
                    lines { accountCode accountName debit credit partyName }
                }
            }`,
            { useAdmin: true, variables: { f: fromDate || null, t: toDate || null, d: docType || null } },
        );
        return data.posDayBook || [];
    }
}

export class PosAccountsQuery {
    async execute() {
        const data = await gql(
            `query Accounts {
                posAccounts { id code name groupCode groupName groupType
                    openingDebit openingCredit isSystem status roles }
            }`,
            { useAdmin: true },
        );
        return data.posAccounts || [];
    }
}

/* ── numbering series ── */
const SERIES_FIELDS = `docType prefix separator includePeriod resetMode padding suffix example`;

export class PosDocSeriesQuery {
    async execute() {
        const data = await gql(
            `query DocSeries { posDocSeries { ${SERIES_FIELDS} } }`,
            { useAdmin: true },
        );
        return data.posDocSeries || [];
    }
}

export class UpdatePosDocSeriesCommand {
    async execute(docType, input) {
        const data = await gql(
            `mutation EditSeries($t: String!, $i: PosDocSeriesInput!) { updatePosDocSeries(docType: $t, input: $i) { ${SERIES_FIELDS} } }`,
            { useAdmin: true, variables: { t: docType, i: input } },
        );
        return data.updatePosDocSeries;
    }
}

/* ── POS settings singleton ── */
const SETTING_FIELDS = `id allowNegativeStock allowReturnRateOverride allowRateEdit rateEditTolerancePaise
    scaleBarcodeEnabled scaleBarcodePrefixes scaleBarcodeValueType
    scaleBarcodePluDigits scaleBarcodeValueDigits scaleBarcodeDivisor`;

export class PosSettingQuery {
    async execute() {
        const data = await gql(
            `query PosSetting { posSetting { ${SETTING_FIELDS} } }`,
            { useAdmin: true },
        );
        return data.posSetting;
    }
}

export class UpdatePosSettingCommand {
    async execute(input) {
        const data = await gql(
            `mutation EditSetting($input: PosSettingInput!) { updatePosSetting(input: $input) { ${SETTING_FIELDS} } }`,
            { useAdmin: true, variables: { input } },
        );
        return data.updatePosSetting;
    }
}

/* ── unit master ── */
export class CreatePosUnitCommand {
    async execute(input) {
        const data = await gql(
            `mutation AddUnit($input: PosUnitInput!) { createPosUnit(input: $input) { id code name symbol kind factor decimals status } }`,
            { useAdmin: true, variables: { input } },
        );
        invalidateCache('pos:units');
        return data.createPosUnit;
    }
}

export class UpdatePosUnitCommand {
    async execute(id, input) {
        const data = await gql(
            `mutation EditUnit($id: ID!, $input: PosUnitInput!) { updatePosUnit(id: $id, input: $input) { id code name symbol kind factor decimals status } }`,
            { useAdmin: true, variables: { id, input } },
        );
        invalidateCache('pos:units');
        return data.updatePosUnit;
    }
}

export class CancelPosUnitCommand {
    async execute(id) {
        const data = await gql(
            `mutation CancelUnit($id: ID!) { cancelPosUnit(id: $id) { id status } }`,
            { useAdmin: true, variables: { id } },
        );
        invalidateCache('pos:units');
        return data.cancelPosUnit;
    }
}

/** The units configured for one item, with each one's conversion to the base. */
export class PosItemUnitsQuery {
    async execute(itemId) {
        const data = await gql(
            `query PosItemUnits($itemId: ID!) {
                posItemUnits(itemId: $itemId) { id itemId unitId conversionRate isBase status }
            }`,
            { useAdmin: true, variables: { itemId } },
        );
        return data.posItemUnits || [];
    }
}

export class AddPosItemUnitCommand {
    async execute(input) {
        const data = await gql(
            `mutation AddItemUnit($input: PosItemUnitInput!) {
                addPosItemUnit(input: $input) { id unitId conversionRate isBase }
            }`,
            { useAdmin: true, variables: { input } },
        );
        invalidateCache('pos:items');
        return data.addPosItemUnit;
    }
}

export class RemovePosItemUnitCommand {
    async execute(id) {
        const data = await gql(
            `mutation RemoveItemUnit($id: ID!) { removePosItemUnit(id: $id) }`,
            { useAdmin: true, variables: { id } },
        );
        invalidateCache('pos:items');
        return !!data.removePosItemUnit;
    }
}

/**
 * How many documents reference an item, so the operator can be told before an
 * item is retired. Counted from the stock ledger on the server.
 */
export class PosItemUsageQuery {
    async execute(itemId) {
        const data = await gql(
            `query ItemUsage($itemId: ID!) {
                posItemUsage(itemId: $itemId) { itemId sales purchases returns adjustments total }
            }`,
            { useAdmin: true, variables: { itemId } },
        );
        return data.posItemUsage;
    }
}

/**
 * Resolves a scanned code on the server: an item code, any of the item's
 * barcodes, or a weighing-scale label whose weight is decoded into `scanQty`.
 *
 * The till matched only against the item list it had already loaded, so a
 * barcode resolved to nothing at all and a scale label never could — the digits
 * differ on every sticker.
 */
export class ItemForTransactionQuery {
    async execute({ code, barcode }) {
        const data = await gql(
            `query ItemForTxn($code: String, $barcode: String) {
                posItemForTransaction(code: $code, barcode: $barcode) {
                    id code itemName unit salesRate mrpRate currentStock isStockBased
                    gstPercent taxMasterId scalePlu scanQty scanAmount
                    allowedUnits { unitCode conversionRate isBase kind decimals }
                }
            }`,
            { useAdmin: true, variables: { code: code || null, barcode: barcode || null } },
        );
        return data.posItemForTransaction;
    }
}

/**
 * Delete a PosItem AND its matching Vendure variant/product (matched by SKU = item.code).
 * Silent on Vendure failures (returns whether each side succeeded).
 */
export class DeleteItemEverywhereCommand {
    async execute(item) {
        const result = { pos: false, vendureVariant: false, vendureProduct: false };

        // 1) Cancel the PosItem.
        //
        // A failure here STOPS the whole operation. This used to be swallowed
        // with a console warning and the Vendure product was deleted anyway —
        // so an item the server refused to retire (stock still on hand, or
        // documents referencing it) vanished from the catalogue while remaining
        // active in the POS.
        await new DeleteItemCommand().execute(item.id, item.cancelReason, item.confirmUsed === true);
        result.posItem = true;

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
        return cachedFetch('pos:purchases', async () => {
            const data = await gql(`query Purchases { posPurchases { ${PURCHASE_FIELDS} } }`, { useAdmin: true });
            return (data.posPurchases || []).map(p => ({ ...p, rows: JSON.parse(p.rowsJson || '[]') }));
        }, TTL);
    }
}

export class CreatePurchaseCommand {
    async execute(input) {
        const data = await gql(`mutation CreatePurchase($input: PosPurchaseInput!) { createPosPurchase(input: $input) { ${PURCHASE_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pos:purchases');
        return data.createPosPurchase;
    }
}

/** Cancels the purchase and reverses its stock — see DeleteItemCommand. */
export class DeletePurchaseCommand {
    async execute(id, reason) {
        const data = await gql(
            `mutation CancelPurchase($id: ID!, $reason: String) { cancelPosPurchase(id: $id, reason: $reason) { id } }`,
            { useAdmin: true, variables: { id, reason: reason || 'Removed by user' } },
        );
        invalidateCache('pos:purchases');
        invalidateCache('ledger:');
        return !!data.cancelPosPurchase;
    }
}

// ══════════════════════════════════════════════════════════════
// PAYMENTS
// ══════════════════════════════════════════════════════════════
const PAYMENT_FIELDS = `id createdAt updatedAt payNo payDate refNo payType otherState supplierName supplierGST orderRef transMode address chequeNo bankName narration rowsJson totalPaying totalDisc totalNet`;

export class ListPaymentsQuery {
    async execute() {
        return cachedFetch('pos:payments', async () => {
            const data = await gql(`query Payments { posPayments { ${PAYMENT_FIELDS} } }`, { useAdmin: true });
            return (data.posPayments || []).map(p => ({ ...p, rows: JSON.parse(p.rowsJson || '[]') }));
        }, TTL);
    }
}

/** Settles supplier bills, so the ledger cache is stale the moment this returns. */
export class CreatePaymentCommand {
    async execute(input) {
        const data = await gql(`mutation CreatePay($input: PosPaymentInput!) { createPosPayment(input: $input) { ${PAYMENT_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pos:payments');
        invalidateCache('ledger:');
        return data.createPosPayment;
    }
}

/** Deleting a payment puts the supplier's outstanding back — see reverseVoucherSettlement. */
export class DeletePaymentCommand {
    async execute(id) {
        const data = await gql(`mutation DelPay($id: ID!) { deletePosPayment(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pos:payments');
        invalidateCache('ledger:');
        return data.deletePosPayment;
    }
}

// ══════════════════════════════════════════════════════════════
// RECEIPTS
// ══════════════════════════════════════════════════════════════
const RECEIPT_FIELDS = `id createdAt updatedAt docNo docDate billRefNo docType refType accHead payMode narration1 narration2 cashDisc amount recAmount rowsJson`;

export class ListReceiptsQuery {
    async execute() {
        return cachedFetch('pos:receipts', async () => {
            const data = await gql(`query Receipts { posReceipts { ${RECEIPT_FIELDS} } }`, { useAdmin: true });
            return (data.posReceipts || []).map(r => ({ ...r, rows: JSON.parse(r.rowsJson || '[]') }));
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
        const data = await gql(`mutation CreateRcpt($input: PosReceiptInput!) { createPosReceipt(input: $input) { ${RECEIPT_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pos:receipts');
        invalidateCache('ledger:');
        return data.createPosReceipt;
    }
}

export class DeleteReceiptCommand {
    async execute(id) {
        const data = await gql(`mutation DelRcpt($id: ID!) { deletePosReceipt(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pos:receipts');
        invalidateCache('ledger:');
        return data.deletePosReceipt;
    }
}

// ══════════════════════════════════════════════════════════════
// TOKENS
// ══════════════════════════════════════════════════════════════
const TOKEN_FIELDS = `id createdAt updatedAt tokenNo tokenDate tokenTime patientName address cellNo amount injAmt total`;

export class ListTokensQuery {
    async execute(tokenDate) {
        const key = tokenDate ? `pos:tokens:${tokenDate}` : 'pos:tokens';
        return cachedFetch(key, async () => {
            const data = await gql(`query Tokens($d: String) { posTokens(tokenDate: $d) { ${TOKEN_FIELDS} } }`, { useAdmin: true, variables: { d: tokenDate || null } });
            return data.posTokens || [];
        }, TTL);
    }
}

export class CreateTokenCommand {
    async execute(input) {
        const data = await gql(`mutation CreateTkn($input: PosTokenInput!) { createPosToken(input: $input) { ${TOKEN_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pos:tokens');
        return data.createPosToken;
    }
}

export class DeleteTokenCommand {
    async execute(id) {
        const data = await gql(`mutation DelTkn($id: ID!) { deletePosToken(id: $id) }`, { useAdmin: true, variables: { id } });
        invalidateCache('pos:tokens');
        return data.deletePosToken;
    }
}

// ══════════════════════════════════════════════════════════════
// SALES (Bills)
// ══════════════════════════════════════════════════════════════
const SALE_FIELDS = `id createdAt updatedAt billNo billDate billTime saleType orderSource bookNo billRef customerName customerPhone customerAddress salesMan itemsJson subtotal taxAmount discount transportCharges grandTotal cashAmount upiAmount cardAmount receivedAmount balanceDue changeReturned remarks`;

export class ListSalesQuery {
    async execute(fromDate, toDate) {
        const key = `pos:sales:${fromDate||'all'}:${toDate||'all'}`;
        return cachedFetch(key, async () => {
            const data = await gql(`query Sales($f: String, $t: String) { posSales(fromDate: $f, toDate: $t) { ${SALE_FIELDS} } }`, { useAdmin: true, variables: { f: fromDate || null, t: toDate || null } });
            return (data.posSales || []).map(s => ({ ...s, items: JSON.parse(s.itemsJson || '[]') }));
        }, 30_000);
    }
}

export class GetSaleQuery {
    async execute(id) {
        const data = await gql(`query Sale($id: ID!) { posSale(id: $id) { ${SALE_FIELDS} } }`, { useAdmin: true, variables: { id } });
        if (!data.posSale) return null;
        return { ...data.posSale, items: JSON.parse(data.posSale.itemsJson || '[]') };
    }
}

export class CreateSaleCommand {
    async execute(input) {
        const data = await gql(`mutation CreateSale($input: PosSaleInput!) { createPosSale(input: $input) { ${SALE_FIELDS} } }`, { useAdmin: true, variables: { input } });
        invalidateCache('pos:sales');
        return data.createPosSale;
    }
}

/** Cancels the bill and reverses stock and the receivable — see DeleteItemCommand. */
export class DeleteSaleCommand {
    async execute(id, reason) {
        const data = await gql(
            `mutation CancelSale($id: ID!, $reason: String) { cancelPosSale(id: $id, reason: $reason) { id } }`,
            { useAdmin: true, variables: { id, reason: reason || 'Removed by user' } },
        );
        invalidateCache('pos:sales');
        invalidateCache('ledger:');
        invalidateCache('pos:dashboard');
        return !!data.cancelPosSale;
    }
}

// ══════════════════════════════════════════════════════════════
// STOCK ADJUSTMENT  (server-backed — replaces the localStorage stub)
// ══════════════════════════════════════════════════════════════
// Server contract: pos.api.ts `PosStockAdjustmentInput`
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
        invalidateCache('pos:items');
        return data.createPosStockAdjustment;
    }
}

// ══════════════════════════════════════════════════════════════
// PURCHASE RETURN  (server-backed — replaces the localStorage stub)
// ══════════════════════════════════════════════════════════════
// Server contract: pos.api.ts `PosPurchaseReturnInput`.
// IMPORTANT: pos.service.ts `createPurchaseReturn` REJECTS free-form
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
        invalidateCache('pos:items');
        invalidateCache('pos:purchases');
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

/* ── repacking ──────────────────────────────────────────────────────────────
 *
 * Breaking a bag into packets. Not cached: the list is short, it is read on a
 * screen the operator has just changed, and a stale row here would show stock
 * that has already moved.
 */
const REPACK_FIELDS = `id createdAt repackNo repackDate fromItemCode fromItemName
    fromQty fromUnit fromBaseQty wastageBaseQty remarks status cancelReason
    lines { itemCode itemName qty unit bulkPerUnit }`;

export class PosRepacksQuery {
    async execute() {
        const data = await gql(`query Repacks { posRepacks { ${REPACK_FIELDS} } }`, { useAdmin: true });
        return data.posRepacks || [];
    }
}

export class CreatePosRepackCommand {
    async execute(input) {
        const data = await gql(
            `mutation CreateRepack($i: PosRepackInput!) {
                createPosRepack(input: $i) { ${REPACK_FIELDS} }
            }`,
            { useAdmin: true, variables: { i: input } },
        );
        // Both the bulk item and every packet item have new stock figures.
        invalidateCache('pos:items');
        return data.createPosRepack;
    }
}

export class CancelPosRepackCommand {
    async execute(id, reason) {
        const data = await gql(
            `mutation CancelRepack($id: ID!, $r: String) {
                cancelPosRepack(id: $id, reason: $r) { ${REPACK_FIELDS} }
            }`,
            { useAdmin: true, variables: { id: String(id), r: reason || null } },
        );
        invalidateCache('pos:items');
        return data.cancelPosRepack;
    }
}

/* ── batches and expiry ─────────────────────────────────────────────────────
 *
 * Stock held per batch, for items marked isBatchTracked. Not cached: a batch
 * quantity changes with every bill, and a stale figure here would send an
 * operator to the shelf for stock that has already gone.
 */
const BATCH_FIELDS = `id itemId itemCode batchNo expiryDate mfgDate currentQty
    purchaseRate mrpRate supplier firstRefNo status blockReason`;

export class PosItemBatchesQuery {
    async execute(itemCode, includeEmpty = true) {
        const data = await gql(
            `query ItemBatches($c: String!, $e: Boolean) {
                posItemBatches(itemCode: $c, includeEmpty: $e) { ${BATCH_FIELDS} }
            }`,
            { useAdmin: true, variables: { c: itemCode, e: includeEmpty } },
        );
        return data.posItemBatches || [];
    }
}

/** Batches expiring within `days`. 0 means only what has already expired. */
export class PosExpiringBatchesQuery {
    async execute(days = 90, includeExpired = true) {
        const data = await gql(
            `query Expiring($d: Int!, $x: Boolean) {
                posExpiringBatches(days: $d, includeExpired: $x) {
                    id itemCode itemName batchNo expiryDate currentQty
                    purchaseRate daysLeft stockValue supplier status
                }
            }`,
            { useAdmin: true, variables: { d: days, x: includeExpired } },
        );
        return data.posExpiringBatches || [];
    }
}

export class SetPosBatchBlockedCommand {
    async execute(id, blocked, reason) {
        const data = await gql(
            `mutation BlockBatch($id: ID!, $b: Boolean!, $r: String) {
                setPosBatchBlocked(id: $id, blocked: $b, reason: $r) { ${BATCH_FIELDS} }
            }`,
            { useAdmin: true, variables: { id: String(id), b: !!blocked, r: reason || null } },
        );
        invalidateCache('pos:items');
        return data.setPosBatchBlocked;
    }
}

/* ── credit limits ──────────────────────────────────────────────────────── */

const CREDIT_FIELDS = `id type partyName contactNumber creditLimit creditDays
    blocked blockReason remarks status`;

export class PosPartyCreditsQuery {
    async execute(type) {
        const data = await gql(
            `query PartyCredits($t: String) { posPartyCredits(type: $t) { ${CREDIT_FIELDS} } }`,
            { useAdmin: true, variables: { t: type || null } },
        );
        return data.posPartyCredits || [];
    }
}

/**
 * What one party owes now and how much room is left.
 *
 * Read at the till the moment a credit sale is chosen, so the operator sees the
 * position before they ring the bill rather than after the server refuses it.
 */
export class PosPartyCreditStatusQuery {
    async execute(partyName, type) {
        const data = await gql(
            `query CreditStatus($n: String!, $t: String) {
                posPartyCreditStatus(partyName: $n, type: $t) {
                    partyName creditLimit creditDays blocked blockReason
                    outstanding available hasRule
                }
            }`,
            { useAdmin: true, variables: { n: partyName, t: type || null } },
        );
        return data.posPartyCreditStatus;
    }
}

export class SavePosPartyCreditCommand {
    async execute(input) {
        const data = await gql(
            `mutation SaveCredit($i: PosPartyCreditInput!) {
                savePosPartyCredit(input: $i) { ${CREDIT_FIELDS} }
            }`,
            { useAdmin: true, variables: { i: input } },
        );
        return data.savePosPartyCredit;
    }
}

export class RemovePosPartyCreditCommand {
    async execute(id) {
        const data = await gql(
            `mutation RemoveCredit($id: ID!) { removePosPartyCredit(id: $id) { id status } }`,
            { useAdmin: true, variables: { id: String(id) } },
        );
        return data.removePosPartyCredit;
    }
}

/* ── restaurant ─────────────────────────────────────────────────────────────
 *
 * Tables, running orders and kitchen tickets. Nothing here is cached: a floor
 * plan showing a table as free when someone is sitting at it is worse than a
 * slow floor plan, and two waiters read the same screen at once.
 */
const ORDER_FIELDS = `id orderNo orderDate orderTime orderType tableId tableCode
    waiter guestCount customerName customerPhone status runningTotal remarks
    lines { lineId itemCode itemName qty sentQty billedQty unit rate notes
            modifiers { name itemCode priceDelta } }`;

const TICKET_FIELDS = `id ticketNo ticketType orderNo tableCode waiter ticketDate ticketTime
    lines { itemCode itemName qty unit notes modifiers }`;

export class PosTablesQuery {
    async execute() {
        const data = await gql(
            `query Tables { posTables { id code name area seats status currentOrderId posX posY sortOrder } }`,
            { useAdmin: true },
        );
        return data.posTables || [];
    }
}

export class SavePosTableCommand {
    async execute(input) {
        const data = await gql(
            `mutation SaveTable($i: PosTableInput!) {
                savePosTable(input: $i) { id code name area seats status currentOrderId }
            }`,
            { useAdmin: true, variables: { i: input } },
        );
        return data.savePosTable;
    }
}

export class RemovePosTableCommand {
    async execute(id) {
        const data = await gql(
            `mutation RemoveTable($id: ID!) { removePosTable(id: $id) { id recordStatus } }`,
            { useAdmin: true, variables: { id: String(id) } },
        );
        return data.removePosTable;
    }
}

export class PosOrdersQuery {
    async execute(status) {
        const data = await gql(
            `query Orders($s: String) { posOrders(status: $s) { ${ORDER_FIELDS} } }`,
            { useAdmin: true, variables: { s: status || null } },
        );
        return data.posOrders || [];
    }
}

export class PosOrderQuery {
    async execute(id) {
        const data = await gql(
            `query Order($id: ID!) { posOrder(id: $id) { ${ORDER_FIELDS} } }`,
            { useAdmin: true, variables: { id: String(id) } },
        );
        return data.posOrder;
    }
}

export class OpenPosOrderCommand {
    async execute(input) {
        const data = await gql(
            `mutation OpenOrder($i: PosOpenOrderInput!) { openPosOrder(input: $i) { ${ORDER_FIELDS} } }`,
            { useAdmin: true, variables: { i: input } },
        );
        return data.openPosOrder;
    }
}

export class UpdatePosOrderLinesCommand {
    async execute(input) {
        const data = await gql(
            `mutation UpdateOrder($i: PosUpdateOrderLinesInput!) {
                updatePosOrderLines(input: $i) { ${ORDER_FIELDS} }
            }`,
            { useAdmin: true, variables: { i: input } },
        );
        return data.updatePosOrderLines;
    }
}

/** Returns the tickets it created — an empty array when nothing changed. */
export class SendPosOrderToKitchenCommand {
    async execute(orderId) {
        const data = await gql(
            `mutation SendKitchen($id: ID!) { sendPosOrderToKitchen(orderId: $id) { ${TICKET_FIELDS} } }`,
            { useAdmin: true, variables: { id: String(orderId) } },
        );
        return data.sendPosOrderToKitchen || [];
    }
}

export class BillPosOrderCommand {
    async execute(input) {
        const data = await gql(
            `mutation BillOrder($i: PosBillOrderInput!) {
                billPosOrder(input: $i) {
                    id billNo billDate billTime grandTotal receivedAmount changeReturned
                    balanceDue saleType customerName salesMan itemsJson
                }
            }`,
            { useAdmin: true, variables: { i: input } },
        );
        // The bill moved stock and money — every list that shows either is stale.
        invalidateCache('pos:items');
        invalidateCache('ledger:');
        return data.billPosOrder;
    }
}

export class CancelPosOrderCommand {
    async execute(id, reason) {
        const data = await gql(
            `mutation CancelOrder($id: ID!, $r: String) { cancelPosOrder(id: $id, reason: $r) { id status } }`,
            { useAdmin: true, variables: { id: String(id), r: reason || null } },
        );
        return data.cancelPosOrder;
    }
}

export class MovePosOrderCommand {
    async execute(orderId, toTableId) {
        const data = await gql(
            `mutation MoveOrder($o: ID!, $t: Int!) { movePosOrder(orderId: $o, toTableId: $t) { ${ORDER_FIELDS} } }`,
            { useAdmin: true, variables: { o: String(orderId), t: Number(toTableId) } },
        );
        return data.movePosOrder;
    }
}

export class MergePosOrdersCommand {
    async execute(fromOrderId, intoOrderId) {
        const data = await gql(
            `mutation MergeOrders($f: ID!, $i: ID!) {
                mergePosOrders(fromOrderId: $f, intoOrderId: $i) { ${ORDER_FIELDS} }
            }`,
            { useAdmin: true, variables: { f: String(fromOrderId), i: String(intoOrderId) } },
        );
        return data.mergePosOrders;
    }
}

export class PosOrderTicketsQuery {
    async execute(orderId) {
        const data = await gql(
            `query Tickets($id: ID!) { posOrderTickets(orderId: $id) { ${TICKET_FIELDS} } }`,
            { useAdmin: true, variables: { id: String(orderId) } },
        );
        return data.posOrderTickets || [];
    }
}

/* ── charges ────────────────────────────────────────────────────────────────
 *
 * The shop's own charges — delivery, packing, service, freight. Not cached:
 * the till reads them on every bill, and a charge switched off this morning
 * must stop appearing this morning.
 */
const CHARGE_FIELDS = `id code name calcType value basis taxable gstPercent
    mode editable showOnSale showOnPurchase sortOrder accountId remarks status`;

export class PosChargesQuery {
    async execute(scope) {
        const data = await gql(
            `query Charges($s: String) { posCharges(scope: $s) { ${CHARGE_FIELDS} } }`,
            { useAdmin: true, variables: { s: scope || null } },
        );
        return data.posCharges || [];
    }
}

/**
 * What the charges come to for a bill in progress.
 *
 * The till never works this out itself. The server owns the arithmetic — the
 * same server that will refuse a total it disagrees with when the bill is
 * saved — so the figure on screen and the figure on the bill cannot differ.
 */
export class PosChargePreviewQuery {
    async execute({ scope = 'SALE', itemsTotal, discount = 0, applied = [] }) {
        const data = await gql(
            `query ChargePreview($s: String, $t: Float!, $d: Float, $a: [PosChargeAppliedInput!]) {
                posChargePreview(scope: $s, itemsTotal: $t, discount: $d, applied: $a) {
                    chargesTotal chargesTax
                    lines { code name calcType value amount taxable gstPercent taxAmount }
                }
            }`,
            {
                useAdmin: true,
                variables: {
                    s: scope,
                    t: Number(itemsTotal) || 0,
                    d: Number(discount) || 0,
                    a: applied.length ? applied : null,
                },
            },
        );
        return data.posChargePreview || { lines: [], chargesTotal: 0, chargesTax: 0 };
    }
}

export class SavePosChargeCommand {
    async execute(input) {
        const data = await gql(
            `mutation SaveCharge($i: PosChargeInput!) { savePosCharge(input: $i) { ${CHARGE_FIELDS} } }`,
            { useAdmin: true, variables: { i: input } },
        );
        // A new charge becomes a print field, so the designer's list is stale.
        invalidateCache('pos:print-catalogue');
        return data.savePosCharge;
    }
}

export class RemovePosChargeCommand {
    async execute(id) {
        const data = await gql(
            `mutation RemoveCharge($id: ID!) { removePosCharge(id: $id) { id status } }`,
            { useAdmin: true, variables: { id: String(id) } },
        );
        invalidateCache('pos:print-catalogue');
        return data.removePosCharge;
    }
}

/** The order they were dragged into. Send every id, in the new order. */
export class ReorderPosChargesCommand {
    async execute(ids) {
        const data = await gql(
            `mutation ReorderCharges($ids: [ID!]!) { reorderPosCharges(ids: $ids) { ${CHARGE_FIELDS} } }`,
            { useAdmin: true, variables: { ids: ids.map(String) } },
        );
        return data.reorderPosCharges || [];
    }
}
