"""Real public-source discovery, separate from mocked regression tests."""
import json
from pathlib import Path
from types import SimpleNamespace
from app.services.document_discovery import discover

COMPANIES = [('TCS', 'Tata Consultancy Services Limited'), ('M&M', 'Mahindra & Mahindra Limited'),
             ('KOTAKBANK', 'Kotak Mahindra Bank Limited'), ('SUNPHARMA', 'Sun Pharmaceutical Industries Limited'),
             ('TITAN', 'Titan Company Limited')]

if __name__ == '__main__':
    results = []
    for symbol, name in COMPANIES:
        try:
            docs, issues = discover(SimpleNamespace(nse_symbol=symbol, company_name=name))
            result = dict(symbol=symbol, documents=docs, issues=issues, status='passed' if docs else 'empty')
        except Exception as exc:
            result = dict(symbol=symbol, status='failed', error=type(exc).__name__, code=getattr(exc, 'code', None))
        results.append(result)
        print(json.dumps({k: len(v) if k == 'documents' else v for k,v in result.items()}, default=str), flush=True)
    Path('../docs/verification/discovery-coverage.json').write_text(json.dumps(results, indent=2, default=str), encoding='utf-8')
    assert all(r['status'] == 'passed' for r in results), 'Some real sources failed; see report'
