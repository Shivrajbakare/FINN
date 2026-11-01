"""Explicit registry refresh and retention; never run DDL at app startup."""
import argparse
from datetime import timedelta
import json
import os
from sqlalchemy import select, text, update
from dotenv import load_dotenv
from app.database import transaction
from app.models import Document, Extraction, Snapshot, now
from app.services.artifacts import storage
from app.services.company_registry import refresh_registry
from app.services.jobs import lock_key


def cleanup(session, apply=False):
    cutoff = now() - timedelta(days=int(os.getenv("DOCUMENT_RETENTION_DAYS", "30")))
    documents = session.scalars(select(Document).where(Document.pinned.is_(False), Document.expires_at < cutoff)).all()
    pinned_hashes = set(session.scalars(select(Document.sha256).where(Document.pinned.is_(True))).all())
    candidates = []
    for document in documents:
        if not session.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": lock_key(document.id)}):
            continue
        keys = [document.storage_key] if document.storage_key else []
        extractions = session.scalars(select(Extraction).where(Extraction.document_id == document.id)).all()
        keys += [item.extracted_text_reference for item in extractions]
        keys += [item.document_sha256 + ".pdf" for item in extractions]
        for key in set(keys):
            if key.split(".")[0] in pinned_hashes:
                continue
            # Do not remove shared artifacts, especially a pinned PDF.
            shared_pdf = session.scalar(select(Document.id).where(Document.storage_key == key, Document.id != document.id))
            shared_text = session.scalar(select(Extraction.id).where(Extraction.extracted_text_reference == key,
                Extraction.document_id != document.id))
            if shared_pdf or shared_text:
                continue
            candidates.append(key)
            if apply:
                storage().delete(key)
        if apply:
            document.storage_key, document.extraction_status = None, "expired"
            for extraction in extractions:
                extraction.extraction_status = "expired"
            session.execute(update(Snapshot).where(Snapshot.document_id == document.id).values(status="expired"))
    return {"mode": "apply" if apply else "dry_run", "artifacts": candidates, "pinned_documents": "retained"}


if __name__ == "__main__":
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["refresh-registry", "cleanup"])
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with transaction() as session:
        result = refresh_registry(session) if args.command == "refresh-registry" else cleanup(session, args.apply)
    print(json.dumps(result, indent=2))
