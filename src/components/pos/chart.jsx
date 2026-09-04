"use client";
/**
 * Sales & Profit line chart.
 *
 * Hand-drawn SVG rather than a charting library: two series, a faint grid and a
 * hover readout is the whole requirement, and a library would add far more weight
 * than it saves. It scales with its container and stays legible in both themes.
 *
 * Series colours are DATA colours, deliberately separate from the semantic
 * success/warning/danger set — a line is not a status.
 */
import React, { useMemo, useRef, useState, useCallback } from 'react';

const SALES = 'var(--pos-chart-1)';
const PROFIT = 'var(--pos-chart-2)';

const money = (v) => '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN');
const compact = (v) => {
    const n = Math.abs(Number(v) || 0);
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
    if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'k';
    return '₹' + Math.round(n);
};
const dayLabel = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export default function SalesProfitChart({ series = [], height = 240, onPointClick }) {
    const wrapRef = useRef(null);
    const [hover, setHover] = useState(null);   // index

    const W = 1000;                              // viewBox width; SVG scales to fit
    const H = height;
    const PAD = { t: 14, r: 12, b: 26, l: 54 };

    const { pts, max, ticks } = useMemo(() => {
        const data = series.length ? series : [];
        const peak = Math.max(1, ...data.map(d => Math.max(Number(d.sales) || 0, Number(d.profit) || 0)));
        // Round the top of the scale up to something readable.
        const mag = Math.pow(10, Math.floor(Math.log10(peak)));
        const top = Math.ceil(peak / mag) * mag;

        const iw = W - PAD.l - PAD.r;
        const ih = H - PAD.t - PAD.b;
        const x = (i) => PAD.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
        const y = (v) => PAD.t + ih - ((Number(v) || 0) / top) * ih;

        return {
            max: top,
            ticks: [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: top * f, y: y(top * f) })),
            pts: data.map((d, i) => ({ ...d, i, x: x(i), ys: y(d.sales), yp: y(d.profit) })),
        };
    }, [series, H]);

    const path = useCallback((key) => {
        if (!pts.length) return '';
        return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p[key].toFixed(1)}`).join(' ');
    }, [pts]);

    const area = useMemo(() => {
        if (!pts.length) return '';
        const base = H - PAD.b;
        return `${path('ys')} L${pts[pts.length - 1].x.toFixed(1)} ${base} L${pts[0].x.toFixed(1)} ${base} Z`;
    }, [pts, path, H]);

    const onMove = useCallback((e) => {
        if (!pts.length || !wrapRef.current) return;
        const box = wrapRef.current.getBoundingClientRect();
        const rel = ((e.clientX - box.left) / box.width) * W;
        let best = 0;
        let dist = Infinity;
        for (const p of pts) {
            const d = Math.abs(p.x - rel);
            if (d < dist) { dist = d; best = p.i; }
        }
        setHover(best);
    }, [pts]);

    // A period with no sales must not draw an axis. Plotting all-zero data made
    // the scale collapse to 1 and printed a row of meaningless tick labels.
    const hasData = series.some(d => (Number(d.sales) || 0) > 0 || (Number(d.profit) || 0) > 0);
    if (!pts.length || !hasData) {
        return (
            <div className="flex flex-col items-center justify-center gap-1.5 text-center" style={{ height }}>
                <span className="text-[13px] font-medium text-[var(--pos-ink-2)]">No sales in this period</span>
                <span className="text-[12px] text-[var(--pos-ink-3)]">Record a bill, or choose a wider date range.</span>
            </div>
        );
    }

    const hp = hover != null ? pts[hover] : null;

    return (
        <div className="relative">
            {/* legend */}
            <div className="flex items-center gap-4 mb-2">
                {[['Sales', SALES], ['Profit', PROFIT]].map(([label, c]) => (
                    <span key={label} className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--pos-ink-2)]">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} /> {label}
                    </span>
                ))}
            </div>

            <div ref={wrapRef}
                 onMouseMove={onMove}
                 onMouseLeave={() => setHover(null)}
                 className="relative">
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} preserveAspectRatio="none"
                     role="img" aria-label="Sales and profit over the selected period">
                    <defs>
                        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor="var(--pos-chart-1)" stopOpacity=".16" />
                            <stop offset="1" stopColor="var(--pos-chart-1)" stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* grid + value axis */}
                    {ticks.map(t => (
                        <g key={t.y}>
                            <line x1={PAD.l} y1={t.y} x2={W - PAD.r} y2={t.y}
                                  stroke="var(--pos-line)" strokeWidth="1" />
                            <text x={PAD.l - 8} y={t.y + 3.5} textAnchor="end"
                                  fontSize="11" fill="var(--pos-ink-3)"
                                  style={{ fontFamily: 'var(--pos-mono)' }}>
                                {compact(t.v)}
                            </text>
                        </g>
                    ))}

                    <path d={area} fill="url(#salesFill)" />
                    <path d={path('ys')} fill="none" stroke={SALES} strokeWidth="2.4"
                          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                    <path d={path('yp')} fill="none" stroke={PROFIT} strokeWidth="2"
                          strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 4"
                          vectorEffect="non-scaling-stroke" />

                    {/* date axis — thinned so labels never collide */}
                    {pts.map((p, i) => {
                        const step = Math.ceil(pts.length / 8);
                        if (i % step !== 0 && i !== pts.length - 1) return null;
                        return (
                            <text key={p.date} x={p.x} y={H - 8} textAnchor="middle"
                                  fontSize="11" fill="var(--pos-ink-3)">
                                {dayLabel(p.date)}
                            </text>
                        );
                    })}

                    {hp && (
                        <>
                            <line x1={hp.x} y1={PAD.t} x2={hp.x} y2={H - PAD.b}
                                  stroke="var(--pos-ink-3)" strokeWidth="1" strokeDasharray="3 3" />
                            <circle cx={hp.x} cy={hp.ys} r="4.5" fill={SALES} stroke="var(--pos-surface)" strokeWidth="2" />
                            <circle cx={hp.x} cy={hp.yp} r="4" fill={PROFIT} stroke="var(--pos-surface)" strokeWidth="2" />
                        </>
                    )}

                    {/* click targets */}
                    {onPointClick && pts.map(p => (
                        <rect key={p.date} x={p.x - (W / pts.length) / 2} y={PAD.t}
                              width={W / pts.length} height={H - PAD.t - PAD.b}
                              fill="transparent" style={{ cursor: 'pointer' }}
                              onClick={() => onPointClick(p)} />
                    ))}
                </svg>

                {hp && (
                    <div className="pointer-events-none absolute z-10 rounded-[var(--pos-r)] border border-[var(--pos-line)] bg-[var(--pos-surface)] shadow-[var(--pos-shadow-lg)] px-3 py-2"
                         style={{
                             left: `calc(${(hp.x / W) * 100}% ${hp.x > W * 0.6 ? '- 150px' : '+ 12px'})`,
                             top: 6,
                         }}>
                        <div className="text-[11px] font-semibold text-[var(--pos-ink-2)] mb-1">{dayLabel(hp.date)}</div>
                        <div className="flex items-center justify-between gap-5 text-[12px]">
                            <span className="inline-flex items-center gap-1.5 text-[var(--pos-ink-3)]">
                                <span className="w-2 h-2 rounded-full" style={{ background: SALES }} /> Sales
                            </span>
                            <b className="tabular-nums" style={{ fontFamily: 'var(--pos-mono)' }}>{money(hp.sales)}</b>
                        </div>
                        <div className="flex items-center justify-between gap-5 text-[12px] mt-0.5">
                            <span className="inline-flex items-center gap-1.5 text-[var(--pos-ink-3)]">
                                <span className="w-2 h-2 rounded-full" style={{ background: PROFIT }} /> Profit
                            </span>
                            <b className="tabular-nums" style={{ fontFamily: 'var(--pos-mono)' }}>{money(hp.profit)}</b>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
