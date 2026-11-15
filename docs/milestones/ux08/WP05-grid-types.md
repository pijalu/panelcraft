<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP05 — Grid types independent of snapping

**Severity:** Low — optional canvas affordance

**Status:** Implemented and verified (2026-11-15).
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

Implemented on `feat/ux08-grid-types`. RED evidence: the first `e2e/ux08-grid.spec.ts` run failed
(`Test timeout of 30000ms exceeded` on the post-reload canvas click) because the shared
`Menu` only dismissed on a window `keydown` listener that attaches after the popover's first
paint — Escape pressed while focus was still on the trigger went nowhere. Fixed in
`Menu.tsx` (the trigger answers Escape for its own popover) with a regression test in
`Menu.test.tsx`; the same spec then passed.

### What shipped

- `web/src/engine/render/grid.ts` — pure grid model: `GridType` `off | dots | lines`,
  `GridSettings { version, type, snap, last }`, `defaultGrid()` (**off + snap on**, i.e. the
  pre-`WP05` behaviour), `normaliseGrid()` (per-field fallback for corrupt/older records),
  `setGridType` (visibility only), `setGridSnap` (snapping only), `toggleGridVisibility`
  (restores `last`) and `gridVisible`. Snapping is a separate field, so choosing Lines can
  never toggle it.
- `web/src/ui/useCanvasGrid.ts` — App-side preference handle: adopts the stored value once,
  persists every change immediately through `manager.setSetting('canvasGrid', …)` (a change
  made before the workspace is ready is re-written when it is), and exposes `setType`/
  `setSnap`/`toggle`. `useWorkspace.ts` hands the settings to the controller through refs
  (controller is created once, before the preference is known) and routes `g` back to the hook.
- `web/src/engine/render/scenegraph.ts` — `setGrid(on)` → `setGrid(type)`; two patterns
  (`pc-grid-pattern-dots`, `pc-grid-pattern-lines`) instead of one; the line pattern uses a
  `non-scaling-stroke` path so it stays one screen pixel at any zoom; the grid rect is
  `pointer-events: none`; `paintGrid()` is the single place that decides visibility, and
  drops the grid below `MIN_GRID_ZOOM = 0.5` (an 8 px cell under 4 screen px degenerates into
  an even tint) without touching the preference.
- `web/src/ui/appMenuEntries.ts` — View menu gains three `menuitemradio` entries
  (`view-grid-off|dots|lines`) and a separate `menuitemcheckbox` **Snap to grid**
  (`view-grid-snap`), wired through `AppHeader`/`AppMenu`/`App`.
- `web/src/ui/app.css` + `appTokens.test.ts` — `--pc-grid-dot` / `--pc-grid-line` tokens per
  theme (1.50:1 dots, 1.31:1 lines light; 1.80:1 / 1.64:1 dark on the canvas fill): subtle
  but perceptible, asserted in the token test.
- `web/src/workspace/io.ts` — `sanitizeSvg` also prunes `.pc-grid`, `#pc-grid-pattern-dots`
  and `#pc-grid-pattern-lines`, so SVG/PNG/CLI output never carries editor chrome (checked
  through the DOM path and the broken-markup regex path).
- `web/src/workspace/store/port.ts` — `WorkspaceSettings.canvasGrid` (validated by the grid
  model); nothing is written to `.pcd`.

### Tests

```text
$ npx vitest run web/src/engine/render/grid.test.ts web/src/engine/render/scenegraph.test.ts \
    web/src/ui/CanvasController.test.ts web/src/workspace/io.test.ts web/src/ui/appMenuEntries.test.ts \
    web/src/ui/appTokens.test.ts web/src/ui/Menu.test.tsx
Test Files  7 passed (7)   Tests  135 passed (135)

$ npx vitest run            # whole suite
Test Files  109 passed (109)   Tests  1123 passed (1123)

$ npm run check             # tsc + tsc -p tsconfig.sw.json + eslint — clean
```

New coverage: three grid states + snap independence in the renderer and the menu model,
settings migration (missing/corrupt/older records; `off` keeps its last visible type), the `g`
shortcut restoring the last type, export pruning of grid chrome, and the menu trigger's Escape
dismissal.

### Browser checks

```text
$ npm run build && npx playwright test e2e/ux08-grid.spec.ts
3 passed (5.4s)

$ npx playwright test e2e/p0-regressions.spec.ts e2e/s7-smoke.spec.ts
6 passed (2.3s)

$ bash scripts/check-docs.sh            # OK — 9 docs, links resolve, .pcd blocks valid
$ bash scripts/check-selfcontained.sh  # OK — no external-origin resource loads in web/dist
```

`e2e/ux08-grid.spec.ts` covers: Off → dots → lines through the menu, snap toggled without
changing what is drawn, both preferences surviving a reload, `g` restoring dots (not the
default) after a reload, the grid dropped far out and painted again on zoom-in, the code view
free of any grid directive, an exported SVG containing `pc-obj` but no `pc-grid`, and a click on
empty canvas selecting nothing while a shape still selects (pointer transparency).

Screenshots reviewed against the STYLE-GUIDE checklist (artifact dir, gitignored):
`ux08-grid-dots-light/dark`, `ux08-grid-lines-light/dark`, and
`ux08-grid-{dots,lines}-lowzoom-light/dark` at ~0.57 zoom. Review outcome: dots read as a quiet
texture, lines as a light graph paper in both themes; nothing competes with the shapes' fills,
the minimap stays grid-free, and the low-zoom captures show no tint build-up or harsh moiré.
No defects filed.

### Notes

- The brief's `web/src/ui/uiLayout.test.ts` does not exist; the layout-style settings tests live
  with their owning modules, so the grid migration tests are in `engine/render/grid.test.ts`.
- `G` is documented in `SPEC.md` §10 and `FR-C2`, and in `USER-GUIDE.md` (Canvas) together with
  the independence of visibility and snapping.
