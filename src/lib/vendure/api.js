import { print } from 'graphql';
import { getAuthToken } from '@/lib/auth';
const VENDURE_API_URL = process.env.VENDURE_SHOP_API_URL || process.env.NEXT_PUBLIC_VENDURE_SHOP_API_URL;
const VENDURE_CHANNEL_TOKEN = process.env.VENDURE_CHANNEL_TOKEN || process.env.NEXT_PUBLIC_VENDURE_CHANNEL_TOKEN || '__default_channel__';
const VENDURE_AUTH_TOKEN_HEADER = process.env.VENDURE_AUTH_TOKEN_HEADER || 'vendure-auth-token';
const VENDURE_CHANNEL_TOKEN_HEADER = process.env.VENDURE_CHANNEL_TOKEN_HEADER || 'vendure-token';
if (!VENDURE_API_URL) {
    throw new Error('VENDURE_SHOP_API_URL or NEXT_PUBLIC_VENDURE_SHOP_API_URL environment variable is not set');
}
/**
 * Extract the Vendure auth token from response headers
 */
function extractAuthToken(headers) {
    return headers.get(VENDURE_AUTH_TOKEN_HEADER);
}
/**
 * Execute a GraphQL query against the Vendure API
 */
export async function query(document, ...[variables, options]) {
    const { token, useAuthToken, channelToken, fetch: fetchOptions, tags, } = options || {};
    const headers = {
        'Content-Type': 'application/json',
        ...fetchOptions?.headers,
    };
    // Use the explicitly provided token, or fetch from cookies if useAuthToken is true
    let authToken = token;
    if (useAuthToken && !authToken) {
        authToken = await getAuthToken();
    }
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    // Set the channel token header (use provided channelToken or default)
    headers[VENDURE_CHANNEL_TOKEN_HEADER] = channelToken || VENDURE_CHANNEL_TOKEN;
    const response = await fetch(VENDURE_API_URL, {
        ...fetchOptions,
        method: 'POST',
        headers,
        body: JSON.stringify({
            query: print(document),
            variables: variables || {},
        }),
        ...(tags && { next: { tags } }),
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (result.errors) {
        throw new Error(result.errors.map(e => e.message).join(', '));
    }
    if (!result.data) {
        throw new Error('No data returned from Vendure API');
    }
    const newToken = extractAuthToken(response.headers);
    return {
        data: result.data,
        ...(newToken && { token: newToken }),
    };
}
/**
 * Execute a GraphQL mutation against the Vendure API
 */
export async function mutate(document, ...[variables, options]) {
    // Mutations use the same underlying implementation as queries in GraphQL
    // @ts-expect-error - Complex conditional type inference, runtime behavior is correct
    return query(document, variables, options);
}
