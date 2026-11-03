import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import './globals.css';
import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--f-display', display: 'swap' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--f-body', display: 'swap' });

export const metadata = {
  title: { default: 'FINN — Indian Equity Monitor', template: '%s · FINN' },
  description: 'Track Indian equity portfolios with exchange-filing evidence, market anomalies, and verified corporate disclosures.',
  metadataBase: new URL('https://finn.app'),
  openGraph: {
    type: 'website',
    siteName: 'FINN',
    title: { default: 'FINN — Indian Equity Monitor', template: '%s · FINN' },
    description: 'Track Indian equity portfolios with exchange-filing evidence, market anomalies, and verified corporate disclosures.',
  },
  twitter: { card: 'summary', title: { default: 'FINN — Indian Equity Monitor', template: '%s · FINN' } },
  icons: { icon: '/favicon.ico' },
  other: { 'theme-color': '#FAFBFC' },
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

const themeInit = `try{var t=localStorage.getItem('finn-theme')||'system';document.documentElement.dataset.theme=t;var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.querySelector('meta[name=theme-color]')?.setAttribute('content',d?'#131A28':'#FAFBFC')}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        <div className="shell">
          <TopBar />
          <main id="main" className="page">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
