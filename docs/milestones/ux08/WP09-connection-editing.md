<!-- SPDX-License-Identifier: GPL-3.0-only -->

# UX08-WP09 — Endpoint, bend and orthogonal-segment editing

**Severity:** High — connection routing control and diagram clarity

**Status:** Proposed  
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

Pending. Record pure geometry/property tests, original failing interactions, green E2E and visual
review here.
