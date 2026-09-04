// AVS ECOM POS — Service Worker
//
// Strategy, by request type:
//   /_next/**            → NOT handled at all. Build chunks are already
//                          content-addressed and immutable; caching them here
//                          adds nothing and, because dev reuses chunk names,
//                          previously caused stale chunks to be served forever
//                          ("module factory is not available").
//   navigations (HTML)   → network-first, cached copy only as an offline fallback.
//                          Cache-first on the document meant a shipped update was
//                          never picked up.
//   shell assets         → cache-first (icons, manifest). They rarely change and
//                          are re-fetched when the cache version is bumped.
//   everything else      → stale-while-revalidate.
//
// Bump CACHE_NAME on any change here; `activate` deletes every other cache.

const CACHE_NAME = 'avsecom-pos-v3';
const SHELL = ['/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
    const { request } = e;
    if (request.method !== 'GET') return;

    let url;
    try { url = new URL(request.url); } catch { return; }

    // Same-origin only.
    if (url.origin !== location.origin) return;

    // Never touch build output, dev tooling, or the APIs.
    if (url.pathname.startsWith('/_next/')) return;
    if (url.pathname.startsWith('/__nextjs')) return;
    if (url.pathname.startsWith('/api/')) return;
    if (url.pathname.startsWith('/admin-api') || url.pathname.startsWith('/shop-api')) return;

    // Documents: network-first so a deployed update is picked up immediately.
    if (request.mode === 'navigate') {
        e.respondWith(
            fetch(request)
                .then((res) => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
        );
        return;
    }

    // Shell assets: cache-first.
    if (SHELL.includes(url.pathname)) {
        e.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
        return;
    }

    // Everything else: serve the cached copy, refresh it in the background.
    e.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request)
                .then((res) => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const copy = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
