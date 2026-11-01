"""Persistent research provenance, artifacts, snapshots and durable jobs."""
from datetime import date, datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now():
    return datetime.now(timezone.utc)


def identifier():
    return uuid4().hex


class Base(DeclarativeBase):
    pass


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Company(Timestamps, Base):
    __tablename__ = "companies"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=identifier)
    company_name: Mapped[str] = mapped_column(String(300))
    normalized_name: Mapped[str] = mapped_column(String(300), index=True)
    nse_symbol: Mapped[str | None] = mapped_column(String(40), unique=True)
    bse_code: Mapped[str | None] = mapped_column(String(12), unique=True)
    exchange: Mapped[str] = mapped_column(String(20), default="NSE")
    sector: Mapped[str | None] = mapped_column(String(160))
    industry: Mapped[str | None] = mapped_column(String(160))
    is_portfolio_company: Mapped[bool] = mapped_column(Boolean, default=False)
    registry_source: Mapped[str] = mapped_column(Text, default="portfolio configuration")
    registry_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Document(Timestamps, Base):
    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("company_id", "source_url"), Index("ix_document_company_period", "company_id", "reporting_period"))
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=identifier)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"))
    document_type: Mapped[str] = mapped_column(String(40))
    document_title: Mapped[str] = mapped_column(String(600))
    reporting_period: Mapped[str | None] = mapped_column(String(180))
    publication_date: Mapped[date | None] = mapped_column(Date)
    source_url: Mapped[str] = mapped_column(Text)
    source_domain: Mapped[str] = mapped_column(String(253))
    discovered_on: Mapped[str] = mapped_column(Text)
    discovery_label: Mapped[str] = mapped_column(Text, default="")
    storage_key: Mapped[str | None] = mapped_column(String(180))
    sha256: Mapped[str | None] = mapped_column(String(64))
    file_size: Mapped[int | None] = mapped_column(Integer)
    extraction_status: Mapped[str] = mapped_column(String(40), default="not_requested")
    verification_status: Mapped[str] = mapped_column(String(40), default="source_verified")
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    provenance: Mapped[dict] = mapped_column(JSONB, default=dict)


class Extraction(Base):
    __tablename__ = "document_extractions"
    __table_args__ = (UniqueConstraint("document_id", "document_sha256", "extraction_version"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=identifier)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="RESTRICT"), index=True)
    document_sha256: Mapped[str] = mapped_column(String(64))
    extraction_version: Mapped[str] = mapped_column(String(80))
    extracted_text_reference: Mapped[str] = mapped_column(String(180))
    artifact_sha256: Mapped[str] = mapped_column(String(64))
    page_count: Mapped[int] = mapped_column(Integer)
    extraction_status: Mapped[str] = mapped_column(String(40))
    extracted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    error_message: Mapped[str | None] = mapped_column(Text)


class Snapshot(Base):
    __tablename__ = "research_snapshots"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=identifier)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="RESTRICT"), index=True)
    document_sha256: Mapped[str] = mapped_column(String(64))
    reporting_period: Mapped[str | None] = mapped_column(String(180))
    research_type: Mapped[str] = mapped_column(String(80))
    research_version: Mapped[str] = mapped_column(String(80))
    extraction_version: Mapped[str] = mapped_column(String(80))
    cache_key: Mapped[str] = mapped_column(String(64), index=True)
    snapshot_data: Mapped[dict] = mapped_column(JSONB)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    cache_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(40))


class Citation(Base):
    __tablename__ = "research_citations"
    __table_args__ = (UniqueConstraint("snapshot_id", "claim_reference"),)
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=identifier)
    snapshot_id: Mapped[str] = mapped_column(ForeignKey("research_snapshots.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="RESTRICT"))
    page_number: Mapped[int] = mapped_column(Integer)
    section_name: Mapped[str] = mapped_column(String(80))
    quoted_text: Mapped[str] = mapped_column(Text)
    claim_reference: Mapped[str] = mapped_column(String(100))
    source_url: Mapped[str] = mapped_column(Text)


class Job(Timestamps, Base):
    __tablename__ = "research_jobs"
    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=identifier)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"))
    document_id: Mapped[str | None] = mapped_column(ForeignKey("documents.id", ondelete="RESTRICT"))
    kind: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(40), default="queued", index=True)
    error_code: Mapped[str | None] = mapped_column(String(60))
    message: Mapped[str | None] = mapped_column(Text)
    result: Mapped[dict] = mapped_column(JSONB, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
