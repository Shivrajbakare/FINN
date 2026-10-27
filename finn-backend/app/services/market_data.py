"""
Market data service — wraps yfinance for EOD price/volume data.

Design decisions:
- Fetch 6 months of history to support anomaly detection (need recent avg).
- Cache in-memory (dict) for the prototype; a production system would use
  SQLite or Redis with TTL-based invalidation.
- yfinance is synchronous, so we run it in a thread pool to avoid blocking
  the async FastAPI event loop.

Known limitation: yfinance can be flaky — occasional timeouts or missing data
for smaller tickers. We handle this gracefully with try/except and partial results.
"""

import asyncio
from datetime import datetime, timedelta
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor

import yfinance as yf
from pydantic import BaseModel


# Thread pool for blocking yfinance calls
_executor = ThreadPoolExecutor(max_workers=4)


class EODData(BaseModel):
    """End-of-day data for a single date."""
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    change_pct: float  # Daily % change


class StockSummary(BaseModel):
    """Current summary for a stock — latest price + key stats."""
    ticker: str
    name: str
    sector: str
    current_price: float
    change_pct: float         # Today's % change
    volume: int               # Today's volume
    avg_volume_20d: float     # 20-day average volume
    volume_ratio: float       # Today's volume / 20-day avg
    high_52w: float
    low_52w: float
    market_cap: float | None  # May not be available for all tickers


class PriceAlert(BaseModel):
    """A triggered price/volume alert."""
    ticker: str
    name: str
    alert_type: str      # "volume_spike" or "price_move"
    value: float         # The actual volume ratio or price change %
    threshold: float     # The threshold that was crossed
    message: str         # Human-readable alert message
    date: str


def _fetch_history(ticker: str, period: str = "6mo") -> dict:
    """
    Fetch price history from yfinance. Runs in the calling thread.
    Returns a dict with 'history' (list of EODData) and 'info' (stock info).
    """
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period)

        if hist.empty:
            return {"history": [], "info": {}}

        records = []
        prev_close = None
        for date, row in hist.iterrows():
            close = round(float(row["Close"]), 2)
            change_pct = round(((close - prev_close) / prev_close) * 100, 2) if prev_close else 0.0
            prev_close = close

            records.append(EODData(
                date=date.strftime("%Y-%m-%d"),
                open=round(float(row["Open"]), 2),
                high=round(float(row["High"]), 2),
                low=round(float(row["Low"]), 2),
                close=close,
                volume=int(row["Volume"]),
                change_pct=change_pct,
            ))

        # Get stock info (may be partially available)
        try:
            info = stock.info
        except Exception:
            info = {}

        return {"history": records, "info": info}

    except Exception as e:
        print(f"[market_data] Error fetching {ticker}: {e}")
        return {"history": [], "info": {}}


async def fetch_stock_history(ticker: str, period: str = "6mo") -> dict:
    """Async wrapper — runs yfinance fetch in thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _fetch_history, ticker, period)


async def get_stock_summary(ticker: str, name: str, sector: str) -> StockSummary | None:
    """
    Get a summary for a single stock: latest price, volume, anomaly detection stats.
    Returns None if data is unavailable.
    """
    data = await fetch_stock_history(ticker, period="6mo")
    history = data["history"]
    info = data.get("info", {})

    if not history or len(history) < 2:
        return None

    latest = history[-1]

    # Calculate 20-day average volume
    recent = history[-20:] if len(history) >= 20 else history
    avg_vol = sum(r.volume for r in recent) / len(recent) if recent else 1
    vol_ratio = round(latest.volume / avg_vol, 2) if avg_vol > 0 else 0.0

    # 52-week high/low
    high_52w = max(r.high for r in history)
    low_52w = min(r.low for r in history)

    return StockSummary(
        ticker=ticker,
        name=name,
        sector=sector,
        current_price=latest.close,
        change_pct=latest.change_pct,
        volume=latest.volume,
        avg_volume_20d=round(avg_vol, 0),
        volume_ratio=vol_ratio,
        high_52w=high_52w,
        low_52w=low_52w,
        market_cap=info.get("marketCap"),
    )


async def detect_alerts(
    ticker: str,
    name: str,
    history: list[EODData],
    volume_threshold: float = 2.0,
    price_threshold: float = 3.0,
) -> list[PriceAlert]:
    """
    Check the latest EOD data for anomalies:
    - Volume > volume_threshold × 20-day avg
    - Price change > ±price_threshold %

    These thresholds are configurable per the ENAM brief.
    """
    alerts = []
    if not history or len(history) < 5:
        return alerts

    latest = history[-1]

    # Volume anomaly
    recent = history[-21:-1] if len(history) > 20 else history[:-1]
    avg_vol = sum(r.volume for r in recent) / len(recent) if recent else 1
    vol_ratio = latest.volume / avg_vol if avg_vol > 0 else 0

    if vol_ratio >= volume_threshold:
        alerts.append(PriceAlert(
            ticker=ticker,
            name=name,
            alert_type="volume_spike",
            value=round(vol_ratio, 2),
            threshold=volume_threshold,
            message=f"Volume is {vol_ratio:.1f}× the 20-day average ({latest.volume:,} vs avg {avg_vol:,.0f})",
            date=latest.date,
        ))

    # Price anomaly
    if abs(latest.change_pct) >= price_threshold:
        direction = "up" if latest.change_pct > 0 else "down"
        alerts.append(PriceAlert(
            ticker=ticker,
            name=name,
            alert_type="price_move",
            value=latest.change_pct,
            threshold=price_threshold,
            message=f"Price moved {direction} {abs(latest.change_pct):.1f}% in a single day (₹{latest.close:,.2f})",
            date=latest.date,
        ))

    return alerts
