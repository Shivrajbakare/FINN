"use client";

import { useState } from "react";
import BottomNav from "@/components/layout/BottomNav";

/**
 * Settings Page — Configure FINN anomaly thresholds and portfolio preferences.
 * Implements configurable thresholds as specified in the ENAM brief.
 */
export default function SettingsPage() {
  const [volMultiplier, setVolMultiplier] = useState(2.0);
  const [priceChangeThreshold, setPriceChangeThreshold] = useState(3.0);
  const [windowDays, setWindowDays] = useState(1);
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    // Save to localStorage for client-side persistence
    localStorage.setItem(
      "finn_settings",
      JSON.stringify({
        volMultiplier,
        priceChangeThreshold,
        windowDays,
      })
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="app-header__logo">FINN</span>
          <span className="app-header__subtitle">Settings</span>
        </div>
      </header>

      <main className="app-content">
        <div className="section-header">
          <div>
            <h1 className="section-title">Trigger Thresholds</h1>
            <p className="section-subtitle">Define what qualifies as unusual</p>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Volume Multiplier */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <label htmlFor="vol-multiplier" style={{ fontSize: "14px", fontWeight: "600" }}>
                Volume Anomaly Threshold
              </label>
              <span className="font-mono text-amber font-bold">{volMultiplier}× avg</span>
            </div>
            <input
              id="vol-multiplier"
              type="range"
              min="1.5"
              max="5.0"
              step="0.1"
              value={volMultiplier}
              onChange={(e) => setVolMultiplier(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent-amber)" }}
            />
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
              Flag stocks when daily volume exceeds {volMultiplier}× their 20-day trailing average.
            </p>
          </div>

          {/* Price Change % */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <label htmlFor="price-threshold" style={{ fontSize: "14px", fontWeight: "600" }}>
                Price Move Threshold
              </label>
              <span className="font-mono text-blue font-bold">±{priceChangeThreshold}%</span>
            </div>
            <input
              id="price-threshold"
              type="range"
              min="1.0"
              max="10.0"
              step="0.5"
              value={priceChangeThreshold}
              onChange={(e) => setPriceChangeThreshold(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent-blue)" }}
            />
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
              Alert when a portfolio stock swings more than ±{priceChangeThreshold}% in a single session.
            </p>
          </div>

          {/* Window Digest Default */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
              <label htmlFor="window-days" style={{ fontSize: "14px", fontWeight: "600" }}>
                Default Digest Window
              </label>
              <span className="font-mono text-green font-bold">
                {windowDays === 1 ? "24 hours" : `${windowDays} days`}
              </span>
            </div>
            <select
              id="window-days"
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                border: "var(--border-subtle)",
                fontSize: "13px",
              }}
            >
              <option value="1">Last 24 Hours (Default)</option>
              <option value="3">Last 3 Days</option>
              <option value="7">Last 7 Days (1 Week)</option>
            </select>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
              Default timeframe applied when filtering corporate announcements.
            </p>
          </div>

          <button
            type="submit"
            style={{
              padding: "12px",
              borderRadius: "var(--radius-md)",
              background: "var(--accent-blue)",
              color: "#ffffff",
              fontWeight: "600",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              boxShadow: "0 4px 12px var(--accent-blue-glow)",
            }}
          >
            {saved ? "✓ Settings Saved" : "Save Thresholds"}
          </button>
        </form>
      </main>

      <BottomNav active="settings" />
    </div>
  );
}
