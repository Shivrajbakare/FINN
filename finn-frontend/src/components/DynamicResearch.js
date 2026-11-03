'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { dynamicResearch } from '@/lib/api';
import { Icon } from './common/Icons';
import { day, inr } from '@/lib/format';
import { ResearchDocsSkeleton, ResearchDossierSkeleton, Skeleton } from './common/Skeleton';
import {
  mapCompany,
  getResearchSnapshot,
  subscribeResearch,
  updateResearch,
  clearResearchCompany,
  openCompanyInCache,
  startDiscoveryJob,
  analyzeDocInCache,
  getSavedCompany,
} from '@/lib/research-cache';

const QUICK = ['Infosys', 'Reliance', 'TCS', 'M&M', 'L&T', 'ITC', 'SBI', 'HUL'];
const STEPS = [
  ['queued', 'Waiting in line'],
  ['searching_sources', 'Looking through exchange filings'],
  ['downloading', 'Downloading PDFs'],
  ['extracting', 'Reading pages'],
  ['ready', 'Ready'],
];
const SECTIONS = [
  ['financials', 'Financials', 'Reported earnings, revenue, EBITDA margins, cash flow and YoY/QoQ growth.', 'Quarterly results and annual financial statements'],
  ['guidance', 'Guidance', 'Forward growth targets, margin expectations, capex plans and call Q&A.', 'Earnings call transcripts and investor presentations'],
  ['overview', 'Overview', 'Business model, operating segments, geographic footprint and strategy.', 'Annual reports and strategy presentations'],
  ['risks', 'Risks', 'Operational headwinds, regulatory actions, tax orders and audit observations.', 'Corporate announcements and LODR disclosures'],
];

export default function DynamicResearch() {
  const params = useSearchParams();
  const [store, setStore] = useState(getResearchSnapshot);
  const timer = useRef();

  useEffect(() => {
    return subscribeResearch((next) => setStore({ ...next }));
  }, []);

  const search = useCallback(async (text) => {
    updateResearch({ unsupported: false, err: '' });
    if (text.trim().length < 2) return updateResearch({ hits: [] });
    try {
      const r = await dynamicResearch('companies?q=' + encodeURIComponent(text));
      if (r.is_unsupported_market || r.unsupported || r.market_notice) {
        updateResearch({ unsupported: true, hits: [] });
        return;
      }
      const list = r.companies ?? r.items ?? (Array.isArray(r) ? r : []);
      updateResearch({ hits: list.map(mapCompany), unsupported: false, err: '' });
    } catch (e) {
      updateResearch({ err: e.message || 'Search failed. Try again.' });
    }
  }, []);

  const onType = (v) => {
    updateResearch({ q: v });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 250);
  };

  const open = useCallback(async (c) => {
    await openCompanyInCache(c);
  }, []);

  useEffect(() => {
    const c = params.get('c');
    const snapshot = getResearchSnapshot();

    if (c) {
      if (!snapshot.company || snapshot.company.symbol.toUpperCase() !== c.toUpperCase()) {
        dynamicResearch('companies?q=' + encodeURIComponent(c))
          .then((r) => {
            const list = r.companies ?? r.items ?? (Array.isArray(r) ? r : []);
            const l = list.map(mapCompany);
            if (l[0]) openCompanyInCache(l[0]);
          })
          .catch(() => {});
      }
      return;
    }

    // Returning to Research page without a query param:
    // Check if we already have a researched company in memory or session storage
    if (snapshot.company) {
      return; // Keep existing company state intact!
    }

    const saved = getSavedCompany();
    if (saved) {
      openCompanyInCache(saved);
      return;
    }

    // Initial default fallback
    dynamicResearch('companies?q=' + encodeURIComponent('Infosys'))
      .then((r) => {
        const list = r.companies ?? r.items ?? (Array.isArray(r) ? r : []);
        const l = list.map(mapCompany);
        if (l[0]) openCompanyInCache(l[0]);
      })
      .catch(() => {});
  }, [params]);

  async function discover() {
    if (!store.company) return;
    await startDiscoveryJob(store.company);
  }

  async function analyze(d) {
    await analyzeDocInCache(d);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const {
    company,
    docs,
    snap,
    snapDoc,
    stats,
    statsLoading,
    step,
    busyDocId,
    section,
    q,
    hits,
    unsupported,
    err,
  } = store;

  const sec = SECTIONS.find((s) => s[0] === section) || SECTIONS[0];
  const list = (docs ?? []).filter((d) => d.section === section);
  const stepIdx = STEPS.findIndex((s) => s[0] === step);

  return (
    <>
      <section>
        <h1 className="h1" style={{ fontSize: 26 }}>Research a company</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Search 2,600+ listed Indian equities. Every number links to the page of the exchange PDF it came from.
        </p>
        <input
          className="input"
          style={{ marginTop: 14 }}
          value={q}
          onChange={(e) => onType(e.target.value)}
          placeholder="Search Reliance, TCS, M&M, Infosys, SBI…"
          aria-label="Search companies"
        />
        {hits.length > 0 && (
          <div className="sugg">
            {hits.map((c) => (
              <button key={c.id} onClick={() => open(c)}>
                <span>{c.name}</span>
                <span className="faint">{c.symbol}, {c.exchange}</span>
              </button>
            ))}
          </div>
        )}
        {unsupported && (
          <div className="empty" style={{ marginTop: 10 }}>
            <b>Outside coverage</b>FINN covers Indian equities listed on NSE and BSE. Overseas exchanges are not included.
          </div>
        )}
        <div className="chips" style={{ marginTop: 12 }}>
          {QUICK.map((n) => (
            <button key={n} className="chip" onClick={() => { onType(n); search(n); }}>
              {n}
            </button>
          ))}
        </div>
      </section>

      {err && (
        <div className="empty" style={{ marginTop: 14 }}>
          <b>{err.toLowerCase().includes('rate-limit') ? 'Exchange notice' : 'Notice'}</b>
          {err}
        </div>
      )}

      {company && (
        <section style={{ marginTop: 26 }}>
          <div className="sec-head">
            <div>
              <h2 className="h1" style={{ fontSize: 24 }}>{company.name}</h2>
              <p className="muted" style={{ fontSize: 13.5 }}>
                {company.symbol}, {company.exchange}
                {company.portfolio ? ', in your portfolio' : ''}
                {company.sector ? `, ${company.sector}` : ''}
              </p>
            </div>
            <button className="btn ghost sm" onClick={clearResearchCompany}>
              Change
            </button>
          </div>

          {stats && (
            <div className="figs num" style={{ marginTop: 14 }}>
              <div>
                <span>P/E Ratio</span>
                <b>{stats.pe_ratio != null ? `${stats.pe_ratio}×` : '—'}</b>
                <small className="muted">Valuation</small>
              </div>
              <div>
                <span>Volume</span>
                <b>{stats.volume ? (stats.volume >= 1e7 ? `${(stats.volume / 1e7).toFixed(2)} Cr` : stats.volume >= 1e5 ? `${(stats.volume / 1e5).toFixed(2)} L` : stats.volume.toLocaleString('en-IN')) : '—'}</b>
                <small className="muted">{stats.avg_volume_20d ? `20d avg ${(stats.avg_volume_20d >= 1e7 ? `${(stats.avg_volume_20d / 1e7).toFixed(1)} Cr` : `${(stats.avg_volume_20d / 1e5).toFixed(1)} L`)}` : 'Session volume'}</small>
              </div>
              <div>
                <span>52w High</span>
                <b>{stats.high_52w != null ? inr(stats.high_52w) : '—'}</b>
                <small className="muted">{stats.close && stats.high_52w ? `${(((stats.close - stats.high_52w) / stats.high_52w) * 100).toFixed(1)}%` : '52w High'}</small>
              </div>
              <div>
                <span>52w Low</span>
                <b>{stats.low_52w != null ? inr(stats.low_52w) : '—'}</b>
                <small className="muted">{stats.close && stats.low_52w ? `+${(((stats.close - stats.low_52w) / stats.low_52w) * 100).toFixed(1)}%` : '52w Low'}</small>
              </div>
            </div>
          )}
          {statsLoading && !stats && (
            <div className="figs num" style={{ marginTop: 14 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i}>
                  <Skeleton w={60} h={12} style={{ marginBottom: 4 }} />
                  <Skeleton w={80} h={20} style={{ marginBottom: 4 }} />
                  <Skeleton w={50} h={11} />
                </div>
              ))}
            </div>
          )}

          {snap && (
            <div className="dossier" style={{ marginTop: 14 }}>
              <span className="k">FINN analysis, {snap.period}</span>
              <h2>{snap.title}</h2>
              <p>{snap.briefing}</p>
              {snap.figures.length > 0 && (
                <div className="dfigs num">
                  {snap.figures.map((f, i) => (
                    <div key={i}>
                      <b>{f.value}</b>
                      <span>{f.label}</span>
                    </div>
                  ))}
                </div>
              )}
              {snap.citations.map((c, i) => (
                <a key={i} className="cite" href={c.url || `${snap.url}#page=${c.page}`} target="_blank" rel="noreferrer">
                  <em>{c.section}</em>“{c.quote}” <span>Page {c.page}</span>
                </a>
              ))}
              {snap.url && (
                <a className="btn ghost sm" style={{ marginTop: 12, color: 'var(--on-panel)' }} href={snap.url} target="_blank" rel="noreferrer">
                  <Icon name="page" size={16} />Source PDF
                </a>
              )}
            </div>
          )}

          {docs && docs.length === 0 && step == null && (
            <div className="empty" style={{ marginTop: 14 }}>
              <b>No official filings indexed yet</b>Find them directly from the exchange listings.
              <div style={{ marginTop: 12 }}>
                <button className="btn accent" onClick={discover}>Find official filings</button>
              </div>
            </div>
          )}

          {step && (
            <div style={{ marginTop: 14 }}>
              <b>{STEPS[stepIdx]?.[1] ?? 'Searching exchange filings'}…</b>
              <div className="track" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={stepIdx >= 0 ? stepIdx + 1 : 1}>
                {STEPS.map((s, i) => (
                  <i key={s[0]} className={i <= stepIdx ? 'on' : ''} />
                ))}
              </div>
              <p className="note" style={{ marginTop: 14 }}>Extracting and indexing official filings from exchange disclosures…</p>
              <ResearchDocsSkeleton />
            </div>
          )}

          {docs === null && step == null && (
            <div style={{ marginTop: 14 }}>
              <ResearchDocsSkeleton />
            </div>
          )}

          {docs && docs.length > 0 && !step && (
            <div style={{ marginTop: 22 }}>
              <div className="seg" role="tablist">
                {SECTIONS.map((s) => (
                  <button key={s[0]} role="tab" aria-selected={section === s[0]} onClick={() => updateResearch({ section: s[0] })}>
                    {s[1]}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ marginTop: 12, fontSize: 13.5 }}>{sec[2]}</p>
              {snap?.excerpts.filter((e) => e.section === section).map((e, i) => (
                <div className="excerpt" key={i}>
                  “{e.text}”
                  <div>
                    <a className="link" href={e.url || `${snap.url}#page=${e.page}`} target="_blank" rel="noreferrer">
                      <Icon name="page" size={14} />Read in PDF, page {e.page}
                    </a>
                  </div>
                </div>
              ))}
              {snap && !snap.excerpts.some((e) => e.section === section) && (
                <p className="note" style={{ marginTop: 8 }}>No excerpts from the analysed filing cover this section.</p>
              )}
              <h3 className="h2" style={{ margin: '20px 0 2px', fontSize: 15 }}>
                {sec[3]} ({list.length})
              </h3>
              {list.map((d) => (
                <div key={d.id} className={'doc' + (snapDoc === d.id ? ' on' : '')}>
                  <div className="card-top">
                    <span className="tag">{d.type}</span>
                    {d.period && <span className="tag">{d.period}</span>}
                    <span style={{ marginLeft: 'auto' }}>{day(d.date)}</span>
                  </div>
                  <h4>{d.title}</h4>
                  <div className="src">Source: {d.source}</div>
                  <div className="acts">
                    {snapDoc === d.id ? (
                      <span className="tag" style={{ height: 32, padding: '0 11px' }}>
                        <Icon name="check" size={14} />Analysed above
                      </span>
                    ) : (
                      <button className="btn sm accent" disabled={busyDocId === d.id} onClick={() => analyze(d)}>
                        <Icon name="spark" size={16} />{busyDocId === d.id ? 'Analysing…' : 'Analyse'}
                      </button>
                    )}
                    <a className="btn sm ghost" href={d.url} target="_blank" rel="noreferrer">
                      Open PDF<Icon name="out" size={15} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  );
}
