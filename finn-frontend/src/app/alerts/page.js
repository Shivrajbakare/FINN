'use client';
import { useEffect, useMemo, useState } from 'react';
import { fetchAnnouncements, fetchPortfolio } from '@/lib/api';
import { adaptAnnouncements, adaptPortfolio } from '@/lib/adapt';
import { loadPrefs } from '@/lib/prefs';
import { pct, dir } from '@/lib/format';
import AnnouncementCard from '@/components/AnnouncementCard';
import CompanyDetailSheet from '@/components/CompanyDetailSheet';

const WINDOWS = [['24h', 'Past 24 hours'], ['3d', 'Past 3 days'], ['7d', 'Past 7 days']];

export default function Alerts() {
  const [tab, setTab] = useState('digest');
  const [win, setWin] = useState('24h');
  const [collapse, setCollapse] = useState(true);
  const [cat, setCat] = useState('All');
  const [feed, setFeed] = useState(null);
  const [port, setPort] = useState(null);
  const [pick, setPick] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { const p = loadPrefs(); setWin(p.window || '24h'); setCollapse(p.collapse ?? true); }, []);

  useEffect(() => {
    setFeed(null); setErr('');
    fetchAnnouncements({ window: win, hideRoutine: collapse })
      .then((r) => setFeed(adaptAnnouncements(r)))
      .catch(() => setErr('Could not load filings. Try again in a moment.'));
  }, [win, collapse]);

  useEffect(() => { fetchPortfolio().then((r) => setPort(adaptPortfolio(r))).catch(() => {}); }, []);

  const cats = useMemo(() => ['All', ...new Set((feed?.items ?? []).map((i) => i.category))], [feed]);
  const items = (feed?.items ?? []).filter((i) => cat === 'All' || i.category === cat);
  const flagged = port?.flagged ?? [];

  return (
    <>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'digest'} onClick={() => setTab('digest')}>Filings{feed ? ` (${feed.items.length})` : ''}</button>
        <button role="tab" aria-selected={tab === 'anomalies'} onClick={() => setTab('anomalies')}>Market moves{port ? ` (${flagged.length})` : ''}</button>
      </div>

      {tab === 'digest' ? (
        <section>
          <h1 className="h1" style={{ fontSize: 26 }}>{feed ? `${feed.items.length} filings` : 'Filings'} across your portfolio</h1>
          <p className="muted" style={{ marginTop: 4 }}>Corporate filings, most material first.{feed?.hidden > 0 && ` ${feed.hidden} routine filings hidden.`}</p>
          <div className="chips" style={{ marginTop: 16 }} aria-label="Time window">
            {WINDOWS.map(([k, l]) => <button key={k} className="chip" aria-pressed={win === k} onClick={() => setWin(k)}>{l}</button>)}
          </div>
          <div className="chips" style={{ marginTop: 8 }} aria-label="Category">
            {cats.map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c === 'All' ? 'All filings' : c}</button>)}
          </div>
          <label className="check" style={{ margin: '16px 0 18px' }}>
            <input type="checkbox" checked={collapse} onChange={(e) => setCollapse(e.target.checked)} />
            Collapse routine paperwork (ESOP allotments, demat compliance certificates)
          </label>
          {err && <div className="empty"><b>Filings unavailable</b>{err}</div>}
          {!feed && !err && <p className="muted">Loading filings…</p>}
          {feed && !items.length && <div className="empty"><b>Nothing in this window</b>Try a longer time window or another category.</div>}
          {items.map((a) => <AnnouncementCard key={a.id} a={a} />)}
        </section>
      ) : (
        <section>
          <h1 className="h1" style={{ fontSize: 26 }}>{flagged.length} unusual moves</h1>
          <p className="muted" style={{ marginTop: 4 }}>Price or volume past your thresholds in the last close. Change thresholds in Settings.</p>
          <div style={{ marginTop: 16 }}>
            {flagged.map((h) => {
              const ratio = h.volRatio ?? 1;
              return (
                <button key={h.id} className="card" style={{ display: 'block', width: '100%' }} onClick={() => setPick(h)}>
                  <div className="card-top">
                    <span className="sym">{h.symbol}</span>
                    <span>{h.name}</span>
                    {h.sector && <span className="tag">{h.sector}</span>}
                    <span className={'num ' + dir(h.changePct)} style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 16 }}>{pct(h.changePct)}</span>
                  </div>
                  <p className="sum" style={{ marginTop: 8 }}>{h.anomalies.map((a) => a.message).join(' ')}</p>
                  <div className="vbar" aria-label={`Volume ${ratio.toFixed(1)} times the 20-session average`}>
                    <i style={{ width: Math.min(100, (ratio / 4) * 100) + '%' }} />
                    <u style={{ left: '25%' }} />
                  </div>
                  <div className="note num" style={{ marginTop: 6 }}>Volume {ratio.toFixed(1)}× the 20-session average (line = 1×)</div>
                </button>
              );
            })}
            {port && !flagged.length && <div className="empty"><b>Quiet close</b>No company crossed your thresholds.</div>}
          </div>
        </section>
      )}
      <CompanyDetailSheet h={pick} onClose={() => setPick(null)} />
    </>
  );
}
