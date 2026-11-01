from types import SimpleNamespace
import unittest
from app.services.financial_facts import extract_facts, comparisons, financial_changes


class FinancialFactsTests(unittest.TestCase):
    def setUp(self):
        self.doc = SimpleNamespace(id="synthetic", document_title="Synthetic company results",
            reporting_period="FY2025", sha256="a" * 64, source_url="https://issuer.example/results.pdf")
        self.cover = "Standalone Financial Results for the year ended 31 March 2025."

    def test_explicit_pairs_and_basis_preserve_two_citations(self):
        pages = [self.cover, "For FY25, Gross Revenue and EBITDA from Continuing Operations stood at Rs. 100.25 crores and Rs. 20.50 crores respectively."]
        facts, claims = extract_facts(pages, self.doc)
        self.assertEqual([fact["value"] for fact in facts], ["100.25", "20.50"])
        self.assertEqual([fact["metric"] for fact in facts], ["gross_revenue", "ebitda"])
        for fact in facts:
            self.assertEqual(fact["basis"], "standalone")
            self.assertEqual(fact["period"], "FY2025")
            self.assertEqual(len(fact["evidence_ids"]), 2)
        for claim in claims:
            self.assertIn(claim["quote"], pages[claim["page"] - 1])

    def test_missing_units_period_or_ambiguous_basis_are_not_guessed(self):
        for sentence in ["Revenue was 100.", "Revenue stood at Rs. 100 crores.", "Revenue for FY25 was 100."]:
            self.assertEqual(extract_facts([self.cover, sentence], self.doc)[0], [])
        valid = "Revenue from Continuing Operations for FY25 was Rs. 100 crores."
        self.assertEqual(extract_facts(["Standalone Financial Results. Consolidated Financial Results.", valid], self.doc)[0], [])

    def test_deterministic_matching_guidance_actual_previous(self):
        pages = [self.cover, "Revenue from Continuing Operations for FY25 was INR 110 crores. "
                 "Revenue from Continuing Operations for FY25 is guided at INR 100 crores. "
                 "Revenue from Continuing Operations for FY24 was INR 90 crores."]
        facts, _ = extract_facts(pages, self.doc)
        result = comparisons(facts)
        self.assertEqual(result["status"], "available")
        row = result["rows"][0]
        self.assertEqual((row["actual"], row["guidance"], row["previous"]), ("110", "100", "90"))
        self.assertEqual(row["absolute_variance"], "10")
        self.assertEqual(row["percentage_variance"], "10.0")
        self.assertEqual(row["kind"], "derived_calculation")

    def test_currency_scope_period_and_ambiguity_block_comparison(self):
        actual = "Revenue from Continuing Operations for FY25 was INR 110 crores. "
        for guidance in ["Revenue from Continuing Operations for FY26 is guided at INR 100 crores.",
                         "Revenue from Continuing Operations for FY25 is guided at USD 100 crores.",
                         "Revenue from Discontinued Operations for FY25 is guided at INR 100 crores."]:
            facts, _ = extract_facts([self.cover, actual + guidance], self.doc)
            self.assertEqual(comparisons(facts)["rows"], [])
        facts, _ = extract_facts([self.cover, actual + "Revenue from Continuing Operations for FY25 was INR 111 crores."], self.doc)
        self.assertEqual(facts, [])

    def test_zero_target_and_percent_units(self):
        facts, _ = extract_facts([self.cover, "Operating margin for FY25 was 21% for continuing operations. "
            "Operating margin for FY25 is guided at 0% for continuing operations."], self.doc)
        row = comparisons(facts)["rows"][0]
        self.assertEqual(row["unit"], "percent")
        self.assertIsNone(row["percentage_variance"])

    def test_immediate_exceptional_item_qualification_is_retained(self):
        quote = "Profit After Tax from Discontinued Operations for FY25 stood at Rs. 15103.76 crores (previous year Rs. 511.74 crores), including an exceptional gain of Rs. 15163.06 crores."
        facts, claims = extract_facts([self.cover, quote], self.doc)
        self.assertEqual(facts[0]["scope"], "discontinued_operations")
        self.assertEqual(claims[0]["quote"], quote)
        self.assertEqual(comparisons(facts)["rows"], [])

    def test_quarter_boundary_yoy_and_qoq_are_computed_in_python(self):
        facts, _ = extract_facts([self.cover,
            "Revenue from Continuing Operations for Q1 FY25 was INR 120 crores. "
            "Revenue from Continuing Operations for Q4 FY24 was INR 100 crores. "
            "Revenue from Continuing Operations for Q1 FY24 was INR 80 crores."], self.doc)
        changes = financial_changes(facts)
        q1 = [change for change in changes if change["period"] == "Q1 FY2025"]
        self.assertEqual({row["change_type"]: row["percentage_change"] for row in q1}, {"YoY": "50.0", "QoQ": "20.0"})
        self.assertTrue(all(row["evidence_ids"] for row in q1))
