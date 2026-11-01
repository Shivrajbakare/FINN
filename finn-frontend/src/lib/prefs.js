// Small local preference store. Bridges finn-prefs and finn_settings.
const KEY = 'finn-prefs';
const LEGACY_KEY = 'finn_settings';
export const DEFAULTS = { volume: 2, price: 1.5, eod: true, window: '24h', collapse: true };

export const loadPrefs = () => {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    const leg = localStorage.getItem(LEGACY_KEY);
    if (leg) {
      const p = JSON.parse(leg);
      return {
        volume: p.volMultiplier ?? DEFAULTS.volume,
        price: p.priceChangeThreshold ?? DEFAULTS.price,
        eod: true,
        window: p.digestWindow ?? DEFAULTS.window,
        collapse: p.hideRoutine ?? DEFAULTS.collapse,
      };
    }
    return DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

export const savePrefs = (p) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({
        volMultiplier: p.volume,
        priceChangeThreshold: p.price,
        digestWindow: p.window,
        hideRoutine: p.collapse,
      })
    );
    window.dispatchEvent(new Event('finn-settings-changed'));
  } catch {}
};

export const applyTheme = (mode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  try {
    localStorage.setItem('finn-theme', mode);
    localStorage.setItem('finn_theme', mode);
  } catch {}
};

export const currentTheme = () => {
  if (typeof document === 'undefined') return 'system';
  return (
    document.documentElement.dataset.theme ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('finn-theme') : null) ||
    'system'
  );
};
