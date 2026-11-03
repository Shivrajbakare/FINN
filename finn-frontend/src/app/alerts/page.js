'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { fetchAnnouncements, fetchPortfolio } from '@/lib/api';
import { adaptAnnouncements, adaptPortfolio } from '@/lib/adapt';
import { loadPrefs } from '@/lib/prefs';
import { pct, dir } from '@/lib/format';
import AnnouncementCard from '@/components/AnnouncementCard';
import CompanyDetailSheet from '@/components/CompanyDetailSheet';
import { AlertDigestSkeleton, AlertAnomaliesSkeleton } from '@/components/common/Skeleton';

const WINDOWS = [['24h', 'Past 24 hours'], ['3d', 'Past 3 days'], ['7d', 'Past 7 days']];

export default function Alerts() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState('digest');
  const [win, setWin] = useState(searchParams.get('window') || '24h');
  const [collapse, setCollapse] = useState(true);
  const [cat, setCat] = useState('All');
  const [feed, setFeed] = useState(null);
  const [port, setPort] = useState(null);
  const [pick, setPick] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const p = loadPrefs();
    if (!searchParams.get('window')) setWin(p.window || '24h');
    setCollapse(p.collapse ?? true);
  }, [searchParams]);

  // Persist window filter in URL
  const updateWindow = useCallback((w) => {
    setWin(w);
    const params = new URLSearchParams(searchParams.toString());
    params.set('window', w);
    router.replace(`/alerts?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    const controller = new AbortController();
    setFeed(null); setErr('');
    fetchAnnouncements({ window: win, hideRoutine: collapse, signal: controller.signal })
      .then((r) => setFeed(adaptAnnouncements(r)))
      .catch((e) => { if (!controller.signal.aborted) setErr('Could not load filings. Try again in a moment.'); });
    return () => controller.abort();
  }, [win, collapse]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPortfolio({ signal: controller.signal }).then((r) => setPort(adaptPortfolio(r))).catch(() => {});
    return () => controller.abort();
  }, []);

  const cats = useMemo(() => ['All', ...new Set((feed?.items ?? []).map((i) => i.category))], [feed]);
  const items = (feed?.items ?? []).filter((i) => cat === 'All' || i.category === cat);
  const flagged = port?.flagged ?? [];

  // Count per category
  const catCounts = useMemo(() => {
    const counts = {};
    for (const item of (feed?.items ?? [])) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    counts['All'] = feed?.items?.length ?? 0;
    return counts;
  }, [feed]);

  return (
    <>
      <div className="seg" role="tablist" aria-label="Alert type">
        <button role="tab" aria-selected={tab === 'digest'} onClick={() => setTab('digest')}>Filings{feed ? ` (${feed.items.length})` : ''}</button>
        <button role="tab" aria-selected={tab === 'anomalies'} onClick={() => setTab('anomalies')}>Market moves{port ? ` (${flagged.length})` : ''}</button>
      </div>

      {tab === 'digest' ? (
        <section aria-live="polite">
          <h1 className="h1" style={{ fontSize: 26 }}>{feed ? `${items.length} filings` : 'Filings'} across your portfolio</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Corporate filings, most material first.
            {feed?.hidden > 0 && ` ${feed.hidden} routine filings hidden.`}
          </p>
          <div className="chips" style={{ marginTop: 16 }} role="group" aria-label="Time window">
            {WINDOWS.map(([k, l]) => <button key={k} className="chip" aria-pressed={win === k} onClick={() => updateWindow(k)}>{l}</button>)}
          </div>
          <div className="chips" style={{ marginTop: 8 }} role="group" aria-label="Category filter">
            {cats.map((c) => (
              <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
                {c === 'All' ? 'All filings' : c}{catCounts[c] > 0 ? ` (${catCounts[c]})` : ''}
              </button>
            ))}
          </div>
          <label className="check" style={{ margin: '16px 0 18px' }}>
            <input type="checkbox" checked={collapse} onChange={(e) => setCollapse(e.target.checked)} />
            Collapse routine paperwork (ESOP allotments, demat compliance certificates)
          </label>
          {err && <div className="empty"><b>Filings unavailable</b>{err}</div>}
          {!feed && !err && <AlertDigestSkeleton />}
          {feed && !items.length && (
            <div className="empty">
              <b>No filings in this window</b>
              {win === '24h'
                ? 'No filings in the past 24 hours. Try "Past 3 days" or "Past 7 days" for a wider view.'
                : 'Try a different time window or category.'}
            </div>
          )}
          {items.map((a) => <AnnouncementCard key={a.id} a={a} />)}
        </section>
      ) : (
        <section aria-live="polite">
          <h1 className="h1" style={{ fontSize: 26 }}>{flagged.length} unusual moves</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Price or volume past your thresholds in the last close.{' '}
            <a href="/settings" className="link" style={{ fontSize: 'inherit' }}>Change thresholds</a>
          </p>
          {!port && !err && <AlertAnomaliesSkeleton />}
          {port && (
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
              {!flagged.length && (
                <div className="empty">
                  <b>Quiet close</b>
                  No company crossed your thresholds. Adjust in <a href="/settings" className="link">Settings</a>.
                </div>
              )}
            </div>
          )}
        </section>
      )}
      <CompanyDetailSheet h={pick} onClose={() => setPick(null)} />
    </>
  );
}
