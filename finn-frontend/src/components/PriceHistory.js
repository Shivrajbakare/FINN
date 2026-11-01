'use client';
import { useState } from 'react';
import { inr, pct, dir, day } from '@/lib/format';

const RANGES = ['1M', '3M', '6M'];
const norm = (a) => a.map((p) => (typeof p === 'number' ? { v: p } : { v: p.close ?? p.value, d: p.date }));

export default function PriceHistory({ holdings }) {
  const [sym, setSym] = useState(holdings[0]?.id);
  const [range, setRange] = useState('1M');
  const [at, setAt] = useState(null);
  const h = holdings.find((x) => x.id === sym) ?? holdings[0];
  if (!h) return null;
  const raw = Array.isArray(h.series) ? h.series : h.series?.[range] ?? h.spark ?? [];
  const pts = norm(raw).filter((p) => p.v != null);
  const W = 360, H = 130;
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v)), r = hi - lo || 1;
  const X = (i) => (i / Math.max(1, pts.length - 1)) * W;
  const Y = (v) => H - 12 - ((v - lo) / r) * (H - 28);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join('');
  const cur = at != null ? pts[at] : pts[pts.length - 1];
  const move = (e) => {
    const b = e.currentTarget.getBoundingClientRect();
    setAt(Math.round(Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)) * (pts.length - 1)));
  };
  return (
    <section>
      <div className="sec-head"><h2 className="h2">Price history</h2></div>
      <select value={h.id} onChange={(e) => { setSym(e.target.value); setAt(null); }} aria-label="Company">
        {holdings.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.id})</option>)}
      </select>
      <div className="bigpx num">{inr(cur?.v ?? h.close)}</div>
      <div className="asof">{at != null && cur?.d ? day(cur.d) : <>Closing price, INR, {day(h.asOf)}</>}</div>
      {pts.length > 1 && (
        <div className="chart" onPointerMove={move} onPointerLeave={() => setAt(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${h.name} closing prices, ${range}`}>
            <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
            {at != null && <><line x1={X(at)} x2={X(at)} y1="4" y2={H - 4} stroke="var(--accent)" /><circle cx={X(at)} cy={Y(pts[at].v)} r="4.5" fill="var(--accent)" /></>}
          </svg>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <div className="chips" style={{ margin: 0, padding: 0 }}>
          {RANGES.map((x) => <button key={x} className="chip" aria-pressed={range === x} onClick={() => setRange(x)}>{x}</button>)}
        </div>
        <span className={'num ' + dir(h.changePct)} style={{ fontWeight: 600 }}>{pct(h.changePct)} today</span>
      </div>
      <p className="note" style={{ marginTop: 8 }}>Historical closing prices, not live quotes. Portfolio value requires actual holdings quantities.</p>
    </section>
  );
}
