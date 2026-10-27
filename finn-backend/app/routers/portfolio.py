"""
Portfolio router — serves portfolio data and stock summaries.

Endpoints:
  GET /api/portfolio           — list all portfolio companies with latest prices
  GET /api/portfolio/{ticker}  — detailed history for a single stock
  GET /api/alerts              — check for price/volume anomalies across portfolio
"""

import asyncio
from fastapi import APIRouter, Query

from app.config.portfolio import (
    PORTFOLIO, RESEARCH_COMPANIES, ALL_COMPANIES,
    get_company, get_portfolio_tickers,
)
from app.services.market_data import (
    get_stock_summary, fetch_stock_history, detect_alerts,
    StockSummary, PriceAlert,
)

router = APIRouter(tags=["portfolio"])


@router.get("/portfolio", response_model=list[StockSummary])
async def list_portfolio():
    """
    Get all portfolio companies with their latest price, volume, and stats.
    Fetches in parallel for speed — typically completes in 3-5 seconds.
    """
    tasks = [
        get_stock_summary(c.ticker, c.name, c.sector)
        for c in PORTFOLIO
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out failures — return partial results rather than failing entirely
    summaries = []
    for r in results:
        if isinstance(r, StockSummary):
            summaries.append(r)
        elif isinstance(r, Exception):
            print(f"[portfolio] Error: {r}")

    return summaries


@router.get("/portfolio/{ticker}")
async def get_stock_detail(ticker: str):
    """
    Get detailed price history for a single stock.
    Used for the detailed stock view / chart.
    """
    # Normalize ticker — accept "RELIANCE" or "RELIANCE.NS"
    if "." not in ticker:
        ticker = f"{ticker}.NS"

    company = get_company(ticker)
    data = await fetch_stock_history(ticker, period="6mo")

    return {
        "ticker": ticker,
        "name": company.name if company else ticker.split(".")[0],
        "sector": company.sector if company else "Unknown",
        "history": data["history"],
        "info": data.get("info", {}),
    }


@router.get("/alerts", response_model=list[PriceAlert])
async def check_alerts(
    volume_threshold: float = Query(2.0, description="Alert when volume exceeds this multiple of 20-day avg"),
    price_threshold: float = Query(3.0, description="Alert when daily price change exceeds this %"),
):
    """
    Scan all portfolio stocks for price/volume anomalies.
    Thresholds are configurable per the ENAM brief requirement.
    """
    all_alerts: list[PriceAlert] = []

    async def check_one(company):
        data = await fetch_stock_history(company.ticker, period="6mo")
        history = data["history"]
        return await detect_alerts(
            company.ticker, company.name, history,
            volume_threshold=volume_threshold,
            price_threshold=price_threshold,
        )

    tasks = [check_one(c) for c in PORTFOLIO]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, list):
            all_alerts.extend(r)

    return all_alerts


@router.get("/companies")
async def list_all_companies():
    """List all known companies (portfolio + research) — used for search/autocomplete."""
    return [c.model_dump() for c in ALL_COMPANIES]
