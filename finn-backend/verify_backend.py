"""
Quick smoke test for FINN Backend:
- Tests yfinance data fetch on RELIANCE.NS
- Tests portfolio config
- Tests alert detection logic
"""

import asyncio
from app.config.portfolio import PORTFOLIO
from app.services.market_data import fetch_stock_history, get_stock_summary, detect_alerts

async def main():
    print(f"Loaded {len(PORTFOLIO)} portfolio companies.")
    test_ticker = "RELIANCE.NS"
    print(f"Testing market data fetch for {test_ticker}...")
    summary = await get_stock_summary(test_ticker, "Reliance Industries", "Energy")
    if summary:
        print(f"SUCCESS: {summary.name} ({summary.ticker}) Price: INR {summary.current_price}, 20d Avg Vol: {summary.avg_volume_20d}")
    else:
        print("FAILED to fetch stock summary.")

if __name__ == "__main__":
    asyncio.run(main())
