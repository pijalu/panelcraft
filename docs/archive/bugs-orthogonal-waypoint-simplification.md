<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Queued bug: orthogonal waypoint routes need an explicit simplification contract

Source: `bugs.md`, item “Orthogonal waypoint routes need an explicit
simplification contract”. Plan: `docs/BUGS-RESOLUTION-PLAN-ROUND-2.md` §5.

## Observed behaviour and reproduction

The report measured an explicit `Shop → Payment provider` route with two authored
bends. With the measured rectangles — Shop 57×36 at (248, 128), Payment provider
160×60 at (348, 52), Customer 120×72 at (40, 40) — the authored points were
`(432, 254)` and `(432, 70)`. The router drew

```
(305,146) → (432,146) → (432,254) → (336,254) → (336,82) → (348,82)
```

after the earlier whole-route crossing fix. No segment retraces another and no
segment enters an entity interior, yet the route runs right, left, right: the
whole path doubles back on itself. The second authored bend also sits inside the
payment entity.

The three geometry facts are deliberately separate:

- A **reversal** is a sign change along one axis over the complete polyline,
  ignoring zero-length steps. The measured route has three (two horizontal, one
  vertical).
- A **retrace** is two consecutive segments walking back along the same line.
  The measured route has none.
- A **crossing** is a segment spending positive length strictly inside an entity
  rectangle. The measured route has none.

Before implementation, a focused probe printed that polyline and then
`npx vitest run web/src/engine/render/explicitRoute.test.ts --reporter=verbose`
failed with seven `TypeError: planLink is not a function` errors. The regression
suite therefore failed before the fix existed.

## Review decision

The earlier contract said every bend outside an entity was authoritative. That
wording is now explicitly superseded: an authored out-and-back is simplified, and
the old assertion that the far bend must survive was replaced rather than kept
with a looser threshold.

A lone authored bend remains the user's intentional detour and is skipped only
when it lies inside an entity. Without that boundary, ordinary waypoint editing
on a direct horizontal link would lose its handle as soon as the bend was added:
eight connection-editing scenarios and the waypoint-drag scenario did exactly
that in the first full browser run after the planner landed. Reversal
simplification starts at two authored bends, where there is an out-and-back to
compare against.

## Implementation

`web/src/engine/render/router.ts`

- `planLink(input, mode)` returns one `RoutePlan`: the polyline to draw and a
  structured skip record per authored bend (`index`, exact authored `point`, and
  either `inside-entity` with the entity rectangle or `causes-reversal`). The
  canvas and every polyline consumer use the same result; `routeOrtho` and
  `routeLink` remain thin wrappers.
- `planExplicitRoute` scores whole candidates, not individual legs. Entity
  crossings are a hard constraint; then fewer full-path reversals wins, then
  fewer skipped bends, shorter Manhattan length and authored-index ties that
  keep earlier bends.
- Removal is greedy but bounded: each step drops exactly one bend and tries at
  most one candidate per remaining bend, so a route with `n` authored bends
  scores at most `n²` whole routes. A crossing-neutral length reduction may be
  taken to reach a lower-reversal candidate; the best candidate seen under the
  documented score is returned, not the last one visited.

`web/src/ui/CanvasController.ts`, `web/src/ui/strings.ts`

- The controller plans once, draws `plan.points` and turns `plan.skips` into
  plain-language warnings in authored order. There is no second
  `invalidWaypoints` decision path. The new reversal warning is a catalogue
  entry, like the existing inside-entity and crossing messages.

`docs/FILE-FORMAT.md`, `docs/USER-GUIDE.md`, `docs/SPEC.md`,
`docs/CHANGELOG.md`

- The routing contract now states the scoring rule, the single-bend exception,
  and that the printed PDL and IR keep every authored `waypoint` line. Straight
  and curved routes keep all authored points verbatim.

## Verification

- Focused regression first: `npx vitest run web/src/engine/render/explicitRoute.test.ts`
  initially failed with seven missing-`planLink` errors; after implementation it
  passed 8/8, including the exact reported polyline, an intentional detour, a
  single bend that must survive, multiple removable bends, duplicates, an
  obstacle case, a clean route and a 32-bend deterministic timing case (under
  the 500 ms bound in the test).
- Controller regressions: `npx vitest run web/src/ui/CanvasController.routeGeometry.test.ts`
  passed 7/7. The old detour assertion was replaced with a whole-polyline
  simplification assertion, a surviving intentional detour and both warning
  strings in `data-route-warning`, `aria-description` and the SVG tooltip.
- `npm test` exited 0: **137 files, 1544 tests passed**.
- `npm run check` exited 0 (`tsc --noEmit`, the service-worker TS config and
  `eslint .`).
- `npm run test:perf` exited 0: **2 files, 8 tests passed**.
- `npm run build` then `npx playwright test` exited 0: **205 passed**, including
  the rebuilt route, waypoint editing and connection-handling scenarios.
- Screenshots: `test-results/screenshots/waypoint-simplification-light.png` and
  `test-results/screenshots/waypoint-simplification-dark.png`, captured by
  `e2e/bug13-route-crossings.spec.ts`. Vision review against the style-guide
  checklist: alignment on the panel/control grid, legible body text and code in
  both themes, consistent panel gaps, no layout jump, no external assets, and
  the simplified connector does not cross a shape or detach its label. Both
  themes differ only by token colours. The warning text is exposed through the
  connector's accessible description and native tooltip rather than painted on
  the canvas, matching the existing route-warning pattern; the browser spec
  asserts both. No new visual defect; no follow-up filed.

## Notes

- The authored document is never rewritten by routing. The e2e assertion reads
  both `waypoint` lines back from the code editor after the route has been
  simplified.
- Crossings that no candidate can clear are still reported on the connector;
  they remain a fallback diagnosis, not a reason to drop authored bends.
- Group boundaries are still not solid obstacles, and `allow overlap` still opts
  a link out of avoidance, as before.
