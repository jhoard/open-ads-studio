import { type Board, type BoardNode, type Side, validateBoard } from "./board";
import { svgTextLines, fontIsMapped } from "./text-layout";
type Raw = Record<string, any>;
function color(paints: Raw[] | undefined, fallback: string): string {
  const p = Array.isArray(paints) ? paints.find(p => p.type === "SOLID" && p.visible !== false) : undefined;
  if (!p?.color) return fallback;
  const a = p.opacity ?? 1;
  return "#" + ["r", "g", "b"].map(k => Math.round(Math.max(0, Math.min(1, p.color[k] * a + 1 - a)) * 255).toString(16).padStart(2, "0")).join("");
}
export const shapes: Record<string, string> = {
  SQUARE: "rectangle", RECTANGLE: "rectangle", ELLIPSE: "circle", ROUNDED_RECTANGLE: "round_rectangle",
  DIAMOND: "rhombus", TRIANGLE_UP: "triangle", PARALLELOGRAM_RIGHT: "parallelogram",
  ENG_DATABASE: "can", HEXAGON: "hexagon", OCTAGON: "octagon", STAR: "star",
  ARROW_LEFT: "left_arrow", ARROW_RIGHT: "right_arrow", PREDEFINED_PROCESS: "flow_chart_predefined_process",
};
export function normalizeFigJam(rawNodes: Raw[], name: string): Board {
  if (!Array.isArray(rawNodes) || rawNodes.length > 10000) throw new Error("Source board is too large.");
  const board: Board = { format: "board-bridge", version: 1, source: "figjam", name: name.slice(0,300), nodes: [], warnings: [] };
  const source = new Map(rawNodes.map(n => [n.id, n]));
  for (const n of rawNodes) {
    if (n.visible === false) { board.warnings.push({ id: n.id, severity: "skipped", message: "Hidden object omitted." }); continue; }
    if (!n.image && (n.fills || []).some((p: Raw) => p.type === "IMAGE" && p.visible !== false)) { board.warnings.push({ id: n.id, severity: "skipped", message: "Image pixels are missing. Re-export with the latest Board Bridge plugin to include this image." }); continue; }
    const kind = n.image ? "image" : ({ SECTION: "frame", STICKY: "sticky", TEXT: "text", SHAPE_WITH_TEXT: "shape", CONNECTOR: "connector", RECTANGLE: "shape", ELLIPSE: "shape" } as Record<string, BoardNode["kind"]>)[n.type];
    if (!kind) { board.warnings.push({ id: n.id, severity: "skipped", message: `${n.type || "Unknown"} objects are not supported yet.` }); continue; }
    const b = (n.image && n.imageBounds) || n.absoluteBoundingBox || n;
    const t = n.text || { characters: n.characters || "", ...n.style, fills: n.fills };
    const shape = shapes[n.shapeType || n.type] || "rectangle";
    const node: BoardNode = {
      id: n.id, kind, name: n.name || t.characters || kind,
      x: b.x ?? 0, y: b.y ?? 0, width: b.width ?? n.width ?? 1, height: b.height ?? n.height ?? 1,
      rotation: n.rotation || 0, text: t.characters || "", fill: color(n.fills, "#ffffff"),
      stroke: color(n.strokes, "#757575"), strokeWidth: n.strokeWeight || 2,
      textColor: color(t.fills || t.segments?.[0]?.fills, "#333333"), fontSize: typeof t.fontSize === "number" && t.fontSize > 0 ? t.fontSize : 24,
      bold: (t.fontWeight || 400) >= 600, shape,
    };
    if(n.image)node.image=n.image;
    node.fontFamily=typeof t.fontName==='string'?t.fontName:t.fontName?.family;
    node.textAlign=({LEFT:'left',CENTER:'center',RIGHT:'right'} as Record<string,'left'|'center'|'right'>)[t.textAlignHorizontal]||'left';
    node.textAlignVertical=kind==='shape'?'middle':'top';
    if(Array.isArray(t.segments)){const runs=t.segments.map((s:Raw)=>({text:String(s.characters||''),bold:(s.fontWeight||400)>=600,color:color(s.fills,node.textColor)}));if(runs.map((r:{text:string})=>r.text).join('')===node.text)node.runs=runs;}
    if(kind==='text')node.lines=svgTextLines(t.svg,node.fontSize);
    if(kind==='text'&&!node.lines)board.warnings.push({id:node.id,severity:'approximation',message:'This export has no source line positions. Re-export with the latest plugin to preserve wrapping.'});
    if (source.get(n.parentId)?.type === "SECTION") node.parentId = n.parentId;
    if (kind === "shape" && !shapes[n.shapeType || n.type]) board.warnings.push({ id: n.id, severity: "approximation", message: `${n.shapeType || n.type} becomes a rectangle.` });
    if (kind === "frame" && node.parentId) { node.kind = "shape"; node.text = n.name; board.warnings.push({ id: n.id, severity: "approximation", message: "Nested section becomes a labeled shape in its parent frame." }); }
    if (kind === "connector") {
      const a = n.connectorStart, z = n.connectorEnd;
      if (!a?.endpointNodeId || !z?.endpointNodeId) { board.warnings.push({ id:n.id, severity:"skipped", message:"Loose connector has no two attached objects." }); continue; }
      const side = (v: string | undefined): Side => ["TOP", "RIGHT", "BOTTOM", "LEFT"].includes(v || "") ? v!.toLowerCase() as Side : "auto";
      node.start = { id: a.endpointNodeId, side: side(a.magnet) }; node.end = { id: z.endpointNodeId, side: side(z.magnet) };
      node.lineType = ["ELBOWED", "CURVED"].includes(n.lineType || n.connectorLineType) ? (n.lineType || n.connectorLineType).toLowerCase() : "straight";
      node.startArrow = (n.startCap || n.connectorStartStrokeCap || "NONE") !== "NONE";
      node.endArrow = (n.endCap || n.connectorEndStrokeCap || "NONE") !== "NONE";
    }
    board.nodes.push(node);
  }
  const ids = new Set(board.nodes.map(n => n.id));
  board.nodes = board.nodes.filter(n => {
    if (n.kind === "connector" && (!ids.has(n.start!.id) || !ids.has(n.end!.id))) { board.warnings.push({ id:n.id, severity:"skipped", message:"Connector endpoint was omitted from the export." }); return false; }
    if (n.parentId && !ids.has(n.parentId)) delete n.parentId;
    // Flatten nested section ancestry to the nearest actual destination frame.
    let parent = board.nodes.find(p => p.id === n.parentId); const seen = new Set<string>();
    while (parent && parent.kind !== "frame") { if (seen.has(parent.id)) throw new Error("Cyclic source hierarchy."); seen.add(parent.id); parent = board.nodes.find(p => p.id === parent!.parentId); }
    n.parentId = parent?.id;
    return true;
  });
  if (board.nodes.some(n => n.kind === "sticky")) board.warnings.push({ id:"sticky-proportions", severity:"approximation", message:"Miro uses fixed sticky proportions and a named color palette. Exact dimensions, fonts, and authorship are not preserved." });
  if(board.nodes.some(n=>fontIsMapped(n.fontFamily)))board.warnings.push({id:'typography',severity:'approximation',message:'Unsupported source fonts map to Roboto. Text remains editable; review font substitution. Source line positions and bold formatting are preserved when included in the export.'});
  if(board.nodes.some(n=>n.lines&&n.lines.length>1))board.warnings.push({id:'text-lines',severity:'approximation',message:'Paragraphs become editable text lines to preserve their source wrapping and spacing.'});
  return validateBoard(board);
}
export function normalizeRestFile(file: Raw): Board {
  const rows: Raw[] = [];
  function visit(n: Raw, parentId?: string) {
    if (!n || typeof n !== "object") return;
    if (!["DOCUMENT", "CANVAS"].includes(n.type)) rows.push({ ...n, parentId, text: n.text && typeof n.text === "object" ? n.text : { ...n.style, characters: n.characters || "", fills: n.fills }, connectorStart: n.connectorStart, connectorEnd: n.connectorEnd });
    for (const ch of n.children || []) visit(ch, n.id);
  }
  visit(file.document); return normalizeFigJam(rows, file.name || "FigJam board");
}
