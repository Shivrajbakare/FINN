# Dynamic research implementation plan — 30 October 2026

## Baseline and preservation

Inspected backend configuration, manifest, services, routers, frontend research/API,
tests, environment examples, README, audit and development history. There are
existing uncommitted UI changes; preserve these. The original Python 3.11 venv
is broken on this machine. Python 3.13 with existing isolated dependencies passes
all 45 backend tests. Node 24 fails the existing directory-based test command;
replace it with explicit discovered test files. No PostgreSQL executable/service
or Docker is available. Database provisioning decision requested separately.

The current Research UI contains hardcoded financial comparisons unrelated to
the selected evidence. Remove these as part of the evidence-integrity change.
Keep original manifest bytes, legacy routes, cache files and seven excerpts per
Infosys document. No auth or user tables without a real identity system.

## Ordered phases and gates

1. Add synchronous SQLAlchemy 2 / psycopg configuration, five core entities,
   citation relationships, durable job records, explicit Alembic migration and
   tests. Sync routes/workers keep database operations off the async event loop.
   Missing database disables only new database-dependent routes with 503.
2. Idempotent transactional import of the 18 portfolio companies and both pinned
   document IDs, reviewed selectors and verified cached artifacts. Compare all
   immutable provenance fields; never overwrite conflicts or delete legacy files.
3. Official NSE master import/search with limits and ambiguous result lists.
   Primary-source adapters use explicit issuer/source policies, robots checks,
   bounded public requests, no anti-bot bypass. Unknown sources are unavailable.
4. Durable database job queue and lightweight polling worker; per-document
   PostgreSQL locks; bounded retrieval and isolated PDF parsing; content-addressed
   storage abstraction; pinned hash protection; expiration and cleanup commands.
5. Section-aware evidence selection, provider-independent structured selection
   interface, exact quote validation, persisted snapshots and citations. Missing
   comparisons remain insufficient evidence; deterministic validated calculations.
   Cache identity includes company/document/hash/period/template/extraction.
6. Add dynamic search/discovery/retrieval/snapshot panel within existing research
   shell. Preserve historical selector and localStorage settings. Show actual job
   states, errors, retry, provenance and expandable citations.
7. Run regression, PostgreSQL migration/import/integration, real additional issuer
   discovery/download/cache checks, frontend tests/lint/build and browser checks.
   Record commands and failures honestly; update setup/audit/development docs.

## Operational boundaries

PostgreSQL stores metadata/snapshots/jobs; local filesystem stores PDFs and page
JSON behind a storage interface. Production needs a persistent mounted volume
or a storage adapter. No Redis, vector database, login or new microservices.
Public source support is adapter-based, not an assertion that every issuer can
be fetched. Optional model provider requires configuration; deterministic
extractive research remains available and explicitly labeled.
