"""
FINN Backend — Financial Investment Agent
FastAPI application entry point.
"""

from contextlib import asynccontextmanager
import os
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import portfolio, research, dynamic_research, announcements
from app.database import validate_startup, close_database
from app.services.market_data import close_market_client
from app.services.research import close_research_tasks
from app.services.jobs import start_job_worker, stop_job_worker


def allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    origins = [value.strip().rstrip("/") for value in raw.split(",") if value.strip()]
    for origin in origins:
        parsed = urlsplit(origin)
        if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                or "*" in origin or parsed.path or parsed.query or parsed.fragment
                or parsed.username or parsed.password):
            raise ValueError("ALLOWED_ORIGINS must contain explicit http(s) origins without paths or wildcards.")
    return origins


@asynccontextmanager
async def lifespan(app):
    validate_startup()
    await start_job_worker()
    try:
        yield
    finally:
        await stop_job_worker()
        await close_market_client()
        await close_research_tasks()
        close_database()

app = FastAPI(
    title="FINN API",
    description="Financial Investment Agent — Backend API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server and deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint — verifies the API is running."""
    return {"status": "ok", "service": "finn-backend"}


# Register routers
app.include_router(portfolio.router, prefix="/api")
app.include_router(dynamic_research.router, prefix="/api")
app.include_router(research.router, prefix="/api")
app.include_router(announcements.router, prefix="/api")
