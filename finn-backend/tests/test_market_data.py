"""Offline regression tests: no requests to Yahoo or a running server."""
import asyncio
from datetime import datetime, timedelta, timezone
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app.main import app, allowed_origins
from app.services import market_data as market

NOW = datetime(2026, 10, 28, 12, tzinfo=timezone.utc)  # 17:30 IST


def chart(count=25, latest=None):
    day = (latest or NOW).astimezone(market.IST).replace(hour=9, minute=15)
    days = []
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day)
        day -= timedelta(days=1)
    days.reverse()
    return {"chart": {"result": [{
        "meta": {"currency": "INR"},
        "timestamp": [int(d.timestamp()) for d in days],
        "indicators": {"quote": [{"open": [100] * count, "high": [101] * count,
                                  "low": [99] * count, "close": [100] * count,
                                  "volume": [100] * count}]},
    }], "error": None}}


def quote(payload):
    return payload["chart"]["result"][0]["indicators"]["quote"][0]


def parsed(payload=None):
    return market.parse_history(payload or chart(), NOW, NOW.isoformat())


class ParsingTests(unittest.TestCase):
    def test_short_history_is_not_twenty_day_average(self):
        result = parsed(chart(5))
        self.assertEqual(result.status, "insufficient_history")
        summary = market.summarize_stock("TEST.NS", "Test", "Test", result)
        self.assertIsNone(summary.avg_volume_20d)
        self.assertIsNone(summary.volume_ratio)
        self.assertEqual(summary.volume_sample_count, 4)

    def test_six_month_extrema_never_become_52_week_metrics(self):
        summary = market.summarize_stock("TEST.NS", "Test", "Test", parsed())
        self.assertIsNone(summary.high_52w)
        self.assertIsNone(summary.low_52w)

    def test_missing_volume_is_not_zero_and_gap_change_is_unknown(self):
        payload = chart()
        quote(payload)["volume"][-2] = None
        result = parsed(payload)
        self.assertEqual(result.status, "partial")
        self.assertEqual(len(result.history), 24)
        self.assertIsNone(result.history[-1].change_pct)
        summary = market.summarize_stock("TEST.NS", "Test", "Test", result)
        self.assertIsNone(summary.avg_volume_20d)
        self.assertIsNone(summary.volume_ratio)

    def test_nonfinite_and_inconsistent_prices_are_omitted(self):
        for bad in [None, float("nan"), float("inf"), -5, 500]:
            with self.subTest(bad=bad):
                payload = chart()
                quote(payload)["close"][-1] = bad
                result = parsed(payload)
                self.assertEqual(result.status, "stale")
                self.assertEqual(len(result.history), 24)

    def test_in_progress_bar_excluded_and_ist_date_used(self):
        now = NOW.replace(hour=9)  # 14:30 IST
        result = market.parse_history(chart(), now, now.isoformat())
        self.assertEqual(result.as_of, "2026-10-27")
        self.assertEqual(result.status, "ok")
        self.assertEqual(len(result.history), 24)

    def test_close_buffer_and_weekend_policy(self):
        self.assertEqual(market.expected_session(NOW.replace(hour=10, minute=29)), "2026-10-27")
        self.assertEqual(market.expected_session(NOW.replace(hour=10, minute=30)), "2026-10-28")
        self.assertEqual(market.expected_session(datetime(2026, 11, 1, 12, tzinfo=timezone.utc)), "2026-10-30")

    def test_stale_data_and_zero_baseline(self):
        self.assertEqual(parsed(chart(latest=NOW - timedelta(days=2))).status, "stale")
        payload = chart()
        quote(payload)["volume"] = [0] * 25
        self.assertEqual(parsed(payload).status, "insufficient_history")

    def test_no_data_and_wrong_currency(self):
        self.assertEqual(parsed({"chart": {"result": None}}).status, "no_data")
        payload = chart()
        payload["chart"]["result"][0]["meta"]["currency"] = "USD"
        self.assertEqual(parsed(payload).status, "unavailable")

    def test_symbol_validation(self):
        for symbol, expected in [(" infy ", "INFY.NS"), ("M&M.NS", "M&M.NS"), ("500325.bo", "500325.BO")]:
            self.assertEqual(market.normalize_ticker(symbol), expected)
        for symbol in ["", "../INFY", "INFY?range=1d", "A.US", "A" * 33, "BAD_SYMBOL"]:
            with self.assertRaises(ValueError):
                market.normalize_ticker(symbol)


class AsyncMarketTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        market._MEMORY_CACHE.clear()
        self.clock = patch.object(market, "utc_now", return_value=NOW)
        self.clock.start()

    async def asyncTearDown(self):
        await market.close_market_client()
        market._MEMORY_CACHE.clear()
        self.clock.stop()

    async def test_concurrent_requests_coalesce_and_ranges_do_not_collide(self):
        async def provider(*args):
            await asyncio.sleep(0.01)
            return chart()
        with patch.object(market, "_request_chart", side_effect=provider) as request:
            results = await asyncio.gather(*(market.fetch_stock_history("infy") for _ in range(12)))
            self.assertTrue(all(r.status == "ok" for r in results))
            self.assertEqual(request.call_count, 1)
            await market.fetch_stock_history("INFY.NS", "1y")
            self.assertEqual(request.call_count, 2)

    async def test_failed_request_not_cached_and_recovery(self):
        with patch.object(market, "_request_chart", side_effect=[httpx.ConnectError("offline"), chart()]) as request:
            self.assertEqual((await market.fetch_stock_history("INFY")).status, "unavailable")
            self.assertEqual((await market.fetch_stock_history("INFY")).status, "ok")
            self.assertEqual(request.call_count, 2)

    async def test_http_rate_limit_and_malformed_response_are_unavailable(self):
        for status, body in [(429, "rate limited"), (200, "not JSON"), (200, "[]")]:
            await market.close_market_client()
            market._client = httpx.AsyncClient(transport=httpx.MockTransport(
                lambda request: httpx.Response(status, text=body)))
            self.assertEqual((await market.fetch_stock_history("INFY")).status, "unavailable")
            self.assertEqual(len(market._MEMORY_CACHE), 0)

    async def test_provider_unknown_symbol_is_no_data_not_outage(self):
        market._client = httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(404)))
        self.assertEqual((await market.fetch_stock_history("UNKNOWN")).status, "no_data")
        self.assertEqual(parsed({"chart": {"error": {"code": "Not Found"}}}).status, "no_data")

    async def test_cache_expiry_refetches_and_cache_is_bounded(self):
        with patch.object(market, "_request_chart", return_value=chart()) as request:
            with patch.object(market, "monotonic", return_value=0):
                await market.fetch_stock_history("INFY")
            with patch.object(market, "monotonic", return_value=301):
                await market.fetch_stock_history("INFY")
            self.assertEqual(request.call_count, 2)
            with patch.object(market, "_CACHE_MAX_ENTRIES", 2):
                await market.fetch_stock_history("TCS")
                await market.fetch_stock_history("RELIANCE")
            self.assertEqual(len(market._MEMORY_CACHE), 2)

    async def test_cancellation_does_not_cancel_shared_request(self):
        gate = asyncio.Event()
        async def provider(*args):
            await gate.wait()
            return chart()
        with patch.object(market, "_request_chart", side_effect=provider) as request:
            first = asyncio.create_task(market.fetch_stock_history("INFY"))
            second = asyncio.create_task(market.fetch_stock_history("INFY"))
            await asyncio.sleep(0)
            first.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await first
            gate.set()
            self.assertEqual((await second).status, "ok")
            self.assertEqual(request.call_count, 1)

    async def test_cached_freshness_recomputed_at_close(self):
        payload = chart(latest=NOW - timedelta(days=1))
        with patch.object(market, "_request_chart", return_value=payload) as request:
            with patch.object(market, "utc_now", return_value=NOW.replace(hour=9)):
                self.assertEqual((await market.fetch_stock_history("INFY")).status, "ok")
            self.assertEqual((await market.fetch_stock_history("INFY")).status, "stale")
            self.assertEqual(request.call_count, 1)

    async def test_alert_boundaries_and_negative_move(self):
        rows = parsed().history
        rows[-1] = rows[-1].model_copy(update={"volume": 200, "change_pct": -3.0})
        alerts = await market.detect_alerts("TEST.NS", "Test", rows)
        self.assertEqual({a.alert_type for a in alerts}, {"volume_spike", "price_move"})
        self.assertEqual(alerts[0].value, 2)
        self.assertEqual(await market.detect_alerts("TEST.NS", "Test", rows[:5]), [])
        for bad in [0, -1, float("inf"), float("nan")]:
            with self.assertRaises(ValueError):
                await market.detect_alerts("TEST.NS", "Test", rows, bad)

    async def test_rounding_does_not_create_price_threshold_crossing(self):
        payload = chart()
        quote(payload)["high"][-1] = 103
        quote(payload)["close"][-1] = 102.999
        result = parsed(payload)
        self.assertEqual(await market.detect_alerts("TEST.NS", "Test", result.history), [])
        quote(payload)["close"][-1] = 103
        alerts = await market.detect_alerts("TEST.NS", "Test", parsed(payload).history)
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0].alert_type, "price_move")


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_total_outage_never_complete(self):
        with patch("app.routers.portfolio.fetch_stock_history", new=AsyncMock(return_value=market.HistoryResult())):
            for route in ["portfolio", "alerts"]:
                response = self.client.get(f"/api/{route}")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "unavailable")
                self.assertEqual(response.json()["coverage"]["evaluated"], 0)
                self.assertEqual(len(response.json()["coverage"]["companies"]), 18)

    def test_partial_outage_reports_missing_company(self):
        async def fetch(ticker, *args):
            return market.HistoryResult() if ticker == "TCS.NS" else parsed()
        with patch("app.routers.portfolio.fetch_stock_history", side_effect=fetch):
            response = self.client.get("/api/alerts").json()
            self.assertEqual(response["status"], "partial")
            self.assertEqual(response["coverage"]["evaluated"], 17)
            self.assertEqual(response["alerts"], [])
            missing = [c for c in response["coverage"]["companies"] if c["status"] != "ok"]
            self.assertEqual(missing[0]["ticker"], "TCS.NS")

    def test_successful_empty_scan_is_complete(self):
        with patch("app.routers.portfolio.fetch_stock_history", new=AsyncMock(return_value=parsed())):
            response = self.client.get("/api/alerts").json()
            self.assertEqual(response["status"], "complete")
            self.assertEqual(response["coverage"]["evaluated"], 18)
            self.assertEqual(response["alerts"], [])

    def test_stale_and_incomplete_history_skip_alerts(self):
        for result in [parsed(chart(5)), parsed(chart(latest=NOW - timedelta(days=2)))]:
            with patch("app.routers.portfolio.fetch_stock_history", new=AsyncMock(return_value=result)):
                response = self.client.get("/api/alerts").json()
                self.assertNotEqual(response["status"], "complete")
                self.assertEqual(response["coverage"]["evaluated"], 0)
                self.assertEqual(response["alerts"], [])

    def test_invalid_thresholds_rejected_before_provider_call(self):
        with patch("app.routers.portfolio.fetch_stock_history", new=AsyncMock()) as fetch:
            for name in ["volume_threshold", "price_threshold"]:
                for value in ["-1", "0", "NaN", "inf", "abc", "1001"]:
                    with self.subTest(name=name, value=value):
                        self.assertEqual(self.client.get(f"/api/alerts?{name}={value}").status_code, 422)
            fetch.assert_not_called()

    def test_detail_invalid_missing_and_outage(self):
        self.assertEqual(self.client.get("/api/portfolio/BAD_SYMBOL").status_code, 422)
        with patch("app.routers.portfolio.fetch_stock_history", new=AsyncMock(return_value=market.HistoryResult(status="no_data"))):
            self.assertEqual(self.client.get("/api/portfolio/UNKNOWN").status_code, 404)
        with patch("app.routers.portfolio.fetch_stock_history", new=AsyncMock(return_value=market.HistoryResult())):
            self.assertEqual(self.client.get("/api/portfolio/INFY").status_code, 503)

    def test_cors_explicit_origin_and_rejection(self):
        from fastapi import FastAPI
        from fastapi.middleware.cors import CORSMiddleware
        with patch.dict("os.environ", {"ALLOWED_ORIGINS": "https://finn-example.vercel.app"}):
            test_app = FastAPI()
            test_app.add_middleware(CORSMiddleware, allow_origins=allowed_origins(), allow_methods=["GET"])
        with TestClient(test_app) as client:
            for origin, expected in [("https://finn-example.vercel.app", 200), ("https://evil.vercel.app", 400)]:
                response = client.options("/api/portfolio", headers={"Origin": origin, "Access-Control-Request-Method": "GET"})
                self.assertEqual(response.status_code, expected)
        for value in ["https://*.vercel.app", "https://example.com/path", "https://user:pass@example.com"]:
            with patch.dict("os.environ", {"ALLOWED_ORIGINS": value}), self.assertRaises(ValueError):
                allowed_origins()


if __name__ == "__main__":
    unittest.main()
