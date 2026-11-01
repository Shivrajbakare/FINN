from datetime import timedelta
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.main import app
from app.models import now
from app.services.artifacts import FileStorage
from app.services.evidence_research import (EvidenceChoice, ExtractiveProvider, candidates_from_pages,
    validated_claims, cache_identity, ComparableValue, calculate_variance)
from app.services.retrieval import bounded_extract
from app.services.source_http import SourceError
from test_research import fixture


class DynamicResearchTests(unittest.TestCase):
    def setUp(self):
        self.document = SimpleNamespace(id="doc1", company_id="company1", document_title="Synthetic fixture",
            reporting_period="FY2025", sha256="a" * 64, source_url="https://itcportal.com/test.pdf")
        self.pages = ["The business offers products and services to customers across several international geographic markets. "
                      "Revenue increased with strong operating profit and improved margins during the reporting period. "
                      "Management expects demand to remain resilient but guidance remains subject to uncertainty and risks."]

    def test_claims_are_exact_page_evidence(self):
        candidates = candidates_from_pages(self.pages)
        choice = ExtractiveProvider().choose(candidates)
        claims = validated_claims(choice, candidates, self.pages, self.document)
        self.assertTrue(claims)
        for claim in claims:
            self.assertIn(claim["quote"], self.pages[claim["page"] - 1])
            self.assertEqual(claim["document_id"], "doc1")

    def test_model_cannot_invent_claims_ids_or_duplicate_quotes(self):
        candidates = candidates_from_pages(self.pages)
        with self.assertRaises(ValueError):
            validated_claims(EvidenceChoice(evidence_ids=["invented"]), candidates, self.pages, self.document)
        with self.assertRaises(ValidationError):
            EvidenceChoice.model_validate({"evidence_ids": [], "revenue": 999})
        identifier = candidates[0]["id"]
        with self.assertRaises(ValueError):
            validated_claims(EvidenceChoice(evidence_ids=[identifier, identifier]), candidates, self.pages, self.document)

    def test_missing_evidence_stays_empty(self):
        self.assertEqual(candidates_from_pages(["No evidence."]), [])

    def test_cache_separates_all_identity_dimensions(self):
        company = SimpleNamespace(id="company1")
        original = cache_identity(company, self.document, "v1")
        for field in ["id", "sha256", "reporting_period"]:
            previous = getattr(self.document, field)
            setattr(self.document, field, "different")
            self.assertNotEqual(cache_identity(company, self.document, "v1"), original)
            setattr(self.document, field, previous)
        self.assertNotEqual(cache_identity(SimpleNamespace(id="other"), self.document, "v1"), original)
        self.assertNotEqual(cache_identity(company, self.document, "v2"), original)

    def test_calculations_require_same_period_units_and_basis(self):
        common = dict(metric="revenue", unit="INR crore", basis="consolidated", period="FY2025", evidence_id="quote")
        actual, guidance = ComparableValue(value="110", **common), ComparableValue(value="100", **common)
        self.assertEqual(calculate_variance(actual, guidance), {"absolute_variance": "10", "percentage_variance": "10.0"})
        with self.assertRaises(ValueError):
            calculate_variance(actual, guidance.model_copy(update={"period": "FY2024"}))
        with self.assertRaises(ValidationError):
            ComparableValue(value="NaN", **common)
        self.assertIsNone(calculate_variance(actual, guidance.model_copy(update={"value": Decimal(0)}))["percentage_variance"])

    def test_storage_detects_tampering_and_rejects_path_traversal(self):
        with TemporaryDirectory() as root:
            store = FileStorage(root)
            key = store.write(b"document", "pdf")
            self.assertEqual(store.read(key), b"document")
            store.path(key).write_bytes(b"tampered")
            with self.assertRaises(ValueError): store.read(key)
            with self.assertRaises(ValueError): store.read("../secret")

    def test_isolated_parser_valid_and_invalid_documents(self):
        _, raw = fixture()
        pages = bounded_extract(raw)
        self.assertEqual(len(pages), 27)
        for invalid in [b"", b"<html>error</html>", b"%PDF-invalid"]:
            with self.assertRaises(SourceError): bounded_extract(invalid)

    def test_missing_database_is_503_and_legacy_catalog_still_works(self):
        from app.database import close_database
        close_database()
        with patch.dict(os.environ, {"DATABASE_URL": ""}):
            with TestClient(app) as client:
                self.assertEqual(client.get("/api/research/v2/companies?q=ITC").status_code, 503)
                self.assertEqual(client.get("/api/research/companies").status_code, 200)
