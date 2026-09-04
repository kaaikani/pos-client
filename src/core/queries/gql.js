/**
 * GQL Utility for POS Storefront
 * ──────────────────────────────────────────────────────────────────
 * Uses Vendure's token-based auth: posts to /admin-api or /shop-api,
 * sends `Authorization: Bearer <token>` for authenticated requests.
 *
 * Token lifecycle:
 *   1. User submits login form → VendureLoginCommand.execute() in
 *      auth.query.js calls gql() with skipAuth:true.
 *   2. Vendure responds with `vendure-auth-token` header → captured
 *      below in setTokenFromResponse() → persisted via setAuthToken().
 *   3. Subsequent calls reuse the in-memory token via Bearer header.
 *   4. On FORBIDDEN (token expired / cleared server-side) the session
 *      is cleared and the browser is redirected to /login.
 *
 * NO hardcoded credentials. Users MUST authenticate via the login
 * page before any admin-api call succeeds.
 *
 * Vendure base URL is read from NEXT_PUBLIC_VENDURE_API_URL.
 */
const VENDURE_BASE = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_VENDURE_API_URL)
    ? process.env.NEXT_PUBLIC_VENDURE_API_URL.replace(/\/$/, '')
    : 'http://127.0.0.1:3006';
const ADMIN_API = `${VENDURE_BASE}/admin-api`;
const SHOP_API = `${VENDURE_BASE}/shop-api`;

const SESSION_KEY = 'pos_session';
const LOGIN_PATH = '/login';

let _adminToken = null;

// Restore token from localStorage on module load (browser only)
if (typeof window !== 'undefined') {
    try {
        const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (session?.token && session.token !== 'vendure-session') {
            _adminToken = session.token;
        }
    } catch {}
}

export function getAuthToken() {
    return _adminToken;
}

export function setAuthToken(token) {
    _adminToken = token || null;
}

export function clearAuthToken() {
    _adminToken = null;
}

function clearSessionAndRedirect() {
    if (typeof window === 'undefined') return;
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    _adminToken = null;
    // Avoid redirect loop if already on the login page
    if (!window.location.pathname.startsWith(LOGIN_PATH)) {
        window.location.href = LOGIN_PATH;
    }
}

function setTokenFromResponse(res) {
    const newToken = res.headers.get('vendure-auth-token');
    if (newToken) _adminToken = newToken;
}

export async function gql(query, options = {}) {
    const { useAdmin = false, variables = {}, skipAuth = false } = options;
    const url = useAdmin ? ADMIN_API : SHOP_API;

    if (!query || query.trim().length === 0) {
        throw new Error('GraphQL query cannot be empty.');
    }

    // Build headers. Attach Bearer token if we have one — even on shop-api,
    // having a session is harmless and lets server identify the actor.
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    if (_adminToken) {
        headers['Authorization'] = `Bearer ${_adminToken}`;
    }

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify({ query: query.trim(), variables }),
        });
    } catch (networkErr) {
        console.error(`[NETWORK ERROR] ${url}`, networkErr.message);
        throw new Error(`Cannot reach server at ${url}. Check your network connection.`);
    }

    // Capture refreshed auth token from response (login mutation sets this)
    setTokenFromResponse(res);

    let json;
    try {
        json = await res.json();
    } catch {
        throw new Error(`Invalid JSON response from ${url} (HTTP ${res.status})`);
    }

    if (json.errors && json.errors.length > 0) {
        const firstErr = json.errors[0];
        const code = firstErr?.extensions?.code;

        // FORBIDDEN on a protected call → token is missing/expired.
        // Don't redirect when the caller explicitly opted out (skipAuth) — that
        // path is used by the login mutation itself and the Me-check on the
        // login page, both of which want to handle errors locally.
        if (code === 'FORBIDDEN' && useAdmin && !skipAuth) {
            clearSessionAndRedirect();
        }

        const msg = firstErr.message || 'GraphQL Error';
        // Only log to console for unexpected errors — FORBIDDEN during normal
        // session expiry is expected and would clutter the console.
        if (code !== 'FORBIDDEN') {
            console.error(`[GQL ERROR] ${url}`, json.errors);
        }
        throw new Error(msg);
    }

    return json.data;
}
