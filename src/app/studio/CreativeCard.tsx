"use client";

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

export const isReady = (creative: Creative): boolean => creative.status === "succeeded" && creative.outputUrl !== null;

export function Status({ creative }: { creative: Creative }) {
  return (
    <span className={`status status-${creative.status}`}>
      <span className="status-dot" />
      {STATUS_LABEL[creative.status]}
      {creative.queuePosition ? `, position ${creative.queuePosition}` : ""}
    </span>
  );
}

function Thumb({ creative }: { creative: Creative }) {
  if (!isReady(creative)) return <span className="creative-thumb creative-thumb-empty" aria-hidden="true" />;
  return creative.outputKind === "video" ? (
    <video className="creative-thumb" src={creative.outputUrl as string} muted preload="metadata" aria-hidden="true" />
  ) : (
    <img className="creative-thumb" src={creative.outputUrl as string} alt="" />
  );
}

interface CreativeRowProps {
  creative: Creative;
  selected: boolean;
  approved: boolean;
  onSelect: () => void;
}

/** One line in the Review list: thumbnail, name, status, scores. Selecting it fills the preview. */
export function CreativeRow({ creative, selected, approved, onSelect }: CreativeRowProps) {
  return (
    <li>
      <button type="button" className="creative-row" aria-pressed={selected} onClick={onSelect}>
        <Thumb creative={creative} />
        <span className="creative-row-text">
          <span className="creative-row-title">{creative.label}</span>
          <Status creative={creative} />
          {creative.labelMatch !== null && <span className="hint">Label match {percent(creative.labelMatch)}</span>}
        </span>
        {approved && <span className="badge badge-ok">Approved</span>}
      </button>
    </li>
  );
}

interface CreativeDetailProps {
  creative: Creative;
  approved: boolean;
  copy: string;
  copyLines: Record<Objective, string[]>;
  safety: BrandSafety;
  showModel: boolean;
  onShowModel: (show: boolean) => void;
  onCopyChange: (text: string) => void;
  onToggleApproved: () => void;
  onRemove: () => void;
}

/** The selected creative's review controls: scores, copy line with the claims guard, approve. */
export function CreativeDetail({ creative, approved, copy, copyLines, safety, showModel, onShowModel, onCopyChange, onToggleApproved, onRemove }: CreativeDetailProps) {
  const ready = isReady(creative);
  const blocked = claimsFor(copy, safety).status === "blocked";
  return (
    <div className="creative-detail">
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
          <button className="button button-secondary" type="button" aria-pressed={showModel} onClick={() => onShowModel(!showModel)}>
            {showModel ? "Show final" : "Show model output"}
          </button>
        )}
        <button className="button button-secondary" type="button" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}
