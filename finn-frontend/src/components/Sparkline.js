const vals = (a) => a.map((p) => (typeof p === 'number' ? p : p.close ?? p.value));
export default function Sparkline({ data = [], w = 64, h = 24, trend }) {
  const v = vals(data).filter((n) => n != null);
  if (v.length < 2) return <svg width={w} height={h} />;
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const d = v.map((n, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * w).toFixed(1)} ${(h - 2 - ((n - lo) / r) * (h - 4)).toFixed(1)}`).join('');
  const up = (trend ?? v[v.length - 1] - v[0]) >= 0;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={d} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
