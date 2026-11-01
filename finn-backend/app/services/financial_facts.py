"""Conservative deterministic extraction of explicit financial statements.

These grammars do not infer table columns, missing units or accounting basis.
Unsupported layouts remain evidence excerpts, never synthetic financial cells.
"""
from decimal import Decimal
from hashlib import sha256
import re

METRICS = {"gross revenue": "gross_revenue", "revenue": "revenue", "revenue from operations": "revenue_from_operations",
           "ebitda": "ebitda", "operating profit": "operating_profit", "profit before tax": "pbt",
           "pbt": "pbt", "profit after tax": "pat", "pat": "pat", "operating margin": "operating_margin"}
NUMBER = r"(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?"
MONEY = rf"(?P<currency>Rs\.|INR|₹|USD|US\$)\s*(?P<value>{NUMBER})\s*(?P<unit>crores?|millions?|billions?)"
METRIC = r"Gross Revenue|Revenue from operations|Revenue|EBITDA|Operating profit|Profit Before Tax|PBT|Profit After Tax|PAT|Operating margin"
PERIOD = r"(?:Q[1-4]\s+)?FY\s*(?:20\d{2}|\d{2})"


def amount(value):
    parsed = Decimal(value.replace(",", ""))
    if not parsed.is_finite() or parsed < 0:
        raise ValueError("Unsupported financial value")
    return str(parsed)


def period(value):
    match = re.fullmatch(r"(?:(Q[1-4])\s+)?FY\s*(20\d{2}|\d{2})", value, re.I)
    if not match:
        raise ValueError("Unsupported fiscal period")
    quarter, year = match.groups()
    return (quarter.upper() + " " if quarter else "") + "FY" + ("20" + year if len(year) == 2 else year)


def previous_period(value, year_over_year=False):
    if value.startswith("Q"):
        quarter, year = int(value[1]), int(value[-4:])
        if year_over_year:
            return f"Q{quarter} FY{year - 1}"
        return f"Q{quarter - 1} FY{year}" if quarter > 1 else f"Q4 FY{year - 1}"
    return "FY" + str(int(value[2:]) - 1)


def basis_evidence(pages):
    # A document covering both bases cannot supply a global basis for a figure.
    matches = []
    for number, text in enumerate(pages[:2], 1):
        for match in re.finditer(r"\b(Standalone|Consolidated) Financial (?:Results|Statements)\b[^.!?]{0,100}", text, re.I):
            matches.append((match.group(1).lower(), number, match.group(0)))
    return matches[0] if matches and len({item[0] for item in matches}) == 1 else None


def extract_facts(pages, document):
    facts, evidence = [], {}
    basis = basis_evidence(pages)
    if basis is None:
        return [], []

    def citation(page, quote, kind):
        identifier = "financial-" + sha256(f"{document.id}:{page}:{quote}".encode()).hexdigest()[:20]
        evidence[identifier] = dict(id=identifier, section="guidance" if kind == "management_guidance" else "performance", page=page, quote=quote, text=quote,
            kind=kind, document_id=document.id, document_title=document.document_title,
            reporting_period=document.reporting_period, document_sha256=document.sha256,
            source_url=document.source_url, url=f"{document.source_url}#page={page}")
        return identifier

    def add(metric, value, unit, currency, fiscal_period, scope, page, quote, kind="reported_actual"):
        claim_id = citation(page, quote, kind)
        basis_id = citation(basis[1], basis[2], "document_context")
        facts.append(dict(id=claim_id + "-" + metric, metric=metric, value=amount(value),
            unit=unit.lower().rstrip("s"), currency="INR" if currency.upper() in {"RS.", "INR", "₹"} else "USD" if currency.upper() in {"USD", "US$"} else None,
            period=period(fiscal_period), basis=basis[0], scope=scope, kind=kind,
            evidence_ids=[claim_id, basis_id]))

    paired = re.compile(rf"For\s+({PERIOD}),\s+Gross Revenue and EBITDA from Continuing Operations stood at\s+"
        rf"(Rs\.|INR|₹|USD|US\$)\s*({NUMBER})\s*(crores?|millions?|billions?)\s+and\s+"
        rf"(Rs\.|INR|₹|USD|US\$)\s*({NUMBER})\s*(crores?|millions?|billions?)\s+respectively\.", re.I)
    # One explicit metric, period and scope in the same sentence. No use of an
    # adjacent sentence's units or a quarter inferred from a document filename.
    single = re.compile(rf"(?P<label>{METRIC})\s+(?:from\s+)?(?P<scope>Continuing Operations|Discontinued Operations)\s+"
        rf"for\s+(?P<period>{PERIOD})\s+(?P<verb>stood at|was|is expected to be|is guided at)\s+{MONEY}", re.I)
    margins = re.compile(rf"(?P<label>Operating margin)\s+for\s+(?P<period>{PERIOD})\s+"
        rf"(?P<verb>was|stood at|is guided at|is expected to be)\s+(?P<value>{NUMBER})\s*%\s+for\s+continuing operations", re.I)
    for page, text in enumerate(pages, 1):
        for match in paired.finditer(text):
            fiscal, currency1, value1, unit1, currency2, value2, unit2 = match.groups()
            add("gross_revenue", value1, unit1, currency1, fiscal, "continuing_operations", page, match.group())
            add("ebitda", value2, unit2, currency2, fiscal, "continuing_operations", page, match.group())
        for match in single.finditer(text):
            values = match.groupdict()
            # Extend to the end of this sentence so exceptional gains and other
            # immediate qualifications are retained in the supporting evidence.
            tail = text[match.end():]
            end = re.search(r"(?<!Rs)\.(?=\s+[A-Z•]|\s*$)", tail)
            quote = text[match.start():match.end() + (end.end() if end else len(tail))]
            if len(quote) > 1200:
                continue
            kind = "management_guidance" if "expected" in values["verb"].lower() or "guided" in values["verb"].lower() else "reported_actual"
            add(METRICS[values["label"].lower()], values["value"], values["unit"], values["currency"], values["period"],
                values["scope"].lower().replace(" ", "_"), page, quote, kind)
        for match in margins.finditer(text):
            values = match.groupdict()
            kind = "management_guidance" if "guided" in values["verb"].lower() or "expected" in values["verb"].lower() else "reported_actual"
            add("operating_margin", values["value"], "percent", "", values["period"], "continuing_operations", page, match.group(), kind)
        if len(facts) >= 30:
            break
    # Multiple differing values for the same metric/context are ambiguous. Do
    # not choose whichever appeared first (e.g. a rounded highlights figure).
    groups = {}
    for fact in facts:
        key = tuple(fact[field] for field in ("metric", "period", "basis", "scope", "unit", "currency", "kind"))
        groups.setdefault(key, []).append(fact)
    accepted = [values[0] for values in groups.values() if len({value["value"] for value in values}) == 1]
    used = {identifier for fact in accepted for identifier in fact["evidence_ids"]}
    return accepted, [claim for identifier, claim in evidence.items() if identifier in used]


def comparisons(facts):
    rows = []
    for actual in [fact for fact in facts if fact["kind"] == "reported_actual"]:
        keys = ("metric", "period", "basis", "scope", "unit", "currency")
        guidance = [fact for fact in facts if fact["kind"] == "management_guidance" and all(fact[key] == actual[key] for key in keys)]
        if len(guidance) != 1 or actual["scope"] != "continuing_operations":
            continue
        guide = guidance[0]
        actual_value, target = Decimal(actual["value"]), Decimal(guide["value"])
        delta = actual_value - target
        prior_period = previous_period(actual["period"])
        previous = [fact for fact in facts if fact["kind"] == "reported_actual" and fact["period"] == prior_period
                    and all(fact[key] == actual[key] for key in keys if key != "period")]
        rows.append(dict(metric=actual["metric"], period=actual["period"], basis=actual["basis"], scope=actual["scope"],
            currency=actual["currency"], unit=actual["unit"], actual=actual["value"], guidance=guide["value"],
            previous=previous[0]["value"] if len(previous) == 1 else None,
            absolute_variance=str(delta), percentage_variance=str(delta / abs(target) * 100) if target else None,
            kind="derived_calculation", explanation="Reported actual minus explicit same-period guidance; arithmetic comparison does not establish the cause of the difference.",
            evidence_ids=list(dict.fromkeys(actual["evidence_ids"] + guide["evidence_ids"] + (previous[0]["evidence_ids"] if len(previous) == 1 else [])))))
    return {"status": "available" if rows else "insufficient_evidence", "rows": rows,
            "message": "Deterministic comparisons of explicit, matching source values." if rows else
            "No validated like-for-like guidance and actual values are available. Missing prior-period values remain unavailable; no variance was invented."}


def financial_changes(facts):
    """YoY/QoQ only from two explicitly stated, matching-basis actuals."""
    actuals = [fact for fact in facts if fact["kind"] == "reported_actual" and fact["scope"] == "continuing_operations"]
    results = []
    for current in actuals:
        modes = ["YoY", "QoQ"] if current["period"].startswith("Q") else ["YoY"]
        for mode in modes:
            previous = [fact for fact in actuals if fact["period"] == previous_period(current["period"], mode == "YoY")
                and all(fact[key] == current[key] for key in ("metric", "basis", "scope", "currency", "unit"))]
            if len(previous) != 1:
                continue
            prior = previous[0]
            change = Decimal(current["value"]) - Decimal(prior["value"])
            baseline = Decimal(prior["value"])
            results.append(dict(metric=current["metric"], period=current["period"], previous_period=prior["period"],
                change_type=mode, actual=current["value"], previous=prior["value"], absolute_change=str(change),
                percentage_change=str(change / abs(baseline) * 100) if baseline else None,
                unit=current["unit"], currency=current["currency"], basis=current["basis"], scope=current["scope"],
                kind="derived_calculation", evidence_ids=list(dict.fromkeys(current["evidence_ids"] + prior["evidence_ids"]))))
    return results
