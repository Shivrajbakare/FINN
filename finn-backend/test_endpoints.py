"""Live smoke check against a separately running local API; not the offline suite."""
import httpx

def test_all():
    print("1. Health check:")
    r = httpx.get("http://127.0.0.1:8000/health")
    r.raise_for_status()
    assert r.json()["status"] == "ok"
    print("   Status:", r.status_code, r.json())

    print("\n2. Fetching portfolio (18 tickers)...")
    r2 = httpx.get("http://127.0.0.1:8000/api/portfolio", timeout=45.0)
    print("   Status:", r2.status_code)
    r2.raise_for_status()
    assert r2.json()["status"] in {"complete", "partial"}, f"Portfolio scan failed: {r2.json()['status']}"
    assert r2.json()["coverage"]["available"] == 18, "Expected market data available for all 18 portfolio companies."
    stocks = r2.json()["stocks"]
    assert len(stocks) == 18, "Expected all 18 portfolio companies."
    print(f"   Fetched {len(stocks)} stocks successfully (status: {r2.json()['status']}, evaluated: {r2.json()['coverage']['evaluated']}/18)!")
    for s in stocks[:5]:
        print(f"   - {s['ticker']:<15} {s['name']:<25} INR {s['current_price']:<10} {s['change_pct']:+.2f}%")

    print("\n3. Testing configurable alerts (vol > 1.2x or price > 1.5%):")
    r3 = httpx.get("http://127.0.0.1:8000/api/alerts?volume_threshold=1.2&price_threshold=1.5", timeout=45.0)
    print("   Status:", r3.status_code)
    r3.raise_for_status()
    assert r3.json()["status"] in {"complete", "partial"}, f"Alert scan failed: {r3.json()['status']}"
    assert r3.json()["coverage"]["available"] == 18, "Expected market data available for all 18 companies."
    alerts = r3.json()["alerts"]
    print(f"   Detected {len(alerts)} alerts.")
    for a in alerts[:3]:
        print(f"   * [{a['alert_type'].upper()}] {a['ticker']}: {a['message']}")

if __name__ == "__main__":
    test_all()
