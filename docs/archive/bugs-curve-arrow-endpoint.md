<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: a curved connector's arrowhead pointed away from its target

## Observed

Reported with a screenshot: a `curve` route from Customer down to Shop ended
with the arrowhead pointing **downward** at the target's lower-left corner,
running along the element instead of into it. The expected behaviour is that an
arrowhead always points toward the entity it ends on.

## Reproduction

Deterministic in the router, no browser needed. With the reported layout (source
above-left of the target, both far apart in both axes):

```
from = { x: 20, y: 20, w: 245, h: 145 }    // Customer
to   = { x: 408, y: 305, w: 317, h: 105 }  // Shop

routeLink({ from, to }, 'curved')  →  [ {265, 92.5}, {408, 357.5} ]
routeToPath(...)                    →  M 265 92.5 C 265 211.75 408 238.25 408 357.5
```

The anchors are right: the route leaves the source's right edge and lands on the
target's left edge. The defect is the *tangent*: a cubic's direction at its end
follows `d − c = (408−408, 357.5−238.25)` — straight down. The arrowhead is drawn
along that tangent, so it pointed down the target's left edge.

Two causes, both fixed here:

1. `endpointCurve` chose its bend axes from the raw delta between the two points
   (`|dy| > |dx|` → "vertical connection"), which is wrong when the anchors sit
   on left/right edges: the curve must leave along the source edge normal and
   arrive along the target edge normal.
2. `catmullCurve` used unclamped neighbour handles, so a segment could bulge
   past its own endpoint (the control point sat at x = 410.8 for an endpoint at
   x = 408) — visible as the curve overshooting the target edge.

## Fix

- `web/src/engine/render/router.ts`: a curved route now carries a short stub at
  each end along that edge's normal (`CURVE_STUB` = 18 canvas units), so the
  last chord — and therefore the drawn cubic's end tangent and the arrowhead
  orientation — is perpendicular to the edge it lands on. The first chord does
  the same at the source. Routes shorter than three stubs are left untouched,
  and authored waypoints are neither moved nor printed differently.
- `web/src/engine/render/routePath.ts`: `catmullCurve` clamps each handle to a
  third of its own segment length. Clamping only shortens a handle along its
  existing direction, so the tangent (and the arrow) is unchanged while the
  curve stops overshooting its endpoints.

Straight and orthogonal routes are untouched: their last chord already runs into
the facing edge.

## Regression evidence — failed before the fix (RED)

`npx vitest run web/src/engine/render/router.test.ts`

```
× curved route arrives along the target edge normal, so the arrow points into the entity
  AssertionError: expected 1.60595703125 to be greater than 21.3177490234375
× curved route leaves the source along its edge normal too
  AssertionError: expected 1.60595703125 to be greater than 21.3177490234375
```

The numbers are the sampled tangent at the endpoint: 1.6 units across against
21.3 units down, i.e. the arrow travelling down the edge.

## Verification evidence — passed after the fix (GREEN)

```
npx vitest run web/src/engine/render   → 308 passed
router.test.ts (both cases + overshoot)  → 22 passed
```

The repaired geometry for the reported layout:

```
points  [ {265, 92.5}, {283, 92.5}, {390, 357.5}, {408, 357.5} ]
path    M 265 92.5 C 268 92.5 280.44 87.07 283 92.5
        C 303.83 136.67 369.17 313.33 390 357.5
        C 392.56 362.93 405 357.5 408 357.5
sampled end  (407.33, 357.56) → (408, 357.5)   // horizontal: into the entity
max x       408                                 // no overshoot past the edge
```

The three assertions the test now pins: the route lands on the facing edge, the
last sampled step moves *into* the entity (horizontal dominance), the first
sampled step leaves along the source edge, and the curve never passes the edge
it lands on by more than half a unit.

The existing "curved mode uses the same anchors" test was retargeted rather than
loosened: it now compares the first and last points against the straight route
(the anchors are shared) instead of requiring identical point arrays, which the
endpoint stubs legitimately change, and it still pins that orthogonal routing is
unaffected.

## Residual risk

The stub is a fixed 18 units, so on a connector shorter than ~54 units the stubs
are skipped and the tangent falls back to the old chord behaviour; a route that
short between two entities is mostly hidden behind the arrowhead itself. The
clamped handles slightly reduce curvature on very uneven waypoint polylines —
the direction at each endpoint is preserved, so no arrow changes meaning.
