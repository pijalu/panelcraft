<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: a menu is placed before its first paint

Source: found during the final full browser run of the drawing-session review
(`e2e/bug07-menu-viewport.spec.ts`, “a context menu opened in the bottom-right
corner stays reachable”, failed once in three full-suite runs under six parallel
workers: menu bottom 828 in a 560 px viewport). Status: closed; the scenario
now reads a menu that is already placed.

## Report and expected behavior

A context menu opened a few pixels from the bottom-right corner of the canvas
extends past the viewport for one frame: the popover renders at its anchor
point, and a plain effect moves it inside the window after the paint. Under
load the browser scenario read the bounding box in that first frame and saw
the menu outside the window. Users can see the same thing as a one-frame flash
at the click point when the machine is busy.

Expected: a menu is never painted outside the viewport, and the scenario's
assertion (inside the window, 8 px margin) holds without any retry.

The UX lens is **Aesthetic-Usability Effect**: a surface that jumps into place
reads as broken even when it lands correctly a frame later.

## Change

`web/src/ui/Menu.tsx`: the placement effects of the trigger-anchored menu and
of the floating (context) menu run as layout effects, like the menu's own
focus placement already does, so the position is set before the first paint.
No placement math, keyboard or dismissal behaviour changed.

## Validation

```text
npm run check                                                       clean
npx playwright test e2e/bug07-menu-viewport.spec.ts e2e/doc01-context-menu.spec.ts e2e/p3-commands.spec.ts e2e/ux03-files.spec.ts
  14 passed
npx playwright test            (full suite)                          see the review-round record
```
