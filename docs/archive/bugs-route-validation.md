<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued bug: validate complete routes, preserve intentional detours

Source: `bugs.md`, queued item 13. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §9.

## Observed behaviour

Two connectors from the report (`Shop → Payment provider` in the shipped C4
context template, and the same document with two authored bends) were drawn
through the shapes they belonged to:

```pcd
pcd 1.0

person user "Customer"
system app "Shop" {
  size 57 36
}
system_ext pay "Payment provider"

user -> app : "buys" as L1
app -> pay : "charges" as L2 {
  waypoint (432, 254)
  waypoint (432, 70)
}

view "Default" {
  position app (248, 128)
  position pay (348, 52)
  position user (40, 40)
}
```

With the measured rectangles — Shop 57×36 at (248, 128), Payment provider
160×60 at (348, 52), Customer 120×72 at (40, 40) — `(432, 70)` lies inside the
payment entity. The route went down to the authored bend, came back up *through*
the payment rectangle and its label, and the `charges` label was pushed away
from the line, so the reader could not tell which connector it belonged to.

## Reproduction

The routes were reproduced at two levels before any code changed:

- `web/src/ui/CanvasController.routeGeometry.test.ts` (jsdom) loads both fixtures
  and reads the committed polylines and painted label boxes.
- `e2e/bug13-route-crossings.spec.ts` seeds the same PCD in the real editor and
  samples the rendered SVG path against the rendered shape boxes, light and dark.

Before the change the waypoint fixture routed

```
(305,146) → (432,146) → (432,254) → (432,70) → (336,82) → (348,82)
```

— the vertical run at `x = 432` from `y = 254` up to `y = 70` passes straight
through the payment rectangle (y 52…112), and `(432, 70)` is drawn as a vertex
inside the shape. The automatic fixture was already clean, which localised the
fault.

## Root cause

Three separate causes, one per stage, established by instrumenting the router
instead of guessing:

1. **Explicit waypoints** were passed through verbatim: `routeThroughWaypoints`
   deliberately skipped obstacles (the F-19 rule "the user stated the path"), so
   a point *inside* an entity was accepted as an authoritative target. Nothing
   reported it.
2. **Automatic routes** never tested their own two endpoint rectangles — the
   `obstacles` contract excludes them by definition — so a candidate that cut
   through its target scored zero conflicts. `routeAnchoredAuto` (explicit
   perimeter anchors) could therefore be drawn through the entity it pointed at.
3. **Candidate scoring** ranked crossings, then shared lines with other
   connectors, then raw length. Length alone cannot distinguish a readable Z from
   a connector that runs out, back and out again, so loops were not penalised.

Label placement was not at fault: `layoutLinkLabels` already avoids shapes and
routes. It looked detached because the route it was attached to was wrong.

## Implementation

`web/src/engine/render/router.ts`

- `invalidWaypoints(input)` reports every authored bend that lies strictly inside
  an entity (either endpoint or any obstacle). `routeExplicit` keeps the others
  and the document keeps all of them: nothing is relocated, so nothing the user
  wrote is silently reinterpreted.
- Explicit routing now routes **each leg** with `routeLeg`: orthogonal shapes
  (straight, H-then-V, V-then-H, and one dogleg per entity edge ± clearance) are
  scored by interior crossings, then reversals, then length, with the candidate
  order preserving the incoming direction. A leg that would retrace the previous
  segment is tried last and costs a reversal, so a detour does not double back
  over itself. Every leg still leaves the source port along its outward normal,
  enters the target port along it, and continues the authored detour.
- Automatic routes count interior conflicts against **all** entity rectangles,
  endpoints included, using the same inset (`0.5`) Liang–Barsky test, so a port
  or clearance stub that only touches a perimeter is not a crossing.
- `crossingEntities(points, input)` exposes the residual-crossing check, so a
  minimum-conflict fallback can be *reported* rather than silently accepted.

`web/src/engine/render/scenegraph.ts`, `web/src/ui/CanvasController.ts`

- The controller composes plain-language warnings per link
  (`{link}: bend {n} at ({x}, {y}) is inside {entity} — the route skips it.`,
  `{link}: no clear route past {entity} — the connector still crosses it.`) and
  publishes them in the snapshot. The renderer puts them on the connector:
  `data-route-warning`, `aria-description`, a `<title>` suffix and a
  `pc-link-warning` class, so pointer and assistive-technology users both learn
  why the bend was skipped. The three strings are catalogue entries (`N10`).

## Verification

- `web/src/ui/CanvasController.routeGeometry.test.ts` — whole-polyline assertions
  on both fixtures: exact automatic route, axis alignment, no duplicate points,
  perimeter endpoints with perpendicular first/last legs, no interior crossing of
  any entity *or* entity label, bounded length and no reversal for the automatic
  route, the authored bend preserved and the interior bend skipped for the
  detour, the diagnosis text and the untouched document, label adjacency and no
  label/shape/label overlap, nearby/stacked/reordered entities, and explicit
  perimeter anchors.
- `web/src/engine/render/waypoints.test.ts`, `routeAvoidance.test.ts` — the
  router-level contract: a legal bend is honoured while its leg doglegs around a
  third-party entity; an interior bend is skipped and reported.
- `e2e/bug13-route-crossings.spec.ts` — both fixtures in the real editor, light
  and dark: sampled route against rendered shape boxes, endpoint containment,
  label gap and overlap, the preserved detour, `data-route-warning` /
  `aria-description` / tooltip, and the code view still carrying both authored
  `waypoint` lines. Screenshots: `bug13-automatic-route-{light,dark}.png`,
  `bug13-authored-detour-{light,dark}.png` (vision-reviewed: no connector or
  label over a shape, the detour reads as authored, both themes legible).
- `e2e/cx02-overlap.spec.ts` gained the interior-bend case (`inside Blocker`),
  because CX-02 owned the "a manual waypoint is authoritative" contract; its
  previous assertion used a bend inside the blocker and would have demanded the
  defect back.
- Gates: `npm run check`, `npm test` (coverage thresholds, `router.ts` 96.8 %),
  `npx playwright test` (192 passed), `go test ./...`,
  `bash scripts/check-docs.sh`.

## Notes

- Group boundaries are still not solid obstacles, and `allow overlap` still opts
  a link out of avoidance — that escape hatch now also suppresses the warning, as
  the user asked for the overlap.
- Straight and curved routes keep their authored waypoints without orthogonal
  detours (unchanged); the diagnosis and the skip rule apply to the orthogonal
  router, which is the default and the only mode that promises avoidance.
- Materialising a channel drag can produce more `waypoint` lines than the user
  authored, because the drawn detour now has more vertices. The document is still
  exactly what the user sees, and `Reset bends` returns to an automatic route.
