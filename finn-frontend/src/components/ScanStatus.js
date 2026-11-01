import { Icon } from './common/Icons';
import { day } from '@/lib/format';

export default function ScanStatus({ scan, source, asOf }) {
  return (
    <div style={{ borderLeft: '3px solid var(--up)', paddingLeft: 12 }}>
      <b>Completed EOD scan: {scan.evaluated} of {scan.total} companies evaluated.</b>
      <p className="muted" style={{ fontSize: 13.5 }}>{source}, as of {day(asOf)}</p>
      <details style={{ marginTop: 6 }}>
        <summary style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <Icon name="down" size={14} />Coverage and freshness details
        </summary>
        <p className="note" style={{ marginTop: 6 }}>
          {scan.notes?.length ? scan.notes.join(' ') : 'Checks every 5 minutes. Prices update after a completed trading session, not tick by tick.'}
        </p>
      </details>
    </div>
  );
}
