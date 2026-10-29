# Open Ads Studio

Open-weights rebuild of Higgsfield Ads Studio for Comfy's "Open Source Higgsfield" build night.
Product photo + brand URL in. On-brand ad stills and short video with audio out. All generation through ComfyUI workflows (the same `/workflows/*.json` run hosted on Comfy Cloud and locally on ComfyUI).

## Deadline and deliverables

- Submission due: Fri Oct 30, 2026, 9:00am PT. Internal target: Thu Oct 29, 10:00pm PT. Friday morning does not exist.
- Deliverables (all four):
  1. Public GitHub repo: app code, `/workflows/*.json`, OSS license, run-locally steps anyone can follow
  2. Demo video, 2:00 max. Must name ComfyUI, LTX-2, MiniMax H3, and the image model on camera
  3. Deployed link to try (Vercel)
  4. Social post with #OpenSourceHiggsfield

## Prize strategy

Open Weights Only track + "VFX built with LTX" bonus + "Built with MiniMax H3" bonus.

HARD CONSTRAINT: every generation step uses open-weight models only. No partner nodes, no closed APIs. FLUX 3 is closed (API only) and is NOT allowed. If a step cannot be done open-weight, stop and flag it. Never silently substitute a closed model.

Model allowlist:
- Background removal: BiRefNet or RMBG-2.0
- Product-in-scene stills: Qwen-Image-Edit 2509 or FLUX.1 Kontext dev
- VFX clip: LTX-2 (image-to-video)
- Hero clip with native audio: MiniMax H3 (image-to-video, first/last-frame mode available, up to 2K / 15s)

## Stack

- Next.js (TypeScript), `@comfyorg/sdk` 0.5.x workflow client (`new Comfy()`) against Comfy Cloud. Node 22.
- Backend decision (approved Oct 28): Comfy Router is NOT used for generation. Router lacks BiRefNet, Qwen-Image-Edit 2509 and LTX-2 I2V, and its H3 endpoint is MiniMax's closed hosted API. Comfy Cloud runs our API-format workflows on open-weight checkpoints. Fallback: self-hosted ComfyUI + `comfy-api-proxy` via `COMFY_BASE_URL`, same JSONs. See PLAN.md section 1.
- Workflows must contain no API (partner) nodes: `scripts/check-workflows.ts` rejects any node with `api_node: true` in Cloud `object_info`.
- Key lives in `.env` (`COMFY_API_KEY`, SF Build Night workspace). Load with override so it beats the shell. Never print it, never commit it, `.env.example` only.
- Long runs: `timeout=660` means `timeoutMs: 660_000` in the TS SDK. Use `client.submit()` and rebuild with `client.jobs.get(id)` + `refresh()` for anything that outlives a web request. Surface `job.error` as `error_type` on finished jobs.
- Read these before touching the SDK: the four Comfy docs pages linked from https://comfy-starter.vercel.app/

## Data model (mirror Higgsfield Ads Studio faithfully)

- Brand: name, website, palette, logo, typography, tone, audience. Built from a URL. Stored as DESIGN.md plus JSON.
- Product: name, page URL, description, up to 8 photos, cutout.
- Run: brand_id, product_id, objective (sales | leads | traffic | awareness | engagement), aspect_ratio (1:1 | 9:16 | 16:9 | 3:4), count, status, idempotency_key.
- Creative: run_id, still, vfx_clip (LTX-2), hero_clip (MiniMax H3), copy line, disclosure label, export variants.

## Pipeline (one ComfyUI workflow JSON per stage in /workflows)

1. `cutout.json` background removal
2. `scene.json` product placed in on-brand scene, palette and tone injected from DESIGN.md, 3 variants per run
3. `vfx-ltx.json` LTX-2 short VFX beat (pour, smoke, light sweep, particles)
4. `hero-h3.json` MiniMax H3 hero clip with native audio
5. Export: 9:16, 1:1, 16:9 renders + copy line + AI-disclosure badge and metadata

## Reuse from James's existing work

- Brand-from-URL step: vendor the Design Extractor from `~/AI/design-creator` (ESM Node, Playwright, `extractDesign(url)` in `src/extractor.js`, `formatDesignMd()` in `src/formatter.js`, extractors for colors, typography, tokens, assets incl. logos and hero images). Copy `src/` into `packages/design-extract/`. Playwright Chromium does not run on Vercel serverless as-is: ship a cached Tauvel DESIGN.md plus a paste/upload fallback first, serverless crawl only if time remains.
- AI-disclosure badge and claims guard on exports: see `docs/brand-safety-ontology.md` (already adapted for this app, includes the Tauvel demo moment). No vault access needed.
- Async run pattern: Stykii's resumable Node.js batch runner (per-item status). Same shape as workflow submit / jobs.get / refresh.
- Demo brand and product: Tauvel (James's own brand). No other brands, no stock product shots, no identifiable people or likenesses; distant silhouettes for scale are fine.

## Working rules

- Milestone gating: do not advance a milestone until the previous one runs end to end.
- M0 first, before anything else: one Comfy Cloud workflow run (LTX-2 I2V), image in, video out, displayed and downloadable.
- No em dashes anywhere: not in code, comments, UI copy, README, or commit messages. Use a colon, comma, or period.
- Ask at most 3 questions at a time, batched.
- Prefer boring, working code over clever code. Polish goes into the UI, not the architecture.
- Commit small and often. Conventional commit messages.
- Start with `/plan-build` to produce PLAN.md, then get approval before writing app code.
- Plan of record: `docs/PLAYBOOK.md` (supersedes PLAN.md for milestones, cut list and pipeline rules). Update the Status column in its section 5 whenever a milestone lands.
