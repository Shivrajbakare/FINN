import httpx

def test_all():
    print("1. Health check:")
    r = httpx.get("http://127.0.0.1:8000/health")
    print("   Status:", r.status_code, r.json())

    print("\n2. Fetching portfolio (18 tickers)...")
    r2 = httpx.get("http://127.0.0.1:8000/api/portfolio", timeout=45.0)
    print("   Status:", r2.status_code)
    stocks = r2.json()
    print(f"   Fetched {len(stocks)} stocks successfully!")
    for s in stocks[:5]:
        print(f"   - {s['ticker']:<15} {s['name']:<25} INR {s['current_price']:<10} {s['change_pct']:+.2f}%")

    print("\n3. Testing configurable alerts (vol > 1.2x or price > 1.5%):")
    r3 = httpx.get("http://127.0.0.1:8000/api/alerts?volume_threshold=1.2&price_threshold=1.5", timeout=45.0)
    print("   Status:", r3.status_code)
    alerts = r3.json()
    print(f"   Detected {len(alerts)} alerts.")
    for a in alerts[:3]:
        print(f"   * [{a['alert_type'].upper()}] {a['ticker']}: {a['message']}")

if __name__ == "__main__":
    test_all()
