'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '../common/Icons';
import { applyTheme, currentTheme } from '@/lib/prefs';

const CTX = { '/': 'Portfolio', '/alerts': 'Alerts', '/research': 'Research', '/settings': 'Settings' };

// NSE/BSE holidays 2026-2027 (gazetted). Update annually.
const HOLIDAYS = new Set([
  '2026-01-26','2026-03-14','2026-03-31','2026-04-01','2026-04-14','2026-04-18',
  '2026-05-01','2026-07-07','2026-08-15','2026-08-28','2026-10-02','2026-10-20',
  '2026-10-21','2026-10-23','2026-11-04','2026-11-05','2026-12-25',
  '2027-01-26','2027-03-04','2027-03-14','2027-03-31','2027-04-14','2027-04-18',
  '2027-05-01','2027-08-15','2027-08-19','2027-10-02','2027-10-26','2027-11-05',
  '2027-11-24','2027-12-25',
]);

function getISTDate() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function marketStatus() {
  const ist = getISTDate();
  const m = ist.getHours() * 60 + ist.getMinutes();
  const yyyy = ist.getFullYear();
  const mm = String(ist.getMonth() + 1).padStart(2, '0');
  const dd = String(ist.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const isWeekend = ist.getDay() === 0 || ist.getDay() === 6;
  const isHoliday = HOLIDAYS.has(dateStr);
  const isOpen = !isWeekend && !isHoliday && m >= 555 && m <= 930;
  return { isOpen, ist };
}

function formatDataTimestamp(ist) {
  if (!ist) return 'Data as of end-of-day close (IST)';
  const formatted = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata',
  }).format(ist);
  return `Data as of ${formatted} IST`;
}

export default function TopBar() {
  const path = usePathname();
  const [status, setStatus] = useState({ isOpen: false, ist: null });
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setStatus(marketStatus());
    const t = currentTheme();
    setDark(t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
    // Re-check market status every minute
    const interval = setInterval(() => setStatus(marketStatus()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const flip = () => { applyTheme(dark ? 'light' : 'dark'); setDark(!dark); };

  return (
    <header className="topbar">
      <span className="brand">finn<i>.</i></span>
      <span className="ctx">{CTX[path] ?? ''}</span>
      <span className={'session' + (status.isOpen ? ' open' : '')} title={formatDataTimestamp(status.ist)}>
        <b />{status.isOpen ? 'Market open' : 'Closed, EOD data'}
      </span>
      <button className="iconbtn" onClick={flip} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
        <Icon name={dark ? 'sun' : 'moon'} size={20} />
      </button>
    </header>
  );
}
