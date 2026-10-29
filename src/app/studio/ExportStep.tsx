"use client";

import { useState } from "react";
import { EXPORT_SIZES, type ExportSize } from "@/lib/export-layout";
import type { BrandSafety, Creative } from "@/lib/studio";
import { claimsFor } from "./CopyLine";
import { percent } from "./CreativeCard";

interface ExportStepProps {
  creatives: Creative[];
  copyFor: (creative: Creative) => string;
  safety: BrandSafety;
}

const SIZE_LABEL: Record<ExportSize, string> = { "9:16": "9:16 story", "1:1": "1:1 feed", "16:9": "16:9 landscape" };

async function downloadPack(creative: Creative, copy: string, sizes: ExportSize[]): Promise<string | null> {
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creativeId: creative.id, recipe: creative.recipe, demo: creative.demo, sizes, copy }),
  });
  if (!response.ok) {
    try {
      return ((await response.json()) as { error?: string }).error ?? `Export failed (${response.status}).`;
    } catch {
      return `Export failed (${response.status}).`;
    }
  }
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "open-ads-studio-pack.zip";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
  return null;
}

function ExportRow({ creative, copy, safety }: { creative: Creative; copy: string; safety: BrandSafety }) {
  const [sizes, setSizes] = useState<Set<ExportSize>>(new Set(EXPORT_SIZES));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claims = claimsFor(copy, safety);

  const toggle = (size: ExportSize): void =>
    setSizes((current) => {
      const next = new Set(current);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return next;
    });

  const download = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setError(await downloadPack(creative, copy, EXPORT_SIZES.filter((size) => sizes.has(size))));
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="export-row">
      {creative.outputKind === "video" ? <video src={creative.outputUrl as string} muted preload="metadata" /> : <img src={creative.outputUrl as string} alt="" />}
      <div className="export-detail">
        <strong>{creative.label}</strong>
        <p className="hint flush">
          &quot;{copy}&quot;
          {creative.labelMatch !== null ? `, label match ${percent(creative.labelMatch)}` : ""}
        </p>
        <div className="chips" role="group" aria-label="Export sizes">
          {EXPORT_SIZES.map((size) => (
            <button key={size} type="button" className="chip" aria-pressed={sizes.has(size)} onClick={() => toggle(size)}>
              {SIZE_LABEL[size]}
            </button>
          ))}
        </div>
        {claims.status === "flagged" && <p className="claims claims-flagged">Exports with a substantiation note in DISCLOSURE.txt: &quot;{claims.flagged.join('", "')}&quot;.</p>}
        {claims.status === "blocked" && <p className="claims claims-blocked">Blocked copy line. Fix it in Review to export.</p>}
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <button className="button" type="button" disabled={busy || sizes.size === 0 || claims.status === "blocked"} onClick={download}>
        {busy ? "Rendering" : "Download pack"}
      </button>
    </li>
  );
}

export function ExportStep({ creatives, copyFor, safety }: ExportStepProps) {
  return (
    <section className="panel" aria-labelledby="export-heading">
      <h2 id="export-heading">Export</h2>
      <p className="lede">
        Each pack holds the chosen sizes with the copy line, the logo and a visible AI-generated badge, a logo end card on clips, disclosure metadata in every file, and provenance.json. Basis: {safety.disclosureBasis.join(", ")}.
      </p>
      {creatives.length === 0 ? (
        <p className="empty">Approve creatives in Review to export them.</p>
      ) : (
        <ul className="export-list">
          {creatives.map((creative) => (
            <ExportRow key={creative.id} creative={creative} copy={copyFor(creative)} safety={safety} />
          ))}
        </ul>
      )}
    </section>
  );
}
