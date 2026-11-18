<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: named views removed, diagram layout promoted

Source: `bugs.md`, "Remove named views without deleting diagram layout persistence".
Plan: steps 1–4 of that section; design decision in
[ADR 0007](../adr/0007-remove-named-views.md). Regression specs:
`e2e/remove-named-views.spec.ts`, `e2e/p1-geometry.spec.ts`,
`e2e/s5-views.spec.ts`, `web/src/engine/format/layoutState.test.ts`,
`web/src/engine/model/resetOps.test.ts`, `web/src/ui/commandPolicy.test.ts`.

## Report and decision

`ViewBar` owned the only diagram's view selector, tag chips, layout mode, saved
positions, pin and hide controls. Named `view` blocks also reached both format
engines, the IR, hierarchy validation and the CLI `--view` flag. Removing the bar
without relocating its data would have destroyed position persistence: the code
→ canvas path would have had no position source and every open would fall back to
the default grid.

The fix keeps the data and removes only the naming indirection. One diagram now
has one top-level layout state in PDL and IR v11: `layout auto <dir> | layout
saved`, `position`, `pin`, `hide` and `hide tag`. `pcdToState` reads those
positions directly. Route state and layout state are separate: resetting routes
clears waypoints and endpoint anchors only; **Reset diagram layout** clears the
saved positions and persists a deterministic auto-layout as one undoable command,
distinct from **Reset workspace layout**, which only restores panel geometry.
Pin/hide/hideTag survive as document display state, with their UI in the
properties panel and application menu rather than a deleted view bar.

Legacy files are not migrated silently. A `view "…" { … }` block is diagnostic
`E117` and a `drilldown "…" view <id>` suffix is `E118` in both TypeScript and Go;
the message names the manual conversion, documented in FILE-FORMAT §7.1.

## Minimal implementation

* `types.ts` / `internal/ir`: `Doc.views: View[]` → `Doc.layout?: LayoutState`;
  `Drilldown.view` removed; `IR_VERSION` 10 → 11. Parser, printer, canonical JSON
  serializer, validation, hierarchy checks and CLI changed in the same commit.
* Pure operations in `engine/model/resetOps.ts` (`resetAllRoutes`,
  `resetLinkRouteDoc`, `resetDiagramLayout`) and one selection policy in
  `ui/commandPolicy.ts` (`routeResetTarget`). `CanvasMenu` and `buildAppMenu`
  both consume that policy, so "Reset all routes", "Reset route" and "Reset
  diagram layout" are enabled identically in both places. `CanvasController`
  gained one batch `resetAllRoutes()` undo entry; layout reset uses the existing
  `applyLayoutCommand` with positions from the dagre port.
* View bar component, CSS, strings, `useViewSession`, `viewName` prop threading and
  the CLI `--view` option removed; hierarchy/path editing lost its view field.
* Corpus seeds, parity fixtures, docs (FILE-FORMAT, USER-GUIDE, SPEC, CHANGELOG),
  architecture `.pcd` seeds and all affected e2e fixtures updated.

## Regression evidence — failed before the fix (RED)

```
$ npx vitest run web/src/engine/format/layoutState.test.ts --coverage.enabled=false --reporter=dot
 Test Files  1 failed (1)
      Tests  4 failed (4)
```
Four failures: a legacy `view` block returned a doc instead of E117, a
`drilldown … view` returned a doc instead of E118, and top-level `layout`/
`position`/`pin`/`hide` statements produced no `doc.layout` and did not print.

```
$ npx vitest run web/src/engine/model/resetOps.test.ts web/src/ui/commandPolicy.test.ts --coverage.enabled=false --reporter=dot
Error: Cannot find module './resetOps'
Error: Cannot find module './commandPolicy'
 Test Files  2 failed (2)
```

Browser RED came from `getByTestId('view-select')` and `getByTestId('apply-layout')`
in the old flows: with the bar removed, `e2e/bug15-spark-beat-timeline.spec.ts`
and `e2e/canvas-mouse-panning.spec.ts` waited on a selector that no longer exists
and timed out (30 s / 240 s) until the fixtures were rewritten to top-level
layout statements.

## Verification evidence — passed after the fix (GREEN)

Commands run in this worktree, with their observed results:

* `npm run check` → exit 0 (tsc, service-worker tsc, ESLint complexity/length gates).
* `npx vitest run --reporter=dot` → 141 files, 1542 tests passed.
* `npm test` → 139 files, 1534 tests passed with coverage thresholds.
* `bash scripts/check-docs.sh` → `check-docs: OK — 9 docs, all links resolve, .pcd blocks valid`.
* `node scripts/corpus-accept.mjs` → 3 files, 100 tests passed (regenerated corpus,
  export and parity goldens); a plain `go test ./...` replays those goldens.
* `go test ./...` → all packages passed; `go vet ./...` → exit 0;
  `staticcheck ./...` → exit 0; `gocyclo -over 15 cmd internal web` → no findings.
* `npx playwright test e2e/remove-named-views.spec.ts --workers=1` → 2 passed:
  route reset clears waypoints, keeps both object transforms and positions in the
  file, one undo restores the routes, and a legacy view file reports `E117`.
* Full browser suite in two single-worker shards:
  `npx playwright test --workers=1 --shard=1/2` → 104 passed;
  `--shard=2/2` → 104 passed (208 total). Four initial shard-1 failures were
  fixtures asserting removed view-bar controls (`view-select`, per-view
  positions) and the two new context-menu entries; after updating them, both
  shards are green.

### Screenshots and vision review

Captures in `test-results/screenshots/` (gitignored artifacts):

* `remove-named-views-light.png`, `remove-named-views-dark.png` — after route
  reset and undo: the code view shows `layout saved` with `position a (40, 40)`
  and `position b (260, 40)`, the canvas shows both objects and their link, and
  the removed view bar is absent. Theme parity holds; text and controls are
  legible in both.
* `layout-persistence-light.png`, `layout-persistence-dark.png` — after a reload,
  identical transforms and positions; no empty view or grid fallback.

The minimap card at the bottom of the canvas is the pre-existing minimap (the
curated `e2e/goldens/p6-minimap-light.png` shows the same card), not a new
artifact. Reviewed against `docs/STYLE-GUIDE.md` with the Laws of UX skill
(Fitts's Law for the menu actions, Selective Attention for the single diagram
bar replaced by nothing, Prägnanz for a stable canvas after reset): alignment,
contrast, spacing and light/dark parity pass, no clipping or focus regression.
Axe reported no WCAG A/AA violations in the new spec. Outcome: **pass**, no
defects filed.

Residual behaviour: legacy files are rejected rather than converted, by design;
position data survives every route edit and reload, and only an explicit command
recomputes layout.
