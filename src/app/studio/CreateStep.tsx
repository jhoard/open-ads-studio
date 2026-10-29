"use client";

import { useState } from "react";
import type { CreateRequest } from "@/lib/client/useCreatives";
import type { RecipeId, RecipeInfo } from "@/lib/recipes";
import type { SceneDirection } from "@/lib/types";

const OBJECTIVES = ["sales", "leads", "traffic", "awareness", "engagement"] as const;
type Objective = (typeof OBJECTIVES)[number];

interface CreateStepProps {
  recipes: readonly RecipeInfo[];
  directions: SceneDirection[];
  hasReveal: boolean;
  mode: "live" | "demo";
  submitting: boolean;
  error: string | null;
  onCreate: (requests: CreateRequest[]) => void;
}

function RecipeMedia({ recipe }: { recipe: RecipeInfo }) {
  return recipe.example.kind === "image" ? (
    <img src={recipe.example.url} alt={`${recipe.label} example`} loading="lazy" />
  ) : (
    <video src={recipe.example.url} muted loop playsInline autoPlay preload="metadata" aria-label={`${recipe.label} example`} />
  );
}

export function CreateStep({ recipes, directions, hasReveal, mode, submitting, error, onCreate }: CreateStepProps) {
  const [selected, setSelected] = useState<Set<RecipeId>>(new Set(["scene"]));
  const [directionId, setDirectionId] = useState(directions[0]?.id);
  const [objective, setObjective] = useState<Objective>("awareness");

  const toggle = (id: RecipeId): void =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = (): void => onCreate([...selected].map((recipe) => ({ recipe, ...(recipe === "scene" ? { directionId } : {}) })));

  return (
    <section className="panel" aria-labelledby="create-heading">
      <h2 id="create-heading">Create</h2>
      <p className="lede">Pick shot recipes. Each one is a ComfyUI workflow in the repo, running open-weight models on Comfy Cloud.</p>

      <div className="split split-spaced">
        <div className="field">
          <label htmlFor="objective">Objective</label>
          <select id="objective" value={objective} onChange={(event) => setObjective(event.target.value as Objective)}>
            {OBJECTIVES.map((value) => (
              <option key={value} value={value}>
                {value[0].toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field-label">Scene direction</span>
          <div className="chips" role="group" aria-label="Scene direction">
            {directions.map((direction) => (
              <button key={direction.id} type="button" className="chip" aria-pressed={direction.id === directionId} onClick={() => setDirectionId(direction.id)}>
                {direction.label}
              </button>
            ))}
          </div>
          <span className="hint">From the brand kit. Slate beam is the tested look.</span>
        </div>
      </div>

      <div className="recipe-grid">
        {recipes.map((recipe) => {
          const disabled = recipe.needsReveal && !hasReveal;
          const isSelected = selected.has(recipe.id);
          return (
            <label key={recipe.id} className="recipe-card" data-selected={isSelected} data-disabled={disabled}>
              <input type="checkbox" checked={isSelected} disabled={disabled} onChange={() => toggle(recipe.id)} />
              <div className="recipe-media">
                <RecipeMedia recipe={recipe} />
              </div>
              <div className="recipe-body">
                <h3>{recipe.label}</h3>
                <p>{recipe.summary}</p>
                <div className="tags">
                  {[...recipe.models, ...recipe.workflows].map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {error && (
        <p className="notice notice-error notice-spaced" role="alert">
          {error}
        </p>
      )}
      <div className="step-actions">
        <span className="hint">{mode === "demo" ? "Demo mode: shows the bundled example renders, no generation." : "Scene takes about a minute. Reveals take two to four."}</span>
        <button className="button" type="button" disabled={submitting || selected.size === 0} onClick={create}>
          {submitting ? "Submitting" : `Create ${selected.size} ${selected.size === 1 ? "creative" : "creatives"}`}
        </button>
      </div>
    </section>
  );
}
