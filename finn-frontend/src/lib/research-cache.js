import { dynamicResearch } from './api';

// Mappers for backend data structures
export const mapCompany = (c) => ({
  id: c.id,
  name: c.company_name ?? c.name,
  symbol: c.nse_symbol || c.bse_code || c.ticker || c.symbol || '',
  exchange: c.exchange ?? 'NSE',
  sector: c.sector ?? '',
  portfolio: c.is_portfolio_company ?? c.is_portfolio ?? c.portfolio ?? false,
});

export const mapDocTypeToSection = (t = '') => {
  if (t === 'quarterly_financial_results') return 'financials';
  if (t === 'earnings_call_transcript' || t === 'investor_presentation') return 'guidance';
  if (t === 'annual_report') return 'overview';
  if (t === 'corporate_announcement' || t === 'other_verified_disclosure') return 'risks';
  return 'financials';
};

export const mapDoc = (d) => ({
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

export const mapSnap = (s) => {
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

const STORAGE_KEY = 'finn_research_company';

const store = {
  company: null,
  docs: null,
  docsLoading: false,
  snap: null,
  snapDoc: null,
  stats: null,
  statsLoading: false,
  section: 'financials',
  step: null,
  busyDocId: null,
  q: '',
  hits: [],
  unsupported: false,
  err: '',
  initialized: false,
};

const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try { fn(store); } catch {}
  }
}

export function subscribeResearch(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getResearchSnapshot() {
  return store;
}

export function updateResearch(patch) {
  Object.assign(store, patch);
  emit();
}

export function clearResearchCompany() {
  store.company = null;
  store.docs = null;
  store.docsLoading = false;
  store.snap = null;
  store.snapDoc = null;
  store.stats = null;
  store.statsLoading = false;
  store.step = null;
  store.busyDocId = null;
  store.q = '';
  store.hits = [];
  store.err = '';
  store.unsupported = false;
  if (typeof window !== 'undefined') {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
  }
  emit();
}

export async function openCompanyInCache(c) {
  store.company = c;
  store.hits = [];
  store.q = '';
  store.snap = null;
  store.snapDoc = null;
  store.stats = null;
  store.statsLoading = true;
  store.err = '';
  store.docs = null;
  store.docsLoading = true;
  store.step = null;
  store.unsupported = false;

  if (typeof window !== 'undefined') {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch {}
  }
  emit();

  const symbol = c.symbol || c.nse_symbol || c.id;

  try {
    const [docsRes, histRes, statsRes] = await Promise.allSettled([
      dynamicResearch(`companies/${c.id}/documents?limit=100`),
      dynamicResearch(`companies/${c.id}/history`),
      dynamicResearch(`companies/${symbol}/stats`),
    ]);

    if (docsRes.status === 'fulfilled') {
      const res = docsRes.value;
      const rawDocs = Array.isArray(res) ? res : (res.items ?? res.documents ?? []);
      store.docs = rawDocs.map(mapDoc);
    } else {
      store.docs = [];
    }
    store.docsLoading = false;

    if (histRes.status === 'fulfilled' && Array.isArray(histRes.value) && histRes.value.length > 0) {
      store.snap = mapSnap(histRes.value[0]);
      store.snapDoc = histRes.value[0].document_id;
    }

    if (statsRes.status === 'fulfilled' && statsRes.value && typeof statsRes.value === 'object') {
      store.stats = statsRes.value;
    }
    store.statsLoading = false;
  } catch {
    store.docs = [];
    store.docsLoading = false;
    store.statsLoading = false;
  }
  emit();
}

let activeDiscovery = null;

export async function startDiscoveryJob(company) {
  if (activeDiscovery) return activeDiscovery;

  store.err = '';
  store.step = 'queued';
  emit();

  activeDiscovery = (async () => {
    try {
      const job = await dynamicResearch(`companies/${company.id}/discover`, { method: 'POST' });
      for (let i = 0; i < 120; i++) {
        const j = await dynamicResearch('jobs/' + job.id);
        store.step = j.status;
        emit();
        if (j.status === 'ready' || j.status === 'completed') {
          store.step = null;
          await openCompanyInCache(company);
          return;
        }
        if (j.status === 'failed') throw new Error(j.message || j.error || 'failed');
        await new Promise((r) => setTimeout(r, 1500));
      }
      throw new Error('timeout');
    } catch {
      store.err = 'Could not find filings right now. Try again in a minute.';
      store.step = null;
      emit();
    } finally {
      activeDiscovery = null;
    }
  })();

  return activeDiscovery;
}

export async function analyzeDocInCache(d) {
  store.busyDocId = d.id;
  store.err = '';
  emit();

  try {
    const job = await dynamicResearch(`documents/${d.id}/research`, { method: 'POST' });
    let readyJob = null;
    for (let i = 0; i < 120; i++) {
      const j = await dynamicResearch('jobs/' + job.id);
      if (j.status === 'ready' || j.status === 'completed') {
        readyJob = j;
        break;
      }
      if (j.status === 'failed') throw new Error(j.message || j.error || 'failed');
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!readyJob) throw new Error('timeout');

    const snapId = readyJob.result?.snapshot_id ?? readyJob.snapshot_id ?? readyJob.result_id;
    if (snapId) {
      const snapRes = await dynamicResearch('snapshots/' + snapId);
      store.snap = mapSnap(snapRes);
      store.snapDoc = d.id;
    }
  } catch {
    store.err = 'Analysis did not finish. Open the PDF to read it directly, or try again.';
  } finally {
    store.busyDocId = null;
    emit();
  }
}

export function getSavedCompany() {
  if (store.company) return store.company;
  if (typeof window !== 'undefined') {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
  }
  return null;
}
