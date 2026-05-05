// AVS ECOM POS — Service Worker (offline-first shell cache)
const CACHE_NAME = 'avsecom-pos-v2';
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
    const url = new URL(request.url);

    // Skip cross-origin, API, and dev HMR
    if (url.origin !== location.origin) return;
    if (url.pathname.startsWith('/admin-api') || url.pathname.startsWith('/shop-api')) return;
    if (url.pathname.startsWith('/_next/webpack-hmr') || url.pathname.startsWith('/__nextjs')) return;
    if (url.pathname.startsWith('/api/')) return;

    e.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request).then((res) => {
                if (res && res.status === 200 && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {});
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })
    );
});
