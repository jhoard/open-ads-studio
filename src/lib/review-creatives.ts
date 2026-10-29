import type { Creative } from "./studio";

export function reviewCreativeKey(creative: Creative, copy: Record<string, string>): string {
  return creative.demo && creative.status === "succeeded" && creative.outputUrl
    ? JSON.stringify(["example", creative.recipe, creative.outputKind, creative.outputUrl, creative.rawUrl, creative.objective ?? "awareness", copy[creative.id] ?? null])
    : JSON.stringify(["job", creative.id]);
}

/** Collapse repeated records in the UI without deleting generation history or copy edits. */
export function distinctReviewCreatives(creatives: Creative[], copy: Record<string, string>, approved: ReadonlySet<string>): Creative[] {
  const result: Creative[] = [];
  const positions = new Map<string, number>();
  for (const creative of creatives) {
    const key = reviewCreativeKey(creative, copy);
    const position = positions.get(key);
    if (position === undefined) {
      positions.set(key, result.length);
      result.push(creative);
    } else if (approved.has(creative.id) && !approved.has(result[position].id)) {
      // Keep an approved representative so a repeat never hides the approval state.
      result[position] = creative;
    }
  }
  return result;
}
