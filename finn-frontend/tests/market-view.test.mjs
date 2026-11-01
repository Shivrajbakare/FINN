import test from "node:test";
import assert from "node:assert/strict";
import { chartPath, closePoints, formatINR } from "../src/lib/market-view.mjs";
import { startPolling } from "../src/lib/request-lifecycle.mjs";

test("charts use provided prices and never invent missing history", () => {
  assert.equal(chartPath([], 60, 20), "");
  assert.equal(chartPath([4], 60, 20), "");
  assert.notEqual(chartPath([10, 12, 11], 60, 20), chartPath([100, 90, 120], 60, 20));
  assert.equal(chartPath([4, 4], 60, 20), "M 2.0 10.0 L 58.0 10.0");
  assert.deepEqual(closePoints({}), []);
  assert.equal(formatINR(null), "Unavailable");
});

test("refresh repeats after completion and stops cleanly on navigation", async () => {
  let scheduled, signal, calls = 0;
  const received = [];
  const timers = { setTimeout(fn, delay) { assert.equal(delay, 300000); scheduled = fn; return 1; }, clearTimeout() { scheduled = null; } };
  const stop = startPolling(async (s) => { signal = s; return ++calls; }, (result) => received.push(result.data), 300000, timers);
  await new Promise(setImmediate);
  assert.deepEqual(received, [1]);
  await scheduled();
  assert.deepEqual(received, [1, 2]);
  stop();
  assert.equal(signal.aborted, true);
  assert.equal(scheduled, null);
});

test("a late refresh cannot overwrite the next page", async () => {
  let resolve;
  const received = [];
  const stop = startPolling(() => new Promise((done) => { resolve = done; }), (value) => received.push(value));
  stop(); resolve({ ticker: "OLD" });
  await new Promise(setImmediate);
  assert.deepEqual(received, []);
});
