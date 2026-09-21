"use client";
/**
 * Business setup — what kind of shop this is, and which parts are switched on.
 *
 * One installation serves a trader, a distributor, a supermarket, a pharmacy
 * and a restaurant. Choosing a business type applies a sensible set of
 * switches; every switch can then be changed individually, because a real shop
 * is rarely exactly one of the five — a supermarket that also runs a token
 * counter should not have to pick the wrong type or ask for a special build.
 *
 * Turning something off here removes it from the menus AND makes the server
 * refuse it. Hiding a menu alone is not a control: a bookmark, an old tab or a
 * direct call would still reach the feature.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Building2, RefreshCw, Check } from 'lucide-react';
import { PosBusinessConfigQuery, UpdatePosBusinessConfigCommand } from '../../core/queries/pos.query';
import {
    Page, PageHeader, PageBody, Card, Button, Banner, Badge, useConfirm, useBusinessConfig,
} from '../../components/pos';

export default function BusinessSetupModule() {
    const confirm = useConfirm();

    // The sidebar reads the same configuration, and it read it once when the
    // dashboard opened. Without this the operator picks their business type,
    // watches the switches change, and the menu still shows the screens that
    // were just turned off until they reload the page by hand.
    const { reload: refreshMenu } = useBusinessConfig();

    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState('');
    const [banner, setBanner] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setConfig(await new PosBusinessConfigQuery().execute());
            setBanner(null);
        } catch (e) {
            setBanner({ tone: 'danger', text: `Could not load the business setup: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const chooseVertical = useCallback(async (v) => {
        if (!config || v.code === config.vertical) return;
        const willTurnOff = config.modules
            .filter(m => m.enabled && !v.modules.includes(m.key))
            .map(m => m.label);

        const ok = await confirm({
            title: `Set this up as ${v.label}?`,
            message: willTurnOff.length
                ? `${v.description}\n\nThese will be switched off:\n${willTurnOff.map(t => '• ' + t).join('\n')}`
                    + '\n\nNothing is deleted — the data stays and comes back if you switch them on again.'
                : v.description,
            confirmLabel: 'Apply',
        });
        if (!ok) return;

        setSaving(v.code);
        try {
            setConfig(await new UpdatePosBusinessConfigCommand().execute({ vertical: v.code }));
            await refreshMenu();
            setBanner({ tone: 'ok', text: `Set up as ${v.label}. The menu now shows only what this business uses.` });
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        } finally {
            setSaving('');
        }
    }, [config, confirm, refreshMenu]);

    const toggleModule = useCallback(async (m) => {
        setSaving(m.key);
        try {
            setConfig(await new UpdatePosBusinessConfigCommand().execute({
                modules: [{ key: m.key, enabled: !m.enabled }],
            }));
            await refreshMenu();
            setBanner({
                tone: 'ok',
                text: `${m.label} ${m.enabled ? 'switched off' : 'switched on'}.`,
            });
        } catch (e) {
            setBanner({ tone: 'danger', text: e.message });
        } finally {
            setSaving('');
        }
    }, [refreshMenu]);

    return (
        <Page>
            <PageHeader
                icon={Building2}
                title="Business Setup"
                subtitle="What kind of business this is, and which parts of the system it uses."
                meta={config ? <Badge>{config.verticalLabel}</Badge> : null}
                actions={<Button variant="default" icon={RefreshCw} onClick={load} loading={loading}>Reload</Button>}
            />
            <PageBody>
                {banner && <Banner tone={banner.tone} onClose={() => setBanner(null)}>{banner.text}</Banner>}

                <Card className="shrink-0" title="Business type"
                    subtitle="Choose the closest one. Every switch below can still be changed afterwards.">
                    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                        {(config?.verticals || []).map(v => {
                            const active = v.code === config.vertical;
                            return (
                                <button
                                    key={v.code}
                                    type="button"
                                    onClick={() => chooseVertical(v)}
                                    disabled={!!saving}
                                    className={`pos-focusable text-left p-3 rounded-[var(--pos-r-sm)] border transition-colors ${
                                        active
                                            ? 'border-[var(--pos-ink)] bg-[var(--pos-select)]'
                                            : 'border-[var(--pos-line)] hover:bg-[var(--pos-sunk)]'
                                    }`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[13.5px] font-semibold text-[var(--pos-ink)]">{v.label}</span>
                                        {active && <Check size={15} className="text-[var(--pos-ink)]" />}
                                    </div>
                                    <p className="text-[12px] text-[var(--pos-ink-3)] mt-1">{v.description}</p>
                                    <p className="text-[11px] text-[var(--pos-ink-3)] mt-1.5">
                                        Documents: {v.documents.join(' · ')}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </Card>

                <Card className="shrink-0" title="Modules"
                    subtitle="Switched off means hidden from the menu AND refused by the server.">
                    <div className="flex flex-col">
                        {(config?.modules || []).map(m => (
                            <label key={m.key}
                                className="flex items-start gap-3 py-2.5 border-b border-[var(--pos-line-soft)] last:border-b-0 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={m.enabled}
                                    disabled={!!saving}
                                    onChange={() => toggleModule(m)}
                                    className="pos-focusable accent-[var(--pos-ink-2)] w-[15px] h-[15px] mt-[2px]" />
                                <span className="min-w-0">
                                    <span className="block text-[13px] font-semibold text-[var(--pos-ink)]">{m.label}</span>
                                    <span className="block text-[12px] text-[var(--pos-ink-3)]">{m.description}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </Card>

                <Card className="shrink-0" title="Document flow"
                    subtitle="The documents this business uses, in the order they are raised.">
                    <div className="flex flex-wrap gap-1.5">
                        {(config?.documents || []).map(d => <Badge key={d}>{d}</Badge>)}
                    </div>
                </Card>
            </PageBody>
        </Page>
    );
}
