# Open Ads Studio

An open-weights rebuild of Higgsfield Ads Studio, built for Comfy's "Open Source Higgsfield" build night (#OpenSourceHiggsfield).

Product photo + brand kit in. Label-exact ad stills and short video with audio out. Every generation step is an open-weight model running as a ComfyUI workflow; the JSON for each one is in [`/workflows`](workflows).

**What makes it different:** AI ad tools garble packaging. Open Ads Studio never lets a model repaint the label. The model relights the real packshot in place, then its gold glyphs, a protected region, are found and pasted back tone-matched to the scene, and motion is keyframed from first and last frames.

**Live:** https://open-ads-studio.vercel.app (demo mode: example renders, auto-deployed from `main`).

> Status: in active development during the event. See [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) for the plan, milestones and decisions.

## How the label stays exact

![Model alone vs restored: Qwen-Image-Edit relights the pack but repaints the small print; Open Ads Studio pastes the original glyphs back](docs/img/label-before-after.png)

1. **Protect mask.** The packshot ships with a mask of its gold glyphs (`assets/tauvel/packshot-v1-protect.png`): wordmark, monogram and small print. Those pixels are never taken from a model.
2. **The model owns the scene.** Qwen-Image-Edit 2509 gets the real packshot as its input image and relights it in place on the art-directed set (`workflows/scene-edit.json`). Light, shadow, surface and reflection are the model's; the label is not.
3. **Find the box.** The model reframes freely, so the app locates the pack in its output: green-pixel bounds for a first guess, then normalized cross-correlation on gradients to refine a separate X and Y scale plus shift.
4. **Paste tone-matched glyphs, reflection included.** The original glyphs are warped into place and scaled by the scene's local luminance (a float box blur of the model's own render), so the gold catches the new light. A vertically flipped copy goes into the reflection at 25% opacity, fading with depth.
5. **Per frame for video.** Cinemagraph clips run the same paste on every frame, with tone matching recomputed per frame, so moving light still lands on exact glyphs.
6. **Label-match score.** Each creative reports the SSIM structure term over the glyph mask, against the packshot, for the model alone and after the paste. On the example above: 49.0% before, 99.8% after. Review shows both numbers; video reports its worst frame.

The box detection and paste live in [`src/lib/server/glyph-paste.ts`](src/lib/server/glyph-paste.ts), the per-frame pass in [`clip-paste.ts`](src/lib/server/clip-paste.ts), the score in [`label-match.ts`](src/lib/server/label-match.ts). The figure is rebuilt with `npx tsx scripts/build-label-figure.ts`.

![Scene recipe: scene-edit.json on Comfy Cloud, then the label paste in app code](docs/img/scene-workflow.png)

## How it works

| Recipe | Output | Models | Workflows |
|---|---|---|---|
| Scene | Hero still: the packshot relit in place on an art-directed set | Qwen-Image-Edit 2509 | `scene-edit.json` + glyph paste |
| Reveal (Draft) | The bar rises out of the sleeve, fast preview | LTX-2 19B distilled | `vfx-ltx-reveal.json` |
| Reveal (Final) | Same reveal with native audio | MiniMax H3-Base FL2VA | `hero-h3.json` |
| Cinemagraph | A Scene still comes alive: steam, light, room tone | MiniMax H3-Base FL2VA | `hero-h3.json` + per-frame glyph paste |

Deterministic steps (no model): copy-line templates and the claims guard, export layouts (9:16, 1:1, 16:9) with the logo, end card and AI-disclosure badge, box detection and the protected-glyph paste (tone-matched, plus its reflection), and post (`scripts/post-vfx.ts`: frame holds and an eased push-in, via ffmpeg).

Rule for every recipe: nothing occludes the protected label region. Effects stay behind or below the pack.

## Setup

Requirements: Node 22+, ffmpeg on your PATH (for the post step), and a Comfy Platform API key with credits.

```bash
git clone https://github.com/jhoard/open-ads-studio.git
cd open-ads-studio
npm install
cp .env.example .env      # then set COMFY_API_KEY
npm run dev               # http://localhost:3000
```

The key stays server-side. `.env` is loaded with override, so it beats any key in your shell.

`GENERATION_MODE=demo` serves the bundled example renders and never calls Comfy; it is the default on Vercel, so a public link cannot spend credits. Locally the default is `live`.

Tests: `npm test` (claims guard, export layouts, brand kit and DESIGN.md round trip).

### Brand from a URL

The Brand step runs the Design Extractor (vendored in `packages/design-extract`) on the site you paste: palette, typography, logo and hero images become the brand kit, and scene directions start from the palette (dark-dominant brands get Slate beam and Dark stone evening, light-dominant ones Linen ritual and Travertine morning). Locally it uses Playwright's Chromium (`npx playwright-core install chromium` once if you have none cached); on Vercel it uses `@sparticuz/chromium`. If a crawl fails or runs past 45 s, the cached Tauvel kit loads with a notice. Download DESIGN.md exports the kit in the Extractor's format with your tone, audience and scene-direction edits appended; Import DESIGN.md reads one back. The crawler only visits public http(s) sites; local and private addresses are refused.

Run recipes from the command line:

```bash
npx tsx scripts/run-relight.ts                                  # Scene still (relight in place + glyph paste)
npx tsx scripts/run-cinemagraph.ts <scene.png>                  # Cinemagraph from a finished Scene
npx tsx scripts/run-vfx.ts vfx-reveal 3:4 "<motion prompt>"     # Reveal, Draft (LTX-2)
npx tsx scripts/run-vfx.ts hero-h3 3:4 "<motion prompt>"        # Reveal, Final (H3)
npx tsx scripts/post-vfx.ts in.mp4 out.mp4                      # holds + push-in
```

Outputs land in `var/` (git-ignored).

### Backends

- **Comfy Cloud (default):** the app submits the API-format workflows in `/workflows` to `cloud.comfy.org` with the `@comfyorg/sdk` workflow client. All checkpoints are open weights hosted there; the workflows contain no API (partner) nodes.
- **Your own GPU:** see [Run it yourself](#run-it-yourself). Same workflow JSONs, pointed at your ComfyUI with `COMFY_BASE_URL`.

## Run it yourself

The app talks to any Comfy API v2 surface. Comfy Cloud is the default; to use your own GPU, run ComfyUI, put [`comfy-api-proxy`](https://github.com/Comfy-Org/comfy-api-proxy) (MIT) in front of it, and point the app at the proxy:

```bash
# 1. ComfyUI v0.43.0 or newer (SaveImageAdvanced, used by scene-edit, landed in v0.40.0)
git clone https://github.com/Comfy-Org/ComfyUI && cd ComfyUI && git checkout v0.43.0
pip install -r requirements.txt
# cutout only: the BiRefNet node pack (GPL-3.0); every other node is core ComfyUI
git clone https://github.com/1038lab/ComfyUI-RMBG custom_nodes/ComfyUI-RMBG
pip install -r custom_nodes/ComfyUI-RMBG/requirements.txt
python main.py                      # serves 127.0.0.1:8188

# 2. The v2 API proxy, in another shell
pip install comfy-api-proxy
comfy-api-proxy --comfyui http://127.0.0.1:8188 --port 8189

# 3. The app, with no Cloud key needed
COMFY_BASE_URL=http://127.0.0.1:8189 npm run dev
```

`COMFY_BASE_URL` is read by `@comfyorg/sdk` itself (`new Comfy()` in `src/lib/server/jobs.ts`); unset, it targets `https://cloud.comfy.org`. A Runpod pod or any other host works the same way: run ComfyUI and the proxy there and set `COMFY_BASE_URL` to its URL.

Model files go in `ComfyUI/models/<folder>/` with exactly these names (the workflows reference them by filename):

| Workflow | Folder | File | Size | Download |
|---|---|---|---|---|
| `cutout.json` | `RMBG/BiRefNet/` | `BiRefNet-general.safetensors` | 0.9 GB | [1038lab/BiRefNet](https://huggingface.co/1038lab/BiRefNet) (the node downloads it on first run) |
| `scene-edit.json` | `diffusion_models/` | `qwen_image_edit_2509_fp8_e4m3fn.safetensors` | 20.4 GB | [Comfy-Org/Qwen-Image-Edit_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_fp8_e4m3fn.safetensors) |
| | `text_encoders/` | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | 9.4 GB | [Comfy-Org/Qwen-Image_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors) |
| | `vae/` | `qwen_image_vae.safetensors` | 0.25 GB | [Comfy-Org/Qwen-Image_ComfyUI](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors) |
| | `loras/` | `Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors` | 0.85 GB | [lightx2v/Qwen-Image-Lightning](https://huggingface.co/lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Edit-2509/Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors) |
| `vfx-ltx-reveal.json` | `checkpoints/` | `ltx-2-19b-distilled.safetensors` | 43.3 GB | [Lightricks/LTX-2](https://huggingface.co/Lightricks/LTX-2/resolve/main/ltx-2-19b-distilled.safetensors) |
| | `text_encoders/` | `gemma_3_12B_it_fp4_mixed.safetensors` | 9.5 GB | [Comfy-Org/ltx-2](https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors) |
| | `latent_upscale_models/` | `ltx-2-spatial-upscaler-x2-1.0.safetensors` | 1.0 GB | [Lightricks/LTX-2](https://huggingface.co/Lightricks/LTX-2/resolve/main/ltx-2-spatial-upscaler-x2-1.0.safetensors) |
| `hero-h3.json` | `diffusion_models/` | `minimax_h3_fl2va_pruned_int8_convrot.safetensors` | 21.0 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors) |
| | `text_encoders/` | `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 15.7 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors) |
| | `vae/` | `minimax_h3_video_vae_fp16.safetensors` | 5.2 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_video_vae_fp16.safetensors) |
| | `vae/` | `minimax_h3_audio_vae_fp32.safetensors` | 0.6 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors) |
| | `loras/` | `minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors` | 2.0 GB | [Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors) (the switch defaults to off: 20 steps) |

Totals: cutout 0.9 GB, Scene 31 GB, Reveal Draft 54 GB, Reveal Final and Cinemagraph 44 GB. Sizes are from the Hugging Face file listings.

**What is verified where.** Every workflow here has run end to end on Comfy Cloud: Scene, both Reveals and Cinemagraph through the app, cutout from the command line (5.7 s). None of the workflows has been run against a self-hosted ComfyUI yet, so the local path above is unverified: the filenames, folders and node set match what Comfy Cloud reports for these exact workflows (its `object_info`), but VRAM needs and speed on consumer GPUs are untested.

## Workflows

API-format files in `/workflows` are what the app submits. The four the recipes use also ship in UI format in [`workflows/ui/`](workflows/ui): drag one onto a ComfyUI canvas and it loads laid out left to right in labeled groups, with the same nodes and values (checked by round-tripping each through the ComfyUI frontend's own `graphToPrompt`).

| File | What it does | UI version |
|---|---|---|
| `workflows/cutout.json` | BiRefNet background removal | [`ui/cutout.json`](workflows/ui/cutout.json), [screenshot](docs/img/workflow-cutout.png) |
| `workflows/scene-edit.json` | Scene: Qwen-Image-Edit 2509 relights the packshot in place on an art-directed set (glyph paste follows in app code) | [`ui/scene-edit.json`](workflows/ui/scene-edit.json), [screenshot](docs/img/workflow-scene-edit.png) |
| `workflows/vfx-ltx-reveal.json` | Reveal (Draft): LTX-2 first and last keyframe video with the protected paste on every frame | [`ui/vfx-ltx-reveal.json`](workflows/ui/vfx-ltx-reveal.json), [screenshot](docs/img/workflow-vfx-ltx-reveal.png) |
| `workflows/hero-h3.json` | Reveal (Final) and Cinemagraph: MiniMax H3 first and last keyframe video with native audio | [`ui/hero-h3.json`](workflows/ui/hero-h3.json), [screenshot](docs/img/workflow-hero-h3.png) |
| `workflows/scene-set.json` | Qwen-Image-Edit 2509 renders an art-directed set with no product in it (earlier recipe) | |
| `workflows/scene-composite.json` | Cutout, placement, contact and cast shadow, low-denoise harmonize, protected-glyph paste (retired for relight in place) | |
| `workflows/vfx-ltx.json` | LTX-2 single image to video (quick clip) | |
| `workflows/scene.json` | Single-pass catalog still (superseded by the recipes) | |

Prompts, seeds, sizes and input filenames in the files are defaults; the app sets them per run (see `src/lib/server/prompts.ts`). In the UI versions, load your own images into the LoadImage nodes.

![cutout.json in ComfyUI](docs/img/workflow-cutout.png)
![scene-edit.json in ComfyUI](docs/img/workflow-scene-edit.png)
![vfx-ltx-reveal.json in ComfyUI](docs/img/workflow-vfx-ltx-reveal.png)
![hero-h3.json in ComfyUI](docs/img/workflow-hero-h3.png)

Several were converted from the official Comfy templates with `scripts/ui-to-api.ts`, which flattens UI-format workflows (including subgraphs) into the API format the SDK submits.

## Credits and licenses

Code in this repository: [Apache-2.0](LICENSE).

Models (weights are not included in this repo and keep their own licenses):

- [Qwen-Image-Edit 2509](https://huggingface.co/Qwen/Qwen-Image-Edit-2509), Apache-2.0, with the Qwen-Image-Edit Lightning LoRA
- [LTX-2](https://huggingface.co/Lightricks/LTX-2) by Lightricks, LTX-2 Community License
- [MiniMax H3](https://huggingface.co/MiniMaxAI/MiniMax-H3) H3-Base, MiniMax H3 Community License
- [BiRefNet](https://huggingface.co/ZhengPeng7/BiRefNet), MIT

Fonts in `assets/fonts` (Gilda Display, Lato) are under the SIL Open Font License 1.1; license files sit next to them.

Built on [ComfyUI](https://github.com/comfyanonymous/ComfyUI), [Comfy Cloud](https://cloud.comfy.org) and the [`@comfyorg/sdk`](https://github.com/Comfy-Org/comfy-typescript-sdk) (MIT).

Demo brand: Tauvel is the author's own brand. Input packshots made with GPT Image; all generation in the app is open weights.
