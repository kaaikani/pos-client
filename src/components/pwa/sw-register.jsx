"use client";
/**
 * Service-worker lifecycle.
 *
 * In DEVELOPMENT the worker is actively UNREGISTERED and its caches purged.
 * The previous version cached every same-origin GET cache-first, including
 * `/_next/static/chunks/*`. Turbopack reuses chunk filenames across rebuilds in
 * dev, so the worker kept serving a stale chunk and the app failed at runtime
 * with "module factory is not available" — and deleting `.next` did not help,
 * because the stale copy lived in the browser, not on disk.
 *
 * In PRODUCTION it registers normally and takes over as soon as it activates.
 */
import { useEffect } from 'react';

const IS_DEV = process.env.NODE_ENV !== 'production';

export default function SWRegister() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;

        if (IS_DEV) {
            // Remove any worker installed by an earlier build and drop its caches,
            // otherwise a developer keeps loading stale chunks forever.
            navigator.serviceWorker.getRegistrations()
                .then(regs => Promise.all(regs.map(r => r.unregister())))
                .then(unregistered => {
                    if (!unregistered.some(Boolean)) return;
                    console.info('[SW] unregistered in development — reload once to load fresh chunks.');
                })
                .catch(() => {});
            if (typeof caches !== 'undefined') {
                caches.keys()
                    .then(keys => Promise.all(keys.map(k => caches.delete(k))))
                    .catch(() => {});
            }
            return;
        }

        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(reg => { if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); })
            .catch(err => console.warn('[SW] registration failed', err));
    }, []);

    return null;
}
