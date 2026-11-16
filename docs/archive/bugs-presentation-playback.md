<!-- SPDX-License-Identifier: GPL-3.0-only -->
# Closed: flow presentation framing, spark lifetime, neon styling and transport

Source: `bugs.md`, queued item 9. Plan: `docs/BUGS-RESOLUTION-PLAN.md` §5.
Scenarios: `e2e/bug09-transport.spec.ts`, `e2e/flow02-sparks.spec.ts`.

## What was reported

Four failures in presentation mode, all plausible from the same screen:

1. The automatic camera zoomed into a close-up instead of framing the step.
2. The message spark stopped well before the step changed.
3. The spark looked plain and should read as neon.
4. "The buttons do not respond."

They turned out to be four separate defects with separate causes. Only one of
them lived in the button handlers — and not in the handlers the report named.

## Reproduction, cause by cause

### 1. Framing zoomed to a 400 % close-up

`CameraController` fitted the union of the step's participant rectangles with
48 px padding and kept the renderer's general `ZOOM_MAX` of 4. A message between
two neighbouring boxes therefore filled the canvas with those two boxes: the
route, the connector label and every other shape were cropped away. A `focus`
intent with no zoom of its own inherited whatever the user had set on the
editor canvas, so a manually zoomed-in canvas became a zoomed-in presentation.

### 2. The spark vanished after 900 ms of a 2500 ms step

`travel()` gave every one-way token `MOTION.tokenMs` (900 ms) and faded it out in
its last keyframe, while the beat dwelled `MOTION.stepDelayMs` (2500 ms). The
beat then sat empty for 1.6 s and the arrival was never seen. Several sparks
staggered by a fraction of their own duration, so they also arrived at different
times; a paused transport left them running (`Element.animate` was never paused);
and the emptied `.pc-anim-layer` stayed in the SVG after playback.

### 3. The spark was a plain accent dot

`.pc-token` was `fill: var(--pc-accent)` — a 6 px circle — and `.pc-trail` was
the same accent at 55 % opacity, with no glow. Nothing about it read as a
light trail in either theme.

### 4. "Buttons do not respond" — two reproduced causes, no dead handlers

The browser scenarios recorded the hit target, the player status, the animation
state and console errors for every control before anything was changed:

- **Pointer:** every control's centre hit the button itself (never the
  canvas-wide advance layer), and clicks changed the step — pointer input was
  never broken.
- **Keyboard:** the shell's document key handler called `preventDefault()` on
  Space and Enter even while focus was on a dock button, so the focused control
  never activated. The reported behaviour is what a keyboard user sees: pressing
  Enter on *Previous* did nothing.
- **The toggle acted on a stale status.** `FlowRunner.stepTo()` started the
  beat's animation, then published `status: 'paused'` without freezing it. The
  dock therefore offered "play" while the token was already travelling, so the
  first press ran `resume()` (no visible change — it was already running) and the
  *second* press finally paused. A control that needs two presses reads as
  broken. The same shape existed at the alt chooser and the loop checkpoint.

## Contract now

1. **Presentation framing is bounded and independent of the canvas.**
   `PRESENT_ZOOM_MAX = 1.25` caps an automatic fit; the union stays centred, so
   the diagram around the participants is still on screen. The cap is an upper
   bound only (a wide step still zooms out), an authored `focus … zoom` is kept
   because it is a deliberate close-up, and an inherited manual canvas zoom is
   capped. Exit still restores the pre-play viewport.
2. **One beat-lifetime contract for travel.** `travelTiming()` places every spark
   inside the beat: the window is the dwell minus a 500 ms arrival margin, the
   natural `tokenMs` stays the ceiling, stretching never exceeds 2×, and the
   stagger shares what is left, so all sparks have arrived before the step
   changes. A one-way token keeps `fill: 'forwards'` and rests at its endpoint;
   bidirectional sparks still ping-pong until the beat ends.
3. **Nothing moves while the transport says paused.** `pause()`/`resume()` reach
   the WAAPI animations through the player port. A parked step (stepper, progress
   dot, alt chooser, loop checkpoint) now *settles*: `settle()` jumps the running
   animations to their end state, so the arrival stays visible and the status is
   true. The flow pane's per-step play button keeps playing (`playFrom()`), which
   is the difference between "show me this step" and "play from here".
4. **No orphan animation.** `stop()` cancels every live animation and removes the
   emptied `.pc-anim-layer`, so exit, restart and file changes leave nothing
   behind. `waapiPlayer` drops finished animations from its live set.
5. **Keyboard ownership.** Arrows, Page up/down and Escape stay global; Space and
   Enter belong to a focused control, so activating a button with the keyboard
   never advances the flow by accident.
6. **Neon, bounded.** `.pc-token` uses a `--pc-spark-core` token (saturated blue
   on the light canvas, near-white on the dark one) with two halos no wider than
   8 px; `.pc-trail` uses `--pc-spark-trail` at 2 px with a 2 px halo. The core
   clears 3:1 against the canvas and the halo stays weaker than the core, so a
   spark passing a label never washes it out.
7. **Reduced motion is a still mark.** With `prefers-reduced-motion: reduce` the
   beat draws its emphasis and a `.pc-token-static` token already sitting at the
   connector's endpoint — same core and glow, zero animation.

## Verification

```
npm run check                  # tsc (app + SW) + eslint: clean
npm test                       # 120 files, 1371 tests passed (coverage gate)
npm run test:perf              # 8 tests passed, budgets unchanged
npm run build                  # bundle built from the changed sources
npx playwright test e2e/bug09-transport.spec.ts e2e/flow02-sparks.spec.ts
                               # 12 passed
npx playwright test e2e/p2-present.spec.ts e2e/ux08-flow-presentation.spec.ts \
  e2e/p2-illustrations.spec.ts e2e/s3-flows.spec.ts e2e/ux08-flow-authoring.spec.ts
                               # 11 passed
```

Unit coverage added for the new rules: camera cap and canvas-zoom independence
(`web/src/engine/anim/camera.test.ts`), the travel window and stagger
(`web/src/engine/anim/timings.test.ts`), endpoint fill and settle/pause/stop
delegation and layer removal (`web/src/engine/anim/engine.test.ts`,
`sparks.test.ts`), parked-step settling and `playFrom`
(`web/src/ui/flows/useFlowPlayer.test.tsx`), and keyboard ownership
(`web/src/ui/present.test.ts`).

Browser coverage added in `e2e/bug09-transport.spec.ts`: every control by pointer
and by keyboard in playing, paused and branch states; bounded framing with both
participants and the surrounding diagram on screen; the token arriving and
holding; pause freezing mid-flight and resume continuing it; a parked dot jump
showing a finished token; exit leaving no token, trail or layer; and the bounded
neon core/halo in both themes.

## Vision review

Screenshots (`test-results/screenshots/`, regenerated by the specs above) were
reviewed against `docs/STYLE-GUIDE.md`:

- `item9-framing-light.png`, `item9-framing-dark.png` — participants, the route
  with its label and the neighbouring `Bank` shape all visible at the capped
  zoom; nothing cropped, no label collision.
- `item9-token-arrived-light.png`, `item9-token-arrived-dark.png` — the token
  parked at the connector endpoint with a visible core and a halo that does not
  swallow the "browses" label; dock shows the paused state truthfully.
- `item9-neon-token-light.png`, `item9-neon-token-dark.png` — core/halo pair per
  theme; the dark core reads as light, the light core stays a saturated blue.
- `item9-transport-paused.png`, `item9-branch-choices.png` — dock controls and
  branch choices legible, focus rings intact.
- `flow02-reduced-motion-light.png`, `flow02-reduced-motion-dark.png` — static
  emphasis plus the still token, no motion artefacts.

## Residual risk

- The glow is two `drop-shadow()` filters per token; the perf budgets are green
  (N1–N4), but a future beat drawing dozens of sparks at once would multiply
  them. The count is already capped by `sparkCount`.
- `settle()` freezes an infinite ping-pong spark where it stands rather than
  letting it finish a lap; that is deliberate for a parked step but means the
  parked frame of a bidirectional connector is not reproducible pixel-for-pixel.
