// ONE place that maps your backend JSON to what the UI reads. If a field name differs, fix it here only.
import { loadPrefs } from './prefs';

const strip = (s = '') => s.replace(/\.(NS|BO)$/, '');

export function adaptPortfolio(r = {}) {
  const list = r.stocks ?? r.holdings ?? r.companies ?? [];
  const prefs = loadPrefs();
  const volThresh = prefs.volume ?? 2.0;
  const pxThresh = prefs.price ?? 1.5;

  const holdings = list.map((h) => {
    const rawHist = h.price_history ?? h.history ?? [];
    const sym = strip(h.ticker ?? h.symbol ?? '');
    const px = h.current_price ?? h.close ?? h.price ?? h.last_close ?? 0;
    const change = h.change_pct ?? h.pct_change ?? h.changePct ?? 0;
    const vr = h.volume_ratio ?? h.volRatio ?? 1.0;

    // Build series: 1M (last ~22 trading days), 3M (last ~66 days), 6M (all ~90 days)
    const series1M = rawHist.slice(-22);
    const series3M = rawHist.slice(-66);
    const series6M = rawHist;
    const series = {
      '1M': series1M.length ? series1M : rawHist,
      '3M': series3M.length ? series3M : rawHist,
      '6M': series6M.length ? series6M : rawHist,
    };

    // Sparkline: last 15-20 points
    const spark = rawHist.slice(-15).map((p) => p.close ?? p.value ?? p);

    // Anomalies
    const anomalies = Array.isArray(h.anomalies) ? [...h.anomalies] : [];
    if (vr >= volThresh) {
      anomalies.push({
        kind: 'volume',
        message: `Volume ${vr.toFixed(1)}× 20-session average.`,
      });
    }
    if (Math.abs(change) >= pxThresh) {
      anomalies.push({
        kind: 'threshold',
        message: `Close moved ${change > 0 ? '+' : ''}${change.toFixed(2)}% in the session.`,
      });
    }

    return {
      id: sym || h.ticker,
      symbol: sym,
      name: h.name ?? h.company_name ?? '',
      sector: h.sector ?? '',
      close: px,
      changePct: change,
      avgVol: h.avg_volume_20d ? Number(h.avg_volume_20d).toLocaleString('en-IN') : (h.avgVolume ?? '—'),
      volRatio: vr,
      status: h.status === 'ok' ? 'Verified EOD' : (h.data_status ?? 'Verified EOD'),
      asOf: h.as_of ?? r.checked_at ?? r.as_of,
      series,
      spark: spark.length ? spark : [px, px],
      anomalies,
      researchAvailable: true,
    };
  });

  const byPct = [...holdings].sort((a, b) => b.changePct - a.changePct);
  return {
    asOf: r.checked_at ?? r.as_of ?? holdings[0]?.asOf,
    lastCheck: r.checked_at ?? r.last_check ?? r.lastCheck,
    source: r.source ?? 'Yahoo Finance chart API',
    holdings,
    gainers: holdings.filter((h) => h.changePct > 0).length,
    decliners: holdings.filter((h) => h.changePct < 0).length,
    top: byPct[0] ?? holdings[0],
    weakest: byPct[byPct.length - 1] ?? holdings[0],
    flagged: holdings.filter((h) => h.anomalies.length > 0),
    alertCount: holdings.reduce((n, h) => n + h.anomalies.length, 0),
    scan: {
      evaluated: r.coverage?.evaluated ?? holdings.length,
      total: r.coverage?.total ?? holdings.length,
      notes: r.freshness_policy ? [r.freshness_policy] : [],
    },
  };
}

export function adaptAnnouncements(r = {}) {
  const items = r.announcements ?? r.items ?? (Array.isArray(r) ? r : []);
  return {
    hidden: r.routine_count ?? r.hidden_routine ?? r.hiddenRoutine ?? 0,
    items: items.map((a, i) => {
      const rs = a.results_summary;
      const eb = a.executive_bio;

      let metrics = a.metrics ?? a.headline_numbers ?? [];
      if (!metrics.length && rs) {
        metrics = [
          {
            label: 'Revenue',
            value: `${rs.revenue?.value?.toLocaleString('en-IN') ?? '—'} ${rs.revenue?.unit ?? 'Cr'}`,
            delta: rs.revenue?.yoy_pct != null ? `${rs.revenue.yoy_pct >= 0 ? '+' : ''}${rs.revenue.yoy_pct.toFixed(1)}% YoY` : null,
          },
          {
            label: 'EBITDA',
            value: `${rs.ebitda?.value?.toLocaleString('en-IN') ?? '—'} ${rs.ebitda?.unit ?? 'Cr'}`,
            delta: rs.ebitda?.margin_pct != null ? `${rs.ebitda.margin_pct.toFixed(1)}% margin` : null,
          },
          {
            label: 'PBT',
            value: `${rs.pbt?.value?.toLocaleString('en-IN') ?? '—'} ${rs.pbt?.unit ?? 'Cr'}`,
            delta: rs.pbt?.qoq_pct != null ? `${rs.pbt.qoq_pct >= 0 ? '+' : ''}${rs.pbt.qoq_pct.toFixed(1)}% QoQ` : null,
          },
          {
            label: 'PAT',
            value: `${rs.pat?.value?.toLocaleString('en-IN') ?? '—'} ${rs.pat?.unit ?? 'Cr'}`,
            delta: rs.pat?.margin_pct != null ? `${rs.pat.margin_pct.toFixed(1)}% margin` : null,
          },
        ];
      }

      let exec = a.executive ?? a.exec ?? null;
      if (!exec && eb) {
        exec = {
          name: eb.name,
          role: eb.role_action,
          prior: eb.previous_role && eb.previous_company ? `Formerly ${eb.previous_role} at ${eb.previous_company}` : (eb.previous_company || ''),
          quote: eb.background_summary,
          verified: eb.linkedin_verified ?? true,
        };
      }

      let cat = a.category ?? 'Other';
      if (cat === 'results') cat = 'Results';
      else if (cat === 'management_change') cat = 'Management';
      else if (cat === 'capex') cat = 'Capex';
      else if (cat === 'dividend') cat = 'Dividends';
      else if (cat === 'credit_rating') cat = 'Credit Rating';
      else if (cat === 'fund_raise') cat = 'Fund Raising';
      else if (cat === 'litigation') cat = 'Litigation';
      else if (cat === 'insider_trading') cat = 'Insider Trading';
      else if (cat === 'pledging') cat = 'Pledging';
      else if (cat === 'earnings_call') cat = 'Earnings Call';
      else if (cat === 'bonus_split') cat = 'Bonus / Split';
      else if (cat === 'unclassified') cat = 'Routine';

      const materiality = a.is_material ? 'Material' : (a.priority === 'high' ? 'High' : a.priority === 'medium' ? 'Attention' : '');
      const age = a.hours_ago != null ? `${a.hours_ago < 1 ? '<1' : a.hours_ago.toFixed(1)}h ago` : (a.age ?? '');
      const src = a.source_exchange ? `${a.source_exchange} Disclosure` : (a.source ?? 'Official NSE Disclosure');

      return {
        id: a.id ?? i,
        ticker: strip(a.ticker ?? a.symbol ?? ''),
        company: a.company_name ?? a.company ?? '',
        sector: a.sector ?? '',
        age,
        source: src,
        category: cat,
        materiality,
        title: a.title ?? a.headline ?? '',
        summary: a.summary ?? '',
        metrics,
        exec,
      };
    }),
  };
}
