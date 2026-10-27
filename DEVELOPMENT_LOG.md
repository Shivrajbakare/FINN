# FINN Development Log — Milestone 1: Foundation, Market Data Ingestion & Mobile Shell

**Timestamp:** 2026-10-28 04:00:00 +05:30  
**Git Commits:** `d4e0123` (Initial scaffold), `9ab6f85` (Async market data & test suite)

---

### 1. Objective
Establish the project foundation for FINN:
- Scaffold the Next.js (App Router) mobile-first frontend and FastAPI backend monorepo.
- Ingest live end-of-day (EOD) market price and volume data for the 18 portfolio stocks + 5 demo research stocks.
- Implement configurable anomaly detection (volume spike multiplier and price move %).
- Verify end-to-end integration across both frontend and backend locally in an authentic mobile viewport (390×844).

---

### 2. Context and Constraints
- **Timeline:** 4 days remaining (Oct 28 – Nov 1).
- **Environment:** Windows host with Node 20.19, npm 10.8, Git 2.45, and multiple Python versions (3.10 through 3.14).
- **Reliability Constraint:** Market data ingestion must never block or crash the prototype during investor or evaluator testing.
- **Mobile-first Design:** Layout, typography, and density must be tuned for phone ergonomics.

---

### 3. Options Considered & Engineering Decisions

#### Technical Decision 1: Python Runtime & Dependency Management
- **Observed Behavior:** Default `python` resolved to Python 3.14.6 (unreleased/development version). Running `pip install` triggered compilation of C and Rust source packages (`pydantic-core`, `aiohttp`, `multidict`), stalling for minutes without prebuilt binary wheels on PyPI.
- **Decision:** Switched to the installed Python 3.11 (`py -3.11`) and established an isolated virtual environment (`finn-backend/.venv`).
- **Rationale:** Prebuilt binary wheels (`.whl`) downloaded and unpacked in under 2 minutes cleanly, eliminating build toolchain dependencies.

#### Technical Decision 2: Market Data Architecture (Yahoo Finance Scraping)
- **Observed Behavior:** Direct use of the standard `yfinance` library failed with `YFRateLimitError: Too Many Requests. Rate limited. Try after a while.` due to Yahoo throttling the cookie/crumb session handshake.
- **Options Considered:**
  1. *Add exponential retry backoff to yfinance:* Still subject to cookie invalidation and blocking threads.
  2. *Direct Yahoo v8 chart API via `httpx.AsyncClient`:* Hits `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=6mo&interval=1d` with realistic browser headers.
- **Decision & Rationale:** Chose Option 2 (Direct v8 chart API via `httpx`). It returned HTTP 200 within 150ms per ticker, required no cookie exchange, ran natively async without blocking thread pools, and exposed 52-week highs/lows, historical OHLCV, and regular market metrics directly. Added in-memory TTL caching (300s) to prevent duplicate calls.

---

### 4. Implementation Completed
1. **Frontend Architecture (`finn-frontend`):**
   - Built with Next.js 16 (Turbopack) using vanilla CSS tokens in [src/app/globals.css](file:///e:/enam_holding/finn-frontend/src/app/globals.css) (dark-mode palette, glassmorphism cards, skeleton states, staggered entry animations).
   - Implemented [BottomNav.js](file:///e:/enam_holding/finn-frontend/src/components/layout/BottomNav.js) with 4 key tabs: **Portfolio** (`/`), **Alerts** (`/alerts`), **Research** (`/research`), and **Settings** (`/settings`).
   - Integrated client API bridge in [src/lib/api.js](file:///e:/enam_holding/finn-frontend/src/lib/api.js).
   - Created interactive Settings page with sliders for Volume Anomaly Multiplier (1.5× to 5.0×) and Price Move Threshold (±1.0% to ±10.0%) saved to local client storage.
   - Designed Pull Research interface supporting arbitrary NSE ticker queries, quick-chips for demo companies (*TITAN*, *ZOMATO*, *DIXON*), and tabs for *Narrative vs. Numbers*, *Snapshot*, and *Ask Primary Sources*.

2. **Backend Architecture (`finn-backend`):**
   - Configured FastAPI app with CORS middleware and `/health` probe.
   - Defined 18 portfolio companies across 9 sectors and 5 research companies in [app/config/portfolio.py](file:///e:/enam_holding/finn-backend/app/config/portfolio.py).
   - Implemented high-performance async EOD market data service and deterministic anomaly calculation in [app/services/market_data.py](file:///e:/enam_holding/finn-backend/app/services/market_data.py).
   - Exposed REST routes `/api/portfolio`, `/api/portfolio/{ticker}`, `/api/alerts`, and `/api/companies`.

---

### 5. Actual Tests and Results

| Test | Method / Command | Result |
|------|-----------------|--------|
| **Python Imports & Venv** | `.\.venv\Scripts\python.exe -c "import fastapi, yfinance, aiohttp"` | ✅ Passed |
| **Market Data Ingestion** | `verify_backend.py` against `RELIANCE.NS` | ✅ Passed: `Price: INR 1201.8, 20d Avg Vol: 15,259,242.0` |
| **Backend Integration Suite** | `test_endpoints.py` across `/health`, `/api/portfolio`, `/api/alerts` | ✅ Passed: All 18 stocks fetched with 200 OK; 5 anomaly alerts detected at sensitive thresholds (e.g., INFY volume spike, POLYCAB +4.0% move). |
| **Frontend Production Build** | `npm run build` | ✅ Passed: Exit code 0, all 5 routes statically prerendered with Turbopack. |
| **Mobile UX & Navigation** | Automated `browser_subagent` session at 390×844 resolution | ✅ Passed: Recording saved to `finn_mobile_test_1793139701108.webp`. Verified navigation across all 4 bottom tabs. |

---

### 6. Known Limitations
- Announcements feed is not yet wired to BSE/NSE live scraping or LLM classification (scheduled for Day 2 Push Mode milestone).
- Research view currently uses sample primary-grounded structures; full RAG extraction over PDF annual reports and transcripts is scheduled for Day 3.

---

### 7. Next Action
Proceed to **Milestone 2 (Day 2 Push Mode)**:
1. Ingest corporate announcements from BSE/NSE.
2. Build announcement classifier service with category tags (results, M&A, management_change, etc.).
3. Implement Results Enrichment (auto-extract Revenue, EBITDA, PBT, PAT with QoQ and YoY comparisons).
4. Implement Windowed Digest UI with time-window filtering (24h default, 3d, 7d).
