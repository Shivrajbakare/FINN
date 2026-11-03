'use client';
import { useEffect, useState, useRef } from 'react';
import { DEFAULTS, loadPrefs, savePrefs, applyTheme, currentTheme } from '@/lib/prefs';
import { Icon } from '@/components/common/Icons';

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function Settings() {
  const [p, setP] = useState(DEFAULTS);
  const [saved, setSaved] = useState(null);
  const [theme, setTheme] = useState('system');
  const [toast, setToast] = useState('');
  const initial = useRef(DEFAULTS);

  useEffect(() => {
    const loaded = loadPrefs();
    setP(loaded);
    setSaved(loaded);
    initial.current = loaded;
    setTheme(currentTheme());
  }, []);

  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const dirty = saved && !deepEqual(p, saved);

  const save = () => {
    savePrefs(p);
    setSaved(p);
    initial.current = p;
    setToast('Settings saved');
    setTimeout(() => setToast(''), 2000);
  };

  const reset = () => {
    setP(DEFAULTS);
    savePrefs(DEFAULTS);
    setSaved(DEFAULTS);
    initial.current = DEFAULTS;
    setToast('Reset to defaults');
    setTimeout(() => setToast(''), 2000);
  };

  const pickTheme = (t) => {
    setTheme(t);
    applyTheme(t);
  };

  return (
    <>
      <h1 className="h1" style={{ fontSize: 26 }}>Settings</h1>
      <section>
        <h2 className="h2" style={{ marginBottom: 10 }}>Appearance</h2>
        <div className="seg" role="radiogroup" aria-label="Theme">
          {[
            ['light', 'Light', 'sun'],
            ['dark', 'Dark', 'moon'],
            ['system', 'System', null],
          ].map(([k, l, i]) => (
            <button key={k} role="radio" aria-checked={theme === k} onClick={() => pickTheme(k)}>
              {i && <Icon name={i} size={16} />}
              {l}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="h2">What counts as unusual</h2>
        <div className="set">
          <div className="set-top">
            <label className="t" htmlFor="vol">Volume threshold</label>
            <span className="tag flag num">{p.volume}× average</span>
          </div>
          <p className="note">Flag a stock when daily volume reaches {p.volume}× its 20-session trailing average.</p>
          <input
            id="vol"
            type="range"
            min="1.5"
            max="5"
            step="0.5"
            value={p.volume}
            aria-label={`Volume threshold: ${p.volume} times average`}
            onChange={(e) => set('volume', +e.target.value)}
          />
        </div>
        <div className="set">
          <div className="set-top">
            <label className="t" htmlFor="px">Price move threshold</label>
            <span className="tag num">±{p.price}%</span>
          </div>
          <p className="note">Alert when a portfolio stock moves at least ±{p.price}% in either direction in a single session.</p>
          <input
            id="px"
            type="range"
            min="1"
            max="6"
            step="0.5"
            value={p.price}
            aria-label={`Price move threshold: plus or minus ${p.price} percent`}
            onChange={(e) => set('price', +e.target.value)}
          />
        </div>
        <div className="set">
          <div className="set-top">
            <label className="t" htmlFor="eod">In-app EOD alerts</label>
            <input
              id="eod"
              className="switch"
              type="checkbox"
              role="switch"
              aria-checked={p.eod}
              checked={p.eod}
              onChange={(e) => set('eod', e.target.checked)}
            />
          </div>
          <p className="note">Show the alert badge in the top bar and bottom navigation.</p>
        </div>
      </section>

      <section>
        <h2 className="h2" style={{ marginBottom: 4 }}>Filings feed</h2>
        <p className="note" style={{ marginBottom: 10 }}>Default time window for the Alerts filings feed.</p>
        <div className="seg" role="radiogroup" aria-label="Default filings time window">
          {[
            ['24h', 'Past 24 hours'],
            ['3d', 'Past 3 days'],
            ['7d', 'Past 7 days'],
          ].map(([k, l]) => (
            <button key={k} role="radio" aria-checked={p.window === k} onClick={() => set('window', k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="check" style={{ marginTop: 16 }}>
          <input
            type="checkbox"
            checked={p.collapse}
            onChange={(e) => set('collapse', e.target.checked)}
          />
          Auto-collapse routine paperwork (ESOP allotments, demat compliance certificates)
        </label>
      </section>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button className="btn accent" style={{ flex: 1 }} onClick={save} disabled={!dirty && !!saved}>
          {dirty ? 'Save changes' : 'Save thresholds'}
        </button>
        <button className="btn ghost" onClick={reset} aria-label="Reset all settings to defaults">
          Reset
        </button>
      </div>
      {dirty && <p className="note" style={{ marginTop: 6, color: 'var(--flag)' }}>You have unsaved changes.</p>}
      {toast && <div className="toast" role="status">{toast}</div>}

      <section style={{ marginTop: 20 }}>
        <p className="note" style={{ fontSize: 11.5, color: 'var(--ink3)' }}>
          FINN is not investment advice. Data sourced from Yahoo Finance and official exchange disclosures (NSE/BSE).
          Settings are stored locally in your browser and do not sync across devices.
        </p>
      </section>
    </>
  );
}
