"""Yahoo daily bars, conservative EOD filtering, and deterministic alerts.

Freshness uses weekdays and a 16:00 IST publication buffer, not an exchange
holiday calendar. Older data is explicitly flagged and excluded from alerts.
"""

import asyncio
from collections import OrderedDict
from datetime import datetime, time, timedelta, timezone
import math
import re
from time import monotonic
from typing import Literal

import httpx
from pydantic import BaseModel, Field

IST = timezone(timedelta(hours=5, minutes=30))
SOURCE = "Yahoo Finance chart API"
FRESHNESS_POLICY = "Completed weekdays at 16:00 IST; exchange holidays are not modeled."
DataStatus = Literal["ok", "partial", "stale", "unavailable", "no_data", "insufficient_history"]


class EODData(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    change_pct: float | None = None


class HistoryResult(BaseModel):
    history: list[EODData] = Field(default_factory=list)
    info: dict = Field(default_factory=dict)
    status: DataStatus = "unavailable"
    issues: list[str] = Field(default_factory=list)
    as_of: str | None = None
    fetched_at: str | None = None
    source: str = SOURCE
    expected_session: str | None = None
    freshness_policy: str = FRESHNESS_POLICY
    incomplete_bars: int = 0


class StockSummary(BaseModel):
    ticker: str
    name: str
    sector: str
    current_price: float
    change_pct: float | None
    volume: int
    avg_volume_20d: float | None
    volume_ratio: float | None
    volume_sample_count: int
    high_52w: float | None = None
    low_52w: float | None = None
    market_cap: float | None = None
    currency: str = "INR"
    as_of: str
    status: DataStatus
    issues: list[str]
    source: str = SOURCE
    fetched_at: str | None = None
    price_history: list[EODData] = Field(default_factory=list)


class PriceAlert(BaseModel):
    ticker: str
    name: str
    alert_type: Literal["volume_spike", "price_move"]
    value: float
    threshold: float
    message: str
    date: str


_MEMORY_CACHE: OrderedDict[tuple[str, str], tuple[float, dict, str]] = OrderedDict()
_INFLIGHT: dict[tuple[str, str], asyncio.Task] = {}
_CACHE_TTL_SECONDS = 300
_CACHE_MAX_ENTRIES = 256
_client: httpx.AsyncClient | None = None
HEADERS = {"User-Agent": "Mozilla/5.0 FINN/0.1", "Accept": "application/json"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_ticker(ticker: str) -> str:
    ticker = ticker.strip().upper()
    if not re.fullmatch(r"[A-Z0-9][A-Z0-9&-]{0,31}(\.(NS|BO))?", ticker):
        raise ValueError("Use an NSE/BSE symbol, optionally ending in .NS or .BO.")
    return ticker if "." in ticker else f"{ticker}.NS"


def expected_session(now: datetime) -> str:
    local = now.astimezone(IST)
    day = local.date()
    if local.time() < time(16):
        day -= timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day.isoformat()


def positive_number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        return None
    return float(value) if math.isfinite(value) and value > 0 else None


def parse_history(payload: dict, now: datetime, fetched_at: str) -> HistoryResult:
    """Reject incomplete bars instead of inventing prices or zero volumes."""
    expected = expected_session(now)
    result = HistoryResult(fetched_at=fetched_at, expected_session=expected)
    chart = payload.get("chart", {})
    if chart.get("error"):
        if chart["error"].get("code") == "Not Found":
            result.status, result.issues = "no_data", ["Provider has no data for this symbol."]
        else:
            result.issues = ["Provider reported an error."]
        return result
    items = chart.get("result")
    if not items:
        result.status, result.issues = "no_data", ["Provider returned no data for this symbol."]
        return result
    item = items[0]
    meta = item.get("meta", {})
    if meta.get("currency") != "INR":
        result.issues = ["Missing or unsupported quote currency; INR is required."]
        return result
    result.info = {
        "currency": "INR",
        "fiftyTwoWeekHigh": positive_number(meta.get("fiftyTwoWeekHigh")),
        "fiftyTwoWeekLow": positive_number(meta.get("fiftyTwoWeekLow")),
    }
    quotes = item.get("indicators", {}).get("quote") or [{}]
    quote = quotes[0]
    records = []
    previous = None
    invalid = False
    last_date = None
    for i, stamp in enumerate(item.get("timestamp") or []):
        day = datetime.fromtimestamp(stamp, IST).date().isoformat()
        # Current/in-progress and future bars must never be presented as EOD.
        if day > expected:
            continue
        values = [quote.get(key, [])[i] if i < len(quote.get(key, [])) else None
                  for key in ("open", "high", "low", "close", "volume")]
        o, h, low, close = [positive_number(v) for v in values[:4]]
        volume = values[4]
        valid_volume = (not isinstance(volume, bool) and isinstance(volume, (int, float))
                        and math.isfinite(volume) and volume >= 0 and int(volume) == volume)
        if (None in (o, h, low, close) or not valid_volume
                or low > min(o, close) or h < max(o, close) or low > h
                or (last_date is not None and day <= last_date)):
            invalid = True
            result.incomplete_bars += 1
            previous = None  # Do not call a multi-session move a daily change.
            continue
        change = (close - previous) / previous * 100 if previous else None
        records.append(EODData(date=day, open=o, high=h, low=low, close=close,
                               volume=int(volume), change_pct=change))
        previous, last_date = close, day
    result.history = records
    result.as_of = records[-1].date if records else None
    if not records:
        result.status = "no_data"
        result.issues = ["No complete end-of-day bars are available."]
        return result
    result.status = "ok"
    if len(records) < 21:
        result.status = "insufficient_history"
        result.issues.append("Need 21 complete bars for a 20-session volume baseline.")
    elif sum(r.volume for r in records[-21:-1]) == 0:
        result.status = "insufficient_history"
        result.issues.append("The 20-session volume baseline is zero; ratio unavailable.")
    if invalid:
        result.status = "partial"
        result.issues.append("Incomplete or invalid provider bars were omitted; alerts skipped.")
    if result.as_of < expected:
        result.status = "stale"
        result.issues.append(f"Latest bar is older than expected session {expected}; holidays may explain this.")
    return result


async def close_market_client():
    global _client
    tasks = list(_INFLIGHT.values())
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    _INFLIGHT.clear()
    if _client is not None:
        await _client.aclose()
        _client = None


async def _request_chart(ticker: str, period: str) -> dict:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10.0, headers=HEADERS,
                                   limits=httpx.Limits(max_connections=8, max_keepalive_connections=8))
    response = await _client.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}",
                                 params={"range": period, "interval": "1d"})
    if response.status_code == 404:
        return {"chart": {"result": None}}
    response.raise_for_status()
    return response.json()


async def _load(key: tuple[str, str]) -> tuple[dict, str]:
    try:
        payload = await _request_chart(*key)
        items = payload.get("chart", {}).get("result") or []
        if items and items[0].get("meta", {}).get("symbol", "").upper() != key[0]:
            raise ValueError("Provider returned another ticker's data")
        fetched_at = utc_now().isoformat()
        parsed = parse_history(payload, utc_now(), fetched_at)
        if parsed.history:
            _MEMORY_CACHE[key] = (monotonic(), payload, fetched_at)
            _MEMORY_CACHE.move_to_end(key)
            while len(_MEMORY_CACHE) > _CACHE_MAX_ENTRIES:
                _MEMORY_CACHE.popitem(last=False)
        return payload, fetched_at
    finally:
        _INFLIGHT.pop(key, None)


async def fetch_stock_history(ticker: str, period: str = "6mo") -> HistoryResult:
    ticker = normalize_ticker(ticker)
    if period not in {"1mo", "3mo", "6mo", "1y"}:
        raise ValueError("Unsupported history range.")
    key = (ticker, period)
    try:
        entry = _MEMORY_CACHE.get(key)
        if entry and monotonic() - entry[0] < _CACHE_TTL_SECONDS:
            _MEMORY_CACHE.move_to_end(key)
            payload, fetched_at = entry[1:]
        else:
            if key not in _INFLIGHT:
                _INFLIGHT[key] = asyncio.create_task(_load(key))
            # One canceled browser request must not cancel other subscribers.
            payload, fetched_at = await asyncio.shield(_INFLIGHT[key])
        # Re-evaluate freshness on cache hits, including the 16:00 boundary.
        return parse_history(payload, utc_now(), fetched_at)
    except (httpx.HTTPError, ValueError, TypeError, KeyError, IndexError, AttributeError, OverflowError, OSError):
        return HistoryResult(issues=["Market-data provider unavailable or response invalid."],
                             expected_session=expected_session(utc_now()))


def summarize_stock(ticker: str, name: str, sector: str, data: HistoryResult) -> StockSummary | None:
    if not data.history:
        return None
    latest = data.history[-1]
    recent = data.history[-21:-1]
    average = sum(r.volume for r in recent) / 20 if len(recent) == 20 and data.incomplete_bars == 0 else None
    ratio = latest.volume / average if average and average > 0 else None
    return StockSummary(
        ticker=ticker, name=name, sector=sector, current_price=latest.close,
        change_pct=latest.change_pct, volume=latest.volume,
        avg_volume_20d=average, volume_ratio=round(ratio, 2) if ratio is not None else None,
        volume_sample_count=len(recent), high_52w=data.info.get("fiftyTwoWeekHigh"),
        low_52w=data.info.get("fiftyTwoWeekLow"), as_of=latest.date,
        status=data.status, issues=data.issues,
        fetched_at=data.fetched_at, price_history=data.history,
    )


async def get_stock_summary(ticker: str, name: str, sector: str) -> StockSummary | None:
    return summarize_stock(ticker, name, sector, await fetch_stock_history(ticker))


async def detect_alerts(ticker: str, name: str, history: list[EODData],
                        volume_threshold: float = 2.0, price_threshold: float = 3.0) -> list[PriceAlert]:
    if not (math.isfinite(volume_threshold) and 0 < volume_threshold <= 100
            and math.isfinite(price_threshold) and 0 < price_threshold <= 1000):
        raise ValueError("Thresholds must be finite and positive within supported limits.")
    if len(history) < 21:
        return []
    latest = history[-1]
    average = sum(r.volume for r in history[-21:-1]) / 20
    alerts = []
    if average > 0 and latest.volume / average >= volume_threshold:
        ratio = latest.volume / average
        alerts.append(PriceAlert(ticker=ticker, name=name, alert_type="volume_spike",
                                value=round(ratio, 2), threshold=volume_threshold,
                                message=f"Volume is {ratio:.1f}x the prior 20-session average.", date=latest.date))
    if latest.change_pct is not None and abs(latest.change_pct) >= price_threshold:
        alerts.append(PriceAlert(ticker=ticker, name=name, alert_type="price_move",
                                value=round(latest.change_pct, 2), threshold=price_threshold,
                                message=f"Close moved {latest.change_pct:+.2f}% to INR {latest.close:,.2f}.", date=latest.date))
    return alerts
