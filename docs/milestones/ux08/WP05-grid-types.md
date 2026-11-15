<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP05 — Grid types independent of snapping

**Severity:** Low — optional canvas affordance

**Status:** Proposed  
**Requirement:** 1 — visible grid type: lines, dots, etc.  
**Depends on:** WP01 for the View-menu contract  
**Branch:** `feat/ux08-grid-types`

## Single-task outcome

Provide **Grid: Off / Dots / Lines** and an independent **Snap to grid** setting. Persist these as
browser-local editor preferences, not diagram/view data.

## Evidence and UX rationale

`CanvasController.ts:719-723` exposes only a boolean toggle. `scenegraph.ts:145-174` constructs a
single dot pattern. Jakob’s Law supports familiar grid options; Selective Attention requires a
subtle grid that never competes with shapes or labels.

## Implementation steps

1. Add renderer tests for Off/Dots/Lines and settings-migration tests. Current documents and old
   UI settings must default safely: grid Off, existing snap behavior preserved.
2. Replace the renderer’s boolean API with `off | dots | lines`. Add token-based line geometry,
   `pointer-events: none` and non-scaling stroke; prevent low-zoom moiré/excessive contrast.
3. Version `UiLayout` (or its owning settings store) with grid type and snap boolean. Keep snap
   mathematically independent from visibility: enabling Lines must not silently toggle snapping.
4. Add labelled View-menu radio items and a separate Snap checkbox. Keep the existing grid
   shortcut as a visibility toggle using the last non-Off type; document that behavior.
5. Ensure grid is editor-only: hide it in presentation/minimap and strip it from sanitized SVG,
   PNG and CLI output. Do not write grid settings into `.pcd` views.

## Required checks

```bash
npx vitest run web/src/engine/render/scenegraph.test.ts web/src/ui/CanvasController.test.ts web/src/ui/uiLayout.test.ts
npm run check
npm run build
npx playwright test e2e/p0-regressions.spec.ts e2e/s7-smoke.spec.ts
```

Add an E2E that changes each grid type and snap independently, reloads, and verifies exported SVG
contains no editor grid. Capture dots/lines at 100% and low zoom in both themes.

## Acceptance

- Three visible states and snap operate independently and survive reload.
- Grid never intercepts pointer input, changes document IR or appears in document exports.
- Existing snap/drag/resize tests remain green; line/dot contrast is subtle but perceptible.
- Menu keyboard semantics and focus return match WP01.

## Evidence

Pending. Record renderer/settings tests, export assertions and screenshot review here.
