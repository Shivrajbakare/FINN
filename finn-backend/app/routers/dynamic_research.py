import asyncio
from datetime import date, datetime
from time import monotonic
import re
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
import httpx
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, func
from sqlalchemy.exc import SQLAlchemyError

from app.database import transaction, DatabaseUnavailable
from app.models import Company, Document, Job, Snapshot, now
from app.research_schemas import SnapshotPayload
from app.services.company_registry import search_companies, spelling_suggestions, check_unsupported_market
from app.services.jobs import enqueue, run_one
from app.services.source_http import SourceError
from app.services.market_data import fetch_stock_history

router = APIRouter(prefix="/research/v2", tags=["dynamic research"])

_DOCS_CACHE: dict = {}
_HIST_CACHE: dict = {}
_STATS_CACHE: dict = {}
_SEARCH_CACHE: dict = {}


def db():
    try:
        with transaction() as session:
            yield session
    except (DatabaseUnavailable, SQLAlchemyError):
        raise HTTPException(503, detail={"code": "database_unavailable",
            "message": "Dynamic research database is unavailable. Configure PostgreSQL and run migrations/import."}) from None


class Record(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CompanyView(Record):
    id: str
    company_name: str
    nse_symbol: str | None
    bse_code: str | None
    exchange: str
    sector: str | None
    industry: str | None
    is_portfolio_company: bool
    registry_source: str
    registry_checked_at: datetime | None


class CompanySearch(BaseModel):
    companies: list[CompanyView]
    total: int
    limit: int
    offset: int
    needs_registry_refresh: bool
    suggestions: list[CompanyView] = []
    market_scope: str = "Supported Markets: National Stock Exchange of India (NSE) · Bombay Stock Exchange (BSE). Overseas markets (US, Europe, Asia-Pacific) are not supported."
    is_unsupported_market: bool = False
    unsupported_market_notice: str | None = None


class DocumentView(Record):
    id: str
    company_id: str
    document_type: str
    document_title: str
    reporting_period: str | None
    publication_date: date | None
    source_url: str
    source_domain: str
    discovered_on: str
    sha256: str | None
    file_size: int | None
    extraction_status: str
    verification_status: str
    retrieved_at: datetime | None
    expires_at: datetime | None
    pinned: bool


class JobView(Record):
    id: str
    company_id: str
    document_id: str | None
    kind: str
    status: str
    message: str | None
    error_code: str | None
    result: dict
    created_at: datetime
    updated_at: datetime


class SnapshotView(Record):
    id: str
    company_id: str
    document_id: str
    reporting_period: str | None
    generated_at: datetime
    cache_expires_at: datetime
    status: str
    snapshot_data: SnapshotPayload


def require(session, model, identifier):
    value = session.get(model, identifier)
    if not value:
        raise HTTPException(404, detail={"code": "not_found", "message": "Requested research record was not found."})
    return value


def submit(session, company_id, document_id, kind):
    try:
        job = enqueue(session, company_id, document_id, kind)
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(asyncio.to_thread(run_one))
        except RuntimeError:
            pass
        return job
    except SourceError as exc:
        raise HTTPException(429, detail={"code": exc.code, "message": str(exc)}) from None


@router.get("/companies", response_model=CompanySearch)
def search(q: str = Query("", max_length=120), limit: int = Query(20, ge=1, le=50),
           offset: int = Query(0, ge=0, le=10000), session=Depends(db)):
    key = (q.strip().lower(), limit, offset)
    cached = _SEARCH_CACHE.get(key)
    if cached and monotonic() - cached[0] < 60:
        return cached[1]
    is_overseas, overseas_notice = check_unsupported_market(q)
    rows, total = search_companies(session, q, limit, offset)
    registry = session.scalar(select(Company.id).where(Company.registry_checked_at.is_not(None)).limit(1))
    result = CompanySearch(
        companies=rows,
        total=total,
        limit=limit,
        offset=offset,
        needs_registry_refresh=not registry,
        suggestions=spelling_suggestions(session, q) if not total and not is_overseas else [],
        is_unsupported_market=is_overseas,
        unsupported_market_notice=overseas_notice,
    )
    _SEARCH_CACHE[key] = (monotonic(), result)
    return result


@router.post("/registry-refresh", response_model=JobView, status_code=202)
def registry_refresh(session=Depends(db)):
    company = session.scalar(select(Company).order_by(Company.id).limit(1))
    if not company:
        raise HTTPException(503, detail={"code": "import_required", "message": "Run the portfolio import before refreshing the registry."})
    return submit(session, company.id, None, "registry")


@router.get("/companies/{company_id}", response_model=CompanyView)
def company_detail(company_id: str, session=Depends(db)):
    return require(session, Company, company_id)


@router.get("/companies/{company_id}/documents", response_model=list[DocumentView])
def documents(company_id: str, limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0), session=Depends(db)):
    key = (company_id, limit, offset)
    cached = _DOCS_CACHE.get(key)
    if cached and monotonic() - cached[0] < 120:
        return cached[1]
    require(session, Company, company_id)
    rows = session.scalars(select(Document).where(Document.company_id == company_id)
        .order_by(Document.pinned.desc(), Document.publication_date.desc().nullslast(), Document.document_title)
        .offset(offset).limit(limit)).all()
    _DOCS_CACHE[key] = (monotonic(), rows)
    return rows


@router.post("/companies/{company_id}/discover", response_model=JobView, status_code=202)
def discover(company_id: str, session=Depends(db)):
    require(session, Company, company_id)
    return submit(session, company_id, None, "discover")


@router.get("/documents/{document_id}", response_model=DocumentView)
def document_detail(document_id: str, session=Depends(db)):
    return require(session, Document, document_id)


@router.get("/documents/{document_id}/pdf")
def document_pdf(document_id: str, session=Depends(db)):
    from fastapi.responses import Response, RedirectResponse
    from app.services.artifacts import storage
    doc = require(session, Document, document_id)
    if doc.storage_key:
        try:
            raw = storage().read(doc.storage_key)
            return Response(
                content=raw,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'inline; filename="{doc.id}.pdf"',
                    "Content-Type": "application/pdf",
                    "Cache-Control": "public, max-age=86400",
                },
            )
        except Exception:
            pass
    return RedirectResponse(doc.source_url)



@router.post("/documents/{document_id}/retrieve", response_model=JobView, status_code=202)
def retrieve(document_id: str, session=Depends(db)):
    doc = require(session, Document, document_id)
    return submit(session, doc.company_id, doc.id, "retrieve")


@router.post("/documents/{document_id}/research", response_model=JobView, status_code=202)
def generate(document_id: str, session=Depends(db)):
    doc = require(session, Document, document_id)
    return submit(session, doc.company_id, doc.id, "research")


@router.get("/jobs/{job_id}", response_model=JobView)
def job_status(job_id: str, session=Depends(db)):
    return require(session, Job, job_id)


@router.get("/snapshots/{snapshot_id}", response_model=SnapshotView)
def snapshot(snapshot_id: str, session=Depends(db)):
    record = require(session, Snapshot, snapshot_id)
    response = SnapshotView.model_validate(record)
    if record.cache_expires_at <= now() and record.status != "superseded":
        response.status = "expired"
    return response


@router.get("/companies/{company_id}/history", response_model=list[SnapshotView])
def history(company_id: str, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), session=Depends(db)):
    key = (company_id, limit, offset)
    cached = _HIST_CACHE.get(key)
    if cached and monotonic() - cached[0] < 120:
        return cached[1]
    require(session, Company, company_id)
    rows = session.scalars(select(Snapshot).where(Snapshot.company_id == company_id)
        .order_by(Snapshot.generated_at.desc()).offset(offset).limit(limit)).all()
    _HIST_CACHE[key] = (monotonic(), rows)
    return rows


class CompanyStats(BaseModel):
    symbol: str
    name: str | None = None
    close: float | None = None
    change_pct: float | None = None
    pe_ratio: float | None = None
    volume: int | None = None
    avg_volume_20d: float | None = None
    high_52w: float | None = None
    low_52w: float | None = None
    day_high: float | None = None
    day_low: float | None = None
    as_of: str | None = None


@router.get("/companies/{symbol_or_id}/stats", response_model=CompanyStats)
async def company_stats(symbol_or_id: str):
    clean = symbol_or_id.strip()
    cache_key = clean.upper()
    cached = _STATS_CACHE.get(cache_key)
    if cached and monotonic() - cached[0] < 300:
        return cached[1]

    ticker = clean.removeprefix("nse-").split(".")[0].upper()

    try:
        data = await fetch_stock_history(ticker)
    except Exception:
        data = None

    latest = data.history[-1] if data and data.history else None
    avg_vol = (sum(r.volume for r in data.history[-21:-1]) / 20) if data and len(data.history) >= 21 else None

    # Fetch P/E ratio
    pe = None
    try:
        async with httpx.AsyncClient(timeout=2.5) as client:
            r = await client.get(
                f"https://www.google.com/finance/quote/{ticker}:NSE",
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            )
            if r.status_code == 200 and "P/E ratio" in r.text:
                chunk = r.text[r.text.find("P/E ratio"):r.text.find("P/E ratio") + 250]
                m = re.search(r">([0-9\.]+)<", chunk)
                if m:
                    pe = float(m.group(1))
    except Exception:
        pass

    result = CompanyStats(
        symbol=ticker,
        name=ticker,
        close=latest.close if latest else None,
        change_pct=latest.change_pct if latest else None,
        pe_ratio=pe,
        volume=latest.volume if latest else None,
        avg_volume_20d=avg_vol,
        high_52w=data.info.get("fiftyTwoWeekHigh") if data else None,
        low_52w=data.info.get("fiftyTwoWeekLow") if data else None,
        day_high=latest.high if latest else None,
        day_low=latest.low if latest else None,
        as_of=latest.date if latest else None,
    )
    _STATS_CACHE[cache_key] = (monotonic(), result)
    return result
