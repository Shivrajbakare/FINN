import Link from 'next/link';
import { Icon } from './common/Icons';

export default function AnnouncementCard({ a }) {
  return (
    <article className={'card' + (a.materiality === 'Material' || a.materiality === 'High' ? ' high' : '')}>
      <div className="card-top">
        <span className="sym">{a.ticker}</span><span>{a.company}</span>{a.sector && <span className="tag">{a.sector}</span>}
      </div>
      <div className="card-top" style={{ marginTop: 6 }}>
        <span>{a.age}, {a.source}</span>
        <span className="tag">{a.category}</span>{a.materiality && <span className="tag flag">{a.materiality}</span>}
      </div>
      <h3>{a.title}</h3>
      {a.summary && <p className="sum">{a.summary}</p>}
      {a.metrics && a.metrics.length > 0 && (
        <div className="figs num">
          {a.metrics.map((m, i) => (
            <div key={i}>
              <span>{m.label}</span>
              <b>{m.value}</b>
              {m.delta && <small className={String(m.delta).trim().startsWith('-') || String(m.delta).startsWith('−') ? 'down' : 'up'}>{m.delta}</small>}
              {m.note && <small className="muted"> {m.note}</small>}
            </div>
          ))}
        </div>
      )}
      {a.exec && (
        <div className="figs" style={{ gridTemplateColumns: '1fr' }}>
          <div>
            <b style={{ fontSize: 16 }}>{a.exec.name}, {a.exec.role}</b>
            <small className="muted">{a.exec.prior}</small>
            {a.exec.quote && <p className="quote">{a.exec.quote}</p>}
            {a.exec.verified && (
              <small className="up" style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
                <Icon name="check" size={14} />LinkedIn and provenance verified
              </small>
            )}
          </div>
        </div>
      )}
      <div className="card-foot">
        <Link className="link" href={`/research?c=${a.ticker}`}>
          Research {a.company || a.ticker}<Icon name="chev" size={15} />
        </Link>
      </div>
    </article>
  );
}
