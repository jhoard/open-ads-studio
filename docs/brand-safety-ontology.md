# Brand-safety and AI-disclosure ontology (adapted for Open Ads Studio)

Source: James's Stykii Persona brand-safety block (persona-meta-prompt v1.1, persona-schema v1.0) and the Persona category taxonomy. Adapted here from persona-level to creative-level. Apply at export time to every Creative.

## 1. Category taxonomy (14 top-level, plus Other)

Food & beverage, Beauty & personal care, Apparel & accessories, Home & DIY, Tech & electronics, Fitness & wellness, Travel & hospitality, Parenting & family, Gaming & streaming, Automotive, Outdoor, Retail, Financial services, Education, Other.

Map free-text product categories onto these with keyword rules. Unmatched goes to Other. Raw strings are kept on the Product record.

## 2. Risk rating (graded, never a default)

- `low`: no claims-sensitive or regulated adjacency.
- `medium`: niches adjacent to claims-sensitive or regulated territory.
  - Fitness & wellness or Food & beverage with supplements -> health and performance claims (FTC substantiation, FDA structure/function language)
  - Tech or Financial services -> fintech and crypto adjacency
  - Gaming -> gambling-adjacent, loot boxes
  - Parenting & family -> child-directed advertising rules (COPPA, CARU)
- `elevated`: product directly in a regulated category (alcohol, tobacco/vape, cannabis, pharmaceuticals, gambling, firearms, financial products with returns language).

An all-low catalog carries no signal. Rate honestly.

## 3. Brand-safety block (per Creative)

```json
"brand_safety": {
  "category": "Food & beverage",
  "subcategories": ["supplements", "functional confectionery"],
  "allowed_categories": [],
  "excluded_categories": [],
  "risk_rating": "medium",
  "claims_guard": {
    "blocked_phrases": ["cures", "clinically proven", "guaranteed", "burns fat", "treats"],
    "requires_substantiation": ["builds muscle", "boosts performance", "improves focus"]
  },
  "disclosure_requirements": [
    "AI-generated imagery and video; disclose per EU AI Act Art. 50 and FTC endorsement guidelines",
    "Supplement: structure/function claims only, no disease claims"
  ],
  "regional_restrictions": []
}
```

Copy-line check: run the generated copy line against `claims_guard` before export. Blocked phrase -> reject and regenerate. Substantiation phrase -> flag in the UI, do not block.

## 4. AI-disclosure label (per export)

Every exported still and clip carries:
- A visible badge: `AI-generated` (small, corner, brand-neutral, never covering the product)
- Metadata: `ai_generated: true`, `models: ["<image model>", "LTX-2", "MiniMax H3"]`, `generator: "Open Ads Studio"`, `disclosure_basis: ["EU AI Act Art. 50", "FTC Endorsement Guides"]`
- Stretch, only if time remains: C2PA content credentials via the c2pa-node library. Not required for the demo.

## 5. Provenance (per Creative, mirrors Stykii's rule "provenance on every record")

```json
"provenance": {
  "generator": "open-ads-studio",
  "workflow": "scene.json@<git sha>",
  "models": {"still": "...", "vfx": "LTX-2", "hero": "MiniMax H3"},
  "prompt_ref": "...",
  "brand_ref": "DESIGN.md@<hash>",
  "generated_at": "<ISO 8601>",
  "reviewed_by": null,
  "reviewed_at": null,
  "status": "draft"
}
```

## 6. Demo moment (Tauvel)

Tauvel is a creatine + coffee chocolate. Category: Food & beverage, subcategory supplements. Risk rating: medium. In the demo, let the copy generator propose a line with a performance claim, show the claims guard flag it, and show the AI-disclosure badge on the export. That is the thirty seconds that separates this from every other Ads Studio clone in the room.
