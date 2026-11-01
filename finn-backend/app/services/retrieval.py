from datetime import timedelta
from hashlib import sha256
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from app.models import Extraction, Snapshot, now
from app.services.artifacts import storage
from app.services.document_discovery import POLICIES, permitted_hosts, period_from_label
from app.services.research import DOCUMENTS, extract_pages
from app.services.source_http import SourceClient, SourceError

EXTRACTION_VERSION = "pages-v1"


def bounded_extract(raw):
    with TemporaryDirectory(prefix="finn-pdf-") as folder:
        source, destination = Path(folder) / "source.pdf", Path(folder) / "pages.json"
        source.write_bytes(raw)
        try:
            result = subprocess.run([sys.executable, "-m", "app.extract_worker", str(source), str(destination)],
                cwd=Path(__file__).resolve().parents[2], capture_output=True, timeout=40,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        except subprocess.TimeoutExpired as exc:
            raise SourceError("extraction_timeout", "PDF extraction exceeded its time limit.") from exc
        if result.returncode or not destination.exists():
            raise SourceError("extraction_failed", "PDF is invalid, encrypted, too complex or requires OCR; automatic OCR is not configured.")
        return json.loads(destination.read_text(encoding="utf-8"))


def read_extraction(session, document):
    extraction = session.scalar(select(Extraction).where(Extraction.document_id == document.id,
        Extraction.document_sha256 == document.sha256, Extraction.extraction_version == EXTRACTION_VERSION,
        Extraction.extraction_status == "ready"))
    if not extraction:
        return None
    raw = storage().read(extraction.extracted_text_reference)
    if sha256(raw).hexdigest() != extraction.artifact_sha256:
        raise ValueError("Extraction artifact checksum mismatch")
    payload = json.loads(raw)
    if payload["document_id"] != document.id or payload["sha256"] != document.sha256:
        raise ValueError("Extraction belongs to another document")
    return payload["pages"]


def retrieve(session, company, document, progress=lambda state: None):
    cached = False
    raw = None
    if document.storage_key and document.expires_at and document.expires_at > now():
        try:
            raw = storage().read(document.storage_key)
            if sha256(raw).hexdigest() != document.sha256:
                raise ValueError()
            pages = read_extraction(session, document)
            if pages:
                return pages, "cache"
            cached = True
        except (OSError, ValueError, KeyError):
            raw = None
    if raw is None:
        progress("downloading")
        with SourceClient(permitted_hosts(company, document)) as client:
            raw = client.get(document.source_url, types={"application/pdf"})
    progress("verifying")
    digest = sha256(raw).hexdigest()
    if document.pinned and digest != document.sha256:
        document.verification_status = "hash_mismatch"
        raise SourceError("hash_mismatch", "Pinned document hash changed; manual review is required. The original was retained.")
    progress("extracting")
    if document.pinned:
        # Legacy parser has strict page/identity/selector checks, kept unchanged.
        pages = bounded_extract(raw)
        spec = DOCUMENTS[document.id].document
        if len(pages) != spec.page_count or not all(marker in pages[spec.identity_page - 1] for marker in spec.identity_markers):
            raise SourceError("identity_mismatch", "Pinned document identity did not match the reviewed source.")
    else:
        pages = bounded_extract(raw)
        identity = " ".join(pages[:10]).lower()
        markers = POLICIES.get(company.nse_symbol, {}).get("identity_markers", [company.company_name])
        if not any(marker.lower() in identity for marker in markers):
            raise SourceError("identity_mismatch", "The PDF could not be matched to the selected company.")
        if not document.reporting_period:
            # Use an explicitly printed period, never the filing date as a proxy.
            document.reporting_period = period_from_label(" ".join(pages[:2]))
    if document.sha256 and digest != document.sha256:
        session.execute(update(Snapshot).where(Snapshot.document_id == document.id).values(status="superseded"))
        session.execute(update(Extraction).where(Extraction.document_id == document.id).values(extraction_status="superseded"))
    artifact = json.dumps({"document_id": document.id, "sha256": digest, "pages": pages}, ensure_ascii=False).encode()
    artifact_key = storage().write(artifact, "json")
    document.storage_key = storage().write(raw, "pdf")
    document.sha256, document.file_size = digest, len(raw)
    document.extraction_status = "ready"
    document.verification_status = "reviewed_hash" if document.pinned else "source_and_identity_verified"
    if not cached:
        document.retrieved_at = now()
        document.expires_at = document.retrieved_at + timedelta(hours=int(os.getenv("DOCUMENT_CACHE_HOURS", "24")))
    values = dict(extracted_text_reference=artifact_key, artifact_sha256=sha256(artifact).hexdigest(),
                  page_count=len(pages), extraction_status="ready", extracted_at=now())
    session.execute(insert(Extraction).values(document_id=document.id, document_sha256=digest,
        extraction_version=EXTRACTION_VERSION, **values).on_conflict_do_update(
        index_elements=[Extraction.document_id, Extraction.document_sha256, Extraction.extraction_version], set_=values))
    session.flush()
    return pages, "cache" if cached else "network"
