'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchPortfolio } from '@/lib/api';
import { adaptPortfolio } from '@/lib/adapt';
import { inr, pct, dir, clock, day } from '@/lib/format';
import { Icon } from '@/components/common/Icons';
import Breadth from '@/components/Breadth';
import Sparkline from '@/components/Sparkline';
import PriceHistory from '@/components/PriceHistory';
import ScanStatus from '@/components/ScanStatus';
import CompanyDetailSheet from '@/components/CompanyDetailSheet';

const mood = (g, d) => (g > d * 1.5 ? 'Broad gains' : d > g * 1.5 ? 'Broad losses' : 'Mixed close');
const tagOf = (h, a) => (a.kind === 'volume' ? `${(h.volRatio ?? 0).toFixed(1)}× vol` : 'Threshold');

export default function Home() {
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(null);
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setErr('');
    try {
      const d = adaptPortfolio(await fetchPortfolio());
      setP(d);
      window.dispatchEvent(new CustomEvent('finn:alerts', { detail: d.alertCount }));
    } catch { setErr('Could not load the portfolio. Check that the backend is running, then try again.'); }
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="empty"><b>Portfolio unavailable</b>{err}<div style={{ marginTop: 12 }}><button className="btn" onClick={load}>Try again</button></div></div>;
  if (!p) return <p className="muted">Loading closing prices…</p>;

  const flagged = all ? p.flagged : p.flagged.slice(0, 4);
  return (
    <>
      <section>
        <p className="asof">{p.holdings.length} portfolio companies, closing prices {day(p.asOf)}</p>
        <h1 className="h1" style={{ margin: '6px 0 4px' }}>{mood(p.gainers, p.decliners)}: <span className="up">{p.gainers} up</span>, <span className="down">{p.decliners} down</span></h1>
        <p className="muted">{p.alertCount} alerts today{p.flagged.length ? `, ${p.flagged.length} companies need a look.` : '.'}</p>
        <Breadth holdings={p.holdings} onPick={setPick} />
        <div className="comb-foot num">
          <span>Best: {p.top?.symbol} <span className="up">{pct(p.top?.changePct)}</span></span>
          <span>Weakest: {p.weakest?.symbol} <span className="down">{pct(p.weakest?.changePct)}</span></span>
        </div>
      </section>

      {p.flagged.length > 0 && (
        <section>
          <div className="sec-head"><h2 className="h2">Needs attention</h2><span className="asof">{p.flagged.length} flagged</span></div>
          {flagged.map((h) => (
            <button key={h.id} className="attn" onClick={() => setPick(h)}>
              <span><span className="sym">{h.symbol}</span> <span className="muted" style={{ fontSize: 13 }}>{h.name}</span><p>{h.anomalies[0].message}</p></span>
              <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{h.anomalies.map((a, i) => <span className="tag flag" key={i}>{tagOf(h, a)}</span>)}</span>
            </button>
          ))}
          {p.flagged.length > 4 && <button className="link" style={{ marginTop: 10 }} onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${p.flagged.length}`}</button>}
        </section>
      )}

      <PriceHistory holdings={p.holdings} />

      <section>
        <div className="sec-head"><h2 className="h2">Portfolio holdings</h2><span className="asof">{p.holdings.length} companies</span></div>
        <div className="ledger">
          {p.holdings.map((h) => (
            <button key={h.id} className="lrow" onClick={() => setPick(h)}>
              <span style={{ minWidth: 0 }}><span className="sym">{h.symbol}</span><span className="nm" style={{ display: 'block' }}>{h.name}{h.sector ? `, ${h.sector}` : ''}</span></span>
              <Sparkline data={h.spark} />
              <span className="px num">{inr(h.close)}<small className={dir(h.changePct)}>{pct(h.changePct)}</small></span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <ScanStatus scan={p.scan} source={p.source} asOf={p.asOf} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <button className="btn ghost sm" onClick={load} disabled={busy}><Icon name="refresh" size={16} />{busy ? 'Refreshing…' : 'Refresh market data'}</button>
          <span className="note">Last check {clock(p.lastCheck)}</span>
        </div>
      </section>

      <CompanyDetailSheet h={pick} onClose={() => setPick(null)} />
    </>
  );
}
