"use client";
/**
 * Brand lockup — the one place the logo is assembled.
 *
 * The mark is artwork (`public/brand/mark.svg`); the wordmark is TYPE, not an
 * image. Typesetting it means it stays sharp at every size, recolours for dark
 * surfaces, and carries "AVS" — which the mark alone does not spell out.
 *
 *   AVS ECOM  → ink (or white on dark)
 *   HUB       → brand gradient
 *
 * If the mark file is missing the lockup still renders, wordmark only — never a
 * broken image, never a placeholder letter standing in for the logo.
 */
import React, { useState } from 'react';

const cx = (...a) => a.filter(Boolean).join(' ');

/**
 * Just the symbol. `tone="light"` uses the knockout artwork for dark surfaces.
 *
 * Sources are tried in order, so dropping the designer's original at
 * `public/brand/mark.png` takes over with no code change; the bundled SVG is only
 * the fallback. If nothing loads, nothing renders — the wordmark still reads.
 */
const SOURCES = {
    dark:  ['/brand/mark.png', '/brand/mark.jpg', '/brand/mark.svg'],
    light: ['/brand/mark-white.png', '/brand/mark-white.svg', '/brand/mark.png', '/brand/mark.jpg'],
};

export function Mark({ size = 32, tone = 'dark', className }) {
    const [step, setStep] = useState(0);
    const list = SOURCES[tone] || SOURCES.dark;
    if (step >= list.length) return null;
    return (
        <img
            key={list[step]}
            src={list[step]}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
            onError={() => setStep(s => s + 1)}
            className={cx('object-contain shrink-0', className)}
            style={{ width: size, height: size }}
        />
    );
}

/** `AVS ECOM` + `HUB`, set in type. */
export function Wordmark({ size = 20, tone = 'dark', className }) {
    return (
        <span
            className={cx('font-extrabold tracking-[-.01em] whitespace-nowrap leading-none', className)}
            style={{ fontSize: size }}
        >
            <span style={{ color: tone === 'light' ? '#FFFFFF' : 'var(--pos-ink)' }}>AVS&nbsp;ECOM&nbsp;</span>
            <span style={{
                background: 'linear-gradient(90deg, var(--pos-brand-from), var(--pos-brand-to))',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
            }}>HUB</span>
        </span>
    );
}

/**
 * The full lockup.
 *   layout="row"    mark beside the wordmark — sidebars, headers, print
 *   layout="stack"  mark above a centred wordmark — sign-in
 */
export function Brand({
    layout = 'row',
    markSize = 30,
    wordSize = 17,
    tone = 'dark',
    tagline,
    className,
}) {
    const sub = tagline && (
        <span className="block text-[11.5px] leading-tight mt-1"
              style={{ color: tone === 'light' ? 'rgba(255,255,255,.45)' : 'var(--pos-ink-3)' }}>
            {tagline}
        </span>
    );

    if (layout === 'stack') {
        return (
            <div className={cx('flex flex-col items-center text-center', className)}>
                <Mark size={markSize} tone={tone} />
                <span className="mt-3 block"><Wordmark size={wordSize} tone={tone} /></span>
                {sub}
            </div>
        );
    }

    return (
        <div className={cx('flex items-center gap-2.5 min-w-0', className)}>
            <Mark size={markSize} tone={tone} />
            <span className="min-w-0">
                <Wordmark size={wordSize} tone={tone} />
                {sub}
            </span>
        </div>
    );
}

export default Brand;
