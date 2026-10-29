"use client";

import { useState } from "react";
import type { BrandSafety, Creative, Objective } from "@/lib/studio";
import { CopyLine, claimsFor } from "./CopyLine";

const STATUS_LABEL: Record<Creative["status"], string> = {
  queued: "Queued",
  running: "Rendering",
  canceling: "Canceling",
  succeeded: "Ready",
  canceled: "Canceled",
  failed: "Failed",
  expired: "Expired",
};

// Floor, not round: a 99.96% match must not read as a perfect 100.0%.
export const percent = (value: number): string => `${(Math.floor(value * 1000) / 10).toFixed(1)}%`;

function Status({ creative }: { creative: Creative }) {
  return (
    <span className={`status status-${creative.status}`}>
      <span className="status-dot" />
      {STATUS_LABEL[creative.status]}
      {creative.queuePosition ? `, position ${creative.queuePosition}` : ""}
    </span>
  );
}

interface CreativeCardProps {
  creative: Creative;
  approved: boolean;
  copy: string;
  copyLines: Record<Objective, string[]>;
  safety: BrandSafety;
  onCopyChange: (text: string) => void;
  onToggleApproved: () => void;
  onRemove: () => void;
}

export function CreativeCard({ creative, approved, copy, copyLines, safety, onCopyChange, onToggleApproved, onRemove }: CreativeCardProps) {
  const blocked = claimsFor(copy, safety).status === "blocked";
  const [showModel, setShowModel] = useState(false);
  const ready = creative.status === "succeeded" && creative.outputUrl !== null;
  const media = showModel && creative.rawUrl ? creative.rawUrl : creative.outputUrl;

  return (
    <article className="creative">
      <div className="creative-media">
        {ready && media ? (
          creative.outputKind === "video" ? (
            <video src={media} controls loop playsInline preload="metadata" />
          ) : (
            <img src={media} alt={`${creative.label}${showModel ? ", model output before the label restore" : ""}`} />
          )
        ) : (
          <Status creative={creative} />
        )}
      </div>
      <div className="creative-body">
        <div className="creative-title">
          <span>{creative.label}</span>
          <Status creative={creative} />
        </div>
        {creative.errorMessage && <p className="notice notice-error">{creative.errorMessage}</p>}
        <div className="badges">
          {creative.labelMatch !== null && <span className="badge badge-ok">Label match {percent(creative.labelMatch)}</span>}
          {creative.modelLabelMatch !== null && <span className="badge badge-muted">Model alone {percent(creative.modelLabelMatch)}</span>}
          <span className="badge badge-risk" title={safety.riskReason}>
            Risk: {safety.riskRating}, {safety.subcategories[0]}
          </span>
          {creative.demo && <span className="badge badge-muted">Example render</span>}
        </div>
        {ready && <CopyLine value={copy} objective={creative.objective ?? "awareness"} lines={copyLines} safety={safety} onChange={onCopyChange} />}
        <div className="creative-actions">
          {ready && (
            <button className="button" type="button" aria-pressed={approved} disabled={blocked && !approved} onClick={onToggleApproved}>
              {approved ? "Approved" : "Approve"}
            </button>
          )}
          {ready && creative.rawUrl && (
            <button className="button button-secondary" type="button" aria-pressed={showModel} onClick={() => setShowModel((value) => !value)}>
              {showModel ? "Show final" : "Show model output"}
            </button>
          )}
          <button className="button button-secondary" type="button" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}
