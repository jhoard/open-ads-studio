"use client";

import { useEffect, useState } from "react";
import type { CreateRequest } from "@/lib/client/useCreatives";
import { NEED_REASON, RECIPE_CARDS, findRecipe, type RecipeId, type RecipeInfo, type RecipeNeed } from "@/lib/recipes";
import { OBJECTIVES, type Objective } from "@/lib/studio";
import type { SceneDirection } from "@/lib/types";
import { DirectionSwatches } from "./DirectionSwatches";
import { RecipeCard } from "./RecipeCard";
import { Select } from "./Select";

/** What the preview pane shows while on Create: the recipe last picked, in the chosen direction. */
export interface CreatePreview {
  recipe: RecipeId;
  directionId: string | undefined;
}

interface CreateStepProps {
  directions: SceneDirection[];
  /** Which needs are met; demo mode meets all of them with the bundled examples. */
  available: Record<RecipeNeed, boolean>;
  /** The finished Scene a cinemagraph animates, when there is one. */
  sceneSourceId: string | null;
  mode: "live" | "demo";
  submitting: boolean;
  error: string | null;
  onPreview: (preview: CreatePreview) => void;
  onCreate: (requests: CreateRequest[], objective: Objective) => void;
}

const recipeOf = (id: RecipeId): RecipeInfo => findRecipe(id) as RecipeInfo;

export function CreateStep({ directions, available, sceneSourceId, mode, submitting, error, onPreview, onCreate }: CreateStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["scene"]));
  const [focusCard, setFocusCard] = useState("scene");
  const [variants, setVariants] = useState<Record<string, RecipeId>>(() => Object.fromEntries(RECIPE_CARDS.map((card) => [card.id, card.variants[0].recipe])));
  const [directionId, setDirectionId] = useState(directions[0]?.id);
  const [objective, setObjective] = useState<Objective>("awareness");

  useEffect(() => {
    onPreview({ recipe: variants[focusCard], directionId });
  }, [focusCard, variants, directionId, onPreview]);

  const reasonFor = (recipe: RecipeInfo): string | null => (recipe.needs && !available[recipe.needs] ? NEED_REASON[recipe.needs] : null);

  const toggle = (cardId: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
    setFocusCard(cardId);
  };

  const pickDirection = (id: string): void => {
    setDirectionId(id);
    setFocusCard("scene");
  };

  const picked = RECIPE_CARDS.filter((card) => selected.has(card.id) && reasonFor(recipeOf(variants[card.id])) === null);

  const create = (): void =>
    onCreate(
      picked.map((card) => {
        const recipe = variants[card.id];
        if (recipe === "scene") return { recipe, directionId };
        if (recipe === "cinemagraph" && sceneSourceId) return { recipe, sourceCreativeId: sceneSourceId };
        return { recipe };
      }),
      objective,
    );

  return (
    <section className="step" aria-labelledby="create-heading">
      <h1 id="create-heading" className="step-title">
        Create
      </h1>
      <p className="step-lede">Pick shot recipes. Each one is a ComfyUI workflow in the repo, running open-weight models on Comfy Cloud.</p>

      <div className="field">
        <label htmlFor="objective">Objective</label>
        <Select id="objective" value={objective} onChange={(event) => setObjective(event.target.value as Objective)}>
          {OBJECTIVES.map((value) => (
            <option key={value} value={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </Select>
      </div>

      <div className="field">
        <span className="field-label">Scene direction</span>
        <DirectionSwatches directions={directions} value={directionId} onChange={pickDirection} />
        <span className="hint">From the brand kit. Slate beam, Travertine morning and Dark stone evening have approved renders.</span>
      </div>

      <div className="field">
        <span className="field-label">Recipes</span>
        <div className="recipe-grid" role="group" aria-label="Shot recipes">
          {RECIPE_CARDS.map((card) => {
            const recipe = recipeOf(variants[card.id]);
            return (
              <RecipeCard
                key={card.id}
                card={card}
                recipe={recipe}
                selected={selected.has(card.id)}
                disabledReason={reasonFor(recipe)}
                onToggle={() => toggle(card.id)}
                onVariant={(next) => {
                  setVariants((current) => ({ ...current, [card.id]: next }));
                  setFocusCard(card.id);
                }}
              />
            );
          })}
        </div>
      </div>

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      <div className="step-actions">
        <button className="button button-wide" type="button" disabled={submitting || picked.length === 0} onClick={create}>
          {submitting ? "Submitting" : `Create ${picked.length} ${picked.length === 1 ? "creative" : "creatives"}`}
        </button>
        <span className="hint">{mode === "demo" ? "Demo mode: shows the bundled example renders, no generation." : "Scene takes about a minute. Reveals and cinemagraphs take two to four."}</span>
      </div>
    </section>
  );
}
