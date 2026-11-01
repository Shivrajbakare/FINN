"""Real hosted PostgreSQL + genuine source + FastAPI/worker integration."""
import json
from pathlib import Path
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from sqlalchemy import select, func

from app.main import app
from app.database import transaction
from app.models import Citation, Company, Document, now
from app.services.jobs import run_one


def run_job(client, path):
    response = client.post(path)
    assert response.status_code == 202, response.text
    identifier = response.json()["id"]
    for _ in range(40):
        run_one()
        job = client.get(f"/api/research/v2/jobs/{identifier}").json()
        if job["status"] == "ready":
            return job
        assert job["status"] != "failed", job
    raise AssertionError("Job did not complete")


def verify():
    load_dotenv()
    with TestClient(app) as client:
        print("Checking registry", flush=True)
        registry = run_job(client, "/api/research/v2/registry-refresh")
        results = client.get("/api/research/v2/companies", params={"q": "ITC"}).json()
        company = next(row for row in results["companies"] if row["nse_symbol"] == "ITC")
        assert not company["is_portfolio_company"]
        print("Discovering official documents", flush=True)
        discovery = run_job(client, f"/api/research/v2/companies/{company['id']}/discover")
        docs = client.get(f"/api/research/v2/companies/{company['id']}/documents", params={"limit": 200}).json()
        document = next(doc for doc in docs if "press release" in doc["document_title"].lower()
            and "Q4" in (doc["reporting_period"] or "") and "2025" in doc["reporting_period"])
        print("Retrieving and generating research", flush=True)
        job = run_job(client, f"/api/research/v2/documents/{document['id']}/research")
        snapshot = client.get(f"/api/research/v2/snapshots/{job['result']['snapshot_id']}").json()
        claims = [claim for section in snapshot["snapshot_data"]["sections"] for claim in section["claims"]]
        assert claims and any(claim["section"] == "performance" for claim in claims)
        facts = snapshot["snapshot_data"]["financial_facts"]
        assert any(fact["metric"] == "gross_revenue" and fact["value"] == "73464.55" for fact in facts)
        assert any(fact["metric"] == "ebitda" and fact["value"] == "24024.83" for fact in facts)
        assert snapshot["snapshot_data"]["comparison"]["status"] == "insufficient_evidence"
        repeat = run_job(client, f"/api/research/v2/documents/{document['id']}/research")
        assert repeat["result"]["cache_hit"], "Repeated research missed snapshot cache"
        assert repeat["result"]["retrieval"] == "cache"
        assert repeat["result"]["snapshot_id"] == snapshot["id"], "Repeated research returned a different snapshot"
        with transaction() as session:
            citations = session.scalar(select(func.count()).select_from(Citation).where(Citation.snapshot_id == snapshot["id"]))
            portfolio = session.scalar(select(func.count()).select_from(Company).where(Company.is_portfolio_company.is_(True)))
            assert citations == len(claims) and portfolio == 18, f"Persistence counts: {citations} citations, {len(claims)} claims, {portfolio} portfolio companies"
        return {"status": "passed", "verified_at": now().isoformat(), "registry": registry["result"],
            "company": company, "discovery": discovery["result"], "document_id": document["id"],
            "snapshot": snapshot, "citations_persisted": citations, "second_request": repeat["result"],
            "portfolio_count": portfolio}


if __name__ == "__main__":
    try:
        result = verify()
        Path("../docs/verification/dynamic-api-2026-10-30.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps({key: value for key, value in result.items() if key != "snapshot"}, indent=2))
    except Exception as exc:
        print(json.dumps({"status": "failed", "error_type": type(exc).__name__,
            "message": str(exc) if isinstance(exc, AssertionError) else "Integration failed; inspect safe job errors."}))
        raise SystemExit(1)
