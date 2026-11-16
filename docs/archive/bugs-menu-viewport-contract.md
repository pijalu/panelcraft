<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued bug: one viewport-safe contract for every menu

Source: `bugs.md`, queued item 7. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §3.

## Observed behaviour

Menus with many commands extended past the visible viewport, so commands became
unreachable. The canvas context menu was worse: it was positioned from raw
pointer coordinates, so a right-click near the bottom-right corner placed its
surface mostly off-screen, and it had no arrow-key navigation at all. Nested
submenus were absolutely positioned to the right of their row with no collision
handling, so a submenu near the right edge left the window.

## Reproduction

`e2e/bug07-menu-viewport.spec.ts` drives every family with real geometry:

- application menu on a 1280×420 viewport → the old code laid the surface out
  from the trigger with a `max-height` guess, and the surface came to overlap its
  own trigger once the position was clamped (measured `overlaps`);
- nested "Export current file" submenu → `position: absolute; left: 100%` put it
  past the right edge on a narrow window;
- context menu opened 6 px from the canvas corner → the surface was drawn at the
  pointer and ran off the bottom-right corner;
- canvas menu → twelve equally prominent commands, six of them alignment
  commands that are unusable with a single selection.

## Contract

One geometry and interaction model for all menu surfaces:

1. **Placement from measured rectangles.** `placeMenu` picks the side with room
   (below, else above), clamps inside an 8 px margin, and — because a clamped menu
   that covered its own trigger read as a broken toggle — refuses to overlap the
   trigger box; when the requested height does not fit, the larger side wins and
   the surface scrolls internally.
2. **Nested surfaces flip.** `placeSubmenu` prefers the right-hand side and flips
   to the left of the row when the right has no room, clamping vertically, and
   the submenu gets a measured `max-height` for its side.
3. **Overflow is visible and focusable.** A list whose content exceeds its box
   gets `menu-scrolls` (edge gradient + standard scrollbar) and
   `scrollIntoView({block: 'nearest'})` on focus, so `End` scrolls the last
   command into view instead of scrolling the document.
4. **One keyboard and dismissal model.** Arrow up/down, Home/End, ArrowRight to
   open a submenu, ArrowLeft to return, Enter/Space to run, Escape and Tab to
   close, outside pointer to dismiss, and focus restored to the invoking surface.
   The canvas context menu now uses the same `FloatingMenu` surface, so it
   inherits all of it; closing returns focus to the canvas after the surface
   unmounts (`requestAnimationFrame`) without touching the selection or the undo
   history.
5. **Task grouping, no lost capability.** The canvas menu keeps Properties,
   Duplicate, Copy, Paste and Delete direct and groups the nine
   align/distribute/equal-size commands under one **Arrange** submenu, which stays
   reachable — its entries disable themselves and keep their explanations.

## Implementation

| File | Change |
|---|---|
| `web/src/ui/menuModel.ts` | `placeMenu`, `placeSubmenu`, `availableMenuHeight`, `needsScroll` (pure, unit-tested) |
| `web/src/ui/Menu.tsx` | measured placement for root and nested surfaces, resize/scroll repositioning, `FloatingMenu`, scroll cue, `scrollIntoView` |
| `web/src/ui/ContextMenu.tsx` | rebuilt on `FloatingMenu`; groups map to submenu entries |
| `web/src/ui/CanvasMenu.tsx` | direct common actions + Arrange group |
| `web/src/ui/App.tsx` | canvas is focusable (not tabbable) and receives focus back on close |
| `web/src/ui/app.css` | submenu becomes fixed-position with measured size; overflow cue; dead `.context-menu` rules removed |
| `web/src/ui/strings.ts` | "Arrange" |

## Verification

```
$ npm run check
> tsc --noEmit && tsc -p tsconfig.sw.json --noEmit && eslint .
(no errors)

$ npm test
 Test Files  118 passed (118)
      Tests  1334 passed (1334)

$ npm run build && npx playwright test e2e/bug07-menu-viewport.spec.ts
  5 passed (2.3s)

$ npx playwright test
  174 passed (1.1m)

$ npm run test:perf
      Tests  8 passed (8)

$ bash scripts/check-docs.sh
check-docs: OK — 9 docs, all links resolve, .pcd blocks valid
```

The browser spec asserts bounding boxes against the viewport, that the menu does
not overlap its trigger, real `scrollHeight > clientHeight` with `overflow-y:
auto`, the `menu-scrolls` class, that `End` focuses the last entry *and* keeps it
inside the menu's visible area, that the document itself never scrolls, submenu
placement and its measured `maxHeight`, that Escape restores focus to the canvas,
and that the grouped canvas commands still run. Accessibility scans run on the
open root menu, the submenu, the context menu and the narrow-viewport menu.

Vision review (`item7-app-menu-short.png`, `item7-submenu.png`,
`item7-context-menu-corner.png`, `item7-canvas-arrange.png`,
`item7-narrow-menu.png`) found and fixed one defect during the review: on the
short viewport the clamped menu covered its own trigger. That is now a tested
rule (`placeMenu`).

## Residual risks

- Pointer-anchored menus (`FloatingMenu`) clamp to the viewport but may still be
  drawn over the object under the pointer; that is conventional and the surface is
  dismissed by the same click that moves focus elsewhere.
- A viewport shorter than the 120 px minimum surface height cannot honour every
  rule at once; the minimum wins so the menu stays operable.
- Submenus reposition on window resize and capture-phase scroll; a scroll of an
  ancestor that does not bubble scroll events (an iframe boundary, for example)
  would not trigger repositioning — there is no such container in this app.
