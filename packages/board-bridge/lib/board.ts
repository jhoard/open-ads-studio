export type Kind = "frame" | "sticky" | "shape" | "text" | "connector" | "image";
export type Side = "auto" | "top" | "right" | "bottom" | "left";
export interface TextRun { text:string; bold:boolean; color?:string }
export interface TextLine { x:number; baseline:number; fontSize:number; text:string; runs:TextRun[] }
export interface BoardNode {
  id: string; kind: Kind; name: string; parentId?: string;
  x: number; y: number; width: number; height: number; rotation: number;
  text: string; fill: string; stroke: string; strokeWidth: number;
  fontSize: number; bold: boolean; textColor: string; shape: string;
  fontFamily?:string; textAlign?:"left"|"center"|"right"; textAlignVertical?:"top"|"middle"|"bottom";
  runs?:TextRun[]; lines?:TextLine[]; image?:{mimeType:"image/png"|"image/jpeg";base64:string};
  start?: { id: string; side: Side }; end?: { id: string; side: Side };
  lineType?: "straight" | "elbowed" | "curved"; startArrow?: boolean; endArrow?: boolean;
}
export interface Warning { id: string; severity: "approximation" | "skipped"; message: string }
export interface Board {
  format: "board-bridge"; version: 1; source: "figjam"; name: string;
  nodes: BoardNode[]; warnings: Warning[];
}
export function validateBoard(input: unknown): Board {
  if (!input || typeof input !== "object") throw new Error("Choose a Board Bridge JSON export.");
  const b = input as Board;
  if (b.format !== "board-bridge" || b.version !== 1 || b.source !== "figjam" || !Array.isArray(b.nodes)) throw new Error("Unsupported export. Use the included FigJam plugin to export this board.");
  if (!b.nodes.length || b.nodes.length > 5000) throw new Error("A board must contain between 1 and 5,000 supported objects.");
  if (typeof b.name !== "string" || b.name.length > 300 || !Array.isArray(b.warnings)) throw new Error("Invalid board metadata.");
  const ids = new Set<string>();
  for (const n of b.nodes) {
    if (!n || typeof n.id !== "string" || !n.id || n.id.length > 150 || ids.has(n.id)) throw new Error("Every object must have a unique ID.");
    ids.add(n.id);
    if (!["frame", "sticky", "shape", "text", "connector", "image"].includes(n.kind)) throw new Error("Unsupported object kind.");
    for (const k of ["x", "y", "width", "height", "rotation", "strokeWidth", "fontSize"] as const) {
      if (!Number.isFinite(n[k]) || Math.abs(n[k]) > 1_000_000) throw new Error(`Invalid ${k} on ${n.id}.`);
    }
    if (n.width < 0 || n.height < 0 || n.strokeWidth < 0 || n.fontSize <= 0) throw new Error(`Invalid dimensions on ${n.id}.`);
    for (const k of ["name", "text", "fill", "stroke", "textColor", "shape"] as const) if (typeof n[k] !== "string") throw new Error(`Invalid ${k} on ${n.id}.`);
    if (n.text.length > 20000 || n.name.length > 1000) throw new Error(`Text is too long on ${n.id}.`);
    for (const c of [n.fill, n.stroke, n.textColor]) if (!/^#[\da-f]{6}$/i.test(c)) throw new Error(`Invalid color on ${n.id}.`);
    if (n.parentId !== undefined && typeof n.parentId !== "string") throw new Error("Invalid parent ID.");
    if(n.fontFamily!==undefined&&(typeof n.fontFamily!=="string"||n.fontFamily.length>100))throw new Error("Invalid font family.");
    if(n.textAlign!==undefined&&!["left","center","right"].includes(n.textAlign))throw new Error("Invalid text alignment.");
    if(n.textAlignVertical!==undefined&&!["top","middle","bottom"].includes(n.textAlignVertical))throw new Error("Invalid vertical alignment.");
    const checkRuns=(runs:TextRun[])=>{if(!Array.isArray(runs)||runs.length>2000)throw new Error("Invalid styled text.");for(const r of runs)if(!r||typeof r.text!=="string"||r.text.length>20000||typeof r.bold!=="boolean"||(r.color!==undefined&&!/^#[\da-f]{6}$/i.test(r.color)))throw new Error("Invalid text run.");};
    if(n.runs){checkRuns(n.runs);if(n.runs.map(r=>r.text).join('')!==n.text)throw new Error("Styled text does not match its content.");}
    if(n.lines){if(!Array.isArray(n.lines)||n.lines.length>1000)throw new Error("Invalid line layout.");for(const l of n.lines){if(!l||![l.x,l.baseline,l.fontSize].every(Number.isFinite)||Math.abs(l.x)>1000000||Math.abs(l.baseline)>1000000||l.fontSize<=0||l.fontSize>1600||typeof l.text!=="string")throw new Error("Invalid text line.");checkRuns(l.runs);if(l.runs.map(r=>r.text).join('')!==l.text)throw new Error("Invalid line content.");}if(n.lines.map(l=>l.text).join('').replace(/\s/g,'').toLowerCase()!==n.text.replace(/\s/g,'').toLowerCase())throw new Error("Line layout loses text. Re-export this board.");}
    if(n.kind==="image"){const a=n.image;if(!a||!["image/png","image/jpeg"].includes(a.mimeType)||typeof a.base64!=="string"||a.base64.length>8*1024*1024||!a.base64.length||a.base64.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(a.base64))throw new Error("Invalid embedded image (maximum 6 MB per image).");}
    if (n.kind === "connector") {
      for (const ep of [n.start, n.end]) if (!ep || typeof ep.id !== "string" || !["auto", "top", "right", "bottom", "left"].includes(ep.side)) throw new Error(`Invalid connector endpoints on ${n.id}.`);
      if (!["straight", "elbowed", "curved"].includes(n.lineType || "")) throw new Error("Invalid connector routing.");
    }
  }
  if(b.nodes.reduce((sum,n)=>sum+(n.lines?.length||1),0)>10000)throw new Error("Export exceeds 10,000 destination items.");
  for (const n of b.nodes) {
    if (n.parentId && !ids.has(n.parentId)) throw new Error(`Missing parent on ${n.id}.`);
    if (n.kind === "connector" && (!ids.has(n.start!.id) || !ids.has(n.end!.id))) throw new Error(`Missing connector endpoint on ${n.id}.`);
    const visited = new Set([n.id]); let p = n.parentId;
    while (p) { if (visited.has(p)) throw new Error("Cyclic board hierarchy."); visited.add(p); p = b.nodes.find(x => x.id === p)?.parentId; }
  }
  for (const w of b.warnings) if (!w || typeof w.id !== "string" || !["approximation", "skipped"].includes(w.severity) || typeof w.message !== "string" || w.message.length > 2000) throw new Error("Invalid compatibility report.");
  return b;
}
export function boardId(url: string): string {
  let u: URL; try { u = new URL(url); } catch { throw new Error("Paste the full Miro board URL."); }
  const id = u.pathname.match(/^\/app\/board\/([^/]+)\/?$/)?.[1];
  if (u.protocol !== "https:" || u.hostname !== "miro.com" || !id || !/^[\w=-]+$/.test(id)) throw new Error("Use a https://miro.com/app/board/… URL.");
  return id;
}
export const html = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\r\n|[\n\r\u2028\u2029]/g, "<br>");
