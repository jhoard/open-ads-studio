// Claims guard for copy lines (docs/brand-safety-ontology.md, section 3). Pure and client-safe:
// a blocked phrase stops the export, a substantiation phrase is flagged but allowed.

export interface ClaimsGuard {
  blockedPhrases: string[];
  requiresSubstantiation: string[];
}

export interface ClaimsCheck {
  status: "clear" | "flagged" | "blocked";
  blocked: string[];
  flagged: string[];
}

const escape = (phrase: string): string => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word, case-insensitive match, so "treats" catches "Treats" but not "treatsy". */
function contains(text: string, phrase: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(phrase)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}

export function checkClaims(text: string, guard: ClaimsGuard): ClaimsCheck {
  const blocked = guard.blockedPhrases.filter((phrase) => contains(text, phrase));
  const flagged = guard.requiresSubstantiation.filter((phrase) => contains(text, phrase));
  const status = blocked.length > 0 ? "blocked" : flagged.length > 0 ? "flagged" : "clear";
  return { status, blocked, flagged };
}
