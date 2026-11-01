"""Opt-in real PostgreSQL tests. Each run uses an isolated temporary schema."""
import os
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from uuid import uuid4

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event, select, text, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import database_settings
from app.models import Company, Document, Snapshot, Citation, Extraction, now
from app.seed import import_legacy
from app.services.company_registry import search_companies, spelling_suggestions


@unittest.skipUnless(os.getenv("FINN_POSTGRES_TESTS") == "1", "Set FINN_POSTGRES_TESTS=1 for isolated hosted-PostgreSQL tests")
class PostgreSQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from dotenv import load_dotenv
        load_dotenv()
        url, _ = database_settings()
        cls.schema = "finn_test_" + uuid4().hex
        cls.engine = create_engine(url, connect_args={"connect_timeout": 15, "prepare_threshold": None},
                                   execution_options={"schema_translate_map": {None: cls.schema}})
        with cls.engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{cls.schema}"'))
        @event.listens_for(cls.engine, "checkout")
        def set_schema(connection, *_):
            with connection.cursor() as cursor:
                cursor.execute(f'SET search_path TO "{cls.schema}"')
            connection.commit()
        with cls.engine.begin() as connection:
            config = Config("alembic.ini")
            config.attributes["connection"] = connection
            command.upgrade(config, "head")

    @classmethod
    def tearDownClass(cls):
        assert cls.schema.startswith("finn_test_") and len(cls.schema) == 42
        with cls.engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{cls.schema}" CASCADE'))
            connection.execute(text('SET search_path TO public'))
        cls.engine.dispose()

    def setUp(self):
        self.session = Session(self.engine, expire_on_commit=False)
        self.session.begin()
        self.folder = TemporaryDirectory()
        self.environment = patch.dict(os.environ, {"DOCUMENT_STORAGE_DIR": self.folder.name})
        self.environment.start()

    def tearDown(self):
        self.session.rollback()
        self.session.close()
        self.environment.stop()
        self.folder.cleanup()

    def test_idempotent_import_preserves_provenance_and_citations(self):
        import_legacy(self.session)
        import_legacy(self.session)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Company)), 18)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Document)), 2)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Citation)), 14)
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Snapshot)), 2)
        self.assertEqual(self.session.get(Document, "infosys-q4-fy25-call").sha256,
                         "2e4ccd145dd8a746cfcf4ac3ba8b23ca2080f90da1072a8d6010b968abe37e4e")

    def test_company_uniqueness_and_rollback(self):
        row = dict(company_name="Test Ltd", normalized_name="test ltd", nse_symbol="TEST", exchange="NSE")
        self.session.add(Company(**row)); self.session.flush()
        with self.assertRaises(IntegrityError):
            with self.session.begin_nested():
                self.session.add(Company(**row)); self.session.flush()
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Company)), 1)
        self.session.rollback()
        self.assertEqual(self.session.scalar(select(func.count()).select_from(Company)), 0)

    def test_search_name_nse_bse_unknown_and_ambiguity(self):
        self.session.add_all([Company(company_name="Example Industries", normalized_name="example industries", nse_symbol="EXAMPLE", bse_code="500001", exchange="NSE"),
                              Company(company_name="Example Finance", normalized_name="example finance", nse_symbol="EXFIN", exchange="NSE")])
        self.session.flush()
        for query in ["EXAMPLE.NS", "500001", "Example Industries"]:
            rows, total = search_companies(self.session, query)
            self.assertEqual(total, 1)
            self.assertEqual(rows[0].nse_symbol, "EXAMPLE")
        self.assertEqual(search_companies(self.session, "example")[1], 2)
        self.assertEqual(search_companies(self.session, "nonexistent")[1], 0)
        self.assertEqual(len(search_companies(self.session, "example", 1, 1)[0]), 1)

    def test_document_foreign_key(self):
        with self.assertRaises(IntegrityError):
            with self.session.begin_nested():
                self.session.add(Document(company_id="missing", document_type="annual_report", document_title="Test",
                    source_url="https://itcportal.com/test.pdf", source_domain="itcportal.com", discovered_on="https://itcportal.com"))
                self.session.flush()

    def test_partial_symbols_punctuation_tokens_and_spelling_suggestions(self):
        self.session.add_all([
            Company(company_name="Mahindra & Mahindra Limited", normalized_name="mahindra mahindra limited", nse_symbol="M&M", exchange="NSE"),
            Company(company_name="Kotak Mahindra Bank Limited", normalized_name="kotak mahindra bank limited", nse_symbol="KOTAKBANK", exchange="NSE"),
            Company(company_name="Infosys Limited", normalized_name="infosys limited", nse_symbol="INFY", exchange="NSE")])
        self.session.flush()
        for query in ["Mahindra and Mahindra", "Mahindra & Mahindra", "M&M.NS"]:
            rows, total = search_companies(self.session, query)
            self.assertGreaterEqual(total, 1)
            self.assertIn("M&M", [row.nse_symbol for row in rows])
        self.assertEqual(search_companies(self.session, "kotak bank")[0][0].nse_symbol, "KOTAKBANK")
        self.assertEqual(search_companies(self.session, "INF")[0][0].nse_symbol, "INFY")
        self.assertEqual(search_companies(self.session, "???")[1], 0)
        self.assertEqual(search_companies(self.session, "mahindra")[1], 2)
        self.assertEqual(spelling_suggestions(self.session, "infosysx")[0].nse_symbol, "INFY")

    def test_snapshot_persistence_and_cache_reuse(self):
        from app.services.retrieval import read_extraction
        from app.services.evidence_research import generate
        from datetime import timedelta
        import_legacy(self.session)
        document = self.session.get(Document, "infosys-q4-fy25-call")
        company = self.session.get(Company, document.company_id)
        document.expires_at = now() + timedelta(hours=24)
        pages = read_extraction(self.session, document)
        first, _ = generate(self.session, company, document, pages, "cache")
        second, hit = generate(self.session, company, document, pages, "cache")
        self.assertTrue(hit)
        self.assertEqual(first.id, second.id)
        self.assertEqual(sum(len(section["claims"]) for section in second.snapshot_data["sections"]), 7)

    def test_retrieval_cache_changed_hash_and_citation_invalidation(self):
        from test_research import fixture
        from app.services.retrieval import retrieve
        from app.services.evidence_research import generate
        from datetime import timedelta
        spec, raw = fixture()
        company = Company(company_name="Infosys Limited", normalized_name="infosys limited", nse_symbol="INFY", exchange="NSE")
        self.session.add(company); self.session.flush()
        document = Document(company_id=company.id, document_type="earnings_call_transcript", document_title="Synthetic fixture",
            reporting_period="FY2025", source_url=spec.document.url, source_domain="www.infosys.com", discovered_on=spec.document.discovered_on)
        self.session.add(document); self.session.flush()
        with patch("app.services.retrieval.SourceClient.get", return_value=raw) as download:
            pages, origin = retrieve(self.session, company, document)
            self.assertEqual(origin, "network")
            first, _ = generate(self.session, company, document, pages, origin)
            pages2, origin2 = retrieve(self.session, company, document)
            self.assertEqual(origin2, "cache")
            self.assertEqual(pages, pages2)
            self.assertEqual(download.call_count, 1)
        document.expires_at = now() - timedelta(hours=1)
        with patch("app.services.retrieval.SourceClient.get", return_value=raw + b"\n"):
            retrieve(self.session, company, document)
        self.session.refresh(first)
        self.assertEqual(first.status, "superseded")

    def test_queue_idempotency_and_pinned_retention(self):
        from app.services.jobs import enqueue
        from app.research_admin import cleanup
        from app.services.artifacts import storage
        from datetime import timedelta
        import_legacy(self.session)
        document = self.session.get(Document, "infosys-q4-fy25-call")
        first = enqueue(self.session, document.company_id, document.id, "retrieve")
        second = enqueue(self.session, document.company_id, document.id, "retrieve")
        self.assertEqual(first.id, second.id)
        document.expires_at = now() - timedelta(days=100)
        cleanup(self.session, apply=True)
        self.assertTrue(storage().read(document.storage_key).startswith(b"%PDF"))

    def test_document_transaction_lock_releases_on_rollback(self):
        from app.services.jobs import lock_key
        key = lock_key("test-" + self.schema)
        with self.engine.connect() as owner, self.engine.connect() as contender:
            self.assertTrue(owner.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": key}))
            self.assertFalse(contender.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": key}))
            owner.rollback()
            self.assertTrue(contender.scalar(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": key}))
            contender.rollback()
