import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { kitFromDesignMd, pickTheme } from "../brand-kit";
import { checkClaims } from "../claims-guard";
import { safetyForCreative } from "../studio";
import { loadBrandSafety } from "./catalog";
import { renderStill } from "./export-render";
import { buildProvenance } from "./provenance";
import { relightPrompt } from "./prompts";

const brand = kitFromDesignMd("# North Goods\n- Tone: Calm and practical.\n#224466 #ffffff", [{ id: "linen-ritual", label: "Linen ritual", surface: "linen", props: "coffee beans", light: "daylight" }]);

test("custom-brand export uses its palette and name without a sample logo or local brand files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "oas-brand-test-"));
  try {
    const source = path.join(dir, "product.png");
    await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#999999" } }).png().toFile(source);
    const disclosure = { models: ["Qwen-Image-Edit 2509"], basis: [], provenanceRef: "provenance.json" };
    const output = await renderStill(source, "16:9", brand, "Made for outside.", disclosure);
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.width, 1920);
    assert.equal(metadata.height, 1080);
    const pixel = await sharp(output).extract({ left: 1900, top: 20, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    assert.equal(`#${pixel.toString("hex")}`, pickTheme(brand.palette.map((color) => color.hex)).surface);
    const renamed = await renderStill(source, "16:9", { ...brand, name: "East Goods" }, "Made for outside.", disclosure);
    const logo = { left: 960, top: 180, width: 240, height: 141 };
    assert.notDeepEqual(await sharp(output).extract(logo).raw().toBuffer(), await sharp(renamed).extract(logo).raw().toBuffer());
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("custom provenance references the submitted brand and uploaded assets without supplement assumptions", async () => {
  const safety = safetyForCreative({ brand, productId: "uploaded-product" }, await loadBrandSafety());
  const provenance = await buildProvenance({ brand, productId: "uploaded-product", stage: "scene-relight", label: "Scene", seed: 7, generatedAt: null, example: false, copy: "Made for outside.", claims: checkClaims("Made for outside.", safety.claimsGuard), labelMatch: 0.99, safety, sizes: ["16:9"], fromScene: false });
  assert.equal(provenance.brand, "North Goods");
  assert.match(provenance.brand_ref as string, /^brand.json@[a-f0-9]{12}$/);
  assert.match(provenance.input_assets as string, /uploaded by the user/);
  assert.doesNotMatch(JSON.stringify(provenance), /Tauvel|Supplement:|GPT Image/);
  const prompt = relightPrompt(brand.sceneDirections[0], brand);
  assert.match(prompt, /#224466/);
  assert.match(prompt, /Calm and practical/);
  assert.doesNotMatch(prompt, /espresso|chocolate|coffee/);
});
