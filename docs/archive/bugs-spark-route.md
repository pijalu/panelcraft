# A spark follows the drawn connection route

Closed. Connector sparks travelled in a straight line between the two endpoints.

## Observed

- Spark keyframes were placed only at the connector's two endpoints, so the
  element interpolated along the straight chord between them.
- On a bent or curved connector the spark therefore left the drawn route at
  mid-travel and appeared to cut across the diagram.

## Expected

- Every spark stays on the rendered connector path for the whole travel leg,
  including curved and reversed routes.
- Timing, direction, repeated passes and the arrival state are unchanged apart
  from following the route geometry.

## Cause

`FlowAnimator.sparkGlyph` built four keyframes per pass from
`geometry.pointAt(path, fromDist)` and `pointAt(path, toDist)` only. Linear
interpolation between two points is the chord, never the path.

## What changed

- `web/src/engine/anim/engine.ts` exports the pure `sparkRoute(fromDist, toDist)`
  helper: it returns the distances to visit in travel order, endpoints included,
  sampled every `SAMPLE_STEP` world units and capped at `MAX_SPARK_SAMPLES`, so a
  degenerate leg yields both ends and a very long connector cannot flood the
  keyframe list.
- `sparkGlyph` samples the route between the resolved start and end distances and
  places each sample at the moment the spark reaches it, keeping the existing
  shared beat timeline, source pulse, arrival and rest timings untouched. Forward
  travel emits ascending distances; a flipped step emits them in reverse.

## Evidence

- `web/src/engine/anim/sparks.test.ts` adds a curved fake geometry whose midpoint
  is 100 units off the chord and asserts every emitted position sits on the route,
  that travel runs in path order forward and in reverse, and that the sample count
  is capped (`sparkRoute(0, 100_000)` and a zero-length leg).
- `e2e/bugs-spark-route.spec.ts` presents a step on a deliberately curved connector
  (a far waypoint), freezes the layer, seeks to three points of travel, and
  compares the painted spark centre with the route's own points in screen space;
  it also asserts the route really bends, so the test cannot pass vacuously. The
  spec was seen failing with endpoint-only keyframes before the fix.
- The existing spark filmstrip specs (`e2e/bug15-spark-beat-timeline.spec.ts`,
  `e2e/flow02-sparks.spec.ts`) stay green, including reduced motion.
