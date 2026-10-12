import { useMemo } from 'react';
import { ageInMonths, maxMonths, valueOf, normInv, valueAtZ, type Metric } from '../lib/growth';
import type { Child, GrowthRecord } from '../lib/types';

const BANDS: [number, number][] = [
  [3, 97],
  [10, 90],
  [25, 75],
];
const W = 340;
const H = 260;
const PAD = { l: 34, r: 30, t: 14, b: 28 };

export function GrowthChart({ child, records, metric }: { child: Child; records: GrowthRecord[]; metric: Metric }) {
  const pts = records
    .map((r) => ({ x: ageInMonths(child.birth, r.date), y: valueOf(r, metric), id: r.id }))
    .filter((p): p is { x: number; y: number; id: string } => p.y != null && p.x >= 0);

  const max = maxMonths(child.sex, metric);
  const { x0, x1 } = useMemo(() => {
    const xs = pts.map((p) => p.x);
    let lo = xs.length ? Math.min(...xs) - 6 : 0;
    let hi = xs.length ? Math.max(...xs) + 12 : 24;
    if (hi - lo < 24) hi = lo + 24;
    lo = Math.max(0, Math.floor(lo));
    hi = Math.min(max, Math.ceil(hi));
    return { x0: lo, x1: hi };
  }, [pts, max]);

  const curves = useMemo(() => {
    const zs = [3, 10, 25, 50, 75, 90, 97].map((p) => [p, normInv(p / 100)] as const);
    const step = Math.max(0.5, (x1 - x0) / 80);
    const out: Record<number, [number, number][]> = {};
    for (const [p, z] of zs) {
      out[p] = [];
      for (let m = x0; m <= x1 + 1e-9; m += step) out[p].push([m, valueAtZ(child.sex, metric, m, z)!]);
    }
    return out;
  }, [child.sex, metric, x0, x1]);

  const ys = [...curves[3].map((c) => c[1]), ...curves[97].map((c) => c[1]), ...pts.map((p) => p.y)];
  const y0 = Math.floor(Math.min(...ys) * 0.97);
  const y1 = Math.ceil(Math.max(...ys) * 1.02);
  const sx = (m: number) => PAD.l + ((m - x0) / (x1 - x0 || 1)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => H - PAD.b - ((v - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const line = (c: [number, number][]) => c.map(([m, v], i) => `${i ? 'L' : 'M'}${sx(m).toFixed(1)},${sy(v).toFixed(1)}`).join('');
  const band = (lo: number, hi: number) =>
    line(curves[hi]) + curves[lo].slice().reverse().map(([m, v]) => `L${sx(m).toFixed(1)},${sy(v).toFixed(1)}`).join('') + 'Z';

  const xTicks = niceTicks(x0, x1, x1 - x0 > 120 ? 24 : x1 - x0 > 24 ? 12 : 3);
  const yTicks = niceTicks(y0, y1, niceStep((y1 - y0) / 5));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`${child.name} 성장 그래프`}>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} className="grid" />
          <text x={PAD.l - 5} y={sy(v) + 3} className="tick" textAnchor="end">{v}</text>
        </g>
      ))}
      {xTicks.map((m) => (
        <text key={m} x={sx(m)} y={H - 8} className="tick" textAnchor="middle">{m > 0 && m % 12 === 0 ? `${m / 12}세` : `${m}개월`}</text>
      ))}
      {BANDS.map(([lo, hi], i) => (
        <path key={lo} d={band(lo, hi)} className={`band band-${i}`} />
      ))}
      <path d={line(curves[50])} className="median" />
      {[3, 50, 97].map((p) => {
        const last = curves[p][curves[p].length - 1];
        return (
          <text key={p} x={W - PAD.r + 3} y={sy(last[1]) + 3} className="tick pct-label">{p}</text>
        );
      })}
      {pts.length > 1 && <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x)},${sy(p.y)}`).join('')} className="child-line" style={{ stroke: child.color }} />}
      {pts.map((p, i) => (
        <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={i === pts.length - 1 ? 6.5 : 4.5} className="child-dot" style={{ fill: child.color }} />
      ))}
    </svg>
  );
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p;
}

function niceTicks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(Number(v.toFixed(2)));
  return out;
}
