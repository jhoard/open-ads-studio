# Open Ads Studio

An open-weights rebuild of Higgsfield Ads Studio, built for Comfy's "Open Source Higgsfield" build night (#OpenSourceHiggsfield).

Product photo + brand kit in. Label-exact ad stills and short video with audio out. Every generation step is an open-weight model running as a ComfyUI workflow; the JSON for each one is in [`/workflows`](workflows).

**What makes it different:** AI ad tools garble packaging. Open Ads Studio never lets a model repaint the label. The product is composited at a matched camera, its gold glyphs are a protected region pasted back after every generative pass, and motion is keyframed from first and last frames.

**Live:** https://open-ads-studio.vercel.app (early build, auto-deployed from `main`).

> Status: in active development during the event. See [`docs/PLAYBOOK.md`](docs/PLAYBOOK.md) for the plan, milestones and decisions.

## How it works

| Recipe | Output | Models | Workflows |
|---|---|---|---|
| Topography | Hero still: product on the rim of a chocolate canyon | Qwen-Image-Edit 2509, BiRefNet | `scene-set.json`, `scene-composite.json` |
| Molten | VFX clip: a chocolate wave breaks behind the pack | Qwen-Image-Edit 2509, BiRefNet, LTX-2 | `scene-set.json`, `scene-edit.json`, `scene-composite.json`, `vfx-ltx-reveal.json` |
| Reveal (Draft) | The bar rises out of the sleeve, fast preview | LTX-2 19B distilled | `vfx-ltx-reveal.json` |
| Reveal (Final) | Same reveal with native audio | MiniMax H3-Base FL2VA | `hero-h3.json` |

Deterministic steps (no model): set analysis (surface line, light side), product placement and shadows, protected-glyph paste, and post (`scripts/post-vfx.ts`: frame holds and an eased push-in, via ffmpeg).

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

Run recipes from the command line:

```bash
npx tsx scripts/run-recipe.ts topography
npx tsx scripts/run-recipe.ts molten
npx tsx scripts/run-vfx.ts vfx-reveal 3:4 "<motion prompt>"     # Reveal, Draft (LTX-2)
npx tsx scripts/run-vfx.ts hero-h3 3:4 "<motion prompt>"        # Reveal, Final (H3)
npx tsx scripts/post-vfx.ts in.mp4 out.mp4                      # holds + push-in
```

Outputs land in `var/` (git-ignored).

### Backends

- **Comfy Cloud (default):** the app submits the API-format workflows in `/workflows` to `cloud.comfy.org` with the `@comfyorg/sdk` workflow client. All checkpoints are open weights hosted there; the workflows contain no API (partner) nodes.
- **Your own GPU:** run ComfyUI with [`comfy-api-proxy`](https://github.com/Comfy-Org/comfy-api-proxy) and set `COMFY_BASE_URL=http://127.0.0.1:8189`. The same workflow JSONs run unchanged. Model files and a Runpod template are documented in a later milestone (see the playbook).

## Workflows

| File | What it does |
|---|---|
| `workflows/cutout.json` | BiRefNet background removal |
| `workflows/scene-set.json` | Qwen-Image-Edit 2509 renders an art-directed set with no product in it |
| `workflows/scene-edit.json` | Qwen-Image-Edit 2509 edits a set at the same size (for example, adding the frozen wave) |
| `workflows/scene-composite.json` | Cutout, placement, contact and cast shadow, low-denoise harmonize, protected-glyph paste |
| `workflows/vfx-ltx-reveal.json` | LTX-2 first and last keyframe video with the protected paste on every frame |
| `workflows/hero-h3.json` | MiniMax H3 first and last keyframe video with native audio |
| `workflows/vfx-ltx.json` | LTX-2 single image to video (quick clip) |
| `workflows/scene.json` | Single-pass catalog still (superseded by the recipes) |

Several were converted from the official Comfy templates with `scripts/ui-to-api.ts`, which flattens UI-format workflows (including subgraphs) into the API format the SDK submits.

## Credits and licenses

Code in this repository: [Apache-2.0](LICENSE).

Models (weights are not included in this repo and keep their own licenses):

- [Qwen-Image-Edit 2509](https://huggingface.co/Qwen/Qwen-Image-Edit-2509), Apache-2.0, with the Qwen-Image-Edit Lightning LoRA
- [LTX-2](https://huggingface.co/Lightricks/LTX-2) by Lightricks, LTX-2 Community License
- [MiniMax H3](https://huggingface.co/MiniMaxAI/MiniMax-H3) H3-Base, MiniMax H3 Community License
- [BiRefNet](https://huggingface.co/ZhengPeng7/BiRefNet), MIT

Built on [ComfyUI](https://github.com/comfyanonymous/ComfyUI), [Comfy Cloud](https://cloud.comfy.org) and the [`@comfyorg/sdk`](https://github.com/Comfy-Org/comfy-typescript-sdk) (MIT).

Demo brand: Tauvel is the author's own brand. Input packshots made with GPT Image; all generation in the app is open weights.
