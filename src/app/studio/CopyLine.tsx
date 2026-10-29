"use client";

import { useId } from "react";
import { checkClaims, type ClaimsCheck } from "@/lib/claims-guard";
import { OBJECTIVES, type BrandSafety, type Objective } from "@/lib/studio";
import { Select } from "./Select";

interface CopyLineProps {
  value: string;
  objective: Objective;
  lines: Record<Objective, string[]>;
  safety: BrandSafety;
  onChange: (text: string) => void;
}

export const claimsFor = (text: string, safety: BrandSafety): ClaimsCheck => checkClaims(text, safety.claimsGuard);

function Verdict({ check }: { check: ClaimsCheck }) {
  if (check.status === "blocked") {
    return (
      <p className="claims claims-blocked" role="alert">
        Blocked by the claims guard: &quot;{check.blocked.join('", "')}&quot;. Rewrite the line to export.
      </p>
    );
  }
  if (check.status === "flagged") {
    return (
      <p className="claims claims-flagged" role="status">
        Needs substantiation: &quot;{check.flagged.join('", "')}&quot;. Supplement claims need FTC-grade evidence before this runs.
      </p>
    );
  }
  return <p className="claims claims-clear">Claims guard: clear</p>;
}

export function CopyLine({ value, objective, lines, safety, onChange }: CopyLineProps) {
  const id = useId();
  // Suggestions for the creative's objective first, then the rest.
  const ordered = [objective, ...OBJECTIVES.filter((other) => other !== objective)];
  return (
    <div className="copy-line">
      <label className="field-label" htmlFor={`${id}-pick`}>
        Copy line
      </label>
      <Select id={`${id}-pick`} value="" onChange={(event) => event.target.value && onChange(event.target.value)}>
        <option value="">Suggestions from the brand kit</option>
        {ordered.map((group) => (
          <optgroup key={group} label={group[0].toUpperCase() + group.slice(1)}>
            {lines[group].map((line) => (
              <option key={line} value={line}>
                {line}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <textarea aria-label="Edit copy line" value={value} maxLength={140} onChange={(event) => onChange(event.target.value)} />
      <Verdict check={claimsFor(value, safety)} />
    </div>
  );
}
