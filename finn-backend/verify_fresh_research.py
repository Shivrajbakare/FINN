"""Download previously uncached documents from the live discovery run."""
import asyncio
from datetime import date
import json
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import select, func
from app.database import transaction
from app.models import Company, Document, Citation, now
from app.services.document_discovery import save_discovered
from app.services.retrieval import retrieve
from app.services.evidence_research import generate
from app.services.market_data import fetch_stock_history, close_market_client


def verify_company(entry):
    with transaction() as session:
        company = session.scalar(select(Company).where(Company.nse_symbol == entry['symbol']))
        assert company is not None
        docs = entry['documents']
        for doc in docs:
            if doc['publication_date']:
                doc['publication_date'] = date.fromisoformat(doc['publication_date'])
        save_discovered(session, company, docs)
        candidates = session.scalars(select(Document).where(Document.company_id == company.id,
            Document.storage_key.is_(None), Document.document_type == 'earnings_call_transcript')
            .order_by((Document.source_domain != 'nsearchives.nseindia.com').desc(),
                      Document.publication_date.desc().nullslast()).limit(5)).all()
        assert candidates, 'No uncached transcript available; no existing records were deleted'
        company_id, identifiers = company.id, [doc.id for doc in candidates]
    errors = []
    for identifier in identifiers:
        try:
            with transaction() as session:
                company, doc = session.get(Company, company_id), session.get(Document, identifier)
                assert doc.storage_key is None
                pages, retrieval = retrieve(session, company, doc)
                assert retrieval == 'network'
                assert len(pages) >= 3, 'Attachment is a notice, not a substantive transcript'
                snapshot, hit = generate(session, company, doc, pages, retrieval)
                assert not hit
                session.flush()
                citations = session.scalar(select(func.count()).select_from(Citation).where(Citation.snapshot_id == snapshot.id))
                assert citations > 0
                result = dict(symbol=company.nse_symbol, document_id=doc.id, source_url=doc.source_url,
                    sha256=doc.sha256, pages=len(pages), bytes=doc.file_size, citations=citations,
                    snapshot_id=snapshot.id, initially_uncached=True, retrieval=retrieval)
            with transaction() as session:
                company, doc = session.get(Company, company_id), session.get(Document, identifier)
                pages, mode = retrieve(session, company, doc)
                snapshot, hit = generate(session, company, doc, pages, mode)
                assert mode == 'cache' and hit and snapshot.id == result['snapshot_id']
            return dict(result, cache_reused=True, status='passed', failed_candidates=errors)
        except Exception as exc:
            errors.append(dict(document_id=identifier, code=getattr(exc,'code',type(exc).__name__)))
    return dict(symbol=entry['symbol'], status='failed', errors=errors)


async def verify_market():
    symbols = ['TCS.NS', 'INFY.NS', 'RELIANCE.NS']
    try:
        rows = await asyncio.gather(*(fetch_stock_history(symbol) for symbol in symbols))
        result = [dict(ticker=symbol, status=row.status, as_of=row.as_of, fetched_at=row.fetched_at,
            bars=len(row.history), close=row.history[-1].close if row.history else None) for symbol,row in zip(symbols, rows)]
        assert all(row['bars'] for row in result)
        assert len({row['close'] for row in result}) == len(symbols)
        return result
    finally:
        await close_market_client()


if __name__ == '__main__':
    load_dotenv()
    entries = json.loads(Path('../docs/verification/discovery-coverage.json').read_text(encoding='utf-8'))
    results = []
    for entry in entries:
        result = verify_company(entry)
        results.append(result)
        print(json.dumps(result), flush=True)
        Path('../docs/verification/fresh-research.json').write_text(json.dumps(dict(checked_at=now().isoformat(), companies=results),indent=2),encoding='utf-8')
    market = asyncio.run(verify_market())
    Path('../docs/verification/market-refresh.json').write_text(json.dumps(market,indent=2),encoding='utf-8')
    print(json.dumps(dict(market=market)), flush=True)
    assert all(row['status'] == 'passed' for row in results)
