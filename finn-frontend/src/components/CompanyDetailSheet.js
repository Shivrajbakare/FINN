'use client';
import Link from 'next/link';
import Sheet from './Sheet';
import Sparkline from './Sparkline';
import { Icon } from './common/Icons';
import { inr, pct, dir, day } from '@/lib/format';

export default function CompanyDetailSheet({ h, onClose }) {
  return (
    <Sheet open={!!h} onClose={onClose} label={h ? h.name : ''}>
      {h && (
        <>
          <div className="sheet-head">
            <div>
              <div className="h2">{h.symbol} <span className="tag" style={{ verticalAlign: 'middle' }}>{h.sector}</span></div>
              <div className="muted" style={{ fontSize: 13.5 }}>{h.name}</div>
            </div>
            <button className="iconbtn" onClick={onClose} aria-label="Close"><Icon name="close" size={20} /></button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18 }}>
            <div>
              <div className="asof">Latest close, {day(h.asOf)}</div>
              <div className="bigpx num">{inr(h.close)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={'num ' + dir(h.changePct)} style={{ fontWeight: 700, fontSize: 17 }}>{pct(h.changePct)}</div>
              <Sparkline data={h.spark} w={84} h={30} />
            </div>
          </div>
          <dl className="dl num">
            <div><dt>20-day average volume</dt><dd>{h.avgVol || '—'}</dd></div>
            <div><dt>Volume vs average</dt><dd>{h.volRatio != null ? h.volRatio.toFixed(2) + '×' : '—'}</dd></div>
            <div><dt>Data status</dt><dd>{h.status}</dd></div>
          </dl>
          {h.anomalies.map((a, i) => (
            <div className="callout" key={i}><b>{a.kind === 'volume' ? 'Unusual volume' : 'Price moved past your threshold'}</b>{a.message}</div>
          ))}
          <div style={{ marginTop: 20 }}>
            {h.researchAvailable
              ? <Link className="btn accent" href={`/research?c=${h.symbol}`} onClick={onClose}><Icon name="loupe" size={18} />Open research for {h.symbol}</Link>
              : <p className="note">Verified research is not currently available for {h.symbol}.</p>}
          </div>
        </>
      )}
    </Sheet>
  );
}
