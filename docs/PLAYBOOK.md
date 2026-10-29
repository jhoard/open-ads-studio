# Open Ads Studio: Playbook

Comfy "Open Source Higgsfield" build night, SF. Solo build by James Hoard.
Submission due Fri Oct 30, 9:00am PT. Internal target: submitted by Thu Oct 29, 10:00pm PT.

## 1. Thesis

**AI ads a brand can actually ship: open weights, label-exact, compliance-checked.**

Every AI ad tool garbles packaging. We saw it on day one: Qwen rendered "CREATINE 5G" as "CREAFINE 5G", and a free-running LTX clip dissolved the label and relit the pack amber. No brand can publish that. Open Ads Studio rebuilds Higgsfield Ads Studio with open-weight ComfyUI workflows and guarantees the product's pixels: matched-camera compositing, protected-region pixel paste, and keyframed motion. Then it checks the copy for claims and labels every export as AI-generated.

One-liner (entry form): Open Ads Studio: an open-weights rebuild of Higgsfield Ads Studio. Product photo + brand URL in, label-exact ad stills and video with audio out, via ComfyUI workflows on LTX-2 and MiniMax H3.

## 2. User flow

Mirrors Higgsfield Ads Studio: Brand, Product, Create, Review, Export.

### Step 1. Brand
- User pastes a brand URL.
- Design Extractor (ported from ~/AI/design-creator) returns a brand-kit card: palette swatches, type, tone, audience, logo. All fields editable.
- Demo: Tauvel loads from cache (assets/tauvel/DESIGN.md, brand.json). The live crawl is a stretch goal; Playwright does not run on Vercel serverless as-is.

### Step 2. Product
- User uploads a packshot. Auto cutout (BiRefNet/RMBG).
- **Protect** (signature step): the app proposes a box over the label and brand marks; the user adjusts and confirms. That region is protected pixels: no workflow may repaint it.
- Optional second upload, an "open" shot (product revealed), unlocks the Reveal recipe.
- Demo inputs: packshot-v1-green.png, reveal-start.png, reveal-end.png.

### Step 3. Create
- Choose an objective (sales, leads, traffic, awareness, engagement), an aspect ratio (1:1, 9:16, 16:9, 3:4) and one or more shot recipes:

| Recipe | What it makes | Model | Workflow |
|---|---|---|---|
| Scene (hero still) | The packshot itself goes in; Qwen rebuilds set and light around it (dark slate, hard beam, espresso cup, reflection). The box is detected, then only the protected glyphs are pasted back, tone-matched to the scene, plus a fading flipped copy in the reflection | Qwen-Image-Edit 2509 | workflows/scene-edit.json + src/lib/server/glyph-paste.ts |
| Reveal: Draft | Keyframed product moment, start frame to end frame, fast preview, no audio | LTX-2 19B distilled | workflows/vfx-ltx-reveal.json |
| Reveal: Final | Same keyframes and protected paste, with native audio | MiniMax H3 (first+last frame) | workflows/hero-h3.json |
| Cinemagraph | A finished Scene still as both H3 keyframes: steam, drifting beam, motes, room tone. Glyph paste on every frame, tone-matched per frame | MiniMax H3 (first+last frame) | workflows/hero-h3.json + scripts/run-cinemagraph.ts (not in the UI yet) |
| Hero clip | Motion with native audio | MiniMax H3 (first+last frame) | workflows/hero-h3.json |
| Retired | Cut-and-drop compositing (catalog set, Topography, Molten): the pack read as a sticker and could not integrate with liquid | Qwen-Image-Edit 2509 | scene.json, scene-set.json, scene-composite.json (kept in repo) |

- Recipe rule: nothing occludes the protected label region. Effects stay behind or below the pack.

- Each recipe maps to one workflow JSON in the repo. That is the "built with ComfyUI" proof.

### Step 4. Review
- Grid of creatives. Each card shows two badges:
  - **Label match 99.x%**: SSIM of the protected region against the source packshot. Deterministic, cheap, on screen.
  - **Compliance**: risk rating (Tauvel = medium, supplement) and any claims-guard flags on the copy line, for example "boosts performance: needs substantiation". Rules live in docs/brand-safety-ontology.md.
- Approve or regenerate per card.

### Step 5. Export
- Renders at 9:16, 1:1, 16:9.
- Logo end card (assets/tauvel/logo.svg, single source, currentColor).
- Visible AI-generated badge plus metadata (models used, disclosure basis: EU AI Act Art. 50, FTC Endorsement Guides, provenance).
- Download pack.

## 3. Where things run

| Layer | Where | Notes |
|---|---|---|
| Code | ~/AI/comfy-hackathon on James's Mac, edited by Claude Code | Push to GitHub after every milestone |
| App (dev) | Next.js dev server on the Mac | localhost only |
| Generation | Comfy Cloud via @comfyorg/sdk | SF Build Night workspace key in .env |
| App (public) | Vercel: https://open-ads-studio.vercel.app, auto-deploys from main | COMFY_API_KEY is James's Personal Workspace key (open-ads-studio-prod), not the event key. Not yet ready to share: see section 14 |
| Local run path | Any NVIDIA box or a Runpod template, ComfyUI + workflow JSONs | Must be verified once before submitting |

Fallback for judges: if the live key is out of credits, the deployed app serves cached Tauvel outputs in a clearly labeled demo mode.

## 4. Pipeline rules (do not break)

- Open weights only for every generation step. No partner nodes, no closed APIs. FLUX 3 Image Klein (open weights, FLUX Kommunity License) is allowed; FLUX 3 API models are not.
- Product pixels are sacred: the protected region is pasted from the source, never regenerated.
- Motion is keyframed (first + last frame). Free-running image-to-video invents debris and relights the scene.
- The distilled LTX runs at cfg 1, so negative prompts do nothing. Steer by describing what should happen, in bright studio light terms. No "warm", "key light", "particles".
- Pacing and push-in happen in post (scripts/post-vfx.ts): hold first frame 0.6s, last frame 0.8s, eased 100 to 108% zoom.
- Input packshots were made with GPT Image (James's own Tauvel IP). Say so in the README and the video.

## 5. Milestones

| # | Scope | Target (PT) | Status |
|---|---|---|---|
| M0 | One Cloud call, image in, video out, displayed and downloadable | Wed 5:30pm | Done |
| M1 | Cutout, scene stills (option B composite), LTX reveal, post step | Wed 9pm | Done (commit f22715f): 3 label-exact scenes in 20s, LTX reveal end strength 0.9 tested, post-vfx.ts |
| M2 | MiniMax H3 reveal with native audio, side by side with LTX; H3 hero clip | Wed 11:59pm | Done for the demo: H3 reveal + side by side (c5c9edb); Scene still passed (relight in place + glyph paste). H3 transients pending James's listen; hero clip is cut-list item 4 |
| M3 | Real UI flow replacing the M0 page: Brand (cached Tauvel kit, URL field), Product with Protect, Create with recipes, Review, Export | Thu 10am | Done: five-step studio; live Scene run end to end through the UI (label match 99.9%, model alone 58.7%); demo mode by default on Vercel |
| M3.5 | Protect step, label-match score, recipe picker | Thu 12pm | Started: protect mask built (glyph pixels, assets/tauvel/packshot-v1-protect.png) and enforced by every recipe (362f724); Protect view, label-match badge and recipe picker shipped in M3; user-drawn protect for a new upload pending |
| M4 | Review grid, claims guard, export sizes, end card, disclosure badge | Thu 3pm | |
| M4.5 | Colorway preview (stretch, first to cut) | Thu 4pm | |
| M5 | README, license, local/Runpod path verified, Vercel deploy, demo mode | Thu 6pm | |
| M6 | Record demo video, social post, submit entry form | Thu 10pm | |

## 6. Cut list (cut in this order if behind)

1. M4.5 Colorway preview
2. Live URL crawl (keep cached brand kit)
3. 16:9 export (keep 9:16 and 1:1)
4. Hero clip recipe (keep Reveal; H3 still used for the reveal with audio)
5. Review approve/regenerate (keep badges, display only)

Never cut: Protect + label match, claims guard + disclosure badge, workflow JSONs in the repo, the demo video.

## 7. Deliverables checklist

- [ ] Public GitHub repo, Apache-2.0, /workflows/*.json, setup steps anyone can follow
- [ ] Demo video, 2:00 max, names ComfyUI, LTX-2, MiniMax H3, Qwen-Image-Edit on camera
- [ ] Link to try (Vercel)
- [ ] Social post with #OpenSourceHiggsfield (Reddit, X, IG, LinkedIn, YouTube or TikTok)
- [ ] Entry form submitted

## 8. James's to-do list (not code)

- [ ] Present live tonight (script in section 10)
- [ ] Create the public GitHub repo open-ads-studio; give Claude Code the URL
- [ ] Create the open-ads-studio-prod key in Personal Workspace (never paste it in chat)
- [ ] Create the Vercel project from the repo; add the prod key as an env var
- [ ] Entry form, section 1 (sign up + one-liner)
- [ ] Thu: Runpod account for the README local path
- [ ] Thu evening: record the video, post, submit

## 9. Demo video (2:00)

| Time | Shot | Line |
|---|---|---|
| 0:00 | The failures: "CREAFINE 5G" still, the amber debris clip | "Every AI ad tool does this to your product." |
| 0:15 | Title card | "Open Ads Studio. AI ads a brand can actually ship. Open weights, label-exact, compliance-checked." |
| 0:25 | Brand step, Tauvel kit appears | "Paste a URL, get the brand kit." |
| 0:40 | Product step, Protect box over the label | "Mark what can't change. The pipeline never repaints it." |
| 0:55 | Create: Reveal with LTX-2, then H3 with sound | "Keyframed motion on LTX-2 and MiniMax H3, all ComfyUI workflows on Comfy Cloud." |
| 1:25 | Review: Label match 99.8%, claims flag on "boosts performance" | "Every creative is checked: label match, and supplement claims flagged before they ship." |
| 1:45 | Export with disclosure badge, then the repo | "AI disclosure on every export. Open weights, open source. Packshots made with GPT Image; everything the app generates is open." |

## 10. Live pitch tonight (60s)

- 0:00 "Higgsfield's Ads Studio turns a product and a brand into ads. It's closed. I'm rebuilding it in the open."
- 0:10 "And fixing the thing every AI ad tool gets wrong: it garbles your packaging. This one keeps the label pixel-exact."
- 0:20 Play the reveal clip. "My own brand, Tauvel. Two keyframes in, LTX-2 animates the reveal, running as a ComfyUI workflow on Comfy Cloud. The label you see is the real label."
- 0:40 "Next: MiniMax H3 for native audio, a brand kit from any URL, and a claims guard, because this is a supplement and 'boosts performance' shouldn't ship unchecked."
- 0:55 "All open weights, all open source. Thanks."

## 11. Prize math

- Open Weights Only (RTX 5090) + VFX built with LTX ($2,000) + Built with MiniMax H3: most likely wins. Name every model on screen.
- Most Viral: split-screen post. Left: a garbled AI label. Right: yours, exact. "Every AI ad tool misspells your product. Mine doesn't. Open source. #OpenSourceHiggsfield"
- Best Overall: a real insight + a working product + polished UI. Design quality is the edge.

## 12. Decisions log

- Wed 4:45pm: Build an Ads Studio rebuild; Open Weights track + LTX + H3 bonuses. FLUX 3 excluded (closed).
- Wed 5:00pm: Build in Claude Code, not Codex.
- Wed 5:30pm: Tauvel sleeve color changed from espresso to bottle green #1F3A2E.
- Wed 5:50pm: Scenes use option B (generated set + composited cutout).
- Wed 6:05pm: VFX concept changed from free-running light sweep to a first+last frame reveal. Fixed the debris and relight.
- Wed 6:10pm: Stop prompting LTX for audio (fixed silent track); H3 carries sound.
- Wed 6:24pm: Reveal recipe has two modes: Draft on LTX-2 (fast preview), Final on MiniMax H3 (native audio). LTX end-frame strength default raised to 0.9 (bar SSIM 0.897 vs 0.855 at 0.7).
- Wed 6:25pm: Shot recipes are art-directed concepts, not catalog sets: Topography (hero still) and Molten (LTX VFX). Nothing occludes the protected label region; effects stay behind or below the pack.
- Wed 6:30pm: Protect region is the gold glyph pixels (monogram, wordmark, label copy), not rectangles, so a harmonize pass can relight the sleeve body without leaving unlit boxes around the text.
- Wed 6:33pm: Repo public at github.com/jhoard/open-ads-studio; push after every milestone commit.
- Wed 6:34pm: LTX video sides must be multiples of 64. 720 was silently rendered as 704 and misaligned the protected paste; 9:16 is now 704x1280.
- Wed 6:36pm: CLAUDE.md people rule reworded: no identifiable people or likenesses; distant silhouettes for scale are fine.
- Wed 7:14pm: Scene recipe is relight in place: Qwen-Image-Edit takes the packshot itself, the box is detected (Qwen reframes the shot), and only the glyphs are pasted back, tone-matched by local face luminance, with a 25% flipped copy fading into the reflection. Cut-and-drop retired; Molten cut (can't integrate with liquid).
- Wed 7:50pm: Cinemagraph for the presentation: the Scene still as both H3 keyframes, glyph paste per frame; seed 7 picked (seed 42 had a 2-frame spark and relit the box).
- Wed 8:10pm: Demo mode is the default on Vercel, so the public link cannot spend credits.
- Wed 8:20pm: Correction: FLUX 3 Image Klein (5.6B) is open weights (Oct 15 2026, FLUX Kommunity License) and allowed; FLUX 3 API models stay disallowed. Checked Comfy Cloud's live catalog: core ComfyUI has the flux3 text-encoder type, but no FLUX 3 Image Klein weights are hosted (only FLUX.2 Klein 4B/9B and the API-only Flux3* nodes), so the Klein vs Qwen Scene test did not run.

## 13. Repeatable parts (future skills)

- **Packshot set from a brand direction:** master straight-on prompt, then attach-and-edit for color swaps, unwrapped, start/end keyframes. Swap, never re-roll. Specify camera geometry, not "three-quarter".
- **Keyframed product reveal:** start + end frame with identical camera, shared sleeve pixels, protected-region paste, post holds and push-in.
- **Label fidelity check:** protected region + SSIM score.
- **Claims guard:** category to risk rating to blocked/substantiation phrases to disclosure label.

## 14. Pending tweaks

- Still test: passed. Scene = relight in place + glyph paste (tone-matched, plus reflected glyphs); cut-and-drop retired, Molten cut. Seed 7 example (var/relight/s7/fast-2-final.png) is the Scene example in the UI.
- H3 transients at 1.8s/2.9s: pending
- Live link: done. Demo mode is the default on Vercel (GENERATION_MODE unset): Create returns the bundled example renders and never calls Comfy. A rate limit is still needed before setting GENERATION_MODE=live there.
- Page copy promising native audio from LTX: gone with the M0 page.
- Cinemagraph in the UI: add as a recipe that chains off an approved Scene.
- Live link storage (found from code, not yet tested live): job records, uploads and outputs go to `var/` on local disk, which is read-only on Vercel outside /tmp and not shared between function instances, so live submits from the deployed app would fail. Demo mode sidesteps it; move to Vercel Blob (planned in M5) before turning live mode on there.
