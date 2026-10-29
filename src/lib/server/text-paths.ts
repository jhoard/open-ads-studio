import { readFileSync } from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

// Text as SVG paths from the bundled OFL fonts, so exports never depend on system fonts
// (serverless images have almost none, and fontconfig ignores app fonts on some builds).

export type FontName = "display" | "label";

const FONT_FILES: Record<FontName, string> = {
  display: "GildaDisplay-Regular.ttf",
  label: "Lato-Bold.ttf",
};

const cache = new Map<FontName, opentype.Font>();

function font(name: FontName): opentype.Font {
  let loaded = cache.get(name);
  if (!loaded) {
    const bytes = readFileSync(path.join(process.cwd(), "assets", "fonts", FONT_FILES[name]));
    loaded = opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    cache.set(name, loaded);
  }
  return loaded;
}

export interface TextStyle {
  font: FontName;
  size: number;
  /** In em, as opentype.js takes it. */
  letterSpacing?: number;
  lineHeight?: number;
  align?: "left" | "center";
}

export interface TextBlock {
  /** SVG path data, already positioned. */
  d: string;
  width: number;
  height: number;
  lines: number;
}

function wrap(text: string, measure: (line: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Wrap and lay out text inside a box; the first baseline sits one ascent below the top. */
export function textBlock(text: string, box: { x: number; y: number; width: number }, style: TextStyle): TextBlock {
  const face = font(style.font);
  const options = { letterSpacing: style.letterSpacing ?? 0 };
  const measure = (line: string): number => face.getAdvanceWidth(line, style.size, options);
  const lines = wrap(text, measure, box.width);
  const lineHeight = style.size * (style.lineHeight ?? 1.2);
  const ascent = (face.ascender / face.unitsPerEm) * style.size;
  const parts = lines.map((line, index) => {
    const offset = style.align === "center" ? (box.width - measure(line)) / 2 : 0;
    return face.getPath(line, box.x + offset, box.y + ascent + index * lineHeight, style.size, options).toPathData(2);
  });
  return { d: parts.join(" "), width: Math.max(0, ...lines.map(measure)), height: lines.length * lineHeight, lines: lines.length };
}
