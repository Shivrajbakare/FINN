"""Structured evidence contracts shared by generation and persisted API output."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class EvidenceClaim(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    section: Literal["overview", "performance", "guidance", "risks"]
    page: int = Field(ge=1, le=500)
    quote: str = Field(min_length=10, max_length=1200)
    text: str = Field(min_length=10, max_length=1200)
    kind: Literal["source_excerpt", "document_context", "reported_actual", "management_guidance", "management_commentary"]
    document_id: str
    document_title: str
    reporting_period: str | None
    document_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_url: str
    url: str


class EvidenceSection(BaseModel):
    id: Literal["overview", "performance", "guidance", "risks"]
    title: str
    claims: list[EvidenceClaim]
    status: Literal["available", "insufficient_evidence"]


class FinancialFact(BaseModel):
    id: str
    metric: str
    value: str = Field(pattern=r"^\d+(?:\.\d+)?$")
    unit: str
    currency: str | None
    period: str
    basis: Literal["standalone", "consolidated"]
    scope: Literal["continuing_operations", "discontinued_operations"]
    kind: Literal["reported_actual", "management_guidance"]
    evidence_ids: list[str] = Field(min_length=1)


class ComparisonRow(BaseModel):
    metric: str
    period: str
    basis: str
    scope: str
    currency: str | None
    unit: str
    actual: str
    guidance: str
    previous: str | None
    absolute_variance: str
    percentage_variance: str | None
    kind: Literal["derived_calculation"]
    explanation: str
    evidence_ids: list[str]


class Comparison(BaseModel):
    status: Literal["insufficient_evidence", "available"]
    rows: list[ComparisonRow]
    message: str


class FinancialChange(BaseModel):
    metric: str
    period: str
    previous_period: str
    change_type: Literal["YoY", "QoQ"]
    actual: str
    previous: str
    absolute_change: str
    percentage_change: str | None
    unit: str
    currency: str | None
    basis: str
    scope: str
    kind: Literal["derived_calculation"]
    evidence_ids: list[str]


class SnapshotPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company_id: str
    company_name: str
    document_id: str
    document_title: str
    reporting_period: str | None
    source_url: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    retrieved_at: str
    historical: Literal[True]
    method: str
    status: Literal["partial", "insufficient_evidence"]
    sections: list[EvidenceSection]
    financial_facts: list[FinancialFact] = Field(default_factory=list)
    financial_changes: list[FinancialChange] = Field(default_factory=list)
    comparison: Comparison
    limitations: list[str]
