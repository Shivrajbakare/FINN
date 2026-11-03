'use client';

export default function Error({ error, reset }) {
  return (
    <section style={{ textAlign: 'center', paddingTop: 60 }}>
      <h1 className="h1" style={{ fontSize: 26, marginBottom: 8 }}>Something went wrong</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 24 }}>
        {error?.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <button className="btn accent" onClick={reset}>Try again</button>
    </section>
  );
}
