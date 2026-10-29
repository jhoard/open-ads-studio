"use client";

import { DIRECTION_EXAMPLES } from "@/lib/directions";
import type { SceneDirection } from "@/lib/types";

interface DirectionSwatchesProps {
  directions: SceneDirection[];
  value: string | undefined;
  onChange: (id: string) => void;
}

/** Scene directions as tiles: the direction's own render when there is one, a material tile when not. */
export function DirectionSwatches({ directions, value, onChange }: DirectionSwatchesProps) {
  return (
    <div className="swatches-row" role="radiogroup" aria-label="Scene direction">
      {directions.map((direction) => {
        const example = DIRECTION_EXAMPLES[direction.id];
        return (
          <button key={direction.id} type="button" role="radio" aria-checked={direction.id === value} className="direction" onClick={() => onChange(direction.id)}>
            <span className="direction-tile" data-material={direction.id}>
              {example && <img src={example.thumbUrl} alt="" loading="lazy" />}
            </span>
            <span className="direction-name">{direction.label}</span>
            {!example && <span className="direction-note">No approved render yet</span>}
          </button>
        );
      })}
    </div>
  );
}
