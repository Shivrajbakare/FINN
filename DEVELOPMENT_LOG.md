0

## 2026-10-30 — Dynamic PostgreSQL research verification

Implemented PostgreSQL persistence, Alembic migration, idempotent legacy import,
official NSE company search, bounded document discovery, on-demand PDF retrieval,
durable jobs, cited snapshots, history and the dynamic research UI. Preserved the
18-company portfolio and two pinned Infosys documents with 14 original citations.
Conservative narrative financial facts and compatible-input guidance/actual and
QoQ/YoY calculations are implemented; fabricated comparison values were removed.

Verification: 67 normal backend tests passed (eight opt-in tests skipped); the
separate hosted PostgreSQL suite passed all eight tests. All 20 frontend tests,
lint and production build passed. Six mobile/desktop browser cases passed with
no page errors. Live evidence includes 2,618 NSE records and ITC's official Q4
FY2025 press release, verified bytes, page citations and snapshot cache reuse.
Outage and unknown-company browser checks use explicitly mocked responses.

Database records are stored in the hosted PostgreSQL configured by DATABASE_URL
in finn-backend/.env. PDF/extraction artifacts default to
finn-backend/data/documents. Credentials are not printed or committed.

Limitations: OCR, BSE discovery, general financial-table parsing, object storage,
and live optional LLM verification remain outstanding. No public deployment or
production load test is claimed. See docs/IMPLEMENTATION_REPORT.md and
 docs/DYNAMIC_RESEARCH.md for current scope, evidence and setup instructions.

Final rerun: hosted database migration/import preserved 18 portfolio companies,
two pinned documents and 14 citations. The live API check passed at
2026-10-30T15:48:15Z with 11 ITC citations and identical cached snapshot reuse.
An intermediate assertion failure occurred while old/new worker versions were
running; after restarting with current code, the full check passed. The initial
failure did not identify its assertion, so a specific root cause is not claimed.
