'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { dynamicResearch } from '@/lib/api';
import { Icon } from './common/Icons';
import { day } from '@/lib/format';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mapDocTypeToSection = (t = '') => {
  if (t === 'quarterly_financial_results') return 'financials';
  if (t === 'earnings_call_transcript' || t === 'investor_presentation') return 'guidance';
  if (t === 'annual_report') return 'overview';
  if (t === 'corporate_announcement' || t === 'other_verified_disclosure') return 'risks';
  return 'financials';
};

// Mappers wired to real FastAPI backend response shapes
const co = (c) => ({
  id: c.id,
  name: c.company_name ?? c.name,
  symbol: c.nse_symbol || c.bse_code || c.ticker || c.symbol || '',
  exchange: c.exchange ?? 'NSE',
  sector: c.sector ?? '',
  portfolio: c.is_portfolio_company ?? c.is_portfolio ?? c.portfolio ?? false,
});

const dc = (d) => ({
  id: d.id,
  title: d.document_title ?? d.title,
  type: d.document_type ? d.document_type.replaceAll('_', ' ') : (d.doc_type ?? d.category),
  period: d.reporting_period ?? d.period ?? '',
  date: d.publication_date ?? d.retrieved_at ?? d.date,
  source: d.source_domain ?? d.source ?? 'Official Exchange Source',
  url: d.source_url ?? d.url ?? d.pdf_url,
  section: d.section ?? mapDocTypeToSection(d.document_type),
  analyzed: d.extraction_status === 'ready' || d.analyzed,
});

const sn = (s) => {
  const snap = s.snapshot_data ?? s;
  const facts = snap.financial_facts ?? [];
  const sections = snap.sections ?? [];
  const claims = sections.flatMap((sec) => sec.claims ?? []);

  const guidanceClaim = claims.find((c) => c.section === 'guidance' || c.kind === 'management_guidance');
  const perfClaim = claims.find((c) => c.section === 'performance' || c.kind === 'reported_actual');
  const briefingParts = [];
  if (perfClaim) briefingParts.push(perfClaim.text || perfClaim.quote);
  if (guidanceClaim) briefingParts.push(guidanceClaim.text || guidanceClaim.quote);
  const briefing =
    s.briefing ??
    s.summary ??
    (briefingParts.length
      ? briefingParts.join(' ')
      : `FINN extracted and verified primary disclosures for ${snap.company_name || 'the company'}.`);

  const figures = facts.map((f) => ({
    label: `${f.metric.replaceAll('_', ' ')} (${f.period || ''})`,
    value: `${f.currency ? f.currency + ' ' : ''}${f.value} ${f.unit}`,
  }));

  const citations = claims.slice(0, 4).map((c) => ({
    section: c.section === 'performance' ? 'financials' : c.section,
    quote: c.text || c.quote,
    page: c.page,
    url: c.url,
  }));

  const excerpts = claims.map((c) => ({
    section: c.section === 'performance' ? 'financials' : c.section,
    text: c.text || c.quote,
    page: c.page,
    url: c.url,
  }));

  return {
    title: snap.document_title ?? s.title,
    period: snap.reporting_period ?? s.period,
    briefing,
    figures,
    citations,
    url: snap.source_url ?? s.url,
    excerpts,
  };
};

export default function DynamicResearch() {
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [unsupported, setUnsupported] = useState(false);
  const [company, setCompany] = useState(null);
  const [docs, setDocs] = useState(null);
  const [step, setStep] = useState(null);
  const [snap, setSnap] = useState(null);
  const [snapDoc, setSnapDoc] = useState(null);
  const [busy, setBusy] = useState(null);
  const [section, setSection] = useState('financials');
  const [err, setErr] = useState('');
  const timer = useRef();

  const search = useCallback(async (text) => {
    setUnsupported(false);
    if (text.trim().length < 2) return setHits([]);
    try {
      const r = await dynamicResearch('companies?q=' + encodeURIComponent(text));
      if (r.is_unsupported_market || r.unsupported || r.market_notice) {
        setUnsupported(true);
        return setHits([]);
      }
      const list = r.companies ?? r.items ?? (Array.isArray(r) ? r : []);
      setHits(list.map(co));
    } catch {
      setErr('Search failed. Try again.');
    }
  }, []);

  const onType = (v) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => search(v), 250);
  };

  const open = useCallback(async (c) => {
    setCompany(c);
    setHits([]);
    setQ('');
    setSnap(null);
    setSnapDoc(null);
    setErr('');
    setDocs(null);
    try {
      const res = await dynamicResearch(`companies/${c.id}/documents?limit=200`);
      const rawDocs = Array.isArray(res) ? res : (res.items ?? res.documents ?? []);
      setDocs(rawDocs.map(dc));

      // Check verified snapshot history for quick initial view
      const hist = await dynamicResearch(`companies/${c.id}/history`);
      if (Array.isArray(hist) && hist.length > 0) {
        setSnap(sn(hist[0]));
        setSnapDoc(hist[0].document_id);
      }
    } catch {
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    const c = params.get('c');
    const defaultQuery = c || 'Infosys';
    dynamicResearch('companies?q=' + encodeURIComponent(defaultQuery))
      .then((r) => {
        const list = r.companies ?? r.items ?? (Array.isArray(r) ? r : []);
        const l = list.map(co);
        if (l[0]) open(l[0]);
      })
      .catch(() => {});
  }, [params, open]);

  async function runJob(path, onStep) {
    const job = await dynamicResearch(path, { method: 'POST' });
    for (let i = 0; i < 120; i++) {
      const j = await dynamicResearch('jobs/' + job.id);
      onStep?.(j.status);
      if (j.status === 'ready' || j.status === 'completed') return j;
      if (j.status === 'failed') throw new Error(j.message || j.error || 'failed');
      await sleep(1500);
    }
    throw new Error('timeout');
  }

  async function discover() {
    setErr('');
    setStep('queued');
    try {
      await runJob(`companies/${company.id}/discover`, setStep);
      await open(company);
    } catch {
      setErr('Could not find filings right now. Try again in a minute.');
    }
    setStep(null);
  }

  async function analyze(d) {
    setBusy(d.id);
    setErr('');
    try {
      const j = await runJob(`documents/${d.id}/research`);
      const snapId = j.result?.snapshot_id ?? j.snapshot_id ?? j.result_id;
      if (snapId) {
        const snapRes = await dynamicResearch('snapshots/' + snapId);
        setSnap(sn(snapRes));
        setSnapDoc(d.id);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setErr('Analysis did not finish. Open the PDF to read it directly, or try again.');
    }
    setBusy(null);
  }

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
            <button key={n} className="chip" onClick={() => { setQ(n); search(n); }}>
              {n}
            </button>
          ))}
        </div>
      </section>

      {err && <div className="empty"><b>Something went wrong</b>{err}</div>}

      {company && (
        <section>
          <div className="sec-head">
            <div>
              <h2 className="h1" style={{ fontSize: 24 }}>{company.name}</h2>
              <p className="muted" style={{ fontSize: 13.5 }}>
                {company.symbol}, {company.exchange}
                {company.portfolio ? ', in your portfolio' : ''}
                {company.sector ? `, ${company.sector}` : ''}
              </p>
            </div>
            <button className="btn ghost sm" onClick={() => { setCompany(null); setDocs(null); setSnap(null); }}>
              Change
            </button>
          </div>

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
              <b>{STEPS[stepIdx]?.[1]}…</b>
              <div className="track" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={stepIdx + 1}>
                {STEPS.map((s, i) => (
                  <i key={s[0]} className={i <= stepIdx ? 'on' : ''} />
                ))}
              </div>
            </div>
          )}

          {docs && docs.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div className="seg" role="tablist">
                {SECTIONS.map((s) => (
                  <button key={s[0]} role="tab" aria-selected={section === s[0]} onClick={() => setSection(s[0])}>
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
                      <button className="btn sm accent" disabled={busy === d.id} onClick={() => analyze(d)}>
                        <Icon name="spark" size={16} />{busy === d.id ? 'Analysing…' : 'Analyse'}
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
