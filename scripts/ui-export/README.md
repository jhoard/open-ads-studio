# UI-format workflow export

Rebuilds `workflows/ui/*.json` and the `docs/img/workflow-*.png` screenshots from the API-format workflows, using the real ComfyUI frontend (no Python, no GPU).

1. `pip download comfyui-frontend-package --no-deps` and unzip the wheel (built with 1.58.1).
2. Copy the API workflows into `<static>/wf/` and `layout.js` into `<static>/`.
3. `node scripts/ui-export/mock-comfy.mjs <static> var/object_info.json 8199 <out-dir>` (object_info from Comfy Cloud, so every node is known).
4. Open http://127.0.0.1:8199, load `/layout.js`, then for each workflow: `const { workflow, diffs } = await __layout("hero-h3")`. `diffs` must be empty: it compares `graphToPrompt()` with the API file. POST the workflow to `/save/hero-h3.json`.

Groups and their nodes are listed at the top of `layout.js`.
