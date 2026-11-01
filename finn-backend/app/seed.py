"""Idempotent legacy import. Run explicitly after `alembic upgrade head`."""
from datetime import datetime, timedelta
from hashlib import sha256
import json
import re
from urllib.parse import urlsplit

from dotenv import load_dotenv
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert

from app.config.portfolio import PORTFOLIO
from app.database import transaction
from app.models import Company, Document, Extraction
from app.services import research as legacy
from app.services.artifacts import storage


def normalize_name(value):
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def import_legacy(session):
    session.execute(text("SELECT pg_advisory_xact_lock(16204731)"))
    for item in PORTFOLIO:
        session.execute(insert(Company).values(id="nse-" + item.ticker.split(".")[0].lower(),
            company_name=item.name, normalized_name=normalize_name(item.name),
            nse_symbol=item.ticker.split(".")[0], exchange="NSE", sector=item.sector,
            is_portfolio_company=True, registry_source="app/config/portfolio.py")
            .on_conflict_do_update(index_elements=[Company.nse_symbol], set_={"is_portfolio_company": True}))
    verified = []
    for spec in legacy.MANIFEST.companies:
        source = spec.document
        company = session.scalar(select(Company).where(Company.nse_symbol == spec.ticker.split(".")[0]))
        immutable = dict(company_id=company.id, source_url=source.url, sha256=source.sha256,
                         reporting_period=spec.period, document_title=source.title, document_type=source.type)
        document = session.get(Document, source.id)
        if document:
            if any(getattr(document, key) != value for key, value in immutable.items()):
                raise ValueError("Pinned document provenance conflicts with existing database record")
        else:
            document = Document(id=source.id, **immutable, source_domain=urlsplit(source.url).hostname,
                discovered_on=source.discovered_on, discovery_label=source.title, pinned=True,
                provenance={"manifest_version": legacy.MANIFEST.version, "spec": spec.model_dump(),
                            "event_date": source.event_date}, verification_status="reviewed_hash")
            session.add(document)
            session.flush()
        path = legacy.cache_directory() / f"{source.sha256}.pdf"
        if not path.exists():
            continue  # metadata import is valid without pretending bytes exist
        raw = path.read_bytes()
        pages = legacy.extract_pages(raw, source)
        metadata = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        if metadata.get("url") != source.url or metadata.get("sha256") != source.sha256:
            raise ValueError("Legacy cache metadata does not match the pinned source")
        retrieved_at = datetime.fromisoformat(metadata["retrieved_at"])
        if retrieved_at.tzinfo is None:
            raise ValueError("Legacy retrieval timestamp must be timezone-aware")
        document.storage_key = storage().write(raw, "pdf")
        document.file_size = len(raw)
        document.retrieved_at = retrieved_at
        document.expires_at = retrieved_at + timedelta(hours=24)
        document.extraction_status = "ready"
        artifact = json.dumps({"document_id": document.id, "sha256": source.sha256,
                               "pages": pages}, ensure_ascii=False).encode()
        key = storage().write(artifact, "json")
        session.execute(insert(Extraction).values(document_id=document.id, document_sha256=source.sha256,
            extraction_version="pages-v1", extracted_text_reference=key, artifact_sha256=sha256(artifact).hexdigest(),
            page_count=len(pages), extraction_status="ready").on_conflict_do_nothing())
        # Import the exact reviewed claims and page citations as a historical
        # snapshot too. Do not duplicate expired imported snapshots on reruns.
        from app.models import Snapshot
        from app.services.evidence_research import generate
        if not session.scalar(select(Snapshot.id).where(Snapshot.document_id == document.id).limit(1)):
            generate(session, company, document, pages, "cache")
        verified.append(source.id)
    session.flush()
    return {"portfolio_companies": 18, "pinned_documents": 2, "verified_local_documents": verified}


if __name__ == "__main__":
    load_dotenv()
    with transaction() as session:
        result = import_legacy(session)
    print(json.dumps(result, indent=2))
