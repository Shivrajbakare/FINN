"""
Corporate Announcements Router for FINN API.
Provides endpoints for the windowed digest, category filtering, and announcement details.
"""

from typing import Literal
from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services.announcements import (
    CorporateAnnouncement,
    fetch_announcements,
)

router = APIRouter(prefix="/announcements", tags=["announcements"])


class AnnouncementsResponse(BaseModel):
    window: str
    total_in_window: int
    material_count: int
    routine_count: int
    category_breakdown: dict[str, int]
    checked_at: str
    announcements: list[CorporateAnnouncement]


@router.get("", response_model=AnnouncementsResponse)
async def list_announcements(
    window: Literal["24h", "3d", "7d", "30d"] = Query("24h", description="Digest time window"),
    category: str | None = Query(None, description="Optional category filter (e.g. results, M&A, management_change)"),
    hide_routine: bool = Query(True, description="Collapse low-materiality compliance paperwork"),
    ticker: str | None = Query(None, description="Filter by company ticker"),
):
    """
    Returns filtered and prioritized corporate filings across the portfolio.
    Surface material events (Results with QoQ/YoY metrics, Management Changes with executive bios)
    while collapsing routine paperwork.
    """
    announcements, stats = fetch_announcements(
        window=window,
        category=category,
        hide_routine=hide_routine,
        ticker=ticker,
    )
    return AnnouncementsResponse(announcements=announcements, **stats)
