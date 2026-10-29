"""HTTP startup checks only: not browser automation or external-data proof."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import httpx


def verify(output=None):
    checks = []
    with httpx.Client(timeout=60) as client:
        for path in ['/', '/research', '/alerts', '/settings']:
            response = client.get('http://127.0.0.1:3000' + path)
            assert response.status_code == 200, path
            assert 'text/html' in response.headers['content-type']
            checks.append({'frontend_path': path, 'status': response.status_code})
        response = client.get('http://127.0.0.1:8000/health')
        assert response.json()['status'] == 'ok'
        snapshot = client.get('http://127.0.0.1:8000/api/research/TCS').json()
        assert snapshot['status'] == 'unsupported' and not snapshot['documents'] and not snapshot['sections']
        preflight = client.options('http://127.0.0.1:8000/api/research/INFY', headers={
            'Origin': 'http://127.0.0.1:3000', 'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'content-type'})
        assert preflight.status_code == 200
        assert preflight.headers['access-control-allow-origin'] == 'http://127.0.0.1:3000'
    evidence = {'checked_at': datetime.now(timezone.utc).isoformat(), 'kind': 'local HTTP only',
                'checks': checks, 'health': 'ok', 'unsupported_ticker': 'no substituted claims',
                'cors': 'explicit local origin accepted', 'browser_verified': False}
    if output:
        Path(output).write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output')
    verify(parser.parse_args().output)
