import { Icon } from './common/Icons';
import { dayTime } from '@/lib/format';

export default function ScanStatus({ scan, source, asOf }) {
  return (
    <div>
      <b>Completed EOD scan: {scan.evaluated} of {scan.total} companies evaluated.</b>
      <p className="muted" style={{ fontSize: 13.5 }}>{source}, as of {dayTime(asOf)}</p>
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
