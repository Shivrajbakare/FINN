'use client';
import { useEffect, useState } from 'react';
import { DEFAULTS, loadPrefs, savePrefs, applyTheme, currentTheme } from '@/lib/prefs';
import { Icon } from '@/components/common/Icons';

export default function Settings() {
  const [p, setP] = useState(DEFAULTS);
  const [theme, setTheme] = useState('system');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setP(loadPrefs());
    setTheme(currentTheme());
  }, []);

  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));

  const save = () => {
    savePrefs(p);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
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
        <div className="seg" role="tablist" aria-label="Theme">
          {[
            ['light', 'Light', 'sun'],
            ['dark', 'Dark', 'moon'],
            ['system', 'System', null],
          ].map(([k, l, i]) => (
            <button key={k} role="tab" aria-selected={theme === k} onClick={() => pickTheme(k)}>
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
            <label className="t" htmlFor="vol">Volume</label>
            <span className="tag flag num">{p.volume}× average</span>
          </div>
          <p className="note">Flag a stock when daily volume reaches {p.volume}× its 20-day trailing average.</p>
          <input
            id="vol"
            type="range"
            min="1.5"
            max="5"
            step="0.5"
            value={p.volume}
            onChange={(e) => set('volume', +e.target.value)}
          />
        </div>
        <div className="set">
          <div className="set-top">
            <label className="t" htmlFor="px">Price move</label>
            <span className="tag num">±{p.price}%</span>
          </div>
          <p className="note">Alert when a portfolio stock moves at least {p.price}% in either direction in a single session.</p>
          <input
            id="px"
            type="range"
            min="1"
            max="6"
            step="0.5"
            value={p.price}
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
              checked={p.eod}
              onChange={(e) => set('eod', e.target.checked)}
            />
          </div>
          <p className="note">Show the alert badge in the top bar and bottom navigation.</p>
        </div>
      </section>

      <section>
        <h2 className="h2" style={{ marginBottom: 4 }}>Filings feed</h2>
        <p className="note" style={{ marginBottom: 10 }}>Default time window for the proactive portfolio feed.</p>
        <div className="seg" role="tablist" aria-label="Default digest window">
          {[
            ['24h', '24 hours'],
            ['3d', '3 days'],
            ['7d', '7 days'],
          ].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={p.window === k} onClick={() => set('window', k)}>
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

      <button className="btn accent" style={{ width: '100%' }} onClick={save}>
        Save thresholds
      </button>
      {saved && <div className="toast" role="status">Saved</div>}
    </>
  );
}
