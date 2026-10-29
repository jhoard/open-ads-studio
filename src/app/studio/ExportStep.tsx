"use client";

import type { Creative } from "@/lib/studio";
import { percent } from "./CreativeCard";

interface ExportStepProps {
  creatives: Creative[];
}

// Example renders are static files; job outputs take ?download=1 for an attachment filename.
const downloadUrl = (creative: Creative): string => (creative.demo ? (creative.outputUrl as string) : `${creative.outputUrl}?download=1`);

export function ExportStep({ creatives }: ExportStepProps) {
  return (
    <section className="panel" aria-labelledby="export-heading">
      <h2 id="export-heading">Export</h2>
      <p className="lede">Approved creatives, ready to download. Every model in the chain is open weights.</p>
      {creatives.length === 0 ? (
        <p className="empty">Approve creatives in Review to export them.</p>
      ) : (
        <ul className="export-list">
          {creatives.map((creative) => (
            <li className="export-row" key={creative.id}>
              {creative.outputKind === "video" ? <video src={creative.outputUrl as string} muted preload="metadata" /> : <img src={creative.outputUrl as string} alt="" />}
              <div>
                <strong>{creative.label}</strong>
                <p className="hint flush">
                  {creative.outputKind === "video" ? "MP4 with audio track" : "PNG"}
                  {creative.labelMatch !== null ? `, label match ${percent(creative.labelMatch)}` : ""}
                </p>
              </div>
              <a className="button" href={downloadUrl(creative)} download>
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
