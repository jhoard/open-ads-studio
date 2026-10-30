// Record the five studio steps in demo mode for the demo video: one continuous take with a fake cursor,
// split into one clip per step, plus a timeline of zoom targets (preview frame, label-match chip, claims flag).
// Usage: GENERATION_MODE=demo app on :3101, then: npx tsx scripts/record-demo.ts [baseUrl] [outDir]
import { execFileSync } from "node:child_process";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3101";
const OUT = process.argv[3] ?? path.join("var", "demo", "capture");
const SIZE = { width: 1920, height: 1080 };
const CURSOR_STEPS = 28;

// The cursor is drawn by the page, so it lands in the recording; it follows real mouse events.
const CURSOR_SCRIPT = `
window.addEventListener("DOMContentLoaded", () => {
  const cursor = document.createElement("div");
  cursor.id = "demo-cursor";
  cursor.innerHTML = '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 17 L13 25 L16.5 23.5 L13 15.5 L20 15.5 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  Object.assign(cursor.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", transform: "translate(960px, 640px)", transition: "none" });
  document.body.appendChild(cursor);
  const ring = document.createElement("div");
  Object.assign(ring.style, { position: "fixed", width: "34px", height: "34px", margin: "-17px 0 0 -17px", borderRadius: "50%", border: "2px solid rgba(20,20,20,.55)", pointerEvents: "none", zIndex: "2147483646", opacity: "0", transition: "opacity .45s, transform .45s" });
  document.body.appendChild(ring);
  document.addEventListener("mousemove", (e) => { cursor.style.transform = "translate(" + (e.clientX - 4) + "px," + (e.clientY - 2) + "px)"; }, true);
  document.addEventListener("mousedown", (e) => {
    ring.style.transition = "none"; ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px"; ring.style.opacity = "1"; ring.style.transform = "scale(.4)";
    requestAnimationFrame(() => { ring.style.transition = "opacity .45s, transform .45s"; ring.style.opacity = "0"; ring.style.transform = "scale(1.3)"; });
  }, true);
});`;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Mark {
  name: string;
  at: number;
  box?: Box;
}

let started = 0;
const marks: Mark[] = [];
const now = (): number => (Date.now() - started) / 1000;
const mark = (name: string, box?: Box): void => {
  marks.push({ name, at: now(), ...(box ? { box } : {}) });
  console.log(`${now().toFixed(2)}s ${name}`);
};

async function moveTo(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("target not visible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: CURSOR_STEPS });
  await page.waitForTimeout(250);
}

async function click(page: Page, target: Locator): Promise<void> {
  await moveTo(page, target);
  await page.mouse.down();
  await page.mouse.up();
}

const boxOf = async (target: Locator): Promise<Box | undefined> => (await target.boundingBox()) ?? undefined;
const next = (page: Page, step: string): Locator => page.getByRole("button", { name: new RegExp(`Continue to ${step}`) });

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE } });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  started = Date.now();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(1500, 700);

  mark("brand");
  await page.waitForTimeout(2500);
  await moveTo(page, page.locator(".type-sheet").first());
  await page.waitForTimeout(1500);
  await moveTo(page, page.locator(".palette-sheet").first());
  await page.waitForTimeout(2500);
  await click(page, next(page, "Product"));

  mark("product");
  await page.waitForTimeout(2000);
  await click(page, page.getByRole("checkbox").first());
  await page.waitForTimeout(4000);
  await click(page, next(page, "Create"));

  mark("create");
  await page.waitForTimeout(1500);
  await moveTo(page, page.locator("#objective"));
  await page.selectOption("#objective", "sales");
  await page.waitForTimeout(1200);
  for (const name of ["Scene", "Reveal", "Cinemagraph"]) {
    const box = page.getByRole("checkbox", { name: new RegExp(name) }).first();
    if ((await box.getAttribute("aria-checked")) !== "true" && !(await box.isChecked().catch(() => false))) await click(page, box);
    else await moveTo(page, box);
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1200);
  await click(page, page.getByRole("button", { name: /^Create \d/ }));

  mark("review");
  await page.waitForTimeout(1500);
  const frame = page.locator(".comparison-frame").first();
  await frame.waitFor({ state: "visible", timeout: 20_000 });
  mark("preview", await boxOf(frame));
  mark("badge", await boxOf(page.getByText(/^Label match \d/).last()));
  // Drag the divider: model output on the left, restored label on the right.
  const area = await boxOf(frame);
  if (area) {
    const midY = area.y + area.height / 2, midX = area.x + area.width / 2;
    await page.mouse.move(midX, midY, { steps: CURSOR_STEPS });
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.2, midY, { steps: 40 });
    await page.waitForTimeout(600);
    mark("drag-right");
    await page.mouse.move(area.x + area.width * 0.85, midY, { steps: 70 });
    await page.waitForTimeout(800);
    await page.mouse.move(midX, midY, { steps: 40 });
    await page.mouse.up();
  }
  await page.waitForTimeout(2500);
  const claims = page.locator(".claims").first();
  await moveTo(page, claims);
  mark("claims", await boxOf(claims));
  await page.waitForTimeout(3500);
  await click(page, page.getByRole("button", { name: /^Approve$/ }).first()).catch(() => undefined);
  await page.waitForTimeout(2000);
  await click(page, next(page, "Export"));

  mark("export");
  await page.waitForTimeout(2500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(3500);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(2500);
  mark("end");

  await context.close();
  await browser.close();
  const [video] = (await readdir(OUT)).filter((name) => name.endsWith(".webm"));
  await rename(path.join(OUT, video), path.join(OUT, "take.webm"));
  await writeFile(path.join(OUT, "timeline.json"), JSON.stringify({ size: SIZE, marks }, null, 2));

  // One clip per step, cut on the logged marks.
  const steps = ["brand", "product", "create", "review", "export"];
  for (const [i, step] of steps.entries()) {
    const from = marks.find((m) => m.name === step)?.at ?? 0;
    const to = marks.find((m) => m.name === (steps[i + 1] ?? "end"))?.at ?? from + 10;
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", from.toFixed(2), "-to", to.toFixed(2), "-i", path.join(OUT, "take.webm"), "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-r", "30", "-an", path.join(OUT, `${i + 1}-${step}.mp4`)]);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
