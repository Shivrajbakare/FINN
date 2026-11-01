'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '../common/Icons';
import { applyTheme, currentTheme } from '@/lib/prefs';

const CTX = { '/': 'Portfolio', '/alerts': 'Alerts', '/research': 'Research', '/settings': 'Settings' };

function marketOpen() {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const m = ist.getHours() * 60 + ist.getMinutes();
  return ist.getDay() % 6 !== 0 && m >= 555 && m <= 930;
}

export default function TopBar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setOpen(marketOpen());
    const t = currentTheme();
    setDark(t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches));
  }, []);
  const flip = () => { applyTheme(dark ? 'light' : 'dark'); setDark(!dark); };
  return (
    <header className="topbar">
      <span className="brand">finn<i>.</i></span>
      <span className="ctx">{CTX[path] ?? ''}</span>
      <span className={'session' + (open ? ' open' : '')}><b />{open ? 'Market open' : 'Closed, EOD data'}</span>
      <button className="iconbtn" onClick={flip} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
        <Icon name={dark ? 'sun' : 'moon'} size={20} />
      </button>
    </header>
  );
}
