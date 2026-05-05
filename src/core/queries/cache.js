/**
 * Global in-memory cache with TTL + request deduplication.
 * Ensures ONE network request per key even when many components call it concurrently.
 */

const _cache = new Map();      // key -> { value, expiresAt }
const _inflight = new Map();   // key -> Promise (deduplication)

/**
 * Cached fetch: if data is fresh, returns instantly. Otherwise deduplicates concurrent fetches.
 * @param {string} key - unique cache key
 * @param {() => Promise<any>} fetcher - async function that fetches the data
 * @param {number} ttlMs - time-to-live in milliseconds (default 60s)
 */
export async function cachedFetch(key, fetcher, ttlMs = 60_000) {
    const now = Date.now();
    const entry = _cache.get(key);
    if (entry && entry.expiresAt > now) {
        return entry.value;
    }
    // Deduplicate: if another call is already fetching this key, wait for it
    if (_inflight.has(key)) {
        return _inflight.get(key);
    }
    const promise = (async () => {
        try {
            const value = await fetcher();
            _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
            return value;
        } finally {
            _inflight.delete(key);
        }
    })();
    _inflight.set(key, promise);
    return promise;
}

export function invalidateCache(keyOrPrefix) {
    if (!keyOrPrefix) {
        _cache.clear();
        return;
    }
    for (const k of _cache.keys()) {
        if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
            _cache.delete(k);
        }
    }
}

// Expose for debugging
if (typeof window !== 'undefined') {
    window.__posCache = { cache: _cache, inflight: _inflight, invalidate: invalidateCache };
}
