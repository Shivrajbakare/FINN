import Link from 'next/link';

export const metadata = { title: 'Not Found' };

export default function NotFound() {
  return (
    <section style={{ textAlign: 'center', paddingTop: 60 }}>
      <h1 className="h1" style={{ fontSize: 48, marginBottom: 8 }}>404</h1>
      <p className="muted" style={{ fontSize: 16, marginBottom: 24 }}>
        This page doesn't exist. It may have been moved or removed.
      </p>
      <Link className="btn accent" href="/">Back to portfolio</Link>
    </section>
  );
}
