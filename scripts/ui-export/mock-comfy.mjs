// Mock ComfyUI backend: serves the real frontend with Comfy Cloud's object_info, no Python, no GPU.
import { createServer } from "node:http";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const STATIC = path.resolve(process.argv[2]);
const info = JSON.parse(await readFile(process.argv[3], "utf8"));
// The workflows reference placeholder inputs; list them so LoadImage validates as it would after an upload.
info.LoadImage.input.required.image[0] = ["input.png", "end.png", "paste-mask.png", ...info.LoadImage.input.required.image[0]];
const OBJECT_INFO = JSON.stringify(info);
const PORT = Number(process.argv[4] ?? 8199);
const SAVE_DIR = path.resolve(process.argv[5] ?? "out");
await mkdir(SAVE_DIR, { recursive: true });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };
const settings = { "Comfy.TutorialCompleted": true, "Comfy.Validation.Workflows": false, "Comfy.MinimapVisible": false, "Comfy.Minimap.Visible": false, "Comfy.Graph.CanvasInfo": false, "Comfy.UseNewMenu": "Top" };

const json = (res, body, code = 200) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/^\/api/, "");
  if (req.method === "POST" && /^\/save\/[a-z0-9-]+\.(json|png)$/.test(url.pathname)) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const out = path.join(SAVE_DIR, path.basename(url.pathname));
    await writeFile(out, Buffer.concat(chunks));
    return json(res, { saved: out });
  }
  if (req.method === "POST") {
    req.resume();
    return json(res, {});
  }
  if (p === "/object_info") return json(res, OBJECT_INFO);
  if (p === "/settings") return json(res, settings);
  if (p.startsWith("/settings/")) return json(res, settings[decodeURIComponent(p.slice(10))] ?? null);
  if (p === "/users") return json(res, { storage: "server", migrated: true });
  if (p === "/system_stats") return json(res, { system: { os: "darwin", comfyui_version: "mock", python_version: "", embedded_python: false, argv: [] }, devices: [] });
  if (p === "/features") return json(res, {});
  if (p === "/workflow_templates") return json(res, {});
  if (p === "/extensions" || p === "/embeddings" || p.startsWith("/userdata") || p.startsWith("/experiment") || p.startsWith("/models")) return json(res, []);
  if (p === "/queue") return json(res, { queue_running: [], queue_pending: [] });
  if (p.startsWith("/history") || p.startsWith("/i18n")) return json(res, {});
  const file = path.join(STATIC, url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(STATIC)) return json(res, {}, 403);
  try {
    if ((await stat(file)).isFile()) {
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      return res.end(await readFile(file));
    }
  } catch {}
  json(res, {}, 404);
}).listen(PORT, "127.0.0.1", () => process.stdout.write(`mock comfy on ${PORT}\n`));
