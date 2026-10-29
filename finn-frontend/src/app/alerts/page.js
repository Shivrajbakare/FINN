"use client";

import { useState } from "react";
import { useSettings } from "@/lib/use-settings";
import { useScan } from "@/lib/use-scan";
import { DEFAULT_SETTINGS } from "@/lib/settings-store.mjs";
import { emptyAlertsMessage } from "@/lib/scan-status.mjs";
import ScanStatus from "@/components/ScanStatus";
import BottomNav from "@/components/layout/BottomNav";

/**
 * Triggered Alerts Page — Mobile First
 * Shows detected volume anomalies and price threshold crossings across portfolio.
 */
export default function AlertsPage() {
  const savedSettings = useSettings();
  const [volumeOverride, setVolThreshold] = useState(null);
  const volThreshold = volumeOverride ?? savedSettings?.volMultiplier ?? DEFAULT_SETTINGS.volMultiplier;
  const priceThreshold = savedSettings?.priceChangeThreshold ?? DEFAULT_SETTINGS.priceChangeThreshold;
  const scan = useScan("alerts", savedSettings === null ? null : {
    volMultiplier: volThreshold, priceChangeThreshold: priceThreshold,
  });
  const { loading, error } = scan;
  const alerts = scan.data?.alerts ?? [];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="app-header__logo">FINN</span>
          <span className="app-header__subtitle">Market Alerts</span>
        </div>
        <div className="section-badge">
          {loading ? "Scanning..." : error ? "Unavailable" : `${alerts.length} detected`}
        </div>
      </header>

      <main className="app-content">
        <div className="section-header">
          <div>
            <h1 className="section-title">Triggered Alerts</h1>
            <p className="section-subtitle">
              Thresholds: ≥{volThreshold}× vol, ≥{priceThreshold}% absolute price move
            </p>
          </div>
        </div>

        <p className="section-subtitle" style={{ marginBottom: "12px" }}>
          Quick filters apply to this view only. Save defaults in Settings.
        </p>
        {volumeOverride !== null && <button onClick={() => setVolThreshold(null)} style={{ marginBottom: "12px" }}>Use saved thresholds</button>}
        {/* Quick Filter Pill Controls */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", overflowX: "auto" }}>
          <button
            onClick={() => setVolThreshold(1.5)}
            className={`card ${volThreshold === 1.5 ? "card--elevated" : ""}`}
            style={{
              padding: "6px 12px",
              borderRadius: "20px",
              fontSize: "11px",
              border: volThreshold === 1.5 ? "1px solid var(--accent-amber)" : "var(--border-subtle)",
              color: volThreshold === 1.5 ? "var(--accent-amber)" : "var(--text-secondary)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Sensitive (≥1.5×)
          </button>
          <button
            onClick={() => setVolThreshold(2.0)}
            className={`card ${volThreshold === 2.0 ? "card--elevated" : ""}`}
            style={{
              padding: "6px 12px",
              borderRadius: "20px",
              fontSize: "11px",
              border: volThreshold === 2.0 ? "1px solid var(--accent-amber)" : "var(--border-subtle)",
              color: volThreshold === 2.0 ? "var(--accent-amber)" : "var(--text-secondary)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Standard (≥2.0×)
          </button>
          <button
            onClick={() => setVolThreshold(3.0)}
            className={`card ${volThreshold === 3.0 ? "card--elevated" : ""}`}
            style={{
              padding: "6px 12px",
              borderRadius: "20px",
              fontSize: "11px",
              border: volThreshold === 3.0 ? "1px solid var(--accent-amber)" : "var(--border-subtle)",
              color: volThreshold === 3.0 ? "var(--accent-amber)" : "var(--text-secondary)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            High Conviction (≥3.0×)
          </button>
        </div>

        {loading && (
          <div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-card" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="error-state">
            <p>⚠️ {error}</p>
          </div>
        )}

        {!loading && !error && <ScanStatus scan={scan.data} />}
        {!loading && !error && scan.data && alerts.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">🛡️</div>
            <p className="empty-state__text">
              {emptyAlertsMessage(scan.data)}
            </p>
          </div>
        )}

        {!loading && !error && alerts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {alerts.map((alert, idx) => {
              const isVol = alert.alert_type === "volume_spike";
              const isPositive = alert.value > 0;
              return (
                <div
                  key={`${alert.ticker}-${alert.alert_type}-${idx}`}
                  className="card stagger-item"
                  style={{
                    borderLeft: isVol
                      ? "4px solid var(--accent-amber)"
                      : isPositive
                      ? "4px solid var(--accent-green)"
                      : "4px solid var(--accent-red)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: "700", fontSize: "14px" }}>
                          {alert.ticker.replace(".NS", "")}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                          {alert.name}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                        {alert.date}
                      </div>
                    </div>

                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "12px",
                        fontSize: "11px",
                        fontWeight: "600",
                        background: isVol
                          ? "var(--accent-amber-dim)"
                          : isPositive
                          ? "var(--accent-green-dim)"
                          : "var(--accent-red-dim)",
                        color: isVol
                          ? "var(--accent-amber)"
                          : isPositive
                          ? "var(--accent-green)"
                          : "var(--accent-red)",
                      }}
                    >
                      {isVol ? `⚡ ${alert.value}× Vol` : `${isPositive ? "+" : ""}${alert.value.toFixed(1)}%`}
                    </span>
                  </div>

                  <p style={{ fontSize: "12px", marginTop: "8px", lineHeight: "1.4", color: "var(--text-primary)" }}>
                    {alert.message}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav active="alerts" alertCount={alerts.length} />
    </div>
  );
}
