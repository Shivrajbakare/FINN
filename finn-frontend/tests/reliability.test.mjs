import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiBase } from "../src/lib/api-config.mjs";
import { DEFAULT_SETTINGS, readSettings, normalizeSettings, getSettingsSnapshot, saveSettings, subscribeSettings, SETTINGS_KEY } from "../src/lib/settings-store.mjs";
import { emptyAlertsMessage, scanMessage } from "../src/lib/scan-status.mjs";
import { startRequest } from "../src/lib/request-lifecycle.mjs";

test("production requires explicit HTTPS API base", () => {
  for (const value of [undefined, "", "http://api.example.com/api", "https://localhost/api", "https://127.0.0.1/api", "https://[::1]/api", "https://127.2.3.4/api", "https://app.localhost/api", "https://0.0.0.0/api"]) {
    assert.throws(() => resolveApiBase(value, true));
  }
  assert.equal(resolveApiBase("https://api.example.com/api/", true), "https://api.example.com/api");
  assert.equal(resolveApiBase(undefined), "http://localhost:8000/api");
});

test("malformed API bases and embedded credentials are rejected", () => {
  for (const value of ["invalid", "/api", "https://example.com", "https://u:p@example.com/api", "https://example.com/api?token=x", "https://example.com/api#hash"]) {
    assert.throws(() => resolveApiBase(value));
  }
});

test("saved thresholds survive serialization and legacy digest field is ignored", () => {
  const storage = { getItem: () => '{"volMultiplier":4,"priceChangeThreshold":6,"windowDays":7}' };
  assert.deepEqual(readSettings(storage), { volMultiplier: 4, priceChangeThreshold: 6 });
});

test("corrupt, missing, out-of-range, or inaccessible storage uses safe defaults", () => {
  for (const raw of [null, "broken", "null", "[]", '{"volMultiplier":-1,"priceChangeThreshold":"6"}']) {
    assert.deepEqual(readSettings({ getItem: () => raw }), DEFAULT_SETTINGS);
  }
  assert.deepEqual(readSettings({ getItem() { throw new Error("blocked"); } }), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ volMultiplier: Infinity, priceChangeThreshold: NaN }), DEFAULT_SETTINGS);
});

test("same-tab saves notify subscribers and new reads use persisted values", () => {
  const target = new EventTarget();
  const memory = new Map();
  globalThis.window = {
    localStorage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  };
  try {
    let changes = 0;
    const unsubscribe = subscribeSettings(() => changes++);
    assert.equal(saveSettings({ volMultiplier: 3, priceChangeThreshold: 5 }), true);
    assert.equal(changes, 1);
    assert.deepEqual(JSON.parse(getSettingsSnapshot()), { volMultiplier: 3, priceChangeThreshold: 5 });
    assert.ok(memory.has(SETTINGS_KEY));
    const external = new Event("storage");
    Object.defineProperty(external, "key", { value: SETTINGS_KEY });
    target.dispatchEvent(external);
    assert.equal(changes, 2);
    unsubscribe();
    saveSettings(DEFAULT_SETTINGS);
    assert.equal(changes, 2);
  } finally { delete globalThis.window; }
});

test("failed writes never claim settings were saved", () => {
  globalThis.window = { localStorage: { setItem() { throw new Error("blocked"); } } };
  try { assert.equal(saveSettings(DEFAULT_SETTINGS), false); }
  finally { delete globalThis.window; }
});

test("empty partial, stale and unavailable scans never claim no threshold crossings", () => {
  for (const status of ["unavailable", "partial", "stale"]) {
    const scan = { status, coverage: { evaluated: status === "partial" ? 17 : 0, total: 18 } };
    assert.match(emptyAlertsMessage(scan), /not an all-clear/);
    assert.doesNotMatch(emptyAlertsMessage(scan), /No threshold crossings detected/);
    assert.doesNotMatch(scanMessage(scan), /Completed EOD scan/);
  }
});

test("complete empty scan has a distinct successful message", () => {
  const scan = { status: "complete", coverage: { evaluated: 18, total: 18 } };
  assert.match(emptyAlertsMessage(scan), /No threshold crossings detected/);
  assert.match(scanMessage(scan), /18 of 18/);
});

test("obsolete requests cannot overwrite newer settings results", async () => {
  let resolveOld, resolveNew, oldSignal;
  const received = [];
  const oldPromise = new Promise((resolve) => { resolveOld = resolve; });
  const newPromise = new Promise((resolve) => { resolveNew = resolve; });
  const cancel = startRequest((signal) => { oldSignal = signal; return oldPromise; }, (value) => received.push(value));
  cancel();
  startRequest(() => newPromise, (value) => received.push(value));
  resolveNew("new settings");
  await Promise.resolve();
  resolveOld("old settings");
  await Promise.resolve();
  assert.equal(oldSignal.aborted, true);
  assert.deepEqual(received, [{ data: "new settings", error: null }]);
});

test("navigation cleanup suppresses late failures", async () => {
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  const received = [];
  const cancel = startRequest(() => pending, (value) => received.push(value));
  cancel();
  reject(new Error("obsolete failure"));
  await Promise.resolve();
  assert.deepEqual(received, []);
});
