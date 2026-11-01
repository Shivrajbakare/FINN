import { Bricolage_Grotesque, Hanken_Grotesk } from 'next/font/google';
import './globals.css';
import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--f-display', display: 'swap' });
const body = Hanken_Grotesk({ subsets: ['latin'], variable: '--f-body', display: 'swap' });

export const metadata = { title: 'FINN', description: 'Indian equity monitor with exchange-filing evidence' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

const themeInit = `try{document.documentElement.dataset.theme=localStorage.getItem('finn-theme')||'system'}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body>
        <div className="shell">
          <TopBar />
          <main className="page">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
