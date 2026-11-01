"""Evidence-first generation: providers choose verified excerpts, never invent facts."""
from decimal import Decimal
from hashlib import sha256
import json
import os
import re
from typing import Literal, Protocol
from urllib.parse import urlsplit

import httpx
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, delete

from app.models import Snapshot, Citation, now
from app.research_schemas import SnapshotPayload
from app.services.retrieval import EXTRACTION_VERSION
from app.services.source_http import SourceError

TEMPLATE_VERSION = "evidence-v4"
SECTIONS = {"overview": "Business overview", "performance": "Financial performance",
            "guidance": "Management guidance", "risks": "Risks and management commentary"}
KEYWORDS = {
    "overview": r"\b(business|segment|products?|services|geograph|strategy|portfolio)\b",
    "performance": r"\b(revenue|EBITDA|operating profit|PBT|PAT|profit|margin|earnings)\b",
    "guidance": r"\b(guidance|outlook|expect|expects|expected|anticipate|capex|capital expenditure)\b",
    "risks": r"\b(risk|uncertainty|uncertain|challenge|regulatory|headwind)\b",
}


class EvidenceChoice(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    evidence_ids: list[str] = Field(max_length=16)


class Provider(Protocol):
    version: str
    def choose(self, candidates: list[dict]) -> EvidenceChoice: ...


class ExtractiveProvider:
    version = "extractive-v1"

    def choose(self, candidates):
        counts, chosen = {}, []
        for item in candidates:
            section = item["section"]
            if counts.get(section, 0) < 3:
                chosen.append(item["id"])
                counts[section] = counts.get(section, 0) + 1
        return EvidenceChoice(evidence_ids=chosen)


class CompatibleLLMProvider:
    def __init__(self):
        self.url = os.getenv("RESEARCH_LLM_URL", "https://api.groq.com/openai/v1/chat/completions")
        self.model = os.getenv("RESEARCH_LLM_MODEL", "llama-3.3-70b-versatile")
        self.key = os.getenv("RESEARCH_LLM_API_KEY", "")
        parts = urlsplit(self.url)
        if parts.scheme != "https" or not parts.hostname or parts.username or not self.model or not self.key:
            raise SourceError("provider_not_configured", "Configure the research model endpoint, model and API key.")
        self.version = "selector-v1-" + sha256(f"{self.url}:{self.model}".encode()).hexdigest()[:16]

    def choose(self, candidates):
        # Untrusted documents cannot trigger tools or provide output prose.
        prompt = "Select up to 12 evidence IDs covering business, performance, guidance and risks. Return only JSON {\"evidence_ids\": [\"id\"]}. Select only supplied IDs. Do not calculate or write claims."
        try:
            with httpx.Client(timeout=25, follow_redirects=False, trust_env=False) as client:
                if "generativelanguage.googleapis.com" in self.url:
                    # Native Gemini generateContent API
                    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.key}"
                    payload = {
                        "systemInstruction": {"parts": [{"text": prompt}]},
                        "contents": [{"parts": [{"text": json.dumps(candidates)}]}],
                        "generationConfig": {
                            "responseMimeType": "application/json",
                            "temperature": 0.0,
                            "maxOutputTokens": 1000,
                        }
                    }
                    response = client.post(endpoint, json=payload)
                    response.raise_for_status()
                    data = response.json()
                    content = data["candidates"][0]["content"]["parts"][0]["text"]
                    return EvidenceChoice.model_validate_json(content)
                else:
                    # Standard OpenAI-compatible format (Groq, etc.)
                    response = client.post(self.url, headers={"Authorization": "Bearer " + self.key}, json={
                        "model": self.model, "temperature": 0, "max_tokens": 1000,
                        "response_format": {"type": "json_object"},
                        "messages": [{"role": "system", "content": prompt},
                                     {"role": "user", "content": json.dumps(candidates)}]})
                    response.raise_for_status()
                    if len(response.content) > 100_000:
                        raise ValueError()
                    return EvidenceChoice.model_validate_json(response.json()["choices"][0]["message"]["content"])
        except Exception:
            # Resilient fallback to deterministic extractive selection
            return ExtractiveProvider().choose(candidates)


def provider():
    name = os.getenv("RESEARCH_PROVIDER")
    if not name:
        name = "compatible_llm" if os.getenv("RESEARCH_LLM_API_KEY") else "extractive"
    if name == "extractive":
        return ExtractiveProvider()
    if name == "compatible_llm":
        try:
            return CompatibleLLMProvider()
        except Exception:
            return ExtractiveProvider()
    raise SourceError("provider_not_configured", "Unknown research provider configuration.")


def candidates_from_pages(pages):
    candidates = []
    for section, pattern in KEYWORDS.items():
        count = 0
        for page_number, text in enumerate(pages, 1):
            # Full normalized sentences, capped length; quotes never splice pages.
            for sentence in re.split(r"(?<=[.!?])\s+(?=[A-Z])", text):
                if 60 <= len(sentence) <= 1100 and re.search(pattern, sentence, re.I):
                    identifier = sha256(f"{section}:{page_number}:{sentence}".encode()).hexdigest()[:20]
                    candidates.append({"id": identifier, "section": section, "page": page_number, "quote": sentence})
                    count += 1
                    if count >= 12:
                        break
            if count >= 12:
                break
    return candidates


def validated_claims(choice, candidates, pages, document):
    known = {item["id"]: item for item in candidates}
    if len(choice.evidence_ids) != len(set(choice.evidence_ids)):
        raise ValueError("Duplicate evidence selections")
    claims = []
    for identifier in choice.evidence_ids:
        item = known.get(identifier)
        if not item or item["quote"] not in pages[item["page"] - 1]:
            raise ValueError("Unverifiable evidence selection")
        claims.append({**item, "kind": "source_excerpt", "text": item["quote"],
            "document_id": document.id, "document_title": document.document_title,
            "reporting_period": document.reporting_period, "document_sha256": document.sha256,
            "source_url": document.source_url, "url": f"{document.source_url}#page={item['page']}"})
    return claims


def cache_identity(company, document, version):
    return sha256(json.dumps([company.id, document.id, document.sha256, document.reporting_period,
        TEMPLATE_VERSION, EXTRACTION_VERSION, version], separators=(",", ":")).encode()).hexdigest()


class ComparableValue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value: Decimal = Field(allow_inf_nan=False)
    metric: str
    unit: str
    basis: str
    period: str
    evidence_id: str


def calculate_variance(actual: ComparableValue, guidance: ComparableValue):
    if any(getattr(actual, key) != getattr(guidance, key) for key in ("metric", "unit", "basis", "period")):
        raise ValueError("Values are not comparable")
    absolute = actual.value - guidance.value
    return {"absolute_variance": str(absolute), "percentage_variance":
            str(absolute / abs(guidance.value) * 100) if guidance.value else None}


def generate(session, company, document, pages, retrieval):
    selected_provider = provider() if not document.pinned else ExtractiveProvider()
    if document.pinned:
        from app.services import research as legacy
        selected_provider.version = "reviewed-" + legacy.MANIFEST.version
    key = cache_identity(company, document, selected_provider.version)
    previous = session.scalar(select(Snapshot).where(Snapshot.cache_key == key).order_by(Snapshot.generated_at.desc()).limit(1))
    if previous and previous.cache_expires_at > now() and previous.status != "superseded":
        return previous, True
    if document.pinned:
        spec = legacy.DOCUMENTS[document.id]
        record = legacy.DocumentRecord(id=document.id, title=document.document_title, type=document.document_type,
            url=document.source_url, event_date=spec.document.event_date, retrieved_at=document.retrieved_at.isoformat(),
            sha256=document.sha256, page_count=len(pages), byte_count=document.file_size,
            manifest_version=legacy.MANIFEST.version, retrieval=retrieval)
        reviewed = legacy.build_snapshot(spec, pages, record)
        claims = [{"id": claim.id, "section": claim.section, "page": claim.evidence.page,
            "quote": claim.text, "text": claim.text, "kind": claim.kind, "document_id": document.id,
            "document_title": document.document_title, "reporting_period": claim.period,
            "document_sha256": document.sha256, "source_url": document.source_url, "url": claim.evidence.url}
            for section in reviewed.sections for claim in section.claims]
    else:
        candidates = candidates_from_pages(pages)
        try:
            claims = validated_claims(selected_provider.choose(candidates), candidates, pages, document)
        except ValueError as exc:
            raise SourceError("invalid_evidence", "Research output failed evidence validation.") from exc
        if document.document_type == "earnings_call_transcript" and len(pages) <= 2:
            raise SourceError("transcript_notice", "This attachment is a short transcript notice, not a full earnings-call transcript. Choose another transcript or financial-results document from the list.")
    from app.services.financial_facts import extract_facts, comparisons, financial_changes
    financial_facts, financial_claims = ([], []) if document.pinned else extract_facts(pages, document)
    claims.extend(financial_claims)
    sections = [{"id": key, "title": title, "claims": [claim for claim in claims if claim["section"] == key],
                 "status": "available" if any(claim["section"] == key for claim in claims) else "insufficient_evidence"}
                for key, title in SECTIONS.items()]
    status = "partial" if claims else "insufficient_evidence"
    payload = {"company_id": company.id, "company_name": company.company_name, "document_id": document.id,
        "document_title": document.document_title, "reporting_period": document.reporting_period,
        "source_url": document.source_url, "sha256": document.sha256, "retrieved_at": document.retrieved_at.isoformat(),
        "historical": True, "method": selected_provider.version, "status": status, "sections": sections,
        "financial_facts": financial_facts, "comparison": comparisons(financial_facts),
        "financial_changes": financial_changes(financial_facts),
        "limitations": ["Selected source excerpts, not an exhaustive or independently audited assessment.",
            "Section labels are keyword-selected; an excerpt may discuss expectations or prior periods. Read its full context.",
            "Structured figures require explicit metric, period, currency, units and accounting basis. Unsupported tables and missing values are not inferred.",
            "This is a selected-document historical snapshot, not a claim to be the latest results."]}
    snapshot = Snapshot(company_id=company.id, document_id=document.id, document_sha256=document.sha256,
        reporting_period=document.reporting_period, research_type="evidence_selection", research_version=TEMPLATE_VERSION,
        extraction_version=EXTRACTION_VERSION, cache_key=key, snapshot_data=SnapshotPayload.model_validate(payload).model_dump(),
        cache_expires_at=document.expires_at, status=status)
    session.add(snapshot)
    session.flush()
    for claim in claims:
        session.add(Citation(snapshot_id=snapshot.id, document_id=document.id, page_number=claim["page"],
            section_name=claim["section"], quoted_text=claim["quote"], claim_reference=claim["id"], source_url=claim["url"]))
    return snapshot, False
