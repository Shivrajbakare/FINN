import test from "node:test";
import assert from "node:assert/strict";
import { groupDocuments, JOB_LABELS, snapshotFreshness, waitForJob } from "../src/lib/dynamic-research.mjs";

test("document groups preserve period identity", () => {
  const documents = [{ id: "a", document_type: "annual_report", reporting_period: "2025" }, { id: "b", document_type: "annual_report", reporting_period: "2024" }];
  assert.deepEqual(groupDocuments(documents).annual_report.map((doc) => doc.id), ["a", "b"]);
});
test("polling exposes actual job states and failures", async () => {
  const states = ["queued", "downloading", "extracting", "ready"];
  const result = await waitForJob(async () => ({ status: states.shift() }), new AbortController().signal, async () => {});
  assert.equal(result.status, "ready");
  await assert.rejects(waitForJob(async () => ({ status: "failed", message: "Invalid PDF" }), new AbortController().signal), /Invalid PDF/);
  assert.match(JOB_LABELS.queued, /worker/);
});
test("cancelled selection cannot return another document's research", async () => {
  const controller = new AbortController();
  await assert.rejects(waitForJob(async () => { controller.abort(); return { status: "ready" }; }, controller.signal), { name: "AbortError" });
});
test("history never labels expired or replaced evidence current", () => {
  assert.match(snapshotFreshness({ cache_expires_at: "2020-01-01" }), /Expired/);
  assert.match(snapshotFreshness({ status: "superseded" }), /Superseded/);
});
