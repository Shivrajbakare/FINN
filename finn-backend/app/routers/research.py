"""Small supported-company catalogue and evidence-backed snapshots."""
from fastapi import APIRouter, HTTPException

from app.services.research import ResearchSnapshot, get_research, supported_companies

router = APIRouter(prefix="/research", tags=["research"])


@router.get("/companies")
async def research_companies():
    return supported_companies()


@router.get("/{ticker}", response_model=ResearchSnapshot)
async def research_snapshot(ticker: str, document_id: str | None = None):
    try:
        return await get_research(ticker, document_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Enter a valid ticker and a reviewed document ID for that ticker.") from exc
