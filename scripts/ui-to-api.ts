// Convert a ComfyUI UI-format workflow (official templates, with subgraphs) into the
// API format the SDK submits. Widget names come from the server's object_info.
// Usage: npx tsx scripts/ui-to-api.ts <ui.json> <out-api.json> [object_info.json]
import { readFile, writeFile } from "node:fs/promises";

type Json = unknown;
type Spec = [unknown, Record<string, unknown>?];
interface NodeDef {
  input: { required?: Record<string, Spec>; optional?: Record<string, Spec> };
  input_order?: { required?: string[]; optional?: string[] };
}
type ObjectInfo = Record<string, NodeDef>;
interface UiInput { name: string; type: string; link: number | null; widget?: { name: string } }
interface UiOutput { type: string }
interface UiNode { id: number; type: string; mode?: number; inputs?: UiInput[]; outputs?: UiOutput[]; widgets_values?: Json[] | Record<string, Json> }
interface Link { id: number; originId: number; originSlot: number; targetId: number; targetSlot: number; type: string }
interface SubgraphDef { id: string; inputs: { name: string; type: string }[]; outputs: { linkIds: number[] }[]; nodes: UiNode[]; links: Json[] }
interface UiGraph { nodes: UiNode[]; links: Json[]; definitions?: { subgraphs?: SubgraphDef[] } }
type Ref = [string, number];
type Binding = { ref: Ref } | { value: Json } | undefined;
interface ApiNode { class_type: string; inputs: Record<string, Json>; _meta: { title: string } }

const SUBGRAPH_INPUT_NODE = -10;
const MODE_MUTED = 2;
const MODE_BYPASSED = 4;
const WIDGET_TYPES = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO", "COMFY_DYNAMICCOMBO_V3"]);
const CONTROL_VALUES = new Set(["fixed", "randomize", "increment", "decrement"]);

interface Level {
  nodes: Map<number, UiNode>;
  links: Map<number, Link>;
  prefix: string;
  bindings: Binding[];
}

function normalizeLink(raw: Json): Link {
  if (Array.isArray(raw)) {
    const [id, originId, originSlot, targetId, targetSlot, type] = raw as [number, number, number, number, number, string];
    return { id, originId, originSlot, targetId, targetSlot, type };
  }
  const l = raw as { id: number; origin_id: number; origin_slot: number; target_id: number; target_slot: number; type: string };
  return { id: l.id, originId: l.origin_id, originSlot: l.origin_slot, targetId: l.target_id, targetSlot: l.target_slot, type: l.type };
}

function isWidgetType(type: unknown, opts: Record<string, unknown>): boolean {
  if (opts.forceInput) return false;
  if (typeof opts.widgetType === "string") return WIDGET_TYPES.has(opts.widgetType);
  return Array.isArray(type) || (typeof type === "string" && WIDGET_TYPES.has(type));
}

export function convert(ui: UiGraph, info: ObjectInfo): Record<string, ApiNode> {
  const subgraphs = new Map((ui.definitions?.subgraphs ?? []).map((s) => [s.id, s]));
  const out: Record<string, ApiNode> = {};

  const makeLevel = (nodes: UiNode[], links: Json[], prefix: string, bindings: Binding[]): Level => ({
    nodes: new Map(nodes.map((n) => [n.id, n])),
    links: new Map(links.map(normalizeLink).map((l) => [l.id, l])),
    prefix,
    bindings,
  });

  const childLevel = (level: Level, node: UiNode): Level => {
    const def = subgraphs.get(node.type);
    if (!def) throw new Error(`unknown subgraph ${node.type}`);
    const values = Array.isArray(node.widgets_values) ? [...node.widgets_values] : [];
    const bindings: Binding[] = def.inputs.map((sgInput) => {
      const instanceInput = node.inputs?.find((i) => i.name === sgInput.name);
      const widgetValue = WIDGET_TYPES.has(sgInput.type) ? values.shift() : undefined;
      if (instanceInput?.link != null) {
        const resolved = resolveLink(level, instanceInput.link);
        if (resolved) return resolved;
      }
      return widgetValue === undefined ? undefined : { value: widgetValue };
    });
    return makeLevel(def.nodes, def.links, `${level.prefix}${node.id}:`, bindings);
  };

  function resolveSource(level: Level, originId: number, originSlot: number): Binding {
    if (originId === SUBGRAPH_INPUT_NODE) return level.bindings[originSlot];
    const node = level.nodes.get(originId);
    if (!node) throw new Error(`missing node ${originId} in ${level.prefix || "root"}`);
    if (node.mode === MODE_MUTED) return undefined;
    const def = subgraphs.get(node.type);
    if (def) {
      const linkId = def.outputs[originSlot]?.linkIds[0];
      return linkId === undefined ? undefined : resolveLink(childLevel(level, node), linkId);
    }
    if (node.mode === MODE_BYPASSED || !info[node.type]) {
      // Bypassed nodes and frontend-only reroutes pass their matching input through.
      const outType = node.outputs?.[originSlot]?.type;
      const passthrough = node.inputs?.find((i) => i.type === outType && i.link != null);
      return passthrough ? resolveLink(level, passthrough.link!) : undefined;
    }
    return { ref: [`${level.prefix}${node.id}`, originSlot] };
  }

  function resolveLink(level: Level, linkId: number): Binding {
    const link = level.links.get(linkId);
    if (!link) throw new Error(`missing link ${linkId} in ${level.prefix || "root"}`);
    return resolveSource(level, link.originId, link.originSlot);
  }

  function emitLevel(level: Level): void {
    for (const node of level.nodes.values()) {
      if (node.mode === MODE_MUTED || node.mode === MODE_BYPASSED) continue;
      if (subgraphs.has(node.type)) {
        emitLevel(childLevel(level, node));
        continue;
      }
      const def = info[node.type];
      if (!def) continue; // Notes, reroutes and other frontend-only nodes.
      const inputs = widgetInputs(def, Array.isArray(node.widgets_values) ? node.widgets_values : []);
      for (const input of node.inputs ?? []) {
        if (input.link == null) continue;
        const resolved = resolveLink(level, input.link);
        const name = input.widget?.name ?? input.name;
        if (resolved && "ref" in resolved) inputs[name] = resolved.ref;
        else if (resolved && "value" in resolved) inputs[name] = resolved.value;
      }
      out[`${level.prefix}${node.id}`] = { class_type: node.type, inputs, _meta: { title: node.type } };
    }
  }

  emitLevel(makeLevel(ui.nodes, ui.links, "", []));
  return out;
}

function widgetInputs(def: NodeDef, values: Json[]): Record<string, Json> {
  const result: Record<string, Json> = {};
  let index = 0;
  const walk = (inputs: NodeDef["input"], order: NodeDef["input_order"] | undefined, prefix: string): void => {
    const names = [
      ...(order?.required ?? Object.keys(inputs.required ?? {})),
      ...(order?.optional ?? Object.keys(inputs.optional ?? {})),
    ];
    for (const name of names) {
      const spec = inputs.required?.[name] ?? inputs.optional?.[name];
      if (!spec) continue;
      const [type, opts = {}] = spec;
      if (!isWidgetType(type, opts) || index >= values.length) continue;
      const value = values[index++];
      result[`${prefix}${name}`] = value;
      if (opts.control_after_generate && CONTROL_VALUES.has(String(values[index]))) index++;
      if (opts.image_upload && values[index] === "image") index++;
      if (type === "COMFY_DYNAMICCOMBO_V3") {
        const options = (opts.options ?? []) as { key: string; inputs: NodeDef["input"] }[];
        const chosen = options.find((o) => o.key === value);
        if (chosen) walk(chosen.inputs, undefined, `${prefix}${name}.`);
      }
    }
  };
  walk(def.input, def.input_order, "");
  return result;
}

async function main(): Promise<void> {
  const [uiPath, outPath, infoPath = "var/object_info.json"] = process.argv.slice(2);
  if (!uiPath || !outPath) throw new Error("usage: ui-to-api.ts <ui.json> <out-api.json> [object_info.json]");
  const ui = JSON.parse(await readFile(uiPath, "utf8")) as UiGraph;
  const info = JSON.parse(await readFile(infoPath, "utf8")) as ObjectInfo;
  const api = convert(ui, info);
  await writeFile(outPath, `${JSON.stringify(api, null, 2)}\n`);
  console.log(`wrote ${Object.keys(api).length} nodes to ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
