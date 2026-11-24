# Board Bridge

A standalone local MVP for moving editable FigJam objects into a new or empty Miro board. It lives beside Open Ads Studio and has its own Next.js app, environment, plugin, worker, and tests.

## Run

Use the repository's installed dependencies (Node 22+). From the repository root:

```sh
npm run bridge:dev
# In a second terminal:
npm run bridge:worker
```

Open http://localhost:3001. The web app and worker must share the same data directory. Both commands default to `packages/board-bridge/.data/`. The app binds to loopback by default. Open **How it works** for the customer guide. This README contains operator setup; customers should not configure servers, workers, or platform developer apps. Uploading an export, previewing a board, and downloading normalized JSON work without credentials. The public sample is synthetic and never contains the user's planning board.

## Miro connection

Copy `.env.example` to `.env.local` **in this package**. Register a Miro developer app with `boards:read` and `boards:write` and the exact redirect URI `http://localhost:3001/api/auth/callback`. Set `MIRO_CLIENT_ID`, `MIRO_CLIENT_SECRET`, and `BRIDGE_APP_URL`. Restart both processes, then choose **Connect Miro**.

A personal `MIRO_ACCESS_TOKEN` is accepted only when `BRIDGE_APP_URL` uses localhost or 127.0.0.1, for local single-user testing. Never expose this mode to other users. Credentials from ChatGPT/Codex connectors cannot be reused by this standalone app. OAuth connections are encrypted on disk; the browser receives only an encrypted, HTTP-only owner-session cookie. Expired OAuth tokens require reconnection; refresh-token rotation is not implemented.

## FigJam source

For developer testing, download the plugin ZIP from `/api/plugin`, unzip, and import its manifest through **Figma desktop → Plugins → Development → Import plugin from manifest**. Run it in the source FigJam board and download the JSON. It can export a selection, and makes no network requests or canvas changes.

Alternatively, set `FIGMA_ACCESS_TOKEN` with `file_content:read` and access to the board to enable the board-link path. That path is subject to Figma rate limits. The plugin route avoids REST file reads. Neither path parses native `.fig` / `.jam` binary files.

## Supported conversions

- Native sticky notes, with nearest Miro named palette color and Miro proportions.
- Standalone text with source visual lines, bold spans, and supported font mappings. Paragraphs become separate editable lines. Unsupported fonts map to Roboto, with constrained text reduced to fit; exact typography still needs visual review.
- Embedded PNG/JPEG images, uploaded as private board resources through multipart requests. The plugin renders image fills with crop, corners and effects; each image is capped at 6 MB and each export at 32 MB.
- Basic shapes; unsupported shape variants become rectangles with a report entry.
- Top-level sections become Miro frames. Nested sections become labeled shapes.
- Attached connectors, created after both endpoint IDs are known.
- Hidden objects, unsupported widgets, and loose connectors are explicitly reported as omitted or approximated. Rich formatting beyond bold is approximate. Older exports without image pixels or source line positions remain readable with explicit compatibility notes.

New-board creation is the default. Existing destinations must have an empty REST inventory; this does not detect widget types that the API cannot enumerate. The app never clears a destination. After all writes, the worker reads back every item and checks IDs, parent frames, positions, available geometry, image resource references and attached connector endpoints. Missing/skipped objects or mismatches produce **review**, not completion. REST does not expose painted text height, so the report explicitly retains visual-review notes for font substitutions. The preview shows source layout, not an exact rendering of Miro.

## Recovery model

New-board creation is checkpointed before the request and reconciled if its response is lost. The worker checkpoints an `uncertain` task **before** issuing a remote creation request and stores the returned Miro ID after a confirmed response. Completed objects are skipped on resume. Explicit 429 rejections use bounded backoff. Network failures and 5xx POST responses are never blindly retried: the job pauses and asks the operator to match an existing object ID or explicitly confirm that the object was not created.

One worker holds an exclusive lock. After a crash, verify that no worker is still running, remove `.data/worker.lock`, and restart it. Any in-flight task will require reconciliation. The local filesystem is the durable store, not process memory. Do not deploy this unchanged to ephemeral/serverless instances or run multiple workers on different disks.

## Verify

```sh
npm run bridge:typecheck
npm run bridge:test
npm run bridge:build
```

The conversion tests verify nested geometry, connector ID remapping, unsupported content reporting, input validation, no replay after ambiguous failures, rate-limit behavior, encrypted records, and worker exclusion. They use a fake Miro transport and do not spend credits or change remote boards. Separately, live acceptance tests verified nine synthetic items (including attached connectors) and a real UI migration of 44 source objects into 80 native Miro items: two frames, six shapes, seven images, and 65 editable text lines. All 80 destination checks passed, followed by visual inspection of the live board. The acceptance source and screenshots remain in ignored local artifacts. The worker must run with outbound HTTPS access to api.miro.com.

## Architecture and next steps

`lib/board.ts` is the versioned common format; `figjam.ts` is a source reader; `miro-plan.ts` produces ordered native API operations. `jobs.ts` executes those operations with persisted checkpoints. The Next.js app handles sessions, uploads, OAuth, and job control. `scripts/worker.ts` processes the queue outside HTTP request lifetimes.

Before SaaS launch: publish the FigJam exporter for ordinary installation, add account authentication and tenancy, a database and private asset storage with retention/deletion controls, distributed leases and transactional job updates, automatic OAuth refresh, broader visual fidelity validation, integration tests against real platform accounts, and platform app reviews. Lucid support is an adapter slot, not shipped functionality. Prove Lucid extraction geometry before advertising that route. Billing and native Miro `.rtb` generation are not implemented.

References: [Figma file API](https://developers.figma.com/docs/rest-api/file-endpoints/), [Miro sticky creation](https://developers.miro.com/reference/create-sticky-note-item-1), [Miro shapes](https://developers.miro.com/reference/create-shape-item-1), [Miro connector migration guide](https://developers.miro.com/docs/rest-api-reference-guide), [Lucid Standard Import](https://developer.lucid.co/docs/overview-si).
