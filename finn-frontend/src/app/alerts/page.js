"use client";

import { useState, useEffect } from "react";
import { fetchAlerts } from "@/lib/api";
import BottomNav from "@/components/layout/BottomNav";

/**
 * Triggered Alerts Page — Mobile First
 * Shows detected volume anomalies and price threshold crossings across portfolio.
 */
export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [volThreshold, setVolThreshold] = useState(2.0);
  const [priceThreshold, setPriceThreshold] = useState(3.0);

  // Load configured thresholds from localStorage if available
  useEffect(() => {
    const saved = localStorage.getItem("finn_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.volMultiplier) setVolThreshold(parsed.volMultiplier);
        if (parsed.priceChangeThreshold) setPriceThreshold(parsed.priceChangeThreshold);
      } catch (e) {
        console.warn("Could not parse saved settings", e);
      }
    }
  }, []);

  // Fetch alerts whenever thresholds change
  useEffect(() => {
    async function loadAlerts() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchAlerts(volThreshold, priceThreshold);
        setAlerts(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadAlerts();
  }, [volThreshold, priceThreshold]);

  const volumeAlerts = alerts.filter((a) => a.alert_type === "volume_spike");
  const priceAlerts = alerts.filter((a) => a.alert_type === "price_move");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <span className="app-header__logo">FINN</span>
          <span className="app-header__subtitle">Market Alerts</span>
        </div>
        <div className="section-badge">
          {alerts.length} Triggered
        </div>
      </header>

      <main className="app-content">
        <div className="section-header">
          <div>
            <h1 className="section-title">Triggered Alerts</h1>
            <p className="section-subtitle">
              Thresholds: &gt;{volThreshold}× vol, &gt;±{priceThreshold}% price
            </p>
          </div>
        </div>

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
            Sensitive (&gt;1.5×)
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
            Standard (&gt;2.0×)
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
            High Conviction (&gt;3.0×)
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

        {!loading && !error && alerts.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">🛡️</div>
            <p className="empty-state__text">
              No unusual moves detected across your 18 portfolio stocks today at current thresholds.
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
