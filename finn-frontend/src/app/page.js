"use client";

import { useSettings } from "@/lib/use-settings";
import { useScan } from "@/lib/use-scan";
import ScanStatus from "@/components/ScanStatus";
import BottomNav from "@/components/layout/BottomNav";

/**
 * Portfolio Dashboard — the main push view.
 * Shows portfolio stocks with prices, highlights anomalies.
 *
 * This is the investor's home screen. Design goal: dense, scannable,
 * and immediately useful, with explicit coverage and quote dates.
 */
export default function DashboardPage() {
  const settings = useSettings();
  const portfolio = useScan("portfolio", settings);
  const alertScan = useScan("alerts", settings);
  const stocks = portfolio.data?.stocks ?? [];
  const alerts = alertScan.data?.alerts ?? [];
  const { loading, error } = portfolio;

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

  const gainers = stocks.filter((s) => s.status === "ok" && s.change_pct > 0).length;
  const losers = stocks.filter((s) => s.status === "ok" && s.change_pct < 0).length;

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
              Please try again when the market-data service is available.
            </p>
          </div>
        )}

        {!loading && !error && <ScanStatus scan={portfolio.data} />}
        {alertScan.loading && !loading && <p role="status">Evaluating alerts...</p>}
        {alertScan.error && <p role="alert">Alerts unavailable: {alertScan.error}</p>}
        {alertScan.data?.status !== "complete" && <ScanStatus scan={alertScan.data} />}
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
              Coverage details above explain which companies could not be loaded.
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
function StockCard({ stock, alerts = [], index }) {
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
        <div className="section-subtitle">As of {stock.as_of}</div>
        {stock.status !== "ok" && <div className="text-amber" style={{ fontSize: "11px" }}>{stock.status.replaceAll("_", " ")}</div>}
      </div>
      <div className="stock-card__price-block">
        <div className="stock-card__price">{formatPrice(stock.current_price)}</div>
        <div className={`stock-card__change ${changeClass}`}>
          {stock.change_pct === null ? "Change unavailable" : `${isPositive ? "+" : ""}${stock.change_pct.toFixed(2)}%`}
        </div>
        {alerts.some((alert) => alert.alert_type === "volume_spike") && stock.volume_ratio !== null && (
          <div className="stock-card__volume-flag">
            ⚡ {stock.volume_ratio.toFixed(1)}× vol
          </div>
        )}
      </div>
    </div>
  );
}
