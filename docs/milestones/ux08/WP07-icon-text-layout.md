<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP07 — Icon-above-label shape layout

**Severity:** Medium — composition balance and hierarchy

**Status:** Implemented and verified (2026-11-15)  
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

### RED (before the layout change)

With the pre-WP07 top-right icon placement restored, both new assertion sets failed:

```
web/src/engine/render/shapes.test.ts
  AssertionError: person icon center x: expected 100 to be close to 60,
  received difference is 40, but expected 5e-7
  Tests  2 failed | 15 passed (17)

npx playwright test e2e/ux04-shape-content.spec.ts -g "UX08-WP07"
  Error: customer icon center
  expect(received).toBeLessThanOrEqual(expected)
  Expected: <= 1.5
  Received:    50.076507568359375
  1 failed
```

### GREEN (after the change)

```
npx vitest run                     Test Files 110 passed | Tests 1140 passed
npx playwright test                125 passed (46.8s)
npm run check                      tsc + tsc -p tsconfig.sw.json + eslint: clean
npm run build                      built in 114ms
go test ./...                      ok (cmd, internal/corpus, ir, pdl, server)
staticcheck ./...                  rc=0
gocyclo -over 15 cmd internal web  OK
bash scripts/check-docs.sh         OK — 9 docs, all links resolve, .pcd blocks valid
bash scripts/check-selfcontained.sh OK — no external-origin resource loads in web/dist
```

Measured geometry (unit, `contentBox`):

- icon centre X = `w/2` for person, system, system_ext, container, component, datastore, queue, note
  at h = 96 and 140, tolerance 1e-9 (e2e DOM tolerance 1.5 px).
- label block centre Y = `(label.top + label.bottom) / 2` for one and two label lines; the block
  starts at or below `CONTENT_PAD.top + icon.size` and ends at or above `h - CONTENT_PAD.bottom`.
- built-in glyph bands stay above the label region (`label.top > glyphTop + glyphHeight`).
- `h < 44` (or a glyph band with < 10 px left) falls back to an inline icon at `CONTENT_PAD.x`
  with `label.left >= icon.x + icon.size`; nothing is cropped (`icon.y >= 0`, bottom <= `h`).
- group keeps its `(8, 16)` top-left title while its icon is centred at `w/2`.

### Screenshot review (light + dark)

Reviewed `ux04-all-kinds-{light,dark}`, `ux04-selected-person-dark`,
`ux04-narrow-tall-light`, `ux04-wide-short-light` and `ux04-minimum-imported-{light,dark}`
(`test-results/screenshots/`).

Defects found and fixed in this work package:

1. **Glyph fills were dead attributes.** `fill: 'none'` on a `.pc-glyph` element loses to the
   stylesheet's `.pc-glyph { fill: var(--pc-muted) }`, so the datastore lid and the note's corner
   fold rendered as filled muted blobs — in dark theme a light lid on a dark body. Fixed by an
   explicit `.pc-glyph-outline` class; guard test refuses any `fill` attribute on glyph specs.
   The person's shoulder arc is intentionally *filled* (vision review: a hairline arc under the
   solid head reads worse than one silhouette), so it carries plain `.pc-glyph`.
2. **Mislabeled capture.** `ux04-wide-short-dark` was captured in light theme (pixel check:
   canvas `250,250,250`). Renamed to `ux04-wide-short-light`; the genuinely dark captures were
   verified the same way (canvas `17,19,22`).

No overlap, clipping or bottom-heavy label remained in any reviewed capture; the imported badge
stays clear of the label at minimum size.
