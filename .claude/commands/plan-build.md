Plan the 36-hour build described in CLAUDE.md. Do NOT write application code. Produce PLAN.md and stop for approval.

FIRST, READ
1. CLAUDE.md in full.
2. The four Comfy SDK / Comfy Router docs pages linked from https://comfy-starter.vercel.app/
3. Everything already in this folder. Inventory what exists and what is reusable.
4. Then ask for these two inputs if not present in the folder: (a) the Design Extractor source (URL -> DESIGN.md) to port as the brand-kit step; (b) the brand-safety / AI-disclosure ontology for export labeling.

VERIFY BEFORE PLANNING
For each model in the CLAUDE.md allowlist, confirm it is actually available through Comfy Router as an open-weight model. If a model is only reachable via a closed API on Router, mark it and propose the local-ComfyUI fallback. Do not plan around a model you have not verified.

PLAN.md MUST CONTAIN
- Reuse inventory: what in this folder and the two inputs gets reused, what gets rewritten, what gets dropped.
- Milestones with clock times in PT, ordered by risk:
  M0 (tonight): one end-to-end Router call, image in, video out, displayed and downloadable. Nothing else until green.
  M1: cutout + scene stills + variant picker.
  M2: LTX-2 VFX clip + MiniMax H3 hero clip, async with submit/status/get, timeout=660, error_type surfaced.
  M3: brand-from-URL step wired (ported Extractor).
  M4: exports, disclosure badge, UI polish.
  M5: README (license, local run, Runpod option), workflow JSONs exported and tested, Vercel deploy.
  M6: demo video script, record, social post, submit. Target: Thu Oct 29, 10pm PT.
- Cut list: for each milestone, what gets cut first if behind, so the demo still stands.
- Risks and unknowns, each with the cheapest 15-minute test to resolve it.
- Demo video shot list (under 2:00) that names ComfyUI, LTX-2, MiniMax H3, and the image model on camera.
- Repo layout, .env.example, license choice (propose Apache-2.0 or MIT, say why).

RULES
- Ask at most 3 questions, batched, before writing PLAN.md.
- No em dashes anywhere.
- When PLAN.md is approved, start at M0 and do not advance a milestone until the previous one runs end to end.
