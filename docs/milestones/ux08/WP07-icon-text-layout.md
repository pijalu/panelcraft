<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP07 — Icon-above-label shape layout

**Severity:** Medium — composition balance and hierarchy

**Status:** Proposed  
**Requirement:** 3 — vertically center text between icon and bottom shape border  
**Depends on:** nothing  
**Branch:** `feat/ux08-icon-text-layout`

## Single-task outcome

Place custom icons at top center and vertically center the complete wrapped label block in the
remaining space between icon bottom and bottom padding. Apply shared geometry to rendering and
auto-fit; do not alter connection or panel layout.

## Evidence and UX rationale

`shapes.ts:64-80` centers labels using the full shape height; `shapes.ts:227-244` places custom
icons at top-right. Proximity requires icon/text to read as one unit without bottom-heavy labels
or collisions.

## Implementation steps

1. **RED:** extend `ux04-shape-content.spec.ts` with icon center-X and label-region center-Y
   assertions for every icon-bearing non-group kind, one/multiple lines and explicit sizes.
2. Create one pure content-layout result: icon band/rect, label region and reserves for built-in
   adornments. Use it from glyph generation, text wrapping and auto-fit rather than maintaining
   independent offsets.
3. Use an 8 px icon-to-label gap and bottom padding. Auto-fit includes the icon band. Explicit
   resizing uses content-aware minimum geometry or a compact icon band; never silently crop,
   overlap or mutate explicit PDL geometry during load.
4. Handle person glyph, datastore cap, queue band, note fold and imported badge explicitly.
   Groups retain their top-left title semantics and receive a non-overlapping icon treatment.
5. Test icon on/off, wrapping, min/custom sizes, live resize, reload and light/dark. Canvas,
   sanitized export and CLI geometry must remain identical.

## Required checks

```bash
npx vitest run web/src/engine/render/shapes.test.ts web/src/engine/render/measure.test.ts web/src/ui/CanvasController.test.ts
npm run check
npm run build
npx playwright test e2e/ux04-shape-content.spec.ts
```

Review the complete all-kinds matrix plus narrow/tall and wide/short captures in both themes.

## Acceptance

- For every icon-bearing non-group shape, icon center X equals content center X and label-block
  center Y equals the available region midpoint within rounding tolerance.
- No text/icon/glyph/badge overlap or text overflow at tested boundaries.
- Existing explicit geometry stays authoritative; auto-fit grows only through the existing rules.
- Screenshot review confirms labels no longer sit at the shape bottom.

## Evidence

Pending. Record failing geometry measurements, green checks and screenshot review here.
