"""Portfolio and alert responses include explicit per-company coverage."""

import asyncio
from typing import Literal
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.config.portfolio import PORTFOLIO, ALL_COMPANIES, get_company
from app.services.market_data import (
    HistoryResult, StockSummary, PriceAlert, DataStatus, SOURCE, FRESHNESS_POLICY,
    fetch_stock_history, summarize_stock, detect_alerts, normalize_ticker, utc_now,
)

router = APIRouter(tags=["portfolio"])


class CompanyCoverage(BaseModel):
    ticker: str
    status: DataStatus
    as_of: str | None
    fetched_at: str | None
    issues: list[str]


class Coverage(BaseModel):
    total: int
    available: int
    evaluated: int
    companies: list[CompanyCoverage]


class ScanResponse(BaseModel):
    status: Literal["complete", "partial", "stale", "unavailable"]
    checked_at: str
    source: str = SOURCE
    freshness_policy: str = FRESHNESS_POLICY
    coverage: Coverage


class PortfolioResponse(ScanResponse):
    stocks: list[StockSummary]


class AlertsResponse(ScanResponse):
    alerts: list[PriceAlert]


async def scan_portfolio():
    results = await asyncio.gather(
        *(fetch_stock_history(c.ticker) for c in PORTFOLIO), return_exceptions=True,
    )
    data = [r if isinstance(r, HistoryResult) else HistoryResult(
        issues=["Market data could not be evaluated."]) for r in results]
    coverage = Coverage(
        total=len(PORTFOLIO), available=sum(bool(r.history) for r in data),
        evaluated=sum(r.status == "ok" for r in data),
        companies=[CompanyCoverage(ticker=c.ticker, status=r.status, as_of=r.as_of,
                                   fetched_at=r.fetched_at, issues=r.issues)
                   for c, r in zip(PORTFOLIO, data)],
    )
    if coverage.evaluated == coverage.total:
        status = "complete"
    elif coverage.available == 0:
        status = "unavailable"
    elif all(r.status == "stale" for r in data):
        status = "stale"
    else:
        status = "partial"
    return data, {"status": status, "coverage": coverage, "checked_at": utc_now().isoformat()}


@router.get("/portfolio", response_model=PortfolioResponse)
async def list_portfolio():
    data, metadata = await scan_portfolio()
    stocks = [summarize_stock(c.ticker, c.name, c.sector, r) for c, r in zip(PORTFOLIO, data)]
    return PortfolioResponse(stocks=[s for s in stocks if s is not None], **metadata)


@router.get("/portfolio/{ticker}")
async def get_stock_detail(ticker: str):
    try:
        ticker = normalize_ticker(ticker)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    company = get_company(ticker)
    data = await fetch_stock_history(ticker)
    if data.status == "unavailable":
        raise HTTPException(status_code=503, detail="Market-data provider unavailable.")
    if data.status == "no_data":
        raise HTTPException(status_code=404, detail="No completed market data for this symbol.")
    return {"ticker": ticker, "name": company.name if company else ticker.split(".")[0],
            "sector": company.sector if company else "Unknown", **data.model_dump()}


@router.get("/alerts", response_model=AlertsResponse)
async def check_alerts(
    volume_threshold: float = Query(2.0, gt=0, le=100, allow_inf_nan=False),
    price_threshold: float = Query(3.0, gt=0, le=1000, allow_inf_nan=False),
):
    data, metadata = await scan_portfolio()
    alerts = []
    for company, result in zip(PORTFOLIO, data):
        # Stale/partial/short history cannot justify an all-clear or an alert.
        if result.status == "ok":
            alerts.extend(await detect_alerts(company.ticker, company.name, result.history,
                                             volume_threshold, price_threshold))
    return AlertsResponse(alerts=alerts, **metadata)


@router.get("/companies")
async def list_all_companies():
    return [c.model_dump() for c in ALL_COMPANIES]
