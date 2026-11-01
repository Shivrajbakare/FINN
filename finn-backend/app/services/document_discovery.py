"""Bounded official-listing discovery. No generated document URLs."""
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from hashlib import sha256
import json
from pathlib import Path
import re
from urllib.parse import urljoin, urlsplit, urlencode, unquote

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import func

from app.models import Document
from app.services.source_http import SourceClient, SourceError, validate_url

POLICIES = json.loads((Path(__file__).resolve().parents[1] / "config/discovery_sources.json").read_text())
EXCHANGE_HOSTS = {"www.nseindia.com", "nsearchives.nseindia.com", "archives.nseindia.com", "www.bseindia.com", "bseindia.com"}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.current = [], None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            attrs = dict(attrs)
            self.current = [attrs.get("href", ""), attrs.get("data-cta-label", attrs.get("title", ""))]

    def handle_data(self, data):
        if self.current:
            self.current[1] += " " + data

    def handle_endtag(self, tag):
        if tag == "a" and self.current:
            self.links.append(tuple(self.current))
            self.current = None


def classify(label):
    lower = label.lower().replace("-", " ")
    for words, kind in [(('transcript',), 'earnings_call_transcript'),
                        (('annual report', 'report and accounts', 'report & accounts'), 'annual_report'),
                        (('presentation',), 'investor_presentation'),
                        (('financial result', 'quarterly result'), 'quarterly_financial_results')]:
        if any(word in lower for word in words):
            return kind
    return "corporate_announcement"


def period_from_label(label):
    # Preserve the published label; never infer a date from the current clock.
    match = re.search(r"\bQ[1-4][\s_/-]*FY[\s'_-]*(?:20)?\d{2}(?:[/-]\d{2})?\b", label, re.I)
    if not match:
        match = re.search(r"\b(?:FY\s*)?20\d{2}\s*[-/]\s*(?:20)?\d{2}\b", label, re.I)
    if not match:
        match = re.search(r"\b(?:\d{1,2}[ -])?(?:March|June|September|December|Mar|Jun|Sep|Dec)[ ,_-]+20\d{2}\b", label, re.I)
    return match.group(0) if match else None


def listing_documents(raw, listing, hosts):
    parser = Links()
    parser.feed(raw.decode("utf-8", errors="replace"))
    found = {}
    for href, text in parser.links:
        url = urljoin(listing, href)
        if not urlsplit(url).path.lower().endswith(".pdf"):
            continue
        try:
            validate_url(url, hosts, resolve=False)
        except SourceError:
            continue
        label = re.sub(r"\s+", " ", text).strip().removeprefix("download-")
        if not label:
            label = urlsplit(url).path.rsplit("/", 1)[-1]
        filename = unquote(urlsplit(url).path.rsplit("/", 1)[-1]).replace("_", " ")
        if label.lower() in {"download", "pdf", "view", "click here", "read more"}:
            label = filename
        found[url] = dict(source_url=url, document_title=label[:600], discovery_label=label[:2000],
            document_type=classify(label + " " + filename), reporting_period=period_from_label(label) or period_from_label(filename), publication_date=None,
            discovered_on=listing, source_domain=urlsplit(url).hostname)
    return list(found.values())[:150]


def exchange_documents(data, company, endpoint, annual=False):
    rows = data.get("data") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        raise SourceError("invalid_listing", "Exchange returned an unsupported filing format.")
    documents = []
    def identity(value):
        return re.sub(r"[^a-z0-9]", "", str(value).lower().replace("limited", "ltd"))
    for row in rows[:10000]:
        if not isinstance(row, dict):
            continue
        if annual:
            if identity(row.get("companyName")) != identity(company.company_name):
                continue
        elif row.get("symbol") != company.nse_symbol:
            continue
        url = row.get("fileName" if annual else "attchmntFile")
        # A missing attachment must not abort the rest of an issuer's filings.
        try:
            validate_url(url, EXCHANGE_HOSTS, resolve=False)
        except (SourceError, TypeError, AttributeError):
            continue
        if not urlsplit(url).path.lower().endswith(".pdf"):
            continue
        label = (f"{company.company_name} Annual Report {row.get('fromYr', '')}-{row.get('toYr', '')}" if annual else
                 str(row.get("attchmntText") or row.get("desc") or "Exchange filing"))[:600]
        publication = None
        try:
            publication = datetime.strptime(row.get("broadcast_dttm" if annual else "an_dt", ""), "%d-%b-%Y %H:%M:%S").date()
        except (ValueError, TypeError):
            pass
        documents.append(dict(source_url=url, source_domain=urlsplit(url).hostname, document_title=label,
            discovery_label=label, document_type=classify(label), reporting_period=period_from_label(label),
            publication_date=publication, discovered_on=endpoint))
    return documents


def discover(company):
    documents, issues, successful = [], [], 0
    today = datetime.now(timezone.utc).date()
    params = {"index": "equities", "symbol": company.nse_symbol}
    # Bounded date window avoids multi-megabyte lifetime announcement responses.
    recent = {**params, "from_date": (today - timedelta(days=365)).strftime("%d-%m-%Y"),
              "to_date": today.strftime("%d-%m-%Y")}
    with SourceClient(EXCHANGE_HOSTS) as client:
        for api, query, annual in [("corporate-announcements", recent, False), ("annual-reports", params, True)]:
            endpoint = "https://www.nseindia.com/api/" + api + "?" + urlencode(query)
            try:
                data = json.loads(client.get(endpoint, 8_000_000, {"application/json"}))
                documents.extend(exchange_documents(data, company, endpoint, annual))
                successful += 1
            except (SourceError, ValueError, TypeError) as exc:
                issues.append(f"NSE {api}: {getattr(exc, 'code', 'invalid_listing')}. "
                              + (str(exc) if isinstance(exc, SourceError) else "Unsupported response format."))
    policy = POLICIES.get(company.nse_symbol)
    if policy:
        with SourceClient(policy["hosts"]) as client:
            for listing in policy["listing_urls"]:
                try:
                    raw = client.get(listing, 3_000_000, {"text/html"})
                    documents.extend(listing_documents(raw, listing, policy["hosts"]))
                    successful += 1
                    # Follow a bounded set of published IR subpages, not guessed PDF paths.
                    links = Links()
                    links.feed(raw.decode("utf-8", errors="replace"))
                    children = []
                    for href, label in links.links:
                        target = urljoin(listing, href).split("#")[0]
                        if target in children or target in policy["listing_urls"] or urlsplit(target).path.lower().endswith(".pdf"):
                            continue
                        if not re.search(r"result|financial|earning|annual.report", target + " " + label, re.I):
                            continue
                        try:
                            validate_url(target, policy["hosts"], resolve=False)
                        except SourceError:
                            continue
                        children.append(target)
                    for target in children[:4]:
                        try:
                            child = client.get(target, 3_000_000, {"text/html"})
                            documents.extend(listing_documents(child, target, policy["hosts"]))
                        except SourceError:
                            continue
                except SourceError as exc:
                    issues.append(str(exc))
    if not documents and not successful:
        raise SourceError("discovery_unavailable", "Official sources could not be checked. Retry discovery later. " + " ".join(issues))
    # Relevant financial disclosures first; share-certificate notices must not
    # crowd results and transcripts out of the bounded response.
    priority = {"earnings_call_transcript": 0, "quarterly_financial_results": 1,
                "investor_presentation": 2, "annual_report": 3, "corporate_announcement": 4}
    unique = list({doc["source_url"]: doc for doc in documents}.values())
    unique.sort(key=lambda doc: (priority[doc["document_type"]], -(doc["publication_date"].toordinal() if doc["publication_date"] else 0)))
    return unique[:200], issues


def save_discovered(session, company, documents):
    records = []
    for values in documents:
        document_id = sha256(f"{company.id}:{values['source_url']}".encode()).hexdigest()
        records.append(dict(id=document_id, company_id=company.id, **values,
            verification_status="source_verified", provenance={"discovery": "official_listing"}))
    if records:
        statement = insert(Document).values(records)
        session.execute(statement.on_conflict_do_update(
            index_elements=[Document.company_id, Document.source_url],
            set_={"document_type": statement.excluded.document_type,
                  "document_title": statement.excluded.document_title,
                  "discovery_label": statement.excluded.discovery_label,
                  "publication_date": statement.excluded.publication_date,
                  "reporting_period": func.coalesce(Document.reporting_period, statement.excluded.reporting_period)},
            where=Document.pinned.is_(False)))


def permitted_hosts(company, document):
    hosts = set(POLICIES.get(company.nse_symbol, {}).get("hosts", [])) | EXCHANGE_HOSTS
    if document.source_domain:
        if document.source_domain.endswith(".nseindia.com") or document.source_domain.endswith(".bseindia.com"):
            hosts.add(document.source_domain)
    if document.pinned:
        hosts.add("www.infosys.com")
    validate_url(document.source_url, hosts, resolve=False)
    return hosts
