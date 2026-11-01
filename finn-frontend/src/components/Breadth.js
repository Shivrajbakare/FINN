'use client';
import { useState } from 'react';
import { pct } from '@/lib/format';

/* The "close comb": one tick per company, best to worst. Up above the line, down below.
   A marigold dot marks anything that tripped an alert. Tap a tick to open the company. */
export default function Breadth({ holdings, onPick }) {
  const [hot, setHot] = useState(null);
  const list = [...holdings].sort((a, b) => b.changePct - a.changePct);
  const W = 360, H = 120, mid = 60, n = list.length || 1;
  const step = W / n, bw = Math.min(12, step - 4);
  const max = Math.max(3, ...list.map((h) => Math.abs(h.changePct)));
  const sel = hot != null ? list[hot] : null;
  return (
    <div className="comb">
      <div className="comb-read num" aria-live="polite">
        {sel ? <>{sel.symbol} <span className={sel.changePct >= 0 ? 'up' : 'down'}>{pct(sel.changePct)}</span></> : <span className="faint" style={{ fontWeight: 400 }}>Tap a bar to open a company</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Today's move for each company">
        <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--ink)" strokeWidth="1" />
        {list.map((h, i) => {
          const x = i * step + (step - bw) / 2;
          const len = Math.max(3, (Math.abs(h.changePct) / max) * 50);
          const up = h.changePct >= 0;
          const y = up ? mid - len : mid;
          return (
            <g key={h.id} className="tick" tabIndex={0} role="button" aria-label={`${h.symbol} ${pct(h.changePct)}`}
               onClick={() => onPick(h)} onKeyDown={(e) => e.key === 'Enter' && onPick(h)}
               onPointerEnter={() => setHot(i)} onFocus={() => setHot(i)} onPointerLeave={() => setHot(null)}>
              <rect x={x - 2} y="0" width={bw + 4} height={H} fill="transparent" />
              <rect className="v" x={x} y={y} width={bw} height={len} rx="2" fill={up ? 'var(--up)' : 'var(--down)'} opacity={hot == null || hot === i ? 1 : 0.45} />
              {h.anomalies.length > 0 && <circle cx={x + bw / 2} cy={up ? y - 7 : y + len + 7} r="3.2" fill="var(--flag)" />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
