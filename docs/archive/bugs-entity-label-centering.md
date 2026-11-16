<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued bug: centre entity labels by their rendered bounds

Source: `bugs.md`, queued item 14. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §10.

## Observed behaviour

In the reported 57×36 Shop shape the entity name read visibly too low. The
screenshot in the bug also carried a routing complaint; this item is only about
the entity's own label, which is why the regression hides connectors entirely so
the two problems cannot be confused.

## Reproduction

`e2e/bug14-label-centering.spec.ts` seeds the report's exact fixture (a 57×36
`system app "Shop"`) and compares the *rendered* label box with the label region
the layout model reserves:

```
system app "Shop" {
  size 57 36
}
```

Before the fix the rendered label centre sat 4 px below the model centre for
every shape kind, and 7 px below on the reported 36 px-tall shape. The failure
output was, verbatim:

```
+ Array [
+   "app: vertical 176 vs 172",
+ ]
…
+   "plain: vertical 188 vs 184",
+   "store: vertical 200 vs 198",
+   "human: vertical 208 vs 204",
```

## Root cause

Two vertical-positioning models were added together. `shapes.ts` placed the SVG
text baseline at `lineTop + LABEL_ASCENT` (12 px of a 16 px line box), which is
correct for baseline positioning only; the stylesheet additionally applies
`dominant-baseline: central` to `.pc-label`, so the browser centred the em box on
that same `y`. The two offsets stacked, pushing every label half a line box minus
the ascent too low — a constant 4 px drift, most visible in short shapes.

The existing unit tests could not see it: they recomputed the expected bounds
from the same `y` attribute, so a self-consistent but wrong offset passed.

## Implementation

- **One model.** `LABEL_ASCENT` (12 px ascent) is replaced by
  `LABEL_CENTRE = LABEL_LINE_HEIGHT / 2`. The text `y` is now the centre of its
  line box, which is exactly what `dominant-baseline: central` consumes, and the
  stylesheet rule is documented as the single positioning model rather than a
  second one. No compensating constant was added.
- **Cramped shapes.** Fixing the drift exposed a real overlap that the downward
  shift had been hiding: a 32 px-tall datastore cannot fit its lid band, a 16 px
  line box and the bottom padding, so centring pushed the em box up into the
  cylinder lid (`e2e/ux04-shape-content.spec.ts` minimum-size case failed).
  `TEXT_MID` now clamps the block to its region top, so a block that cannot fit
  overflows downward where the padding reserves room instead of upwards into the
  shape's own glyphs.
- **Geometry API.** The label rectangle an owner needs is already published by
  `contentBox(obj).label` (object coordinates, shared by glyph layout, wrapping
  and auto-fit). Item 13 consumes that instead of a second calculation; no new
  divergent API was added.
- **Tests.** Two unit tests pin the contract (line `y` equals region middle at 32,
  36, 64 and 140 px heights; no block above the region at cramped sizes) and the
  browser spec asserts rendered bounds against the model for every kind, both
  themes, and equal air above/below a wrapped block.

## Verification

```
$ npm run check
> tsc --noEmit && tsc -p tsconfig.sw.json --noEmit && eslint .
(no errors)

$ npm test
 Test Files  117 passed (117)
      Tests  1322 passed (1322)

$ npm run build && npx playwright test e2e/bug14-label-centering.spec.ts
  4 passed (1.7s)

$ npx playwright test
  165 passed (1.1m)
```

Vision review (`test-results/screenshots/label-57x36-{light,dark}.png`): the
Shop name now sits optically centred in the 57×36 body, with clear air above and
below and no clipping, in both themes.

## Residual risks

- Measurement uses the ink box while the model centres the em box, so the
  browser assertions allow 2 px (the model's deliberate 6 px/8 px vertical
  padding pair adds one more pixel). The pre-fix error was 4 px, so the margin
  cannot mask a regression of this class.
- A standalone exported SVG carries no stylesheet, so an exported label still
  renders with the viewer's default font metrics. That is a pre-existing export
  gap unrelated to this drift and is not fixed here.
- `dominant-baseline: central` is the single positioning model; a future
  switch to baseline positioning must change `LABEL_CENTRE` and the stylesheet
  together.
