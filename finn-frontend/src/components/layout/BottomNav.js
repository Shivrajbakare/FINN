'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '../common/Icons';
import { fetchAnnouncements } from '@/lib/api';

const TABS = [
  { href: '/', label: 'Home', icon: 'ledger' },
  { href: '/alerts', label: 'Alerts', icon: 'flag' },
  { href: '/research', label: 'Research', icon: 'loupe' },
  { href: '/settings', label: 'Settings', icon: 'dials' },
];

export default function BottomNav() {
  const path = usePathname();
  const [n, setN] = useState(0);

  // Home page announces the alert count: window.dispatchEvent(new CustomEvent('finn:alerts', { detail: count }))
  useEffect(() => {
    const h = (e) => setN(e.detail || 0);
    window.addEventListener('finn:alerts', h);

    // Initial fetch if user lands directly on non-home page
    fetchAnnouncements()
      .then((r) => {
        const count = r.material_count ?? r.total_in_window ?? (r.announcements?.length ?? 0);
        setN((prev) => (prev > 0 ? prev : count));
      })
      .catch(() => {});

    return () => window.removeEventListener('finn:alerts', h);
  }, []);

  return (
    <nav className="nav" aria-label="Primary">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? 'page' : undefined}>
          <Icon name={t.icon} />
          {t.label}
          {t.href === '/alerts' && n > 0 && <span className="badge">{n > 9 ? '9+' : n}</span>}
        </Link>
      ))}
    </nav>
  );
}
