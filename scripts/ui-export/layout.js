// Load an API-format workflow into the real frontend, lay it out left to right in labeled groups,
// and check graphToPrompt() reproduces the API inputs exactly.
window.__GROUPS = {
  cutout: [
    ["Input: product photo", ["1"]],
    ["Background removal: BiRefNet", ["2"]],
    ["Output: transparent cutout", ["3"]],
  ],
  "scene-edit": [
    ["Input: packshot", ["78"]],
    ["Models: Qwen-Image-Edit 2509 + Lightning LoRA", ["433:37", "433:38", "433:39", "433:89"]],
    ["Fast mode switch (4-step Lightning)", ["433:443", "433:436", "433:437", "433:438", "433:439", "433:440", "433:441", "433:442"]],
    ["Encode: edit prompt + packshot", ["433:110", "433:111", "433:88", "433:66", "433:75"]],
    ["Sample", ["433:3"]],
    ["Decode and save: relit scene", ["433:8", "469"]],
  ],
  "vfx-ltx-reveal": [
    ["Inputs: first frame, last frame, paste mask", ["98", "200", "207"]],
    ["Models: LTX-2 19B distilled", ["92:1", "92:48", "92:60", "92:76"]],
    ["Frame prep", ["102", "201", "202", "203", "92:115", "92:99", "92:106", "92:89", "92:90", "92:91", "92:62"]],
    ["Prompt and conditioning", ["92:3", "92:112", "92:22"]],
    ["Latents with first and last frame guides", ["92:43", "92:107", "92:51", "92:56", "204"]],
    ["Pass 1: sample at half size", ["92:11", "92:8", "92:113", "92:47", "92:41", "92:80", "92:81"]],
    ["Pass 2: upscale x2 and refine", ["92:84", "92:108", "205", "92:83", "92:67", "92:66", "92:73", "92:82", "92:70", "92:105", "206"]],
    ["Decode, paste sleeve, save video", ["92:95", "92:96", "208", "209", "210", "211", "92:97", "75"]],
  ],
  "hero-h3": [
    ["Inputs: first and last frame", ["114", "131", "130", "132"]],
    ["Models: MiniMax H3 FL2VA", ["105:6", "105:13", "105:11", "105:24", "105:121"]],
    ["Turbo switch (8-step LoRA)", ["105:126", "105:124", "105:125", "105:122", "105:123"]],
    ["Duration", ["105:111", "105:107"]],
    ["First + last frame conditioning, audio", ["105:104"]],
    ["Sample", ["105:15", "105:16", "105:17", "105:9", "105:14"]],
    ["Decode video and audio", ["105:10", "105:23"]],
    ["Paste last-frame sleeve", ["140", "141", "142", "143", "144"]],
    ["Output: video with native audio", ["105:91", "92"]],
  ],
};

function renumber(raw) {
  const idMap = new Map(Object.keys(raw).map((k, i) => [k, String(i + 1)]));
  const api = {};
  for (const [k, v] of Object.entries(raw)) {
    const inputs = {};
    for (const [ik, iv] of Object.entries(v.inputs)) {
      inputs[ik] = Array.isArray(iv) && iv.length === 2 && idMap.has(String(iv[0])) ? [idMap.get(String(iv[0])), iv[1]] : iv;
    }
    api[idMap.get(k)] = { ...v, inputs };
  }
  return { api, idMap };
}
window.__renumber = renumber;

window.__diff = async (api) => {
  const out = (await window.app.graphToPrompt()).output;
  const diffs = [];
  for (const [id, node] of Object.entries(api)) {
    const o = out[id];
    if (!o || o.class_type !== node.class_type) { diffs.push(`${id} missing`); continue; }
    for (const [k, v] of Object.entries(node.inputs)) {
      if (JSON.stringify(o.inputs[k]) !== JSON.stringify(v)) diffs.push(`${id}.${k}: ${JSON.stringify(v)} -> ${JSON.stringify(o.inputs[k])}`);
    }
  }
  return diffs;
};

window.__layout = async (name) => {
  const raw = await (await fetch(`/wf/${name}.json`)).json();
  const { api, idMap } = renumber(raw);
  await window.app.loadApiJson(api, name);
  const g = window.app.graph;
  const LG = window.LiteGraph;
  const byId = new Map(g._nodes.map((n) => [String(n.id), n]));
  // Seeds stay fixed, as in the API runs, so a queued run reproduces the app's output.
  for (const n of g._nodes) for (const w of n.widgets ?? []) if (w.name === "control_after_generate") w.value = "fixed";
  const groups = window.__GROUPS[name].map(([t, ids]) => [t, ids.map((i) => idMap.get(i) ?? `?${i}`)]);
  const listed = new Set(groups.flatMap(([, ids]) => ids));
  const missing = [...byId.keys()].filter((id) => !listed.has(id));
  const unknown = groups.flatMap(([, ids]) => ids).filter((id) => !byId.has(id));
  const depth = new Map();
  const dep = (id) => {
    if (depth.has(id)) return depth.get(id);
    depth.set(id, 0);
    const ins = Object.values(api[id].inputs).filter((v) => Array.isArray(v) && api[String(v[0])]).map((v) => String(v[0]));
    const d = ins.length ? 1 + Math.max(...ins.map(dep)) : 0;
    depth.set(id, d);
    return d;
  };
  Object.keys(api).forEach(dep);
  const GAP = 40, PAD = 30, HEAD = 50, MAXROWS = 4, BETWEEN = 90, TITLE_CHAR = 13.5, ROW_MAX = 5200, ROW_GAP = 140;
  let x = 0;
  let rowTop = 0;
  let rowBottom = 0;
  for (const [title, ids] of groups) {
    const sorted = [...ids].sort((a, b) => dep(a) - dep(b));
    const levels = [...new Set(sorted.map(dep))];
    const cols = [];
    for (const lv of levels) {
      const at = sorted.filter((id) => dep(id) === lv);
      for (let i = 0; i < at.length; i += MAXROWS) cols.push(at.slice(i, i + MAXROWS));
    }
    let cx = x + PAD;
    let bottom = 0;
    for (const col of cols) {
      let cy = rowTop + HEAD + PAD;
      let w = 0;
      for (const id of col) {
        const n = byId.get(id);
        n.pos = [cx, cy];
        cy += n.size[1] + LG.NODE_TITLE_HEIGHT + GAP;
        w = Math.max(w, n.size[0]);
      }
      bottom = Math.max(bottom, cy);
      cx += w + GAP;
    }
    const contentWidth = cx - x - GAP + PAD;
    const width = Math.max(contentWidth, title.length * TITLE_CHAR + 2 * PAD);
    const shift = (width - contentWidth) / 2;
    let dx = Math.max(0, shift);
    let dy = 0;
    if (x > 0 && x + width > ROW_MAX) {
      // wrap: continue on a new row, still reading left to right
      dx -= x;
      dy = rowBottom + ROW_GAP - rowTop;
      x = 0;
      rowTop += dy;
      rowBottom = rowTop;
    }
    for (const id of ids) { const n = byId.get(id); n.pos = [n.pos[0] + dx, n.pos[1] + dy]; }
    const height = bottom + dy - rowTop - GAP + PAD;
    rowBottom = Math.max(rowBottom, rowTop + height);
    const grp = new LG.LGraphGroup(title);
    grp.pos = [x, rowTop];
    grp.size = [width, height];
    g.add(grp);
    x += width + BETWEEN;
  }
  g.setDirtyCanvas(true, true);
  return { missing, unknown, diffs: await window.__diff(api), width: x, workflow: g.serialize() };
};
