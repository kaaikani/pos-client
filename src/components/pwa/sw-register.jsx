"use client";
import { useEffect } from 'react';

export default function SWRegister() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(reg => { if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); })
            .catch(err => console.warn('[SW] registration failed', err));
    }, []);
    return null;
}
