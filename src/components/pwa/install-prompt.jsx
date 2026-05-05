"use client";
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

export default function InstallPrompt() {
    const [deferred, setDeferred] = useState(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onBefore = (e) => {
            e.preventDefault();
            setDeferred(e);
            if (!localStorage.getItem('pwa_install_dismissed')) setVisible(true);
        };
        const onInstalled = () => { setVisible(false); setDeferred(null); };
        window.addEventListener('beforeinstallprompt', onBefore);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onBefore);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const install = async () => {
        if (!deferred) return;
        deferred.prompt();
        await deferred.userChoice;
        setVisible(false);
        setDeferred(null);
    };

    const dismiss = () => {
        localStorage.setItem('pwa_install_dismissed', '1');
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-4 right-4 z-50 bg-white border border-slate-300 shadow-xl rounded-lg p-4 max-w-sm flex items-start gap-3">
            <div className="bg-[#1a5276] text-white p-2 rounded"><Download size={18}/></div>
            <div className="flex-1">
                <div className="text-sm font-black text-slate-900">Install AVS ECOM POS</div>
                <div className="text-xs text-slate-600 mt-0.5">Add to home screen for full-screen access and offline shell.</div>
                <div className="flex gap-2 mt-3">
                    <button onClick={install} className="bg-[#1a5276] hover:bg-[#2980b9] text-white font-bold text-xs px-3 py-1.5 rounded">Install</button>
                    <button onClick={dismiss} className="text-slate-600 hover:text-slate-900 font-bold text-xs px-3 py-1.5">Not now</button>
                </div>
            </div>
            <button onClick={dismiss} className="text-slate-400 hover:text-slate-700"><X size={16}/></button>
        </div>
    );
}
