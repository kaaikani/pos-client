import { NextResponse } from 'next/server';
export async function POST(req) {
    try {
        const { barcode } = await req.json();
        if (!barcode) {
            return NextResponse.json({ success: false, error: 'Barcode is required' }, { status: 400 });
        }
        // 1. Call Vendure GraphQL internally via IQuery Layer
        const query = `
      query ScanBarcode($term: String!) {
        search(input: { term: $term, take: 1, groupByProduct: false }) {
          items {
            productId
            productVariantId
            productName
            sku
            price {
              ... on PriceRange { min }
              ... on SinglePrice { value }
            }
            productAsset { preview }
          }
        }
      }
    `;
        // Connect to Vendure Backend (URL configured via env variable)
        const VENDURE_BASE = (process.env.VENDURE_SHOP_API_URL ? process.env.VENDURE_SHOP_API_URL.replace(/\/shop-api$/, '') : null)
            || process.env.NEXT_PUBLIC_VENDURE_API_URL
            || 'http://127.0.0.1:3000';
        const res = await fetch(`${VENDURE_BASE.replace(/\/$/, '')}/shop-api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { term: barcode } }),
            // cache: 'no-store' // Enforce real-time lookup
        });
        const json = await res.json();
        // 2. Validate response from GraphQL
        if (!json.data || !json.data.search || json.data.search.items.length === 0) {
            return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
        }
        const item = json.data.search.items[0];
        // 3. Transform to strict IQuery format (PosProduct)
        const priceValue = item.price.value !== undefined ? item.price.value : item.price.min || 0;
        const transformedProduct = {
            id: item.productVariantId,
            categoryId: 'all', // Can lookup categories if required
            barcode: item.sku, // If 'customFields.barcode' exists, Vendure returns it in a separate query, using SKU inherently for standard variants.
            name: item.productName,
            price: priceValue / 100,
            stock: 99, // Dynamic inventory check could go here
            unit: 'pcs',
            img: item.productAsset?.preview || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=200'
        };
        // 4. Return unified result
        return NextResponse.json({ success: true, product: transformedProduct });
    }
    catch (error) {
        console.error('IQuery Barcode Scan Error:', error);
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}
