<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP10 — Legible connection labels

**Severity:** High — semantic visibility and routing clarity

**Status:** Implemented and verified (2026-11-15)  
**Requirement:** 8 — labels on connections are not always visible  
**Depends on:** nothing  
**Branch:** `feat/ux08-connection-labels`

## Single-task outcome

Keep connection labels readable and visibly associated with their routes across dense diagrams,
zoom, playback and exports. Fix paint/layer and measurement/placement; do not add manual label
offsets in this WP.

## Evidence and UX rationale

Labels live in the link layer painted before objects (`scenegraph.ts:128-133,264-301`), so fallback
placements can be covered. `labelLayout.ts:90-141` estimates width by character count and accepts
minimum collisions. Proximity requires unambiguous ownership; Selective Attention requires stable
readable feedback rather than hidden labels.

## Implementation steps

1. **RED:** create a dense fixture with solid-object overlap, route/label crossings and long text.
   Include a case where the current minimum-conflict fallback is painted beneath an object.
2. Split route and label paint layers: routes remain below objects; labels render above objects.
   Preserve hit testing and pointer pass-through.
3. Measure actual text, wrap to bounded width/line count and use identical boxes for collision
   and paint. Keep full text available to assistive technology and hover; do not silently discard
   labels.
4. Generate candidates along eligible route segments plus normal offsets. Score object, unrelated
   route and prior-label collisions, then distance with deterministic tie-breaking. Add a subtle
   leader only when displacement is large enough to make ownership unclear.
5. Use canvas-themed contrast/halo or backing, including faded/selected/playback states. Verify
   orthogonal/straight/curved geometry, minimap/export parity and 10%–400% zoom.
6. Re-run the 300-object performance baseline after adding the layer and spatial work.

## Required checks

```bash
npx vitest run web/src/engine/render/labelLayout.test.ts web/src/engine/render/scenegraph.test.ts
npm run check
npm run build
npx playwright test e2e/p6-routing.spec.ts e2e/cx02-overlap.spec.ts e2e/perf-baseline.spec.ts
```

Add dense-label browser geometry and screenshot assertions in light/dark and animation end states.
Update curated goldens only through `UPDATE_GOLDENS=1` after reviewing the intentional changes.

## Acceptance

- Every dense-fixture label is readable, inside the visible canvas when its route is visible, and
  not painted beneath an object.
- Displaced labels retain clear ownership; fallback placement is deterministic.
- No label is dropped for length alone; accessibility/export output contains the full content.
- Performance remains within N1 or a measured regression is fixed before completion.

## Evidence

**Original defect (reproduced before the change).** Labels were painted in the link layer, so a
fallback placement could be covered by a shape, and they were measured by character count. The RED
unit tests written first failed against that code:

```
FAIL web/src/engine/render/labelLayout.test.ts > label placement quality (UX08-WP10)
     > never leaves a label painted beneath an object
     > moves a label away from an unrelated crossing route and objects
     > wraps long text to a bounded width and keeps every word
FAIL web/src/engine/render/labelLayout.test.ts > label placement across route geometry
     > slides a label off a blocker sitting on a curved route
     > places labels on straight diagonal routes too
FAIL web/src/engine/render/labelLayout.test.ts > label placement inside the diagram frame
     > keeps a label inside the diagram frame instead of hanging off the edge
  AssertionError: expected -9 to be greater than or equal to 0
  Tests  5 failed | 3 passed (8)
```

Each group was then fixed and re-run; the geometry and frame tests were also mutation-checked by
temporarily restoring axis-aligned-only runs (`Tests  2 failed | 9 passed`, reproduced again after
the split into `runOf`/`runCandidates`), so they exercise the new code rather than passing by luck.

**Implementation.**

- Routes stay in `g.pc-layer-links` below the shapes; labels moved to a new `g.pc-layer-labels`
  between objects and the interaction overlay, so a placement can never be buried. The label group
  is `pointer-events: none`, so a label floating above a shape never steals its click.
- Text is measured with the canvas measurer (`wrapLabel`), wrapped to `LABEL_MAX_WIDTH = 180` and
  at most `LABEL_MAX_LINES = 3` lines, and the *same* rect is used for collision scoring and paint.
- Candidates run in route-local coordinates along every run of the (possibly sampled) route plus
  escalating normal offsets, so orthogonal, straight and curved geometry share one algorithm.
  Scoring is strictly ordered — collisions ≫ sticking out of the drawn frame ≫ distance — with
  route order as the deterministic tie-break.
- A dashed leader is added only when the chosen placement is more than 20 canvas units from its
  route anchor, so displaced labels keep visible ownership.
- Faded/selected/playback states propagate to labels, and the route carries the full text in a
  `<title>` (the label group is pointer-transparent, so hover cannot be served by the label).

**Checks.**

```
$ npx vitest run web/src/engine/render/labelLayout.test.ts web/src/engine/render/scenegraph.test.ts
 Test Files  2 passed (2)
      Tests  42 passed (42)

$ npx vitest run                 # full suite, no regressions
 Test Files  114 passed (114)
      Tests  1218 passed (1218)

$ npm run check                  # tsc + tsc sw + eslint (complexity ≤12)
(no output)

$ npm run build
✓ built in 114ms

$ npx playwright test e2e/p6-routing.spec.ts e2e/cx02-overlap.spec.ts e2e/perf-baseline.spec.ts
  4 passed (6.8s)
perf(e2e) 300 objects: pan 61f/1010ms=60fps · zoom 146f/1208ms=121fps · drag 183f/1014ms=180fps

$ npx playwright test e2e/ux08-connection-labels.spec.ts
  6 passed (3.3s)

$ npx playwright test e2e/p1-links.spec.ts e2e/p3-waypoints.spec.ts \
    e2e/cx04-connector-style.spec.ts e2e/p6-minimap.spec.ts \
    e2e/p6-sequence-export.spec.ts e2e/p2-flowedit.spec.ts
  13 passed (5.8s)
```

**Browser geometry (`e2e/ux08-connection-labels.spec.ts`, dense 7-object/9-label fixture).**

- Nine labels, none intersecting any of the seven object rects (client-rect intersection, not a
  class check), and every label whose own route is fully visible is itself fully inside the canvas.
- Labels paint above objects (`g.pc-layer-labels` after `g.pc-layer-objects`), yet
  `document.elementFromPoint` at a label's centre never resolves to the label group, and the group
  computes `pointer-events: none`.
- The longest label wraps into several `<tspan>`s whose text joins back to the exact original, the
  `aria-label` carries the untruncated string, and the route's `<title>` exposes the same text on
  hover.
- Curved (`C` commands) and straight (`M…L`) routes both get placed labels with non-empty boxes.
- The no-occlusion property still holds across the supported zoom range (three zoom steps in).

**Performance (N1).** 300 objects: pan 60 fps, zoom 121 fps, drag 180 fps — at baseline, with the
label layer and the spatial index in place. The scorer breaks out on the first collision-free
placement that is also inside the frame and caps the runs it samples per label, so an unobstructed
label costs one candidate.

**Vision review (light + dark, `test-results/screenshots/ux08-connection-labels-{light,dark}.png`).**
Labels are legible on their backing boxes in both themes, no label is clipped by a shape, leaders
appear only where a label is pushed off its route, and faded/selected states carry into the label.
Two observations recorded rather than fixed here: at 10 % zoom label text is as unreadable as object
names (no level-of-detail, consistent with the rest of the canvas), and `1` is bound to both
`fit-diagram` and the palette's quick-add, so quick-add wins — pre-existing keymap conflict, filed
outside this WP.
