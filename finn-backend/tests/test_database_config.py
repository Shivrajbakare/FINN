import os
import unittest
from unittest.mock import patch
from app.database import database_settings, DatabaseUnavailable
from app.models import Base


class DatabaseConfigTests(unittest.TestCase):
    def test_missing_configuration_is_explicit(self):
        with patch.dict(os.environ, {"DATABASE_URL": ""}):
            with self.assertRaises(DatabaseUnavailable):
                database_settings()

    def test_hosted_url_preserves_tls_query(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgres://user:secret@db.example/db?sslmode=require"}):
            url, pool = database_settings()
            self.assertEqual(url.drivername, "postgresql+psycopg")
            self.assertEqual(url.query["sslmode"], "require")
            self.assertGreater(pool["pool_size"], 0)

    def test_invalid_configuration(self):
        for raw in ["sqlite:///db", "not a url", "postgresql:///missing-host"]:
            with patch.dict(os.environ, {"DATABASE_URL": raw}):
                with self.assertRaises(ValueError):
                    database_settings()
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://u:p@host/db", "DATABASE_POOL_SIZE": "0"}):
            with self.assertRaises(ValueError):
                database_settings()

    def test_relations_and_no_auth_without_identity(self):
        self.assertEqual(set(Base.metadata.tables), {"companies", "documents", "document_extractions",
            "research_snapshots", "research_citations", "research_jobs"})
        self.assertEqual(len(Base.metadata.tables["research_citations"].foreign_keys), 2)
