from pathlib import Path
import unittest
from unittest.mock import patch
from app.services.company_registry import parse_master
from app.services.document_discovery import listing_documents, period_from_label, exchange_documents, classify
from types import SimpleNamespace
from app.services.source_http import validate_url, SourceError


class DiscoveryTests(unittest.TestCase):
    def test_earnings_call_invitation_is_not_a_transcript(self):
        self.assertEqual(classify("Invitation for earnings call"), "corporate_announcement")
        self.assertEqual(classify("Earnings call transcript"), "earnings_call_transcript")
    def test_bad_attachment_does_not_hide_later_filings(self):
        company = SimpleNamespace(nse_symbol="TEST", company_name="Test Limited")
        rows = [{"symbol": "TEST", "attchmntFile": value, "desc": "Financial results"}
                for value in [None, "-", "https://evil.example/a.pdf", "https://nsearchives.nseindia.com/good.pdf"]]
        rows.append({"symbol": "OTHER", "attchmntFile": "https://nsearchives.nseindia.com/other.pdf"})
        docs = exchange_documents(rows, company, "https://www.nseindia.com/api/test")
        self.assertEqual(len(docs), 1)
        self.assertTrue(docs[0]["source_url"].endswith("good.pdf"))

    def test_annual_report_wrapper_and_issuer_identity(self):
        company = SimpleNamespace(nse_symbol="TEST", company_name="Test Limited")
        data = {"data": [{"companyName": name, "fromYr": "2025", "toYr": "2026",
                          "fileName": "https://nsearchives.nseindia.com/annual.pdf"} for name in ["Other Limited", "Test Ltd"]]}
        docs = exchange_documents(data, company, "https://www.nseindia.com/api/test", True)
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0]["reporting_period"], "2025-2026")
        self.assertEqual(docs[0]["document_type"], "annual_report")
    def test_registry_rejects_arbitrary_strings(self):
        with self.assertRaises(SourceError):
            parse_master(b"company\nfictional\n")
        records = parse_master(b"SYMBOL,NAME OF COMPANY,ISIN NUMBER\nITC,ITC Limited,INE154A01025\n")
        self.assertEqual(records[0]["nse_symbol"], "ITC")

    def test_links_use_published_label_without_inventing_dates(self):
        raw = b'<a href="/reports/result.pdf" data-cta-label="download-ITC Financial Result Q4 FY2025"></a><a href="https://evil.example/a.pdf">Other</a>'
        docs = listing_documents(raw, "https://itcportal.com/investors/quarterly-results.html", {"itcportal.com"})
        self.assertEqual(len(docs), 1)
        self.assertEqual(docs[0]["reporting_period"], "Q4 FY2025")
        self.assertIsNone(docs[0]["publication_date"])
        self.assertIsNone(period_from_label("Report with no date"))

    def test_ssrf_and_domain_confusion(self):
        for url in ["http://itcportal.com/a.pdf", "https://itcportal.com.evil/a.pdf", "https://u@itcportal.com/a.pdf",
                    "https://127.0.0.1/a.pdf", "https://itcportal.com:444/a.pdf"]:
            with self.assertRaises(SourceError):
                validate_url(url, {"itcportal.com"}, resolve=False)
        with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("127.0.0.1", 443))]):
            with self.assertRaises(SourceError):
                validate_url("https://itcportal.com/a.pdf", {"itcportal.com"})
