import assert from "node:assert/strict";
import { test } from "node:test";
import { checkClaims } from "./claims-guard";

const guard = { blockedPhrases: ["cures", "clinically proven", "treats"], requiresSubstantiation: ["boosts performance", "improves focus"] };

test("flags a substantiation phrase without blocking", () => {
  assert.deepEqual(checkClaims("Boosts performance. Tastes like dessert.", guard), { status: "flagged", blocked: [], flagged: ["boosts performance"] });
});

test("blocks a blocked phrase even when a flag is also present", () => {
  const result = checkClaims("Clinically proven, and it improves focus.", guard);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blocked, ["clinically proven"]);
  assert.deepEqual(result.flagged, ["improves focus"]);
});

test("matches whole words only", () => {
  assert.equal(checkClaims("Little treatsy bites", guard).status, "clear");
  assert.equal(checkClaims("A bar that treats you well", guard).status, "blocked");
});

test("clears plain copy", () => {
  assert.equal(checkClaims("Strength, crafted in chocolate.", guard).status, "clear");
});
