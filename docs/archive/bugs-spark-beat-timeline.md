<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: spark and border effects share one beat timeline

Source: `bugs.md`, "Spark and border effects need one beat timeline".
Plan: the four steps in that section. Scenarios:
`e2e/bug15-spark-beat-timeline.spec.ts`.

## What was reported

`FlowAnimator.play` pulsed every actor as soon as a beat began, while `travel`
started its sparks independently and left a one-way token filled at the far
endpoint. The source-pulse → creation → travel → arrival → target-pulse story
was never expressed as one lifecycle. Several WAAPI calls ran without shared
ownership, so cancelling a beat was only inferred from an emptied DOM layer,
and a bidirectional link's repeated arrivals never pulsed the receiving
borders.

## The numeric contract

A pure `beatTimeline` (`web/src/engine/anim/timeline.ts`) places every phase on
one millisecond clock. For spark `s`, pass `p`:

- source border: `start = s · stagger + p · chain`, peak at `start + ring/2`,
  rest at `start + ring`;
- spark: created and starts travelling at the source peak, so the border
  unexpands while the spark moves — creation is **at peak expansion**, not
  after unexpansion;
- arrival: `travel.start + travelMs`; the moving spark disappears and the
  target border expands and returns to rest over one ring duration;
- bidirectional links alternate `BeatLink.from` and `BeatLink.to` as origin and
  destination on every pass. Each arrival pulses the endpoint that received
  it. The settled token appears at the last arrival endpoint;
- final rest plus the settle margin is always inside the beat dwell, including
  short dwells and large spark counts. Events carry a deterministic priority
  at equal timestamps.

Travel direction comes from the resolved endpoint ids compared with the drawn
path endpoints, not from the unordered actor ring or the `flipped` flag alone.
A step may reverse a link without using `flip`.

## Regression evidence — failed before the fix (RED)

- Timeline contract, run before `timeline.ts` existed:
  `npx vitest run web/src/engine/anim/timeline.test.ts --reporter=dot`
  → **1 failed suite**, `Error: Cannot find module './timeline'`.
- Animator ordering and ownership, run against the unmodified `engine.ts`:
  `npx vitest run web/src/engine/anim/beatSequence.test.ts --reporter=dot`
  → **7 failed, 1 passed (8)**. Failures covered creation time, source/target
  role and actor, staggered source pulses, settled-token delay, short-dwell
  bounds, replay/exit ownership and the reduced-motion final endpoint.

## Minimal fix

- `timeline.ts` (new): the pure numeric timeline, clamped spark/speed inputs,
  deterministic event ordering and endpoint types.
- `engine.ts`: link beats now schedule border pulses, one moving spark per
  logical spark (all bidirectional legs in one keyframe stream), a settled
  arrival token and the historical neon trail from that timeline. The animator
  records owned handles in a per-beat session and cancels exactly those on
  replay, step change, stop and exit. Non-travel illustrations keep their
  plain actor rings.
- `app.css`: rings, sparks and trails start invisible so a delayed WAAPI
  animation can reveal them; reduced-motion tokens stay visible.
- `useFlowStage.ts`: a file change stops the stage's animator without touching
  camera work or any other player.
- The settled/reduced token uses a **unitless** SVG `translate`: Chromium
  ignores `px` units in the `transform` attribute, which left the token painted
  off-canvas even though its computed opacity was 1. The e2e now checks the
  bounding box, not just opacity.
- `FILE-FORMAT.md` states the lifecycle; `CHANGELOG.md` records the fix.

## Verification evidence — passed after the fix (GREEN)

- Pure timeline plus animator sequence:
  `npx vitest run web/src/engine/anim --reporter=dot` → **7 files, 71 tests passed**.
- Full unit suite: `npm test` → **135 files, 1520 tests passed**, coverage gates green.
- Static gates: `npm run check` → exit 0 (TypeScript, service worker, ESLint
  complexity and line limits); `bash scripts/check-docs.sh` →
  `OK — 9 docs, all links resolve, .pcd blocks valid`; `go test ./...` → all
  packages ok.
- Focused browser run after `npm run build`:
  `npx playwright test e2e/bug15-spark-beat-timeline.spec.ts --workers=1`
  → **2 passed** (light and dark). Sampled WAAPI output (one line per scenario,
  abbreviated):
  - one, both themes: `live {"count":1,"state":"running","time":0}`;
    `times {"source":225,"travel":1112.5,"firstArrival":2225,"settled":2500}`;
    opacity source/travel/arrival/settled =
    `source 1→0→0→0`, `target 0→0→1→0`, `spark 1→1→0→0`,
    `arrived 0→0→1→1`; spark x `180→250→320` (forward).
  - multiple, both themes: three staggered tokens, `stagger > 0`,
    `times {"source":225,"travel":675,"firstArrival":1350,"settled":1991}`,
    all phases inside the dwell.
  - reverse, both themes: spark x `840→790→740`, confirming travel from the
    resolved `from` endpoint to `to` on a flipped step.
  - bidirectional, both themes: first arrival at x `840` pulses the target with
    no settled token (`arrived 0`); the final arrival at `2225 ms` leaves the
    token at x `480` (`arrived 1`). Two border-pulse pairs share one timeline.
- Full browser suite: `npm run e2e -- --workers=2` → **201 passed**. Legacy
  item-9 and FLOW-02 specs were updated to distinguish the moving spark from
  the settled token; the replay probe still reports
  `REPLAY_WAAPI {"frozen":366.6839999984801,"replayed":{"currentTime":0,"state":"running"}}`.

### Screenshots and vision review

Passing captures (all in `test-results/screenshots/`, light and dark):

- `bug15-one-{source,travel,arrival,settled}-{light,dark}.png`
- `bug15-multiple-{source,travel,arrival,settled}-{light,dark}.png`
- `bug15-reverse-{source,travel,arrival,settled}-{light,dark}.png`
- `bug15-bidirectional-{source,travel,first-arrival,arrival,settled}-{light,dark}.png`
- `bug15-parallel-settled-{light,dark}.png`
- `bug15-reduced-motion-{light,dark}.png`

Reviewed against `docs/STYLE-GUIDE.md` with the Laws of UX skill:

- Source frames show one expanded source border and a spark born at that
  border; travel frames show the neon core mid-route with a restrained trail;
  arrival frames show the target border expanded and no moving spark; settled
  frames show no ring and one token resting at the destination (Peak-End Rule,
  Law of Prägnanz).
- The three-spark frame keeps the tokens distinguishable instead of smearing
  one trail across the route. The reversed step travels right-to-left, and the
  bidirectional frame pulses the far endpoint before returning to the source.
- Parallel lanes produce their own source pulses under one step badge. Reduced
  motion shows only the static emphasis and settled token, with zero layer
  animations.
- Light and dark differ only in theme tokens: accent rings and the neon token
  stay legible on both canvases; chrome alignment, spacing and typography match
  the existing shell. No external asset appears.
- One defect found during review, fixed before the final run: the settled token
  used `translate(xpx, ypx)` in an SVG `transform` attribute, so Chromium kept
  it off-canvas while its computed opacity was 1. The e2e now asserts the
  token's bounding box lies inside the canvas; the final captures show it.
  The camera glide was also allowed to finish before sampling so the filmstrip
  frames the endpoints (the transport's `pauseAll` freezes camera work too).

Outcome: **pass**, no open defects.

Residual risk: the filmstrip seeks WAAPI animations to exact instant values with
the transport parked. That proves the numeric contract and the paint at each
phase, but not how a particular display refreshes between sampled frames; the
same beat runs unmodified in the full e2e suite.
