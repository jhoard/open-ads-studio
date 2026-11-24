# Handoff: make the live-mode branch work for any brand

Read `CLAUDE.md` and `docs/PLAYBOOK.md` first. Their rules apply: open-weight models only, no em dashes anywhere, never print or commit secrets, small conventional commits, do not merge to `main` without James's approval.

## Goal

A second designer uses James's hosted site, on James's Comfy credits, to make Scene stills of his own brand and product. Option A was chosen: brand-neutral pass on `live-mode`, one test on his product, then merge to production with the spend caps on.

## Where things stand (Nov 24, 2026)

- Branch `live-mode` (pushed, commits `ffb96af`, `50129cf`) has: Blob storage for jobs, Upstash spend caps (10 Scene, 3 video per visitor per day, 150 global), the upload flow ("Your product": BiRefNet cutout, box-drawn label mask, silhouette fit), demo fallback with a banner. Typecheck, 35 tests and `next build` pass.
- `main` and production are untouched and run in demo mode (example renders only).
- Vercel project `open-ads-studio` (team `jhoards-projects`) has NO git connection. Deploy with the CLI: `npx vercel@64.5.0 deploy --yes`.
- Preview env (all Preview deployments): `GENERATION_MODE=live`, `VISITOR_SALT`, `BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Upstash, free plan), `COMFY_API_KEY`. Older copies scoped to "Preview (live-mode)" are redundant and can be removed. Production has only `COMFY_API_KEY`, so merging alone does NOT turn live mode on there: production needs `GENERATION_MODE=live`, `VISITOR_SALT`, Blob and Upstash connected to Production too (ask James first; it is his paid workspace).
- Latest live preview: `https://open-ads-studio-c94eubu46-jhoards-projects.vercel.app` (behind Vercel login). One Tauvel Scene job ran there (`160da45c-8a10-46a4-b321-485c2c1bab7a`); its result was not checked.
- Deploy gotcha: the working tree has James's uncommitted `package.json`, `.gitignore` and untracked `packages/board-bridge/`, `docs/magicul*`, `docs/rdata*`, `.impeccable/`. Never commit them and never deploy them. Deploy from a clean worktree: `git worktree add -f <tmp-dir> live-mode`, copy `.vercel/project.json` into it, deploy from there, then `git worktree remove --force <tmp-dir>`.
- Test helpers (git-ignored): `var/live-test/preview.mts` drives the protected preview in local Chrome using the project's automation bypass secret read from the Vercel CLI login (never printed). `var/live-test/blob-jobs.mts <env-file>` lists job records. A job only advances when `/api/jobs/<id>` is polled.

## Tauvel-specific spots to fix (step 1)

Confirm each in code before changing it.

1. `src/app/studio/CreateStep.tsx` hint names Tauvel directions ("Slate beam, Travertine morning and Dark stone evening have approved renders").
2. Create-step recipe cards and the preview pane show Tauvel example renders even for an uploaded product.
3. `CINEMAGRAPH_PROMPT` in `src/lib/server/prompts.ts` likely assumes Tauvel's coffee cup and beam. Make it come from the brand's scene direction, or keep video out of scope for now (James to decide; stills are the priority).
4. Reveal needs closed and open shots: already blocked for uploads; make sure it reads as unavailable, not broken.
5. Brand step: confirm "Import brand" from a `.md` works on Vercel. URL crawl uses Playwright and likely fails on serverless; if so, say so in the UI and point to `.md` import.
6. Default brand and copy elsewhere (landing text, export copy line, disclosure) that hard-code Tauvel.

## Steps

1. Brand-neutral pass (code only, no credits). Tests and build green.
2. Set up the designer's brand: kit from his site or a `.md`, one clean product photo, label boxes.
3. One Scene run on his product on a fresh preview. Report label match and credits.
4. README: "Use your own brand" section, live mode, limits. PLAYBOOK section 5 status.
5. Show James the preview and results. Merge only on his yes; then production env as noted above.

## Needed from the designer

Brand website (or logo, colors, fonts), one or two clean product photos on a plain background, expected images per day (raise his cap if over 10).
