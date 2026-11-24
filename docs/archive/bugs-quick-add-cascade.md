<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: quick-add places each new shape clear of the others

Source: `bugs.md`, “Quick-add stacks every new shape on the previous one”.
Status: closed after failing unit coverage, the placement rule, a browser
regression and the suite runs listed below.

## Report and expected behavior

Pressing `1` then `2` on a fresh profile put `System 1` exactly over `Person 1`:
`CanvasController.addObject` used the centre of the view for every implicit
placement, with no collision check. The first shape was hidden and the two had
to be dragged apart before they could be connected — found while reproducing the
“empty default flow” report, where a user who links by dragging from the visible
shape never reaches the one underneath.

Expected: a quick-added shape whose footprint would cover an existing object is
placed beside the occupied spot along a short grid-snapped cascade, fully
visible and immediately linkable; explicit placement (palette drop at a point,
paste, import) is unchanged.

The UX lens is **Law of Proximity / Mental Model**: shapes that are separate
things must not share one spot, and a new shape should appear where the user is
looking rather than somewhere they have to hunt for.

## Failing coverage first

`web/src/ui/CanvasController.placement.test.ts` (new) against the unchanged
code:

```text
× two quick-adds are both fully visible, side by side, on the grid
× keeps a run of quick-adds clear of each other, the first ones inside the view
× moves a new shape clear of one already sitting in the centre of the view
✓ leaves an explicit position (palette drop, paste) exactly where it was asked
```

## Change

`web/src/ui/CanvasController.ts`:

- `addObject` computes the label-fitted size first and, when no point was
  requested, asks `freeSpot(w, h)` for a grid-aligned top-left corner.
- `freeSpot` walks ring-shaped offsets from the centre of the view — right
  first, then below, above and left, nearest first — and takes the first cell
  that shares no area with an existing object and lies inside the view. A
  crowded view places the shape in the first free cell outside the view rather
  than on top of another shape; only a document with no free cell at all falls
  back to the centre. Edges that merely touch do not count as overlap.
- The browser regression `e2e/code-visible-default.spec.ts` no longer moves the
  second shape by hand before linking: it asserts the second shape is beside the
  first, then connects the two through the halo.

## Validation

```text
npx vitest run web/src/ui/CanvasController.placement.test.ts
  4 passed
npx vitest run web/src/ui
  Test Files  72 passed (72)   Tests  723 passed (723)
npm run check                  tsc + eslint clean
npx playwright test e2e/code-visible-default.spec.ts e2e/s1-create.spec.ts e2e/bugs-palette-add.spec.ts e2e/bugs-blank-diagram.spec.ts
  12 passed
npx playwright test            (full suite, after the three review fixes)
  299 passed (1.8m)
```

Interactive Chrome review after four quick-adds (`1`, `2`, `7`, `3`): System 1
in the centre, Person 1 to its right, Queue 1 below, System Ext 1 above — all
fully visible, grid aligned, none overlapping.
