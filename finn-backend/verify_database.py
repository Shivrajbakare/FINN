"""Apply authorized additive migrations and verify repeatable legacy import."""
import json
from pathlib import Path
from dotenv import load_dotenv
from alembic import command
from alembic.config import Config
from sqlalchemy import select, func
from app.database import transaction, engine
from app.models import Company, Document, Citation
from app.seed import import_legacy


def verify():
    load_dotenv()
    command.upgrade(Config("alembic.ini"), "head")
    with transaction() as session:
        first = import_legacy(session)
    with transaction() as session:
        second = import_legacy(session)
        portfolio = session.scalar(select(func.count()).select_from(Company).where(Company.is_portfolio_company.is_(True)))
        pinned = session.scalar(select(func.count()).select_from(Document).where(Document.pinned.is_(True)))
        citations = session.scalar(select(func.count()).select_from(Citation).join(Document, Citation.document_id == Document.id)
                                   .where(Document.pinned.is_(True)))
        assert portfolio == 18 and pinned == 2
        assert citations >= 14
        assert len(second["verified_local_documents"]) == 2
    return {"status": "passed", "migration": "0001_research", "first_import": first,
            "second_import": second, "portfolio_count": portfolio, "pinned_count": pinned, "pinned_citations": citations}


if __name__ == "__main__":
    try:
        result = verify()
        Path("../docs/verification/database-2026-10-30.json").write_text(json.dumps(result, indent=2))
        print(json.dumps(result, indent=2))
    except Exception as exc:
        # Provider connection strings and raw error details must stay private.
        detail = str(exc).lower()
        categories = [name for name in ["password authentication failed", "could not translate host name", "timeout", "connection refused", "network is unreachable", "ssl", "tenant or user not found", "permission denied"] if name in detail]
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__, "categories": categories,
                          "message": "Database verification failed; check configuration, network and migration permissions."}))
        raise SystemExit(1)
