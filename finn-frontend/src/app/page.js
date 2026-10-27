"use client";

import { useState, useEffect } from "react";
import { fetchPortfolio, fetchAlerts } from "@/lib/api";
import BottomNav from "@/components/layout/BottomNav";

/**
 * Portfolio Dashboard — the main push view.
 * Shows portfolio stocks with prices, highlights anomalies.
 *
 * This is the investor's home screen. Design goal: dense, scannable,
 * and immediately useful. Every stock is one tap away from detail.
 */
export default function DashboardPage() {
  const [stocks, setStocks] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [portfolioData, alertsData] = await Promise.all([
          fetchPortfolio(),
          fetchAlerts(),
        ]);
        setStocks(portfolioData);
        setAlerts(alertsData);
      } catch (err) {
        console.error("[Dashboard] Load error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Map alerts by ticker for quick lookup
  const alertsByTicker = {};
  alerts.forEach((a) => {
    if (!alertsByTicker[a.ticker]) alertsByTicker[a.ticker] = [];
    alertsByTicker[a.ticker].push(a);
  });

  // Sort: stocks with alerts first, then by absolute change
  const sortedStocks = [...stocks].sort((a, b) => {
    const aHasAlert = alertsByTicker[a.ticker] ? 1 : 0;
    const bHasAlert = alertsByTicker[b.ticker] ? 1 : 0;
    if (aHasAlert !== bHasAlert) return bHasAlert - aHasAlert;
    return Math.abs(b.change_pct) - Math.abs(a.change_pct);
  });

  const gainers = stocks.filter((s) => s.change_pct > 0).length;
  const losers = stocks.filter((s) => s.change_pct < 0).length;

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div>
          <span className="app-header__logo">FINN</span>
          <span className="app-header__subtitle">Financial Agent</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {!loading && stocks.length > 0 && (
            <div style={{ display: "flex", gap: "8px", fontSize: "11px" }}>
              <span className="text-green">▲ {gainers}</span>
              <span className="text-red">▼ {losers}</span>
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="app-content">
        <div className="section-header">
          <div>
            <h1 className="section-title">Portfolio</h1>
            <p className="section-subtitle">
              {stocks.length} companies · EOD data
            </p>
          </div>
          {alerts.length > 0 && (
            <span className="section-badge">
              {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton skeleton-card" />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="error-state">
            <p>⚠️ {error}</p>
            <p style={{ marginTop: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
              Make sure the backend is running on port 8000
            </p>
          </div>
        )}

        {/* Stock list */}
        {!loading && !error && sortedStocks.length > 0 && (
          <div>
            {sortedStocks.map((stock, i) => (
              <StockCard
                key={stock.ticker}
                stock={stock}
                alerts={alertsByTicker[stock.ticker]}
                index={i}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && stocks.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">📊</div>
            <p className="empty-state__text">
              No portfolio data available.
              <br />
              Check your backend connection.
            </p>
          </div>
        )}
      </main>

      <BottomNav active="portfolio" alertCount={alerts.length} />
    </div>
  );
}

/**
 * Individual stock card in the portfolio list.
 */
function StockCard({ stock, alerts, index }) {
  const isPositive = stock.change_pct >= 0;
  const changeClass = isPositive
    ? "stock-card__change--positive"
    : "stock-card__change--negative";

  const formatPrice = (price) => {
    if (price >= 100000) return `₹${(price / 100000).toFixed(1)}L`;
    if (price >= 1000) return `₹${price.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    return `₹${price.toFixed(2)}`;
  };

  return (
    <div className="card stock-card stagger-item" style={{ animationDelay: `${index * 0.03}s` }}>
      <div className="stock-card__info">
        <div className="stock-card__ticker">
          {stock.ticker.replace(".NS", "")}
        </div>
        <div className="stock-card__name">{stock.name}</div>
        <div className="stock-card__sector">{stock.sector}</div>
      </div>
      <div className="stock-card__price-block">
        <div className="stock-card__price">{formatPrice(stock.current_price)}</div>
        <div className={`stock-card__change ${changeClass}`}>
          {isPositive ? "+" : ""}
          {stock.change_pct.toFixed(2)}%
        </div>
        {stock.volume_ratio >= 2.0 && (
          <div className="stock-card__volume-flag">
            ⚡ {stock.volume_ratio.toFixed(1)}× vol
          </div>
        )}
      </div>
    </div>
  );
}
