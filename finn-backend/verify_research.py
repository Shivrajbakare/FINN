"""Explicit live check: real primary-source download, extraction and API response.

Run separately from the offline suite. --fresh uses a new isolated cache so the
first request MUST contact the source. Network failure exits nonzero.
"""
import argparse
from contextlib import nullcontext
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient
from app.main import app


def verify(fresh=False, output=None, document_id=None):
    original_cache = os.environ.get("RESEARCH_CACHE_DIR")
    with TemporaryDirectory(prefix="finn-research-live-") if fresh else nullcontext() as directory:
        if fresh:
            os.environ["RESEARCH_CACHE_DIR"] = directory
        try:
            with TestClient(app) as client:
                params = {"document_id": document_id} if document_id else {}
                response = client.get("/api/research/INFY", params=params)
                response.raise_for_status()
                snapshot = response.json()
                assert snapshot["status"] == "available", snapshot["issues"]
                document = snapshot["documents"][0]
                if document_id:
                    assert document["id"] == document_id
                if fresh:
                    assert document["retrieval"] == "network"
                claims = [c for section in snapshot["sections"] for c in section["claims"]]
                assert len(claims) == 7
                assert all(c["evidence"]["document_sha256"] == document["sha256"] for c in claims)
                cached = client.get("/api/research/INFY", params=params).json()
                assert cached["status"] == "available"
                assert cached["documents"][0]["retrieval"] == "cache"
                assert cached["documents"][0]["retrieved_at"] == document["retrieved_at"]
                evidence = {"status": snapshot["status"], "ticker": snapshot["ticker"], "document": document,
                    "claims": [{"id": c["id"], "kind": c["kind"], "page": c["evidence"]["page"]} for c in claims],
                    "second_request": "verified cache", "checked_at": snapshot["generated_at"]}
                if output:
                    Path(output).write_text(json.dumps(evidence, indent=2), encoding="utf-8")
                print(json.dumps(evidence, indent=2))
        finally:
            if original_cache is None:
                os.environ.pop("RESEARCH_CACHE_DIR", None)
            else:
                os.environ["RESEARCH_CACHE_DIR"] = original_cache


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fresh", action="store_true")
    parser.add_argument("--output")
    parser.add_argument("--document-id")
    args = parser.parse_args()
    verify(args.fresh, args.output, args.document_id)
