"use client";

import { useState } from "react";
import { chartPath, closePoints, formatINR } from "@/lib/market-view.mjs";
export { formatINR } from "@/lib/market-view.mjs";

// Quantities are not configured: show a named issuer's actual history.
export default function PortfolioHeroChart({ stocks = [], loading = false }) {
  const [ticker, setTicker] = useState("");
  const [sessions, setSessions] = useState(22);
  const stock = stocks.find((item) => item.ticker === ticker) || stocks[0];
  const points = closePoints(stock).slice(-sessions);
  if (loading || !stock) return <div className="portfolio-hero"><p>{loading ? "Loading closing prices…" : "Price history unavailable"}</p></div>;
  return <section className="portfolio-hero" aria-label="Company closing price history">
    <label htmlFor="chart-company" className="section-subtitle">Company closing price · INR · End-of-day</label>
    <select id="chart-company" value={stock.ticker} onChange={(event) => setTicker(event.target.value)} style={{ width: "100%", marginTop: 8 }}>
      {stocks.map((item) => <option key={item.ticker} value={item.ticker}>{item.name} ({item.ticker})</option>)}
    </select>
    <div className="portfolio-hero__value tabular-nums">{formatINR(stock.current_price)}</div>
    <p className="section-subtitle">As of {stock.as_of} · {stock.status.replaceAll("_", " ")} · {stock.source}</p>
    {points.length > 1 ? <>
      <svg viewBox="0 0 390 110" style={{ width: "100%", height: 110 }} role="img" aria-label={`${stock.name} actual daily closing prices from ${points[0].date} to ${points.at(-1).date}`}>
        <path d={chartPath(points.map((point) => point.close), 390, 110, 8)} fill="none" stroke="var(--accent)" strokeWidth="2" />
      </svg>
      <p className="section-subtitle">{points[0].date} – {points.at(-1).date} · {points.length} completed sessions</p>
    </> : <p>Insufficient price history to draw a chart.</p>}
    <div className="chart-ranges">{[[22, "1M"], [66, "3M"], [132, "6M"]].map(([count, label]) =>
      <button key={count} type="button" className={`pill-button ${sessions === count ? "pill-button--active" : ""}`} aria-pressed={sessions === count} onClick={() => setSessions(count)}>{label}</button>)}</div>
    <p className="section-subtitle">Historical closing prices, not live quotes. Portfolio value requires actual holdings quantities.</p>
  </section>;
}
