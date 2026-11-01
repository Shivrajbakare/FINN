# FINN implementation report — 30 October 2026

## 1. Architecture changes

Added synchronous SQLAlchemy 2/psycopg PostgreSQL persistence, Alembic migrations,
official NSE registry ingestion and primary-source document discovery. A durable
PostgreSQL queue and lightweight worker handle bounded downloads, isolated PDF
parsing, exact source-evidence generation and snapshot persistence. The Next.js
Research page now supports company search, document/period selection, actual job
states, history and expandable page citations. Existing market APIs, alerts,
localStorage settings and historical Infosys research remain available.

The default research provider is deterministic; an optional provider-independent
AI evidence selector accepts only validated evidence IDs. It is not free-form
financial synthesis. Fabricated UI comparison values were removed.

## 2. Database tables and relationships

Six application tables: `companies`, `documents`, `document_extractions`,
`research_snapshots`, `research_citations`, `research_jobs`. Company/document
foreign keys connect research records; citations reference both snapshot and
source document. Exchange IDs and company/source URLs are unique. No users or
user-settings tables were created without a real identity system.

See [schema and architecture](DYNAMIC_RESEARCH.md#tables-and-relationships).

## 3. Data migration

The real hosted PostgreSQL migration succeeded. The import was run twice and
retained exactly 18 portfolio companies and two pinned documents with their
original IDs, hashes and source metadata. Existing cached bytes were verified;
the reviewed page selections and citations were imported. No legacy PDFs,
manifest entries or old files were deleted. Integration tests assert 14 original
citations and no duplicate imported snapshots.

Evidence: [database verification](verification/database-2026-10-30.json).

## 4–5. Companies, documents and real-source evidence

The real official NSE master import contains 2,618 records, preserving the
18-member portfolio. ITC was not in the original company configuration.

The live workflow found ITC's official Q4 FY2025 results press release from its
investor-relations listing:

- Original source: [ITC Q4 FY2025 press release](https://itcportal.com/content/dam/itc-corporate/open-pdfs/investor/quarterly-results/quarterly-results-2024-2025/march-2025/ITC-Press-Release-Q4-FY2025.pdf).
- 422,262 bytes; 10 extracted PDF pages.
- SHA-256: `c66b436566a77e8953013bc9e9e43686ebb1bfb4d0ed46334b46013dd2b54c5c`.
- Eleven exact source citations persisted with the snapshot.
- Repeated API requests reused verified document bytes and the same snapshot ID.
- The separate ITC presentation failed extractable issuer-name validation; no
  result was fabricated and that failure was not relabeled successful.

Evidence: [source-only check](verification/dynamic-source-2026-10-30.json) and
[database/API/worker check](verification/dynamic-api-2026-10-30.json). Their scopes
are explicitly distinguished from mocked/synthetic tests.

## 6. Validation

In this workspace the original venv refers to a missing Python installation.
Checks used Python 3.13 with isolated dependencies, without overwriting the venv:

```powershell
# From finn-backend
$env:PYTHONPATH='E:\enam_holding\tmp\dynamic-deps;E:\enam_holding\tmp\backend-deps;E:\enam_holding\tmp\pdf-deps'
C:/Python313/python.exe -m unittest discover -s tests -q
C:/Python313/python.exe verify_database.py
$env:FINN_POSTGRES_TESTS='1'
C:/Python313/python.exe -m unittest discover -s tests -p test_postgres_integration.py -v
Remove-Item Env:FINN_POSTGRES_TESTS
C:/Python313/python.exe verify_dynamic_source.py
C:/Python313/python.exe verify_dynamic_api.py
```

The normal suite passes 67 tests and skips eight opt-in PostgreSQL tests. The
separate PostgreSQL suite passes eight tests in its own migrated temporary schema,
including uniqueness, relations, rollback, search, import idempotency, original
citations, cache persistence/reuse, source-hash invalidation, job coalescing and
pinned retention. The 45 original regression tests remain passing.

```powershell
# From finn-frontend
npm.cmd test
npm.cmd run lint
$env:NEXT_PUBLIC_API_URL='https://api.finn.invalid/api'
npm.cmd run build
$env:FINN_CHROMIUM_PATH='C:/Users/DELL/AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'
node tests/dynamic-browser.mjs
```

For the isolated verification servers, set `FINN_UI_URL=http://127.0.0.1:3011`
before running the browser script; the API runs on port 8011.

Frontend unit tests: 20 passed. Lint and production build passed. Six browser
cases passed with no page errors. The build's
`.invalid` hostname is deliberately not a deployment. Browser results and
screenshots are recorded in [the browser evidence directory](verification/dynamic-browser/).
The in-app Browser reported no available browser, so checks used local isolated
Chromium via Playwright. Live company/document/research/citation paths use the
real API; outage and unknown-company checks explicitly use mocked responses.

Initial failures were investigated rather than ignored: broken baseline test
runner, hosted-pooler connection/schema behavior, issuer identity without
extractable logo text, theme hydration mismatch, and two incorrect browser
locators. The application now explicitly schema-qualifies ORM queries, preserves
server/client theme snapshots and uses a portable explicit test-file runner.

## 7. Files changed

- Backend: `app/database.py`, `models.py`, `seed.py`, `research_admin.py`,
  `research_schemas.py`, `worker.py`, `extract_worker.py`, `main.py`,
  `routers/dynamic_research.py`, `config/discovery_sources.json`.
- Services: `artifacts.py`, `company_registry.py`, `document_discovery.py`,
  `source_http.py`, `retrieval.py`, `evidence_research.py`, `financial_facts.py`, `jobs.py`.
- Migration/config: `alembic.ini`, `migrations/`, `requirements.txt`, `.env.example`,
  root `.gitignore`.
- Verification: five backend test modules, three `verify_*.py` scripts,
  frontend dynamic tests/browser runner and evidence records.
- Frontend: `DynamicResearch.js`, research page integration, API client,
  `dynamic-research.mjs`, portable test runner/package script and theme hydration.
- Documentation: README, audit, development log, implementation plan, architecture
  guide and this report.

Unrelated pre-existing uncommitted UI changes were preserved; they are not claimed
as new work in this report. The pinned manifest and original research service
were left unchanged. Credentials are not committed or printed.

## 8. Remaining limitations

- Explicit narrative financial figures, supported guidance/actual comparisons and
  QoQ/YoY calculations are implemented with source validation. General financial
  table layouts, implicit units and ambiguous rounded figures remain unsupported.
  The real ITC document provides two validated figures but no matching numerical
  guidance; no live successful variance comparison is claimed.
- Optional LLM adapter exists but no live provider verification is claimed without
  provider configuration. Dynamic research currently uses exact source excerpts.
- BSE registry ingestion/filing discovery, OCR and wider IR adapters are not
  implemented. NSE/IR public availability and source restrictions still apply.
- The filesystem storage adapter requires a persistent shared production volume;
  an object-store adapter, orphan-artifact reconciliation and OS-level parser
  memory isolation are not implemented.
- Discovery is bounded, not an exhaustive archive crawl. The application has
  global queue admission limits but no identity-based quotas or login.
- No public deployment, production load test, full clean dependency installation,
  or live external-model evaluation is claimed.

These mean the complete aspirational AI/financial-comparison specification is
not fully satisfied, despite the working database-backed discovery-to-evidence
workflow. They must remain visible in any submission claims.

## 9. Deployment steps

Use [the current setup guide](DYNAMIC_RESEARCH.md#deployment-and-remaining-work):
back up storage/database, configure a dedicated PostgreSQL schema/session pooler,
migrate/import, run API plus supervised worker with shared persistent storage,
set exact CORS and frontend HTTPS API base, then configure monitoring, backups
and explicit retention cleanup. No startup DDL or destructive migration is used.

## 10. Next highest-priority task

Expand the conservative financial extractor to handle financial-table layouts,
using reviewed real-source golden fixtures for units, accounting basis and fiscal
period matching. Narrative comparisons already work for supported explicit inputs;
a genuine source pair with numerical guidance and matching actuals is the next
priority for live verification.
