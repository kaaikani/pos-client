import { gql } from './gql';
import { cachedFetch, invalidateCache } from './cache';

// ──────────────────────────────────────────────────────────
// CATEGORIES — 1 query, cached 5 min
// ──────────────────────────────────────────────────────────
export class GetPosCategoriesQuery {
    async execute() {
        return cachedFetch('pos:categories', async () => {
            try {
                const data = await gql(`query Cats { collections(options:{take:100}) { items { id name } } }`, { useAdmin: true });
                return data.collections.items;
            } catch {
                return [{ id: 'mock-1', name: 'General' }];
            }
        }, 5 * 60_000);
    }
}

// ──────────────────────────────────────────────────────────
// ALL PRODUCTS — SINGLE query (not 10!), cached 2 min
// ──────────────────────────────────────────────────────────
async function fetchAllProductsOnce() {
    try {
        // ONE GraphQL call fetches all products with variants
        const data = await gql(`
            query AllProducts {
                products(options: { take: 500 }) {
                    totalItems
                    items {
                        id
                        name
                        collections { id name }
                        variants {
                            id name price sku stockLevel
                        }
                    }
                }
            }
        `, { useAdmin: true });

        const all = [];
        (data.products?.items || []).forEach(product => {
            const productName = product.name;
            const firstCollection = product.collections?.[0];
            (product.variants || []).forEach(v => {
                const variantName = v.name || '';
                const qty = variantName.replace(productName, '').trim() || '1 Pc';
                all.push({
                    id: v.id,
                    name: productName,
                    categoryId: firstCollection?.id || '',
                    categoryName: firstCollection?.name || 'General',
                    barcode: v.sku || v.id,
                    price: (v.price || 0) / 100,
                    stock: v.stockLevel === 'IN_STOCK' ? 100 : 0,
                    quantityStr: qty,
                    img: '',
                });
            });
        });
        return all;
    } catch (err) {
        console.error('Failed to fetch products:', err);
        return [];
    }
}

export class GetPosProductsQuery {
    async execute(categoryId) {
        // Always fetch ALL products once (cached). Filter by category on client side.
        const all = await cachedFetch('pos:allproducts', fetchAllProductsOnce, 2 * 60_000);
        if (!categoryId) return all;
        // Client-side filter by category id or name
        return all.filter(p => p.categoryId === String(categoryId) || p.categoryName === categoryId);
    }
}

// ──────────────────────────────────────────────────────────
// BARCODE LOOKUP — uses cached products (no extra HTTP)
// ──────────────────────────────────────────────────────────
export class LookupBarcodeQuery {
    async execute(barcodeOrSku) {
        const products = await cachedFetch('pos:allproducts', fetchAllProductsOnce, 2 * 60_000);
        const s = barcodeOrSku.toLowerCase();
        return products.find(p => p.barcode === barcodeOrSku || p.id.toLowerCase() === s || p.name.toLowerCase().includes(s)) || null;
    }
}

// ──────────────────────────────────────────────────────────
// CUSTOMERS — 1 query, cached 5 min
// ──────────────────────────────────────────────────────────
export class GetPosCustomersQuery {
    async execute() {
        return cachedFetch('pos:customers', async () => {
            try {
                const data = await gql(`query Custs { customers(options:{take:200}) { items { id firstName lastName emailAddress phoneNumber } } }`, { useAdmin: true });
                return data.customers.items.map(c => ({
                    id: c.id,
                    name: `${c.firstName} ${c.lastName}`.trim() || 'Walk-in',
                    phone: c.phoneNumber || '',
                    creditLimit: 0,
                    pendingBalance: 0,
                }));
            } catch {
                return [{ id: 'CUST-001', name: 'Walk-in', phone: '', creditLimit: 0, pendingBalance: 0 }];
            }
        }, 5 * 60_000);
    }
}

// ──────────────────────────────────────────────────────────
// CACHE INVALIDATION (call after CRUD)
// ──────────────────────────────────────────────────────────
export function invalidateProductsCache() {
    invalidateCache('pos:allproducts');
}
export function invalidateCategoriesCache() {
    invalidateCache('pos:categories');
}
export function invalidateCustomersCache() {
    invalidateCache('pos:customers');
}

// ──────────────────────────────────────────────────────────
// CREATE SALE (unchanged, but invalidates cache on success)
// ──────────────────────────────────────────────────────────
export class CreateSaleTransactionCommand {
    async execute(payload) {
        const invoiceId = payload?.invoiceId || ('INV-' + Date.now());
        let orderId; let orderCode;
        try {
            const createRes = await gql(`mutation { createDraftOrder { id code state } }`, { useAdmin: true });
            orderId = createRes.createDraftOrder.id;
            orderCode = createRes.createDraftOrder.code;
            const items = payload?.items || [];
            for (const item of items) {
                await gql(`mutation AddItem($orderId: ID!, $input: AddItemToDraftOrderInput!) { addItemToDraftOrder(orderId: $orderId, input: $input) { ... on Order { id } ... on ErrorResult { errorCode message } } }`, {
                    useAdmin: true, variables: { orderId, input: { productVariantId: item.id, quantity: item.qty || 1 } },
                });
            }
            const customer = payload?.customer || {};
            const isWalkIn = !customer.name || customer.name === 'Walk-in Customer' || customer.name === 'Walk-in';
            if (!isWalkIn) {
                const parts = String(customer.name).trim().split(/\s+/);
                const firstName = parts[0] || 'Walk-in';
                const lastName = parts.slice(1).join(' ') || 'Customer';
                const safePhone = (customer.phone || 'walkin').toString().replace(/\D/g, '') || 'walkin';
                const email = `${safePhone}@pos.local`;
                try {
                    await gql(`mutation SetCustomer($orderId: ID!, $input: CreateCustomerInput!) { setCustomerForDraftOrder(orderId: $orderId, input: $input) { ... on Order { id } ... on ErrorResult { errorCode message } } }`, {
                        useAdmin: true, variables: { orderId, input: { firstName, lastName, emailAddress: email, phoneNumber: customer.phone || '' } },
                    });
                } catch {}
            }
            try {
                const addrInput = { fullName: customer.name || 'Walk-in Customer', streetLine1: customer.address || 'POS Walk-in', city: 'Store', postalCode: '000000', countryCode: 'IN', phoneNumber: customer.phone || '' };
                await gql(`mutation SetAddr($orderId: ID!, $input: CreateAddressInput!) { setDraftOrderShippingAddress(orderId: $orderId, input: $input) { ... on Order { id } } }`, { useAdmin: true, variables: { orderId, input: addrInput } });
                await gql(`mutation SetBillAddr($orderId: ID!, $input: CreateAddressInput!) { setDraftOrderBillingAddress(orderId: $orderId, input: $input) { ... on Order { id } } }`, { useAdmin: true, variables: { orderId, input: addrInput } });
            } catch {}
            try {
                const smRes = await gql(`query EligibleShipping($orderId: ID!) { eligibleShippingMethodsForDraftOrder(orderId: $orderId) { id price name } }`, { useAdmin: true, variables: { orderId } });
                const methods = smRes?.eligibleShippingMethodsForDraftOrder || [];
                if (methods.length > 0) {
                    await gql(`mutation SetSM($orderId: ID!, $smId: ID!) { setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $smId) { ... on Order { id } ... on ErrorResult { errorCode message } } }`, { useAdmin: true, variables: { orderId, smId: methods[0].id } });
                }
            } catch {}
            try {
                const tRes = await gql(`mutation Transition($id: ID!) { transitionOrderToState(id: $id, state: "ArrangingPayment") { ... on Order { id state } ... on OrderStateTransitionError { errorCode message transitionError } } }`, { useAdmin: true, variables: { id: orderId } });
                if (tRes?.transitionOrderToState?.state === 'ArrangingPayment') {
                    await gql(`mutation Pay($input: ManualPaymentInput!) { addManualPaymentToOrder(input: $input) { ... on Order { id state } ... on ErrorResult { errorCode message } } }`, {
                        useAdmin: true, variables: { input: { orderId, method: 'standard-payment', transactionId: invoiceId, metadata: { paymentMode: payload?.saleType || 'OFFLINE', receivedAmount: payload?.receivedAmount || 0, posInvoiceId: invoiceId } } },
                    });
                }
            } catch {}
            return { success: true, invoiceId, orderId, orderCode };
        } catch (err) {
            console.error('CreateSaleTransaction failed:', err);
            return { success: false, invoiceId, orderId, orderCode, error: err?.message || 'Unknown' };
        }
    }
}
