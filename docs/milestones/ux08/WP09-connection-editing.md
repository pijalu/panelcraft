<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP09 — Endpoint, bend and orthogonal-segment editing

**Severity:** High — connection routing control and diagram clarity

**Status:** Implemented and verified (2026-11-15)  
**Requirement:** 6 — user-modifiable connection corners/positions, especially orthogonal  
**Depends on:** WP08 for the link inspection/property-opening command  
**Branch:** `feat/ux08-connection-editing`

## Single-task outcome

Allow perimeter endpoint editing, bend insertion/drag/deletion and horizontal/vertical segment
movement with optional side/corner/midpoint snapping. Use existing PDL anchors/waypoints; no IR
change and no general router rewrite without a demonstrated need.

## Evidence and UX rationale

Normalized anchors and waypoints already persist (`CanvasController.ts:90-115`), but only existing
waypoints receive handles (`CanvasController.ts:1044-1053`). `router.ts:67-91` inserts elbows.
Fitts’s Law requires screen-space hit areas; Doherty requires immediate route previews.

## Implementation steps

1. Add pure `routeEditing` operations: materialize automatic geometry, insert/delete/move bend,
   move orthogonal channel and canonicalize. Property tests assert axis alignment, stable
   endpoints, deterministic output and no duplicate/unnecessary collinear points.
2. Expose selected-link endpoint, bend and segment handles. Midpoint insertion or double-click
   adds a bend; bend context menu/Delete removes it. Straight/curved routes retain their own
   waypoint semantics.
3. Materialize explicit waypoints only on an actual edit of an automatic route. Selection, pan,
   zoom, code sync and export must not add geometry to untouched documents.
4. Orthogonal segment drag changes its channel and adjacent bends while preserving endpoints.
   Canonicalize on commit; manual routes keep the existing collision-avoidance bypass.
5. Add Start/End controls in Properties: Auto/Top/Right/Bottom/Left and 0–100% side-relative
   position mapped to normalized anchors. Auto removes the override. Add Reset endpoints/bends.
6. Snap pointer edits to corners, side midpoints and grid within a screen-space threshold;
   document a modifier that temporarily disables snapping. Support Tab focus, arrows, fine
   Shift+arrows, Delete, Escape rollback and one undo entry per committed gesture.

## Required checks

```bash
npx vitest run web/src/engine/render/routeEditing.test.ts web/src/engine/render/router.test.ts web/src/ui/CanvasController.test.ts
npm run check
npm run build
npx playwright test e2e/cx01-endpoints.spec.ts e2e/p3-waypoints.spec.ts e2e/p6-routing.spec.ts
```

Add E2E for every edit kind, snap modifier, keyboard, cancellation, undo and reload. Review
orthogonal and curved captures in both themes.

## Acceptance

- All requested geometry edits persist through existing PDL and survive reload/undo.
- Orthogonal routes remain orthogonal with fixed semantic endpoints during segment edits.
- Untouched automatic files receive no new waypoints or unrelated canonical diffs.
- Handles have adequate hit areas and keyboard equivalents; no new format version is introduced.

## Evidence

**Pure geometry (RED → green).** `web/src/engine/render/routeEditing.ts` owns every operation; no
IR/format change, no router rewrite. `routeEditing.test.ts` — 32 tests, written before the
implementations:

- RED for `snapChannel` (`TypeError: snapChannel is not a function`, 7 failed), for
  `splitSegment` (`4 failed`) and for `channels`/`moveChannel`
  (`TypeError: channels is not a function`, 7 failed). Green after implementing:
  `npx vitest run web/src/engine/render/routeEditing.test.ts` → **32 passed**.

**Channel model (defect found by the browser run).** Raw segments produced two stacked handles on
a leg that doubles back (`M 200 70 L 300 70 L 300 200 L 300 70 L 230 70` — the F-19 waypoint router
goes down and back up the same channel). Handles now come from *runs*: consecutive collinear
segments form one channel, so a run split by a waypoint is one slide and a doubled-back leg cannot
render two grips. `channels`/`moveChannel` tests pin both cases.

**Controller wiring.** `web/src/ui/CanvasController.route.test.ts` (new, 15 tests): handle
geometry/`tabindex`/hit size, channel slide materialising waypoints with both endpoint ports
unmoved and exactly one undo entry, click-without-move adding no geometry, Alt suspending
snapping, entity-edge snapping winning over the grid, Escape rollback, double-click insertion,
arrow/`Shift`+arrow nudges, Delete + undo, and `Reset route`/`Reset bends`/`Start`/`End` anchors.
Mutation checks (not just “tests pass”): replacing the applied waypoints with `undefined` killed
the 4 channel tests, and disabling `handleRouteKeys` killed the 3 keyboard tests; both mutants were
reverted and the file re-verified.

**Double-click was silently dead (real defect, RED first).** The browser only emits `dblclick`
when both clicks hit the *same* element; a no-op `pointerup` repainted the overlay, replacing the
handle node, so the gesture never fired — the handler was never even entered (verified with a
temporary build containing a `console.log`: zero calls). Unit test *“keeps the handle node across a
click, so a second click pairs into a dblclick”* failed before the fix (node replaced) and passes
after `onPointerUp` skips the repaint for an inert channel gesture.

**Required checks (actual output).**

```text
npx vitest run web/src/engine/render/routeEditing.test.ts \
  web/src/engine/render/router.test.ts web/src/ui/CanvasController.test.ts \
  web/src/ui/CanvasController.route.test.ts   → 32 + router + 15 passed
npm run check                                  → clean (tsc ×2 + eslint, complexity ≤12)
npm run build                                  → ✓ built
npx playwright test e2e/ux08-connection-editing.spec.ts            → 8 passed
npx playwright test e2e/cx01-endpoints.spec.ts e2e/p3-waypoints.spec.ts \
  e2e/p6-routing.spec.ts e2e/doc01-context-menu.spec.ts \
  e2e/ux08-link-properties.spec.ts                                 → 11 passed
npx vitest run                                 → 1205 passed (114 files)
bash scripts/check-docs.sh                     → OK (9 docs, links + .pcd fences)
bash scripts/check-selfcontained.sh            → OK (no external-origin loads)
go test ./...                                  → ok (IR/PDL/corpus/server; web untouched)
```

**Accessibility.** Channel chips and bend circles are `role="button"`, `tabindex="0"` with spoken
names (`Slide vertical segment`, `Bend 1`); the E2E filmstrip attaches the canvas ARIA snapshot.
Properties rows carry `{endpoint} side` / `{endpoint} position percent` labels, and the disabled
position field shows a dash rather than an empty box.

**Visual review (light + dark).** `test-results/screenshots/ux08-connection-handles-{light,dark}.png`
reviewed against `docs/STYLE-GUIDE.md`; defects found and fixed in the same slice:

1. The Endpoints block sat below the whole connector-style section (out of sight below the fold) —
   routing geometry now comes directly after **Label**, before appearance.
2. The channel grip rendered as a bare near-black square, reading as a stray mark — it now uses the
   accent language of the bend/endpoint handles (accent fill, `--pc-bg` stroke, hover/focus state,
   `cursor: grab`).
3. The disabled percentage fields were blank boxes — they show an em dash placeholder.

**Scope notes.** No format/IR change: anchors and waypoints are the existing `anchor from`/
`anchor to` and `waypoint x y` lines (IR v4). Untouched automatic routes gain no waypoints —
materialisation happens only on a real move, insert or nudge. A route that doubles back keeps its
existing F-19 geometry; WP09 only stops offering a misleading channel grip on it.
