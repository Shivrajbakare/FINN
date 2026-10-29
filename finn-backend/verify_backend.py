"""
Live Yahoo smoke test. Unavailable, stale or incomplete data exits nonzero.
"""

import asyncio
from app.config.portfolio import PORTFOLIO
from app.services.market_data import get_stock_summary, close_market_client

async def main():
    print(f"Loaded {len(PORTFOLIO)} portfolio companies.")
    test_ticker = "RELIANCE.NS"
    print(f"Testing market data fetch for {test_ticker}...")
    try:
        summary = await get_stock_summary(test_ticker, "Reliance Industries", "Energy")
        assert summary is not None, "No market data returned."
        assert summary.status == "ok", f"Market data is {summary.status}; cannot verify a complete scan."
        assert summary.current_price > 0 and summary.volume_sample_count == 20
        print(f"SUCCESS: {summary.ticker}, as of {summary.as_of}, INR {summary.current_price}")
    finally:
        await close_market_client()

if __name__ == "__main__":
    asyncio.run(main())
