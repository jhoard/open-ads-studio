import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveDirectionIds, parseDesignMd, pickTheme, toDesignMd, type BrandKit } from "./brand-kit";

test("dark-dominant palettes get the dark sets", () => {
  assert.deepEqual(deriveDirectionIds([{ color: "#111111", weight: 70 }, { color: "#f5f0e8", weight: 30 }]), ["slate-beam", "dark-stone-evening"]);
});

test("light-dominant palettes get linen and travertine", () => {
  assert.deepEqual(deriveDirectionIds([{ color: "#ffffff", weight: 80 }, { color: "#1f3a2e", weight: 20 }]), ["linen-ritual", "travertine-morning"]);
});

test("theme picks a dark hued surface and a saturated mid-tone accent", () => {
  assert.deepEqual(pickTheme(["#f2eadf", "#1f3a2e", "#b8925a", "#2b1a12"]), { surface: "#2b1a12", accent: "#b8925a" });
});

test("an Extractor DESIGN.md yields name, palette and fonts", () => {
  const markdown = "# DESIGN.md: Acme | Coffee gear\n\n## Colors\n| Swatch | Hex |\n|---|---|\n| x | `#1A2B3C` |\n| x | `#ffcc00` |\n\n### Font Families\n| Font | Full Stack | Usage |\n|---|---|---|\n| **Inter** | `Inter, sans-serif` | 40 |\n";
  const parsed = parseDesignMd(markdown);
  assert.equal(parsed.name, "Acme");
  assert.deepEqual(parsed.palette, ["#1a2b3c", "#ffcc00"]);
  assert.deepEqual(parsed.fonts, ["Inter"]);
});

test("an exported DESIGN.md round-trips the edited voice and directions", () => {
  const kit = {
    id: "acme",
    name: "Acme",
    website: "",
    tagline: "Gear for the slow pour.",
    logo: "",
    logoUrl: "",
    logoKind: "image",
    palette: [],
    typography: { display: "Inter", supporting: "Inter" },
    tone: "Warm and exact.",
    audience: "Home baristas.",
    sceneDirections: [{ id: "linen-ritual", label: "Linen ritual", surface: "linen", props: "beans", light: "window light" }],
    heroImages: [],
    theme: { surface: "#111111", accent: "#ffcc00" },
    source: "crawl",
    designMd: "# DESIGN.md: Acme\n\n| x | `#1A2B3C` |\n",
  } satisfies BrandKit;
  const parsed = parseDesignMd(toDesignMd(kit));
  assert.equal(parsed.tone, "Warm and exact.");
  assert.equal(parsed.audience, "Home baristas.");
  assert.equal(parsed.tagline, "Gear for the slow pour.");
  assert.deepEqual(parsed.directionIds, ["linen-ritual"]);
  assert.deepEqual(parsed.palette, ["#1a2b3c"]);
  // Exporting again does not stack a second voice section.
  assert.equal(toDesignMd({ ...kit, designMd: toDesignMd(kit) }).split("## Brand voice").length, 2);
});

test("a palette without dark colors still yields a dark, readable surface", () => {
  const { surface } = pickTheme(["#ffffff", "#f4d35e", "#ee964b"]);
  assert.ok(Number.parseInt(surface.slice(1, 3), 16) < 90);
});
