"""A reviewed, extractive research slice. No LLM or arbitrary URL ingestion.

Document bytes, including cached bytes, must match the reviewed manifest hash.
All excerpts are selected from extracted pages and independently validated.
Document text is data: never executed, used as instructions, or rendered as HTML.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from hashlib import sha256
from io import BytesIO
import json
import logging
import os
from pathlib import Path
import re
from typing import Literal
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from pydantic import BaseModel, ConfigDict, Field
from pypdf import PdfReader

from app.services.market_data import normalize_ticker

logger = logging.getLogger(__name__)
MAX_BYTES = 5_000_000
CACHE_TTL = timedelta(hours=24)
MANIFEST_PATH = Path(__file__).resolve().parents[1] / "config" / "research_sources.json"
DEFAULT_CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "research"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class DocumentSpec(StrictModel):
    id: str
    title: str
    type: Literal["earnings_call_transcript", "annual_report"]
    event_date: str
    url: str
    discovered_on: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    page_count: int = Field(gt=0, le=80)
    identity_page: int = Field(gt=0)
    identity_markers: list[str]


Section = Literal["overview", "performance", "guidance", "risks"]
Kind = Literal["document_context", "reported_actual", "management_guidance", "management_commentary"]


class Selection(StrictModel):
    id: str
    section: Section
    kind: Kind
    title: str
    period: str
    speaker: str
    page: int = Field(gt=0)
    start: str = Field(min_length=5)
    end: str = Field(min_length=5)


class CompanySpec(StrictModel):
    ticker: str
    name: str
    period: str
    document: DocumentSpec
    selections: list[Selection]


class Manifest(StrictModel):
    version: str
    companies: list[CompanySpec]


MANIFEST = Manifest.model_validate_json(MANIFEST_PATH.read_text(encoding="utf-8"))
DOCUMENTS = {company.document.id: company for company in MANIFEST.companies}
COMPANIES = {}
for company in MANIFEST.companies:
    COMPANIES.setdefault(company.ticker, company)


class Evidence(StrictModel):
    document_id: str
    url: str
    page: int = Field(gt=0)
    quote: str = Field(min_length=10, max_length=1200)
    document_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class Claim(StrictModel):
    id: str
    section: Section
    kind: Kind
    title: str
    period: str
    speaker: str
    text: str = Field(min_length=10, max_length=1200)
    evidence: Evidence


class DocumentRecord(StrictModel):
    id: str
    title: str
    type: str
    url: str
    event_date: str
    retrieved_at: str
    sha256: str
    page_count: int
    byte_count: int
    manifest_version: str
    retrieval: Literal["network", "cache"]


class SnapshotSection(StrictModel):
    id: Section
    title: str
    status: Literal["available", "partial", "unavailable"]
    claims: list[Claim]
    message: str | None = None


class ResearchSnapshot(StrictModel):
    ticker: str
    company_name: str | None
    status: Literal["available", "partial", "unavailable", "unsupported"]
    period: str | None
    generated_at: str
    method: Literal["reviewed_excerpts"] = "reviewed_excerpts"
    historical: bool = True
    documents: list[DocumentRecord]
    sections: list[SnapshotSection]
    limitations: list[str]
    issues: list[str]


LIMITATIONS = [
    "Historical selected-document snapshot; not the latest company results or guidance.",
    "Selected management statements, not an exhaustive business or risk assessment. Annual reports are not ingested in this slice.",
    "Reported actuals are management-reported in this call, not independently reconciled to audited financial statements.",
    "Guidance describes expectations when issued, not achieved results. No analyst estimates or calculated financial metrics are generated.",
    "Deterministic, reviewed excerpts only; no LLM synthesis, open-ended questions, or automatic discovery for other tickers.",
]
SECTION_TITLES = {"overview": "Business and period overview", "performance": "Reported financial performance",
                  "guidance": "Explicit management guidance", "risks": "Risks and management commentary"}


class ResearchUnavailable(Exception):
    """A safe, user-facing failure; never include response bodies or secrets."""


def utc_now():
    return datetime.now(timezone.utc)


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def supported_companies():
    return [{"ticker": c.ticker, "name": c.name, "period": c.period,
             "document_date": c.document.event_date,
             "documents": [{"id": d.document.id, "period": d.period, "title": d.document.title}
                           for d in DOCUMENTS.values() if d.ticker == c.ticker]}
            for c in COMPANIES.values()]


def validate_source(spec: DocumentSpec):
    parsed = urlsplit(spec.url)
    # This initial source policy is deliberately fixed, not caller-controlled.
    if (parsed.scheme != "https" or parsed.hostname != "www.infosys.com"
            or parsed.port not in (None, 443) or parsed.username or parsed.password
            or parsed.query or parsed.fragment or not parsed.path.endswith(".pdf")):
        raise ResearchUnavailable("Document source is outside the approved primary-source policy.")


async def download_pdf(spec: DocumentSpec) -> bytes:
    validate_source(spec)
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=False) as client:
            async with client.stream("GET", spec.url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/pdf"}) as response:
                response.raise_for_status()
                if "application/pdf" not in response.headers.get("content-type", "").lower():
                    raise ResearchUnavailable("Primary source did not return a PDF.")
                chunks, size = [], 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ResearchUnavailable("Primary document exceeds the supported size limit.")
                    chunks.append(chunk)
                return b"".join(chunks)
    except httpx.HTTPError as exc:
        raise ResearchUnavailable("Primary document could not be retrieved. Try again later.") from exc


def extract_pages(raw: bytes, spec: DocumentSpec) -> list[str]:
    if not raw.startswith(b"%PDF-") or len(raw) > MAX_BYTES:
        raise ResearchUnavailable("Document is not a supported PDF.")
    if sha256(raw).hexdigest() != spec.sha256:
        raise ResearchUnavailable("Source document version changed or failed integrity verification; review is required.")
    try:
        reader = PdfReader(BytesIO(raw))
        if reader.is_encrypted or len(reader.pages) != spec.page_count:
            raise ValueError("Unsupported document structure")
        pages = [normalize_text(page.extract_text() or "") for page in reader.pages]
        if any(len(page) > 50_000 for page in pages):
            raise ValueError("Page limit exceeded")
        identity = pages[spec.identity_page - 1]
        if not all(normalize_text(marker) in identity for marker in spec.identity_markers):
            raise ValueError("Document identity/period missing")
        return pages
    except Exception as exc:
        raise ResearchUnavailable("Primary PDF text, identity, or reporting period could not be verified.") from exc


def select_passage(selection: Selection, pages: list[str]) -> str:
    if selection.page > len(pages):
        raise ValueError("Missing evidence page")
    page = pages[selection.page - 1]
    start, end = normalize_text(selection.start), normalize_text(selection.end)
    if page.count(start) != 1:
        raise ValueError("Missing or ambiguous start anchor")
    offset = page.index(start)
    tail = page[offset:]
    if tail.count(end) != 1:
        raise ValueError("Missing or ambiguous end anchor")
    return tail[:tail.index(end) + len(end)]


def validate_claim(payload: dict, selection: Selection, spec: DocumentSpec, pages: list[str]) -> Claim:
    """Validate structure AND provenance; a valid-looking citation is not enough.

    Only the reviewed excerpt is allowed, including its type, period and speaker.
    A future generative adapter must not bypass this validation boundary.
    """
    claim = Claim.model_validate(payload)
    for field in ("id", "section", "kind", "title", "period", "speaker"):
        if getattr(claim, field) != getattr(selection, field):
            raise ValueError("Unreviewed claim metadata")
    evidence = claim.evidence
    if (evidence.document_id != spec.id or evidence.url != f"{spec.url}#page={selection.page}"
            or evidence.page != selection.page or evidence.document_sha256 != spec.sha256):
        raise ValueError("Invalid evidence provenance")
    expected = select_passage(selection, pages)
    if claim.text != expected or evidence.quote != expected:
        raise ValueError("Unsupported claim text")
    return claim


def build_snapshot(company: CompanySpec, pages: list[str], record: DocumentRecord) -> ResearchSnapshot:
    sections, issues = [], []
    for section_id, title in SECTION_TITLES.items():
        rules = [rule for rule in company.selections if rule.section == section_id]
        claims = []
        for rule in rules:
            try:
                quote = select_passage(rule, pages)
                payload = {key: getattr(rule, key) for key in ("id", "section", "kind", "title", "period", "speaker")}
                payload.update(text=quote, evidence={"document_id": company.document.id,
                    "url": f"{company.document.url}#page={rule.page}", "page": rule.page,
                    "quote": quote, "document_sha256": company.document.sha256})
                claims.append(validate_claim(payload, rule, company.document, pages))
            except ValueError:
                issues.append(f"Evidence could not be validated for {rule.title}.")
        status = "available" if claims and len(claims) == len(rules) else "partial" if claims else "unavailable"
        sections.append(SnapshotSection(id=section_id, title=title, status=status, claims=claims,
            message=None if status == "available" else "Insufficient verified evidence in this document; no substitute claim was generated."))
    available = sum(len(section.claims) for section in sections)
    return ResearchSnapshot(ticker=company.ticker, company_name=company.name, period=company.period,
        status="available" if all(s.status == "available" for s in sections) else "partial" if available else "unavailable",
        generated_at=utc_now().isoformat(), documents=[record], sections=sections,
        limitations=LIMITATIONS, issues=issues)


def cache_directory() -> Path:
    return Path(os.getenv("RESEARCH_CACHE_DIR", str(DEFAULT_CACHE_DIR)))


def read_cache(spec: DocumentSpec):
    folder = cache_directory()
    # Hash-only filenames cannot be influenced by ticker/path traversal input.
    raw_path = folder / f"{spec.sha256}.pdf"
    meta_path = folder / f"{spec.sha256}.json"
    try:
        metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        retrieved = datetime.fromisoformat(metadata["retrieved_at"])
        age = utc_now() - retrieved
        if (metadata["url"] != spec.url or metadata["sha256"] != spec.sha256
                or metadata["manifest_version"] != MANIFEST.version or age < timedelta(0) or age >= CACHE_TTL
                or raw_path.stat().st_size > MAX_BYTES):
            return None
        raw = raw_path.read_bytes()
        if sha256(raw).hexdigest() != spec.sha256:
            return None
        return raw, metadata["retrieved_at"]
    except (OSError, ValueError, TypeError, KeyError):
        return None


def write_cache(spec: DocumentSpec, raw: bytes, retrieved_at: str):
    folder = cache_directory()
    try:
        folder.mkdir(parents=True, exist_ok=True)
        metadata = {"url": spec.url, "sha256": spec.sha256, "retrieved_at": retrieved_at,
                    "manifest_version": MANIFEST.version, "byte_count": len(raw)}
        for suffix, data in [("pdf", raw), ("json", json.dumps(metadata).encode("utf-8"))]:
            target = folder / f"{spec.sha256}.{suffix}"
            temporary = folder / f"{spec.sha256}.{uuid4().hex}.tmp"
            temporary.write_bytes(data)
            temporary.replace(target)
    except OSError:
        logger.warning("Research document cache could not be written; verified retrieval remains usable.")


_INFLIGHT: dict[tuple[str, str, str], asyncio.Task] = {}


async def _retrieve(company: CompanySpec):
    spec = company.document
    try:
        validate_source(spec)
        cached = await asyncio.to_thread(read_cache, spec)
        if cached:
            raw, retrieved_at = cached
            retrieval = "cache"
        else:
            raw = await download_pdf(spec)
            retrieved_at, retrieval = utc_now().isoformat(), "network"
        pages = await asyncio.to_thread(extract_pages, raw, spec)
        if retrieval == "network":
            await asyncio.to_thread(write_cache, spec, raw, retrieved_at)
        record = DocumentRecord(id=spec.id, title=spec.title, type=spec.type, url=spec.url,
            event_date=spec.event_date, retrieved_at=retrieved_at, sha256=spec.sha256,
            page_count=len(pages), byte_count=len(raw), manifest_version=MANIFEST.version, retrieval=retrieval)
        return build_snapshot(company, pages, record)
    except ResearchUnavailable as exc:
        return ResearchSnapshot(ticker=company.ticker, company_name=company.name, period=company.period,
            status="unavailable", generated_at=utc_now().isoformat(), documents=[], sections=[],
            limitations=LIMITATIONS, issues=[str(exc)])
    finally:
        _INFLIGHT.pop((company.ticker, spec.id, spec.sha256), None)


async def get_research(ticker: str, document_id: str | None = None) -> ResearchSnapshot:
    ticker = normalize_ticker(ticker)
    company = COMPANIES.get(ticker)
    if document_id is not None:
        company = DOCUMENTS.get(document_id)
        if company is None or company.ticker != ticker:
            raise ValueError("Unknown document for ticker")
    if company is None:
        return ResearchSnapshot(ticker=ticker, company_name=None, period=None, status="unsupported",
            generated_at=utc_now().isoformat(), documents=[], sections=[], limitations=[],
            issues=["No reviewed primary documents are configured for this ticker. Supported initially: INFY.NS."])
    key = (ticker, company.document.id, company.document.sha256)
    if key not in _INFLIGHT:
        _INFLIGHT[key] = asyncio.create_task(_retrieve(company))
    return await asyncio.shield(_INFLIGHT[key])


async def close_research_tasks():
    tasks = list(_INFLIGHT.values())
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
    _INFLIGHT.clear()
