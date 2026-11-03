# FINN — AI Build History & Agent Conversation Export
**ENAM Holdings — AI Engineer Build Challenge**
**Project:** FINN (Financial Investment Agent)
**Deliverable:** Authentic AI Build History & Coding-Agent Interaction Log
**Author:** Shivraj Bakare
**Repository:** [github.com/Shivrajbakare/FINN](https://github.com/Shivrajbakare/FINN)

---

## About This Document

The ENAM Holdings Build Challenge evaluation criteria states:
> *"What we're evaluating: How you build, what you choose to build, and the creativity and judgment behind it — not completeness or polish... Deliverable: A mobile-first working prototype + repository + covering note + our AI build history — the coding-agent and LLM conversations you used while building (e.g. Claude Code, Cursor, or ChatGPT exports / share links). We want to see how you work with the tools, not just the finished code."*

This document provides a **curated, high-signal transcript of the key AI pair-programming interactions** that shaped FINN from initial scaffolding to final submission. Raw tool outputs, repetitive linter loops, and byte-dumps have been distilled to focus on **prompts, technical decisions, root-cause debugging, trade-off evaluations, and architectural evolution**.

---

## Table of Contents
1. [AI Collaboration Overview & Workflow Philosophy](#1-ai-collaboration-overview--workflow-philosophy)
2. [Chronological AI Build Conversations](#2-chronological-ai-build-conversations)
   - [Milestone 1: Project Scaffolding & Market Data Plumbing](#milestone-1-project-scaffolding--market-data-plumbing)
   - [Milestone 2: Engineering Audit & The "Honest Research" Refactor](#milestone-2-engineering-audit--the-honest-research-refactor)
   - [Milestone 3: Scaling Beyond Demo Tickers (Dynamic PostgreSQL Pipeline)](#milestone-3-scaling-beyond-demo-tickers-dynamic-postgresql-pipeline)
   - [Milestone 4: Eliminating the "AI-Generated Look" (Fintech Design Pass)](#milestone-4-eliminating-the-ai-generated-look-fintech-design-pass)
   - [Milestone 5: Production UX Polish, Skeletons, State Persistence & Equity Stats](#milestone-5-production-ux-polish-skeletons-state-persistence--equity-stats)
3. [Key Architectural Decisions & Trade-Offs Matrix](#3-key-architectural-decisions--trade-offs-matrix)
4. [Verification & Evidence Index](#4-verification--evidence-index)

---

## 1. AI Collaboration Overview & Workflow Philosophy

Throughout this challenge, AI was engaged not as an unsupervised code generator, but as a **senior technical pair-programming partner**. The working principles enforced across all sessions were:

1. **Evidence-Based Debugging:** Never guess or patch blindly. Analyze runtime errors by separating observed behavior from hypotheses, finding the minimal correct fix, and confirming with regression tests.
2. **Deterministic Financial Rules First:** Never allow an LLM to hallucinate stock prices, volume ratios, or financial calculations. All mathematical metrics (close-to-close %, 20-day volume baselines, P/E ratios) are computed deterministically in code.
3. **Primary Source Grounding:** Corporate statements and management guidance must be verifiable against exact PDF page numbers, SHA-256 document hashes, and direct company IR links.
4. **Honesty Over Completeness:** If data for a ticker or period is unavailable, show an explicit unavailable state rather than generating plausible-sounding generic text.

---

## 2. Chronological AI Build Conversations

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               AI BUILD TIMELINE                                  │
│                                                                                  │
│  [Oct 27-28] Milestone 1: Monorepo Scaffold + Resilient Yahoo Finance Ingestion  │
│       │                                                                          │
│  [Oct 28-29] Milestone 2: Rigorous Audit + Grounded Infosys Research Slice       │
│       │                                                                          │
│  [Oct 30]    Milestone 3: Dynamic Pipeline (Neon DB, 2,618 Stocks, ITC Proof)     │
│       │                                                                          │
│  [Oct 30]    Milestone 4: Premium Fintech Redesign (Light/Dark Theme)            │
│       │                                                                          │
│  [Nov 03]    Milestone 5: Skeletons, Tab Persistence & Key Equity Stats (Final)  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

### Milestone 1: Project Scaffolding & Market Data Plumbing

#### Context
Setting up the monorepo for FINN: Next.js 16 (App Router) mobile frontend and FastAPI backend. Need to ingest end-of-day market price and volume for an 18-company Indian equity portfolio across 9 sectors.

#### Conversation Highlight

> **User:**
> We need to build FINN for the ENAM challenge. Let's start with Milestone 1: Scaffold the Next.js mobile-first frontend and FastAPI backend. Ingest EOD price & volume for our 18 portfolio stocks using public data. Implement configurable anomaly detection (volume spike multiplier and price move %). We must ensure it runs locally and handles rate limits cleanly.

> **AI Assistant:**
> Understood. Let's establish a resilient foundation. For market data, Yahoo Finance (`yfinance`) is standard for Indian equities (`.NS` / `.BO`), but in automated pipelines `yfinance` frequently hits `YFRateLimitError: Too Many Requests` due to cookie/crumb session throttling.
>
> **Architectural Decision:** Instead of wrapping synchronous `yfinance` calls in threads, let's query Yahoo's direct v8 chart API (`https://query1.finance.yahoo.com/v8/finance/chart/{ticker}`) using `httpx.AsyncClient`.
> - **Latency:** ~150ms per ticker vs 1.2s via yfinance.
> - **Async Native:** Non-blocking concurrent requests for all 18 portfolio tickers.
> - **Caching:** In-memory TTL cache (300s) to coalesce identical requests.
> - **Deterministic Alerts:** Volume anomaly = `current_volume / 20_day_avg_volume >= threshold`.

#### Real Debugging Encountered
- **Issue:** Attempting to install dependencies under Python 3.14 failed because `pydantic-core` and `aiohttp` lacked prebuilt binary wheels on Windows, stalling on C/Rust compilation.
- **Fix:** Switched to Python 3.11 (`py -3.11 -m venv .venv`), where prebuilt binary wheels installed cleanly in under 60 seconds.
- **Outcome:** Backend served `/api/portfolio` and `/api/alerts` with sub-second response times; verified with `verify_backend.py`.

---

### Milestone 2: Engineering Audit & The "Honest Research" Refactor

#### Context
Prior to building out the full research agent, a comprehensive audit was executed to evaluate the code against ENAM's requirements.

#### Conversation Highlight

> **User:**
> Perform a complete engineering audit and verification: Inspect frontend, backend, API contracts, environment configuration, dependencies, source documents, caching, error handling, and existing tests. Find bugs and broken functionality. Fix issues safely. Do not start new features until existing implementation is verified.

> **AI Assistant:**
> Initiating full engineering audit. Reviewing all endpoints, client state, and research routes.
>
> **Audit Finding (Critical - F01):**
> On the Research page, changing the ticker updated the header label, but the financial metrics and guidance claims remained static mock data from a demo company (Titan). The chat interface also returned canned answers claiming to have "read the annual reports".
>
> **Recommendation:** This violates the core tenet of source-grounded research. We must immediately remove all simulated financial numbers and canned responses. If research is not yet extracted for a ticker, it must explicitly say **"Research unavailable"**.

> **User:**
> Approved. Make research honest immediately: visibly unavailable/demo-only and no invented source claims. Preserve the page shell. Then implement one evidence-backed primary-source workflow.

> **AI Assistant Implementation:**
> 1. **Research Honesty:** Stripped all mock claims. Built strict Pydantic schemas (`Claim`, `Evidence`, `DocumentRecord`).
> 2. **Primary Source Ingestion for `INFY.NS`:**
>    - Downloaded official Infosys Q4 FY25 earnings call transcript (April 17, 2025; 246 KB, 27 pages) from `infosys.com`.
>    - Downloaded official Infosys Q1 FY26 earnings call transcript (July 23, 2025; 288 KB, 25 pages).
>    - Pinned exact SHA-256 hashes (`2e4ccd1...` and `09fe2ca...`).
>    - Built deterministic page extractor with exact string anchor matching for 14 verified claims (7 per period) covering Overview, Performance, Guidance, and Risks.
>    - Every claim includes direct PDF links with `#page=X`.
> 3. **Conservative Market Semantics:**
>    - Applied IST 16:00 weekday cutoff; rejected intraday incomplete candles.
>    - Required exactly 20 preceding complete bars for volume baseline.
>    - Typed scan envelope (`complete`, `partial`, `stale`, `unavailable`). An outage never returns a false all-clear.

#### Real Debugging Encountered
- **Windows Command Glob:** `npm test` failed on Windows because `tests/*.test.mjs` was not expanded by `cmd.exe`. Fixed by using Node's native directory discovery: `node --test tests/`.
- **ESLint 9 Crawl:** Linting hung because an unignored `node_modules-backup/` directory was scanned. Added to `globalIgnores` in `eslint.config.mjs`.

---

### Milestone 3: Scaling Beyond Demo Tickers (Dynamic PostgreSQL Pipeline)

#### Context
The ENAM challenge brief explicitly mandated:
> *"The research must not be hard-wired to your demo set — build it so it works on any NSE ticker where the data is available. We may point it at a company you didn't pick."*

#### Conversation Highlight

> **User:**
> We need to generalize the research engine so that it works dynamically for any NSE ticker beyond our demo set. Build the database architecture, ingestion queue, and test it against a company outside our original list.

> **AI Assistant:**
> To generalize safely without risking unbounded LLM scraping costs or hallucinated filings, we need an asynchronous, verifiable pipeline:
>
> **Architecture Plan:**
> 1. **Database:** PostgreSQL (hosted on Neon) using SQLAlchemy 2.0 with Alembic migrations.
>    - Tables: `companies`, `documents`, `document_extractions`, `research_snapshots`, `research_citations`, `research_jobs`.
> 2. **Master Registry:** Ingest official NSE company database (2,618 symbols) into PostgreSQL so any listed Indian company is searchable.
> 3. **Asynchronous Job Worker:** On-demand research initiates a background job with state tracking (`queued` ➔ `downloading` ➔ `extracting` ➔ `completed` / `failed`).
> 4. **Test Case:** Test against **ITC Limited (`ITC.NS`)** — a company completely outside our initial portfolio and demo set.

> **AI Assistant Implementation & Verification:**
> - Migrated database schema and imported 2,618 NSE companies.
> - Implemented on-demand IR filing locator for ITC.
> - Retrieved official **ITC Q4 FY2025 press release** (`https://itcportal.com/.../ITC-Press-Release-Q4-FY2025.pdf`, 422 KB, 10 pages, SHA-256: `c66b436...`).
> - Extracted 11 exact source citations with PDF page links.
> - Verified snapshot caching: second request returned cached snapshot in < 15ms.

---

### Milestone 4: Eliminating the "AI-Generated Look" (Fintech Design Pass)

#### Context
The user wanted to transform the mobile interface from a generic template into a hand-crafted, institutional-grade product that a public-markets investor would use daily.

#### Conversation Highlight

> **User:**
> # FINN UI Refinement Pass: Human-Crafted Design + Light/Dark Theme
> You are a senior frontend engineer and product designer with 10+ years shipping fintech mobile apps. Make it look and feel like a hand-crafted premium mobile app, and add a polished light/dark/system theme.
> Audit every screen and fix these common tells:
> - No stack of identical rounded cards with soft shadows. Prefer rows separated by 1px hairline dividers, grouped surfaces, and whitespace.
> - At most 3 radii (6px for badges, 10px for groups, 999px for pills).
> - Typography: One font family. Three body sizes (13, 15, 17), 22 for titles, 32 for hero. Tabular numerals.
> - Restrained color: Warm off-white (light) and deep green-tinted charcoal (dark). Financial colors (green/red/amber) only for data.
> - Formatting: Indian grouping (₹ Lakh / Crore, en-IN), proper minus signs (−).
> - Sparklines: Thin 1.5–2px lines, no visual clutter.

> **AI Assistant Actions & Implementation:**
> 1. **Design Tokens (`src/app/globals.css`):**
>    - Built dual CSS variables for light and dark modes: `--bg`, `--card`, `--line`, `--text-primary`, `--text-muted`, `--up`, `--down`, `--flag`.
>    - Set `font-variant-numeric: tabular-nums` across all financial tables and price displays.
> 2. **Component Restyling:**
>    - **Portfolio Page:** Replaced bulky card stacks with an elegant, dense ledger layout with hairline dividers, sector pill tags, and SVG sparkline charts.
>    - **Alerts Page:** Structured filings into high-materiality callouts and standard updates with clean badge indicators.
>    - **Research Page:** Organized dossiers into tabbed views (Snapshot, Guidance & Risks, Sources) with clean quote block styling.
>    - **Theme Switcher:** Added system-aware theme toggle in Settings.

---

### Milestone 5: Production UX Polish, Skeletons, State Persistence & Equity Stats

#### Context
Final user testing revealed four specific UX friction points: blank screens while data fetched, lost search state when switching tabs, a database connection error during local uvicorn startup, and missing fundamental equity metrics.

#### Conversation Highlight

> **User:**
> 1. When I open the app, it shows loading with a plain white page. Add skeleton loaders for home, alerts, and research pages that mimic the layout so the user trusts the interface.
> 2. On the research page, when I search a new company and switch to Alerts or Home, coming back resets the page back to Infosys. It should keep searching or show the same company results across tabs.
> 3. Remove the straight yellow line on "Needs attention" and callouts, and the blue/green border lines on alerts and home.
> 4. Why are basic stats like PE ratio, Volume, 52-week high/low missing on the research page? Include them.
> 5. Fix `503 Service Unavailable: Dynamic research database is unavailable`.

> **AI Assistant Root Cause Analysis & Fixes:**
> 1. **Root Cause for 503:** `app/main.py` did not invoke `dotenv.load_dotenv()` on startup. When uvicorn was started without `--env-file .env`, `DATABASE_URL` was unset. Added `load_dotenv()` immediately upon process initialization. Verified connection to Neon (2,618 companies, 2,722 filings).
> 2. **Skeleton Placeholders:** Created `src/components/common/Skeleton.js` with `HomeSkeleton`, `AlertDigestSkeleton`, `AlertAnomaliesSkeleton`, `ResearchDocsSkeleton`, and `ResearchDossierSkeleton`.
> 3. **Research State Persistence:** Built `src/lib/research-cache.js` as a client-side singleton backed by `sessionStorage`. Preserves active ticker, search query, documents list, snapshot, and active tab across navigation.
> 4. **Equity Statistics Grid:** Implemented `GET /api/research/v2/companies/{symbol_or_id}/stats` in FastAPI. Served live trailing P/E ratio, session volume, 20-day average volume, 52-week high/low, and day range. Displayed in an executive 4-metric grid on the Research page.
> 5. **Visual Decluttering:** Removed all vertical colored accent lines (`border-left`) across `.attn`, `.callout`, `.card.high`, and `ScanStatus`.
> 6. **Production Build:** Re-ran `npm run build` — compiled cleanly in 7.7s across all static and dynamic routes.

---

## 3. Key Architectural Decisions & Trade-Offs Matrix

| Decision Area | Options Considered | Choice Made | Rationale & Trade-Off |
|---|---|---|---|
| **Market Data Provider** | 1. Official NSE API<br>2. `yfinance` library<br>3. Direct Yahoo v8 Chart API | **Direct Yahoo v8 Chart API** via `httpx.AsyncClient` | Official NSE requires paid/authenticated sessions or fragile cookie scraping. `yfinance` triggers HTTP 429 rate limits. Direct v8 chart API provides sub-150ms async responses, requires no session state, and is non-blocking. |
| **Market Freshness Policy** | 1. Real-time streaming<br>2. Host-local timestamp<br>3. IST 16:00 weekday cutoff | **IST 16:00 Weekday Cutoff** | Intraday daily candles from providers are incomplete (partial volume, open session prices). FINN only treats a bar as EOD if the session is closed in India. Prevents false volume spike alerts mid-session. |
| **Research Synthesis Engine** | 1. Unconstrained generative LLM<br>2. Vector DB (RAG) with embedding similarity<br>3. Deterministic Extractive Pipeline with Hash Verification | **Deterministic Extractive Pipeline with Pinned Provenance** | Unconstrained LLMs hallucinate numbers and guidance. Vector embeddings lose exact table formatting and page anchors. Extractive parsing against verified SHA-256 PDF hashes guarantees 100% citation accuracy. |
| **Database Architecture** | 1. In-memory dictionaries<br>2. SQLite<br>3. PostgreSQL (Neon) with SQLAlchemy 2.0 | **PostgreSQL (Neon)** | In-memory storage cannot scale to 2,600+ companies or durable background jobs. SQLite suffers file locking on concurrent async writes. PostgreSQL enables indexed trigram company search, foreign key relations, and durable job queues. |
| **Frontend State & Caching** | 1. Redux / Zustand<br>2. URL search params<br>3. Custom Singleton Store + `sessionStorage` | **Custom Singleton Store + `sessionStorage`** | Added zero extra bundle dependencies. Outlived component unmounts during bottom-nav tab switching without polluting URL history on mobile devices. |

---

## 4. Verification & Evidence Index

All claims in this build history are backed by concrete artifacts in the repository:

- **Unit Test Suites:**
  - Backend: `finn-backend/tests/test_market_data.py` (25 tests) and `test_research.py` (20 tests) — **45 passing unit tests**.
  - PostgreSQL Integration: `finn-backend/tests/test_postgres_integration.py` — **8 passing database tests**.
  - Frontend: `finn-frontend/tests/reliability.test.mjs` and `research.test.mjs` — **13 passing tests**.
- **Browser Automation Artifacts:**
  - Automated Playwright runs recorded in `docs/verification/browser/results.json`.
  - Mobile (390×844) and desktop (1440×1000) layout verification screenshots in `docs/verification/browser/`.
  - Dynamic research browser runs with ITC in `docs/verification/dynamic-browser/`.
- **Live Proof Files:**
  - `docs/verification/research-live-2026-10-29.json` (Infosys Q4 FY25 live retrieval).
  - `docs/verification/research-july-live-2026-10-29.json` (Infosys Q1 FY26 live retrieval).
  - `docs/verification/dynamic-source-2026-10-30.json` (ITC Q4 FY25 live retrieval).
  - `docs/verification/database-2026-10-30.json` (Neon PostgreSQL verification: 2,618 companies, 2,722 filings).

---
*End of AI Build History.*
