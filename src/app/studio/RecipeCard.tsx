"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import type { RecipeCard as RecipeCardData, RecipeId, RecipeInfo } from "@/lib/recipes";

interface RecipeCardProps {
  card: RecipeCardData;
  /** The recipe behind the active variant. */
  recipe: RecipeInfo;
  selected: boolean;
  /** Why the card cannot be picked right now; null when it can. */
  disabledReason: string | null;
  onToggle: () => void;
  onVariant: (recipe: RecipeId) => void;
}

const prefersReducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RecipeCard({ card, recipe, selected, disabledReason, onToggle, onVariant }: RecipeCardProps) {
  const id = useId();
  const video = useRef<HTMLVideoElement>(null);
  const disabled = disabledReason !== null;
  const { example } = recipe;

  // Video cards rest on their poster frame and play muted only while hovered or focused.
  const play = (): void => {
    if (!video.current || prefersReducedMotion()) return;
    void video.current.play().catch(() => undefined);
  };
  const rest = (): void => {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = 0;
    video.current.load();
  };

  const toggle = (): void => {
    if (!disabled) onToggle();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    toggle();
  };

  return (
    <article className="recipe-card" data-selected={selected} data-disabled={disabled} onMouseEnter={play} onMouseLeave={rest}>
      <div
        className="recipe-hit"
        role="checkbox"
        aria-checked={selected}
        aria-disabled={disabled}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-summary${disabled ? ` ${id}-reason` : ""}`}
        tabIndex={disabled ? -1 : 0}
        onClick={toggle}
        onKeyDown={onKeyDown}
        onFocus={play}
        onBlur={rest}
      >
        <div className="recipe-media">
          {example.kind === "image" ? (
            <img src={example.url} alt="" loading="lazy" />
          ) : (
            <video ref={video} key={example.url} src={example.url} poster={example.posterUrl} muted loop playsInline preload="none" aria-hidden="true" />
          )}
          <span className="recipe-check" aria-hidden="true">
            {selected && <CheckMark />}
          </span>
          {disabled && (
            <span className="recipe-reason" id={`${id}-reason`}>
              {disabledReason}
            </span>
          )}
        </div>
        <div className="recipe-body">
          <h3 id={`${id}-title`}>{card.label}</h3>
          <p id={`${id}-summary`}>{card.summary}</p>
        </div>
      </div>

      <div className="recipe-footer">
        {card.variants.length > 1 && (
          <div className="segmented" role="radiogroup" aria-label={`${card.label} mode`}>
            {card.variants.map((variant, index) => (
              <button
                key={variant.recipe}
                type="button"
                role="radio"
                aria-checked={variant.recipe === recipe.id}
                disabled={disabled}
                tabIndex={variant.recipe === recipe.id ? 0 : -1}
                onClick={() => onVariant(variant.recipe)}
                onKeyDown={(event) => {
                  const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
                  if (!offset && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  const next = event.key === "Home" ? 0 : event.key === "End" ? card.variants.length - 1 : (index + offset + card.variants.length) % card.variants.length;
                  onVariant(card.variants[next].recipe);
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
                }}
              >
                {variant.label}
              </button>
            ))}
          </div>
        )}
        <div className="tags">
          {[...recipe.models, ...recipe.workflows].map((tag) => (
            <span className="tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
