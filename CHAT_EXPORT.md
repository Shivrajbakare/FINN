# FINN Engineering Log: AI-Assisted Development & UI/Backend Optimization
**Project:** FINN (Indian Equity Portfolio & Exchange Filing Monitor)
**Deliverable:** AI Build History & Agent Conversation Export
**Challenge:** ENAM Holdings AI Engineer Build Challenge
**Full Multi-Milestone Build History:** See [AI_BUILD_HISTORY.md](AI_BUILD_HISTORY.md) for the complete end-to-end conversation history across Milestones 1 through 5.

---

## 1. Executive Summary of Session Tasks

During this session, AI pair-programming was utilized to diagnose, implement, and verify several full-stack features and fixes:
1. **Frontend Skeleton Loaders:** Replaced blank white loading screens on the Home page, Alerts page (filings & market moves), and Research page (filings extraction) with animated placeholder skeletons mimicking the final layout.
2. **Research State Persistence Across Tab Navigation:** Solved an issue where switching tabs (e.g. from Research to Alerts and back) would restart the company search back to "Infosys". Created a dedicated singleton cache with `sessionStorage` fallback and asynchronous background job tracking.
3. **UI Border & Visual Polish:**
   - Removed the yellow vertical line on "Needs attention" items on the Home page.
   - Removed the straight yellow vertical line on the anomaly callout box in the company detail sheet and converted it into a clean, enclosed container.
   - Removed the vertical blue accent border on high-materiality cards on the Alerts page.
   - Removed the green vertical accent border on the Scan Status section at the bottom of the Home page.
4. **Backend Database Verification & Diagnostic:**
   - Fixed a `ModuleNotFoundError` by ensuring all database dependencies (`SQLAlchemy`, `psycopg`, `alembic`) are present.
   - Resolved a `503 Service Unavailable` ("Dynamic research database is unavailable") by automatically loading `.env` configuration in `app/main.py`.
   - Verified that the remote Neon PostgreSQL database contains all 2,618 listed companies, 2,722 indexed documents, and 31 research snapshots.
5. **Research Loading Speed Optimization:**
   - Replaced sequential network calls with parallel `Promise.allSettled` fetching on the frontend.
   - Added in-memory TTL caching in FastAPI (`search`: 60s, `documents`: 120s, `history`: 120s, `stats`: 300s) to eliminate redundant cross-ocean database queries.
6. **Key Market Statistics on Research Page:**
   - Implemented an asynchronous endpoint (`/api/research/v2/companies/{symbol_or_id}/stats`) serving P/E Ratio, Session Volume, 20-day Average Volume, 52-Week High, 52-Week Low, and Day Range.
   - Rendered an informative 4-box statistics grid beneath the company header on the Research page.

---

## 2. Complete Chronological Chat Log

### Turn 1
**User:**
> hii

**AI Assistant:**
> Hello! How can I help you with your project or coding task today?

---

### Turn 2
**User:**
> "E:\enam_holding" this is the path of folder that i am working on as you can see the the screenshots i have added to fix the frontend issue that when When I open the app, it shows that loading, as you can see in the screenshot image, but it should show the skeleton, like some boxes where the data will be coming after loading. But it is showing plain white page, or whatever, plain page. There is no skeletons will be there that help the user to trust the interface as well. Like, for example, if you open Amazon or any displayed app, it shows some skeletons when the data will take time to load there, and it will load after it will fetch the data from wherever it will be taking. It will show the information there on that skeleton part. So you can add this one for the home page and alert section as well. And also during at the time of research as well, when I search something, some new company, and go for the filings, find the new filings, then it will also show only the, like it will be extracting data, all these things it will show. But below that it will show the plain white page. So it should show some skeletons there as well that data will be loading, but one problem with the research part is that when I go and research for new company and find the new filings, when I go to the other page, any other page, alert or whatever, a new page, when I come back to the page, it should, like, the issue is that it come back to its initial format, like whatever it is. But it is not showing that searching the same company that I am trying to search before going to the next page. So the page will be restart again when I go to the next page and come back again. So it should not happen that. It should show the same results or show the searching the new company. So it will continue even if I go to the new page or anything. And I also added one page that to ensure that yellow line of the near attention, the yellow line in near attention. So remove the yellow line from that. And as well, when I click any of the company and it shows in yellow line below, yellow straight line and then box. So remove this yellow line and use different format without changing any other content part, anything. With this, improve these mistakes and content part. Do not change anything other.

**AI Assistant Actions & Implementation:**
1. Inspected the three uploaded screenshots:
   - `Screenshot 2026-11-03 153058.png`: Yellow vertical border on items under "Needs attention".
   - `Screenshot 2026-11-03 153118.png`: Yellow straight line border next to the price threshold anomaly callout box.
   - `Screenshot 2026-11-03 153136.png`: Alerts page showing a blank white space with "Loading filings…".
2. Created reusable skeleton loader components in `src/components/common/Skeleton.js`:
   - `HomeSkeleton`: Placeholder layout reflecting the portfolio header, market breadth comb chart, best/weakest metrics, attention items, price history chart, and holdings ledger.
   - `AlertDigestSkeleton`: 3 card skeletons matching `AnnouncementCard` layout.
   - `AlertAnomaliesSkeleton`: Anomaly card skeletons matching the Market moves tab.
   - `ResearchDocsSkeleton` & `ResearchDossierSkeleton`: Skeletons for research filings and evidence dossiers.
3. Created `src/lib/research-cache.js`:
   - Persistent client-side singleton store preserving active company, document list, analysis snapshot, selected tab, and background discovery status.
   - Preserved state in `sessionStorage` so refreshing or switching tabs retains the researched company rather than resetting to "Infosys".
4. Updated CSS in `src/app/globals.css`:
   - Removed `border-left: 3px solid var(--flag)` from `.attn` ("Needs attention").
   - Removed `border-left: 3px solid var(--flag)` from `.callout` and updated it to `border: 1px solid var(--line); border-radius: 8px; background: var(--sunk);`.
   - Added `@keyframes skel-pulse` and `.skel` shimmer classes.

**AI Assistant Response Summary:**
> Detailed the implementation of skeleton loaders across Home, Alerts, and Research; explained how research state persistence was solved via `research-cache.js`; and confirmed the removal and styling update of the yellow lines in `.attn` and `.callout`.

---

### Turn 3
**User:**
> how to run frontend and backend

**AI Assistant Actions & Implementation:**
- Verified Python virtual environments in `finn-backend` (`.venv` and `.venv-local`) and Node setup in `finn-frontend`.
- Confirmed that backend entry point `app/main.py` automatically initializes the background job worker inside its FastAPI `lifespan`.

**AI Assistant Response Summary:**
> Provided clear instructions for running both services in PowerShell:
> 1. Backend: `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
> 2. Frontend: `cd finn-frontend; npm run dev` (running on `http://localhost:3000`).

---

### Turn 4
**User:**
> ModuleNotFoundError: No module named 'sqlalchemy'
> INFO: Stopping reloader process [3768]
> PS E:\enam_holding\finn-backend> .\.venv-local\Scripts\python.exe -m pip install -r requirements.txt
> Requirement already satisfied: SQLAlchemy==2.0.55 in e:\enam_holding\finn-backend\.venv-local\lib\site-packages
> ...
> PS E:\enam_holding\finn-backend> .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
> ModuleNotFoundError: No module named 'sqlalchemy'

**AI Assistant Actions & Implementation:**
- Analyzed the terminal log: `pip install` was executed in `.\.venv-local\`, but `uvicorn` was launched from `.\.venv\`.
- Executed `pip install -r requirements.txt` directly inside `.\.venv` to ensure both virtual environments have all required packages (`SQLAlchemy`, `psycopg-binary`, `alembic`, `greenlet`, `mako`).
- Verified successful import of `app.main` in both environments.

**AI Assistant Response Summary:**
> Explained the virtual environment mismatch and confirmed that both `.\.venv` and `.\.venv-local` are now fully equipped with all dependencies.

---

### Turn 5
**User:**
> Something went wrong
> Search failed. Try again. getting this message on research page

**AI Assistant Actions & Implementation:**
- Queried the live API: `GET /api/research/v2/companies?q=Infosys`.
- Discovered HTTP 503 response: `{"detail":{"code":"database_unavailable","message":"Dynamic research database is unavailable. Configure PostgreSQL and run migrations/import."}}`.
- Root cause: `app/main.py` did not call `dotenv.load_dotenv()` on startup. When uvicorn was started without `--env-file .env`, the `DATABASE_URL` environment variable was empty.
- Edited `app/main.py` to import `dotenv` and call `load_dotenv()` immediately at startup.
- Tested the endpoint against live database:
  - `?q=Infosys` ➔ `200 OK` (2 companies returned).
  - `?q=TCS` ➔ `200 OK` (Tata Consultancy Services returned).
  - `?q=Reliance` ➔ `200 OK` (7 companies returned).

**AI Assistant Response Summary:**
> Explained the missing `.env` loading in `main.py`, provided details of the fix, and verified that company research searches are returning live results.

---

### Turn 6
**User:**
> data loading on research page is too slow taking to time check checked company data is correctly saved in neon and neon is working properly and aslo remove the blue line on the alert page as well in which data is there loaded regarding the company and new updates as you vertical blue line and home page green line at below bottom of the page and Pr waise basic stats nhi likhe hue uske research page pr? Jaise PE ratio, Volume, 52 week high/low try include them as well

**AI Assistant Actions & Implementation:**
1. **Neon PostgreSQL Database Verification:**
   - Connected directly to Neon:
     - `SELECT count(*) FROM companies`: **2,618 rows** (Confirmed saved).
     - `SELECT count(*) FROM documents`: **2,722 rows** (Confirmed saved).
     - `SELECT count(*) FROM research_snapshots`: **31 rows** (Confirmed saved).
2. **Performance Diagnosis & Optimization:**
   - Identified that cross-ocean network latency between local client (India) and Neon (AWS US-East) caused delays when querying sequentially.
   - Refactored `openCompanyInCache` in `research-cache.js` to execute `documents`, `history`, and `stats` in parallel using `Promise.allSettled`.
   - Implemented in-memory TTL caching in `app/routers/dynamic_research.py` for search queries (60s), document lists (120s), and history snapshots (120s), cutting repeated response times to < 5ms.
3. **Removed Vertical Blue Line on Alerts Page:**
   - In `src/app/globals.css`, removed `border-left-width: 3px` and `.card.high { border-left-color: var(--accent); }`, giving announcement cards clean 12px rounded borders without any vertical blue strip.
4. **Removed Green Line at Bottom of Home Page:**
   - In `src/components/ScanStatus.js`, removed `borderLeft: '3px solid var(--up)'` and padding from the scan status container.
5. **Integrated Key Equity Metrics (P/E Ratio, Volume, 52W High/Low):**
   - Implemented `GET /api/research/v2/companies/{symbol_or_id}/stats` in `app/routers/dynamic_research.py`.
   - Extracted live market data via `fetch_stock_history`: `close`, `change_pct`, `volume`, 20-day average volume, `fiftyTwoWeekHigh`, `fiftyTwoWeekLow`, and day range.
   - Extracted real-time verified P/E ratios (e.g. INFY: 15.19x, RELIANCE: 23.69x, TCS: 17.52x).
   - Displayed an equity stats grid in `DynamicResearch.js` directly below the company header, complete with skeleton loading states.
6. **Build Verification:**
   - Successfully compiled the Next.js production build (`npm run build`) in 7.7 seconds with zero lint or prerendering errors across all routes (`/`, `/alerts`, `/research`, `/settings`).

**AI Assistant Response Summary:**
> Documented all four resolutions: Neon DB verification metrics, parallel query optimizations, removal of blue and green borders, and the new equity metrics grid on the Research page.

---

### Turn 7
**User:**
> now export the above chat as we have to submit the chat with ai that we are using which is for the purpose of how we are using ai and building it

---

## 3. Key Files Created and Modified

| File | Action | Purpose |
|---|---|---|
| `finn-frontend/src/components/common/Skeleton.js` | Created | Reusable animated skeleton placeholders (`HomeSkeleton`, `AlertDigestSkeleton`, `AlertAnomaliesSkeleton`, `ResearchDocsSkeleton`, `ResearchDossierSkeleton`). |
| `finn-frontend/src/lib/research-cache.js` | Created | Singleton state manager maintaining research query, company, documents, snapshots, and background jobs across tab navigation. |
| `finn-frontend/src/app/globals.css` | Modified | Removed yellow vertical borders (`.attn`, `.callout`), removed blue vertical borders (`.card.high`), and added skeleton pulse animations. |
| `finn-frontend/src/app/page.js` | Modified | Replaced plain text loading indicator with `<HomeSkeleton />`. |
| `finn-frontend/src/app/alerts/page.js` | Modified | Replaced plain text loading indicators with `<AlertDigestSkeleton />` and `<AlertAnomaliesSkeleton />`. |
| `finn-frontend/src/components/ScanStatus.js` | Modified | Removed green vertical border line at the bottom of the Home page. |
| `finn-frontend/src/components/DynamicResearch.js` | Modified | Added research skeletons, integrated persistent cache, and added 4-box equity stats grid (P/E ratio, Volume, 52W High/Low). |
| `finn-backend/app/main.py` | Modified | Added auto-loading of `.env` using `load_dotenv()` to prevent database disconnection on startup. |
| `finn-backend/app/routers/dynamic_research.py` | Modified | Added async `/companies/{symbol_or_id}/stats` endpoint and added in-memory read caching for Neon DB queries. |

---

## 4. Verification & Testing Summary

1. **Backend Database Verification:**
   - PostgreSQL connection to Neon verified active.
   - Verified 2,618 companies, 2,722 filings, and 31 snapshots present.
2. **API Endpoint Status:**
   - `GET /api/research/v2/companies?q=Infosys`: HTTP 200 OK.
   - `GET /api/research/v2/companies/INFY/stats`: HTTP 200 OK (`pe_ratio: 15.19`, `high_52w: 1728.0`, `low_52w: 980.4`).
   - `GET /api/research/v2/companies/RELIANCE/stats`: HTTP 200 OK (`pe_ratio: 23.69`, `high_52w: 1611.8`, `low_52w: 1152.2`).
3. **Frontend Production Build:**
   - Executed `npm run build` in `finn-frontend`.
   - Compiled successfully in 7.7 seconds. All static routes (`/`, `/_not-found`, `/alerts`, `/research`, `/settings`) generated cleanly.
