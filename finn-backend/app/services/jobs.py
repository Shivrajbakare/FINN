"""Durable lightweight queue; one worker process can safely coexist with others."""
import asyncio
from datetime import timedelta
from hashlib import sha256
import logging
import time
import traceback

from sqlalchemy import select, text, func, update
from sqlalchemy.exc import SQLAlchemyError

from app.database import engine, transaction
from app.models import Company, Document, Job, now
from app.services.source_http import SourceError

logger = logging.getLogger(__name__)
ACTIVE = ("queued", "searching_sources", "downloading", "verifying", "extracting", "preparing_research")


def lock_key(value):
    return int.from_bytes(sha256(("finn-research-v2:" + value).encode()).digest()[:8], "big", signed=True)


def enqueue(session, company_id, document_id, kind):
    # Serializes rate-limit/idempotency decisions across API processes.
    session.execute(text("SELECT pg_advisory_xact_lock(16204732)"))
    existing = session.scalar(select(Job).where(Job.company_id == company_id, Job.document_id == document_id,
        Job.kind == kind, Job.status.in_(ACTIVE)).order_by(Job.created_at.desc()))
    if existing:
        return existing
    pending = session.scalar(select(func.count()).select_from(Job).where(Job.status.in_(ACTIVE)))
    recent = session.scalar(select(func.count()).select_from(Job).where(Job.created_at > now() - timedelta(minutes=1)))
    issuer_recent = session.scalar(select(func.count()).select_from(Job).where(Job.company_id == company_id,
        Job.created_at > now() - timedelta(minutes=1)))
    if pending >= 30 or recent >= 20 or issuer_recent >= 5:
        raise SourceError("rate_limited", "Research queue limit reached. Retry in a minute.")
    job = Job(company_id=company_id, document_id=document_id, kind=kind, status="queued")
    session.add(job)
    session.flush()
    return job


def progress(job_id, status):
    with transaction() as session:
        session.execute(update(Job).where(Job.id == job_id).values(status=status, updated_at=now()))


def run_one():
    from app.services.document_discovery import discover, save_discovered
    from app.services.retrieval import retrieve
    from app.services.evidence_research import generate
    # A dedicated read-only transaction owns the lock for this bounded job.
    # Transaction locks release automatically on disconnect/rollback, including
    # through hosted poolers. Metadata/progress use separate short transactions.
    with engine().connect() as connection:
        with transaction() as session:
            candidates = session.scalars(select(Job).where(Job.status.in_(ACTIVE)).order_by(Job.created_at)
                .with_for_update(skip_locked=True).limit(30)).all()
            job = None
            for candidate in candidates:
                key = lock_key(candidate.document_id or "company:" + candidate.company_id)
                acquired = connection.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": key})
                if acquired:
                    job = candidate
                    break
            if job is None:
                return False
            job_id, company_id, document_id, kind = job.id, job.company_id, job.document_id, job.kind
            job.started_at = now()
            job.status = "searching_sources" if kind == "discover" else "downloading"
        try:
            with transaction() as session:
                company = session.get(Company, company_id)
                document = session.get(Document, document_id) if document_id else None
                # Detach, then release connection before network / parsing.
                session.expunge_all()
            if kind == "registry":
                from app.services.company_registry import refresh_registry
                with transaction() as session:
                    result = refresh_registry(session)
            elif kind == "discover":
                documents, issues = discover(company)
                with transaction() as session:
                    save_discovered(session, company, documents)
                result = {"documents_found": len(documents), "issues": issues,
                          "discovery_status": "found" if documents else "no_matching_documents"}
            else:
                # Retrieval writes metadata only after validated bytes exist.
                with transaction() as session:
                    # Session is lazy; retrieval's initial cache lookup is small.
                    document = session.merge(document)
                    pages, retrieval = retrieve(session, company, document, lambda state: progress(job_id, state))
                result = {"document_id": document_id, "retrieval": retrieval}
                if kind == "research":
                    progress(job_id, "preparing_research")
                    with transaction() as session:
                        document = session.get(Document, document_id)
                        snapshot, cache_hit = generate(session, company, document, pages, retrieval)
                        result.update(snapshot_id=snapshot.id, cache_hit=cache_hit)
            with transaction() as session:
                job = session.get(Job, job_id)
                job.status, job.result, job.finished_at = "ready", result, now()
                job.message, job.error_code = None, None
        except Exception as exc:
            code = exc.code if isinstance(exc, SourceError) else "processing_failed"
            message = str(exc) if isinstance(exc, SourceError) else "Research processing failed. Retry later or check the worker configuration."
            frames = traceback.extract_tb(exc.__traceback__)
            logger.warning("Research job failed: %s (%s, %s:%s)", code, type(exc).__name__,
                           frames[-1].name if frames else "unknown", frames[-1].lineno if frames else 0)
            original = getattr(exc, "orig", None)
            if original is not None:
                logger.warning("Database diagnostic: SQLSTATE=%s primary=%s", getattr(original, "sqlstate", None),
                               getattr(getattr(original, "diag", None), "message_primary", None))
            with transaction() as session:
                job = session.get(Job, job_id)
                job.status, job.error_code, job.message, job.finished_at = "failed", code, message, now()
                if document_id:
                    doc = session.get(Document, document_id)
                    if code == "hash_mismatch":
                        doc.verification_status = "hash_mismatch"
                    if kind == "retrieve":
                        doc.extraction_status = "failed"
        finally:
            connection.rollback()
    return True


def worker():
    while True:
        try:
            if not run_one():
                time.sleep(2)
        except SQLAlchemyError:
            logger.warning("Research database unavailable; worker will retry.")
            time.sleep(5)


_worker_task = None


async def _worker_loop():
    from app.database import DatabaseUnavailable
    logger.info("Dynamic research background worker loop started.")
    while True:
        try:
            found = await asyncio.to_thread(run_one)
            if not found:
                await asyncio.sleep(1.5)
        except asyncio.CancelledError:
            break
        except (DatabaseUnavailable, SQLAlchemyError):
            logger.debug("Database unavailable for background worker; will retry.")
            await asyncio.sleep(5.0)
        except Exception as exc:
            logger.warning("Dynamic research worker exception: %s", exc)
            await asyncio.sleep(3.0)
    logger.info("Dynamic research background worker loop stopped.")


async def start_job_worker():
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_worker_loop())


async def stop_job_worker():
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
    _worker_task = None
