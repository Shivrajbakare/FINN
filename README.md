# FINN

## Current release: dynamic research and PostgreSQL (30 October 2026)

Research now supports official NSE company discovery, live primary-document
discovery, on-demand PDF retrieval, page-level evidence, PostgreSQL snapshots and
citations, and a durable lightweight worker. The original 18-company portfolio,
alerts, localStorage settings and both historical Infosys documents are preserved.

**Start with [the current setup and architecture guide](docs/DYNAMIC_RESEARCH.md).**
It includes PostgreSQL/Alembic/import commands, worker setup, source policies,
API routes, storage/retention, tests, deployment steps and remaining limitations.
The [live API verification](docs/verification/dynamic-api-2026-10-30.json) records
an additional company, ITC, with eleven persisted citations and verified cache reuse.

The default research method is exact source extraction. An optional AI evidence
selector and conservative financial-figure extraction with deterministic
comparisons are implemented. Free-form financial synthesis, OCR and general
financial-table reconciliation are not claimed. Unsupported evidence
produces an explicit unavailable/insufficient-evidence state.

## Pre-migration implementation notes (historical)

The following original notes describe the earlier release. Statements below
about absent databases, fixed-only research and supported setup are superseded
by the current guide above; retained market-data semantics remain applicable.

Mobile-first portfolio monitoring with configurable end-of-day price and volume alerts. Next.js serves the UI; FastAPI reads Yahoo chart data and computes alerts deterministically. Research now offers a narrow, source-backed historical Infosys snapshot with page-linked excerpts from an actual company earnings-call transcript.

## Local setup (PowerShell)

Use Python 3.11 or 3.13 and Node 20.19+ with npm. The offline API regression suite was verified on Python 3.13.5 using the pinned FastAPI, Pydantic and httpx versions. A full clean installation of every requirement was not verified in the audit environment. Python 3.14 is not recommended for these pins: the observed Pydantic source build required an unavailable MSVC linker.

Create a virtual environment if one does not already work. The original `.venv` may reference a machine-specific interpreter. To preserve it, the commands below create a separate `.venv-local` directory; do not overwrite an existing environment or `.env` file.

```powershell
cd finn-backend
py -3.13 -m venv .venv-local
.\.venv-local\Scripts\python.exe -m pip install -r requirements.txt
# First-time setup only; retain your existing .env if present.
Copy-Item .env.example .env
.\.venv-local\Scripts\python.exe -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000
```

In another terminal:

```powershell
cd finn-frontend
npm.cmd ci
# First-time setup only; retain your existing .env.local if present.
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open `http://localhost:3000`. A health response at `http://127.0.0.1:8000/health` confirms the API process is running, not Yahoo availability. Phone access requires reachable host addresses and corresponding explicit frontend origins; `localhost` on a phone means the phone itself.

## Configuration and deployment

| Variable | Where | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Frontend build environment | Absolute API base ending in `/api`. Required for production, with HTTPS and a non-loopback host. No credentials, query, or fragment. Public, never a place for secrets. |
| `ALLOWED_ORIGINS` | Backend process / `--env-file` | Comma-separated exact frontend origins, e.g. `https://your-app.vercel.app`. No wildcard patterns or URL paths. Defaults to localhost development origins. |
| `RESEARCH_CACHE_DIR` | Backend process / `--env-file` | Optional writable PDF cache directory. Defaults to `finn-backend/data/research`. Contains public source bytes and provenance metadata; excluded from Git. |

For a hosted backend, install `finn-backend/requirements.txt` with the supported Python version and use `python -m uvicorn app.main:app --host 0.0.0.0 --port <hosting-port>`. Set the actual frontend origin in `ALLOWED_ORIGINS`. For the frontend, set its root to `finn-frontend`, supply the real HTTPS backend URL plus `/api`, then run `npm ci` and `npm run build`. Set the same build configuration when running `npm start`. Changing a `NEXT_PUBLIC_*` value requires a rebuild. Backend and frontend must be deployed together because the scan response contract changed from arrays to envelopes.

The audit used `https://api.finn.invalid/api` only to verify a configured build. It is a deliberately nonworking example, not a deployment. No public backend/frontend URL has been verified. No API keys are required by the current implementation; LLM integration is absent.

## Architecture and data semantics

- `finn-backend/app/config/portfolio.py`: static 18-company portfolio plus five research candidates.
- `app/services/market_data.py`: async Yahoo chart requests through a shared client (eight connections), five-minute process-local cache keyed by normalized ticker and range, bounded to 256 entries. Concurrent identical requests share one task; failures are not cached and expired data is not silently substituted.
- `app/routers/portfolio.py`: portfolio/detail, alerts, and company-list endpoints. No database or scheduler is implemented.
- `finn-frontend/src/lib/use-settings.js`: hydrated, validated local-storage settings shared across dashboard/alerts/settings. Scan requests wait for saved settings, cancel on changes, and suppress obsolete results. Quick alert filters apply to that view only; saved defaults remain unchanged.
- `app/services/research.py` and `app/config/research_sources.json`: two reviewed transcripts, bounded retrieval, page extraction, strict excerpt/provenance validation and a 24-hour integrity-checked document cache. No LLM or arbitrary URL ingestion.
- Research retains the mobile shell and ticker selector, with Snapshot, Guidance & risks, and Sources tabs. Unsupported tickers and failed evidence checks remain explicitly unavailable.

Portfolio and alerts endpoints return `{status, checked_at, source, freshness_policy, coverage, stocks|alerts}`. Top-level status is `complete`, `partial`, `stale`, or `unavailable`. Coverage includes counts and each company's status, data date, provider-fetch time and issues. HTTP 200 means the scan envelope was returned, **not** that all data was available. Only `status: complete` with an empty alerts list means no threshold crossings were found across the full portfolio. Detail lookups return 422 for invalid syntax, 404 for no completed data, and 503 for provider failure.

Per-company states are `ok`, `partial`, `stale`, `unavailable`, `no_data`, and `insufficient_history`. Price cards may display explicitly dated stale/short-history data; alerts evaluate only `ok` histories. Missing or invalid OHLCV bars are omitted rather than filled with synthetic prices or zero volumes. A skipped bar prevents calculation of a purported daily change across that gap. All quotes must be INR. Ticker syntax is normalized to uppercase NSE/BSE symbols; syntax validation does not prove a symbol is listed.

The EOD policy excludes bars after the last weekday whose 16:00 IST publication buffer has elapsed. This is deliberately conservative. It does **not** include an exchange holiday or special-session calendar, so legitimate holiday data can be marked stale and alerts skipped. A new trading session does not become completed EOD merely because the provider returned a daily candle. Cached payloads are rechecked against the current cutoff.

Volume compares the latest bar with exactly 20 prior complete bars, excluding the latest. Short/incomplete history produces an unavailable baseline instead of a misleading 20-day label. A zero baseline produces no volume ratio or complete scan. Price changes use unrounded source closes; displayed percentage changes are rounded to two decimals. Split/corporate-action adjustment reconciliation is not implemented; unusual provider discontinuities need review. Fifty-two-week high/low come only from provider metadata; missing values remain null, never six-month extrema.

Threshold crossings are inclusive (`>=`); API thresholds must be finite and positive, with maximum volume multiplier 100 and price percentage 1000. UI defaults are 2x volume and 3% price, with saved UI ranges 1.5-5x and 1-10%. Currency and unavailable values are explicit in the contract. Browser zoom is allowed.

## Evidence-backed research: initial supported slice

Open **Research** and select **Infosys**, or enter `INFY`. This retrieves a reviewed historical Q4/FY25 earnings-call transcript from [Infosys investor relations](https://www.infosys.com/investors/reports-filings/quarterly-results/2024-2025/q4/documents/transcripts/earningscall.pdf). The call date is **17 April 2025**; this is not a current-results or latest-guidance service. The date is labeled as the call date, not an independently verified PDF publication date.

Initial support is **INFY.NS only**, irrespective of the larger portfolio/company configuration. `TCS`, `TITAN`, and other syntactically valid symbols return `unsupported` without substituting Infosys content. The supported list comes from `GET /api/research/companies`; `GET /api/research/INFY` returns the snapshot. Invalid ticker syntax returns HTTP 422. Supported-but-unretrievable documents return a typed HTTP 200 envelope with `status: unavailable`, empty claims, and explanatory issues. Successful states are `available` or `partial` depending on evidence coverage, not HTTP status alone.

Seven short excerpts cover the company/period, management's business capabilities, revenue, margins, cash flow including the tax-refund qualification, explicit forward guidance, and a selected demand risk. Each excerpt links to its exact one-based PDF page. Reported actuals are labeled **management-reported**, guidance is **forward-looking**, and commentary remains attributed to the speaker. No analyst estimates, calculated metrics, financial conversions, or independently audited conclusions are generated.

The snapshot is **extractive**, not a canned answer or LLM summary. After download, `pypdf` extracts text with page boundaries. Reviewed start/end anchors select passages from those pages at runtime. Pydantic validates the structured output and an independent validator requires the exact extracted quote, correct page, URL, document hash, period, speaker and claim type. Missing/ambiguous anchors yield missing sections rather than invented replacements. The source manifest contains selectors and provenance, not populated financial answers. It is intentionally document-specific; arbitrary-ticker generalization is not implemented.

The approved SHA-256 is `2e4ccd145dd8a746cfcf4ac3ba8b23ca2080f90da1072a8d6010b968abe37e4e`. Every PDF, including cache reads, must match this reviewed version **before parsing**. A changed source fails closed pending review. Only the configured HTTPS primary-source host is fetched; redirects and caller-provided URLs are rejected. Downloads are limited to 5 MB and this slice supports at most 80 pages. Extracted text is untrusted data and is never executed, interpreted as instructions, or rendered as HTML. There is no LLM adapter, prompt or API key; therefore LLM-output validation and model routing are not claimed. Structured excerpt/provenance validation is implemented instead.

Cache records retain the source URL, original retrieval timestamp, manifest version, byte count and hash; responses add document title, call date and page count. A second request identifies itself as a cache read, preserving the original retrieval time. After 24 hours the source must be fetched again; an expired copy is not silently served during an outage. Concurrent requests for the same ticker, document ID and hash share one retrieval; different documents remain isolated. A cache-write failure permits the verified response but logs that persistence failed. The cache is an optimization, not the source of truth. The stored PDFs are public source material and are not committed.

To extend support, first locate and download another primary document, verify issuer/period/speaker context, review its hash and short page selections, then add a manifest entry and source-policy approval plus tests. Do not merely add a ticker or copy a populated snapshot. A source version change requires the same review.

## Verification

From `finn-backend`, with your installed environment:

```powershell
.\.venv-local\Scripts\python.exe -m unittest discover -s tests -v
```

This suite uses mocked providers and asserts outage handling, validation, stale/in-progress dates, short/missing history, cache expiry/coalescing/cancellation, CORS, and alert boundaries. It needs no network or running API. Optional live smoke checks (require external availability and, for the second script, a running API):

```powershell
.\.venv-local\Scripts\python.exe verify_backend.py
.\.venv-local\Scripts\python.exe test_endpoints.py
```

Both now assert meaningful results and fail on incomplete coverage. They were not run as live availability verification during remediation.

The research tests add **synthetic PDFs and mocked HTTP** for page provenance, malformed extraction, unsupported claims/citations, source-policy checks, partial evidence, missing documents, version changes, cache corruption/expiry and concurrent retrieval. Test fixtures are not real company disclosures and are never used by production routes.

A separate live research verification downloads from the actual company site, runs through the in-process FastAPI route and checks the cache on a second request:

```powershell
.\.venv-local\Scripts\python.exe verify_research.py --fresh
```

`--fresh` creates an isolated temporary cache, forcing a real source request. The check exits nonzero on missing or unverifiable evidence. It **passed on 29 October 2026 IST**: 246,724 bytes, 27 pages, seven validated excerpts, then a verified cache read. This is genuine source/API evidence, not a browser or deployed-product check. Network access is required; public sources may subsequently deny access or replace files. `--output <path>` can save a provenance-only verification record. Reinstall `requirements.txt` when updating an existing environment to include `pypdf==6.21.3`.

From `finn-frontend`:

```powershell
npm.cmd test
npm.cmd run lint
# Replace with the actual backend URL before deployment.
$env:NEXT_PUBLIC_API_URL='https://your-backend.example/api'
npm.cmd run build
```

Frontend tests cover API configuration, persisted/corrupt/inaccessible settings, change notifications, obsolete request suppression, and distinct successful/unavailable scan messaging. See `AUDIT_REPORT.md` and the appended entry in `DEVELOPMENT_LOG.md` for actual audit commands/results and limitations. A passing build/unit suite does not establish browser E2E, external data availability, or deployment success.

## Implemented scope and limitations

Implemented: portfolio monitoring UI, daily market-data parsing, deterministic configurable alerts, explicit coverage/freshness, settings persistence, and one historical evidence-backed research workflow. Alerts run when a view loads or thresholds change; there are no background notifications or automatic refresh guarantees. Reload to request another scan; successful provider payloads remain cached for up to five minutes per process.

Not implemented: exchange announcements/digest, financial-statement table extraction/QoQ/YoY comparison, annual-report ingestion, arbitrary-company document discovery, generic RAG, open-ended research chat, latest-document monitoring, model routing, usage ledger, authentication or per-user backend portfolios. No LLM cost or savings claims are supported; current application code makes no LLM calls. Existing build-plan model prices are historical planning estimates, not measured usage. Browser/mobile interaction and public deployment remain unverified. The next research blocker is reviewed source coverage and generalization beyond two historical Infosys documents. Browser/mobile verification is the immediate submission blocker.


## Two-period source coverage and local verification (29 October 2026)

Research now has a **Historical reporting document** selector. April 17, 2025 (Q4/FY25) remains the default and its URL, hash and reviewed selections are unchanged. July 23, 2025 (Q1/FY26) is a separate historical snapshot, not a current-results update or an automatic comparison. Select the document before reading its figures and guidance.

The second [official transcript](https://www.infosys.com/investors/reports-filings/quarterly-results/2025-2026/q1/documents/transcripts/earningscall.pdf) has 25 pages, 288,245 bytes and SHA-256 `09fe2ca57d9dbfcdb707bf924041791ac7676fd03253a5869abba4204ed98e72`. Its fresh retrieval timestamp is `2026-10-28T22:22:53.707597+00:00` (29 October IST). Seven selections were checked against extracted page text and speaker context, on PDF pages 1, 3, 4, 5 and 6. Cash-flow actuals exclude the subsequent forward-looking sentence. No PDF visual-layout certification is claimed.

`GET /api/research/INFY?document_id=infosys-q1-fy26-call` selects July. Omitting the parameter retains April. The catalog includes a `documents` list. Unknown IDs or documents belonging to another ticker return 422, never a default substitute. Cache hashes and concurrent-request keys isolate versions; the UI request key includes the document ID to suppress old-period responses.

Additional checks, from the backend directory with installed dependencies:

```powershell
python verify_research.py --fresh --document-id infosys-q1-fy26-call
python verify_research.py --fresh
# Requires local frontend :3000 and backend :8000 already running.
python verify_local.py --output ../docs/verification/local-http-2026-10-29.json
```

Both real-source checks passed, as did local page HTTP responses, health, unsupported ticker handling and local CORS. These are not browser tests. The available Browser tool returned `No browser is available` and discovery `[]`; desktop/mobile rendering, click-through source links, loading/error visuals and interactive settings journeys remain unverified. Regression results: 45 backend tests, 13 frontend tests, lint and production build passed. Backend unit tests mock external services; the two `verify_research.py --fresh` checks use real PDFs/live requests. Provenance records are in `docs/verification/`.

Production builds currently fetch Geist fonts from Google. A restricted-network build failed; the permitted-network rerun passed. The example build API `https://api.finn.invalid/api` is not a deployment. Environment examples contain configuration only, no API keys; exact-origin CORS and production API validation remain in place. Uvicorn 0.34.2 was installed into the isolated verification dependencies; a full clean requirements install remains unverified.
