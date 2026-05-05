/**
 * GQL Utility for POS Storefront
 * Uses Vendure's token-based auth (vendure-auth-token header)
 *
 * Vendure base URL is read from NEXT_PUBLIC_VENDURE_API_URL.
 * - Set this in .env when deploying to a different server.
 * - Defaults to http://127.0.0.1:3000 for local dev.
 */
const VENDURE_BASE = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_VENDURE_API_URL)
    ? process.env.NEXT_PUBLIC_VENDURE_API_URL.replace(/\/$/, '')
    : 'http://127.0.0.1:3000';
const ADMIN_API = `${VENDURE_BASE}/admin-api`;
const SHOP_API = `${VENDURE_BASE}/shop-api`;

let _adminToken = null;
let _loginPromise = null;

// Restore token from localStorage on module load (browser only)
if (typeof window !== 'undefined') {
    try {
        const session = JSON.parse(localStorage.getItem('pos_session') || 'null');
        if (session?.token && session.token !== 'vendure-session') _adminToken = session.token;
    } catch {}
}

export function getAuthToken() {
    return _adminToken;
}

export function setAuthToken(token) {
    _adminToken = token;
    _loginPromise = null;
}

async function ensureLogin() {
    if (_adminToken) return;
    if (_loginPromise) return _loginPromise;
    _loginPromise = (async () => {
        try {
            const res = await fetch(ADMIN_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: `mutation { login(username: "superadmin", password: "superadmin") { ... on CurrentUser { id } } }`,
                }),
            });
            await res.json();
            const token = res.headers.get('vendure-auth-token');
            if (token) _adminToken = token;
        } catch (e) {
            console.error('Admin auto-login failed:', e);
        }
    })();
    return _loginPromise;
}

export function clearAuthToken() {
    _adminToken = null;
    _loginPromise = null;
}

export async function gql(query, options = {}) {
    const { useAdmin = false, variables = {}, skipAuth = false } = options;
    const url = useAdmin ? ADMIN_API : SHOP_API;

    if (!query || query.trim().length === 0) {
        throw new Error('GraphQL query cannot be empty.');
    }

    // Only pre-authenticate when required AND not a login mutation itself
    if (useAdmin && !skipAuth) {
        await ensureLogin();
    }

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (useAdmin && _adminToken) {
            headers['Authorization'] = `Bearer ${_adminToken}`;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ query: query.trim(), variables }),
        });

        // Capture auth token from response (fresh login sets this)
        const newToken = res.headers.get('vendure-auth-token');
        if (newToken) _adminToken = newToken;

        const json = await res.json();

        if (json.errors) {
            // Retry once on FORBIDDEN for admin queries (stale token)
            if (json.errors[0]?.extensions?.code === 'FORBIDDEN' && useAdmin && !skipAuth) {
                _adminToken = null;
                _loginPromise = null;
                await ensureLogin();
                const retryHeaders = { ...headers };
                if (_adminToken) retryHeaders['Authorization'] = `Bearer ${_adminToken}`;
                const retryRes = await fetch(url, {
                    method: 'POST',
                    headers: retryHeaders,
                    credentials: 'include',
                    body: JSON.stringify({ query: query.trim(), variables }),
                });
                const retryToken = retryRes.headers.get('vendure-auth-token');
                if (retryToken) _adminToken = retryToken;
                const retryJson = await retryRes.json();
                if (retryJson.errors) {
                    console.error(`[GQL ERROR] URL: ${url}`, retryJson.errors);
                    throw new Error(retryJson.errors[0].message || 'GraphQL Error');
                }
                return retryJson.data;
            }
            console.error(`[GQL ERROR] URL: ${url}`, json.errors);
            throw new Error(json.errors[0].message || 'GraphQL Error');
        }

        return json.data;
    } catch (err) {
        console.error(`[FETCH ERROR] URL: ${url}`, err.message);
        throw err;
    }
}
