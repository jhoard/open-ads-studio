# Studio UX and accessibility redesign

Implemented Oct 29, 2026, following the user-confirmed neutral dark workspace direction in PRODUCT.md.

## Changes

- Numbered horizontal workflow navigation with current-step treatment and accessible explanations for unavailable steps.
- Wider editor, grouped brand settings, collapsible import controls and a sticky Continue action.
- Contained brand preview with visible palette names and hex values.
- Stronger input boundaries, readable disabled actions, 44px primary interaction targets and visible focus indicators.
- Skip link, focus transfer to the step heading, status/error announcements, selection checkmarks, and arrow-key navigation for scene and recipe-mode radio groups.
- Responsive editor-first reading order and reduced-motion/forced-colors support.

## Verification

- TypeScript check and production build passed.
- All 23 existing tests passed. The crawler tests require permission to open local test servers.
- Browser checks at 1280x720, 390x844 and 320x740: no document-level horizontal overflow. The desktop brand preview fits its pane.
- Brand editing updates the preview. Product protection still gates Create. Step changes focus the new h1.
- Arrow keys select and focus scene directions and recipe modes. Focused form controls remain above the sticky footer.
- Calculated default color contrast: body text/panel 14.69:1, secondary text/panel 7.87:1, control boundary/panel 4.26:1, primary action text/fill 9.82:1.

Screenshots: img/studio-redesign-desktop.png and img/studio-redesign-mobile.png.

This is targeted accessibility verification, not a full WCAG conformance audit. Assistive-technology testing, all extracted brand palettes and the complete review/export flow remain outside this UI pass. No live creative generation or deployment was performed.

## Reference-led refinement

The user's supplied Holo visual reference informed a second pass: charcoal surfaces, compact native sans typography, restrained lime action color, a workflow sidebar, and a working identity sheet with separate mark, typography and palette references. No decorative generated assets or new dependencies were added.

The refined version was checked at 1280x720, 390x844 and 320x740 with no horizontal overflow. Generation mode remains visible on phones. Product navigation still focuses its heading. TypeScript, the production build and all 23 existing tests passed. The earlier numerical contrast measurements describe the first palette, not this refinement.

Current previews: img/studio-refined-desktop.png and img/studio-refined-mobile.png.

## Hierarchy and interaction grouping

Follow-up feedback: strengthen header contrast and separate user interactions. The editor now uses a 34px page title, 24px active-brand heading, 20px section headings, 14px medium-weight labels and 12px supporting copy. Import is a bordered disclosure, brand voice is a bounded form group with dark inset inputs, and scene choices form a separate group. Preview section headings now have the same explicit hierarchy. Focus remains clear of the sticky action bar and 390px reflow has no horizontal overflow. TypeScript and production build passed.

Screenshots: img/studio-hierarchy-desktop.png and img/studio-hierarchy-fields.png.

## Before/after comparison

Review automatically shows an aligned divider between the raw model output and the restored creative, without a comparison toggle. A native range supports pointer/touch input, arrows, Page Up/Down and Home/End, with percentage-based screen-reader value text. Comparison is available only when the creative has a raw version. Dragging to either endpoint shows the entire corresponding version. Exports continue to use the final creative.

Videos share play/pause, seek and mute controls; only the restored version supplies audio. Playback drift is corrected when it exceeds 80ms. Cached metadata is read on mount as well as through events, avoiding disabled playback when metadata loaded before hydration.

Verified the actual Review path using cached Scene assets in a demo-only local server, slider endpoints and arrow keys, and 390px reflow without horizontal overflow. A temporary local fixture verified cached video play and seeking on both video elements; the fixture was removed. TypeScript and production build passed. No model generation was performed. Current screenshot: img/studio-comparison-default.png. The earlier toggle-based screenshot is retained as iteration history.

## Duplicate review entries

Review and Export collapse repeated cached examples with the same recipe, output, objective and copy. Live generations remain separate unless they repeat the same job ID. Approved representatives retain their status. Approve/unapprove and Remove apply to the whole displayed duplicate group, so a hidden repeat cannot reappear after an action. Distinct copy edits remain separate. Server-side generation history is unchanged.

Verified two cached Scene rows become one after reload, with approval toggling correctly in both directions. Six regression tests cover cached duplicates, live job identity, distinct objectives/copy, approved representatives and pending outputs. TypeScript and production build passed. Screenshot: img/studio-review-deduplicated.png.
