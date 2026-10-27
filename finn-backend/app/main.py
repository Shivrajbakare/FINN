"""
FINN Backend — Financial Investment Agent
FastAPI application entry point.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import portfolio

app = FastAPI(
    title="FINN API",
    description="Financial Investment Agent — Backend API",
    version="0.1.0",
)

# CORS — allow frontend dev server and deployed frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",       # Next.js dev
        "http://127.0.0.1:3000",
        "https://*.vercel.app",        # Deployed frontend
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint — verifies the API is running."""
    return {"status": "ok", "service": "finn-backend"}


# Register routers
app.include_router(portfolio.router, prefix="/api")
