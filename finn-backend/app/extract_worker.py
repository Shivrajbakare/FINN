"""Isolated, time-bounded PDF parser subprocess; no network or model calls."""
import json
from pathlib import Path
import sys
from io import BytesIO
from pypdf import PdfReader
from app.services.research import normalize_text


def parse(raw):
    if not raw.startswith(b"%PDF-") or not 10 <= len(raw) <= 20_000_000:
        raise ValueError("invalid_pdf")
    reader = PdfReader(BytesIO(raw))
    if reader.is_encrypted or not 1 <= len(reader.pages) <= 500:
        raise ValueError("unsupported_pdf")
    pages = []
    for page in reader.pages:
        content = page.get_contents()
        if content and len(content.get_data()) > 8_000_000:
            raise ValueError("page_too_large")
        value = normalize_text(page.extract_text() or "")
        if len(value) > 80_000:
            raise ValueError("page_too_large")
        pages.append(value)
        if sum(map(len, pages)) > 20_000_000:
            raise ValueError("document_text_too_large")
    if sum(len(page) for page in pages) < 100:
        raise ValueError("ocr_required")
    return pages


if __name__ == "__main__":
    try:
        pages = parse(Path(sys.argv[1]).read_bytes())
        Path(sys.argv[2]).write_text(json.dumps(pages, ensure_ascii=False), encoding="utf-8")
    except Exception:
        sys.exit(2)
