import test from "node:test";
import assert from "node:assert/strict";
import { KIND_LABELS, researchStatusMessage } from "../src/lib/research-status.mjs";

test("unsupported and unavailable snapshots never claim verified research", () => {
  assert.match(researchStatusMessage({ status: "unsupported" }), /unsupported/);
  assert.match(researchStatusMessage({ status: "unavailable" }), /could not be verified/);
  for (const status of ["unsupported", "unavailable", "partial"]) {
    assert.doesNotMatch(researchStatusMessage({ status }), /Source-verified historical excerpts/);
  }
});

test("available research remains explicitly historical and extractive", () => {
  const message = researchStatusMessage({ status: "available" });
  assert.match(message, /historical excerpts/);
  assert.match(message, /not AI-generated financial estimates/);
});

test("guidance and reported actuals have distinct labels", () => {
  assert.match(KIND_LABELS.reported_actual, /management-reported/);
  assert.match(KIND_LABELS.management_guidance, /forward-looking/);
  assert.notEqual(KIND_LABELS.reported_actual, KIND_LABELS.management_guidance);
  assert.equal(KIND_LABELS.analyst_estimate, undefined);
});
