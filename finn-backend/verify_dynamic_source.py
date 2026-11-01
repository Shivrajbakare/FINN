"""Genuine official source check, separately labeled from database integration."""
from hashlib import sha256
import json
from pathlib import Path
from types import SimpleNamespace

from app.models import now
from app.services.company_registry import MASTER_URL, parse_master
from app.services.document_discovery import listing_documents, POLICIES
from app.services.source_http import SourceClient
from app.services.retrieval import bounded_extract
from app.services.evidence_research import candidates_from_pages, ExtractiveProvider, validated_claims
from app.services.artifacts import storage


def verify():
    with SourceClient({"nsearchives.nseindia.com"}) as client:
        registry = parse_master(client.get(MASTER_URL, 3_000_000))
    company = next(row for row in registry if row["nse_symbol"] == "ITC")
    policy = POLICIES["ITC"]
    listing = policy["listing_urls"][0]
    with SourceClient(policy["hosts"]) as client:
        documents = listing_documents(client.get(listing, 3_000_000, {"text/html"}), listing, policy["hosts"])
        document = next(doc for doc in documents if "press release" in doc["document_title"].lower()
                        and "Q4" in (doc["reporting_period"] or "") and "2025" in doc["reporting_period"])
        raw = client.get(document["source_url"], types={"application/pdf"})
    pages = bounded_extract(raw)
    key = storage().write(raw, "pdf")
    storage().write(json.dumps({"pages": pages}).encode(), "json")
    assert any(marker.lower() in " ".join(pages[:10]).lower() for marker in policy["identity_markers"]), "Issuer identity not found in first ten pages"
    digest = sha256(raw).hexdigest()
    record = SimpleNamespace(**document, id=sha256(document["source_url"].encode()).hexdigest(), sha256=digest)
    candidates = candidates_from_pages(pages)
    claims = validated_claims(ExtractiveProvider().choose(candidates), candidates, pages, record)
    assert any(claim["section"] == "performance" for claim in claims), "No validated financial performance excerpts selected"
    key = storage().write(raw, "pdf")
    assert storage().read(key) == raw
    page_artifact = storage().write(json.dumps({"pages": pages}).encode(), "json")
    return {"status": "passed", "scope": "live official registry, listing discovery, download, page extraction, exact evidence and artifact cache; not PostgreSQL persistence",
        "verified_at": now().isoformat(), "company": company, "registry_source": MASTER_URL,
        "documents_discovered": len(documents), "document": document, "sha256": digest,
        "bytes": len(raw), "page_count": len(pages), "claims": claims, "cached_artifact_reverified": True}


if __name__ == "__main__":
    try:
        result = verify()
        Path("../docs/verification/dynamic-source-2026-10-30.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps({key: value for key, value in result.items() if key != "claims"}, indent=2))
    except Exception as exc:
        print(json.dumps({"status": "failed", "type": type(exc).__name__, "message": str(exc)}))
        raise SystemExit(1)
