import assert from "node:assert/strict";
import { test } from "node:test";
import type { Creative } from "./studio";
import { distinctReviewCreatives } from "./review-creatives";

const creative = (id: string, changes: Partial<Creative> = {}): Creative => ({
  id, recipe: "scene", demo: true, stage: "scene-relight", runId: id, label: "Scene", aspect: "3:4", seed: 0,
  comfyJobId: "", status: "succeeded", queuePosition: null, errorType: null, errorMessage: null,
  createdAt: "2026-10-29T12:00:00Z", startedAt: null, completedAt: null,
  outputUrl: "/examples/scene.png", outputKind: "image", rawUrl: "/examples/scene-raw.png", glyphsUrl: null,
  labelMatch: 0.99, modelLabelMatch: 0.5, waitTimeoutSeconds: 0, ...changes,
});

const distinct = (values: Creative[], copy: Record<string, string> = {}, approved: string[] = []) => distinctReviewCreatives(values, copy, new Set(approved));

test("repeated cached examples appear once, preserving newest-first order", () => {
  const rows = [creative("new"), creative("other", { outputUrl: "/examples/other.png" }), creative("old")];
  assert.deepEqual(distinct(rows).map((row) => row.id), ["new", "other"]);
  assert.equal(rows.length, 3);
});

test("independent live generations stay separate even with the same label and URL", () => {
  assert.equal(distinct([creative("one", { demo: false }), creative("two", { demo: false })]).length, 2);
});

test("the same live job record appears only once", () => {
  const row = creative("job", { demo: false });
  assert.equal(distinct([row, { ...row }]).length, 1);
});

test("different objectives and edited copy remain separate review decisions", () => {
  assert.equal(distinct([creative("one", { objective: "sales" }), creative("two", { objective: "leads" })]).length, 2);
  assert.equal(distinct([creative("one"), creative("two")], { one: "Edited line" }).length, 2);
});

test("an approved duplicate remains the visible representative", () => {
  assert.deepEqual(distinct([creative("new"), creative("approved")], {}, ["approved"]).map((row) => row.id), ["approved"]);
});

test("pending examples without outputs are not collapsed together", () => {
  assert.equal(distinct([creative("one", { outputUrl: null }), creative("two", { outputUrl: null })]).length, 2);
});
