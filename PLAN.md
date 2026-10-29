# Open Ads Studio: build plan

Status: awaiting approval. No app code written. On approval, start M0 and do not advance a milestone until the previous one runs end to end.

Times are PDT (UTC-7). Planning finished Wed Oct 28, about 5:45pm. Target submit Thu Oct 29, 10:00pm. Hard deadline Fri Oct 30, 9:00am, but Friday is not scheduled. Real window is about 28 hours, not 36.

## 1. What was read and verified (Wed Oct 28)

Read: CLAUDE.md, comfy-starter.vercel.app, and the four linked pages: [Router quickstart](https://docs.comfy.org/development/comfy-router/quickstart), [Queue](https://docs.comfy.org/development/comfy-router/queue), [SDKs](https://docs.comfy.org/development/api-development/sdks), [Router models](https://docs.comfy.org/development/comfy-router/models). Also the installed `@comfyorg/sdk` 0.5.0 source (`src/sdk/jobs.ts`, `client.ts`), `docs/brand-safety-ontology.md`, and `~/AI/design-creator`.

Live checks, free reads only, key never printed:
- `GET api.comfy.org/v2/models/{id}/openapi.json` for minimax-h3, ltx-2-5-fast, ltx-2-5-pro, qwen-image-3.0: all 200.
- `GET cloud.comfy.org/api/object_info` with the same key: 200, 3,857 node types with full model dropdowns.
- `GET cloud.comfy.org/api/experiment/models`: 200.

No generation submitted yet. Credits, and whether this workspace may submit Cloud jobs, are untested. That is the first M0 test.

### Model verification

| Stage | Allowlist model | Comfy Router | Comfy Cloud (same key, workflow client) | Decision |
| --- | --- | --- | --- | --- |
| cutout | BiRefNet / RMBG-2.0 | Absent. Only closed Bria/Veed endpoints | `BiRefNetRMBG` node (comfyui-rmbg): BiRefNet-general, BiRefNet-HR and others. Also an `RMBG` node | Cloud, BiRefNet-general (MIT weights). RMBG-2.0 skipped: noncommercial license |
| scene | Qwen-Image-Edit 2509 or Kontext dev | Absent. Only qwen-image-3.0 and flux-kontext-pro/max, closed | `qwen_image_edit_2509_{bf16,fp8_e4m3fn,fp8mixed}`, `TextEncodeQwenImageEditPlus`, `qwen_2.5_vl_7b` encoder, `qwen_image_vae`. Also `flux1-dev-kontext` | Cloud, Qwen-Image-Edit 2509 fp8 (Apache-2.0). Kontext dev is backup only (noncommercial) |
| vfx | LTX-2 I2V | Only ltx-2-5-fast/pro, schema input modality `["text"]`. No I2V | `ltx-2-19b-{dev,distilled}` fp8 and bf16, `LTXVImgToVideo`, `LTX2_video_vae`, `LTX2_audio_vae`, gemma_3_12B encoder | Cloud, LTX-2 19B distilled fp8, I2V |
| hero | MiniMax H3 | `minimax/minimax-h3` exists (T,I to V+A, first/last frame, 768P/2K, 4 to 15s), but it dispatches to MiniMax's hosted API. Hosted stages (Context-IR, 2K regenerate) are not open weights | `minimax_h3_fl2va_pruned_int8_convrot`, core node `MiniMaxH3ImageToVideo` (first_frame, last_frame, 24fps, 124 frames is about 5s), `minimax_h3_video_vae`, `minimax_h3_audio_vae`, `qwen3vl_32b_minimax_h3` encoder | Cloud, H3-Base FL2VA. Router H3 is NOT used: it is a closed hosted API |

Conclusion (backend approved by James): Router cannot run this pipeline open-weight. Comfy Cloud runs our own API-format `/workflows/*.json` against open-weight checkpoints, and those exact files run unchanged on local ComfyUI, so hosted and local are the same artifact. Fallback if Cloud submission is refused: self-hosted ComfyUI on Runpod plus `comfy-api-proxy` (port 8189, `COMFY_BASE_URL`), same JSONs.

Guardrail: Cloud also exposes 308 closed API nodes (for example `FluxKontextProImageNode`, `MinimaxHailuo03TextToVideoNode`). `scripts/check-workflows.ts` fails if any workflow uses a node whose `object_info` entry has `api_node: true`. That check is the open-weights proof shown in the README and the demo.

CLAUDE.md still says "Comfy Router for hosted runs" and "M0: one Router call". Update both lines after approval.

## 2. Reuse inventory

| Item | Disposition |
| --- | --- |
| `package.json` | Reuse `@comfyorg/sdk ^0.5.0`. Rewrite for Next.js (ESM, scripts), license to Apache-2.0 |
| `package-lock.json`, `node_modules/` | Keep, update via npm. tsx stays for scripts |
| `.env` | Keep in place, server-only, loaded with `dotenv.config({ override: true })` |
| `.env.example`, `.gitignore` | Extend (section 7) |
| `.claude/commands/plan-build.md` | Keep |
| `docs/brand-safety-ontology.md` | Reuse as is. Taxonomy, graded risk, `brand_safety` block, `claims_guard`, badge and metadata fields, `provenance` block, and the Tauvel demo moment all come from it verbatim. Implement as `src/lib/disclosure/ontology.ts` plus the badge renderer. No new terms invented |
| `~/AI/design-creator/src` (Design Extractor) | Vendor into `packages/design-extract/`: `extractor.js` (`extractDesign(url)`), `formatter.js` (`formatDesignMd()`), and `extractors/` (colors, typography, tokens, assets, spacing, layout, effects, components, animations). About 1,400 lines, ESM, deterministic, no LLM calls, no license file (James's own code, relicensed Apache-2.0 here). Rewrite: an adapter from its output to the Brand record. Drop: `server.js`, `bin/`, express/chalk/ora/commander, `screenshot.js` unless logos need it |
| Playwright on Vercel | Does not run on serverless as is. Ship order: cached Tauvel DESIGN.md plus paste/upload of any DESIGN.md first, local `npm run extract <url>` second, serverless crawl (`@sparticuz/chromium`) only if time remains |
| Old PLAN.md draft | Replaced by this file. It predated the Comfy Cloud finding |
| Stykii resumable batch runner | Pattern only: per-item status records, resume by stored job ID. Reimplemented in `src/lib/jobs/` |
| Dropped | npm placeholder `main`/`test`, ISC license |

## 3. Architecture

- Next.js (App Router, TypeScript) on Vercel. Node 22+ (local Node is v26.7.0).
- Server-only `new Comfy({ apiKey })` against `cloud.comfy.org`, or `COMFY_BASE_URL` for local/Runpod. The browser never sees the key.
- Async pattern per stage:
  - `POST /api/stage` uploads inputs, loads `/workflows/<stage>.json`, binds inputs, submits, stores `{stage, job_id, workflow_sha}`, and returns immediately.
  - `GET /api/stage/:id` calls `client.jobs.get(job_id)` then `refresh()`, maps queued/running/completed to UI states, and shows queue position but never an invented percent.
  - `job.error` is surfaced as `error_type`.
  - On completion, outputs are copied to durable storage before `expiresAt`.
- `timeout=660`: SDK timeouts are milliseconds, so `GENERATION_WAIT_TIMEOUT_SECONDS=660` becomes `timeoutMs: 660_000` in scripts and is the UI wait threshold. Past 660s the UI says "still running" and keeps polling the same job, with no resubmit.
- Idempotency: each Run has an `idempotency_key`, and each stage key is `run:stage:variant`. A stored job ID means no new submit.
- Storage: Vercel Blob for uploads, outputs, and JSON records (brand, product, run, creative). Local dev uses `./var/`. No database for this build.
- Copy line: deterministic templates per objective, filled from brand tone and product. No closed LLM. Every line runs through `claims_guard`: a blocked phrase rejects the line and picks another template, a substantiation phrase is flagged in the UI. One demo template deliberately carries "boosts performance" so the flag shows (ontology section 6). Stretch: an open-weight text model in a Cloud workflow.
- Export: crop/pad to 9:16, 1:1 and 16:9, plus copy line and `AI-generated` badge, as a deterministic `export.json` (scale, pad, composite, `SaveVideo` keeps audio). So no FFmpeg on Vercel. If a badge overlay on video is not workable in core nodes, fall back to canvas compositing for stills and badge-as-sidecar for video, recorded as a cut. A metadata sidecar JSON carries the ontology `ai_generated`, `models`, `generator`, `disclosure_basis`, `brand_safety` and `provenance` fields.
- Router: an optional, off-by-default adapter only. Not in the demo.

Data model mirrors CLAUDE.md exactly (Brand, Product, Run, Creative). Creative gains the ontology's `brand_safety` and `provenance` blocks. A `StageJob {creative_id, stage, backend, job_id, workflow_sha, seed, status, error_type, outputs, created_at}` record handles resume.

## 4. Milestones (ordered by risk)

| Milestone | PT window | Gate (must run end to end) | Cut first if behind |
| --- | --- | --- | --- |
| M0 | Wed 6:00pm to 8:30pm | First, a 15-minute Cloud smoke test: a tiny BiRefNet job via script. Then a minimal Next.js page: upload image, `vfx-ltx.json` (LTX-2 distilled I2V, about 4s, 768x512) submitted to Comfy Cloud, polled, video plays in the browser, Download saves the MP4, and a refresh mid-job resumes. Nothing else until green | Styling, aspect choices, prompt field. Never cut: real I2V, playback, download, resume |
| M1 | Wed 8:30pm to 11:30pm | `cutout.json` (BiRefNet), then `scene.json` (Qwen-Image-Edit 2509, palette and tone text from the cached Tauvel DESIGN.md, 3 seeds), then a variant picker with the selection persisted | 3 parallel variants become 1 seed run 3 times in sequence. Then drop the cutout from the scene input and edit the original photo directly |
| M2 | Wed 11:30pm to Thu 2:00am | Selected still to an LTX VFX beat and an H3-Base hero with native audio, both async in parallel, `error_type` shown, 660s threshold, audio stream verified | H3 length 124 to 107 frames, lower res. Then H3 without last frame. If H3 cannot run on Cloud at all, the hero becomes the LTX-2 clip with its native audio and the H3 bonus is dropped. James decides; never silent |
| Sleep | Thu 2:00am to 7:00am | Long jobs may run overnight from a script | |
| M3 | Thu 7:00am to 9:30am | Vendored Extractor: `npm run extract https://tauvel...` writes DESIGN.md plus Brand JSON. The app imports it (and any pasted DESIGN.md) into an editable brand kit that feeds scene prompts | Serverless crawl (already last). Then logo extraction. Never cut: cached Tauvel brand kit |
| M4 | Thu 9:30am to 12:30pm | Ontology category and risk on the Product, copy line plus claims guard flag, `export.json` to 9:16, 1:1, 16:9 with badge, metadata and provenance sidecar, ZIP download. UI polish | Animated badge, ZIP (individual downloads instead), 3:4 export. Never cut: visible badge, claims flag |
| M5 | Thu 12:30pm to 4:30pm | README, Apache-2.0 LICENSE, THIRD_PARTY_NOTICES, all workflows re-run from a clean clone, `check-workflows` passes, local ComfyUI and Runpod steps, Vercel deploy with an incognito smoke test | Docker, Runpod template (keep the written steps), custom domain |
| M6 | Thu 4:30pm to 9:00pm | Feature freeze. Record the demo (under 2:00), edit, draft the social post, check all links signed-out | Extra takes, music bed |
| Buffer | Thu 9:00pm to 10:00pm | James approves, posts with #OpenSourceHiggsfield, submits | Fixes to broken links only |

Rule: if a gate slips 30+ minutes, apply its first cut and record it. At Thu 12:30pm, protect M5 and M6 regardless.

## 5. Risks and the cheapest 15-minute test

| Risk | 15-minute test | If it fails |
| --- | --- | --- |
| Workspace cannot submit Comfy Cloud jobs (subscription or credits) | `scripts/smoke-cloud.ts`: upload a 512px image, run a 3-node BiRefNet workflow, save the PNG | James tops up or subscribes. Else Runpod plus `comfy-api-proxy`, same JSONs |
| H3 int8 FL2VA unstable or too slow on Cloud | Submit a 124-frame 768p I2V from the Tauvel photo while the M0 UI is being built, and time it | Shorter length, lower res, then the LTX audio hero (James approves) |
| LTX-2 I2V job runs past 660s | Time the M0 job on distilled 8-step fp8 | Fewer frames, 512p |
| Qwen edit loses product identity or label | One scene from the real Tauvel photo; inspect logo and shape | Composite the BiRefNet cutout over a Qwen-generated background at a deterministic placement |
| Cloud output URL shape and expiry | Inspect `job.outputs` and `expiresAt` on the smoke job | Download via the SDK `toFile`, then upload to Blob |
| Vercel body or time limits on upload/submit | Submit from a deployed preview with a 5MB image | Client uploads straight to Blob; the server passes the URL |
| Closed node slips into a workflow | Run `check-workflows` against `object_info` | Fail the build |
| Extractor misreads tauvel.com (JS-heavy site) | `npm run cli -- <tauvel url>` in `~/AI/design-creator` tonight, before vendoring | Hand-edit the cached DESIGN.md |
| License claims (H3 and LTX-2 community licenses) | Read both license texts before writing the README | State the terms accurately. The app license does not relicense weights |

## 6. Demo video shot list (1:55)

| Time | Shot | Spoken line (names on camera) |
| --- | --- | --- |
| 0:00 to 0:08 | Final 9:16 Tauvel hero ad with audio | "Open Ads Studio: one product photo and a brand URL in, a finished ad out." |
| 0:08 to 0:20 | Paste the Tauvel URL, brand kit fills (palette, fonts, tone), DESIGN.md preview | "It reads the brand and writes a DESIGN.md." |
| 0:20 to 0:38 | Upload photo, BiRefNet cutout, three Qwen-Image-Edit scenes, pick one | "Every step is a ComfyUI workflow. BiRefNet cuts it out, Qwen-Image-Edit 2509 builds three on-brand scenes." |
| 0:38 to 0:50 | `scene.json` graph in ComfyUI, then the `check-workflows` pass | "Open weights only: no API nodes, and the same JSON runs on your own GPU." |
| 0:50 to 1:05 | VFX beat plays | "LTX-2 adds the VFX beat, a light sweep across the bar." |
| 1:05 to 1:25 | Hero clip with audio, status card going queued, running, done | "MiniMax H3 generates the hero shot with native audio, as async, resumable jobs." |
| 1:25 to 1:45 | Copy line with "boosts performance" flagged by the claims guard, then the export grid (9:16, 1:1, 16:9) with the AI-generated badge and sidecar | "Tauvel has creatine, so performance claims get flagged, and every export carries FTC and EU AI Act disclosure." |
| 1:45 to 1:55 | GitHub repo `/workflows`, deployed URL | "Run it on Comfy Cloud, locally, or on Runpod. Link below. #OpenSourceHiggsfield" |

Waits are cut with a visible elapsed-time label. No prepared output is passed off as live.

## 7. Repo layout

```text
README.md  LICENSE  THIRD_PARTY_NOTICES.md  PLAN.md  CLAUDE.md
.env.example  .gitignore  package.json  next.config.ts  tsconfig.json
workflows/
  cutout.json  scene.json  vfx-ltx.json  hero-h3.json  export.json
  manifest.json            # input/output node IDs, checkpoints, licenses
packages/design-extract/   # vendored from ~/AI/design-creator/src
src/app/                   # studio pages + /api routes
src/components/            # brand kit, uploader, variant picker, player, exports
src/lib/comfy/             # client factory, workflow loader, input binding
src/lib/jobs/              # StageJob records, submit/status/resume
src/lib/brand/             # Extractor adapter, DESIGN.md import
src/lib/disclosure/        # ontology, claims guard, badge, sidecar
src/lib/copy/              # copy-line templates
src/lib/storage/           # Blob (prod) / ./var (dev)
scripts/                   # smoke-cloud.ts, check-workflows.ts, run-workflow.ts, extract.ts
docs/                      # brand-safety-ontology.md, model-evidence.md, local-comfyui.md, runpod.md, demo-script.md
public/demo/               # Tauvel inputs and cached DESIGN.md
```

`.env.example`:

```dotenv
# Comfy Platform key from platform.comfy.org (needs credits; 402 means top up)
COMFY_API_KEY=
# Workflow backend: empty = Comfy Cloud. http://127.0.0.1:8189 = local ComfyUI + comfy-api-proxy. Or your Runpod URL
COMFY_BASE_URL=
GENERATION_WAIT_TIMEOUT_SECONDS=660
# Vercel Blob for durable assets in production; empty locally uses ./var
BLOB_READ_WRITE_TOKEN=
MAX_CONCURRENT_RUNS=2
```

`.gitignore` adds: `.next/ .vercel/ .env.* !.env.example var/ models/ *.safetensors *.log .DS_Store *.tsbuildinfo`.

## 8. License

Apache-2.0. It is as permissive as MIT but adds an explicit patent grant and a NOTICE convention, which suits generative-media tooling. The SDK we depend on is MIT, which is compatible. The vendored Extractor is James's own code, so it ships under the same license. Model weights keep their own terms (BiRefNet MIT, Qwen-Image-Edit Apache-2.0, LTX-2 Community License, MiniMax H3 Community License). Those are listed in THIRD_PARTY_NOTICES.md, downloaded separately, and never committed.

## 9. On approval

1. Update CLAUDE.md's backend and M0 lines from Router to Comfy Cloud workflows.
2. Initial commit of the planning files (CLAUDE.md, PLAN.md, docs, .env.example, .gitignore).
3. Start M0 with the Cloud smoke test.
