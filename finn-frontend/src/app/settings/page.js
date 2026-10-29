"use client";

import { useState } from "react";
import { useSettings } from "@/lib/use-settings";
import { saveSettings, DEFAULT_SETTINGS } from "@/lib/settings-store.mjs";
import BottomNav from "@/components/layout/BottomNav";

/**
 * Settings Page — Configure FINN anomaly thresholds and portfolio preferences.
 * Implements configurable thresholds as specified in the ENAM brief.
 */
export default function SettingsPage() {
  const settings = useSettings();
  const [draft, setDraft] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");
  const { volMultiplier, priceChangeThreshold } = draft ?? settings ?? DEFAULT_SETTINGS;
  const updateDraft = (field, value) => {
    setDraft({ volMultiplier, priceChangeThreshold, [field]: value });
    setSaveMessage("");
  };
  const handleSave = (e) => {
    e.preventDefault();
    if (saveSettings({ volMultiplier, priceChangeThreshold })) {
      setDraft(null);
      setSaveMessage("Settings saved.");
    } else {
      setSaveMessage("Could not save settings. Browser storage is unavailable; your previous defaults still apply.");
    }
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
          <fieldset disabled={settings === null} style={{ border: 0, padding: 0, display: "flex", flexDirection: "column", gap: "16px" }}>
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
              onChange={(e) => updateDraft("volMultiplier", parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent-amber)" }}
            />
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
              Flag stocks when daily volume reaches {volMultiplier}× their 20-day trailing average.
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
              onChange={(e) => updateDraft("priceChangeThreshold", parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent-blue)" }}
            />
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
              Alert when a portfolio stock moves at least {priceChangeThreshold}% in either direction in a single session.
            </p>
          </div>

          <div className="card">
            <p style={{ fontSize: "14px", fontWeight: "600" }}>Digest window - unavailable</p>
            <p className="section-subtitle" style={{ marginTop: "6px" }}>Announcement digests are not implemented yet. There is no active digest-window setting.</p>
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
            Save Thresholds
          </button>
          </fieldset>
          {saveMessage && <p role="status">{saveMessage}</p>}
        </form>
      </main>

      <BottomNav active="settings" />
    </div>
  );
}
