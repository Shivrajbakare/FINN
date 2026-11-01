export const inr = (n) => (n == null || isNaN(n) ? '—' : '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pct = (n, d = 2) => (n == null || isNaN(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d) + '%');
export const dir = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'muted');
export const day = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const clock = (s) => {
  const d = new Date(s);
  return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
