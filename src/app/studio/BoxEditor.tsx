"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { MAX_MASK_BOXES, buildGlyphMask, lumaOf, type MaskBox } from "@/lib/glyph-mask";

// Drawn over the packshot in the preview: drag to box the label, see the glyph mask the server will build.

interface BoxEditorProps {
  packshotUrl: string;
  cutoutUrl: string;
  boxes: MaskBox[];
  threshold: number;
  onBoxes: (boxes: MaskBox[]) => void;
}

interface Pixels {
  width: number;
  height: number;
  luma: Float32Array;
  alpha: Uint8ClampedArray;
}

const MIN_DRAG = 0.01; // a drag smaller than this share of the image is a click, not a box

async function loadPixels(packshotUrl: string, cutoutUrl: string): Promise<Pixels> {
  const decode = async (url: string): Promise<ImageData> => {
    const bitmap = await createImageBitmap(await (await fetch(url, { cache: "no-store" })).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  };
  const [image, cutout] = await Promise.all([decode(packshotUrl), decode(cutoutUrl)]);
  const n = image.width * image.height;
  const luma = new Float32Array(n);
  const alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    luma[i] = lumaOf(image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]);
    alpha[i] = cutout.data[i * 4 + 3];
  }
  return { width: image.width, height: image.height, luma, alpha };
}

export function BoxEditor({ packshotUrl, cutoutUrl, boxes, threshold, onBoxes }: BoxEditorProps) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPixels(packshotUrl, cutoutUrl)
      .then((loaded) => {
        if (!cancelled) setPixels(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [packshotUrl, cutoutUrl]);

  // Live mask preview: the same function the server runs on save.
  useEffect(() => {
    const target = canvas.current;
    if (!target || !pixels) return;
    target.width = pixels.width;
    target.height = pixels.height;
    const context = target.getContext("2d");
    if (!context) return;
    const mask = buildGlyphMask(pixels.luma, pixels.alpha, pixels.width, pixels.height, boxes, threshold);
    const out = context.createImageData(pixels.width, pixels.height);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      out.data[i * 4] = 198;
      out.data[i * 4 + 1] = 242;
      out.data[i * 4 + 2] = 90;
      out.data[i * 4 + 3] = 235;
    }
    context.putImageData(out, 0, 0);
  }, [pixels, boxes, threshold]);

  const point = (event: PointerEvent<HTMLDivElement>): { x: number; y: number } => {
    const rect = (surface.current as HTMLDivElement).getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)) };
  };

  const start = (event: PointerEvent<HTMLDivElement>): void => {
    if (boxes.length >= MAX_MASK_BOXES) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    setDrag({ x0: x, y0: y, x1: x, y1: y });
  };
  const move = (event: PointerEvent<HTMLDivElement>): void => {
    if (!drag) return;
    const { x, y } = point(event);
    setDrag({ ...drag, x1: x, y1: y });
  };
  const end = (): void => {
    if (!drag) return;
    const box = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) };
    setDrag(null);
    if (box.width > MIN_DRAG && box.height > MIN_DRAG) onBoxes([...boxes, box]);
  };

  const pending = drag ? { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) } : null;
  const style = (box: MaskBox) => ({ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` });

  return (
    <div ref={surface} className="box-editor" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)} role="application" aria-label="Draw boxes over the label. Drag to add a box.">
      <canvas ref={canvas} className="box-editor-mask" aria-hidden="true" />
      {boxes.map((box, index) => (
        <span key={`${box.x}-${box.y}-${index}`} className="box-editor-box" style={style(box)}>
          <span className="box-editor-index">{index + 1}</span>
        </span>
      ))}
      {pending && <span className="box-editor-box box-editor-pending" style={style(pending)} />}
    </div>
  );
}
