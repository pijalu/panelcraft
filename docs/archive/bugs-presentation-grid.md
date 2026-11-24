<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: the canvas grid is absent from a presentation

Source: `bugs.md`, “The canvas grid is still drawn during a presentation”.
Status: closed after a failing browser assertion, the one-rule fix, light and
dark review and the suite runs listed below.

## Report and expected behavior

Presenting `Default flow` from the header button painted the dots grid behind
the diagram: `svg[data-testid="canvas"] rect.pc-grid` computed `display: inline`
with fill `url(#pc-grid-pattern-dots)` while `.app-shell` carried the
`presenting` class. The specification states that the grid is editor chrome only
and must be absent from presentation, minimap and SVG/PNG/CLI output (section
4.2). The rule that hides the other editor chrome during a presentation (header,
tabs, panels, play bar, splitters) simply had no entry for the grid, and no
scenario checked it.

Expected: no grid rect is painted while presenting, and the saved grid
preference comes back untouched when the presentation ends.

The UX lens is **Selective Attention**: a presentation should show the story,
not the editing scaffolding behind it.

## Failing coverage first

`e2e/ux08-grid.spec.ts` gained “the grid is absent from a presentation and
returns with the editor”. Against the unchanged build:

```text
✘ canvas grid › the grid is absent from a presentation and returns with the editor
  Error: expect(locator).toBeHidden() failed
  Expected: hidden   Received: visible
```

## Change

One selector in the existing presenting chrome rule (`web/src/ui/app.css`):

```css
/* The grid is editor chrome only (SPEC 4.2): never behind a presentation. */
.app-shell.presenting .pc-grid,
```

No preference, renderer or export change: the same `rect.pc-grid` is shown again
as soon as the shell stops presenting.

## Validation

```text
npx playwright test e2e/ux08-grid.spec.ts e2e/p2-present.spec.ts e2e/presentation-dock-layout.spec.ts e2e/bugs-presentation-chrome.spec.ts
  15 passed
npx playwright test            (full suite, after the three review fixes)
  299 passed (1.8m)
```

Interactive Chrome review of a presentation after the fix: plain canvas behind
the diagram, transport dock and progress dots intact, both themes
(`ux08-grid-presenting-light` capture and the live frame).
